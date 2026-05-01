const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const qrcode = require('qrcode');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- BUG FIX: Kill the MemoryStore Warning ---
app.use(session({
    store: new FileStore({ path: './sessions', retries: 0 }),
    secret: 'm-tech-ultra-obsidian',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 86400000 }
}));

let qrCodeImage = null;
let isReady = false;
let validApiKey = null;

// --- CHROME ENGINE CONFIG ---
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './m_tech_auth' }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox', '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', '--disable-gpu',
            '--single-process', '--no-zygote'
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null
    }
});

client.on('qr', async (qr) => {
    qrCodeImage = await qrcode.toDataURL(qr);
    console.log('>> NEW QR GENERATED');
});

client.on('ready', () => {
    isReady = true;
    qrCodeImage = null;
    console.log('>> CORE UPLINK STABLE');
});

client.initialize().catch(err => console.error('>> ENGINE CRASH:', err));

// --- PREMIUM DECORATED UI ---
const renderUI = (title, content, script = '') => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${title} | M-TECH CORE</title>
    <style>
        * { box-sizing: border-box; font-family: 'Inter', 'Segoe UI', sans-serif; margin: 0; padding: 0; }
        body { 
            background: #050608; color: #fff; display: flex; justify-content: center; 
            align-items: center; min-height: 100vh; overflow: hidden;
        }
        /* Tech Grid Background */
        body::before {
            content: ""; position: absolute; width: 200%; height: 200%;
            background-image: radial-gradient(#1a1a1a 1px, transparent 1px);
            background-size: 30px 30px; transform: rotate(15deg); z-index: -1; opacity: 0.4;
        }
        .container {
            background: rgba(10, 11, 14, 0.85); backdrop-filter: blur(25px);
            border: 1px solid rgba(0, 255, 136, 0.15); border-radius: 24px;
            padding: 40px; width: 95%; max-width: 450px; text-align: center;
            box-shadow: 0 40px 100px rgba(0, 0, 0, 0.8), 0 0 40px rgba(0, 255, 136, 0.05);
            animation: slideUp 0.7s ease;
        }
        @keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        h2 { font-weight: 800; letter-spacing: -1px; margin-bottom: 30px; font-size: 28px; }
        h2 span { color: #00ff88; text-shadow: 0 0 20px rgba(0, 255, 136, 0.4); }
        .pill { 
            display: inline-block; padding: 6px 16px; border-radius: 100px; 
            font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;
            margin-bottom: 25px; border: 1px solid;
        }
        .on { color: #00ff88; background: rgba(0, 255, 136, 0.1); border-color: #00ff88; }
        .off { color: #ff3366; background: rgba(255, 51, 102, 0.1); border-color: #ff3366; }
        input, textarea, button { width: 100%; padding: 16px; margin: 10px 0; border-radius: 12px; border: none; transition: 0.3s; }
        input, textarea { background: #000; color: #00ff88; border: 1px solid #222; font-family: 'Fira Code', monospace; font-size: 13px; }
        input:focus { border-color: #00ff88; box-shadow: 0 0 15px rgba(0, 255, 136, 0.1); outline: none; }
        button { 
            background: linear-gradient(135deg, #00ff88, #00d2ff); color: #000; 
            font-weight: 900; cursor: pointer; text-transform: uppercase; letter-spacing: 1px;
        }
        button:hover { transform: translateY(-2px); box-shadow: 0 10px 25px rgba(0, 255, 136, 0.3); }
        .qr-wrap { background: #fff; padding: 12px; border-radius: 18px; margin: 20px auto; width: 240px; }
        .qr-wrap img { width: 100%; display: block; }
        .footer { font-size: 11px; color: #555; margin-top: 25px; text-decoration: none; display: block; }
    </style>
</head>
<body>
    <div class="container">${content}</div>
    <script>${script}</script>
</body>
</html>`;

// --- CORE ROUTES ---

app.get('/', (req, res) => {
    if (req.session.isAuth) return res.redirect('/dashboard');
    res.send(renderUI('Login', `
        <h2>M-TECH <span>CORE</span></h2>
        <form action="/login" method="POST">
            <input type="password" name="k" placeholder="MASTER ACCESS CODE" required>
            <button type="submit">AUTHORIZE</button>
        </form>
    `));
});

app.post('/login', (req, res) => {
    if (req.body.k === '7992410411') { 
        req.session.isAuth = true; 
        req.session.save(() => res.redirect('/dashboard')); 
    } else res.redirect('/');
});

app.get('/dashboard', (req, res) => {
    if (!req.session.isAuth) return res.redirect('/');
    
    if (isReady) {
        return res.send(renderUI('Dashboard', `
            <div class="pill on">UPLINK ACTIVE</div>
            <h2>SYSTEM <span>NODE</span></h2>
            <form action="/key" method="POST"><button>GENERATE TOKEN</button></form>
            ${validApiKey ? `<div style="background:#000; padding:15px; border-radius:8px; color:#00ff88; font-size:12px; font-family:monospace; margin:15px 0; word-break:break-all;">${validApiKey}</div>` : ''}
            <div style="margin-top:20px; border-top:1px solid #1a1a1a; padding-top:20px;">
                <input id="target" placeholder="91XXXXXXXXXX">
                <textarea id="payload" placeholder="TRANSMISSION DATA..." rows="3"></textarea>
                <button id="sendBtn" onclick="transmit()">FIRE TRANSMISSION</button>
            </div>
            <a href="/" class="footer">LOGOUT SYSTEM</a>
        `, `
            async function transmit() {
                const btn = document.getElementById('sendBtn');
                btn.innerText = 'FIRING...';
                const r = await fetch('/api/send', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ k: '${validApiKey}', n: document.getElementById('target').value, m: document.getElementById('payload').value })
                });
                const d = await r.json();
                alert(d.success ? 'TRANSMISSION SUCCESS' : 'LINK REJECTED');
                btn.innerText = 'FIRE TRANSMISSION';
            }
        `));
    }

    res.send(renderUI('Connecting', `
        <div class="pill off">SYNCING CORE</div>
        <h2>SYNC <span>PORTAL</span></h2>
        ${qrCodeImage ? `<div class="qr-wrap"><img src="${qrCodeImage}"></div>` : '<p style="color:#00ff88;">WAKING CHROME ENGINE...</p>'}
    `, `setTimeout(() => location.reload(), 5000);`));
});

app.post('/key', (req, res) => {
    validApiKey = crypto.randomBytes(18).toString('hex');
    res.redirect('/dashboard');
});

app.post('/api/send', async (req, res) => {
    const { k, n, m } = req.body;
    if (k !== validApiKey || !isReady) return res.status(403).json({ success: false });
    try {
        await client.sendMessage(`${n}@c.us`, m);
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log('M-TECH UPLINK ON PORT ' + PORT));
