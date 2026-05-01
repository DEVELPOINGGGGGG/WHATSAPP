const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const qrcode = require('qrcode');
const crypto = require('crypto');
const path = require('path');
const os = require('os');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: new FileStore({ path: './sessions', retries: 0 }),
  secret: process.env.SESSION_SECRET || 'change-me-in-render',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 86400000 }
}));

let qrCodeImage = null;
let isReady = false;
let validApiKey = null;
let lastQrAt = null;
let restarting = false;

const isHeadless = process.env.HEADLESS !== 'false';
const chromeCandidatePaths = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome'
].filter(Boolean);

const puppeteerConfig = {
  headless: isHeadless ? 'new' : false,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--js-flags=--max-old-space-size=256'
  ]
};
if (chromeCandidatePaths.length) puppeteerConfig.executablePath = chromeCandidatePaths[0];

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: path.join(__dirname, 'm_tech_auth') }),
  takeoverOnConflict: true,
  takeoverTimeoutMs: 10000,
  qrMaxRetries: 0,
  puppeteer: puppeteerConfig
});

client.on('qr', async (qr) => {
  qrCodeImage = await qrcode.toDataURL(qr, { margin: 2, scale: 8 });
  lastQrAt = new Date().toISOString();
  console.log('>> NEW QR GENERATED');
});

client.on('ready', () => {
  isReady = true;
  qrCodeImage = null;
  console.log('>> WHATSAPP LINKED');
});

client.on('disconnected', () => {
  isReady = false;
  validApiKey = null;
});




const startClient = async () => {
  try {
    await client.initialize();
  } catch (err) {
    console.error('>> ENGINE FAILED:', err.message);
  }
};

const resetClientSession = async () => {
  restarting = true;
  try {
    isReady = false;
    qrCodeImage = null;
    validApiKey = null;
    await client.destroy();
  } catch (_e) {}
  try {
    const authPath = path.join(__dirname, 'm_tech_auth');
    require('fs').rmSync(authPath, { recursive: true, force: true });
  } catch (_e) {}
  await startClient();
  restarting = false;
};

startClient();

