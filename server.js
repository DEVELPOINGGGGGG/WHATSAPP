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
            console.log(">> QR RECEIVED — generating image...");
            try {
                qrCodeImage = await qrcode.toDataURL(qr, {
                    errorCorrectionLevel: 'H',
                    margin: 2,
                    width: 300,
                    color: { dark: '#000000', light: '#ffffff' }
                });
                console.log(">> QR GENERATED SUCCESSFULLY <<");
            } catch (err) {
                console.error(">> QR GENERATION FAILED:", err.message);
                qrCodeImage = null;
            }
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

// --- MODERN UI ---
const BASE_STYLES = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
        --green: #00ff88;
        --green-dim: #00cc6a;
        --green-glow: rgba(0, 255, 136, 0.18);
        --green-glow-sm: rgba(0, 255, 136, 0.08);
        --bg: #060608;
        --surface: #0e0f12;
        --surface-2: #16181d;
        --border: rgba(255,255,255,0.07);
        --border-green: rgba(0, 255, 136, 0.35);
        --text: #f0f0f0;
        --text-muted: #6b7280;
        --text-dim: #9ca3af;
        --radius: 16px;
        --radius-sm: 10px;
        --shadow: 0 24px 64px rgba(0,0,0,0.6);
        --shadow-green: 0 0 40px rgba(0, 255, 136, 0.12);
    }

    html { font-size: 16px; }

    body {
        background: var(--bg);
        color: var(--text);
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        padding: 24px;
        background-image:
            radial-gradient(ellipse 80% 50% at 50% -10%, rgba(0,255,136,0.07) 0%, transparent 60%),
            radial-gradient(ellipse 60% 40% at 80% 100%, rgba(0,255,136,0.04) 0%, transparent 50%);
    }

    .wordmark {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: var(--green);
        opacity: 0.7;
        margin-bottom: 28px;
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .wordmark::before, .wordmark::after {
        content: '';
        display: block;
        width: 28px;
        height: 1px;
        background: var(--green);
        opacity: 0.4;
    }

    .panel {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 40px 36px;
        width: 100%;
        max-width: 440px;
        box-shadow: var(--shadow), var(--shadow-green);
        position: relative;
        overflow: hidden;
    }
    .panel::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent, var(--green), transparent);
        opacity: 0.5;
    }

    .panel-header {
        text-align: center;
        margin-bottom: 32px;
    }
    .panel-icon {
        width: 52px;
        height: 52px;
        border-radius: 14px;
        background: var(--green-glow-sm);
        border: 1px solid var(--border-green);
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 16px;
        font-size: 22px;
    }
    .panel-title {
        font-size: 20px;
        font-weight: 700;
        color: var(--text);
        letter-spacing: -0.02em;
        margin-bottom: 6px;
    }
    .panel-subtitle {
        font-size: 13px;
        color: var(--text-muted);
        font-weight: 400;
        line-height: 1.5;
    }

    .form-group { margin-bottom: 14px; }
    .form-label {
        display: block;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--text-muted);
        margin-bottom: 8px;
    }
    input[type="password"], input[type="text"] {
        width: 100%;
        padding: 13px 16px;
        background: var(--surface-2);
        color: var(--text);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        font-size: 14px;
        font-family: inherit;
        outline: none;
        transition: border-color 0.2s, box-shadow 0.2s;
        -webkit-appearance: none;
    }
    input[type="password"]::placeholder { color: var(--text-muted); }
    input[type="password"]:focus, input[type="text"]:focus {
        border-color: var(--border-green);
        box-shadow: 0 0 0 3px var(--green-glow-sm);
    }

    .btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
        padding: 13px 20px;
        background: var(--green);
        color: #000;
        font-size: 14px;
        font-weight: 700;
        font-family: inherit;
        letter-spacing: 0.02em;
        border: none;
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
        box-shadow: 0 4px 20px rgba(0,255,136,0.25);
        margin-top: 4px;
        text-decoration: none;
    }
    .btn:hover {
        background: #1affa0;
        box-shadow: 0 6px 28px rgba(0,255,136,0.38);
        transform: translateY(-1px);
    }
    .btn:active { transform: translateY(0); box-shadow: 0 2px 12px rgba(0,255,136,0.2); }

    .btn-secondary {
        background: var(--surface-2);
        color: var(--text-dim);
        border: 1px solid var(--border);
        box-shadow: none;
        margin-top: 10px;
    }
    .btn-secondary:hover {
        background: #1e2028;
        color: var(--text);
        box-shadow: none;
        transform: translateY(-1px);
    }

    .qr-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin: 8px 0 24px;
    }
    .qr-frame {
        background: #fff;
        border-radius: 14px;
        padding: 14px;
        box-shadow: 0 0 0 1px var(--border-green), 0 8px 32px rgba(0,0,0,0.4), 0 0 60px rgba(0,255,136,0.1);
        position: relative;
        display: inline-block;
    }
    .qr-frame img { display: block; width: 220px; height: 220px; border-radius: 4px; }
    .qr-corner {
        position: absolute;
        width: 18px; height: 18px;
        border-color: var(--green);
        border-style: solid;
        opacity: 0.8;
    }
    .qr-corner.tl { top: -1px; left: -1px; border-width: 2px 0 0 2px; border-radius: 4px 0 0 0; }
    .qr-corner.tr { top: -1px; right: -1px; border-width: 2px 2px 0 0; border-radius: 0 4px 0 0; }
    .qr-corner.bl { bottom: -1px; left: -1px; border-width: 0 0 2px 2px; border-radius: 0 0 0 4px; }
    .qr-corner.br { bottom: -1px; right: -1px; border-width: 0 2px 2px 0; border-radius: 0 0 4px 0; }
    .qr-hint {
        margin-top: 14px;
        font-size: 12px;
        color: var(--text-muted);
        text-align: center;
        line-height: 1.6;
    }
    .qr-hint strong { color: var(--green); font-weight: 600; }

    .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 5px 12px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        margin-bottom: 20px;
    }
    .status-badge.online {
        background: rgba(0,255,136,0.1);
        color: var(--green);
        border: 1px solid rgba(0,255,136,0.25);
    }
    .status-badge .dot {
        width: 7px; height: 7px;
        border-radius: 50%;
        background: var(--green);
        animation: pulse 2s infinite;
    }
    @keyframes pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.5; transform: scale(0.85); }
    }

    .api-key-box {
        background: var(--surface-2);
        border: 1px solid var(--border-green);
        border-radius: var(--radius-sm);
        padding: 14px 16px;
        margin: 20px 0 0;
        display: flex;
        align-items: center;
        gap: 10px;
        cursor: pointer;
        transition: background 0.15s;
        position: relative;
    }
    .api-key-box:hover { background: #1a1c22; }
    .api-key-label {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--green);
        margin-bottom: 4px;
    }
    .api-key-value {
        font-size: 12px;
        font-family: 'SF Mono', 'Fira Code', monospace;
        color: var(--text-dim);
        word-break: break-all;
        line-height: 1.5;
    }
    .copy-hint {
        font-size: 10px;
        color: var(--text-muted);
        margin-top: 8px;
        text-align: center;
    }

    .divider {
        height: 1px;
        background: var(--border);
        margin: 24px 0;
    }

    /* Spinner */
    .spinner-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
        padding: 12px 0 8px;
    }
    .spinner {
        width: 48px; height: 48px;
        border: 3px solid var(--surface-2);
        border-top-color: var(--green);
        border-radius: 50%;
        animation: spin 0.9s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .spinner-text {
        font-size: 14px;
        color: var(--text-muted);
        font-weight: 500;
        text-align: center;
        line-height: 1.6;
    }
    .spinner-text strong { color: var(--text-dim); font-weight: 600; }

    .progress-dots {
        display: flex;
        gap: 6px;
        justify-content: center;
        margin-top: 4px;
    }
    .progress-dots span {
        width: 5px; height: 5px;
        border-radius: 50%;
        background: var(--green);
        opacity: 0.3;
        animation: blink 1.4s infinite;
    }
    .progress-dots span:nth-child(2) { animation-delay: 0.2s; }
    .progress-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes blink {
        0%, 80%, 100% { opacity: 0.2; transform: scale(0.9); }
        40% { opacity: 1; transform: scale(1.1); }
    }

    .footer {
        margin-top: 24px;
        font-size: 11px;
        color: var(--text-muted);
        opacity: 0.5;
        letter-spacing: 0.04em;
    }

    @media (max-width: 480px) {
        .panel { padding: 28px 20px; }
        .qr-frame img { width: 190px; height: 190px; }
    }
`;

const renderUI = (title, content, script = '') => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} — M-Tech Core</title>
    <style>${BASE_STYLES}</style>
</head>
<body>
    <div class="wordmark">M-Tech Core</div>
    <div class="panel">${content}</div>
    <div class="footer">WhatsApp Engine v4.5</div>
    <script>${script}</script>
</body>
</html>`;

app.get('/', (req, res) => {
    if (req.session.isAuth) return res.redirect('/dashboard');
    res.send(renderUI('Login', `
        <div class="panel-header">
            <div class="panel-icon">🔐</div>
            <div class="panel-title">Secure Access</div>
            <div class="panel-subtitle">Enter your access code to continue</div>
        </div>
        <form action="/login" method="POST">
            <div class="form-group">
                <label class="form-label" for="code">Access Code</label>
                <input type="password" id="code" name="code" placeholder="••••••••••" autocomplete="current-password" autofocus>
            </div>
            <button class="btn" type="submit">
                <span>Unlock Dashboard</span>
                <span>→</span>
            </button>
        </form>
    `));
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
        return res.send(renderUI('Online', `
            <div class="panel-header">
                <div class="panel-icon">⚡</div>
                <div class="panel-title">Engine Online</div>
                <div class="panel-subtitle">WhatsApp is connected and ready</div>
            </div>
            <div style="text-align:center; margin-bottom: 24px;">
                <span class="status-badge online"><span class="dot"></span>Connected</span>
            </div>
            <form action="/gen" method="POST">
                <button class="btn" type="submit">
                    <span>⚙</span>
                    <span>Generate API Key</span>
                </button>
            </form>
            ${validApiKey ? `
            <div class="api-key-box" onclick="copyKey(this)" title="Click to copy">
                <div style="flex:1; min-width:0;">
                    <div class="api-key-label">API Key</div>
                    <div class="api-key-value" id="keyVal">${validApiKey}</div>
                </div>
                <span style="font-size:16px; opacity:0.5; flex-shrink:0;">⎘</span>
            </div>
            <div class="copy-hint" id="copyHint">Click key to copy to clipboard</div>
            ` : ''}
        `, `
            function copyKey(el) {
                const key = document.getElementById('keyVal').textContent;
                navigator.clipboard.writeText(key).then(() => {
                    document.getElementById('copyHint').textContent = '✓ Copied to clipboard!';
                    document.getElementById('copyHint').style.color = '#00ff88';
                    setTimeout(() => {
                        document.getElementById('copyHint').textContent = 'Click key to copy to clipboard';
                        document.getElementById('copyHint').style.color = '';
                    }, 2500);
                });
            }
        `));
    }

    if (qrCodeImage) {
        return res.send(renderUI('Scan QR', `
            <div class="panel-header">
                <div class="panel-icon">📱</div>
                <div class="panel-title">Scan to Connect</div>
                <div class="panel-subtitle">Open WhatsApp on your phone and scan the code below</div>
            </div>
            <div class="qr-wrapper">
                <div class="qr-frame">
                    <span class="qr-corner tl"></span>
                    <span class="qr-corner tr"></span>
                    <span class="qr-corner bl"></span>
                    <span class="qr-corner br"></span>
                    <img src="${qrCodeImage}" alt="WhatsApp QR Code">
                </div>
                <div class="qr-hint">
                    Go to <strong>WhatsApp → Linked Devices → Link a Device</strong><br>
                    and point your camera at this code
                </div>
            </div>
            <div class="divider"></div>
            <div style="font-size:12px; color:var(--text-muted); text-align:center;">
                QR code refreshes automatically every 10 seconds
            </div>
        `, `
            let countdown = 10;
            const timer = setInterval(() => {
                countdown--;
                if (countdown <= 0) { clearInterval(timer); location.reload(); }
            }, 1000);
        `));
    }

    res.send(renderUI('Initializing', `
        <div class="panel-header">
            <div class="panel-icon">🔄</div>
            <div class="panel-title">Starting Engine</div>
            <div class="panel-subtitle">Establishing secure connection to WhatsApp</div>
        </div>
        <div class="spinner-wrap">
            <div class="spinner"></div>
            <div class="spinner-text">
                <strong>Please wait</strong><br>
                This usually takes 10–20 seconds
            </div>
            <div class="progress-dots">
                <span></span><span></span><span></span>
            </div>
        </div>
    `, `setTimeout(() => location.reload(), 5000);`));
});

app.post('/gen', (req, res) => {
    validApiKey = crypto.randomBytes(24).toString('hex');
    res.redirect('/dashboard');
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log('Server Live'));
