# WhatsApp API Panel

A simple WhatsApp dashboard where you:
1. Login as admin
2. Link device with QR code
3. Generate API key
4. Send messages from GUI or API

## Run locally

```bash
npm install
npm run start:lowmem
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


## Low-memory deployment (Render / Railway)

Use MongoDB so sessions/API keys survive restarts.


If your instance crashes around the 512MB limit, use these env vars:

- `MONGO_URI=<your mongodb connection string>`
- `MONGO_DB_NAME=whatsapp_panel`
- `HEADLESS=true`
- `NODE_OPTIONS=--max-old-space-size=192`
- `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser` (or `/usr/bin/chromium`)

This project now launches Chromium with reduced-process flags to keep total memory usage lower.

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
