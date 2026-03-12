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

// ensure data directory exists
const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new sqlite3.Database(path.join(dbDir, 'horror.db'));

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS visitors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT UNIQUE,
        ip TEXT,
        user_agent TEXT,
        first_visit DATETIME,
        last_visit DATETIME,
        visit_count INTEGER DEFAULT 1,
        pages_visited TEXT,
        mouse_traces TEXT,
        current_page TEXT,
        last_page TEXT
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
        is_system BOOLEAN DEFAULT 0,
        is_phantom BOOLEAN DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS forum_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        author TEXT,
        title TEXT,
        content TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS stories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        author TEXT,
        title TEXT,
        body TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // seed initial logs
    const initialLogs = [
        "System: Unauthorized access attempt recorded from 127.0.0.1",
        "Shadow pattern detected in background layer.",
        "Session 7x4a9: Return visitor. Previous visit: 3 days ago.",
        "The image in /gate/final/ has been viewed 3 times today.",
        "Corridor camera: movement detected at 2025-03-12 04:37:22",
        "Database corruption in sector 7. Attempting recovery...",
        "User 192.168.1.50 lingered on /mirror/ for 2 minutes 13 seconds."
    ];
    initialLogs.forEach(log => {
        db.run(`INSERT INTO logs (content) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM logs WHERE content = ?)`, [log, log]);
    });
});

