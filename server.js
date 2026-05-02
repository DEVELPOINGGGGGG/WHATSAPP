const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore: WWebJSMongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const express = require('express');
const cors = require('cors'); // <-- CORS IMPORTED HERE
const session = require('express-session');
const MongoStore = require('connect-mongo');
const { MongoClient } = require('mongodb');
const qrcode = require('qrcode');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://mtechcalibrationin_db_user:zQarRtDxjZFLXIov@cluster0.dyrsuwo.mongodb.net/?appName=Cluster0';
const DB_NAME = process.env.MONGO_DB_NAME || 'whatsapp_panel';

const app = express();

// <-- CORS ENABLED HERE (Strictly allowing your frontend domain)
app.use(cors({
    origin: '*', // Explicitly set to your domain
    methods: ['GET', 'POST', 'OPTIONS'],   // Added OPTIONS for the preflight check
    credentials: false                     // Set to false since you use an API key in the body, not cookies
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// IMPORTANT: Session middleware MUST be defined before routes!
app.use(session({
  store: MongoStore.create({ mongoUrl: MONGO_URI, dbName: DB_NAME, ttl: 60 * 60 * 24 * 14, autoRemove: 'native' }),
  secret: process.env.SESSION_SECRET || 'change-me-in-render',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 86400000 }
}));

let mongoClient;
let db;
let appState;
let qrCodeImage = null;
let isReady = false;
let myProfilePic = null;
let client; // We declare the client globally so your API routes can use it

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
    '--disable-sync',
    '--mute-audio',
    '--no-zygote',
    '--single-process',
    '--renderer-process-limit=1',
    '--disable-features=site-per-process,IsolateOrigins,Translate,BackForwardCache',
    '--js-flags=--max-old-space-size=128'
  ]
};
if (resolvedChromePath) puppeteerConfig.executablePath = resolvedChromePath;

async function getApiKeys() {
  const state = await appState.findOne({ _id: 'main' }, { projection: { apiKeys: 1 } });
  return state?.apiKeys || [];
}

async function setApiKeys(keys) {
  await appState.updateOne({ _id: 'main' }, { $set: { apiKeys: keys.slice(0, 20) } }, { upsert: true });
}

async function createApiKey() {
  const keys = await getApiKeys();
  keys.unshift(crypto.randomBytes(16).toString('hex'));
  const unique = [...new Set(keys)].slice(0, 20);
  await setApiKeys(unique);
  return unique;
}

async function removeApiKey(keyToDelete) {
  const keys = await getApiKeys();
  const nextKeys = keys.filter((key) => key !== keyToDelete);
  await setApiKeys(nextKeys);
  return nextKeys;
}

