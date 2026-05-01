const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const express = require("express");
const session = require("express-session");
const qrcode = require("qrcode");
const crypto = require("crypto");
const cors = require("cors");
const pino = require("pino");
const fs = require("fs");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

app.use(session({
    secret: 'm-tech-railway-final-v9',
    resave: true,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

let sock;
let qrCodeImage = null;
let isReady = false;
let validApiKey = null;

async function startWhatsApp() {
    // Railway fix: Ensure the auth directory exists
    if (!fs.existsSync('./auth_session')) {
        fs.mkdirSync('./auth_session');
    }

    const { state, saveCreds } = await useMultiFileAuthState('auth_session');
    
    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["M-Tech Core", "Chrome", "110.0.0"],
        connectTimeoutMs: 60000, // Increased timeout for slower cloud boots
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            qrCodeImage = await qrcode.toDataURL(qr);
            console.log(">> QR GENERATED <<");
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            isReady = false;
            qrCodeImage = null;
            if (shouldReconnect) startWhatsApp();
        } else if (connection === 'open') {
            isReady = true;
            qrCodeImage = null;
            console.log(">> ENGINE ONLINE <<");
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

startWhatsApp();

// --- MINIMAL STABLE UI ---
const renderUI = (title, content, script = '') => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
        body { background: #050505; color: #fff; font-family: sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
        .panel { background: #111; border: 1px solid #00ff88; padding: 40px; border-radius: 15px; text-align: center; width: 400px; }
        .qr-box { background: #fff; padding: 10px; margin: 20px auto; width: 220px; }
        .qr-box img { width: 100%; }
        button { width: 100%; padding: 15px; background: #00ff88; color: #000; font-weight: bold; border: none; border-radius: 5px; cursor: pointer; }
        input { width: 100%; padding: 15px; margin-bottom: 10px; background: #000; color: #00ff88; border: 1px solid #333; }
    </style>
</head>
<body>
    <div class="panel">${content}</div>
    <script>${script}</script>
</body>
</html>`;

app.get('/', (req, res) => {
    if (req.session.isAuth) return res.redirect('/dashboard');
    res.send(renderUI('Login', `<h2>CORE AUTH</h2><form action="/login" method="POST"><input type="password" name="code" placeholder="CODE"><button>UNLOCK</button></form>`));
});

app.post('/login', (req, res) => {
    if (req.body.code === '7992410411') {
        req.session.isAuth = true;
        req.session.save(() => res.redirect('/dashboard'));
    } else res.redirect('/');
});

app.get('/dashboard', (req, res) => {
    if (!req.session.isAuth) return res.redirect('/');
    if (isReady) {
        return res.send(renderUI('Online', `<h2>ENGINE ONLINE</h2><form action="/gen" method="POST"><button>GENERATE API KEY</button></form>${validApiKey ? `<p>${validApiKey}</p>` : ''}`));
    }
    if (qrCodeImage) {
        return res.send(renderUI('Scan', `<h2>SCAN QR</h2><div class="qr-box"><img src="${qrCodeImage}"></div>`, `setTimeout(() => location.reload(), 10000);`));
    }
    res.send(renderUI('Loading', `<h2>INITIALIZING...</h2><p>Wait 10-20 seconds</p>`, `setTimeout(() => location.reload(), 5000);`));
});

app.post('/gen', (req, res) => {
    validApiKey = crypto.randomBytes(24).toString('hex');
    res.redirect('/dashboard');
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log('Server Live'));
