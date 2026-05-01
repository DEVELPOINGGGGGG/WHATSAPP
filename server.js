const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const express = require("express");
const session = require("express-session");
const qrcode = require("qrcode");
const crypto = require("crypto");
const cors = require("cors");
const pino = require("pino");

const app = express();

// --- BODY PARSERS (CRITICAL FOR FORM BUTTONS) ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// --- SECURE SESSION (FIXED FOR RAILWAY) ---
app.use(session({
    secret: 'm-tech-railway-core-v5',
    resave: true,
    saveUninitialized: true,
    cookie: { 
        secure: false, // Set to true if you use SSL, but false is safer for debugging
        maxAge: 24 * 60 * 60 * 1000 
    }
}));

let sock;
let qrCodeImage = null;
let isReady = false;
let validApiKey = null;

// --- THE ENGINE ---
async function startWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_session');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }),
        browser: ["M-Tech Terminal", "Chrome", "110.0.0"]
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
            console.log(">> SYSTEM LIVE <<");
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

startWhatsApp();

// --- PREMIUM UI (HARDCODED & DECORATED) ---
const renderUI = (title, content, script = '') => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | M-Tech</title>
    <style>
        * { box-sizing: border-box; font-family: 'Segoe UI', sans-serif; margin: 0; padding: 0; }
        body { background: #050505; color: #fff; display: flex; justify-content: center; align-items: center; min-height: 100vh; overflow-x: hidden; position: relative; }
        
        /* Premium Background Animation */
        body::before {
            content: ""; position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background-image: linear-gradient(rgba(0, 255, 136, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 136, 0.05) 1px, transparent 1px);
            background-size: 40px 40px; z-index: -1; transform: perspective(500px) rotateX(60deg) translateY(-50px); animation: move 10s linear infinite;
        }
        @keyframes move { from { background-position: 0 0; } to { background-position: 0 40px; } }

        .panel {
            background: rgba(10, 15, 20, 0.9); backdrop-filter: blur(20px);
            border: 1px solid rgba(0, 255, 136, 0.2); border-radius: 20px;
            padding: 40px; width: 95%; max-width: 440px; text-align: center;
            box-shadow: 0 30px 60px rgba(0,0,0,0.9); animation: pop 0.6s cubic-bezier(0.17, 0.89, 0.32, 1.28);
        }
        @keyframes pop { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
        
        h2 { font-weight: 300; letter-spacing: 5px; text-transform: uppercase; margin-bottom: 30px; }
        h2 span { color: #00ff88; font-weight: 800; text-shadow: 0 0 15px rgba(0,255,136,0.6); }
        
        input, textarea, button { width: 100%; padding: 15px; margin: 12px 0; border-radius: 12px; border: none; outline: none; transition: 0.3s; font-size: 14px; }
        input, textarea { background: #000; color: #00ff88; border: 1px solid #222; font-family: monospace; }
        input:focus { border-color: #00ff88; box-shadow: 0 0 10px rgba(0,255,136,0.2); }
        
        button { background: linear-gradient(135deg, #00ff88, #00d2ff); color: #000; font-weight: 800; cursor: pointer; text-transform: uppercase; letter-spacing: 2px; }
        button:hover { transform: translateY(-3px); box-shadow: 0 10px 20px rgba(0,255,136,0.4); filter: brightness(1.1); }
        button:active { transform: translateY(0); }

        .status { padding: 10px; border-radius: 50px; font-size: 11px; font-weight: bold; text-transform: uppercase; margin-bottom: 25px; border: 1px solid rgba(255,255,255,0.1); }
        .online { color: #00ff88; background: rgba(0, 255, 136, 0.1); border-color: #00ff88; }
        .offline { color: #ff3366; background: rgba(255, 51, 102, 0.1); border-color: #ff3366; }
        
        .qr-frame { background: #fff; padding: 10px; border-radius: 15px; margin: 20px auto; width: 220px; height: 220px; }
        .qr-frame img { width: 100%; height: 100%; }
        
        .key-text { background: #000; padding: 12px; font-family: monospace; color: #00ff88; font-size: 12px; border: 1px solid #333; margin-top: 15px; word-break: break-all; }
        .footer-link { display: block; margin-top: 25px; color: #00d2ff; text-decoration: none; font-size: 12px; font-weight: bold; }
    </style>
</head>
<body>
    <div class="panel">${content}</div>
    <script>${script}</script>
</body>
</html>`;

// --- ROUTES ---

app.get('/', (req, res) => {
    if (req.session.isAuth) return res.redirect('/dashboard');
    res.send(renderUI('Authentication', `
        <h2>Secure <span>Gate</span></h2>
        <form action="/login" method="POST">
            <input type="password" name="code" placeholder="Master Access Code" required>
            <button type="submit">Unlock Engine</button>
        </form>
    `));
});

app.post('/login', (req, res) => {
    const { code } = req.body;
    if (code === '7992410411') {
        req.session.isAuth = true;
        // Forced save to ensure Railway handles the session before redirect
        req.session.save(() => {
            res.redirect('/dashboard');
        });
    } else {
        res.redirect('/?error=1');
    }
});

app.get('/dashboard', (req, res) => {
    if (!req.session.isAuth) return res.redirect('/');
    let content = `<h2>Engine <span>Node</span></h2>`;
    let script = ``;

    if (!isReady) {
        content += `<div class="status offline">OFFLINE: NO UPLINK</div>`;
        if (qrCodeImage) {
            content += `<div class="qr-frame"><img src="${qrCodeImage}"></div><p style="font-size:12px; color:#666;">SCAN WITH LINKED DEVICES</p>`;
            script = `setTimeout(() => location.reload(), 15000);`;
        } else {
            content += `<p style="color:#00ff88;">INITIALIZING CORE...</p>`;
            script = `setTimeout(() => location.reload(), 3000);`;
        }
    } else {
        content += `<div class="status online">ONLINE: UPLINK SECURE</div>`;
        content += `<form action="/gen-key" method="POST"><button type="submit">Generate API Token</button></form>`;
        if (validApiKey) content += `<div class="key-text">${validApiKey}</div>`;
        content += `<a href="/terminal" class="footer-link">LAUNCH REMOTE TERMINAL &rarr;</a>`;
    }
    res.send(renderUI('Dashboard', content, script));
});

app.post('/gen-key', (req, res) => {
    if (!req.session.isAuth) return res.sendStatus(403);
    validApiKey = crypto.randomBytes(24).toString('hex');
    res.redirect('/dashboard');
});

app.get('/terminal', (req, res) => {
    if (!req.session.isAuth) return res.redirect('/');
    res.send(renderUI('Terminal', `
        <h2>Secure <span>Terminal</span></h2>
        <form id="txForm">
            <input type="password" id="key" placeholder="API Token" required>
            <input type="number" id="num" placeholder="Target Number (ex: 918383...)" required>
            <textarea id="msg" placeholder="Transmission Payload..." required></textarea>
            <button type="submit" id="subBtn">Fire Transmission</button>
        </form>
        <a href="/dashboard" class="footer-link">&larr; BACK TO NODE</a>
    `, `
        document.getElementById('txForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const b = document.getElementById('subBtn');
            b.innerText = 'FIRING...'; b.disabled = true;
            try {
                const res = await fetch('/api/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        k: document.getElementById('key').value, 
                        n: document.getElementById('num').value, 
                        m: document.getElementById('msg').value 
                    })
                });
                const data = await res.json();
                alert(data.success ? 'Success: Payload Delivered' : 'Error: Transmission Rejected');
            } catch(err) { alert('Network Error: Uplink Failed'); }
            finally { b.innerText = 'Fire Transmission'; b.disabled = false; }
        });
    `));
});

app.post('/api/send', async (req, res) => {
    const { k, n, m } = req.body;
    if (k !== validApiKey || !isReady) return res.status(403).json({ success: false });
    try {
        await sock.sendMessage(\`\${n}@s.whatsapp.net\`, { text: m });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// --- DYNAMIC PORT FOR RAILWAY ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log(\`M-Tech Engine initialized on port \${PORT}\`));
