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
    secret: 'm-tech-v4-super-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// --- ENGINE STATE ---
let rawQR = null;
let isReady = false;
let validApiKey = null;
let failedAttempts = 0;

// --- WHATSAPP CLIENT (ULTRA-LOW RAM CONFIG) ---
const client = new Client({
    authStrategy: new LocalAuth(),
    authTimeoutMs: 120000, 
    puppeteer: { 
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--single-process', // CRITICAL: Only 1 Chrome process
            '--no-zygote',
            '--no-first-run',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-software-rasterizer',
            '--mute-audio'
        ] 
    }
});

client.on('qr', (qr) => {
    rawQR = qr; // Store raw text to avoid heavy image processing on server
    console.log('New Uplink Pattern Generated.');
});

client.on('ready', () => {
    console.log('\n>> ENGINE UPLINK ESTABLISHED <<\n');
    isReady = true;
    rawQR = null;
});

client.on('disconnected', () => { isReady = false; rawQR = null; });
client.initialize();

// --- PREMIUM UI ENGINE ---
const renderCore = (title, content, script = '') => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        * { box-sizing: border-box; font-family: 'Segoe UI', sans-serif; margin: 0; padding: 0; }
        body { 
            background: #06070a; color: #fff; display: flex; justify-content: center; 
            align-items: center; min-height: 100vh; overflow: hidden;
        }
        body::before {
            content: ""; position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: linear-gradient(rgba(0, 255, 136, 0.02) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(0, 255, 136, 0.02) 1px, transparent 1px);
            background-size: 30px 30px; z-index: -1;
            transform: perspective(500px) rotateX(60deg) translateY(-100px);
            animation: gridMove 20s linear infinite;
        }
        @keyframes gridMove { from { background-position: 0 0; } to { background-position: 0 600px; } }
        
        .panel {
            background: rgba(15, 20, 25, 0.8); backdrop-filter: blur(30px);
            border: 1px solid rgba(0, 255, 136, 0.2); border-radius: 24px;
            padding: 40px; width: 95%; max-width: 460px; text-align: center;
            box-shadow: 0 40px 100px rgba(0,0,0,0.8), inset 0 0 20px rgba(0,255,136,0.05);
            animation: emerge 0.8s cubic-bezier(0.2, 1, 0.2, 1);
        }
        @keyframes emerge { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        
        h2 { font-weight: 300; letter-spacing: 5px; text-transform: uppercase; margin-bottom: 30px; }
        h2 span { color: #00ff88; font-weight: 800; text-shadow: 0 0 20px rgba(0,255,136,0.5); }
        
        input, textarea, button { width: 100%; padding: 16px; margin: 10px 0; border-radius: 12px; border: none; outline: none; transition: 0.3s; }
        input, textarea { background: #000; color: #00ff88; border: 1px solid #222; font-family: monospace; }
        input:focus { border-color: #00ff88; box-shadow: 0 0 15px rgba(0,255,136,0.2); }
        
        button { 
            background: linear-gradient(135deg, #00ff88, #00d2ff); color: #000; 
            font-weight: 900; letter-spacing: 2px; cursor: pointer; text-transform: uppercase;
        }
        button:hover { transform: translateY(-3px); box-shadow: 0 15px 30px rgba(0,255,136,0.4); color: #fff; }
        
        .status { padding: 15px; border-radius: 10px; margin-bottom: 20px; font-weight: bold; font-size: 12px; letter-spacing: 2px; }
        .online { background: rgba(0,255,136,0.1); color: #00ff88; border: 1px solid #00ff88; }
        .offline { background: rgba(255,51,102,0.1); color: #ff3366; border: 1px solid #ff3366; }
        
        .qr-box { 
            background: #fff; padding: 15px; border-radius: 15px; margin: 20px auto; 
            width: 280px; height: 280px; display: flex; align-items: center; justify-content: center;
            box-shadow: 0 0 40px rgba(255,255,255,0.1);
        }
        .qr-box img { width: 100%; height: 100%; image-rendering: pixelated; }
        
        #toast-container { position: fixed; top: 20px; right: 20px; z-index: 9999; }
        .toast { 
            background: #000; border-left: 5px solid #00ff88; color: #fff; 
            padding: 20px; margin-bottom: 10px; border-radius: 8px; font-size: 14px;
            animation: slideIn 0.4s forwards; box-shadow: 0 20px 40px rgba(0,0,0,0.5);
        }
        @keyframes slideIn { from { transform: translateX(120%); } to { transform: translateX(0); } }
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

// --- ROUTES ---

// 1. AUTHENTICATION
app.get('/', (req, res) => {
    if (req.session.isLoggedIn) return res.redirect('/dashboard');
    res.send(renderCore('Auth', `
        <h2>Core <span>Access</span></h2>
        <form action="/login" method="POST">
            <input type="password" name="p" placeholder="Enter Access Code" required>
            <button type="submit">Unlock System</button>
        </form>
    `));
});

app.post('/login', (req, res) => {
    if (req.body.p === '7992410411') {
        req.session.isLoggedIn = true;
        res.redirect('/dashboard');
    } else { res.redirect('/'); }
});

// 2. DASHBOARD & QR (Optimized)
app.get('/dashboard', (req, res) => {
    if (!req.session.isLoggedIn) return res.redirect('/');
    let content = `<h2>System <span>Control</span></h2>`;
    let script = ``;

    if (!isReady) {
        content += `<div class="status offline">STATUS: AWAITING UPLINK</div>`;
        if (rawQR) {
            // EXTERNAL QR GENERATION: Saves massive RAM on Render
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=\${encodeURIComponent(rawQR)}`;
            content += `<div class="qr-box"><img src="\${qrUrl}" alt="QR"></div>`;
            content += `<p style="color:#888; font-size:11px;">SCAN TO CONNECT DEVICE</p>`;
            script = `setTimeout(() => location.reload(), 20000);`;
        } else {
            content += `<p style="color:#00ff88; font-family:monospace;">INITIALIZING ENGINE PROTOCOLS...</p>`;
            script = `setTimeout(() => location.reload(), 3000);`;
        }
    } else {
        content += `<div class="status online">STATUS: ENGINE ACTIVE</div>`;
        content += `<form action="/generate-key" method="POST"><button type="submit">Generate API Key</button></form>`;
        if (validApiKey) {
            content += `<div style="background:#000; padding:15px; margin-top:20px; font-family:monospace; color:#00ff88; font-size:12px; word-break:break-all; border:1px solid #333;">\${validApiKey}</div>`;
        }
        content += `<br><a href="/terminal" style="color:#00ff88; text-decoration:none; font-size:12px; letter-spacing:2px;">[ OPEN SECURE TERMINAL ]</a>`;
    }
    res.send(renderCore('Dashboard', content, script));
});

app.post('/generate-key', (req, res) => {
    validApiKey = crypto.randomBytes(32).toString('hex');
    res.redirect('/dashboard');
});

// 3. SECURE REMOTE TERMINAL (Integrated)
app.get('/terminal', (req, res) => {
    res.send(renderCore('Terminal', `
        <h2>Secure <span>Link</span></h2>
        <form id="txForm">
            <input type="password" id="key" placeholder="API Authorization Key" required>
            <input type="number" id="num" placeholder="919876543210" required>
            <textarea id="msg" placeholder="Transmission payload..." required></textarea>
            <button type="submit" id="btn">Transmit</button>
        </form>
    `, `
        document.getElementById('txForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const b = document.getElementById('btn'); b.innerText = 'TRANSMITTING...';
            try {
                const r = await fetch('/api/send', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ k: document.getElementById('key').value, n: document.getElementById('num').value, m: document.getElementById('msg').value })
                });
                const d = await r.json();
                if(d.s) showToast('Transmission Success'); else showToast(d.e, true);
            } catch(e) { showToast('Uplink Failure', true); }
            finally { b.innerText = 'Transmit'; }
        });
    `));
});

// 4. API ENDPOINT
app.post('/api/send', async (req, res) => {
    const { k, n, m } = req.body;
    if (k !== validApiKey) return res.status(403).json({ s: false, e: 'AUTH_FAILED' });
    if (!isReady) return res.status(503).json({ s: false, e: 'ENGINE_OFFLINE' });
    try {
        await client.sendMessage(\`\${n}@c.us\`, m);
        res.json({ s: true });
    } catch (e) { res.status(500).json({ s: false, e: 'TX_FAILED' }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(\`Engine Online: \${PORT}\`));
