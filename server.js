const express = require('express');
const session = require('express-session');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs-extra');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// --- SECURITY HEADERS ---
app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "default-src 'self' https:; script-src 'unsafe-inline'; style-src 'unsafe-inline';");
    next();
});

// --- SESSION CONFIG ---
app.use(session({
    secret: 'm-tech-render-ultimate-key',
    resave: false,
    saveUninitialized: true
}));

// --- WHATSAPP ENGINE (RENDER OPTIMIZED) ---
let qrCodeImage = null;
let isReady = false;
let validApiKey = null;

const client = new Client({
    authStrategy: new LocalAuth(),
    authTimeoutMs: 120000, 
    puppeteer: { 
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--single-process', // CRITICAL FOR RENDER RAM
            '--no-zygote',
            '--no-first-run',
            '--disable-gpu',
            '--disable-extensions',
            '--mute-audio'
        ] 
    }
});

client.on('qr', async (qr) => {
    qrCodeImage = await qrcode.toDataURL(qr);
    console.log('Engine QR Generated.');
});

client.on('ready', () => {
    console.log('\n🚀 M-TECH ENGINE IS FULLY ONLINE ON RENDER!\n');
    isReady = true;
    qrCodeImage = null;
});

client.on('disconnected', () => { isReady = false; });
client.initialize();

