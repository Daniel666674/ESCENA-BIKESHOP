/* ============================================================
   ESCENA BMX — Booking Worker (Cloudflare Workers)

   This is the ONLY piece of the scheduler that needs a real secret
   (a GitHub token with write access to this repo), so it can't live
   in agendar.html the way the rest of the site's client-side JS does
   — a public visitor's browser can never hold that token. This Worker
   is the sole holder of it, and does exactly two things:

     GET  /availability?date=YYYY-MM-DD&durationMin=NN
          -> { slots: ["10:00", "10:15", ...] }  free start times for
             that date given the total duration the customer selected.

     POST /book
          body: { date, time, serviceIds, customerName, phone, bikeType, notes }
          -> { ok:true, id } or 409 { error:"slot_taken" }

     POST /quote   (pintura — manual quote, no slot)
          body: { customerName, phone, bikeType, description }
          -> { ok:true, id }

   Deploy instructions: see worker/README.md in this folder.

   Keep SERVICES and HOURS below in sync with
   assets/js/booking-config.js (the public, editable copy the
   storefront reads for prices/labels). This Worker recomputes
   duration server-side from serviceIds rather than trusting whatever
   the client sends, so a tampered request can't understate how long
   a job takes and corrupt the mechanic's schedule.
   ============================================================ */

const BOOKINGS_PATH = "assets/js/bookings-data.js";
const BOOKINGS_VAR = "ESCENA_BOOKINGS";

// Mirror of assets/js/booking-config.js — update both together.
const SERVICES = {
  "mant-todo-terreno":     { name: "Mantenimiento completo todo terreno",  price: 80000, durationMin: 120 },
  "mant-bmx":              { name: "Mantenimiento completo BMX",           price: 70000, durationMin: 90 },
  "enrradiada":            { name: "Enrradiada",                           price: 30000, durationMin: 90 },
  "enrradiada-compra":     { name: "Enrradiada x compra de aro o manzana", price: 20000, durationMin: 60 },
  "centrada-rueda":        { name: "Centrada de rueda",                    price: 10000, durationMin: 30 },
  "mant-centro":           { name: "Mantenimiento de centro",              price: 12000, durationMin: 30 },
  "mant-freecoaster":      { name: "Mantenimiento de Freecoaster",         price: 25000, durationMin: 45 },
  "mant-drive-cassette":   { name: "Mantenimiento de drive de cassette",   price: 15000, durationMin: 30 },
  "mant-cassette-general": { name: "Mantenimiento de cassette general",    price: 25000, durationMin: 45 },
  "rodamientos-cassette":  { name: "Rodamientos en mantenimiento cassette",price: 5500,  durationMin: 20 },
  "manzana-delantera":     { name: "Mantenimiento de manzana delantera",   price: 12000, durationMin: 30 },
  "mant-frente":           { name: "Mantenimiento de frente",              price: 12000, durationMin: 30 },
  "mant-cadena":           { name: "Mantenimiento de cadena",              price: 2000,  durationMin: 15 },
  "punto-cadena":          { name: "Punto de cadena",                      price: 2000,  durationMin: 15 },
  "despinche":             { name: "Despinche",                            price: 4000,  durationMin: 20 }
};

const HOURS = {
  0: { open: "10:00", close: "15:00" },
  1: { open: "10:00", close: "19:00" },
  2: { open: "10:00", close: "19:00" },
  3: { open: "10:00", close: "19:00" },
  4: { open: "10:00", close: "19:00" },
  5: { open: "10:00", close: "19:00" },
  6: { open: "10:00", close: "19:00" }
};

const SLOT_STEP_MIN = 15;
const MAX_DAYS_AHEAD = 30;

function corsHeaders(env, request) {
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const origin = request.headers.get("Origin") || "";
  const allowOrigin = allowed.includes(origin) ? origin : (allowed[0] || "*");
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function json(data, status, extraHeaders) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, extraHeaders || {})
  });
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function toHHMM(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}
function isValidDate(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(new Date(str + "T00:00:00").getTime());
}
function isValidTime(str) {
  return /^\d{2}:\d{2}$/.test(str);
}

