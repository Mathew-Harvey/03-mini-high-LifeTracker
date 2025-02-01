const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = "your_jwt_secret_here";  // Replace with a secure secret or use an environment variable

app.use(cors());
app.use(bodyParser.json());

// MongoDB connection details
const uri = "mongodb+srv://mathewharvey:Bongos4u@lifeinweekscluster.atuq9hl.mongodb.net/?retryWrites=true&w=majority&appName=LifeInWeeksCluster";
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let db;
client.connect()
  .then(() => {
    db = client.db("lifeTracker"); // database name
    console.log("Connected to MongoDB");
  })
  .catch(err => console.error(err));

/* ---------------- Middleware ---------------- */
// Middleware to verify JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  // Expected format: "Bearer <token>"
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user; // contains id (a string) and email
    next();
  });
}

/* ---------------- Endpoints ---------------- */

// Registration endpoint
app.post('/api/register', async (req, res) => {
  const { email, password, birthDate } = req.body;
  if (!email || !password || !birthDate) {
    return res.status(400).json({ error: "Missing fields" });
  }
  try {
    const usersCollection = db.collection("users");
    const existing = await usersCollection.findOne({ email });
    if (existing) return res.status(400).json({ error: "User already exists" });
    const hashedPassword = await bcrypt.hash(password, 10);
    const userDoc = { email, password: hashedPassword, birthDate };
    const result = await usersCollection.insertOne(userDoc);
    // Create JWT token with owner id as a string
    const token = jwt.sign({ id: result.insertedId.toString(), email }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Missing fields" });
  try {
    const usersCollection = db.collection("users");
    const user = await usersCollection.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: "Invalid credentials" });
    // Sign token using the string version of user._id
    const token = jwt.sign({ id: user._id.toString(), email }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, birthDate: user.birthDate });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// Save an event
app.post('/api/event', authenticateToken, async (req, res) => {
  const { title, color, startDate, endDate, startWeek, endWeek } = req.body;
  if (!title || !color || !startDate || !endDate || startWeek == null || endWeek == null) {
    return res.status(400).json({ error: "Missing fields" });
  }
  try {
    const eventsCollection = db.collection("events");
    // Store owner as string
    const eventDoc = {
      owner: req.user.id.toString(),
      title,
      color,
      startDate,
      endDate,
      startWeek,
      endWeek
    };
    const result = await eventsCollection.insertOne(eventDoc);
    res.json({ event: { ...eventDoc, _id: result.insertedId } });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// Get events for the logged-in user
app.get('/api/events', authenticateToken, async (req, res) => {
  try {
    const eventsCollection = db.collection("events");
    const events = await eventsCollection.find({ owner: req.user.id.toString() }).toArray();
    res.json({ events });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// Delete an event by its id
app.delete('/api/event/:id', authenticateToken, async (req, res) => {
  const eventId = req.params.id;
  try {
    const eventsCollection = db.collection("events");
    const result = await eventsCollection.deleteOne({ _id: new ObjectId(eventId), owner: req.user.id.toString() });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Event not found" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// Optionally, serve static files from the "public" folder
app.use(express.static('public'));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
