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

app.use(session({
    secret: 'm-tech-premium-core-key',
    resave: false,
    saveUninitialized: true
}));

// --- WhatsApp Client Setup (RENDER CLOUD CONFIG) ---
let qrCodeImage = null;
let isReady = false;
let validApiKey = null;

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu'
        ] 
    }
});

client.on('qr', async (qr) => {
    qrCodeImage = await qrcode.toDataURL(qr);
});

client.on('ready', () => {
    console.log('\n=========================================');
    console.log('🚀 M-TECH ENGINE IS LIVE ON RENDER!');
    console.log('=========================================\n');
    isReady = true;
    qrCodeImage = null;
});

client.on('disconnected', () => {
    isReady = false;
    console.log('Engine disconnected.');
});

client.initialize();

// --- Security & Routing ---
let failedAttempts = 0;

const renderUI = (content, script = '') => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>M-Tech Core Engine</title>
    <style>
        * { box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        body { margin: 0; padding: 0; background: radial-gradient(circle at center, #1b2735 0%, #090a0f 100%); color: #fff; display: flex; justify-content: center; align-items: center; min-height: 100vh; overflow-x: hidden; }
        body::before { content: ""; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-image: radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px); background-size: 30px 30px; opacity: 0.5; z-index: -1; }
        .glass-panel { background: rgba(20, 25, 35, 0.65); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 20px; padding: 40px; text-align: center; box-shadow: 0 30px 60px rgba(0,0,0,0.8); max-width: 450px; width: 95%; margin: 20px; animation: slideUp 0.8s ease-out; }
        h2 { margin-top: 0; font-weight: 300; letter-spacing: 3px; color: #00d2ff; text-transform: uppercase; text-shadow: 0 0 20px rgba(0, 210, 255, 0.4); }
        input, button { width: 100%; padding: 15px; margin: 12px 0; border-radius: 10px; border: none; outline: none; transition: 0.3s; }
        input { background: rgba(0,0,0,0.5); color: white; border: 1px solid rgba(255,255,255,0.1); font-size: 16px; }
        input:focus { border-color: #00d2ff; box-shadow: 0 0 15px rgba(0,210,255,0.2); }
        button { background: linear-gradient(135deg, #00d2ff 0%, #3a7bd5 100%); color: #000; font-weight: 800; cursor: pointer; text-transform: uppercase; letter-spacing: 1.5px; }
        button:hover { transform: translateY(-3px); box-shadow: 0 10px 25px rgba(0,210,255,0.4); color: #fff; }
        .alert { color: #ff3366; font-size: 0.95em; margin-bottom: 15px; font-weight: bold; }
        .api-key-box { background: rgba(0,0,0,0.6); padding: 15px; border-radius: 8px; word-wrap: break-word; font-family: monospace; color: #00ff88; border: 1px solid rgba(0,255,136,0.3); margin-top: 10px; }
        .status { margin: 20px 0; padding: 12px; border-radius: 8px; background: rgba(0,0,0,0.4); font-weight: bold; letter-spacing: 1px; }
        .status.online { border-left: 4px solid #00ff88; color: #00ff88; }
        .status.offline { border-left: 4px solid #f39c12; color: #f39c12; }
        hr { border: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent); margin: 30px 0; }
        #toast-container { position: fixed; top: 20px; right: 20px; z-index: 9999; }
        .toast { background: rgba(15, 20, 25, 0.95); backdrop-filter: blur(15px); color: white; padding: 18px 25px; margin-bottom: 15px; border-radius: 12px; border-left: 4px solid #00d2ff; box-shadow: 0 15px 35px rgba(0,0,0,0.6); animation: slideIn 0.5s forwards; font-weight: 500; }
        @keyframes slideIn { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(120%); opacity: 0; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(50px); } to { opacity: 1; transform: translateY(0); } }
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
            setTimeout(() => { toast.style.animation = 'slideOut 0.5s forwards'; setTimeout(() => toast.remove(), 500); }, 4000);
        }
        ${script}
    </script>
</body>
</html>`;

app.get('/', (req, res) => {
    if (req.session.isLoggedIn) return res.redirect('/dashboard');
    res.send(renderUI(`
        <h2>M-Tech Core</h2>
        <div class="alert">${req.session.error || ''}</div>
        <form action="/login" method="POST">
            <input type="password" name="password" placeholder="Enter Access Code" required autocomplete="off">
            <button type="submit">Initialize Server</button>
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
            failedAttempts = 0;
            isReady = false;
            try { await fs.remove('./.wwebjs_auth'); await client.destroy(); client.initialize(); } catch (err) {}
            req.session.error = 'SECURITY BREACH: System wiped.';
        } else { req.session.error = `ACCESS DENIED. ${3 - failedAttempts} attempts remaining.`; }
        res.redirect('/');
    }
});

app.get('/dashboard', (req, res) => {
    if (!req.session.isLoggedIn) return res.redirect('/');
    let content = `<h2>Core Dashboard</h2>`;
    let script = ``;
    
    if (!isReady) {
        content += `<div class="status offline">STATUS: AWAITING SCAN</div>`;
        if (qrCodeImage) {
            content += `<img src="${qrCodeImage}" alt="QR" style="border-radius: 15px; margin: 20px 0; width: 85%;">`;
            script = `setTimeout(() => location.reload(), 5000);`; 
        } else {
            content += `<p style="color:#00d2ff;">Generating Engine Protocols...</p>`;
            script = `setTimeout(() => location.reload(), 3000);`;
        }
    } else {
        content += `<div class="status online">STATUS: SYSTEM ONLINE</div>`;
        content += `<hr><h3 style="font-weight:300; font-size:1.2em; color:#aaa;">Test Transmission</h3>
        <form id="testMsgForm" onsubmit="sendTestMessage(event)">
            <input type="number" id="testNumber" placeholder="919876543210 (Country Code Req)" required>
            <input type="text" id="testMsg" placeholder="Enter message payload..." required>
            <button type="submit" style="background: linear-gradient(135deg, #00ff88 0%, #00c3ff 100%);">Dispatch</button>
        </form><hr>`;
        content += `<form action="/generate-key" method="POST"><button type="submit">Generate Web API Key</button></form>`;
        if (validApiKey) {
            content += `<p style="font-size: 12px; color: #888;">M-TECH AUTHORIZED KEY:</p><div class="api-key-box">${validApiKey}</div>`;
        }
        script = `
        async function sendTestMessage(e) {
            e.preventDefault();
            const btn = e.target.querySelector('button');
            const orig = btn.innerText;
            btn.innerText = 'DISPATCHING...';
            try {
                const res = await fetch('/api/send-message-internal', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ number: document.getElementById('testNumber').value, message: document.getElementById('testMsg').value })
                });
                const data = await res.json();
                if(data.success) showToast(data.message); else showToast(data.error, true);
            } catch (err) { showToast('Network link severed.', true); } 
            finally { btn.innerText = orig; document.getElementById('testMsg').value = ''; }
        }`;
    }
    res.send(renderUI(content, script));
});

app.post('/generate-key', (req, res) => {
    if (!req.session.isLoggedIn) return res.status(401).send('Unauthorized');
    validApiKey = crypto.randomBytes(32).toString('hex');
    res.redirect('/dashboard');
});

app.post('/api/send-message-internal', async (req, res) => {
    if (!req.session.isLoggedIn) return res.status(401).json({ error: 'Unauthorized Access' });
    if (!isReady) return res.status(503).json({ error: 'Engine Offline' });
    try {
        await client.sendMessage(`${req.body.number}@c.us`, req.body.message);
        res.json({ success: true, message: 'Transmission Successful!' });
    } catch (err) { res.status(500).json({ error: 'Transmission Failed.' }); }
});

app.post('/api/send-message', async (req, res) => {
    const { apiKey, number, message } = req.body;
    if (!validApiKey || apiKey !== validApiKey) return res.status(403).json({ error: 'Invalid API Key' });
    if (!isReady) return res.status(503).json({ error: 'Engine Offline' });
    try {
        await client.sendMessage(`${number}@c.us`, message);
        res.json({ success: true, message: 'Transmission Successful!' });
    } catch (err) { res.status(500).json({ error: 'Transmission Failed.' }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`\nServer Initialized on Port ${PORT}`); });
