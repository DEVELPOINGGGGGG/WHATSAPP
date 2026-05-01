const express = require('express');
const session = require('express-session');
const { Client, LocalAuth } = require('whatsapp-web.js');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs-extra');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// --- SESSION STORAGE ---
app.use(session({
    secret: 'm-tech-v4-ultimate',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// --- ENGINE STATE ---
let rawQR = null;
let isReady = false;
let validApiKey = null;

// --- WHATSAPP CLIENT (ULTRA-LOW RAM) ---
const client = new Client({
    authStrategy: new LocalAuth(),
    authTimeoutMs: 120000, 
    puppeteer: { 
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--single-process', 
            '--no-zygote',
            '--no-first-run',
            '--disable-gpu'
        ] 
    }
});

client.on('qr', (qr) => {
    rawQR = qr; 
    console.log('New QR String Generated.');
});

client.on('ready', () => {
    console.log('\n>> ENGINE ONLINE <<\n');
    isReady = true;
    rawQR = null;
});

client.on('disconnected', () => { isReady = false; rawQR = null; });
client.initialize();

// --- UI ENGINE ---
const renderCore = (title, content, script = '') => {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        * { box-sizing: border-box; font-family: 'Segoe UI', sans-serif; margin: 0; padding: 0; }
        body { background: #06070a; color: #fff; display: flex; justify-content: center; align-items: center; min-height: 100vh; overflow: hidden; }
        .panel {
            background: rgba(15, 20, 25, 0.85); backdrop-filter: blur(30px);
            border: 1px solid rgba(0, 255, 136, 0.2); border-radius: 24px;
            padding: 40px; width: 95%; max-width: 460px; text-align: center;
            box-shadow: 0 40px 100px rgba(0,0,0,0.8);
        }
        h2 { font-weight: 300; letter-spacing: 5px; text-transform: uppercase; margin-bottom: 30px; }
        h2 span { color: #00ff88; font-weight: 800; }
        input, textarea, button { width: 100%; padding: 16px; margin: 10px 0; border-radius: 12px; border: none; outline: none; }
        input, textarea { background: #000; color: #00ff88; border: 1px solid #222; font-family: monospace; }
        button { background: linear-gradient(135deg, #00ff88, #00d2ff); color: #000; font-weight: 900; cursor: pointer; }
        .status { padding: 15px; border-radius: 10px; margin-bottom: 20px; font-weight: bold; font-size: 12px; }
        .online { background: rgba(0,255,136,0.1); color: #00ff88; }
        .offline { background: rgba(255,51,102,0.1); color: #ff3366; }
        .qr-box { background: #fff; padding: 10px; border-radius: 10px; margin: 20px auto; width: 220px; height: 220px; }
        .qr-box img { width: 100%; height: 100%; }
        #toast-container { position: fixed; top: 20px; right: 20px; z-index: 9999; }
        .toast { background: #000; border-left: 5px solid #00ff88; color: #fff; padding: 20px; margin-bottom: 10px; border-radius: 8px; }
    </style>
</head>
<body>
    <div id="toast-container"></div>
    <div class="panel">${content}</div>
    <script>
        function showToast(m, e=false) {
            const c = document.getElementById('toast-container');
            const t = document.createElement('div'); t.className = 'toast';
            if(e) t.style.borderLeftColor = '#ff3366';
            t.innerText = m; c.appendChild(t);
            setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 4000);
        }
        ${script}
    </script>
</body>
</html>`;
};

// --- ROUTES ---

app.get('/', (req, res) => {
    if (req.session.isLoggedIn) return res.redirect('/dashboard');
    res.send(renderCore('Auth', `
        <h2>M-Tech <span>Auth</span></h2>
        <form action="/login" method="POST">
            <input type="password" name="p" placeholder="Enter Access Code" required>
            <button type="submit">Unlock Engine</button>
        </form>
    `));
});

app.post('/login', (req, res) => {
    if (req.body.p === '7992410411') {
        req.session.isLoggedIn = true;
        res.redirect('/dashboard');
    } else { res.redirect('/'); }
});

app.get('/dashboard', (req, res) => {
    if (!req.session.isLoggedIn) return res.redirect('/');
    let content = `<h2>Core <span>Engine</span></h2>`;
    let script = ``;

    if (!isReady) {
        content += `<div class="status offline">STATUS: DISCONNECTED</div>`;
        if (rawQR) {
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(rawQR)}`;
            content += `<div class="qr-box"><img src="${qrUrl}"></div>`;
            script = `setTimeout(() => location.reload(), 20000);`;
        } else {
            content += `<p>Initializing Protocols...</p>`;
            script = `setTimeout(() => location.reload(), 3000);`;
        }
    } else {
        content += `<div class="status online">STATUS: ENGINE ACTIVE</div>`;
        content += `<form action="/generate-key" method="POST"><button type="submit">Generate API Key</button></form>`;
        if (validApiKey) {
            content += `<div style="background:#000; padding:10px; margin-top:20px; font-family:monospace; color:#00ff88; word-break:break-all;">${validApiKey}</div>`;
        }
        content += `<br><a href="/terminal" style="color:#00ff88; text-decoration:none; font-size:12px;">[ OPEN TERMINAL ]</a>`;
    }
    res.send(renderCore('Dashboard', content, script));
});

app.post('/generate-key', (req, res) => {
    validApiKey = crypto.randomBytes(32).toString('hex');
    res.redirect('/dashboard');
});

app.get('/terminal', (req, res) => {
    res.send(renderCore('Terminal', `
        <h2>Secure <span>Link</span></h2>
        <form id="txForm">
            <input type="password" id="key" placeholder="API Key" required>
            <input type="number" id="num" placeholder="919876543210" required>
            <textarea id="msg" placeholder="Message Payload" required></textarea>
            <button type="submit" id="btn">Transmit</button>
        </form>
    `, `
        document.getElementById('txForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const b = document.getElementById('btn'); b.innerText = 'SENDING...';
            try {
                const r = await fetch('/api/send', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ k: document.getElementById('key').value, n: document.getElementById('num').value, m: document.getElementById('msg').value })
                });
                const d = await r.json();
                if(d.s) showToast('Success'); else showToast(d.e, true);
            } catch(e) { showToast('Uplink Error', true); }
            finally { b.innerText = 'Transmit'; }
        });
    `));
});

app.post('/api/send', async (req, res) => {
    const { k, n, m } = req.body;
    if (k !== validApiKey) return res.status(403).json({ s: false, e: 'AUTH_ERR' });
    if (!isReady) return res.status(503).json({ s: false, e: 'OFFLINE' });
    try {
        await client.sendMessage(`${n}@c.us`, m);
        res.json({ s: true });
    } catch (e) { res.status(500).json({ s: false, e: 'TX_ERR' }); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server: ${PORT}`));
