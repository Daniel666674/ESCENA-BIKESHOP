# Booking Worker — despliegue

Este Worker es la única pieza del agendador que necesita un secreto real (un
token de GitHub con permiso de escritura sobre este repo). Por eso vive fuera
de `agendar.html`: el navegador de un visitante nunca puede guardar ese
token de forma segura.

## Requisitos

- Cuenta de Cloudflare (gratis) — el plan free alcanza de sobra (100.000
  requests/día).
- Node.js instalado para correr `wrangler` (el CLI de Cloudflare Workers).

## Pasos

1. **Instalar wrangler** (una vez):
   ```
   npm install -g wrangler
   ```

2. **Iniciar sesión con Cloudflare**:
   ```
   wrangler login
   ```

3. **Crear el token de GitHub** que usará el Worker:
   - GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token.
   - Repository access: solo `Daniel666674/ESCENA-BIKESHOP`.
   - Permissions: **Contents: Read and write** (nada más).
   - Sin fecha de expiración corta — si expira, el agendador deja de guardar reservas.

4. **Desplegar el Worker** (desde esta carpeta `worker/`):
   ```
   cd worker
   wrangler deploy
   ```
   Esto imprime la URL final, algo como
   `https://escena-booking.<tu-subdominio>.workers.dev`.

5. **Guardar el token de GitHub como secreto** (nunca en wrangler.toml):
   ```
   wrangler secret put GITHUB_TOKEN
   ```
   Pega el token cuando lo pida.

6. **Actualizar la URL en el sitio**:
   Abrí `assets/js/booking-config.js` y reemplazá `apiBase` con la URL real
   que imprimió `wrangler deploy` en el paso 4. Commit + push (el deploy a
   Hostinger es automático).

## Verificar que funciona

```
curl "https://escena-booking.<tu-subdominio>.workers.dev/health"
```
Debe responder `{"ok":true}`.

```
curl "https://escena-booking.<tu-subdominio>.workers.dev/availability?date=2026-09-15&serviceIds=mant-cadena"
```
Debe responder una lista de horarios libres ese día.

## Editar servicios/horario más adelante

Los precios y duraciones que ve el cliente viven en
`assets/js/booking-config.js`. Las mismas duraciones están *también*
copiadas dentro de `booking-worker.js` (constantes `SERVICES` y `HOURS`) —
el Worker no confía en la duración que manda el navegador, la recalcula él
mismo para que nadie pueda "acortar" un trabajo largo y desordenar la
agenda del mecánico. Si cambiás un precio o duración, actualizá **los dos
archivos** y volvé a correr `wrangler deploy`.
