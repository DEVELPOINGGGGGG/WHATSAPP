const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore: WWebJSMongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const express = require('express');
const cors = require('cors');
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

// 1. GLOBAL CORS FIX (Allows ALL domains)
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: false
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
let client; 

// STATE VARIABLES FOR THE PROGRESS BAR
let syncStatus = 'waiting'; // waiting, syncing, saved
let syncProgress = 0;

const isHeadless = process.env.HEADLESS !== 'false';
const chromeCandidatePaths = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable'
].filter(Boolean);

const resolvedChromePath = chromeCandidatePaths.find((p) => {
  try { return fs.existsSync(p); } catch (_) { return false; }
});

// 2. EXTREME MEMORY OPTIMIZATION FOR < 500MB RAM
const puppeteerConfig = {
  headless: isHeadless ? 'new' : false,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--disable-gpu', '--disable-extensions', '--disable-background-networking',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-sync', '--mute-audio', '--no-zygote', '--single-process',
    '--renderer-process-limit=1', '--disable-features=site-per-process,IsolateOrigins,Translate,BackForwardCache',
    '--disable-accelerated-2d-canvas', '--no-first-run', '--disable-default-apps',
    '--js-flags=--max-old-space-size=250' // STRICTLY LIMITS V8 HEAP MEMORY TO 250MB
  ]
};
if (resolvedChromePath) puppeteerConfig.executablePath = resolvedChromePath;

// --- DATABASE LOGIC ---
async function getApiKeys() {
  const state = await appState.findOne({ _id: 'main' }, { projection: { apiKeys: 1 } });
  return state?.apiKeys || [];
}

async function setApiKeys(keys) {
  await appState.updateOne({ _id: 'main' }, { $set: { apiKeys: keys.slice(0, 30) } }, { upsert: true });
}

// 3. ADVANCED API KEY CREATION
async function createApiKey(data) {
  const keys = await getApiKeys();
  const newKey = {
      key: crypto.randomBytes(16).toString('hex'),
      name: data.keyName || 'Unnamed Web API',
      purpose: data.keyPurpose || 'General Communication',
      url: data.keyUrl || 'Not Specified',
      accessedBy: data.keyAccess || 'System Default',
      dateCreated: new Date().toLocaleDateString()
  };
  keys.unshift(newKey);
  await setApiKeys(keys);
  return newKey;
}

