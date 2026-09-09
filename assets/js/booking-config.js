/* ============================================================
   ESCENA BMX — Configuración del agendador de taller.
   Editá este archivo para ajustar servicios, precios, duraciones,
   horario del mecánico y la URL del Worker. No requiere tocar
   agendar.html, admin.html ni el Worker para estos cambios.
   ============================================================ */
window.BOOKING_CONFIG = {

  // URL del Cloudflare Worker que procesa disponibilidad y reservas.
  // Placeholder hasta que se despliegue — ver worker/README.md.
  apiBase: "https://escena-booking.TU-SUBDOMINIO.workers.dev",

  // Número de WhatsApp del taller (mismo que usa el resto del sitio).
  whatsapp: "573107630504",

  // Tamaño del "paso" del calendario, en minutos. Los servicios se
  // redondean hacia arriba a un múltiplo de este valor.
  slotStepMin: 15,

  // Horario del mecánico por día de la semana (0 = domingo … 6 = sábado).
  // Un día ausente o null significa "cerrado" ese día.
  hours: {
    0: { open: "10:00", close: "15:00" }, // Domingo
    1: { open: "10:00", close: "19:00" }, // Lunes
    2: { open: "10:00", close: "19:00" },
    3: { open: "10:00", close: "19:00" },
    4: { open: "10:00", close: "19:00" },
    5: { open: "10:00", close: "19:00" },
    6: { open: "10:00", close: "19:00" }  // Sábado
  },

  // Cuántos días hacia adelante puede agendar un cliente.
  maxDaysAhead: 30,

  // Servicios de mantenimiento — precios COP, duración en minutos
  // (cuánto tiempo bloquea al único mecánico). Ajustá libremente.
  services: [
    { id: "mant-todo-terreno",     name: "Mantenimiento completo todo terreno",      price: 80000, durationMin: 120 },
    { id: "mant-bmx",              name: "Mantenimiento completo BMX",               price: 70000, durationMin: 90 },
    { id: "enrradiada",            name: "Enrradiada",                               price: 30000, durationMin: 90 },
    { id: "enrradiada-compra",     name: "Enrradiada x compra de aro o manzana",     price: 20000, durationMin: 60 },
    { id: "centrada-rueda",        name: "Centrada de rueda",                        price: 10000, durationMin: 30 },
    { id: "mant-centro",           name: "Mantenimiento de centro",                  price: 12000, durationMin: 30 },
    { id: "mant-freecoaster",      name: "Mantenimiento de Freecoaster",             price: 25000, durationMin: 45 },
    { id: "mant-drive-cassette",   name: "Mantenimiento de drive de cassette",       price: 15000, durationMin: 30 },
    { id: "mant-cassette-general", name: "Mantenimiento de cassette general",        price: 25000, durationMin: 45 },
    { id: "rodamientos-cassette",  name: "Rodamientos en mantenimiento cassette",    price: 5500,  durationMin: 20 },
    { id: "manzana-delantera",     name: "Mantenimiento de manzana delantera",       price: 12000, durationMin: 30 },
    { id: "mant-frente",           name: "Mantenimiento de frente",                  price: 12000, durationMin: 30 },
    { id: "mant-cadena",           name: "Mantenimiento de cadena",                  price: 2000,  durationMin: 15 },
    { id: "punto-cadena",          name: "Punto de cadena",                          price: 2000,  durationMin: 15 },
    { id: "despinche",             name: "Despinche",                                price: 4000,  durationMin: 20 }
  ]
};
