/********* Global Variables & Settings *********/
const maxYears = 90;
const weeksPerYear = 52;
const totalWeeks = maxYears * weeksPerYear;
const msPerWeek = 1000 * 60 * 60 * 24 * 7;
const baseUrl = ""; // Assumes same domain/port as your Node server

/********* Custom Cursor from Landing Page *********/
let mouseX = 0, mouseY = 0;
let cursorX = 0, cursorY = 0;

function initCustomCursor() {
  const cursor = document.getElementById('cursor');
  if (!cursor) return;

  // Update mouse position
  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  // Animate cursor with smooth following
  function animateCursor() {
    const dx = mouseX - cursorX;
    const dy = mouseY - cursorY;
    
    cursorX += dx * 0.1;
    cursorY += dy * 0.1;
    
    cursor.style.transform = `translate(${cursorX - 20}px, ${cursorY - 20}px)`;
    
    requestAnimationFrame(animateCursor);
  }
  animateCursor();

  // Add hover effects for interactive elements
  const hoverElements = document.querySelectorAll('button, a, input, select, .week-inner, .legend-item, .choice-half');
  hoverElements.forEach(el => {
    el.addEventListener('mouseenter', () => cursor.classList.add('hover'));
    el.addEventListener('mouseleave', () => cursor.classList.remove('hover'));
  });
}

// For "My Life Chart"
let token = localStorage.getItem("token") || null;
let userBirthDate = localStorage.getItem("birthDate") || null;
const lifeEvents = []; // Personal events

// Global mode flag to distinguish between personal and preset mode.
let isPresetMode = false;
// Global variable for celebrity presets
let celebPresets = [];

// Global variable to store birth week for event mapping
let birthWeekInYear = 0;

/********* Notification System *********/
function showNotification(title, message, type = 'info', duration = 5000) {
  const container = document.getElementById('notificationContainer');
  if (!container) return;

  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  
  const icon = getNotificationIcon(type);
  
  notification.innerHTML = `
    <div class="notification-header">
      <div class="notification-title">
        <span class="notification-icon">${icon}</span>
        ${title}
      </div>
      <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
    </div>
    <div class="notification-message">${message}</div>
    <div class="notification-progress" style="width: 100%"></div>
  `;

  container.appendChild(notification);

  // Trigger animation
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);

  // Animate progress bar
  const progressBar = notification.querySelector('.notification-progress');
  if (progressBar) {
    setTimeout(() => {
      progressBar.style.width = '0%';
    }, 100);
  }

  // Auto remove after duration
  if (duration > 0) {
    setTimeout(() => {
      hideNotification(notification);
    }, duration);
  }

  return notification;
}

function hideNotification(notification) {
  if (!notification) return;
  
  notification.classList.add('hide');
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, 300);
}

function getNotificationIcon(type) {
  switch (type) {
    case 'success':
      return '✅';
    case 'error':
      return '❌';
    case 'warning':
      return '⚠️';
    case 'info':
    default:
      return 'ℹ️';
  }
}

/********* Helper function to convert life weeks to grid indices *********/
function lifeWeekToGridIndex(lifeWeek, birthWeekInYear) {
  return birthWeekInYear + lifeWeek; // Simple addition
}

/********* Helper function to calculate week position based on month structure *********/
function getWeekPositionFromDate(date) {
  // Calculate the actual week of the year (0-51) for standard calendar
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((date - startOfYear) / (1000 * 60 * 60 * 24)) + 1;
  
  // Find which day of the week January 1st falls on (0 = Sunday, 1 = Monday, etc.)
  const startDayOfWeek = startOfYear.getDay();
  
  // Calculate week number (0-51)
  // We need to adjust for the fact that the first week might be partial
  const weekNumber = Math.floor((dayOfYear - 1 + startDayOfWeek) / 7);
  
  // Cap at 51 since we have 52 weeks (0-51)
  const result = Math.min(weekNumber, 51);
  
  // DEBUG: Log calculation details
  console.log(`Week calculation for ${date.toDateString()}:`);
  console.log(`  Day of year: ${dayOfYear}`);
  console.log(`  Start day of week (Jan 1): ${startDayOfWeek}`);
  console.log(`  Calculated week: ${weekNumber}`);
  console.log(`  Final result: ${result}`);
  
  return result;
}

// Define a set of contrasting colors for preset events.
const presetColors = ["#4361ee", "#3a0ca3", "#7209b7", "#f72585", "#4cc9f0", "#4895ef", "#560bad", "#b5179e", "#f15bb5", "#fee440"];
const contrastThreshold = 100; // Minimum Euclidean distance between RGB values

/********* Helper Functions for Color Contrast *********/
function hexToRgb(hex) {
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
}
function colorDistance(hex1, hex2) {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  return Math.sqrt(
    Math.pow(c1.r - c2.r, 2) +
    Math.pow(c1.g - c2.g, 2) +
    Math.pow(c1.b - c2.b, 2)
  );
}
function getContrastingColor(prevColor) {
  for (let i = 0; i < presetColors.length; i++) {
    if (colorDistance(prevColor, presetColors[i]) >= contrastThreshold) {
      return presetColors[i];
    }
  }
  return presetColors[0];
}

/********* Age Calculation and Tooltip Functions *********/
function calculateAgeFromGridIndex(gridIndex, birthWeekInYear, birthDate) {
  // Convert grid index back to life week
  const lifeWeek = gridIndex - birthWeekInYear;
  
  if (lifeWeek < 0) {
    return {
      age: null,
      date: null,
      message: "Before birth"
    };
  }
  
  // Calculate the date for this week
  const weekDate = new Date(birthDate);
  weekDate.setDate(weekDate.getDate() + (lifeWeek * 7));
  
  // Calculate age in years
  const ageInMs = weekDate - birthDate;
  const ageInWeeks = Math.floor(ageInMs / msPerWeek);
  const ageInYears = Math.floor(ageInWeeks / 52);
  
  return {
    age: {
      years: ageInYears
    },
    date: weekDate,
    lifeWeek: lifeWeek
  };
}

function formatAge(age) {
  if (!age) return "Before birth";
  
  const { years } = age;
  if (years === 0) {
    return "Less than 1 year";
  }
  return `${years} year${years !== 1 ? 's' : ''}`;
}

function findEventForWeek(lifeWeek) {
  if (isPresetMode) {
    // For preset mode, we need to check preset events
    const selectedPreset = celebPresets.find(p => p.name === presetSelect.value);
    if (selectedPreset) {
      return selectedPreset.lifeEvents.find(ev => {
        const presetDob = new Date(selectedPreset.dob);
        const evStart = new Date(ev.startDate);
        const evEnd = ev.endDate ? new Date(ev.endDate) : new Date();
        const startWeek = Math.floor((evStart - presetDob) / msPerWeek);
        const endWeek = Math.ceil((evEnd - presetDob) / msPerWeek);
        return lifeWeek >= startWeek && lifeWeek < endWeek;
      });
    }
  } else {
    // For personal mode, check user events
    return lifeEvents.find(ev => lifeWeek >= ev.startWeek && lifeWeek < ev.endWeek);
  }
  return null;
}

function showAgeTooltip(event, cell) {
  const gridIndex = parseInt(cell.dataset.weekIndex);
  const birthDate = isPresetMode ? 
    new Date(celebPresets.find(p => p.name === presetSelect.value)?.dob) : 
    new Date(localStorage.getItem("birthDate"));
  
  const ageInfo = calculateAgeFromGridIndex(gridIndex, birthWeekInYear, birthDate);
  
  if (!ageInfo.age) {
    // Before birth
    ageTooltipMain.textContent = "Before birth";
    ageTooltipDate.style.display = "none";
    ageTooltipEventInfo.style.display = "none";
  } else {
    // After birth
    ageTooltipMain.textContent = formatAge(ageInfo.age);
    ageTooltipDate.style.display = "none";
    
    // Check for events
    const event = findEventForWeek(ageInfo.lifeWeek);
    if (event) {
      ageTooltipEventInfo.style.display = "block";
      ageTooltipEventTitle.textContent = event.title;
      const startDate = new Date(event.startDate).toLocaleDateString();
      const endDate = event.endDate ? new Date(event.endDate).toLocaleDateString() : "Present";
      ageTooltipEventDates.textContent = `${startDate} - ${endDate}`;
    } else {
      ageTooltipEventInfo.style.display = "none";
    }
  }
  
  // Position tooltip relative to mouse cursor
  const tooltipRect = ageTooltip.getBoundingClientRect();
  
  // Get scroll position
  const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
  const scrollY = window.pageYOffset || document.documentElement.scrollTop;
  
  // Calculate position relative to mouse cursor, accounting for scroll
  let left = event.clientX + scrollX - (tooltipRect.width / 2);
  let top = event.clientY + scrollY - tooltipRect.height - 15;
  
  // Adjust if tooltip goes off screen
  if (top < scrollY + 10) {
    top = event.clientY + scrollY + 15;
    ageTooltipArrow.className = "arrow top";
  } else {
    ageTooltipArrow.className = "arrow bottom";
  }
  
  if (left < scrollX + 10) {
    left = scrollX + 10;
  } else if (left + tooltipRect.width > scrollX + window.innerWidth - 10) {
    left = scrollX + window.innerWidth - tooltipRect.width - 10;
  }
  
  ageTooltip.style.left = left + "px";
  ageTooltip.style.top = top + "px";
  ageTooltip.classList.add("show");
}