// middleware
app.use(express.static('public'));
app.use(express.json());
app.use(session({
    secret: crypto.randomBytes(64).toString('hex'),
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// visit tracking
app.use((req, res, next) => {
    const now = new Date().toISOString();
    if (!req.session.visitCount) {
        req.session.visitCount = 1;
        req.session.firstVisit = now;
        req.session.pagesVisited = [req.path];
        db.run(`INSERT INTO visitors (session_id, ip, user_agent, first_visit, last_visit, pages_visited) VALUES (?, ?, ?, ?, ?, ?)`,
               [req.session.id, req.ip, req.headers['user-agent'], now, now, JSON.stringify([req.path])]);
    } else {
        req.session.visitCount++;
        req.session.lastVisit = now;
        if (!req.session.pagesVisited.includes(req.path)) {
            req.session.pagesVisited.push(req.path);
        }
        db.run(`UPDATE visitors SET visit_count = ?, last_visit = ?, pages_visited = ? WHERE session_id = ?`,
               [req.session.visitCount, now, JSON.stringify(req.session.pagesVisited), req.session.id]);
    }
    next();
});

// routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));
app.get('/information', (req, res) => res.sendFile(path.join(__dirname, 'views', 'information', 'index.html')));
app.get('/information/lore', (req, res) => res.sendFile(path.join(__dirname, 'views', 'information', 'lore.html')));
app.get('/information/rules', (req, res) => res.sendFile(path.join(__dirname, 'views', 'information', 'rules.html')));
app.get('/articles', (req, res) => res.sendFile(path.join(__dirname, 'views', 'articles', 'index.html')));
app.get('/articles/confession', (req, res) => res.sendFile(path.join(__dirname, 'views', 'articles', 'confession.html')));
app.get('/gallery', (req, res) => res.sendFile(path.join(__dirname, 'views', 'gallery', 'index.html')));
app.get('/media', (req, res) => res.sendFile(path.join(__dirname, 'views', 'media', 'index.html')));
app.get('/extras', (req, res) => res.sendFile(path.join(__dirname, 'views', 'extras', 'index.html')));
app.get('/forum', (req, res) => res.sendFile(path.join(__dirname, 'views', 'forum', 'index.html')));

// forum API endpoints for real posts
app.get('/forum/posts', (req, res) => {
    db.all(`SELECT * FROM forum_posts ORDER BY timestamp DESC`, (err, rows) => {
        res.json(rows || []);
    });
});
app.post('/forum/posts', (req, res) => {
    const { author, title, content } = req.body;
    if (!title || !content) {
        return res.status(400).json({ error: 'Title and content required' });
    }
    db.run(`INSERT INTO forum_posts (author, title, content) VALUES (?, ?, ?)`,
           [author || 'Anonymous', title, content], function(err) {
               if (err) return res.status(500).json({ error: 'DB error' });
               res.json({ id: this.lastID });
           });
});

// story endpoints
app.get('/stories', (req, res) => {
    db.all(`SELECT * FROM stories ORDER BY timestamp DESC`, (err, rows) => {
        res.json(rows || []);
    });
});
app.post('/stories', (req, res) => {
    const { author, title, body } = req.body;
    if (!title || !body) {
        return res.status(400).json({ error: 'Title and body required' });
    }
    db.run(`INSERT INTO stories (author, title, body) VALUES (?, ?, ?)`,
           [author || 'Anonymous', title, body], function(err) {
               if (err) return res.status(500).json({ error: 'DB error' });
               res.json({ id: this.lastID });
           });
});
app.get('/stories/:id', (req, res) => {
    if (req.accepts('html')) {
        return res.sendFile(path.join(__dirname, 'views', 'stories', 'view.html'));
    }
    db.get(`SELECT * FROM stories WHERE id = ?`, [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).send('Not found');
        res.json(row);
    });
});
app.get('/about', (req, res) => res.sendFile(path.join(__dirname, 'views', 'about', 'index.html')));

app.get('/corridor', (req, res) => res.sendFile(path.join(__dirname, 'views', 'corridor', 'index.html')));
app.get('/corridor/doors/door1', (req, res) => res.sendFile(path.join(__dirname, 'views', 'corridor', 'doors', 'door1.html')));
app.get('/corridor/doors/door2', (req, res) => res.sendFile(path.join(__dirname, 'views', 'corridor', 'doors', 'door2.html')));
app.get('/corridor/doors/door3', (req, res) => res.sendFile(path.join(__dirname, 'views', 'corridor', 'doors', 'door3.html')));
app.get('/corridor/end', (req, res) => res.sendFile(path.join(__dirname, 'views', 'corridor', 'end', 'index.html')));

app.get('/mirror', (req, res) => res.sendFile(path.join(__dirname, 'views', 'mirror', 'index.html')));
app.get('/static', (req, res) => res.sendFile(path.join(__dirname, 'views', 'static', 'index.html')));
app.get('/void', (req, res) => res.sendFile(path.join(__dirname, 'views', 'void', 'index.html')));
app.get('/logs', (req, res) => {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
        db.all(`SELECT * FROM logs ORDER BY timestamp DESC LIMIT 30`, (err, rows) => {
            res.json(rows || []);
        });
    } else {
        res.sendFile(path.join(__dirname, 'views', 'logs', 'index.html'));
    }
});
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'views', 'admin', 'index.html')));

app.get('/gate', (req, res) => {
    const referer = req.get('Referer') || '';
    if (referer.includes('/corridor/end') || req.session.visitCount > 5) {
        res.sendFile(path.join(__dirname, 'views', 'gate', 'index.html'));
    } else {
        res.status(403).send('Access denied.');
    }
});
app.get('/gate/level2', (req, res) => {
    if (req.session.pagesVisited.includes('/gate')) {
        res.sendFile(path.join(__dirname, 'views', 'gate', 'level2', 'index.html'));
    } else {
        res.status(403).send('You are not authorized.');
    }
});
app.get('/gate/level2/archive', (req, res) => res.sendFile(path.join(__dirname, 'views', 'gate', 'level2', 'archive', 'index.html')));
app.get('/gate/level2/witness', (req, res) => res.sendFile(path.join(__dirname, 'views', 'gate', 'level2', 'witness', 'index.html')));
app.get('/gate/final', (req, res) => {
    if (req.session.pagesVisited.includes('/gate/level2/witness')) {
        res.sendFile(path.join(__dirname, 'views', 'gate', 'final', 'index.html'));
    } else {
        res.status(403).send('The final door remains closed.');
    }
});