function ghApi(env, path, opts) {
  opts = opts || {};
  opts.headers = Object.assign({
    "Authorization": "Bearer " + env.GITHUB_TOKEN,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "escena-booking-worker"
  }, opts.headers || {});
  return fetch("https://api.github.com/repos/" + env.GITHUB_OWNER + "/" + env.GITHUB_REPO + path, opts);
}

function b64EncodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin);
}
function b64DecodeUtf8(b64) {
  const bin = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function getBookingsFile(env) {
  const r = await ghApi(env, "/contents/" + BOOKINGS_PATH + "?ref=" + (env.GITHUB_BRANCH || "main"), { cache: "no-store" });
  if (r.status === 404) return { sha: null, bookings: [] };
  if (!r.ok) throw new Error("GET bookings-data.js -> " + r.status);
  const j = await r.json();
  const text = b64DecodeUtf8(j.content);
  const m = text.match(new RegExp("window\\." + BOOKINGS_VAR + "\\s*=\\s*(\\[[\\s\\S]*\\])\\s*;?\\s*$"));
  if (!m) throw new Error("No se pudo leer " + BOOKINGS_VAR);
  return { sha: j.sha, bookings: JSON.parse(m[1]) };
}

async function putBookingsFile(env, bookings, sha, message) {
  const body = {
    message,
    content: b64EncodeUtf8("window." + BOOKINGS_VAR + " = " + JSON.stringify(bookings, null, 1) + ";\n"),
    branch: env.GITHUB_BRANCH || "main"
  };
  if (sha) body.sha = sha;
  return ghApi(env, "/contents/" + BOOKINGS_PATH, { method: "PUT", body: JSON.stringify(body) });
}

function dayHours(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return HOURS[d.getDay()] || null;
}

function occupiedRanges(bookings, dateStr) {
  return bookings
    .filter(b => b.date === dateStr && b.type === "mantenimiento" && b.status !== "cancelled")
    .map(b => {
      const start = toMinutes(b.time);
      return { start, end: start + (b.durationMin || 0) };
    });
}

function overlaps(aStart, aEnd, ranges) {
  return ranges.some(r => aStart < r.end && aEnd > r.start);
}

function computeFreeSlots(dateStr, durationMin, bookings) {
  const hours = dayHours(dateStr);
  if (!hours) return [];
  const openMin = toMinutes(hours.open);
  const closeMin = toMinutes(hours.close);
  const occupied = occupiedRanges(bookings, dateStr);

  const now = new Date();
  const isToday = dateStr === now.toISOString().slice(0, 10);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const slots = [];
  for (let start = openMin; start + durationMin <= closeMin; start += SLOT_STEP_MIN) {
    if (isToday && start <= nowMin) continue;
    if (!overlaps(start, start + durationMin, occupied)) slots.push(toHHMM(start));
  }
  return slots;
}

function servicesFromIds(ids) {
  const list = (ids || []).map(id => SERVICES[id]).filter(Boolean);
  const total = list.reduce((s, x) => s + x.price, 0);
  const durationMin = Math.max(SLOT_STEP_MIN, Math.ceil(list.reduce((s, x) => s + x.durationMin, 0) / SLOT_STEP_MIN) * SLOT_STEP_MIN);
  const names = list.map(x => x.name);
  return { names, total, durationMin, valid: list.length === (ids || []).length && list.length > 0 };
}

function genId(prefix) {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function handleAvailability(url, env) {
  const date = url.searchParams.get("date") || "";
  const serviceIdsRaw = url.searchParams.get("serviceIds") || "";
  const serviceIds = serviceIdsRaw ? serviceIdsRaw.split(",") : [];

  if (!isValidDate(date)) return json({ error: "invalid_date" }, 400);
  const maxDate = new Date(); maxDate.setDate(maxDate.getDate() + MAX_DAYS_AHEAD);
  if (new Date(date + "T00:00:00") > maxDate) return json({ error: "date_too_far" }, 400);

  const { valid, durationMin } = servicesFromIds(serviceIds);
  if (!valid) return json({ error: "invalid_services" }, 400);

  const { bookings } = await getBookingsFile(env);
  const slots = computeFreeSlots(date, durationMin, bookings);
  return json({ date, durationMin, slots });
}

async function handleBook(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: "invalid_body" }, 400);
  const { date, time, serviceIds, customerName, phone, bikeType, notes } = body;

  if (!isValidDate(date) || !isValidTime(time)) return json({ error: "invalid_datetime" }, 400);
  if (!customerName || !phone) return json({ error: "missing_contact" }, 400);
  const { names, total, durationMin, valid } = servicesFromIds(serviceIds);
  if (!valid) return json({ error: "invalid_services" }, 400);

  const hours = dayHours(date);
  if (!hours) return json({ error: "closed_that_day" }, 400);
  const startMin = toMinutes(time);
  if (startMin < toMinutes(hours.open) || startMin + durationMin > toMinutes(hours.close)) {
    return json({ error: "outside_hours" }, 400);
  }

  const booking = {
    id: genId("bk"),
    createdAt: new Date().toISOString(),
    type: "mantenimiento",
    services: names,
    total,
    date, time, durationMin,
    customerName: String(customerName).slice(0, 120),
    phone: String(phone).slice(0, 40),
    bikeType: String(bikeType || "").slice(0, 60),
    notes: String(notes || "").slice(0, 500),
    status: "pending"
  };

  for (let attempt = 0; attempt < 4; attempt++) {
    const { sha, bookings } = await getBookingsFile(env);
    const occupied = occupiedRanges(bookings, date);
    if (overlaps(startMin, startMin + durationMin, occupied)) {
      return json({ error: "slot_taken" }, 409);
    }
    const merged = bookings.concat([booking]);
    const r = await putBookingsFile(env, merged, sha, "Nueva reserva de taller: " + booking.customerName + " (" + date + " " + time + ")");
    if (r.ok) return json({ ok: true, id: booking.id });
    if (r.status === 409) { await new Promise(res => setTimeout(res, 250 * (attempt + 1))); continue; }
    const t = await r.text();
    return json({ error: "github_write_failed", detail: t.slice(0, 200) }, 502);
  }
  return json({ error: "slot_taken" }, 409);
}

