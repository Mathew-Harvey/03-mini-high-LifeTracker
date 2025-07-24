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
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

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
  CREATE TABLE IF NOT EXISTS public_charts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner INTEGER NOT NULL,
    ownerName TEXT NOT NULL,
    chartTitle TEXT NOT NULL,
    imageData TEXT NOT NULL,
    chartData TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    FOREIGN KEY(owner) REFERENCES users(id)
  );
`);

// Create system user for celebrity charts if it doesn't exist
try {
  const systemUser = db.prepare('SELECT id FROM users WHERE id = -1').get();
  if (!systemUser) {
    db.prepare('INSERT INTO users (id, email, password, birthDate, createdAt) VALUES (?, ?, ?, ?, ?)')
      .run(-1, 'system@lifetracker.internal', 'no_password_hash', '1900-01-01', new Date().toISOString());
  }
} catch (err) {
  // Ignore duplicate key errors on startup
  if (!err.message.includes('UNIQUE constraint failed')) {
    console.error('Error creating system user:', err);
  }
}

// Shared function to create proper life chart images for celebrity presets
const createChartPlaceholder = (preset) => {
  const name = preset.name;
  const events = preset.lifeEvents || [];
  const birthDate = new Date(preset.dob);
  const deathDate = preset.deathDate ? new Date(preset.deathDate) : new Date();
  
  // Calculate weeks lived and grid dimensions
  const msPerWeek = 1000 * 60 * 60 * 24 * 7;
  const totalWeeks = 90 * 52; // 90 years * 52 weeks
  const weeksLived = Math.floor((deathDate - birthDate) / msPerWeek);
  const fullWeeks = Math.min(weeksLived, totalWeeks);
  
  // Calculate birth week position in the year
  const startOfBirthYear = new Date(birthDate.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((birthDate - startOfBirthYear) / (1000 * 60 * 60 * 24)) + 1;
  const startDayOfWeek = startOfBirthYear.getDay();
  const birthWeekInYear = Math.min(Math.floor((dayOfYear - 1 + startDayOfWeek) / 7), 51);
  
  // Grid configuration - larger for better visibility
  const cellWidth = 14;
  const cellHeight = 8;
  const monthGap = 6;
  const yearGap = 12;
  const monthWeeks = [4,4,5,4,4,5,4,4,5,4,4,5];
  const gridStartX = 100;
  const gridStartY = 140;
  
  // Calculate grid positions with gaps
  const getGridPosition = (weekInYear, year) => {
    let x = gridStartX;
    let currentWeek = 0;
    
    // Calculate x position with month gaps
    for (let month = 0; month < 12; month++) {
      if (weekInYear < currentWeek + monthWeeks[month]) {
        x += (weekInYear - currentWeek) * (cellWidth + 1);
        break;
      }
      x += monthWeeks[month] * (cellWidth + 1) + monthGap;
      currentWeek += monthWeeks[month];
    }
    
    // Calculate y position with decade gaps
    const decade = Math.floor(year / 10);
    const yearInDecade = year % 10;
    const y = gridStartY + decade * (10 * (cellHeight + 1) + yearGap) + yearInDecade * (cellHeight + 1);
    
    return { x, y };
  };
  
  // Create month labels
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let monthLabelSvg = '';
  let currentX = gridStartX;
  for (let month = 0; month < 12; month++) {
    const weekSpan = monthWeeks[month];
    const labelX = currentX + (weekSpan * (cellWidth + 1)) / 2;
    monthLabelSvg += `<text x="${labelX}" y="${gridStartY - 10}" font-family="Arial, sans-serif" font-size="10" font-weight="500" text-anchor="middle" fill="#555">${monthLabels[month]}</text>`;
    currentX += weekSpan * (cellWidth + 1) + monthGap;
  }
  
  // Create decade labels
  let decadeLabelSvg = '';
  const birthYear = birthDate.getFullYear();
  for (let decade = 0; decade < 9; decade++) {
    const startYear = birthYear + decade * 10;
    const endYear = startYear + 9;
    const y = gridStartY + decade * (10 * (cellHeight + 1) + yearGap) + (5 * (cellHeight + 1));
    decadeLabelSvg += `<text x="${gridStartX - 15}" y="${y}" font-family="Arial, sans-serif" font-size="10" font-weight="500" text-anchor="end" fill="#555">${startYear}–${endYear}</text>`;
  }
  
  // Create grid cells with proper shading - match client-side exactly
  let gridSvg = '';
  
  for (let gridIndex = 0; gridIndex < totalWeeks; gridIndex++) {
    const year = Math.floor(gridIndex / 52);
    const weekInYear = gridIndex % 52;
    
    // Check if this cell represents a lived week
    const lifeWeek = gridIndex - birthWeekInYear;
    const isLived = lifeWeek >= 0 && lifeWeek < fullWeeks;
    const color = isLived ? '#4cc9f0' : '#e9ecef';
    
    const pos = getGridPosition(weekInYear, year);
    gridSvg += `<rect x="${pos.x}" y="${pos.y}" width="${cellWidth}" height="${cellHeight}" fill="${color}" stroke="#eaeaea" stroke-width="0.5"/>`;
  }
  
  // Create event overlays with colors - use same logic as client-side
  const presetColors = ['#4361ee', '#3a0ca3', '#7209b7', '#f72585', '#4cc9f0', '#4895ef', '#560bad', '#b5179e', '#f15bb5', '#fee440'];
  let eventSvg = '';
  let eventLegendSvg = '';
  
  // Helper functions for color contrast (same as client-side)
  const hexToRgb = (hex) => {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    const num = parseInt(hex, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  };
  
  const colorDistance = (hex1, hex2) => {
    const c1 = hexToRgb(hex1);
    const c2 = hexToRgb(hex2);
    return Math.sqrt(
      Math.pow(c1.r - c2.r, 2) +
      Math.pow(c1.g - c2.g, 2) +
      Math.pow(c1.b - c2.b, 2)
    );
  };
  
  const getContrastingColor = (prevColor) => {
    const contrastThreshold = 100;
    for (let i = 0; i < presetColors.length; i++) {
      if (colorDistance(prevColor, presetColors[i]) >= contrastThreshold) {
        return presetColors[i];
      }
    }
    return presetColors[0];
  };
  
  // Sort events by start date
  const sortedEvents = events.slice().sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  

  
  let prevEventColor = null;
  let prevEventEndWeek = null;
  
  sortedEvents.forEach((event, index) => {
    const eventStart = new Date(event.startDate);
    let eventEnd;
    if (!event.endDate || event.endDate === "") {
      eventEnd = deathDate; // Use current date or death date
    } else {
      eventEnd = new Date(event.endDate);
    }
    
    // Use exact same calculation as client-side
    const startWeek = Math.floor((eventStart - birthDate) / msPerWeek);
    const endWeek = (eventStart.getTime() === eventEnd.getTime())
                    ? startWeek + 1
                    : Math.ceil((eventEnd - birthDate) / msPerWeek);
    
    // Use same color assignment logic as client-side
    let color;
    if (prevEventColor !== null && startWeek === prevEventEndWeek) {
      color = getContrastingColor(prevEventColor);
    } else {
      color = presetColors[index % presetColors.length];
    }
    prevEventColor = color;
    prevEventEndWeek = endWeek;
    
         // Draw event overlay on grid - use exact same iteration as grid generation
     for (let lifeWeek = startWeek; lifeWeek < endWeek; lifeWeek++) {
       if (lifeWeek >= 0) {
         // Use same lifeWeekToGridIndex logic: birthWeekInYear + lifeWeek
         const gridIndex = birthWeekInYear + lifeWeek;
         
         if (gridIndex >= 0 && gridIndex < totalWeeks) {
           const ageYear = Math.floor(gridIndex / 52);
           const weekInYear = gridIndex % 52;
           
           if (ageYear < 90 && weekInYear < 52) {
             const pos = getGridPosition(weekInYear, ageYear);
             // Make event overlay fully visible and opaque
             eventSvg += `<rect x="${pos.x}" y="${pos.y}" width="${cellWidth}" height="${cellHeight}" fill="${color}" opacity="1.0"/>`;
             if (index === 0 && lifeWeek === startWeek) {
               eventSvg += `<circle cx="${pos.x + cellWidth/2}" cy="${pos.y + cellHeight/2}" r="3" fill="white" stroke="black" stroke-width="1"/>`;
             }
           }
         }
       }
     }
     
     // Add to legend (limit to first 12 events)
     if (index < 12) {
       const legendY = 750 + index * 20;
       eventLegendSvg += `
         <rect x="100" y="${legendY}" width="14" height="8" fill="${color}"/>
         <text x="120" y="${legendY + 12}" font-family="Arial, sans-serif" font-size="12" fill="#333">${event.title.length > 50 ? event.title.substring(0, 47) + '...' : event.title}</text>
       `;
     }
  });
  
  // Add death marker if applicable
  let deathMarkerSvg = '';
  if (preset.deathDate) {
    const deathLifeWeek = Math.floor((new Date(preset.deathDate) - birthDate) / msPerWeek);
    if (deathLifeWeek >= 0) {
      // Use same lifeWeekToGridIndex logic
      const gridIndex = birthWeekInYear + deathLifeWeek;
      
      if (gridIndex >= 0 && gridIndex < totalWeeks) {
        const year = Math.floor(gridIndex / 52);
        const weekInYear = gridIndex % 52;
        
        if (year < 90 && weekInYear < 52) {
          const pos = getGridPosition(weekInYear, year);
          deathMarkerSvg = `<text x="${pos.x + cellWidth/2}" y="${pos.y + cellHeight/2 + 4}" font-family="Arial, sans-serif" font-size="12" text-anchor="middle" fill="#000">💀</text>`;
        }
      }
    }
  }
  
  const svg = `<svg width="1400" height="${1100 + Math.min(sortedEvents.length, 12) * 20}" xmlns="http://www.w3.org/2000/svg">
    <rect width="1400" height="${1100 + Math.min(sortedEvents.length, 12) * 20}" fill="#fafafa"/>
    
    <!-- Title -->
    <text x="700" y="40" font-family="Arial, sans-serif" font-size="32" font-weight="bold" text-anchor="middle" fill="#333">${name}'s Life in Weeks</text>
    <text x="700" y="70" font-family="Arial, sans-serif" font-size="16" text-anchor="middle" fill="#666">by ${name} • ${new Date().toLocaleDateString()}</text>
    
    <!-- Month labels -->
    ${monthLabelSvg}
    
    <!-- Decade labels -->
    ${decadeLabelSvg}
    
    <!-- Grid cells -->
    ${gridSvg}
    
    <!-- Event overlays -->
    ${eventSvg}
    
    <!-- Death marker -->
    ${deathMarkerSvg}
    
    <!-- Legend -->
    <text x="100" y="730" font-family="Arial, sans-serif" font-size="16" font-weight="600" fill="#333">Life Events (${Math.min(sortedEvents.length, 12)}${sortedEvents.length > 12 ? '+ more' : ''})</text>
    ${eventLegendSvg}
    
    <!-- Footer legend -->
    <g transform="translate(100, ${1040 + Math.min(sortedEvents.length, 12) * 20})">
      <rect x="0" y="0" width="14" height="8" fill="#4cc9f0" stroke="#eaeaea" stroke-width="0.5"/>
      <text x="25" y="12" font-family="Arial, sans-serif" font-size="14" fill="#333">Lived weeks</text>
             <rect x="150" y="0" width="14" height="8" fill="#e9ecef" stroke="#eaeaea" stroke-width="0.5"/>
       <text x="175" y="12" font-family="Arial, sans-serif" font-size="14" fill="#333">Not yet lived</text>
      ${sortedEvents.length > 0 ? `
        <rect x="300" y="1" width="12" height="6" fill="#4361ee" opacity="0.8"/>
        <text x="325" y="12" font-family="Arial, sans-serif" font-size="14" fill="#333">Life events</text>
      ` : ''}
    </g>
  </svg>`;
  
  const base64 = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
};

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

// Public Charts Endpoints
app.post('/api/make-public', authenticateToken, async (req, res) => {
  const { chartTitle, imageData, chartData, ownerName } = req.body;
  if (!chartTitle || !imageData || !chartData || !ownerName) {
    return res.status(400).json({ error: "All fields are required" });
  }
  try {
    const now = new Date().toISOString();
    // Check if user already has a public chart - if so, update it
    const existing = db.prepare('SELECT * FROM public_charts WHERE owner = ?').get(req.user.id);
    if (existing) {
      db.prepare(`UPDATE public_charts SET ownerName = ?, chartTitle = ?, imageData = ?, chartData = ?, createdAt = ? WHERE owner = ?`)
        .run(ownerName, chartTitle, imageData, chartData, now, req.user.id);
      res.json({ success: true, message: "Public chart updated" });
    } else {
      const result = db.prepare(`INSERT INTO public_charts (owner, ownerName, chartTitle, imageData, chartData, createdAt) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(req.user.id, ownerName, chartTitle, imageData, chartData, now);
      res.status(201).json({ success: true, message: "Chart made public", id: result.lastInsertRowid });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to make chart public" });
  }
});

