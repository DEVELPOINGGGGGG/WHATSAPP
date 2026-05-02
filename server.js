const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const qrcode = require('qrcode');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

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
let apiKeys = [];
let myProfilePic = null;

const isHeadless = process.env.HEADLESS !== 'false';
const chromeCandidatePaths = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable'
].filter(Boolean);

const resolvedChromePath = chromeCandidatePaths.find((p) => {
  try {
    return fs.existsSync(p);
  } catch (_) {
    return false;
  }
});

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
if (resolvedChromePath) puppeteerConfig.executablePath = resolvedChromePath;

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: path.join(__dirname, 'm_tech_auth') }),
  puppeteer: puppeteerConfig
});

client.on('qr', async (qr) => {
  qrCodeImage = await qrcode.toDataURL(qr);
  console.log('>> NEW QR GENERATED');
});

client.on('ready', async () => {
  isReady = true;
  qrCodeImage = null;
  try {
    if (client.info?.wid?._serialized) {
      myProfilePic = await client.getProfilePicUrl(client.info.wid._serialized);
    }
  } catch (_) {
    myProfilePic = null;
  }
  console.log('>> WHATSAPP LINKED');
});

client.on('disconnected', () => {
  isReady = false;
  apiKeys = [];
  myProfilePic = null;
});

console.log('>> CHROME PATH:', puppeteerConfig.executablePath || 'auto');
client.initialize().catch((err) => console.error('>> ENGINE FAILED:', err.message));

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
    .card { width:min(840px,100%); background:var(--card); border:1px solid var(--line); border-radius:24px; box-shadow:0 20px 70px #0008; padding:24px; }
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
    if (isReady) {
      client.sendMessage('7992410411@c.us', 'Your password is incorrect your password is 7992410411 now').catch(() => {});
    }
    res.redirect('/');
  }
});

app.get('/dashboard', (req, res) => {
  if (!req.session.isAuth) return res.redirect('/');

  if (!isReady) {
    return res.send(renderUI('Link Device', `
      <section class="head"><div class="title">Link your device</div><div class="status off">Waiting for scan</div></section>
      <div class="panel">
        <h3>Step 1: Open WhatsApp on your phone</h3>
        <p>Go to Linked Devices and scan this QR code.</p>
        ${qrCodeImage ? `<div class="qr"><img src="${qrCodeImage}" alt="WhatsApp QR" /></div>` : '<p>Generating QR code…</p>'}
        <p class="small">This page auto-refreshes every 5 seconds.</p>
      </div>
    `, 'setTimeout(() => location.reload(), 5000);'));
  }

  res.send(renderUI('Dashboard', `
    <section class="head"><div class="title">WhatsApp API Dashboard</div><div class="status on">Device linked</div></section>
    <section class="panel" style="margin-bottom:16px;display:flex;align-items:center;gap:14px;">
      ${myProfilePic ? `<img src="${myProfilePic}" alt="profile" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:2px solid #2f5c42;" />` : ''}
      <div><h3 style="margin:0 0 6px 0">Connected WhatsApp</h3><p style="margin:0">Session linked and ready to send messages.</p></div>
    </section>
    <section class="grid">
      <div class="panel">
        <h3>Create API key</h3>
        <p>Generate secure 32-digit keys for external apps.</p>
        <form action="/key" method="POST"><button type="submit">Create API key</button></form>
        <div class="small" style="margin-top:10px">Total keys: ${apiKeys.length}</div>
      </div>
      <div class="panel">
        <h3>Send Message</h3>
        <p>Number must include country code. +91 input is accepted as entered.</p>
        <input id="n" placeholder="e.g. +919999999999" />
        <textarea id="m" placeholder="Your message..."></textarea>
        <input id="k" placeholder="API key" />
        <button id="sendBtn" onclick="fire()">Send message</button>
      </div>
    </section>
    <section class="panel" style="margin-top:16px">
      <h3>All API Keys</h3>
      ${apiKeys.length ? apiKeys.map(k => `<div class="key" style="display:flex;justify-content:space-between;gap:10px;align-items:center"><span>${k}</span><form method="POST" action="/key/delete"><input type="hidden" name="k" value="${k}" /><button class="ghost" type="submit" style="margin:0;width:auto;padding:8px 12px">Delete</button></form></div>`).join('') : '<p class="small">No API keys yet.</p>'}
    </section>
  `, `
    async function fire() {
      const btn = document.getElementById('sendBtn');
      btn.innerText = 'Sending...';
      const r = await fetch('/api/send', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          k: document.getElementById('k').value.trim(),
          n: document.getElementById('n').value.trim(),
          m: document.getElementById('m').value.trim()
        })
      });
      const d = await r.json();
      alert(d.success ? 'Message sent ✅' : (d.error || 'Failed to send'));
      btn.innerText = 'Send message';
    }
  `));
});

app.post('/key', (req, res) => {
  if (!req.session.isAuth || !isReady) return res.redirect('/dashboard');
  apiKeys.unshift(crypto.randomBytes(16).toString('hex'));
  apiKeys = [...new Set(apiKeys)].slice(0, 20);
  res.redirect('/dashboard');
});


app.post('/key/delete', (req, res) => {
  if (!req.session.isAuth || !isReady) return res.redirect('/dashboard');
  apiKeys = apiKeys.filter((key) => key !== req.body.k);
  res.redirect('/dashboard');
});

app.post('/api/send', async (req, res) => {
  const { k, n, m } = req.body;
  if (!isReady) return res.status(503).json({ success: false, error: 'WhatsApp not linked yet' });
  if (!k || !apiKeys.includes(k)) return res.status(403).json({ success: false, error: 'Invalid API key' });
  if (!n || !m) return res.status(400).json({ success: false, error: 'Number and message required' });
  try {
    const number = String(n).trim();
    const clean = number.startsWith('+') ? `+${number.slice(1).replace(/\D/g, '')}` : number.replace(/\D/g, '');
    const waId = `${clean.replace(/^\+/, '')}@c.us`;
    await client.sendMessage(waId, m);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Send failed' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, linked: isReady, apiKeys: apiKeys.length });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log(`WhatsApp API running on ${PORT}`));
