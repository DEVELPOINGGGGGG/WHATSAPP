const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const express = require("express");
const session = require("express-session");
const qrcode = require("qrcode");
const crypto = require("crypto");
const cors = require("cors");
const pino = require("pino");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

app.use(session({
    secret: 'm-tech-railway-final-v7',
    resave: true,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

let sock;
let qrCodeImage = null;
let isReady = false;
let validApiKey = null;

async function startWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_session');
    
    sock = makeWASocket({
        auth: state,
        // Removed printQRInTerminal to stop the warning
        logger: pino({ level: 'silent' }),
        browser: ["M-Tech Core", "Chrome", "110.0.0"]
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // Handle QR Generation
        if (qr) {
            qrCodeImage = await qrcode.toDataURL(qr);
            console.log(">> New QR Pattern Captured <<");
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            isReady = false;
            qrCodeImage = null;
            if (shouldReconnect) startWhatsApp();
        } else if (connection === 'open') {
            isReady = true;
            qrCodeImage = null;
            console.log(">> ENGINE UPLINK ACTIVE <<");
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

startWhatsApp();

const renderUI = (title, content, script = '') => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${title} | M-Tech</title>
    <style>
        * { box-sizing: border-box; font-family: 'Segoe UI', sans-serif; margin: 0; padding: 0; }
        body { background: #050505; color: #fff; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
        .panel { background: rgba(15, 20, 25, 0.9); border: 1px solid rgba(0, 255, 136, 0.2); border-radius: 20px; padding: 40px; width: 95%; max-width: 440px; text-align: center; box-shadow: 0 30px 60px #000; }
        h2 span { color: #00ff88; font-weight: 800; text-shadow: 0 0 10px rgba(0,255,136,0.5); }
        .status { padding: 10px; border-radius: 50px; font-size: 11px; font-weight: bold; margin-bottom: 25px; border: 1px solid; }
        .online { color: #00ff88; background: rgba(0,255,136,0.1); }
        .offline { color: #ff3366; background: rgba(255,51,102,0.1); }
        .qr-frame { background: #fff; padding: 10px; border-radius: 10px; margin: 20px auto; width: 220px; height: 220px; }
        .qr-frame img { width: 100%; }
        input, button { width: 100%; padding: 15px; margin: 10px 0; border-radius: 10px; border: none; }
        input { background: #000; color: #00ff88; border: 1px solid #333; }
        button { background: linear-gradient(135deg, #00ff88, #00d2ff); font-weight: 800; cursor: pointer; }
    </style>
</head>
<body>
    <div class="panel">${content}</div>
    <script>${script}</script>
</body>
</html>`;

app.get('/', (req, res) => {
    if (req.session.isAuth) return res.redirect('/dashboard');
    res.send(renderUI('Login', `<h2>Core <span>Auth</span></h2><form action="/login" method="POST"><input type="password" name="code" placeholder="Master Code" required><button>Unlock</button></form>`));
});

app.post('/login', (req, res) => {
    if (req.body.code === '7992410411') {
        req.session.isAuth = true;
        req.session.save(() => res.redirect('/dashboard'));
    } else res.redirect('/');
});

app.get('/dashboard', (req, res) => {
    if (!req.session.isAuth) return res.redirect('/');
    let content = `<h2>Engine <span>Node</span></h2>`;
    let script = ``;

    if (!isReady) {
        content += `<div class="status offline">OFFLINE: AWAITING UPLINK</div>`;
        if (qrCodeImage) {
            content += `<div class="qr-frame"><img src="${qrCodeImage}"></div>`;
            script = `setTimeout(() => location.reload(), 10000);`;
        } else {
            content += `<p>Initializing Protocols...</p>`;
            script = `setTimeout(() => location.reload(), 3000);`;
        }
    } else {
        content += `<div class="status online">ONLINE: SECURE</div>`;
        content += `<form action="/gen" method="POST"><button>Generate Key</button></form>`;
        if (validApiKey) content += `<div style="background:#000;padding:10px;font-family:monospace;word-break:break-all;color:#00ff88;margin-top:10px;">${validApiKey}</div>`;
    }
    res.send(renderUI('Dash', content, script));
});

app.post('/gen', (req, res) => {
    validApiKey = crypto.randomBytes(24).toString('hex');
    res.redirect('/dashboard');
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on ${PORT}`));