async function handleQuote(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: "invalid_body" }, 400);
  const { customerName, phone, bikeType, description } = body;
  if (!customerName || !phone) return json({ error: "missing_contact" }, 400);

  const quote = {
    id: genId("pq"),
    createdAt: new Date().toISOString(),
    type: "pintura",
    customerName: String(customerName).slice(0, 120),
    phone: String(phone).slice(0, 40),
    bikeType: String(bikeType || "").slice(0, 60),
    notes: String(description || "").slice(0, 800),
    status: "quote_pending"
  };

  for (let attempt = 0; attempt < 4; attempt++) {
    const { sha, bookings } = await getBookingsFile(env);
    const merged = bookings.concat([quote]);
    const r = await putBookingsFile(env, merged, sha, "Nueva solicitud de cotización de pintura: " + quote.customerName);
    if (r.ok) return json({ ok: true, id: quote.id });
    if (r.status === 409) { await new Promise(res => setTimeout(res, 250 * (attempt + 1))); continue; }
    const t = await r.text();
    return json({ error: "github_write_failed", detail: t.slice(0, 200) }, 502);
  }
  return json({ error: "write_failed" }, 502);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = corsHeaders(env, request);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

    try {
      let res;
      if (request.method === "GET" && url.pathname === "/availability") {
        res = await handleAvailability(url, env);
      } else if (request.method === "POST" && url.pathname === "/book") {
        res = await handleBook(request, env);
      } else if (request.method === "POST" && url.pathname === "/quote") {
        res = await handleQuote(request, env);
      } else if (request.method === "GET" && url.pathname === "/health") {
        res = json({ ok: true });
      } else {
        res = json({ error: "not_found" }, 404);
      }
      const merged = new Headers(res.headers);
      Object.entries(headers).forEach(([k, v]) => merged.set(k, v));
      return new Response(res.body, { status: res.status, headers: merged });
    } catch (e) {
      return json({ error: "server_error", detail: String(e && e.message || e) }, 500, headers);
    }
  }
};