app.get('/api/user-public-status', authenticateToken, async (req, res) => {
  try {
    const publicChart = db.prepare('SELECT id FROM public_charts WHERE owner = ?').get(req.user.id);
    res.json({ hasPublicChart: !!publicChart });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to check public status" });
  }
});



app.delete('/api/remove-public', authenticateToken, async (req, res) => {
  try {
    const result = db.prepare('DELETE FROM public_charts WHERE owner = ?').run(req.user.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: "No public chart found" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to remove public chart" });
  }
});

// Seed celebrity charts endpoint (no auth required for seeding)
app.post('/api/seed-celebrity-charts', async (req, res) => {
  try {
    const fs = require('fs');
    const celebPresets = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'celebPresets.json'), 'utf8'));
    
    const now = new Date().toISOString();
    let seededCount = 0;
    
    // Ensure system user exists before seeding
    const systemUser = db.prepare('SELECT id FROM users WHERE id = -1').get();
    if (!systemUser) {
      try {
        db.prepare('INSERT INTO users (id, email, password, birthDate, createdAt) VALUES (?, ?, ?, ?, ?)')
          .run(-1, 'system@lifetracker.internal', 'no_password_hash', '1900-01-01', now);
      } catch (insertErr) {
        console.error('Failed to create system user:', insertErr);
        return res.status(500).json({ error: "Failed to create system user for celebrity charts" });
      }
    }

    celebPresets.forEach(preset => {
      try {
        // Check if this celebrity chart already exists
        const existing = db.prepare('SELECT * FROM public_charts WHERE ownerName = ? AND chartTitle = ?')
          .get(preset.name, `${preset.name}'s Life in Weeks`);
        
        if (!existing) {
          const imageData = createChartPlaceholder(preset);
          const chartData = JSON.stringify({
            birthDate: preset.dob,
            deathDate: preset.deathDate || null,
            events: preset.lifeEvents,
            isPresetMode: true
          });
          
          db.prepare(`INSERT INTO public_charts (owner, ownerName, chartTitle, imageData, chartData, createdAt) VALUES (?, ?, ?, ?, ?, ?)`)
            .run(-1, preset.name, `${preset.name}'s Life in Weeks`, imageData, chartData, now);
          seededCount++;
        }
      } catch (presetErr) {
        console.error(`Failed to seed celebrity chart for ${preset.name}:`, presetErr);
        // Continue with other presets instead of failing completely
      }
    });
    
    res.json({ success: true, seededCount, message: `Seeded ${seededCount} celebrity charts` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to seed celebrity charts" });
  }
});