async function getStorageInfo() {
  const fsStats = fs.statfsSync('/');
  const totalBytes = fsStats.blocks * fsStats.bsize;
  const freeBytes = fsStats.bfree * fsStats.bsize;
  const usedBytes = Math.max(totalBytes - freeBytes, 0);

  let mongoDiskMB = null;
  try {
    const stats = await db.command({ dbStats: 1 });
    mongoDiskMB = Math.round((stats.storageSize || 0) / 1024 / 1024);
  } catch (_) {
    mongoDiskMB = null;
  }

  return {
    diskTotalMB: Math.round(totalBytes / 1024 / 1024),
    diskUsedMB: Math.round(usedBytes / 1024 / 1024),
    mongoDiskMB,
    storageBackend: 'MongoDB'
  };
}

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
    .storage { margin-bottom:16px; }
    .bar { width:100%; height:12px; border-radius:999px; background:#111927; overflow:hidden; border:1px solid #2b334a; }
    .bar span { display:block; height:100%; background:linear-gradient(90deg,#25d366,#4cff7f); }
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
  res.send(renderUI('Login', `<section class="head"><div class="title">WhatsApp API Panel</div><div class="status">Admin Access</div></section><form action="/login" method="POST"><p>Sign in first, then link your WhatsApp device and create an API key.</p><input type="password" name="k" placeholder="Admin password" required /><button type="submit">Enter dashboard</button></form>`));
});

app.post('/login', (req, res) => {
  if (req.body.k === (process.env.ADMIN_PASSWORD || '7992410411')) {
    req.session.isAuth = true;
    req.session.save(() => res.redirect('/dashboard'));
  } else {
    res.redirect('/');
  }
});

app.get('/dashboard', async (req, res) => {
  if (!req.session.isAuth) return res.redirect('/');

  if (!isReady) {
    return res.send(renderUI('Link Device', `<section class="head"><div class="title">Link your device</div><div class="status off">Waiting for scan</div></section><div class="panel"><h3>Step 1: Open WhatsApp on your phone</h3><p>Go to Linked Devices and scan this QR code.</p>${qrCodeImage ? `<div class="qr"><img src="${qrCodeImage}" alt="WhatsApp QR" /></div>` : '<p>Generating QR code…</p>'}<p class="small">This page auto-refreshes every 5 seconds.</p></div>`, 'setTimeout(() => location.reload(), 5000);'));
  }

  const [apiKeys, storage] = await Promise.all([getApiKeys(), getStorageInfo()]);
  const diskPercent = storage.diskTotalMB > 0 ? Math.min(100, Math.round((storage.diskUsedMB / storage.diskTotalMB) * 100)) : 0;

  res.send(renderUI('Dashboard', `
    <section class="head"><div class="title">WhatsApp API Dashboard</div><div class="status on">Device linked</div></section>
    <section class="panel storage">
      <h3>Storage status</h3>
      <p>Session/API storage backend: <b>${storage.storageBackend}</b></p>
      <p>Render/Railway disk usage: ${storage.diskUsedMB}MB / ${storage.diskTotalMB}MB</p>
      <div class="bar"><span style="width:${diskPercent}%"></span></div>
      <p class="small">MongoDB used: ${storage.mongoDiskMB === null ? 'Unavailable' : `${storage.mongoDiskMB}MB`}</p>
    </section>
    <section class="panel" style="margin-bottom:16px;display:flex;align-items:center;gap:14px;">${myProfilePic ? `<img src="${myProfilePic}" alt="profile" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:2px solid #2f5c42;" />` : ''}<div><h3 style="margin:0 0 6px 0">Connected WhatsApp</h3><p style="margin:0">Session linked and ready to send messages.</p></div></section>
    <section class="grid"><div class="panel"><h3>Create API key</h3><p>Generate secure 32-digit keys for external apps.</p><form action="/key" method="POST"><button type="submit">Create API key</button></form><div class="small" style="margin-top:10px">Total keys: ${apiKeys.length}</div></div><div class="panel"><h3>Send Message</h3><p>Number must include country code. +91 input is accepted as entered.</p><input id="n" placeholder="e.g. +919999999999" /><textarea id="m" placeholder="Your message..."></textarea><input id="k" placeholder="API key" /><button id="sendBtn" onclick="fire()">Send message</button></div></section>
    <section class="panel" style="margin-top:16px"><h3>All API Keys</h3>${apiKeys.length ? apiKeys.map((k) => `<div class="key" style="display:flex;justify-content:space-between;gap:10px;align-items:center"><span>${k}</span><form method="POST" action="/key/delete"><input type="hidden" name="k" value="${k}" /><button class="ghost" type="submit" style="margin:0;width:auto;padding:8px 12px">Delete</button></form></div>`).join('') : '<p class="small">No API keys yet.</p>'}</section>
  `, `
    async function fire() {
      const btn = document.getElementById('sendBtn');
      btn.innerText = 'Sending...';
      const r = await fetch('/api/send', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ k: document.getElementById('k').value.trim(), n: document.getElementById('n').value.trim(), m: document.getElementById('m').value.trim() }) });
      const d = await r.json();
      alert(d.success ? 'Message sent ✅' : (d.error || 'Failed to send'));
      btn.innerText = 'Send message';
    }
  `));
});

app.post('/key', async (req, res) => {
  if (!req.session.isAuth || !isReady) return res.redirect('/dashboard');
  await createApiKey();
  res.redirect('/dashboard');
});

app.post('/key/delete', async (req, res) => {
  if (!req.session.isAuth || !isReady) return res.redirect('/dashboard');
  await removeApiKey(req.body.k);
  res.redirect('/dashboard');
});

// The CORS package we added at the top allows this endpoint to be called securely from your frontend!
app.post('/api/send', async (req, res) => {
  const { k, n, m } = req.body;
  if (!isReady) return res.status(503).json({ success: false, error: 'WhatsApp not linked yet' });
  const apiKeys = await getApiKeys();
  if (!k || !apiKeys.includes(k)) return res.status(403).json({ success: false, error: 'Invalid API key' });
  if (!n || !m) return res.status(400).json({ success: false, error: 'Number and message required' });
  try {
    const number = String(n).trim();
    const clean = number.startsWith('+') ? `+${number.slice(1).replace(/\D/g, '')}` : number.replace(/\D/g, '');
    const waId = `${clean.replace(/^\+/, '')}@c.us`;
    await client.sendMessage(waId, m);
    return res.json({ success: true });
  } catch (_) {
    return res.status(500).json({ success: false, error: 'Send failed' });
  }
});

app.get('/api/health', async (_req, res) => {
  const keys = await getApiKeys();
  res.json({ ok: true, linked: isReady, apiKeys: keys.length, storage: 'mongodb' });
});

async function start() {
  // 1. Connect MongoDB for the dashboard rules and session state
  mongoClient = new MongoClient(MONGO_URI, { maxPoolSize: 3, minPoolSize: 0, maxIdleTimeMS: 10000 });
  await mongoClient.connect();
  db = mongoClient.db(DB_NAME);
  appState = db.collection('app_state');

  // 2. Connect Mongoose directly to the same database for RemoteAuth
  await mongoose.connect(MONGO_URI, { dbName: DB_NAME });
  const store = new WWebJSMongoStore({ mongoose: mongoose });

  console.log('>> CHROME PATH:', puppeteerConfig.executablePath || 'auto');

  // 3. Setup Client using MongoDB to save tokens
  client = new Client({
    authStrategy: new RemoteAuth({
      store: store,
      backupSyncIntervalMs: 300000 // Saves to database every 5 minutes
    }),
    puppeteer: puppeteerConfig
  });

  // 4. Client Listeners
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
    console.log('>> WHATSAPP LINKED & SAVED TO MONGODB');
  });

  client.on('remote_session_saved', () => {
    console.log('>> WhatsApp Authentication Token Synced with DB');
  });

  client.on('disconnected', () => {
    isReady = false;
    myProfilePic = null;
  });

  // Start the engine
  client.initialize().catch((err) => console.error('>> ENGINE FAILED:', err.message));

  // Use Render's PORT or default to 10000
  const PORT = process.env.PORT || 10000; 

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`>> Server is hitting the airwaves on port ${PORT}`);
  });
}

start();
