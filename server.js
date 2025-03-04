require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const MONGO_URI = process.env.MONGO_URI;

app.use(cors());
app.use(bodyParser.json());

const client = new MongoClient(MONGO_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let db;
client.connect()
  .then(() => {
    db = client.db("lifeTracker");
    console.log("Connected to MongoDB");
  })
  .catch(err => console.error(err));

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
    const usersCollection = db.collection("users");
    const existing = await usersCollection.findOne({ email });
    if (existing) return res.status(400).json({ error: "Email already registered" });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const userDoc = { 
      email, 
      password: hashedPassword, 
      birthDate,
      createdAt: new Date()
    };
    const result = await usersCollection.insertOne(userDoc);
    
    const token = jwt.sign({ id: result.insertedId.toString(), email }, JWT_SECRET, { expiresIn: '7d' });
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
    const usersCollection = db.collection("users");
    const user = await usersCollection.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid email or password" });
    
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: "Invalid email or password" });
    
    const token = jwt.sign({ id: user._id.toString(), email }, JWT_SECRET, { expiresIn: '7d' });
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
    const eventsCollection = db.collection("events");
    const eventDoc = {
      owner: req.user.id.toString(),
      title,
      color,
      startDate,
      endDate,
      startWeek,
      endWeek,
      createdAt: new Date()
    };
    const result = await eventsCollection.insertOne(eventDoc);
    res.status(201).json({ event: { ...eventDoc, _id: result.insertedId } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save event" });
  }
});

app.get('/api/events', authenticateToken, async (req, res) => {
  try {
    const eventsCollection = db.collection("events");
    const events = await eventsCollection.find({ owner: req.user.id.toString() }).toArray();
    res.json({ events });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to retrieve events" });
  }
});

app.delete('/api/event/:id', authenticateToken, async (req, res) => {
  const eventId = req.params.id;
  try {
    const eventsCollection = db.collection("events");
    const result = await eventsCollection.deleteOne({ 
      _id: new ObjectId(eventId), 
      owner: req.user.id.toString() 
    });
    
    if (result.deletedCount === 0) {
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