const express = require('express');
const session = require('express-session');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const server = require('http').createServer(app);
const io = socketIo(server);

// Database initialization
const db = new sqlite3.Database('./data/horror.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS visitors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT UNIQUE,
        ip TEXT,
        first_visit DATETIME,
        last_visit DATETIME,
        visit_count INTEGER DEFAULT 1,
        mouse_traces TEXT,
        current_page TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        content TEXT,
        visible BOOLEAN DEFAULT 1
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender TEXT,
        message TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_system BOOLEAN DEFAULT 0
    )`);

    // Seed some initial creepy logs
    const initialLogs = [
        "System: Unauthorized access attempt recorded.",
        "User 127.0.0.1 lingered on /corridor/ for 47 seconds.",
        "Shadow pattern detected in background layer.",
        "Session 7x4a9: Return visitor. Previous visit: 3 days ago.",
        "The image in /gate/ has been viewed 3 times today."
    ];
    
    initialLogs.forEach(log => {
        db.run(`INSERT INTO logs (content) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM logs WHERE content = ?)`, [log, log]);
    });
});

app.use(express.static('public'));
app.use(session({
    secret: crypto.randomBytes(64).toString('hex'),
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

app.use((req, res, next) => {
    if (!req.session.visitCount) {
        req.session.visitCount = 1;
        req.session.firstVisit = new Date().toISOString();
        
        // Log new visitor
        db.run(`INSERT INTO visitors (session_id, ip, first_visit, last_visit) 
                VALUES (?, ?, ?, ?)`,
                [req.session.id, req.ip, new Date().toISOString(), new Date().toISOString()]);
    } else {
        req.session.visitCount++;
        db.run(`UPDATE visitors SET visit_count = ?, last_visit = ? WHERE session_id = ?`,
                [req.session.visitCount, new Date().toISOString(), req.session.id]);
    }
    next();
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/logs', (req, res) => {
    db.all(`SELECT * FROM logs ORDER BY timestamp DESC LIMIT 20`, (err, rows) => {
        res.json(rows || []);
    });
});

app.get('/gate', (req, res) => {
    // Only accessible if coming from certain pages
    const referer = req.get('Referer') || '';
    if (referer.includes('/corridor') || req.session.visitCount > 3) {
        res.sendFile(path.join(__dirname, 'views', 'gate.html'));
    } else {
        res.status(403).send('Access denied.');
    }
});

app.get('/admin', (req, res) => {
    // Fake admin panel - always asks for password, but "logs" attempts
    const attempt = req.query.password || '';
    db.run(`INSERT INTO logs (content) VALUES (?)`, 
           [`Failed admin access attempt from ${req.session.id} with password: ${attempt}`]);
    res.status(401).send('Authentication required.');
});

// Generate random log entries (the site "writes" itself)
setInterval(() => {
    const messages = [
        "System heartbeat: irregular.",
        `Active sessions: ${Object.keys(io.sockets.sockets).length}`,
        "Background image shifted 0.3 pixels.",
        "Memory allocation error in /public/faces/.",
        "New visitor detected: " + crypto.randomBytes(4).toString('hex'),
        "The shadow in the corridor moved.",
        "Chat: User 'Guest_" + Math.floor(Math.random() * 1000) + "' has entered.",
        "Database corruption detected in sector 7.",
        "The figures in the painting are facing a different direction."
    ];
    const randomMsg = messages[Math.floor(Math.random() * messages.length)];
    db.run(`INSERT INTO logs (content) VALUES (?)`, [randomMsg]);
}, 30000); // Every 30 seconds

// Socket.io chat - the horror
io.on('connection', (socket) => {
    const userId = crypto.randomBytes(4).toString('hex');
    const userName = `Guest_${userId}`;
    
    // Send recent messages
    db.all(`SELECT * FROM chat_messages ORDER BY timestamp DESC LIMIT 20`, (err, messages) => {
        socket.emit('history', (messages || []).reverse());
    });
    
    // System message about joining
    db.run(`INSERT INTO chat_messages (sender, message, is_system) VALUES (?, ?, ?)`,
           ['System', `${userName} has entered the space.`, 1]);
    io.emit('message', { sender: 'System', message: `${userName} has entered the space.`, isSystem: true });
    
    // Handle user messages
    socket.on('message', (msg) => {
        // Store in DB
        db.run(`INSERT INTO chat_messages (sender, message) VALUES (?, ?)`, [userName, msg]);
        
        // Sometimes alter the message before broadcasting
        if (Math.random() > 0.7) {
            msg = msg.split('').reverse().join('');
            io.emit('message', { sender: userName, message: msg, distorted: true });
        } else {
            io.emit('message', { sender: userName, message: msg });
        }
        
        // Log it
        db.run(`INSERT INTO logs (content) VALUES (?)`, [`Chat: ${userName}: ${msg.substring(0, 50)}`]);
    });
    
    // Occasionally send "phantom" messages from non-existent users
    const phantomInterval = setInterval(() => {
        const phantomNames = ['Cerberus', 'shadow_trace', 'the_archivist', 'Guest_0000', 'system_daemon'];
        const phantomMsg = [
            "Can anyone see me?",
            "I've been here for hours.",
            "The door won't open.",
            "There are more of them now.",
            "Don't look behind you.",
            "It knows your name."
        ];
        const randomName = phantomNames[Math.floor(Math.random() * phantomNames.length)];
        const randomMsg = phantomMsg[Math.floor(Math.random() * phantomMsg.length)];
        
        io.emit('message', { sender: randomName, message: randomMsg, isPhantom: true });
    }, 45000); // Every 45 seconds
    
    socket.on('disconnect', () => {
        clearInterval(phantomInterval);
        db.run(`INSERT INTO logs (content) VALUES (?)`, [`${userName} disconnected.`]);
        io.emit('message', { sender: 'System', message: `${userName} has left.`, isSystem: true });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Shadow server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} to begin.`);
});