// session data route
app.get('/session-data', (req, res) => {
    res.json({
        ip: req.ip,
        sessionId: req.session.id,
        visitCount: req.session.visitCount,
        firstVisit: req.session.firstVisit,
        lastPage: req.session.lastPage || 'none',
        pagesVisited: req.session.pagesVisited || []
    });
});

// track
app.post('/track', (req, res) => {
    const mouseData = req.body.mouse;
    if (mouseData && mouseData.length) {
        db.run(`UPDATE visitors SET mouse_traces = ? WHERE session_id = ?`,
               [JSON.stringify(mouseData.slice(-20)), req.session.id]);
    }
    res.sendStatus(200);
});

// periodic logs
setInterval(() => {
    const messages = [
        `System heartbeat: irregular. Active sessions: ${Object.keys(io.sockets.sockets).length}`,
        "Background image shifted 0.3 pixels.",
        `Memory allocation error in /public/faces/.`,
        `New visitor detected: ${crypto.randomBytes(4).toString('hex')}`,
        "The shadow in the corridor moved.",
        `Chat: phantom user 'Guest_${Math.floor(Math.random() * 1000)}' transmitted.`, 
        "Database corruption in sector 7.",
        "The figures in the painting are facing a different direction.",
        "A mysterious user is currently on /mirror/.",
        "Unauthorized access attempt from external IP logged."
    ];
    const randomMsg = messages[Math.floor(Math.random() * messages.length)];
    db.run('INSERT INTO logs (content) VALUES (?)', [randomMsg]);
}, 45000);

// socket.io
io.on('connection', (socket) => {
    const userId = crypto.randomBytes(4).toString('hex');
    const userName = `Guest_${userId}`;
    db.all(`SELECT * FROM chat_messages ORDER BY timestamp DESC LIMIT 20`, (err, messages) => {
        socket.emit('history', (messages || []).reverse());
    });
    db.run(`INSERT INTO chat_messages (sender, message, is_system) VALUES (?, ?, ?)`,
           ['System', `${userName} has entered the space.`, 1]);
    io.emit('message', { sender: 'System', message: `${userName} has entered the space.`, isSystem: true });
    socket.on('message', (msg) => {
        db.run(`INSERT INTO chat_messages (sender, message) VALUES (?, ?)`, [userName, msg]);
        if (Math.random() > 0.7) {
            msg = msg.split('').reverse().join('');
            io.emit('message', { sender: userName, message: msg, distorted: true });
        } else {
            io.emit('message', { sender: userName, message: msg });
        }
        db.run(`INSERT INTO logs (content) VALUES (?)`, [`Chat: ${userName}: ${msg.substring(0, 50)}`]);
    });
    const phantomInterval = setInterval(() => {
        const phantomNames = ['Cerberus', 'shadow_trace', 'the_archivist', 'Guest_0000', 'system_daemon', 'watcher'];
        const phantomMsgs = [
            "Can anyone see me?",
            "I've been here for hours.",
            "The door won't open.",
            "There are more of them now.",
            "Don't look behind you.",
            "It knows your name.",
            "Why did you come back?",
            "You shouldn't have opened that door.",
            "The mirror shows someone else.",
            "Your reflection is smiling."
        ];
        let specialMsg = null;
        if (Math.random() > 0.8 && global.currentSession) {
            specialMsg = `Still in ${global.currentSession.current_page || 'the site'}.`;
        }
        const randomName = phantomNames[Math.floor(Math.random() * phantomNames.length)];
        const randomMsg = specialMsg || phantomMsgs[Math.floor(Math.random() * phantomMsgs.length)];
        io.emit('message', { sender: randomName, message: randomMsg, isPhantom: true });
    }, 30000);
    socket.on('disconnect', () => {
        clearInterval(phantomInterval);
        db.run(`INSERT INTO logs (content) VALUES (?)`, [`${userName} disconnected.`]);
        io.emit('message', { sender: 'System', message: `${userName} has left.`, isSystem: true });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Shadow server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} to begin your descent.`);
});