const renderUI = (title, content, script = '') => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} | WhatsApp API Panel</title>
  <style>
    :root { --bg:#05070e; --card:#0f1320cc; --line:#2b334a; --pri:#25d366; --text:#e8ecf7; --muted:#95a1bc; }
    * { box-sizing:border-box; margin:0; padding:0; font-family: Inter,system-ui,-apple-system,sans-serif; }
    body { min-height:100vh; background:radial-gradient(1200px circle at top right,#1a2744 0%,var(--bg) 45%); color:var(--text); display:grid; place-items:center; padding:20px; }
    .card { width:min(920px,100%); background:var(--card); border:1px solid var(--line); border-radius:24px; box-shadow:0 20px 70px #0008, 0 0 50px #25d36622; padding:24px; position:relative; overflow:hidden; }
    .card::after { content:""; position:absolute; inset:auto -40% -60% -40%; height:300px; background:radial-gradient(circle,#25d36622,transparent 60%); pointer-events:none; }
    .head { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:18px; }
    .title { font-size:clamp(1.2rem,2.5vw,2rem); font-weight:800; }
    .status { border:1px solid var(--line); border-radius:999px; padding:6px 12px; font-size:.78rem; color:var(--muted); }
    .on { color:#9af6c1; border-color:#2f5c42; background:#17332366; }
    .off { color:#ffb5c5; border-color:#5f3040; background:#3b182466; }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
    @media (max-width:800px) { .grid { grid-template-columns:1fr; } }
    .panel { border:1px solid var(--line); border-radius:18px; padding:16px; background:#0e1421aa; }
    h3 { margin-bottom:10px; }
    p { color:var(--muted); margin-bottom:10px; font-size:.95rem; }
    input, textarea, button { width:100%; border-radius:12px; border:1px solid var(--line); background:#0b0f19; color:var(--text); padding:12px; margin-top:10px; }
    textarea { min-height:110px; resize:vertical; }
    button { background:linear-gradient(90deg,var(--pri),#4cff7f); border:0; color:#07200f; font-weight:700; cursor:pointer; }
    .ghost { background:#131a2a; color:var(--text); border:1px solid var(--line); }
    .key { font-family: ui-monospace,SFMono-Regular,Menlo,monospace; word-break:break-all; background:#08110d; border:1px dashed #2d6244; color:#9af6c1; padding:12px; border-radius:12px; margin-top:12px; }
    .qr { width:250px; margin:12px auto 0; background:white; border-radius:12px; padding:10px; }
    .qr img { width:100%; display:block; }
    .small { font-size:.85rem; color:var(--muted); margin-top:10px; }
  </style>
</head>
<body>
  <main class="card">${content}</main>
  <script>${script}</script>
</body>
</html>`;

app.get('/', (req, res) => {
  if (req.session.isAuth) return res.redirect('/dashboard');
  res.send(renderUI('Login', `
    <section class="head"><div class="title">WhatsApp API Panel</div><div class="status">Admin Access</div></section>
    <form action="/login" method="POST">
      <p>Sign in first, then link your WhatsApp device and create an API key.</p>
      <input type="password" name="k" placeholder="Admin password" required />
      <button type="submit">Enter dashboard</button>
    </form>
  `));
});

app.post('/login', (req, res) => {
  if (req.body.k === (process.env.ADMIN_PASSWORD || '7992410411')) {
    req.session.isAuth = true;
    req.session.save(() => res.redirect('/dashboard'));
  } else {
    res.redirect('/');
  }
});

app.get('/dashboard', (req, res) => {
  if (!req.session.isAuth) return res.redirect('/');

  if (!isReady) {
    return res.send(renderUI('Link Device', `
      <section class="head"><div class="title">Link your device</div><div class="status off">${restarting ? 'Restarting session...' : 'Waiting for scan'}</div></section>
      <div class="panel">
        <h3>Step 1: Open WhatsApp on your phone</h3>
        <p>Go to Linked Devices and scan this QR code. If you run locally with <b>HEADLESS=false</b>, a real browser opens <b>web.whatsapp.com</b> too.</p>
        ${qrCodeImage ? `<div class="qr"><img src="${qrCodeImage}" alt="WhatsApp QR" /></div>` : '<p>Generating QR code… If still empty, click Reset Session below.</p>'}
        <form action="/reset-session" method="POST"><button class="ghost" type="submit">Reset WhatsApp Session (Fix QR)</button></form>
        <a href="https://web.whatsapp.com" target="_blank" rel="noreferrer"><button class="ghost" type="button">Open WhatsApp Web</button></a>
        <p class="small">QR last updated: ${lastQrAt || 'waiting...'} | Auto-refresh every 5 seconds.</p>
      </div>
    `, 'setTimeout(() => location.reload(), 5000);'));
  }

  res.send(renderUI('Dashboard', `
    <section class="head"><div class="title">WhatsApp API Dashboard</div><div class="status on">Device linked</div></section>
    <section class="grid">
      <div class="panel">
        <h3>1) Create API key</h3>
        <p>Generate a token to authorize API calls.</p>
        <form action="/key" method="POST"><button type="submit">Generate API key</button></form>
        ${validApiKey ? `<div class="key" id="apiKey">${validApiKey}</div><button class="ghost" onclick="copyKey()">Copy key</button>` : '<p class="small">No key generated yet.</p>'}
      </div>
      <div class="panel">
        <h3>2) Send message</h3>
        <p>Send directly from dashboard UI.</p>
        <input id="n" placeholder="Phone with country code (e.g. 14155550111)" />
        <textarea id="m" placeholder="Your message..."></textarea>
        <button id="sendBtn" onclick="fire()">Send message</button>
      </div>
    </section>
  `, `
    async function fire() {
      const btn = document.getElementById('sendBtn');
      btn.innerText = 'Sending...';
      const r = await fetch('/api/send', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          k: '${validApiKey || ''}',
          n: document.getElementById('n').value.trim(),
          m: document.getElementById('m').value.trim()
        })
      });
      const d = await r.json();
      alert(d.success ? 'Message sent ✅' : (d.error || 'Failed to send'));
      btn.innerText = 'Send message';
    }
    function copyKey() {
      const el = document.getElementById('apiKey');
      if (!el) return;
      navigator.clipboard.writeText(el.innerText).then(() => alert('API key copied'));
    }
  `));
});


app.post('/reset-session', async (req, res) => {
  if (!req.session.isAuth) return res.redirect('/');
  await resetClientSession();
  res.redirect('/dashboard');
});

app.post('/key', (req, res) => {
  if (!req.session.isAuth || !isReady) return res.redirect('/dashboard');
  validApiKey = crypto.randomBytes(24).toString('hex');
  res.redirect('/dashboard');
});

app.post('/api/send', async (req, res) => {
  const { k, n, m } = req.body;
  if (!isReady) return res.status(503).json({ success: false, error: 'WhatsApp not linked yet' });
  if (!validApiKey || k !== validApiKey) return res.status(403).json({ success: false, error: 'Invalid API key' });
  if (!n || !m) return res.status(400).json({ success: false, error: 'Number and message required' });
  try {
    await client.sendMessage(`${String(n).replace(/\D/g, '')}@c.us`, m);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Send failed' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, linked: isReady, hasApiKey: Boolean(validApiKey), headless: isHeadless, node: process.version, platform: os.platform() });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log(`WhatsApp API running on ${PORT}`));