function updateTooltipPosition(event) {
  if (ageTooltip.classList.contains("show")) {
    const tooltipRect = ageTooltip.getBoundingClientRect();
    
    // Get scroll position
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;
    
    // Calculate position relative to mouse cursor, accounting for scroll
    let left = event.clientX + scrollX - (tooltipRect.width / 2);
    let top = event.clientY + scrollY - tooltipRect.height - 15;
    
    // Adjust if tooltip goes off screen
    if (top < scrollY + 10) {
      top = event.clientY + scrollY + 15;
      ageTooltipArrow.className = "arrow top";
    } else {
      ageTooltipArrow.className = "arrow bottom";
    }
    
    if (left < scrollX + 10) {
      left = scrollX + 10;
    } else if (left + tooltipRect.width > scrollX + window.innerWidth - 10) {
      left = scrollX + window.innerWidth - tooltipRect.width - 10;
    }
    
    ageTooltip.style.left = left + "px";
    ageTooltip.style.top = top + "px";
  }
}

function hideAgeTooltip() {
  ageTooltip.classList.remove("show");
}

/********* Load Celebrity Presets from JSON *********/
fetch('celebPresets.json')
  .then(response => response.json())
  .then(data => {
    celebPresets = data;
    populatePresetMenu();
  })
  .catch(err => console.error("Error loading celebrity presets:", err));

/********* DOM ELEMENTS *********/
const introSection = document.getElementById("introSection");
const startButton = document.getElementById("startButton");

const authContainer = document.getElementById("authContainer");
const authTitle = document.getElementById("authTitle");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authBirthdate = document.getElementById("authBirthdate");
const authFirstName = document.getElementById("authFirstName");
const authButton = document.getElementById("authButton");
const toggleAuthMode = document.getElementById("toggleAuthMode");

const gridContainer = document.getElementById("gridContainer");
const chartTitle = document.getElementById("chartTitle");
const logoutButton = document.getElementById("logoutButton");
const presetSelect = document.getElementById("presetSelect");
const loadPresetButton = document.getElementById("loadPresetButton");
const xAxis = document.getElementById("xAxis");
const yAxis = document.getElementById("yAxis");
const lifeGrid = document.getElementById("lifeGrid");

const eventForm = document.getElementById("eventForm");
const eventFormHeader = document.getElementById("eventFormHeader");
const eventFormContent = document.getElementById("eventFormContent");
const addEventButton = document.getElementById("addEventButton");
const eventTitleInput = document.getElementById("eventTitle");
const eventColorInput = document.getElementById("eventColor");
const eventStartInput = document.getElementById("eventStart");
const eventEndInput = document.getElementById("eventEnd");

const minimizeEventFormButton = document.getElementById("minimizeEventFormButton");
const closeEventFormButton = document.getElementById("closeEventFormButton");
const showEventFormButton = document.getElementById("showEventFormButton");

const legend = document.getElementById("legend");
const legendHeader = document.getElementById("legendHeader");
const legendItems = document.getElementById("legendItems");

const printButton = document.getElementById("printButton");
const galleryButton = document.getElementById("galleryButton");
const toggleAnnotationsButton = document.getElementById("toggleAnnotationsButton");
const printArea = document.getElementById("printArea");



const publicModal = document.getElementById("publicModal");
const makePublicBtn = document.getElementById("makePublicBtn");
const keepPrivateBtn = document.getElementById("keepPrivateBtn");

const ageTooltip = document.getElementById("ageTooltip");
const ageTooltipMain = ageTooltip.querySelector(".age-main");
const ageTooltipDate = ageTooltip.querySelector(".age-date");
const ageTooltipEventInfo = ageTooltip.querySelector(".event-info");
const ageTooltipEventTitle = ageTooltip.querySelector(".event-title");
const ageTooltipEventDates = ageTooltip.querySelector(".event-dates");
const ageTooltipArrow = ageTooltip.querySelector(".arrow");

const monthWeekCounts = [4,4,5,4,4,5,4,4,5,4,4,5];
const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/********* Intro Section Start Button *********/
startButton.addEventListener("click", () => {
  introSection.style.display = "none";
  authContainer.style.display = "block";
});

/********* Authentication Mode Toggle *********/
let isRegisterMode = false;
toggleAuthMode.addEventListener("click", () => {
  isRegisterMode = !isRegisterMode;
  if(isRegisterMode) {
    authTitle.textContent = "Register";
    authButton.textContent = "Register";
    toggleAuthMode.textContent = "Have an account? Login here";
    authBirthdate.style.display = "block";
    authFirstName.style.display = "block";
  } else {
    authTitle.textContent = "Login";
    authButton.textContent = "Login";
    toggleAuthMode.textContent = "No account? Register here";
    authBirthdate.style.display = "none";
    authFirstName.style.display = "none";
  }
});

