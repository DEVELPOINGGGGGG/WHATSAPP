# WhatsApp API Panel

A simple WhatsApp dashboard where you:
1. Login as admin
2. Link device with QR code
3. Generate API key
4. Send messages from GUI or API

## Run locally

```bash
npm install
node server.js
```

Open `http://localhost:8080`.

Default admin password: `7992410411` (override with `ADMIN_PASSWORD`).

## Render deployment

1. Push this repo to GitHub.
2. In Render, create a new **Web Service**.
3. Environment: **Node**
4. Build command:
   ```bash
   npm install
   ```
5. Start command:
   ```bash
   node server.js
   ```
6. Add env vars:
   - `ADMIN_PASSWORD` = your secure password
   - `SESSION_SECRET` = long random string
   - `PUPPETEER_EXECUTABLE_PATH` = `/usr/bin/chromium-browser`
   - `HEADLESS` = `true` on Render


## QR / Browser mode

- Default: `HEADLESS=true` (best for Render).
- Local desktop mode: set `HEADLESS=false` to open a visible Chromium window on `web.whatsapp.com` while still showing QR in your panel.
- If QR gets stuck, use **Reset WhatsApp Session (Fix QR)** in dashboard to force a fresh QR.

## Memory optimization (<512MB target)

This app is configured with low-memory Chromium flags and JS heap cap to stay lightweight in small containers.

## API

### Health
`GET /api/health`

### Send message
`POST /api/send`

Body:
```json
{
  "k": "<api-key>",
  "n": "14155550111",
  "m": "Hello from API"
}
```