// Modified public charts endpoint to include celebrity charts
app.get('/api/public-charts', authenticateToken, async (req, res) => {
  try {
    // First check if user has made their chart public
    const userPublicChart = db.prepare('SELECT id FROM public_charts WHERE owner = ?').get(req.user.id);
    if (!userPublicChart) {
      return res.status(403).json({ error: "You must make your chart public to view others", requiresPublic: true });
    }
    
    // Get all public charts including celebrity charts (owner = -1)
    const publicCharts = db.prepare('SELECT id, owner, ownerName, chartTitle, imageData, chartData, createdAt FROM public_charts ORDER BY CASE WHEN owner = -1 THEN 0 ELSE 1 END, createdAt DESC').all();
    
    // For celebrity charts, ensure they have proper chartData with events
    const processedCharts = publicCharts.map(chart => {
      if (chart.owner === -1) { // Celebrity chart
        try {
          const chartData = JSON.parse(chart.chartData);
          // Ensure the chart has events data
          if (chartData && chartData.events && chartData.events.length > 0) {
            return chart; // Chart already has proper data
          } else {
            return null;
          }
        } catch (e) {
          console.error(`Error parsing chart data for ${chart.ownerName}:`, e);
          return null;
        }
      }
      return chart;
    }).filter(Boolean);
    
    res.json({ publicCharts: processedCharts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to retrieve public charts" });
  }
});

// Endpoint to regenerate celebrity charts with proper images
app.post('/api/regenerate-celebrity-charts', authenticateToken, async (req, res) => {
  try {
    const celebPresets = require('./public/celebPresets.json');
    let updatedCount = 0;
    
    for (const preset of celebPresets) {
      try {
        // Create new image with events
        const imageData = createChartPlaceholder(preset);
        
        // Update the chart data to ensure it has proper events
        const chartData = JSON.stringify({
          birthDate: preset.dob,
          deathDate: preset.deathDate || null,
          events: preset.lifeEvents,
          isPresetMode: true
        });
        
        // Update existing celebrity chart with both new image and data
        const result = db.prepare(`UPDATE public_charts SET imageData = ?, chartData = ? WHERE ownerName = ? AND chartTitle = ?`)
          .run(imageData, chartData, preset.name, `${preset.name}'s Life in Weeks`);
        
        if (result.changes > 0) {
          updatedCount++;
        }
      } catch (presetErr) {
        console.error(`Failed to update celebrity chart for ${preset.name}:`, presetErr);
      }
    }
    
    res.json({ success: true, updatedCount, message: `Updated ${updatedCount} celebrity charts with proper images and events` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to regenerate celebrity charts" });
  }
});

app.get('/celebPresets.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'celebPresets.json'));
});

// Gallery route
app.get('/gallery', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'gallery.html'));
});

// Serve the landing page as the default route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// Serve the main app at /app route
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Static file serving for other assets (CSS, JS, images, etc.)
app.use(express.static('public'));

// Catch-all route for any other requests
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});