/********* Authentication Handler *********/
authButton.addEventListener("click", async () => {
  const email = authEmail.value.trim();
  const password = authPassword.value.trim();
  if(!email || !password) {
    showNotification(
      "Missing Information", 
      "Please fill in email and password.", 
      'warning', 
      3000
    );
    return;
  }
  let endpoint = isRegisterMode ? "/api/register" : "/api/login";
  let payload = { email, password };
  if(isRegisterMode) {
    const bd = authBirthdate.value;
    const firstName = authFirstName.value.trim();
    if(!firstName) {
      showNotification(
        "Missing Information", 
        "Please enter your first name.", 
        'warning', 
        3000
      );
      return;
    }
    if(!bd) {
      showNotification(
        "Missing Information", 
        "Please enter your birth date for registration.", 
        'warning', 
        3000
      );
      return;
    }
    localStorage.setItem("firstName", firstName);
    payload.birthDate = bd;
  }
  try {
    const response = await fetch(baseUrl + endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if(!response.ok) {
      showNotification(
        "Authentication Error", 
        data.error || "Authentication error", 
        'error', 
        4000
      );
      return;
    }
    token = data.token;
    localStorage.setItem("token", token);
    const myBD = data.birthDate || authBirthdate.value;
    localStorage.setItem("birthDate", myBD);
    
    // Check if user came from the Don't Panic button
    const urlParams = new URLSearchParams(window.location.search);
    const fromPanic = urlParams.get('fromPanic');
    
    if (fromPanic === 'true') {
      // Redirect to gallery with Douglas Adams chart
      window.location.href = '/gallery?celebrity=Douglas%20Adams&fromPanic=true';
      return;
    }
    
    authContainer.style.display = "none";
    gridContainer.style.display = "block";
    eventForm.style.display = "block";
    isPresetMode = false;
    
    // Set chart title with user's name
    const firstName = localStorage.getItem("firstName");
    if (firstName) {
      chartTitle.textContent = `${firstName}'s Life in Weeks`;
    }
    
    // Show Make Public button for personal charts
    makePublicBtn.style.display = "inline-block";
    
    initializeMainApp();
    
    // Seed celebrity charts after successful login
    seedCelebrityCharts();
  } catch (err) {
    console.error(err);
    showNotification(
      "Connection Error", 
      "Error communicating with server.", 
      'error', 
      4000
    );
  }
});

/********* Log Out Handler *********/
logoutButton.addEventListener("click", () => {
  localStorage.removeItem("token");
  localStorage.removeItem("birthDate");
  localStorage.removeItem("firstName");
  token = null;
  userBirthDate = null;
  lifeEvents.length = 0;
  gridContainer.style.display = "none";
  eventForm.style.display = "none";
  introSection.style.display = "block";
  // Reset chart title
  chartTitle.textContent = "Your Life in Weeks";
});

/********* On Page Load, Check for Existing Token *********/
window.addEventListener("load", () => {
  if(token && localStorage.getItem("birthDate")) {
    userBirthDate = localStorage.getItem("birthDate");
    introSection.style.display = "none";
    authContainer.style.display = "none";
    gridContainer.style.display = "block";
    eventForm.style.display = "block";
    
    // Set chart title with user's name
    const firstName = localStorage.getItem("firstName");
    if (firstName) {
      chartTitle.textContent = `${firstName}'s Life in Weeks`;
    }
    
    // Show Make Public button for personal charts
    makePublicBtn.style.display = "inline-block";
    
    initializeMainApp();
    
    // Seed celebrity charts for existing session
    seedCelebrityCharts();
    
    // Check for URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('makePublic') === 'true') {
      // Remove the parameter from URL without reloading
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
      
      // Trigger the make public workflow
      setTimeout(() => {
        makeChartPublicWorkflow();
      }, 1000); // Small delay to ensure everything is loaded
    } else if (urlParams.get('action') === 'makePublicFromGallery') {
      // Remove the parameter from URL without reloading
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
      
      // Check if user has necessary data
      if (!token || !localStorage.getItem("birthDate")) {
        showNotification("Error", "Please log in and create your chart first.", "error", 5000);
        setTimeout(() => {
          window.location.href = "/gallery";
        }, 2000);
        return;
      }
      
      // Ensure the user's chart is initialized first
      if (!document.getElementById("gridArea") || document.getElementById("gridArea").offsetWidth === 0) {
        // Initialize the main app if not already done
        initializeMainApp();
      }
      
      // Wait for the chart to be loaded before proceeding
      let chartCheckCount = 0;
      const waitForChart = setInterval(() => {
        chartCheckCount++;
        const gridArea = document.getElementById("gridArea");
        const hasValidGrid = gridArea && gridArea.offsetWidth > 0 && gridArea.offsetHeight > 0;
        const hasWeeks = gridArea && gridArea.querySelectorAll('.week').length > 0;
        
        if (hasValidGrid && hasWeeks) {
          clearInterval(waitForChart);
          
          // Give the chart a moment to fully render
          setTimeout(async () => {
            try {
              // Don't show loading screen yet - it hides the grid!
              // Instead, show a temporary loading indicator
              const tempLoading = document.createElement("div");
              tempLoading.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 20px 40px;
                border-radius: 8px;
                z-index: 9999;
                font-family: 'Inter', -apple-system, sans-serif;
              `;
              tempLoading.innerHTML = "⏳ Generating chart image...";
              document.body.appendChild(tempLoading);
              
              // Start the workflow without showing the full loading screen yet
              await makeChartPublicWorkflow(true, tempLoading); // Pass loading element
              
              // Remove temp loading
              if (tempLoading.parentNode) {
                tempLoading.remove();
              }
              
              // Add a small delay to ensure the success message is visible
              await new Promise(resolve => setTimeout(resolve, 1000));
              // After successful publish, redirect back to gallery with refresh parameter
              window.location.href = "/gallery?refresh=true&tab=community";
            } catch (error) {
              console.error("Error in make public workflow:", error);
              // Remove temp loading on error
              const tempLoading = document.querySelector("div[style*='Generating chart image']");
              if (tempLoading) tempLoading.remove();
              
              // Show error screen
              showMakePublicLoadingScreen();
              const loadingScreen = document.getElementById("makePublicLoadingScreen");
              if (loadingScreen) {
                loadingScreen.innerHTML = `
                  <div style="text-align: center;">
                    <div style="width: 60px; height: 60px; margin: 0 auto 20px; font-size: 60px;">❌</div>
                    <h2 style="margin: 0 0 10px 0; font-size: 1.8rem; font-weight: 600;">Publishing Error</h2>
                    <p style="margin: 0; font-size: 1.1rem; opacity: 0.9;">${error.message}</p>
                    <button onclick="window.location.href='/gallery'" style="margin-top: 20px; padding: 10px 20px; background: white; color: #4361ee; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">Back to Gallery</button>
                  </div>
                `;
              }
            }
          }, 500); // Give chart time to render
        }
      }, 100); // Check every 100ms
      
      // Timeout after 5 seconds
      setTimeout(() => {
        clearInterval(waitForChart);
        showNotification("Error", "Failed to load chart. Please try again from the main app.", "error", 5000);
        setTimeout(() => {
          window.location.href = "/gallery";
        }, 2000);
      }, 5000);
    } else if (urlParams.get('fromGallery') === 'true') {
      // Remove the parameter from URL without reloading
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
  } else {
    // Check if user came from landing page or gallery (no intro needed)
    const urlParams = new URLSearchParams(window.location.search);
    const fromLanding = urlParams.get('fromLanding');
    const fromGallery = urlParams.get('fromGallery');
    const fromPanic = urlParams.get('fromPanic');
    
    if (fromLanding === 'true' || fromGallery === 'true' || fromPanic === 'true') {
      // Skip intro, go directly to login
      introSection.style.display = "none";
      authContainer.style.display = "block";
      gridContainer.style.display = "none";
      
      // Clean up URL parameters (except fromPanic which needs to be preserved for login redirect)
      if (fromGallery === 'true') {
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
      }
    } else {
      // Show intro section for direct app access
      introSection.style.display = "block";
      authContainer.style.display = "none";
      gridContainer.style.display = "none";
    }
  }
});

// Seed celebrity charts function
async function seedCelebrityCharts() {
  // Only seed if user is logged in
  if (!token) return;
  
  try {
    const response = await fetch(baseUrl + "/api/seed-celebrity-charts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      }
    });
    const data = await response.json();
    if (response.ok && data.seededCount > 0) {
      console.log(`Seeded ${data.seededCount} celebrity charts`);
    }
  } catch (err) {
    console.log("Celebrity charts seeding skipped (user not logged in)");
  }
}

/********* Populate Preset Menu *********/
function populatePresetMenu() {
  celebPresets.forEach(celeb => {
    const opt = document.createElement("option");
    opt.value = celeb.name;
    opt.textContent = celeb.name;
    presetSelect.appendChild(opt);
  });
}

/********* Preset Menu Handler *********/
loadPresetButton.addEventListener("click", () => {
  const selected = presetSelect.value;
  if(selected === "my") {
    isPresetMode = false;
    // Set chart title back to user's name
    const firstName = localStorage.getItem("firstName");
    if (firstName) {
      chartTitle.textContent = `${firstName}'s Life in Weeks`;
    }
    // Show Make Public button for personal charts
    makePublicBtn.style.display = "inline-block";
    initializeMainApp();
  } else {
    const preset = celebPresets.find(c => c.name === selected);
    if(preset) {
      isPresetMode = true;
      clearPersonalEvents();
      // Set chart title with celebrity's name
      chartTitle.textContent = `${preset.name}'s Life in Weeks`;
      // Hide Make Public button for celebrity presets
      makePublicBtn.style.display = "none";
      renderPresetChart(preset);
    }
  }
});

function clearPersonalEvents() {
  lifeEvents.length = 0;
  updateLegend();
}

/********* Initialize "My Life Chart" *********/
async function initializeMainApp() {
  const now = new Date();
  const birthDateObj = new Date(localStorage.getItem("birthDate"));
  
  // Calculate actual weeks lived (the accurate measurement)
  let exactWeeksLived = (now - birthDateObj) / msPerWeek;
  if(exactWeeksLived > totalWeeks) exactWeeksLived = totalWeeks;
  const fullWeeks = Math.floor(exactWeeksLived);
  const partialWeekFraction = exactWeeksLived - fullWeeks;
  
  // Get the correct birth week for display
  const originalBirthWeek = getWeekPositionFromDate(birthDateObj);
  const currentWeekInYear = getWeekPositionFromDate(now);
  
  // Calculate how to align current date with correct calendar week
  const currentLifeYear = Math.floor(fullWeeks / 52);
  const weekInCurrentLifeYear = fullWeeks % 52;
  const adjustedBirthWeek = (currentWeekInYear - weekInCurrentLifeYear + 52) % 52;
  
  birthWeekInYear = originalBirthWeek; // Store the real birth week for cleanup
  
  // DEBUG: Log values to understand the calculation
  console.log("=== DEBUGGING LIFE GRID (WORKAROUND) ===");
  console.log("Current date:", now.toDateString());
  console.log("Birth date:", birthDateObj.toDateString());
  console.log("Exact weeks lived:", exactWeeksLived);
  console.log("Full weeks lived:", fullWeeks);
  console.log("Real birth week:", originalBirthWeek);
  console.log("Adjusted birth week for alignment:", adjustedBirthWeek);
  console.log("Current calendar week:", currentWeekInYear);
  
  const finalPosition = adjustedBirthWeek + fullWeeks;
  const finalYear = Math.floor(finalPosition / 52);
  const finalWeek = finalPosition % 52;
  console.log(`Final position: Year ${finalYear}, Week ${finalWeek}`);
  console.log("=========================");
  
  const birthYear = birthDateObj.getFullYear();
  generateAxisLabels(birthYear);
  generateGrid(fullWeeks, partialWeekFraction, adjustedBirthWeek, originalBirthWeek);
  await loadUserEvents();
  updateLegend();
  
  // Refresh live annotations if they were previously visible
  if (annotationsVisible) {
    hideLiveAnnotations();
    showLiveAnnotations();
  }
}

/********* Render Preset Chart *********/
function renderPresetChart(preset) {
  const currentDate = preset.deathDate ? new Date(preset.deathDate) : new Date();
  const birthDateObj = new Date(preset.dob);
  
  // Calculate total weeks lived from birth to current/death date
  let weeksLived = (currentDate - birthDateObj) / msPerWeek;
  if(weeksLived > totalWeeks) weeksLived = totalWeeks;
  const fullWeeks = Math.floor(weeksLived);
  const partialWeekFraction = weeksLived - fullWeeks;
  
  // Calculate which week of the year the person was born using the grid's month structure
  const birthYear = birthDateObj.getFullYear();
  birthWeekInYear = getWeekPositionFromDate(birthDateObj);
  
  generateAxisLabels(birthYear);
  // Pass the real birth week as the same as adjusted birth week for celebrity charts
  generateGrid(fullWeeks, partialWeekFraction, birthWeekInYear, birthWeekInYear);
  
  const sortedEvents = preset.lifeEvents.slice().sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  let prevEventColor = null;
  let prevEventEndWeek = null;
  sortedEvents.forEach((ev, i) => {
    const presetDob = new Date(preset.dob);
    const evStart = new Date(ev.startDate);
    let evEnd;
    if(!ev.endDate || ev.endDate === "") {
      evEnd = currentDate;
    } else {
      evEnd = new Date(ev.endDate);
    }
    const startWeek = Math.floor((evStart - presetDob) / msPerWeek);
    const endWeek = (evStart.getTime() === evEnd.getTime())
                    ? startWeek + 1
                    : Math.ceil((evEnd - presetDob) / msPerWeek);
    let color;
    if (prevEventColor !== null && startWeek === prevEventEndWeek) {
      color = getContrastingColor(prevEventColor);
    } else {
      color = presetColors[i % presetColors.length];
    }
    prevEventColor = color;
    prevEventEndWeek = endWeek;
    const presetEvent = {
      title: ev.title,
      color,
      startWeek,
      endWeek,
      startDate: ev.startDate,
      endDate: ev.endDate
    };
    overlayPresetEvent(presetEvent);
    ev.color = color;
  });
  if (preset.deathDate) {
    const deathDateObj = new Date(preset.deathDate);
    const deathLifeWeek = Math.floor((deathDateObj - birthDateObj) / msPerWeek);
    if (deathLifeWeek >= 0 && deathLifeWeek < totalWeeks) {
      overlaySkull(deathLifeWeek);
    }
  }
  updatePresetLegend(sortedEvents);
  
  // Refresh live annotations if they were previously visible
  if (annotationsVisible) {
    hideLiveAnnotations();
    showLiveAnnotations();
  }
  
  showNotification(
    "Chart Loaded Successfully", 
    `Loaded preset: ${preset.name}. Your own chart remains saved as 'My Life Chart'.`, 
    'success', 
    4000
  );
}

function overlayPresetEvent(ev) {
  const start = ev.startWeek;
  const end = ev.endWeek;
  for (let lifeWeek = start; lifeWeek < end; lifeWeek++) {
    const gridIndex = lifeWeekToGridIndex(lifeWeek, birthWeekInYear);
    if (gridIndex >= 0 && gridIndex < totalWeeks) {
      const cell = lifeGrid.querySelector(`.week[data-week-index='${gridIndex}']`);
      if(cell){
        const inner = cell.querySelector(".week-inner");
        const overlay = document.createElement("div");
        overlay.className = "event-overlay";
        overlay.style.backgroundColor = ev.color;
        overlay.title = `${ev.title}\nFrom: ${new Date(ev.startDate).toLocaleDateString()} To: ${new Date(ev.endDate).toLocaleDateString()}`;
        
        // Add hover events to preset event overlay for tooltip
        overlay.addEventListener("mouseenter", function(e) {
          showAgeTooltip(e, cell);
        });
        
        overlay.addEventListener("mousemove", function(e) {
          updateTooltipPosition(e);
        });
        
        overlay.addEventListener("mouseleave", function(e) {
          hideAgeTooltip();
        });
        
        inner.appendChild(overlay);
      }
    }
  }
}

function overlaySkull(lifeWeekIndex) {
  const gridIndex = lifeWeekToGridIndex(lifeWeekIndex, birthWeekInYear);
  const cell = lifeGrid.querySelector(`.week[data-week-index='${gridIndex}']`);
  if(cell){
    const inner = cell.querySelector(".week-inner");
    const skullDiv = document.createElement("div");
    skullDiv.className = "skull-overlay";
    skullDiv.innerHTML = "&#9760;";
    inner.appendChild(skullDiv);
  }
}

/********* Update Preset Legend *********/
function updatePresetLegend(sortedEvents) {
  legendItems.innerHTML = "";
  if(!sortedEvents || sortedEvents.length === 0) {
    legend.style.display = "none";
    return;
  }
  legend.style.display = "block";
  sortedEvents.forEach((ev) => {
    const itemDiv = document.createElement("div");
    itemDiv.className = "legend-item";
    itemDiv.addEventListener("click", function(){
      showNotification(
        "Preset Events", 
        "Preset events cannot be deleted. They are part of the celebrity's life story.", 
        'info', 
        3000
      );
    });
    const colorDiv = document.createElement("div");
    colorDiv.className = "legend-color";
    colorDiv.style.backgroundColor = ev.color;
    const labelSpan = document.createElement("span");
    labelSpan.textContent = ev.title;
    itemDiv.appendChild(colorDiv);
    itemDiv.appendChild(labelSpan);
    legendItems.appendChild(itemDiv);
  });
}

/********* Axis & Grid Functions *********/
function generateAxisLabels(birthYear = 0) {
  xAxis.innerHTML = "";
  yAxis.innerHTML = "";
  let colStart = 0;
  monthWeekCounts.forEach((weeksInMonth, index) => {
    const labelDiv = document.createElement("div");
    labelDiv.className = "month-label";
    labelDiv.textContent = monthNames[index];
    labelDiv.style.gridColumn = `${colStart + 1} / span ${weeksInMonth}`;
    colStart += weeksInMonth;
    xAxis.appendChild(labelDiv);
  });
  for (let decade = 0; decade < 9; decade++) {
    const labelDiv = document.createElement("div");
    labelDiv.className = "decade-label";
    labelDiv.textContent = `${birthYear + decade * 10}–${birthYear + decade * 10 + 9}`;
    labelDiv.style.gridRow = `${decade * 10 + 1} / span 10`;
    yAxis.appendChild(labelDiv);
  }
}

/********* Helper Functions for New Grid Structure *********/
function getGridColumnPosition(weekIndex) {
  // Calculate position in the new grid structure with gaps
  // Each month has its weeks plus a gap, except December
  const monthWeeks = [4,4,5,4,4,5,4,4,5,4,4,5]; // weeks per month
  let position = 1;
  let remainingWeeks = weekIndex;
  
  for (let month = 0; month < 12; month++) {
    if (remainingWeeks < monthWeeks[month]) {
      return position + remainingWeeks;
    }
    position += monthWeeks[month];
    remainingWeeks -= monthWeeks[month];
    
    // Add gap position (except after December)
    if (month < 11) {
      position += 1; // gap column
    }
  }
  
  return position;
}

function getGridRowPosition(yearIndex) {
  // Calculate position in the new grid structure with decade gaps
  const decade = Math.floor(yearIndex / 10);
  const yearInDecade = yearIndex % 10;
  
  // Each decade has 10 years plus a gap, except the last decade
  return decade * 11 + yearInDecade + 1; // +1 for 1-based grid positioning
}

function getMonthLabelPosition(monthIndex) {
  // Calculate correct position for month labels in new grid
  const monthWeeks = [4,4,5,4,4,5,4,4,5,4,4,5];
  let position = 1;
  
  for (let i = 0; i < monthIndex; i++) {
    position += monthWeeks[i] + 1; // +1 for gap
  }
  
  return position;
}

function getDecadeLabelPosition(decadeIndex) {
  // Calculate correct position for decade labels in new grid
  return decadeIndex * 11 + 1; // 10 years + 1 gap per decade, +1 for 1-based positioning
}

/********* Updated Axis & Grid Functions *********/
function generateAxisLabels(birthYear = 0) {
  xAxis.innerHTML = "";
  yAxis.innerHTML = "";
  
  // Create month labels with correct positioning for new grid structure
  monthWeekCounts.forEach((weeksInMonth, index) => {
    const labelDiv = document.createElement("div");
    labelDiv.className = "month-label";
    labelDiv.textContent = monthNames[index];
    const startPos = getMonthLabelPosition(index);
    labelDiv.style.gridColumn = `${startPos} / span ${weeksInMonth}`;
    xAxis.appendChild(labelDiv);
  });
  
  // Create decade labels with correct positioning for new grid structure
  for (let decade = 0; decade < 9; decade++) {
    const labelDiv = document.createElement("div");
    labelDiv.className = "decade-label";
    labelDiv.textContent = `${birthYear + decade * 10}–${birthYear + decade * 10 + 9}`;
    const startPos = getDecadeLabelPosition(decade);
    labelDiv.style.gridRow = `${startPos} / span 10`;
    yAxis.appendChild(labelDiv);
  }
}

function generateGrid(fullWeeks, partialFraction, adjustedBirthWeek = 0, realBirthWeek = null) {
  lifeGrid.innerHTML = "";
  
  // Create all grid cells first with correct positioning for gaps
  for (let gridIndex = 0; gridIndex < totalWeeks; gridIndex++) {
    const year = Math.floor(gridIndex / weeksPerYear);
    const weekInYear = gridIndex % weeksPerYear;
    const weekDiv = document.createElement("div");
    weekDiv.classList.add("week");
    weekDiv.dataset.weekIndex = gridIndex;
    
    // Calculate correct grid position in new structure with gaps
    const gridColumn = getGridColumnPosition(weekInYear);
    const gridRow = getGridRowPosition(year);
    weekDiv.style.gridColumn = gridColumn;
    weekDiv.style.gridRow = gridRow;
    

    
    const innerDiv = document.createElement("div");
    innerDiv.classList.add("week-inner");
    
    // Add hover event listeners for age tooltip
    innerDiv.addEventListener("mouseenter", function(e) {
      showAgeTooltip(e, weekDiv);
    });
    
    innerDiv.addEventListener("mousemove", function(e) {
      updateTooltipPosition(e);
    });
    
    innerDiv.addEventListener("mouseleave", function(e) {
      hideAgeTooltip();
    });
    
    weekDiv.appendChild(innerDiv);
    lifeGrid.appendChild(weekDiv);
  }
  
  // Now shade the cells that represent weeks lived
  // Start from the adjusted birth week position and shade chronologically
  let currentGridIndex = adjustedBirthWeek; // Start at adjusted birth week in first year
  
  console.log("=== GRID SHADING DEBUG (WITH CLEANUP) ===");
  console.log("Starting to shade from adjusted birth week:", adjustedBirthWeek);
  console.log("Real birth week:", realBirthWeek);
  console.log("Will shade", fullWeeks, "complete weeks");
  
  // Shade complete weeks lived
  for (let lifeWeek = 0; lifeWeek < fullWeeks; lifeWeek++) {
    if (currentGridIndex < totalWeeks) {
      const weekCell = lifeGrid.querySelector(`.week[data-week-index='${currentGridIndex}']`);
      if (weekCell) {
        weekCell.classList.add("lived");
      }
    }
    currentGridIndex++;
  }
  
  // Handle partial week
  if (partialFraction > 0 && currentGridIndex < totalWeeks) {
    const weekCell = lifeGrid.querySelector(`.week[data-week-index='${currentGridIndex}']`);
    if (weekCell) {
      const innerDiv = weekCell.querySelector(".week-inner");
      const percent = partialFraction * 100;
      innerDiv.style.background = `linear-gradient(to right, #4cc9f0 ${percent}%, #f8f9fa ${percent}%)`;
    }
  }
  
  // CLEANUP: Remove shading from cells that appear before the real birth week
  if (realBirthWeek !== null && adjustedBirthWeek !== realBirthWeek) {
    console.log("Cleaning up shading before real birth week...");
    
    // Calculate how many cells to clean up in the first year
    if (adjustedBirthWeek < realBirthWeek) {
      // Clean up cells from adjustedBirthWeek to realBirthWeek-1
      for (let weekIndex = adjustedBirthWeek; weekIndex < realBirthWeek; weekIndex++) {
        const weekCell = lifeGrid.querySelector(`.week[data-week-index='${weekIndex}']`);
        if (weekCell) {
          weekCell.classList.remove("lived");
          const innerDiv = weekCell.querySelector(".week-inner");
          innerDiv.style.background = ""; // Remove any gradient
          console.log(`Removed shading from week ${weekIndex} (before birth)`);
        }
      }
    } else {
      // Clean up cells from 0 to adjustedBirthWeek if we wrapped around
      const weeksToClean = adjustedBirthWeek + fullWeeks - realBirthWeek - fullWeeks;
      for (let i = 0; i < weeksToClean; i++) {
        const weekIndex = i;
        const weekCell = lifeGrid.querySelector(`.week[data-week-index='${weekIndex}']`);
        if (weekCell) {
          weekCell.classList.remove("lived");
          const innerDiv = weekCell.querySelector(".week-inner");
          innerDiv.style.background = ""; // Remove any gradient
          console.log(`Removed shading from week ${weekIndex} (before birth)`);
        }
      }
    }
  }
  
  console.log("Final current position grid index:", currentGridIndex);
  console.log("=========================");
  
  if (!isPresetMode) {
    overlayEvents();
  }
}

/********* Event Handling for "My Life Chart" *********/
addEventButton.addEventListener("click", async () => {
  const title = eventTitleInput.value.trim();
  const color = eventColorInput.value;
  const startDateValue = eventStartInput.value;
  const endDateValue = eventEndInput.value;
  if(!title || !startDateValue || !endDateValue){
    showNotification(
      "Missing Information", 
      "Please fill in all fields for the event.", 
      'warning', 
      3000
    );
    return;
  }
  const startDate = new Date(startDateValue);
  const endDate = new Date(endDateValue);
  if(startDate > endDate){
    showNotification(
      "Invalid Date Range", 
      "Start date cannot be after end date.", 
      'warning', 
      3000
    );
    return;
  }
  const eventStartWeek = Math.floor((startDate - new Date(localStorage.getItem("birthDate"))) / msPerWeek);
  const eventEndWeek = Math.ceil((endDate - new Date(localStorage.getItem("birthDate"))) / msPerWeek);
  const payload = {
    title,
    color,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    startWeek: eventStartWeek,
    endWeek: eventEndWeek
  };
  try {
    const response = await fetch(baseUrl + "/api/event", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if(!response.ok){
      showNotification(
        "Error", 
        data.error || "Error saving event", 
        'error', 
        4000
      );
      return;
    }
    lifeEvents.push(data.event);
    eventTitleInput.value = "";
    eventStartInput.value = "";
    eventEndInput.value = "";
    overlayEvents();
    updateLegend();
  } catch(err) {
    console.error(err);
    showNotification(
      "Connection Error", 
      "Error communicating with server.", 
      'error', 
      4000
    );
  }
});

async function loadUserEvents() {
  try {
    const response = await fetch(baseUrl + "/api/events", {
      headers: { "Authorization": "Bearer " + token }
    });
    const data = await response.json();
    if(response.ok){
      lifeEvents.length = 0;
      data.events.forEach(ev => lifeEvents.push(ev));
      overlayEvents();
      updateLegend();
    } else {
      showNotification(
        "Error", 
        data.error || "Error loading events", 
        'error', 
        4000
      );
    }
  } catch(err) {
    console.error(err);
  }
}

function overlayEvents() {
  document.querySelectorAll(".event-overlay").forEach(overlay => overlay.remove());
  lifeEvents.forEach(ev => {
    const start = ev.startWeek;
    const end = ev.endWeek;
    for (let lifeWeek = start; lifeWeek < end; lifeWeek++) {
      const gridIndex = lifeWeekToGridIndex(lifeWeek, birthWeekInYear);
      if (gridIndex >= 0 && gridIndex < totalWeeks) {
        const cell = lifeGrid.querySelector(`.week[data-week-index='${gridIndex}']`);
        if (cell) {
          const inner = cell.querySelector(".week-inner");
          const overlay = document.createElement("div");
          overlay.className = "event-overlay";
          overlay.style.backgroundColor = ev.color;
          overlay.title = `${ev.title}\nFrom: ${new Date(ev.startDate).toLocaleDateString()} To: ${new Date(ev.endDate).toLocaleDateString()}`;
          overlay.addEventListener("click", function(e){
            e.stopPropagation();
            if(confirm(`Delete event "${ev.title}"?`)){
              deleteEvent(ev._id || ev.id);
            }
          });
          
          // Add hover events to event overlay for tooltip
          overlay.addEventListener("mouseenter", function(e) {
            showAgeTooltip(e, cell);
          });
          
          overlay.addEventListener("mousemove", function(e) {
            updateTooltipPosition(e);
          });
          
          overlay.addEventListener("mouseleave", function(e) {
            hideAgeTooltip();
          });
          
          inner.appendChild(overlay);
        }
      }
    }
  });
}

async function deleteEvent(id) {
  try {
    const response = await fetch(baseUrl + "/api/event/" + id, {
      method: "DELETE",
      headers: { "Authorization": "Bearer " + token }
    });
    const data = await response.json();
    if(response.ok){
      const index = lifeEvents.findIndex(ev => (ev._id || ev.id) == id);
      if(index > -1){
        lifeEvents.splice(index, 1);
        overlayEvents();
        updateLegend();
      }
    } else {
      showNotification(
        "Error", 
        data.error || "Error deleting event", 
        'error', 
        4000
      );
    }
  } catch(err) {
    console.error(err);
  }
}

function updateLegend() {
  legendItems.innerHTML = "";
  if(lifeEvents.length === 0) {
    legend.style.display = "none";
    return;
  }
  legend.style.display = "block";
  lifeEvents.forEach(ev => {
    const itemDiv = document.createElement("div");
    itemDiv.className = "legend-item";
    itemDiv.addEventListener("click", function(){
      if(confirm(`Delete event "${ev.title}"?`)){
        deleteEvent(ev._id || ev.id);
      }
    });
    const colorDiv = document.createElement("div");
    colorDiv.className = "legend-color";
    colorDiv.style.backgroundColor = ev.color;
    const labelSpan = document.createElement("span");
    labelSpan.textContent = ev.title;
    itemDiv.appendChild(colorDiv);
    itemDiv.appendChild(labelSpan);
    legendItems.appendChild(itemDiv);
  });
}

/********* Draggable, Minimizable Event Form *********/
let isDraggingEventForm = false, eventFormOffsetX = 0, eventFormOffsetY = 0;
eventFormHeader.addEventListener("mousedown", function(e){
  isDraggingEventForm = true;
  const rect = eventForm.getBoundingClientRect();
  eventForm.style.bottom = "auto";
  eventFormOffsetX = e.clientX - rect.left;
  eventFormOffsetY = e.clientY - rect.top;
});
document.addEventListener("mousemove", function(e){
  if(isDraggingEventForm){
    eventForm.style.left = (e.clientX - eventFormOffsetX) + "px";
    eventForm.style.top = (e.clientY - eventFormOffsetY) + "px";
  }
});
document.addEventListener("mouseup", function(){ isDraggingEventForm = false; });
let isMinimized = false;
minimizeEventFormButton.addEventListener("click", function(){
  if(!isMinimized){
    eventFormContent.style.display = "none";
    minimizeEventFormButton.textContent = "+";
    isMinimized = true;
  } else {
    eventFormContent.style.display = "block";
    minimizeEventFormButton.textContent = "–";
    isMinimized = false;
  }
});
closeEventFormButton.addEventListener("click", function(){
  eventForm.style.display = "none";
  showEventFormButton.style.display = "flex";
});
showEventFormButton.addEventListener("click", function(){
  eventForm.style.display = "block";
  showEventFormButton.style.display = "none";
});

/********* Draggable Legend Functionality *********/
let isDraggingLegend = false, legendOffsetX = 0, legendOffsetY = 0;
legendHeader.addEventListener("mousedown", function(e) {
  isDraggingLegend = true;
  const rect = legend.getBoundingClientRect();
  legendOffsetX = e.clientX - rect.left;
  legendOffsetY = e.clientY - rect.top;
});
document.addEventListener("mousemove", function(e) {
  if(isDraggingLegend) {
    legend.style.left = (e.clientX - legendOffsetX) + "px";
    legend.style.top = (e.clientY - legendOffsetY) + "px";
  }
});
document.addEventListener("mouseup", function() {
  isDraggingLegend = false;
});

/********* Print and Gallery Functionality *********/
printButton.addEventListener("click", printLifeGrid);
galleryButton.addEventListener("click", () => {
  window.location.href = "/gallery";
});

// Toggle annotations functionality
let annotationsVisible = false;
toggleAnnotationsButton.addEventListener("click", () => {
  annotationsVisible = !annotationsVisible;
  if (annotationsVisible) {
    toggleAnnotationsButton.textContent = "Hide Event Labels";
    showLiveAnnotations();
  } else {
    toggleAnnotationsButton.textContent = "Show Event Labels";
    hideLiveAnnotations();
  }
});

function printLifeGrid() {
  printArea.innerHTML = "";
  
  // Hide only UI elements that might interfere with the image (not event annotations)
  const uiElements = document.querySelectorAll('#showEventFormButton, #eventForm, #legend, #toggleAnnotationsButton, .button-group');
  const originalDisplays = [];
  uiElements.forEach(el => {
    originalDisplays.push(el.style.display);
    el.style.display = 'none';
  });
  
  const printPage = document.createElement("div");
  printPage.id = "printPage";
  printPage.style.background = "#fff";
  printPage.style.padding = "20px";
  printPage.style.boxSizing = "border-box";
  
  const printStyle = document.createElement("style");
  printStyle.innerHTML = `
    #xAxis .month-label, #yAxis .decade-label {
      font-size: 0.7em !important;
      color: #000 !important;
      background: #fff !important;
      border: none !important;
      font-family: sans-serif !important;
      padding: 2px 0 !important;
    }
    #xAxis, #yAxis {
      background: #fff !important;
      border: none !important;
    }
    .event-annotation {
      position: absolute;
      background: rgba(255, 255, 255, 0.95);
      border: 2px solid #4361ee;
      border-radius: 8px;
      padding: 8px 12px;
      font-size: 12px;
      font-weight: 600;
      color: #333;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      z-index: 100;
      max-width: 120px;
      text-align: center;
      line-height: 1.2;
    }
    .event-annotation::before {
      content: '';
      position: absolute;
      width: 0;
      height: 0;
      border: 6px solid transparent;
    }
    .event-annotation.top::before {
      bottom: -8px;
      left: 50%;
      transform: translateX(-50%);
      border-top-color: #4361ee;
    }
    .event-annotation.bottom::before {
      top: -8px;
      left: 50%;
      transform: translateX(-50%);
      border-bottom-color: #4361ee;
    }
    .event-annotation.left::before {
      right: -8px;
      top: 50%;
      transform: translateY(-50%);
      border-left-color: #4361ee;
    }
    .event-annotation.right::before {
      left: -8px;
      top: 50%;
      transform: translateY(-50%);
      border-right-color: #4361ee;
    }
  `;
  printPage.appendChild(printStyle);
  
  // Get the current chart title
  const currentTitle = chartTitle.textContent;
  const headerDiv = document.createElement("div");
  headerDiv.style.textAlign = "center";
  headerDiv.style.marginBottom = "20px";
  headerDiv.style.fontSize = "24px";
  headerDiv.style.fontWeight = "600";
  headerDiv.style.color = "#333";
  headerDiv.innerHTML = `<h1>${currentTitle}</h1>`;
  printPage.appendChild(headerDiv);
  
  const originalGrid = document.getElementById("gridArea");
  const gridClone = originalGrid.cloneNode(true);
  gridClone.style.width = originalGrid.offsetWidth + "px";
  gridClone.style.height = originalGrid.offsetHeight + "px";
  gridClone.style.position = "relative";
  
  // Add event annotations to the cloned grid
  if (isPresetMode) {
    const selectedPreset = celebPresets.find(p => p.name === presetSelect.value);
    if (selectedPreset && selectedPreset.lifeEvents) {
      console.log(`Adding ${selectedPreset.lifeEvents.length} preset events to print`);
      selectedPreset.lifeEvents.forEach((event, index) => {
        addEventAnnotation(gridClone, event, index, selectedPreset.dob);
      });
    }
  } else {
    console.log(`Adding ${lifeEvents.length} personal events to print`);
    lifeEvents.forEach((event, index) => {
      addEventAnnotation(gridClone, event, index, localStorage.getItem("birthDate"));
    });
  }
  
  const gridContainerPrint = document.createElement("div");
  gridContainerPrint.style.marginBottom = "20px";
  gridContainerPrint.appendChild(gridClone);
  printPage.appendChild(gridContainerPrint);
  
  // Remove legend from print - user requested no legend in generated image
  // const legendClone = document.getElementById("legend").cloneNode(true);
  // legendClone.style.position = "static";
  // legendClone.style.margin = "0 auto";
  // const legendContainerPrint = document.createElement("div");
  // legendContainerPrint.appendChild(legendClone);
  // printPage.appendChild(legendContainerPrint);
  
  printArea.appendChild(printPage);
  
  // Use higher quality settings for html2canvas
  html2canvas(printPage, {
    scale: 2, // Higher resolution
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    width: printPage.offsetWidth,
    height: printPage.offsetHeight,
    logging: false,
    imageTimeout: 0,
    removeContainer: true
  }).then(canvas => {
    // Create a high-quality final image
    const maxWidth = 2400; // Higher max width for better quality
    let newWidth = canvas.width;
    let newHeight = canvas.height;
    
    if (canvas.width > maxWidth) {
      const scaleFactor = maxWidth / canvas.width;
      newWidth = maxWidth;
      newHeight = canvas.height * scaleFactor;
    }
    
    const scaledCanvas = document.createElement("canvas");
    scaledCanvas.width = newWidth;
    scaledCanvas.height = newHeight;
    const ctx = scaledCanvas.getContext("2d");
    
    // Enable high-quality image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    ctx.drawImage(canvas, 0, 0, newWidth, newHeight);
    const dataUrl = scaledCanvas.toDataURL("image/png", 1.0); // Use PNG for better quality
    
    const imageWindow = window.open('', '_blank');
    imageWindow.document.write(`
      <html>
        <head>
          <title>Life Grid Image</title>
          <style>
            body { margin: 0; padding: 20px; text-align: center; background: #fafafa; font-family: 'Inter', -apple-system, sans-serif; }
            img { max-width: 100%; height: auto; border: 1px solid #eaeaea; border-radius: 8px; }
            button { margin-top: 20px; padding: 10px 20px; font-size: 16px; background: #4361ee; color: white; border: none; border-radius: 6px; cursor: pointer; }
            button:hover { background: #3a56d4; }
          </style>
        </head>
        <body>
          <img id="printedImage" src="${dataUrl}" alt="Life Grid">
          <br>
          <button id="saveImageButton">Save Image</button>
          <script>
            document.getElementById("saveImageButton").addEventListener("click", function(){
              var a = document.createElement("a");
              a.href = document.getElementById("printedImage").src;
              a.download = "LifeGrid_" + new Date().getTime() + ".png";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            });
          <\/script>
        </body>
      </html>
    `);
    imageWindow.document.close();

    // Removed automatic public chart prompt - users can use the "Make Public" button when they want to share
    
    // Restore UI elements
    uiElements.forEach((el, index) => {
      el.style.display = originalDisplays[index];
    });
  }).catch(err => {
    console.error("Error generating print image:", err);
    
    // Restore UI elements even if there's an error
    uiElements.forEach((el, index) => {
      el.style.display = originalDisplays[index];
    });
  });
}



function downloadImage(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function printImage(dataUrl) {
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
      <head>
        <title>Print Life Grid</title>
        <style>
          body { margin: 0; padding: 0; }
          img { display: block; max-width: 100%; }
          @media print {
            img { max-width: 100%; height: auto; }
          }
        </style>
      </head>
      <body>
        <img src="${dataUrl}" alt="Life Grid">
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 500);
          }
        <\/script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

function addEventAnnotation(gridClone, event, index, birthDate) {
  const birthDateObj = new Date(birthDate);
  const eventStart = new Date(event.startDate);
  const startWeek = Math.floor((eventStart - birthDateObj) / msPerWeek);
  const gridIndex = lifeWeekToGridIndex(startWeek, birthWeekInYear);
  
  if (gridIndex >= 0 && gridIndex < totalWeeks) {
    const cell = gridClone.querySelector(`.week[data-week-index='${gridIndex}']`);
    console.log(`Event "${event.title}" - gridIndex: ${gridIndex}, cell found: ${!!cell}`);
    if (cell) {
      const annotation = document.createElement("div");
      annotation.className = "event-annotation";
      annotation.textContent = event.title;
      annotation.style.backgroundColor = event.color || "#4361ee";
      annotation.style.borderColor = event.color || "#4361ee";
      annotation.style.color = "#fff";
      
      // Position the annotation intelligently with collision detection
      const cellRect = cell.getBoundingClientRect();
      const gridRect = gridClone.getBoundingClientRect();
      
      // Calculate position relative to the cell with precise centering
      const cellLeft = cellRect.left - gridRect.left;
      const cellTop = cellRect.top - gridRect.top;
      const cellWidth = cellRect.width;
      const cellHeight = cellRect.height;
      const cellCenterX = cellLeft + cellWidth / 2;
      const cellCenterY = cellTop + cellHeight / 2;
      
      // Get existing annotations to check for overlaps
      const existingAnnotations = gridClone.querySelectorAll('.event-annotation');
      const existingPositions = Array.from(existingAnnotations).map(ann => ({
        left: parseInt(ann.style.left),
        top: parseInt(ann.style.top),
        width: 120,
        height: 40
      }));
      
      // Try different positions to avoid overlap with precise alignment
      const positions = [
        { pos: "top", left: cellCenterX - 60, top: cellTop - 50 }, // Center horizontally, above cell
        { pos: "bottom", left: cellCenterX - 60, top: cellTop + cellHeight + 10 }, // Center horizontally, below cell
        { pos: "right", left: cellLeft + cellWidth + 10, top: cellCenterY - 20 }, // Right of cell, center vertically
        { pos: "left", left: cellLeft - 130, top: cellCenterY - 20 }, // Left of cell, center vertically
        { pos: "top", left: cellCenterX - 60, top: cellTop - 90 }, // Further above
        { pos: "bottom", left: cellCenterX - 60, top: cellTop + cellHeight + 50 }, // Further below
        { pos: "right", left: cellLeft + cellWidth + 50, top: cellCenterY - 20 }, // Further right
        { pos: "left", left: cellLeft - 180, top: cellCenterY - 20 }, // Further left
        { pos: "top", left: cellCenterX - 60, top: cellTop - 130 }, // Even further above
        { pos: "bottom", left: cellCenterX - 60, top: cellTop + cellHeight + 90 }, // Even further below
        { pos: "right", left: cellLeft + cellWidth + 90, top: cellCenterY - 20 }, // Even further right
        { pos: "left", left: cellLeft - 230, top: cellCenterY - 20 } // Even further left
      ];
      
      let bestPosition = null;
      for (const pos of positions) {
        // Check if position is within grid bounds
        if (pos.left < 0 || pos.left > gridRect.width - 120 || 
            pos.top < 0 || pos.top > gridRect.height - 40) {
          continue;
        }
        
        // Check for overlap with existing annotations with more padding
        let hasOverlap = false;
        for (const existing of existingPositions) {
          // Add 10px padding around each annotation to prevent touching
          if (pos.left < existing.left + existing.width + 10 &&
              pos.left + 120 + 10 > existing.left &&
              pos.top < existing.top + existing.height + 10 &&
              pos.top + 40 + 10 > existing.top) {
            hasOverlap = true;
            break;
          }
        }
        
        if (!hasOverlap) {
          bestPosition = pos;
          break;
        }
      }
      
      // If no non-overlapping position found, use the first valid position
      if (!bestPosition) {
        bestPosition = positions[0];
      }
      
      annotation.style.left = bestPosition.left + "px";
      annotation.style.top = bestPosition.top + "px";
      annotation.classList.add(bestPosition.pos);
      
      gridClone.appendChild(annotation);
      console.log(`Added annotation "${event.title}" at position ${bestPosition.left},${bestPosition.top}`);
    }
  }
}

function showLiveAnnotations() {
  // Remove existing annotations first
  hideLiveAnnotations();
  
  const gridArea = document.getElementById("gridArea");
  gridArea.style.position = "relative";
  
  if (isPresetMode) {
    const selectedPreset = celebPresets.find(p => p.name === presetSelect.value);
    if (selectedPreset && selectedPreset.lifeEvents) {
      selectedPreset.lifeEvents.forEach((event, index) => {
        addLiveEventAnnotation(gridArea, event, index, selectedPreset.dob);
      });
    }
  } else {
    lifeEvents.forEach((event, index) => {
      addLiveEventAnnotation(gridArea, event, index, localStorage.getItem("birthDate"));
    });
  }
}

function hideLiveAnnotations() {
  const existingAnnotations = document.querySelectorAll(".live-event-annotation");
  existingAnnotations.forEach(annotation => annotation.remove());
}

function addLiveEventAnnotation(gridArea, event, index, birthDate) {
  const birthDateObj = new Date(birthDate);
  const eventStart = new Date(event.startDate);
  const startWeek = Math.floor((eventStart - birthDateObj) / msPerWeek);
  const gridIndex = lifeWeekToGridIndex(startWeek, birthWeekInYear);
  
  if (gridIndex >= 0 && gridIndex < totalWeeks) {
    const cell = lifeGrid.querySelector(`.week[data-week-index='${gridIndex}']`);
    if (cell) {
      const annotation = document.createElement("div");
      annotation.className = "live-event-annotation";
      annotation.textContent = event.title;
      annotation.style.backgroundColor = event.color || "#4361ee";
      annotation.style.borderColor = event.color || "#4361ee";
      annotation.style.color = "#fff";
      
      // Position the annotation intelligently with collision detection
      const cellRect = cell.getBoundingClientRect();
      const gridRect = gridArea.getBoundingClientRect();
      
      // Calculate position relative to the cell with precise centering
      const cellLeft = cellRect.left - gridRect.left;
      const cellTop = cellRect.top - gridRect.top;
      const cellWidth = cellRect.width;
      const cellHeight = cellRect.height;
      const cellCenterX = cellLeft + cellWidth / 2;
      const cellCenterY = cellTop + cellHeight / 2;
      
      // Get existing annotations to check for overlaps
      const existingAnnotations = gridArea.querySelectorAll('.live-event-annotation');
      const existingPositions = Array.from(existingAnnotations).map(ann => ({
        left: parseInt(ann.style.left),
        top: parseInt(ann.style.top),
        width: 140,
        height: 40
      }));
      
      // Try different positions to avoid overlap with precise alignment
      const positions = [
        { pos: "top", left: cellCenterX - 70, top: cellTop - 50 }, // Center horizontally, above cell
        { pos: "bottom", left: cellCenterX - 70, top: cellTop + cellHeight + 10 }, // Center horizontally, below cell
        { pos: "right", left: cellLeft + cellWidth + 10, top: cellCenterY - 20 }, // Right of cell, center vertically
        { pos: "left", left: cellLeft - 150, top: cellCenterY - 20 }, // Left of cell, center vertically
        { pos: "top", left: cellCenterX - 70, top: cellTop - 90 }, // Further above
        { pos: "bottom", left: cellCenterX - 70, top: cellTop + cellHeight + 50 }, // Further below
        { pos: "right", left: cellLeft + cellWidth + 50, top: cellCenterY - 20 }, // Further right
        { pos: "left", left: cellLeft - 200, top: cellCenterY - 20 }, // Further left
        { pos: "top", left: cellCenterX - 70, top: cellTop - 130 }, // Even further above
        { pos: "bottom", left: cellCenterX - 70, top: cellTop + cellHeight + 90 }, // Even further below
        { pos: "right", left: cellLeft + cellWidth + 90, top: cellCenterY - 20 }, // Even further right
        { pos: "left", left: cellLeft - 250, top: cellCenterY - 20 } // Even further left
      ];
      
      let bestPosition = null;
      for (const pos of positions) {
        // Check if position is within grid bounds
        if (pos.left < 0 || pos.left > gridRect.width - 140 || 
            pos.top < 0 || pos.top > gridRect.height - 40) {
          continue;
        }
        
        // Check for overlap with existing annotations with more padding
        let hasOverlap = false;
        for (const existing of existingPositions) {
          // Add 10px padding around each annotation to prevent touching
          if (pos.left < existing.left + existing.width + 10 &&
              pos.left + 140 + 10 > existing.left &&
              pos.top < existing.top + existing.height + 10 &&
              pos.top + 40 + 10 > existing.top) {
            hasOverlap = true;
            break;
          }
        }
        
        if (!hasOverlap) {
          bestPosition = pos;
          break;
        }
      }
      
      // If no non-overlapping position found, use the first valid position
      if (!bestPosition) {
        bestPosition = positions[0];
      }
      
      annotation.style.left = bestPosition.left + "px";
      annotation.style.top = bestPosition.top + "px";
      annotation.classList.add(bestPosition.pos);
      
      gridArea.appendChild(annotation);
      
      // Show the annotation with animation
      setTimeout(() => {
        annotation.classList.add("show");
      }, index * 100); // Stagger the animations
    }
  }
}

function deleteGalleryItem(timestamp) {
  let gallery = JSON.parse(localStorage.getItem("lifeGridGallery") || "[]");
  gallery = gallery.filter(item => item.timestamp !== timestamp);
  localStorage.setItem("lifeGridGallery", JSON.stringify(gallery));
  openGallery();
}

// Public Chart Functions
function askToMakePublic(imageData, chartTitle) {
  publicModal.style.display = "block";
  
  // Store the data for later use
  window.pendingPublicChart = {
    imageData: imageData,
    chartTitle: chartTitle,
    chartData: JSON.stringify({
      birthDate: localStorage.getItem("birthDate"),
      events: lifeEvents,
      isPresetMode: false
    })
  };
}

makePublicBtn.addEventListener("click", async () => {
  // Only allow making chart public for personal charts, not presets
  if (isPresetMode) {
    showNotification(
      "Preset Charts", 
      "You can only make your personal life chart public, not celebrity presets.", 
      'warning', 
      4000
    );
    return;
  }
  
  // Call the complete workflow for making chart public
  await makeChartPublicWorkflow(false); // false for normal workflow
});

keepPrivateBtn.addEventListener("click", () => {
  publicModal.style.display = "none";
  window.pendingPublicChart = null;
});

// Close modal when clicking outside
publicModal.addEventListener("click", (e) => {
  if (e.target === publicModal) {
    publicModal.style.display = "none";
    window.pendingPublicChart = null;
  }
});

// Show loading screen for make public from gallery workflow
function showMakePublicLoadingScreen() {
  // Hide all main app sections
  const introSection = document.getElementById("introSection");
  const authContainer = document.getElementById("authContainer");
  const gridContainer = document.getElementById("gridContainer");
  
  if (introSection) introSection.style.display = "none";
  if (authContainer) authContainer.style.display = "none";
  if (gridContainer) gridContainer.style.display = "none";
  
  // Create and show loading screen
  let loadingScreen = document.getElementById("makePublicLoadingScreen");
  if (!loadingScreen) {
    loadingScreen = document.createElement("div");
    loadingScreen.id = "makePublicLoadingScreen";
    loadingScreen.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, #4361ee, #7209b7);
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      z-index: 9999;
      color: white;
      font-family: 'Inter', -apple-system, sans-serif;
    `;
    
    loadingScreen.innerHTML = `
      <div style="text-align: center;">
        <div style="width: 60px; height: 60px; border: 4px solid rgba(255,255,255,0.3); border-top: 4px solid white; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 20px;"></div>
        <h2 style="margin: 0 0 10px 0; font-size: 1.8rem; font-weight: 600;">Making Your Chart Public</h2>
        <p style="margin: 0; font-size: 1.1rem; opacity: 0.9;">Please wait while we generate and publish your life chart...</p>
      </div>
    `;
    
    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(loadingScreen);
  } else {
    loadingScreen.style.display = "flex";
  }
}

// Complete workflow for making chart public
async function makeChartPublicWorkflow(fromGallery = false, tempLoadingElement = null) {
  try {
    // Show loading state
    let originalText = "🌍 Make Public";
    if (makePublicBtn) {
      originalText = makePublicBtn.textContent;
      makePublicBtn.textContent = "⏳ Generating Chart...";
      makePublicBtn.disabled = true;
    }
    
    // Step 1: Show event labels if not already shown
    if (!annotationsVisible && toggleAnnotationsButton) {
      annotationsVisible = true;
      toggleAnnotationsButton.textContent = "Hide Event Labels";
      showLiveAnnotations();
    }

    // Step 2: Create chart image (without opening new window)
    const chartTitleElement = document.getElementById("chartTitle");
    if (!chartTitleElement) {
      throw new Error("Chart not loaded. Please try again.");
    }
    const chartTitle = chartTitleElement.textContent;
    if (makePublicBtn) {
      makePublicBtn.textContent = "⏳ Creating Image...";
    }
    const imageData = await generateChartImageForPublic(chartTitle);
    
    // Now that we have the image, we can show the full loading screen if from gallery
    if (fromGallery && !tempLoadingElement) {
      showMakePublicLoadingScreen();
    } else if (tempLoadingElement) {
      tempLoadingElement.innerHTML = "⏳ Publishing to gallery...";
    }

    // Step 3: Make chart public and publish it
    if (makePublicBtn) {
      makePublicBtn.textContent = "⏳ Publishing...";
    }
    const ownerName = localStorage.getItem("firstName") || "Anonymous";
    const payload = {
      chartTitle: chartTitle,
      imageData: imageData,
      chartData: JSON.stringify({
        birthDate: localStorage.getItem("birthDate"),
        events: lifeEvents,
        isPresetMode: false
      }),
      ownerName: ownerName
    };

    const response = await fetch(baseUrl + "/api/make-public", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to make chart public");
    }

    // Step 4: Handle success based on context
    if (fromGallery) {
      // For gallery workflow, update the loading indicator
      if (tempLoadingElement) {
        tempLoadingElement.innerHTML = "✅ Chart Published!";
      } else {
        const loadingScreen = document.getElementById("makePublicLoadingScreen");
        if (loadingScreen) {
          loadingScreen.innerHTML = `
            <div style="text-align: center;">
              <div style="width: 60px; height: 60px; margin: 0 auto 20px; font-size: 60px;">✅</div>
              <h2 style="margin: 0 0 10px 0; font-size: 1.8rem; font-weight: 600;">Chart Published!</h2>
              <p style="margin: 0; font-size: 1.1rem; opacity: 0.9;">Redirecting to gallery...</p>
            </div>
          `;
        }
      }
      // Add a small delay to ensure database is updated before redirect
      await new Promise(resolve => setTimeout(resolve, 500));
    } else {
      // For normal workflow, show success message and restore button state
      if (makePublicBtn) {
        makePublicBtn.textContent = "✅ Published!";
      }
      setTimeout(() => {
        showNotification(
          "Chart Published! 🎉", 
          "Your life chart is now public! Others can view it in the gallery.", 
          'success', 
          5000
        );
        // Restore button state after showing success
        setTimeout(() => {
          if (makePublicBtn) {
            makePublicBtn.textContent = "🌍 Make Public";
            makePublicBtn.disabled = false;
          }
        }, 2000);
      }, 500);
    }

  } catch (error) {
    console.error("Error in makeChartPublicWorkflow:", error);
    
    if (fromGallery) {
      // If we have a temp loading element, the error will be handled by the caller
      if (!tempLoadingElement) {
        // For gallery workflow, show error in loading screen
        const loadingScreen = document.getElementById("makePublicLoadingScreen");
        if (loadingScreen) {
          loadingScreen.innerHTML = `
            <div style="text-align: center;">
              <div style="width: 60px; height: 60px; margin: 0 auto 20px; font-size: 60px;">❌</div>
              <h2 style="margin: 0 0 10px 0; font-size: 1.8rem; font-weight: 600;">Publishing Error</h2>
              <p style="margin: 0; font-size: 1.1rem; opacity: 0.9;">${error.message}</p>
              <button onclick="window.location.href='/gallery'" style="margin-top: 20px; padding: 10px 20px; background: white; color: #4361ee; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">Back to Gallery</button>
            </div>
          `;
        }
      }
    } else {
      // For normal workflow, restore button state on error
      if (makePublicBtn) {
        makePublicBtn.textContent = "🌍 Make Public";
        makePublicBtn.disabled = false;
      }
      
      showNotification(
        "Publishing Error", 
        "Error making chart public: " + error.message, 
        'error', 
        5000
      );
    }
  }
}

// Generate chart image for public sharing (without opening new window)
async function generateChartImageForPublic(currentTitle) {
  return new Promise((resolve, reject) => {
    const printArea = document.getElementById("printArea");
    printArea.innerHTML = "";
    
    // Hide UI elements temporarily
    const uiElements = document.querySelectorAll('#showEventFormButton, #eventForm, #legend, #toggleAnnotationsButton, .button-group');
    const originalDisplays = [];
    uiElements.forEach(el => {
      originalDisplays.push(el.style.display);
      el.style.display = 'none';
    });
    
    const printPage = document.createElement("div");
    printPage.id = "printPage";
    printPage.style.background = "#fff";
    printPage.style.padding = "20px";
    printPage.style.boxSizing = "border-box";
    
    const printStyle = document.createElement("style");
    printStyle.innerHTML = `
      #xAxis .month-label, #yAxis .decade-label {
        font-size: 0.7em !important;
        color: #000 !important;
        background: #fff !important;
        border: none !important;
        font-family: sans-serif !important;
        padding: 2px 0 !important;
      }
      #xAxis, #yAxis {
        background: #fff !important;
        border: none !important;
      }
      .event-annotation {
        position: absolute;
        background: rgba(255, 255, 255, 0.95);
        border: 2px solid #4361ee;
        border-radius: 8px;
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 600;
        color: #333;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        z-index: 100;
        max-width: 120px;
        text-align: center;
        line-height: 1.2;
      }
    `;
    printPage.appendChild(printStyle);
    
    // Add header
    const headerDiv = document.createElement("div");
    headerDiv.style.textAlign = "center";
    headerDiv.style.marginBottom = "20px";
    headerDiv.style.fontSize = "24px";
    headerDiv.style.fontWeight = "600";
    headerDiv.style.color = "#333";
    headerDiv.innerHTML = `<h1>${currentTitle}</h1>`;
    printPage.appendChild(headerDiv);
    
    // Clone grid
    const originalGrid = document.getElementById("gridArea");
    if (!originalGrid || originalGrid.offsetWidth === 0 || originalGrid.offsetHeight === 0) {
      reject(new Error("Chart grid not loaded. Please ensure you're on the main app page with your chart visible."));
      // Restore UI elements
      uiElements.forEach((el, i) => {
        el.style.display = originalDisplays[i];
      });
      return;
    }
    
    const gridClone = originalGrid.cloneNode(true);
    gridClone.style.width = originalGrid.offsetWidth + "px";
    gridClone.style.height = originalGrid.offsetHeight + "px";
    gridClone.style.position = "relative";
    
    // Add event annotations
    if (!isPresetMode) {
      lifeEvents.forEach((event, index) => {
        addEventAnnotation(gridClone, event, index, localStorage.getItem("birthDate"));
      });
    }
    
    const gridContainerPrint = document.createElement("div");
    gridContainerPrint.style.marginBottom = "20px";
    gridContainerPrint.appendChild(gridClone);
    printPage.appendChild(gridContainerPrint);
    
    printArea.appendChild(printPage);
    
    // Ensure printPage has dimensions
    if (printPage.offsetWidth === 0 || printPage.offsetHeight === 0) {
      // Force layout calculation
      printPage.style.width = "1200px";
      printPage.style.minHeight = "800px";
      
      // If still no dimensions, wait a bit for rendering
      setTimeout(() => {
        generateImageFromPrintPage();
      }, 100);
      return;
    }
    
    generateImageFromPrintPage();
    
    function generateImageFromPrintPage() {
      // Generate image
      html2canvas(printPage, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: printPage.offsetWidth || 1200,
        height: printPage.offsetHeight || 800,
        logging: false,
        imageTimeout: 0,
        removeContainer: true
      }).then(canvas => {
      const maxWidth = 2400;
      let newWidth = canvas.width;
      let newHeight = canvas.height;
      
      if (canvas.width > maxWidth) {
        const scaleFactor = maxWidth / canvas.width;
        newWidth = maxWidth;
        newHeight = canvas.height * scaleFactor;
      }
      
      const scaledCanvas = document.createElement("canvas");
      scaledCanvas.width = newWidth;
      scaledCanvas.height = newHeight;
      const ctx = scaledCanvas.getContext("2d");
      
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      ctx.drawImage(canvas, 0, 0, newWidth, newHeight);
      const dataUrl = scaledCanvas.toDataURL("image/png", 1.0);
      
      // Restore UI elements
      uiElements.forEach((el, index) => {
        el.style.display = originalDisplays[index];
      });
      
        resolve(dataUrl);
      }).catch(err => {
        // Restore UI elements even on error
        uiElements.forEach((el, index) => {
          el.style.display = originalDisplays[index];
        });
        reject(err);
      });
    }
  });
}

// Gallery navigation function
async function openGallery() {
  window.location.href = "/gallery";
}

// Initialize custom cursor when page loads
// Disabled custom cursor
// document.addEventListener('DOMContentLoaded', function() {
//   initCustomCursor();
// });
