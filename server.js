const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const express = require("express");
const session = require("express-session");
const qrcode = require("qrcode");
const crypto = require("crypto");
const cors = require("cors");
const pino = require("pino");

const app = express();
app.use(express.json());
app.use(cors());

// --- SECURE SESSION CONFIG ---
app.use(session({
    secret: 'm-tech-railway-core-v4',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

let sock;
let qrCodeImage = null;
let isReady = false;
let validApiKey = null;

// --- THE LIGHTWEIGHT ENGINE (NO CHROME = NO CRASH) ---
async function startWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_session');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }), // Saves massive RAM
        browser: ["M-Tech Core", "Chrome", "110.0.0"]
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrCodeImage = await qrcode.toDataURL(qr);

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            isReady = false;
            if (shouldReconnect) startWhatsApp();
        } else if (connection === 'open') {
            isReady = true;
            qrCodeImage = null;
            console.log(">> ENGINE UPLINK SUCCESSFUL <<");
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

startWhatsApp();

// --- PREMIUM DECORATED UI TEMPLATE ---
const renderUI = (title, content, script = '') => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | M-Tech</title>
    <style>
        * { box-sizing: border-box; font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 0; }
        body { 
            background: #050505; color: #fff; display: flex; justify-content: center; 
            align-items: center; min-height: 100vh; overflow: hidden;
        }
        /* Animated Background Grid */
        body::before {
            content: ""; position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background-image: 
                linear-gradient(rgba(0, 255, 136, 0.05) 1px, transparent 1px),
                linear-gradient(90deg, rgba(0, 255, 136, 0.05) 1px, transparent 1px);
            background-size: 50px 50px; z-index: -1;
            transform: perspective(1000px) rotateX(60deg) translateY(-100px);
            animation: gridMove 10s linear infinite;
        }
        @keyframes gridMove { from { background-position: 0 0; } to { background-position: 0 50px; } }

        .glass-card {
            background: rgba(15, 15, 20, 0.8); backdrop-filter: blur(20px);
            border: 1px solid rgba(0, 255, 136, 0.2); border-radius: 20px;
            padding: 40px; width: 95%; max-width: 450px; text-align: center;
            box-shadow: 0 25px 50px rgba(0,0,0,0.8); animation: fadeIn 0.5s ease-out;
        }
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        
        h2 { font-weight: 300; letter-spacing: 5px; text-transform: uppercase; margin-bottom: 30px; color: #fff; }
        h2 span { color: #00ff88; font-weight: 800; text-shadow: 0 0 15px rgba(0,255,136,0.5); }
        
        input, textarea, button { width: 100%; padding: 15px; margin: 12px 0; border-radius: 10px; border: none; outline: none; transition: 0.3s; }
        input, textarea { background: #000; color: #00ff88; border: 1px solid #222; font-family: monospace; }
        input:focus { border-color: #00ff88; box-shadow: 0 0 10px rgba(0,255,136,0.2); }
        
        button { background: linear-gradient(135deg, #00ff88, #00d2ff); color: #000; font-weight: 800; cursor: pointer; text-transform: uppercase; letter-spacing: 2px; }
        button:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(0,255,136,0.3); }
        
        .status-pill { padding: 10px; border-radius: 50px; font-size: 11px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 25px; display: inline-block; }
        .online { background: rgba(0,255,136,0.1); color: #00ff88; border: 1px solid #00ff88; }
        .offline { background: rgba(255,51,102,0.1); color: #ff3366; border: 1px solid #ff3366; }
        
        .qr-wrap { background: #fff; padding: 10px; border-radius: 15px; margin: 20px auto; width: 250px; height: 250px; box-shadow: 0 0 30px rgba(0,255,136,0.2); }
        .qr-wrap img { width: 100%; height: 100%; }
        
        .api-box { background: #000; padding: 15px; border-radius: 8px; font-family: monospace; color: #00ff88; font-size: 12px; margin-top: 15px; border: 1px dashed #333; word-break: break-all; }
        a { color: #00d2ff; text-decoration: none; font-size: 12px; letter-spacing: 1px; margin-top: 20px; display: block; }
    </style>
</head>
<body>
    <div class="glass-card">${content}</div>
    <script>${script}</script>
</body>
</html>`;

// --- ROUTES ---

app.get('/', (req, res) => {
    if (req.session.isAuth) return res.redirect('/dashboard');
    res.send(renderUI('Login', `
        <h2>Core <span>Auth</span></h2>
        <form action="/login" method="POST">
            <input type="password" name="code" placeholder="Master Access Code" required>
            <button type="submit">Unlock Engine</button>
        </form>
    `));
});

app.post('/login', (req, res) => {
    if (req.body.code === '7992410411') {
        req.session.isAuth = true;
        res.redirect('/dashboard');
    } else { res.redirect('/'); }
});

app.get('/dashboard', (req, res) => {
    if (!req.session.isAuth) return res.redirect('/');
    let content = `<h2>System <span>Node</span></h2>`;
    let script = ``;

    if (!isReady) {
        content += `<div class="status-pill offline">OFFLINE: AWAITING SYNC</div>`;
        if (qrCodeImage) {
            content += `<div class="qr-wrap"><img src="${qrCodeImage}"></div><p style="font-size:12px; color:#888;">SCAN WITH WHATSAPP LINKED DEVICES</p>`;
            script = `setTimeout(() => location.reload(), 15000);`;
        } else {
            content += `<p style="color:#00ff88;">INITIALIZING SOCKETS...</p>`;
            script = `setTimeout(() => location.reload(), 4000);`;
        }
    } else {
        content += `<div class="status-pill online">ONLINE: SECURE UPLINK</div>`;
        content += `<form action="/gen-key" method="POST"><button>Generate API Key</button></form>`;
        if (validApiKey) content += `<div class="api-box">${validApiKey}</div>`;
        content += `<a href="/terminal">>> OPEN REMOTE TERMINAL</a>`;
    }
    res.send(renderUI('Dashboard', content, script));
});

app.post('/gen-key', (req, res) => {
    if (!req.session.isAuth) return res.sendStatus(403);
    validApiKey = crypto.randomBytes(20).toString('hex');
    res.redirect('/dashboard');
});

app.get('/terminal', (req, res) => {
    res.send(renderUI('Terminal', `
        <h2>Secure <span>Link</span></h2>
        <form id="tx">
            <input type="password" id="k" placeholder="API Key" required>
            <input type="number" id="n" placeholder="Target Number (91...)" required>
            <textarea id="m" placeholder="Payload Message..." required></textarea>
            <button type="submit" id="s">Transmit</button>
        </form>
        <a href="/dashboard"><< BACK TO NODE</a>
    `, `
        document.getElementById('tx').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('s');
            btn.innerText = 'TRANSMITTING...'; btn.disabled = true;
            try {
                const res = await fetch('/api/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ k: document.getElementById('k').value, n: document.getElementById('num').value, m: document.getElementById('m').value })
                });
                const data = await res.json();
                alert(data.success ? 'Success' : 'Rejected');
            } catch(e) { alert('Network Error'); }
            finally { btn.innerText = 'Transmit'; btn.disabled = false; }
        });
    `));
});

app.post('/api/send', async (req, res) => {
    const { k, n, m } = req.body;
    if (k !== validApiKey || !isReady) return res.status(403).json({ success: false });
    try {
        await sock.sendMessage(`${n}@s.whatsapp.net`, { text: m });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`M-Tech Online on Port ${PORT}`));
