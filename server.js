const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const qrcode = require('qrcode');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- BUG FIX: Kill the MemoryStore Warning ---
app.use(session({
    store: new FileStore({ path: './sessions', retries: 0 }),
    secret: 'm-tech-v6-obsidian',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 86400000 }
}));

let qrCodeImage = null;
let isReady = false;
let validApiKey = null;

// --- DYNAMIC CHROME ENGINE (RAILWAY FIX) ---
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: path.join(__dirname, 'm_tech_auth') }),
    puppeteer: {
        headless: true,
        // Checks multiple paths so it never fails to launch
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium' || '/usr/bin/chromium-browser',
        args: [
            '--no-sandbox', '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', '--disable-gpu',
            '--no-zygote', '--single-process'
        ]
    }
});

client.on('qr', async (qr) => {
    qrCodeImage = await qrcode.toDataURL(qr);
    console.log('>> NEW QR GENERATED');
});

client.on('ready', () => {
    isReady = true;
    qrCodeImage = null;
    console.log('>> M-TECH ENGINE ONLINE');
});

client.initialize().catch(err => console.error('>> ENGINE FAILED:', err.message));

// --- DECORATED UI (OBSIDIAN THEME) ---
const renderUI = (title, content, script = '') => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${title} | M-TECH</title>
    <style>
        * { box-sizing: border-box; font-family: 'Inter', sans-serif; margin: 0; padding: 0; }
        body { background: #050505; color: #fff; display: flex; justify-content: center; align-items: center; min-height: 100vh; overflow: hidden; }
        body::before {
            content: ""; position: absolute; width: 100%; height: 100%;
            background: radial-gradient(circle at 50% 50%, #00ff8811 0%, transparent 80%);
            z-index: -1;
        }
        .container {
            background: rgba(15, 15, 15, 0.9); backdrop-filter: blur(20px);
            border: 1px solid rgba(0, 255, 136, 0.2); border-radius: 28px;
            padding: 45px; width: 95%; max-width: 460px; text-align: center;
            box-shadow: 0 50px 100px rgba(0,0,0,0.9), 0 0 30px rgba(0, 255, 136, 0.1);
        }
        h2 { font-weight: 900; letter-spacing: -1.5px; font-size: 32px; margin-bottom: 25px; }
        h2 span { color: #00ff88; text-shadow: 0 0 15px #00ff8866; }
        .pill { 
            display: inline-block; padding: 8px 18px; border-radius: 50px; font-size: 10px; 
            font-weight: 800; text-transform: uppercase; margin-bottom: 20px; border: 1px solid;
        }
        .on { color: #00ff88; background: #00ff8811; border-color: #00ff88; }
        .off { color: #ff3366; background: #ff336611; border-color: #ff3366; }
        input, textarea, button { width: 100%; padding: 16px; margin: 10px 0; border-radius: 14px; border: none; transition: 0.2s; }
        input, textarea { background: #000; color: #00ff88; border: 1px solid #222; font-family: monospace; }
        input:focus { border-color: #00ff88; outline: none; }
        button { background: #00ff88; color: #000; font-weight: 900; cursor: pointer; text-transform: uppercase; }
        button:hover { transform: translateY(-2px); box-shadow: 0 10px 20px #00ff8833; }
        .qr-wrap { background: #fff; padding: 15px; border-radius: 20px; margin: 20px auto; width: 250px; box-shadow: 0 0 30px #00ff8822; }
        .qr-wrap img { width: 100%; display: block; }
    </style>
</head>
<body>
    <div class="container">${content}</div>
    <script>${script}</script>
</body>
</html>`;

// --- ROUTES ---

app.get('/', (req, res) => {
    if (req.session.isAuth) return res.redirect('/dashboard');
    res.send(renderUI('Login', `
        <h2>M-TECH <span>CORE</span></h2>
        <form action="/login" method="POST">
            <input type="password" name="k" placeholder="SYSTEM ACCESS CODE" required>
            <button type="submit">UNSEAL ENGINE</button>
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
        return res.send(renderUI('Ready', `
            <div class="pill on">UPLINK ACTIVE</div>
            <h2>ENGINE <span>READY</span></h2>
            <form action="/key" method="POST"><button>GENERATE API TOKEN</button></form>
            ${validApiKey ? `<div style="background:#000; padding:15px; color:#00ff88; font-family:monospace; font-size:12px; margin-top:15px; word-break:break-all; border-radius:10px; border:1px dashed #333;">${validApiKey}</div>` : ''}
            <div style="margin-top:25px; border-top:1px solid #222; padding-top:25px;">
                <input id="n" placeholder="91XXXXXXXXXX">
                <textarea id="m" placeholder="MESSAGE PAYLOAD..." rows="3"></textarea>
                <button id="s" onclick="fire()">FIRE TRANSMISSION</button>
            </div>
        `, `
            async function fire() {
                const b = document.getElementById('s'); b.innerText = 'TRANSMITTING...';
                const r = await fetch('/api/send', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ k: '${validApiKey}', n: document.getElementById('n').value, m: document.getElementById('m').value })
                });
                const d = await r.json();
                alert(d.success ? 'SUCCESS' : 'LINK FAILED');
                b.innerText = 'FIRE TRANSMISSION';
            }
        `));
    }

    res.send(renderUI('Syncing', `
        <div class="pill off">SYNCING SYSTEM</div>
        <h2>HANDSHAKE <span>NODE</span></h2>
        ${qrCodeImage ? `<div class="qr-wrap"><img src="${qrCodeImage}"></div>` : '<p style="color:#00ff88;">INITIALIZING CHROMIUM...</p>'}
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
app.listen(PORT, '0.0.0.0', () => console.log('M-TECH UPLINK ON ' + PORT));