// --- GLOBAL UI TEMPLATE (PREMIUM GLASSMORPHISM) ---
const renderHTML = (title, content, script = '') => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        * { box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; }
        body { background: #050508; color: #fff; display: flex; justify-content: center; align-items: center; min-height: 100vh; overflow-x: hidden; }
        body::before { 
            content: ""; position: absolute; top: 0; left: 0; width: 100%; height: 100%; 
            background-image: linear-gradient(rgba(0, 255, 136, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 210, 255, 0.03) 1px, transparent 1px); 
            background-size: 40px 40px; z-index: -1; transform: perspective(600px) rotateX(60deg) translateY(-50px) translateZ(-200px); animation: gridScan 15s linear infinite;
        }
        @keyframes gridScan { from { background-position: 0 0; } to { background-position: 0 40px; } }
        .glass-panel { 
            background: rgba(12, 15, 20, 0.75); backdrop-filter: blur(25px); border: 1px solid rgba(0, 255, 136, 0.15); border-top: 1px solid rgba(0, 210, 255, 0.3);
            border-radius: 20px; padding: 45px 40px; box-shadow: 0 30px 60px rgba(0,0,0,0.9), inset 0 0 20px rgba(0,255,136,0.05); max-width: 480px; width: 95%; position: relative; animation: slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes slideUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
        h2 { font-weight: 300; letter-spacing: 4px; color: #fff; text-transform: uppercase; text-align: center; margin-bottom: 35px; text-shadow: 0 0 20px rgba(255, 255, 255, 0.2); }
        h2 span { color: #00ff88; font-weight: 800; text-shadow: 0 0 15px rgba(0, 255, 136, 0.5); }
        label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; display: block; font-weight: 600; }
        input, textarea, button { width: 100%; padding: 16px; margin-bottom: 24px; border-radius: 10px; border: none; outline: none; transition: all 0.3s ease; }
        input, textarea { background: rgba(0,0,0,0.6); color: #00d2ff; border: 1px solid rgba(255,255,255,0.08); font-size: 15px; font-family: monospace; box-shadow: inset 0 2px 8px rgba(0,0,0,0.8); }
        input:focus, textarea:focus { border-color: #00ff88; box-shadow: 0 0 20px rgba(0,255,136,0.15), inset 0 2px 8px rgba(0,0,0,0.8); background: rgba(0,0,0,0.9); }
        textarea { resize: vertical; min-height: 120px; color: #ddd; font-family: 'Segoe UI', sans-serif; line-height: 1.6; }
        button { background: linear-gradient(135deg, #00ff88 0%, #00b8ff 100%); color: #000; font-weight: 800; cursor: pointer; text-transform: uppercase; letter-spacing: 2px; font-size: 14px; box-shadow: 0 8px 20px rgba(0,255,136,0.25); }
        button:hover { transform: translateY(-3px); box-shadow: 0 15px 30px rgba(0,255,136,0.4); color: #fff; }
        .alert { color: #ff3366; font-size: 13px; margin-bottom: 20px; font-weight: bold; text-align: center; text-transform: uppercase; letter-spacing: 1px; }
        .status-box { padding: 15px; border-radius: 10px; margin-bottom: 20px; font-weight: bold; text-align: center; letter-spacing: 2px; text-transform: uppercase; }
        .online { background: rgba(0, 255, 136, 0.1); color: #00ff88; border: 1px solid rgba(0, 255, 136, 0.3); }
        .offline { background: rgba(255, 51, 102, 0.1); color: #ff3366; border: 1px solid rgba(255, 51, 102, 0.3); }
        .api-key-box { background: #000; padding: 15px; border-radius: 8px; font-family: monospace; color: #00ff88; font-size: 13px; word-break: break-all; border: 1px solid #333; margin-top: 10px; }
        
        #toast-container { position: fixed; top: 20px; right: 20px; z-index: 9999; }
        .toast { background: rgba(10, 12, 16, 0.98); backdrop-filter: blur(15px); color: white; padding: 18px 25px; margin-bottom: 15px; border-radius: 10px; border-left: 4px solid #00ff88; box-shadow: 0 20px 40px rgba(0,0,0,0.9); animation: slideIn 0.4s forwards; font-weight: 600; letter-spacing: 0.5px; font-size: 14px; }
        @keyframes slideIn { from { transform: translateX(120%); } to { transform: translateX(0); } }
        @keyframes slideOut { from { transform: translateX(0); } to { transform: translateX(120%); opacity: 0; } }
    </style>
</head>
<body>
    <div id="toast-container"></div>
    <div class="glass-panel">${content}</div>
    <script>
        function showToast(message, isError = false) {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = 'toast';
            if (isError) toast.style.borderLeftColor = '#ff3366';
            toast.innerText = message;
            container.appendChild(toast);
            setTimeout(() => { toast.style.animation = 'slideOut 0.4s forwards'; setTimeout(() => toast.remove(), 400); }, 4000);
        }
        ${script}
    </script>
</body>
</html>`;

// --- ROUTE 1: SECURE LOGIN ---
let failedAttempts = 0;
app.get('/', (req, res) => {
    if (req.session.isLoggedIn) return res.redirect('/dashboard');
    res.send(renderHTML('Engine Auth', `
        <h2>M-Tech <span>Core</span></h2>
        <div class="alert">${req.session.error || ''}</div>
        <form action="/login" method="POST">
            <label>Master Access Code</label>
            <input type="password" name="password" placeholder="Enter Authentication Key..." required>
            <button type="submit">Unlock System</button>
        </form>
    `));
    req.session.error = null;
});

app.post('/login', async (req, res) => {
    if (req.body.password === '7992410411') {
        req.session.isLoggedIn = true;
        failedAttempts = 0;
        res.redirect('/dashboard');
    } else {
        failedAttempts++;
        if (failedAttempts >= 3) {
            failedAttempts = 0; isReady = false;
            try { await fs.remove('./.wwebjs_auth'); await client.destroy(); client.initialize(); } catch (err) {}
            req.session.error = 'BREACH DETECTED: Engine Wiped.';
        } else { req.session.error = `ACCESS DENIED. ${3 - failedAttempts} Tries Left.`; }
        res.redirect('/');
    }
});

// --- ROUTE 2: THE BACKEND DASHBOARD ---
app.get('/dashboard', (req, res) => {
    if (!req.session.isLoggedIn) return res.redirect('/');
    let content = `<h2>System <span>Control</span></h2>`;
    let script = ``;

    if (!isReady) {
        content += `<div class="status-box offline">STATUS: AWAITING UPLINK</div>`;
        if (qrCodeImage) {
            content += `<img src="${qrCodeImage}" style="width: 100%; border-radius: 12px; border: 2px solid rgba(0,255,136,0.2);">`;
            script = `setTimeout(() => location.reload(), 5000);`;
        } else {
            content += `<p style="text-align:center; color:#888; font-family:monospace;">INITIALIZING ENGINE PROTOCOLS...</p>`;
            script = `setTimeout(() => location.reload(), 3000);`;
        }
    } else {
        content += `<div class="status-box online">STATUS: ENGINE ACTIVE</div>`;
        content += `<form action="/generate-key" method="POST"><button type="submit">Generate API Key</button></form>`;
        if (validApiKey) {
            content += `<label style="margin-top:20px;">AUTHORIZED API KEY:</label><div class="api-key-box">${validApiKey}</div>`;
        }
        content += `<br><a href="/terminal" style="display:block; text-align:center; color:#00d2ff; text-decoration:none; font-family:monospace; margin-top:20px; letter-spacing:1px;">&rarr; LAUNCH SECURE TERMINAL</a>`;
    }
    res.send(renderHTML('Dashboard', content, script));
});

app.post('/generate-key', (req, res) => {
    if (!req.session.isLoggedIn) return res.status(401).send('Unauthorized');
    validApiKey = crypto.randomBytes(32).toString('hex');
    res.redirect('/dashboard');
});

// --- ROUTE 3: THE HIGH-END REMOTE TERMINAL ---
app.get('/terminal', (req, res) => {
    // Note: The terminal is publicly accessible, but it REQUIRES the exact API key to actually send a message.
    let content = `
        <h2>Secure <span>Terminal</span></h2>
        <form id="remoteForm">
            <label>API Authorization Key</label>
            <input type="password" id="apiKey" placeholder="Paste your generated key..." required>

            <label>Target Phone Number</label>
            <input type="number" id="targetNumber" placeholder="919876543210" required>

            <label>Encrypted Payload</label>
            <textarea id="messageBody" placeholder="Enter transmission data..." required></textarea>

            <button type="submit" id="submitBtn">Transmit Payload</button>
        </form>
    `;
    
    let script = `
        document.getElementById('remoteForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('submitBtn');
            const origText = btn.innerText;
            
            const apiKey = document.getElementById('apiKey').value.trim();
            const number = document.getElementById('targetNumber').value.trim();
            const message = document.getElementById('messageBody').value.trim();

            btn.innerText = 'TRANSMITTING...'; btn.disabled = true;

            try {
                // Calls the local API endpoint on the same Render server
                const response = await fetch('/api/send-message', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ apiKey, number, message })
                });

                const data = await response.json();
                if (response.ok && data.success) {
                    showToast('Transmission Successful!');
                    document.getElementById('messageBody').value = '';
                } else { showToast(data.error || 'Server rejected transmission.', true); }
            } catch (error) { showToast('Connection failed. Engine offline?', true); } 
            finally { btn.innerText = origText; btn.disabled = false; }
        });
    `;
    res.send(renderHTML('Terminal', content, script));
});

// --- ROUTE 4: THE ACTUAL API ENDPOINT ---
app.post('/api/send-message', async (req, res) => {
    const { apiKey, number, message } = req.body;
    if (!validApiKey || apiKey !== validApiKey) return res.status(403).json({ error: 'INVALID AUTHORIZATION KEY' });
    if (!isReady) return res.status(503).json({ error: 'ENGINE OFFLINE OR SYNCING' });

    try {
        await client.sendMessage(`${number}@c.us`, message);
        res.json({ success: true, message: 'Transmission Successful!' });
    } catch (err) { res.status(500).json({ error: 'TRANSMISSION FAILED' }); }
});

// --- START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`\nCORE ENGINE INITIALIZED ON PORT ${PORT}\n`));