async function removeApiKey(keyToDelete) {
  const keys = await getApiKeys();
  const nextKeys = keys.filter((k) => k.key !== keyToDelete);
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

// --- BEAUTIFULLY DECORATED UI TEMPLATE ---
const renderUI = (title, content, script = '') => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} | M-Tech Core Server</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800;900&display=swap" rel="stylesheet">
  <style>
    :root { 
        --bg:#05070e; --card:#0f1320ea; --line:#2b334a; 
        --pri:#0ea5e9; --pri-glow: rgba(14, 165, 233, 0.4);
        --sec:#10b981; --sec-glow: rgba(16, 185, 129, 0.4);
        --text:#e8ecf7; --muted:#94a3b8;
    }
    * { box-sizing:border-box; margin:0; padding:0; font-family: 'Outfit', sans-serif; }
    body { min-height:100vh; background:#020617; background-image: radial-gradient(circle at top right, #1e293b 0%, transparent 40%), radial-gradient(circle at bottom left, #0ea5e9 0%, transparent 20%); color:var(--text); padding:40px 20px; }
    
    .top-nav { max-width: 1200px; margin: 0 auto 30px; display: flex; justify-content: space-between; align-items: center; background: var(--card); padding: 15px 30px; border-radius: 20px; border: 1px solid var(--line); backdrop-filter: blur(10px); box-shadow: 0 10px 30px rgba(0,0,0,0.5);}
    .brand { font-size: 1.5rem; font-weight: 900; background: linear-gradient(90deg, var(--pri), var(--sec)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; letter-spacing: 1px;}
    .btn-logout { background: #ef4444; color: white; text-decoration: none; padding: 8px 20px; border-radius: 12px; font-weight: 800; transition: 0.3s; border: 1px solid #f87171;}
    .btn-logout:hover { background: #dc2626; box-shadow: 0 0 15px rgba(239, 68, 68, 0.5); }

    .card { max-width: 1200px; margin: 0 auto; background: var(--card); border:1px solid var(--line); border-radius:24px; box-shadow:0 20px 70px #0008; padding:35px; backdrop-filter: blur(10px); }
    .head { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:25px; border-bottom: 1px solid var(--line); padding-bottom: 20px;}
    .title { font-size:clamp(1.5rem,2.5vw,2.5rem); font-weight:900; }
    .status { border:1px solid var(--line); border-radius:999px; padding:8px 16px; font-weight: 800; font-size:.85rem; letter-spacing: 1px; text-transform: uppercase;}
    .on { color:#10b981; border-color:#059669; background:rgba(16, 185, 129, 0.1); box-shadow: 0 0 15px rgba(16, 185, 129, 0.2);}
    .off { color:#ef4444; border-color:#b91c1c; background:rgba(239, 68, 68, 0.1); }
    
    .grid { display:grid; grid-template-columns: 1fr 1.2fr; gap:25px; }
    @media (max-width:900px) { .grid { grid-template-columns:1fr; } }
    
    .panel { border:1px solid var(--line); border-radius:20px; padding:25px; background:rgba(15, 23, 42, 0.6); position: relative; overflow: hidden; transition: 0.3s;}
    .panel:hover { border-color: #475569; }
    
    h3 { margin-bottom:10px; font-weight: 800; color: #f8fafc; font-size: 1.3rem;}
    p { color:var(--muted); margin-bottom:15px; font-size:1rem; line-height: 1.6;}
    
    input, textarea, select { width:100%; border-radius:12px; border:1px solid var(--line); background:#020617; color:var(--text); padding:14px; margin-bottom:15px; font-family: inherit; font-size: 0.95rem; transition: 0.3s;}
    input:focus, textarea:focus { border-color: var(--pri); outline: none; box-shadow: 0 0 0 3px var(--pri-glow); }
    textarea { min-height:110px; resize:vertical; }
    
    button.btn-primary { background:linear-gradient(135deg, var(--pri), #3b82f6); border:none; color:white; font-weight:800; font-size: 1rem; cursor:pointer; padding: 14px; width: 100%; border-radius: 12px; transition: 0.3s; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 5px 15px var(--pri-glow);}
    button.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 25px var(--pri-glow); }
    button.btn-success { background:linear-gradient(135deg, var(--sec), #059669); border:none; color:white; font-weight:800; padding: 14px; width: 100%; border-radius: 12px; cursor: pointer; transition:0.3s; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 5px 15px var(--sec-glow);}
    button.btn-success:hover { transform: translateY(-2px); box-shadow: 0 8px 25px var(--sec-glow); }

    .ghost { background:rgba(239, 68, 68, 0.1); color:#ef4444; border:1px solid #ef4444; padding: 8px 15px; border-radius: 8px; font-weight: 800; cursor: pointer; transition: 0.2s;}
    .ghost:hover { background: #ef4444; color: white; }
    
    /* --- BEAUTIFUL DATA TABLE --- */
    .table-container { overflow-x: auto; margin-top: 15px; border-radius: 12px; border: 1px solid var(--line); }
    table { width: 100%; border-collapse: collapse; background: #0b0f19; text-align: left; }
    th { background: #1e293b; color: #cbd5e1; padding: 15px; font-weight: 800; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; }
    td { padding: 15px; border-bottom: 1px solid var(--line); font-size: 0.95rem; color: #f1f5f9; }
    tr:last-child td { border-bottom: none; }
    tr:hover { background: #111827; }
    .code-tag { font-family: monospace; background: #020617; color: var(--sec); padding: 5px 10px; border-radius: 6px; border: 1px dashed var(--sec); font-size: 0.85rem;}

    /* --- PROGRESS BAR ANIMATIONS --- */
    .progress-wrapper { background: #0f172a; border: 1px solid var(--line); border-radius: 15px; padding: 20px; margin-top: 20px; display: none; }
    .progress-header { display: flex; justify-content: space-between; margin-bottom: 10px; font-weight: 800; color: #e2e8f0; }
    .progress-track { width: 100%; height: 16px; background: #020617; border-radius: 20px; overflow: hidden; border: 1px solid #1e293b; }
    .progress-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #3b82f6, #0ea5e9, #10b981); border-radius: 20px; transition: width 0.5s ease; background-size: 200% 100%; animation: shimmer 2s infinite linear; }
    @keyframes shimmer { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }
    .status-badge { display: inline-block; padding: 5px 12px; border-radius: 8px; font-size: 0.8rem; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; }
    .badge-syncing { background: rgba(14, 165, 233, 0.2); color: #38bdf8; border: 1px solid #0ea5e9; }
    .badge-saved { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid #10b981; }

    .qr { width:280px; margin:20px auto; background:white; border-radius:16px; padding:15px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); border: 4px solid var(--pri); }
    .qr img { width:100%; display:block; }
  </style>
</head>
<body>
  ${req.session.isAuth ? `<div class="top-nav"><div class="brand">M-TECH CORE SERVER</div><a href="/logout" class="btn-logout">🔒 Sign Out Securely</a></div>` : ''}
  <main class="card">${content}</main>
  <script>${script}</script>
</body>
</html>`;

// --- ROUTES ---

app.get('/', (req, res) => {
  if (req.session.isAuth) return res.redirect('/dashboard');
  res.send(renderUI('System Login', `
    <div style="text-align: center; max-width: 400px; margin: 0 auto;">
        <h1 style="font-size: 2.5rem; font-weight: 900; margin-bottom: 10px; color: white;">Server Access</h1>
        <p style="color: var(--muted); margin-bottom: 30px;">Enter the root admin key to access the WhatsApp Gateway.</p>
        <form action="/login" method="POST">
            <input type="password" name="k" placeholder="Admin password" required style="padding: 16px; font-size: 1.1rem; text-align: center;" />
            <button type="submit" class="btn-primary" style="padding: 16px; font-size: 1.1rem;">Authenticate</button>
        </form>
    </div>`
  ));
});

app.post('/login', (req, res) => {
  if (req.body.k === (process.env.ADMIN_PASSWORD || '7992410411')) {
    req.session.isAuth = true;
    req.session.save(() => res.redirect('/dashboard'));
  } else {
    res.redirect('/');
  }
});

// 4. SIGN OUT ROUTE
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// PROGRESS BAR STATUS API
app.get('/api/status', (req, res) => {
    res.json({ status: syncStatus, progress: syncProgress, linked: isReady });
});

app.get('/dashboard', async (req, res) => {
  if (!req.session.isAuth) return res.redirect('/');

  if (!isReady) {
    return res.send(renderUI('Link Device', `
      <section class="head"><div class="title">Link Gateway</div><div class="status off">Awaiting Scan</div></section>
      <div class="panel" style="text-align: center; max-width: 600px; margin: 0 auto;">
        <h3>Open WhatsApp on your phone</h3>
        <p>Go to Settings > Linked Devices and scan this secure gateway code.</p>
        ${qrCodeImage ? `<div class="qr"><img src="${qrCodeImage}" alt="WhatsApp QR" /></div>` : '<p style="color:var(--sec); font-weight:bold;">Generating secure Node payload…</p>'}
        <div class="progress-wrapper" id="syncBox" style="display: none; text-align: left;">
            <div class="progress-header">
                <span>Cloud Synchronization</span>
                <span id="syncText" class="status-badge badge-syncing">ZIPPING DATA...</span>
            </div>
            <div class="progress-track"><div class="progress-fill" id="syncFill"></div></div>
            <p style="margin-top: 15px; font-size: 0.85rem; color: #cbd5e1;">⚠️ Do not restart the server. Your massive data file is currently being compressed and uploaded to MongoDB. This prevents the server from losing connection.</p>
        </div>
      </div>`, 
      `
        // Real-time polling for the awesome progress bar
        setInterval(async () => {
            try {
                const res = await fetch('/api/status');
                const data = await res.json();
                
                if (data.linked && data.status !== 'waiting') {
                    document.querySelector('.qr').style.display = 'none';
                    document.querySelector('h3').innerText = 'Device Linked Successfully!';
                    document.getElementById('syncBox').style.display = 'block';
                    
                    document.getElementById('syncFill').style.width = data.progress + '%';
                    
                    if(data.status === 'saved') {
                        document.getElementById('syncText').className = 'status-badge badge-saved';
                        document.getElementById('syncText').innerText = '100% COMPLETE - SAFE TO RESTART';
                        setTimeout(() => location.reload(), 2000);
                    }
                } else if (!data.linked && data.status === 'waiting' && !document.getElementById('syncBox').style.display === 'block') {
                    location.reload(); // Reload for new QR if still waiting
                }
            } catch(e){}
        }, 2000);
      `
    ));
  }

  const [apiKeys, storage] = await Promise.all([getApiKeys(), getStorageInfo()]);

  // Build the beautiful Table Rows
  let tableRows = apiKeys.length ? apiKeys.map((k) => `
    <tr>
        <td><strong>${k.name || 'API Key'}</strong><br><span style="font-size:0.8rem; color:#64748b;">${k.dateCreated || ''}</span></td>
        <td><span class="code-tag">${k.key}</span></td>
        <td><span style="color:#38bdf8;">${k.url || 'N/A'}</span></td>
        <td>${k.purpose || 'General'}</td>
        <td><strong style="color:var(--sec);">${k.accessedBy || 'System'}</strong></td>
        <td style="text-align:right;">
            <form method="POST" action="/key/delete" style="margin:0;">
                <input type="hidden" name="k" value="${k.key}" />
                <button class="ghost" type="submit">Revoke</button>
            </form>
        </td>
    </tr>`).join('') : `<tr><td colspan="6" style="text-align:center; color:#64748b; padding: 30px;">No API Keys generated yet. Create one above to get started.</td></tr>`;

  res.send(renderUI('Dashboard', `
    <section class="head"><div class="title">Gateway Dashboard</div><div class="status on">Engine Active & Synced</div></section>
    
    <section class="panel" style="margin-bottom:25px;display:flex;align-items:center;gap:20px; background: linear-gradient(90deg, rgba(15,23,42,1) 0%, rgba(16,185,129,0.05) 100%);">
        ${myProfilePic ? `<img src="${myProfilePic}" alt="profile" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid var(--sec); box-shadow: 0 0 20px var(--sec-glow);" />` : '<div style="width:80px;height:80px;border-radius:50%;background:#1e293b;border:3px solid var(--sec);"></div>'}
        <div>
            <h3 style="margin:0 0 5px 0; font-size: 1.5rem; color: white;">WhatsApp Engine Connected</h3>
            <p style="margin:0; font-weight:600; color:var(--sec);">✅ Session secured in MongoDB. Ready to dispatch cross-origin requests.</p>
        </div>
    </section>

    <section class="grid">
        <div class="panel">
            <h3>⚙️ API Key Generator</h3>
            <p>Create heavily decorated, tracked API keys for your external sites.</p>
            <form action="/key" method="POST">
                <input type="text" name="keyName" placeholder="API Name (e.g., Main Website Form)" required />
                <input type="text" name="keyUrl" placeholder="Where will this be used? (e.g., mtechcalibration.in)" required />
                <input type="text" name="keyAccess" placeholder="Accessed By (e.g., Node.js, Frontend fetch)" required />
                <select name="keyPurpose">
                    <option value="General Communication">General Communication</option>
                    <option value="Lead Notifications">Lead Notifications</option>
                    <option value="System Alerts">System Alerts</option>
                    <option value="Admin Access">Admin Access</option>
                </select>
                <button type="submit" class="btn-primary">Generate Secure API Key</button>
            </form>
        </div>
        
        <div class="panel">
            <h3>🚀 Test API Dispatch</h3>
            <p>Send a live payload directly from the server engine.</p>
            <input id="n" placeholder="Target Number (e.g. +919999999999)" />
            <textarea id="m" placeholder="Your test payload message..."></textarea>
            <input id="k" placeholder="Paste an active API key here" />
            <button id="sendBtn" class="btn-success" onclick="fire()">Execute Payload</button>
        </div>
    </section>

    <section class="panel" style="margin-top:25px; padding: 0;">
        <div style="padding: 25px 25px 15px;">
            <h3>🛡️ Active API Architecture</h3>
            <p style="margin:0;">Manage and revoke live access tokens for your infrastructure.</p>
        </div>
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>API Name</th>
                        <th>Secret Key</th>
                        <th>Origin URL</th>
                        <th>Purpose</th>
                        <th>Accessed By</th>
                        <th style="text-align:right;">Actions</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>
        </div>
    </section>
  `, `
    async function fire() {
      const btn = document.getElementById('sendBtn');
      const originalText = btn.innerText;
      btn.innerText = 'Transmitting...';
      btn.style.opacity = '0.7';
      
      try {
          const r = await fetch('/api/send', { 
              method:'POST', 
              headers:{'Content-Type':'application/json'}, 
              body: JSON.stringify({ k: document.getElementById('k').value.trim(), n: document.getElementById('n').value.trim(), m: document.getElementById('m').value.trim() }) 
          });
          const d = await r.json();
          alert(d.success ? '✅ Payload delivered successfully!' : ('❌ Transmission Failed: ' + (d.error || 'Unknown Error')));
      } catch(e) {
          alert('❌ Network Error');
      }
      
      btn.innerText = originalText;
      btn.style.opacity = '1';
    }
  `));
});

app.post('/key', async (req, res) => {
  if (!req.session.isAuth || !isReady) return res.redirect('/dashboard');
  await createApiKey(req.body);
  res.redirect('/dashboard');
});

app.post('/key/delete', async (req, res) => {
  if (!req.session.isAuth || !isReady) return res.redirect('/dashboard');
  await removeApiKey(req.body.k);
  res.redirect('/dashboard');
});

app.post('/api/send', async (req, res) => {
  const { k, n, m } = req.body;
  if (!isReady) return res.status(503).json({ success: false, error: 'WhatsApp not linked yet' });
  const apiKeys = await getApiKeys();
  const validKeys = apiKeys.map(obj => obj.key);
  
  if (!k || !validKeys.includes(k)) return res.status(403).json({ success: false, error: 'Invalid API key' });
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

async function start() {
  mongoClient = new MongoClient(MONGO_URI, { maxPoolSize: 3, minPoolSize: 0, maxIdleTimeMS: 10000 });
  await mongoClient.connect();
  db = mongoClient.db(DB_NAME);
  appState = db.collection('app_state');

  await mongoose.connect(MONGO_URI, { dbName: DB_NAME });
  const store = new WWebJSMongoStore({ mongoose: mongoose });

  // 5. CACHE DIRECTORY FIX
  client = new Client({
    authStrategy: new RemoteAuth({
      clientId: 'mtech-main',
      store: store,
      dataPath: path.join(__dirname, '.wwebjs_cache'), 
      backupSyncIntervalMs: 300000 
    }),
    puppeteer: puppeteerConfig
  });

  client.on('qr', async (qr) => {
    qrCodeImage = await qrcode.toDataURL(qr);
    syncStatus = 'waiting';
    syncProgress = 0;
  });

  client.on('ready', async () => {
    isReady = true;
    qrCodeImage = null;
    syncStatus = 'syncing';
    syncProgress = 15;
    
    // Simulate zipping progress for the UI
    let fakeProgress = setInterval(() => {
        if(syncProgress < 90) syncProgress += Math.floor(Math.random() * 10);
    }, 5000);

    try {
      if (client.info?.wid?._serialized) myProfilePic = await client.getProfilePicUrl(client.info.wid._serialized);
    } catch (_) { myProfilePic = null; }
    
    // Save progress interval to clear later
    client.progressTimer = fakeProgress;
  });

  client.on('remote_session_saved', () => {
    if(client.progressTimer) clearInterval(client.progressTimer);
    syncStatus = 'saved';
    syncProgress = 100;
    console.log('>> ✅ SUCCESS: Authentication Token Synced with MongoDB!');
  });

  client.on('disconnected', () => {
    isReady = false;
    myProfilePic = null;
    syncStatus = 'waiting';
  });

  client.initialize().catch((err) => console.error('>> ENGINE FAILED:', err.message));

  const PORT = process.env.PORT || 10000; 
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`>> Server is hitting the airwaves on port ${PORT}`);
  });
}

start();
