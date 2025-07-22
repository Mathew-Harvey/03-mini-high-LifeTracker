require('dotenv').config();

// Requires Node.js >=22.5.0 and must be run with --experimental-sqlite
const { DatabaseSync } = require('node:sqlite');
const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

app.use(cors());
app.use(bodyParser.json());

// Initialize SQLite DB using Node.js built-in module
const db = new DatabaseSync('lifeTracker.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    birthDate TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner INTEGER NOT NULL,
    title TEXT NOT NULL,
    color TEXT NOT NULL,
    startDate TEXT NOT NULL,
    endDate TEXT NOT NULL,
    startWeek INTEGER NOT NULL,
    endWeek INTEGER NOT NULL,
    createdAt TEXT NOT NULL,
    FOREIGN KEY(owner) REFERENCES users(id)
  );
`);

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: "Authentication required" });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid or expired token" });
    req.user = user;
    next();
  });
}

app.post('/api/register', async (req, res) => {
  const { email, password, birthDate } = req.body;
  if (!email || !password || !birthDate) {
    return res.status(400).json({ error: "All fields are required" });
  }
  try {
    const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (existing) return res.status(400).json({ error: "Email already registered" });
    const hashedPassword = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();
    const result = db.prepare('INSERT INTO users (email, password, birthDate, createdAt) VALUES (?, ?, ?, ?)').run(email, hashedPassword, birthDate, now);
    const userId = result.lastInsertRowid;
    const token = jwt.sign({ id: userId, email }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, birthDate });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error, please try again" });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password required" });
  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return res.status(400).json({ error: "Invalid email or password" });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: "Invalid email or password" });
    const token = jwt.sign({ id: user.id, email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, birthDate: user.birthDate });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error, please try again" });
  }
});

app.post('/api/event', authenticateToken, async (req, res) => {
  const { title, color, startDate, endDate, startWeek, endWeek } = req.body;
  if (!title || !color || !startDate || !endDate || startWeek == null || endWeek == null) {
    return res.status(400).json({ error: "All event fields are required" });
  }
  try {
    const now = new Date().toISOString();
    const result = db.prepare(`INSERT INTO events (owner, title, color, startDate, endDate, startWeek, endWeek, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(req.user.id, title, color, startDate, endDate, startWeek, endWeek, now);
    const event = {
      id: result.lastInsertRowid,
      owner: req.user.id,
      title,
      color,
      startDate,
      endDate,
      startWeek,
      endWeek,
      createdAt: now
    };
    res.status(201).json({ event });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save event" });
  }
});

app.get('/api/events', authenticateToken, async (req, res) => {
  try {
    const events = db.prepare('SELECT * FROM events WHERE owner = ?').all(req.user.id);
    res.json({ events });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to retrieve events" });
  }
});

app.delete('/api/event/:id', authenticateToken, async (req, res) => {
  const eventId = req.params.id;
  try {
    const result = db.prepare('DELETE FROM events WHERE id = ? AND owner = ?').run(eventId, req.user.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Event not found" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete event" });
  }
});

app.get('/celebPresets.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'celebPresets.json'));
});

app.use(express.static('public'));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});