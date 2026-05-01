const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const qrcode = require('qrcode');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- STOP MEMORY LEAK: Production Session Store ---
app.use(session({
    store: new FileStore({ path: './sessions' }),
    secret: 'm-tech-chrome-v3',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 86400000 }
}));

let qrCodeImage = null;
let isReady = false;
let validApiKey = null;

// --- PUPPETEER CONFIG FOR RAILWAY ---
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './auth_data' }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null
    }
});

client.on('qr', async (qr) => {
    qrCodeImage = await qrcode.toDataURL(qr);
    console.log('>> [Puppeteer] New QR Generated');
});

client.on('ready', () => {
    isReady = true;
    qrCodeImage = null;
    console.log('>> [Puppeteer] CHROME UPLINK READY');
});

client.on('authenticated', () => {
    console.log('>> [Puppeteer] Authenticated Successfully');
});

client.initialize();

// --- PREMIUM UI ---
const renderUI = (title, content, script = '') => `
<!DOCTYPE html><html><head><title>${title}</title>
<style>
    body { background: #050505; color: #fff; font-family: 'Segoe UI', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .card { background: #0c0c0c; border: 1px solid #00ff88; padding: 40px; border-radius: 20px; text-align: center; width: 420px; box-shadow: 0 10px 40px rgba(0,255,136,0.2); }
    h2 { letter-spacing: 2px; margin-bottom: 25px; }
    .status { padding: 10px; border-radius: 8px; font-weight: bold; margin-bottom: 20px; text-transform: uppercase; border: 1px solid; }
    .on { background: rgba(0,255,136,0.1); color: #00ff88; border-color: #00ff88; }
    .off { background: rgba(255,51,102,0.1); color: #ff3366; border-color: #ff3366; }
    input, button, textarea { width: 100%; padding: 14px; margin: 8px 0; border-radius: 10px; border: none; font-size: 14px; }
    input, textarea { background: #000; color: #00ff88; border: 1px solid #222; }
    button { background: #00ff88; color: #000; font-weight: 900; cursor: pointer; text-transform: uppercase; }
    button:hover { filter: brightness(1.2); transform: translateY(-1px); }
</style>
</head><body><div class="card">${content}</div><script>${script}</script></body></html>`;

app.get('/', (req, res) => {
    if (req.session.isLogged) return res.redirect('/dashboard');
    res.send(renderUI('Login', `<h2>M-TECH CORE</h2><form action="/login" method="POST"><input type="password" name="p" placeholder="Master Key" required><button>Enter System</button></form>`));
});

app.post('/login', (req, res) => {
    if (req.body.p === '7992410411') { req.session.isLogged = true; res.redirect('/dashboard'); }
    else res.redirect('/');
});

app.get('/dashboard', (req, res) => {
    if (!req.session.isLogged) return res.redirect('/');
    
    if (isReady) {
        return res.send(renderUI('System Active', `
            <div class="status on">UPLINK ACTIVE</div>
            <form action="/gen" method="POST"><button>GENERATE API ACCESS</button></form>
            ${validApiKey ? `<div style="word-break:break-all; background:#000; padding:10px; margin:10px 0; font-family:monospace; color:#00ff88; font-size:12px;">${validApiKey}</div>` : ''}
            <div style="border-top:1px solid #222; margin-top:20px; padding-top:20px;">
                <input id="num" placeholder="91XXXXXXXXXX">
                <textarea id="msg" placeholder="Your Message..."></textarea>
                <button id="sBtn" onclick="fire()">FIRE MESSAGE</button>
            </div>
        `, `
            async function fire() {
                const b = document.getElementById('sBtn'); b.innerText = 'SENDING...';
                const r = await fetch('/api/send', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ k: '${validApiKey}', n: document.getElementById('num').value, m: document.getElementById('msg').value })
                });
                const d = await r.json();
                alert(d.success ? 'TRANSMITTED' : 'FAILED');
                b.innerText = 'FIRE MESSAGE';
            }
        `));
    }

    res.send(renderUI('Connecting', `
        <div class="status off">AWAITING SCAN</div>
        ${qrCodeImage ? `<img src="${qrCodeImage}" style="width:100%; border: 5px solid #fff; border-radius:10px;">` : '<p>Launching Chrome Engine...</p>'}
    `, `setTimeout(() => location.reload(), 5000);`));
});

app.post('/gen', (req, res) => {
    validApiKey = crypto.randomBytes(20).toString('hex');
    res.redirect('/dashboard');
});

app.post('/api/send', async (req, res) => {
    const { k, n, m } = req.body;
    if (k !== validApiKey || !isReady) return res.status(403).json({ success: false });
    try {
        const target = n.includes('@c.us') ? n : `${n}@c.us`;
        await client.sendMessage(target, m);
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log('Server Live on Port ' + PORT));
