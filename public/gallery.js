// Gallery page JavaScript
let token = localStorage.getItem("token");
const baseUrl = window.location.origin;

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

// DOM elements
const celebritiesItems = document.getElementById("celebritiesItems");
const usersItems = document.getElementById("usersItems");
const backToChartButton = document.getElementById("backToChartButton");
const refreshGalleryButton = document.getElementById("refreshGalleryButton");
const regenerateCelebrityChartsButton = document.getElementById("regenerateCelebrityChartsButton");
const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");

// Tab elements
const celebritiesTab = document.getElementById("celebritiesTab");
const usersTab = document.getElementById("usersTab");
const celebritiesContent = document.getElementById("celebritiesContent");
const usersContent = document.getElementById("usersContent");

// Utility function for retrying API calls
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
}

// Check authentication
if (!token) {
  window.location.href = "/";
}

// Tab functionality
function switchTab(activeTab, activeContent, inactiveTab, inactiveContent) {
  // Update tab states
  activeTab.classList.add('active');
  activeTab.setAttribute('aria-selected', 'true');
  inactiveTab.classList.remove('active');
  inactiveTab.setAttribute('aria-selected', 'false');
  
  // Update content visibility
  activeContent.classList.add('active');
  inactiveContent.classList.remove('active');
}

// Event listeners
backToChartButton.addEventListener("click", () => {
  // Check if user is logged in
  const token = localStorage.getItem("token");
  const birthDate = localStorage.getItem("birthDate");
  
  if (token && birthDate) {
    // User is logged in, go directly to their life chart
    window.location.href = "/app";
  } else {
    // User is not logged in, go to login page
    window.location.href = "/app?fromGallery=true";
  }
});

refreshGalleryButton.addEventListener("click", async () => {
  // Show loading state on refresh button
  const originalText = refreshGalleryButton.textContent;
  refreshGalleryButton.textContent = "⏳ Refreshing...";
  refreshGalleryButton.disabled = true;
  
  try {
    await loadGallery();
  } catch (error) {
    console.error("Error refreshing gallery:", error);
  } finally {
    // Restore button state
    refreshGalleryButton.textContent = originalText;
    refreshGalleryButton.disabled = false;
  }
});

regenerateCelebrityChartsButton.addEventListener("click", async () => {
  // Show loading state on regenerate button
  const originalText = regenerateCelebrityChartsButton.textContent;
  regenerateCelebrityChartsButton.textContent = "⏳ Regenerating...";
  regenerateCelebrityChartsButton.disabled = true;
  
  try {
    const response = await fetchWithRetry(baseUrl + "/api/regenerate-celebrity-charts", {
      method: "POST",
      headers: { "Authorization": "Bearer " + token }
    });
    
    const data = await response.json();
    if (response.ok) {
      showNotification(
        "Success", 
        data.message, 
        'success', 
        4000
      );
      // Refresh the gallery to show updated charts
      await loadGallery();
    } else {
      throw new Error(data.error || "Failed to regenerate celebrity charts");
    }
  } catch (error) {
    console.error("Error regenerating celebrity charts:", error);
    showNotification(
      "Error", 
      "Error regenerating celebrity charts: " + error.message, 
      'error', 
      5000
    );
  } finally {
    // Restore button state
    regenerateCelebrityChartsButton.textContent = originalText;
    regenerateCelebrityChartsButton.disabled = false;
  }
});

// Tab event listeners
celebritiesTab.addEventListener("click", () => {
  switchTab(celebritiesTab, celebritiesContent, usersTab, usersContent);
});

usersTab.addEventListener("click", () => {
  switchTab(usersTab, usersContent, celebritiesTab, celebritiesContent);
});

// Initialize gallery
document.addEventListener("DOMContentLoaded", () => {
  loadGallery();
});

// Reload gallery when page becomes visible (e.g., navigating back)
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    // Reload gallery to show updated charts
    loadGallery();
  }
});

// Also reload on page show (for better browser compatibility)
window.addEventListener("pageshow", (event) => {
  // Check if page is being loaded from cache (back/forward navigation)
  if (event.persisted) {
    loadGallery();
  }
});

async function loadGallery() {
  showLoading();
  
  // Check URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const requestedCelebrity = urlParams.get('celebrity');
  const fromPanic = urlParams.get('fromPanic');
  const shouldRefresh = urlParams.get('refresh') === 'true';
  const requestedTab = urlParams.get('tab');
  
  try {
    // Always load celebrity charts first, regardless of user's public status
    await loadCelebrityCharts();
    
    // Check if user has made their chart public for community charts
    // Add timestamp to prevent caching when refresh is requested
    const statusUrl = shouldRefresh 
      ? `${baseUrl}/api/user-public-status?t=${Date.now()}`
      : `${baseUrl}/api/user-public-status`;
    
    const statusResponse = await fetchWithRetry(statusUrl, {
      headers: { "Authorization": "Bearer " + token }
    });
    
    if (!statusResponse.ok) {
      if (statusResponse.status === 401) {
        // Token expired or invalid
        localStorage.removeItem("token");
        window.location.href = "/";
        return;
      }
      throw new Error(`Failed to check public status: ${statusResponse.status}`);
    }
    
    const statusData = await statusResponse.json();

    // If we're coming from a make public flow but status shows no public chart,
    // retry once after a delay (database might not be updated yet)
    if (shouldRefresh && requestedTab === 'community' && !statusData.hasPublicChart) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Retry the status check
      const retryResponse = await fetchWithRetry(`${baseUrl}/api/user-public-status?t=${Date.now()}`, {
        headers: { "Authorization": "Bearer " + token }
      });
      
      if (retryResponse.ok) {
        const retryData = await retryResponse.json();
        if (retryData.hasPublicChart) {
          statusData.hasPublicChart = true;
        }
      }
    }

    if (!statusData.hasPublicChart) {
      // Show community tab with prompt to share
      showCommunityTabPrompt();
    } else {
      // Load community charts (force refresh if requested)
      await loadCommunityCharts(shouldRefresh);
    }
    
    // Hide loading state after successful load (regardless of public status)
    hideLoading();
    
    // Switch to requested tab if specified
    if (requestedTab === 'community') {
      if (statusData.hasPublicChart) {
        // User has public chart, switch to community tab
        switchTab(usersTab, usersContent, celebritiesTab, celebritiesContent);
      } else {
        // User doesn't have public chart yet, but they requested community tab
        // This might happen if there's a delay in database update
        // Switch to community tab anyway to show the prompt
        switchTab(usersTab, usersContent, celebritiesTab, celebritiesContent);
      }
    }
    
    // Clean up URL parameters after processing
    if (shouldRefresh || requestedTab || fromPanic) {
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
    
    // If requested to show a specific celebrity chart, find and open it
    if (requestedCelebrity && fromPanic) {
      setTimeout(() => {
        openCelebrityChart(requestedCelebrity);
      }, 500); // Small delay to ensure charts are loaded
    }
  } catch (err) {
    console.error("Gallery loading error:", err);
    
    // Provide specific error messages based on error type
    let errorMessage = "Error loading gallery. Please try again.";
    
    if (err.name === "TypeError" && err.message.includes("fetch")) {
      errorMessage = "Network error. Please check your connection and try again.";
    } else if (err.message.includes("401")) {
      errorMessage = "Session expired. Please log in again.";
    } else if (err.message.includes("500")) {
      errorMessage = "Server error. Please try again later.";
    }
    
    showError(errorMessage);
  }
}

function showLoading() {
  loadingState.style.display = "block";
  errorState.style.display = "none";
  
  // Show skeleton loading items for both tabs
  celebritiesItems.innerHTML = "";
  usersItems.innerHTML = "";
  
  for (let i = 0; i < 3; i++) {
    const skeletonItem = document.createElement("div");
    skeletonItem.className = "skeleton-item";
    skeletonItem.innerHTML = `
      <div class="skeleton-image"></div>
      <div class="skeleton-overlay">
        <div class="skeleton-title"></div>
        <div class="skeleton-subtitle"></div>
        <div class="skeleton-date"></div>
      </div>
    `;
    celebritiesItems.appendChild(skeletonItem.cloneNode(true));
    usersItems.appendChild(skeletonItem.cloneNode(true));
  }
}

function hideLoading() {
  loadingState.style.display = "none";
  errorState.style.display = "none";
}

function showError(message) {
  loadingState.style.display = "none";
  errorState.style.display = "block";
  errorState.querySelector("p").textContent = message;
  celebritiesItems.innerHTML = "";
  usersItems.innerHTML = "";
}

// Function to load celebrity charts (always available)
async function loadCelebrityCharts() {
  try {
    const response = await fetchWithRetry(baseUrl + "/api/celebrity-charts", {
      headers: { "Authorization": "Bearer " + token }
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Failed to load celebrity charts: ${response.status}`);
    }

    // Display celebrity charts
    displayCelebrityCharts(data.celebrityCharts || []);
    
  } catch (err) {
    console.error("Celebrity charts loading error:", err);
    // Show empty state for celebrities if there's an error
    displayCelebrityCharts([]);
  }
}

// Function to load community charts (only if user has shared their chart)
async function loadCommunityCharts(forceRefresh = false) {
  try {
    // Add timestamp to prevent caching when force refresh is requested
    const communityUrl = forceRefresh 
      ? `${baseUrl}/api/community-charts?t=${Date.now()}`
      : `${baseUrl}/api/community-charts`;
    
    const response = await fetchWithRetry(communityUrl, {
      headers: { "Authorization": "Bearer " + token }
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Failed to load community charts: ${response.status}`);
    }

    // Display community charts
    displayUserCharts(data.communityCharts || []);
    
  } catch (err) {
    console.error("Community charts loading error:", err);
    // Show empty state for community if there's an error
    displayUserCharts([]);
  }
}

function showCommunityTabPrompt() {
  hideLoading();
  
  // Show tabs but disable community tab
  document.querySelector('.gallery-tabs').style.display = 'flex';
  document.querySelector('.tab-content').style.display = 'block';
  
  // Don't switch tabs - stay on current tab
  // Only switch to celebrities if community tab is currently active
  if (usersTab.classList.contains('active')) {
    // Stay on community tab to show the prompt
  } else {
    // If not on community tab, switch to celebrities
    switchTab(celebritiesTab, celebritiesContent, usersTab, usersContent);
  }
  
  // Show prompt in community tab
  usersItems.innerHTML = `
    <div class="community-prompt">
      <div class="prompt-content">
        <h3>🤝 I'll show you mine if you show me yours</h3>
        <p>Make your life chart public to see other community life charts and get inspired by different life journeys!</p>
        <button id="makeChartPublicBtn" class="make-public-action-btn">
          🌍 Make My Chart Public
        </button>
      </div>
      <div class="sample-charts">
        <div class="sample-chart"></div>
        <div class="sample-chart"></div>
        <div class="sample-chart"></div>
        <div class="sample-chart"></div>
      </div>
    </div>
  `;

  // Add event listener for the make public button
  const makeChartPublicBtn = document.getElementById("makeChartPublicBtn");
  makeChartPublicBtn.addEventListener("click", async () => {
    // Show loading state
    const originalText = makeChartPublicBtn.textContent;
    makeChartPublicBtn.textContent = "⏳ Making Public...";
    makeChartPublicBtn.disabled = true;
    
    try {
      // Create chart image and make it public directly
      await makeChartPublicFromGallery();
    } catch (error) {
      console.error("Error making chart public:", error);
      // Restore button state on error
      makeChartPublicBtn.textContent = originalText;
      makeChartPublicBtn.disabled = false;
      
      showNotification(
        "Error", 
        "Failed to make chart public: " + error.message, 
        'error', 
        5000
      );
    }
  });
}



function displayCelebrityCharts(celebrityCharts) {
  celebritiesItems.innerHTML = "";
  
  if (celebrityCharts.length === 0) {
    celebritiesItems.innerHTML = `
      <div class="empty-tab">
        <h3>🌟 No Celebrity Charts Available</h3>
        <p>Celebrity charts are being generated. Check back soon or use the "Regenerate Celebrity Charts" button above.</p>
      </div>
    `;
    return;
  }

  celebrityCharts.forEach(chart => {
    const itemDiv = document.createElement("div");
    itemDiv.className = "public-gallery-item celebrity-gallery-item";
    
    const img = document.createElement("img");
    img.src = chart.imageData;
    img.alt = `${chart.ownerName}'s Life Chart`;
    
    // Add error handling for image loading
    img.onerror = () => {
      img.src = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjhmOWZhIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBhdmFpbGFibGU8L3RleHQ+PC9zdmc+";
      img.alt = "Image not available";
    };
    
    // Create permanent owner name overlay
    const ownerOverlay = document.createElement("div");
    ownerOverlay.className = "owner-overlay";
    ownerOverlay.innerHTML = `
      <div class="owner-badge">
        <span class="owner-icon">🌟</span>
        <span class="owner-name">${chart.ownerName}</span>
      </div>
    `;
    
    const overlay = document.createElement("div");
    overlay.className = "chart-overlay";
    
    const info = document.createElement("div");
    info.className = "chart-info";
    info.innerHTML = `
      <h4>${chart.chartTitle}</h4>
      <p class="owner-name">by ${chart.ownerName}</p>
      <span class="chart-date">${new Date(chart.createdAt).toLocaleDateString()}</span>
    `;
    
    const actions = document.createElement("div");
    actions.className = "chart-actions";
    
    const viewBtn = document.createElement("button");
    viewBtn.textContent = "👁️ View Full Size";
    viewBtn.className = "chart-action-btn";
    viewBtn.setAttribute("aria-label", `View full size chart by ${chart.ownerName}`);
    viewBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      viewFullSizeChart(chart);
    });
    
    actions.appendChild(viewBtn);
    overlay.appendChild(info);
    overlay.appendChild(actions);
    
    itemDiv.appendChild(img);
    itemDiv.appendChild(ownerOverlay);
    itemDiv.appendChild(overlay);
    
    // Add keyboard navigation support
    itemDiv.setAttribute("tabindex", "0");
    itemDiv.setAttribute("role", "gridcell");
    itemDiv.setAttribute("aria-label", `Celebrity life chart by ${chart.ownerName}: ${chart.chartTitle}`);
    
    // Click handler
    itemDiv.addEventListener("click", () => viewFullSizeChart(chart));
    
    // Keyboard handler
    itemDiv.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        viewFullSizeChart(chart);
      }
    });
    
    celebritiesItems.appendChild(itemDiv);
  });
}

// Function to open a specific celebrity chart
function openCelebrityChart(celebrityName) {
  // Find all celebrity charts that have been loaded
  const celebrityCharts = Array.from(document.querySelectorAll('.celebrity-gallery-item'));
  
  // Find the chart matching the requested celebrity name
  const targetChart = celebrityCharts.find(chartElement => {
    const nameElement = chartElement.querySelector('.chart-info p');
    if (nameElement) {
      const name = nameElement.textContent.replace('by ', '').trim();
      return name === celebrityName;
    }
    return false;
  });
  
  if (targetChart) {
    // Scroll to the chart if needed
    targetChart.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Add a highlight effect
    targetChart.style.transition = 'all 0.3s ease';
    targetChart.style.transform = 'scale(1.05)';
    targetChart.style.boxShadow = '0 0 30px rgba(255, 0, 0, 0.5)';
    
    setTimeout(() => {
      targetChart.style.transform = '';
      targetChart.style.boxShadow = '';
      
      // Click to open the chart
      targetChart.click();
    }, 600);
  } else {
    // If not found, show a notification
    showNotification(
      "Don't Panic!",
      `Looking for ${celebrityName}'s chart... It might still be loading.`,
      'info'
    );
  }
}

function displayUserCharts(userCharts) {
  usersItems.innerHTML = "";
  
  if (userCharts.length === 0) {
    usersItems.innerHTML = `
      <div class="empty-tab">
        <h3>👥 No Community Charts Yet</h3>
        <p>You're among the first! Your public chart will help inspire others to share their life journeys.</p>
      </div>
    `;
    return;
  }

  userCharts.forEach(chart => {
    const itemDiv = document.createElement("div");
    itemDiv.className = "public-gallery-item user-gallery-item";
    
    const img = document.createElement("img");
    img.src = chart.imageData;
    img.alt = `${chart.ownerName}'s Life Chart`;
    
    // Add error handling for image loading
    img.onerror = () => {
      img.src = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjhmOWZhIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBhdmFpbGFibGU8L3RleHQ+PC9zdmc+";
      img.alt = "Image not available";
    };
    
    // Create permanent owner name overlay
    const ownerOverlay = document.createElement("div");
    ownerOverlay.className = "owner-overlay";
    ownerOverlay.innerHTML = `
      <div class="owner-badge">
        <span class="owner-icon">👤</span>
        <span class="owner-name">${chart.ownerName}</span>
      </div>
    `;
    
    const overlay = document.createElement("div");
    overlay.className = "chart-overlay";
    
    const info = document.createElement("div");
    info.className = "chart-info";
    info.innerHTML = `
      <h4>${chart.chartTitle}</h4>
      <p class="owner-name">by ${chart.ownerName}</p>
      <span class="chart-date">${new Date(chart.createdAt).toLocaleDateString()}</span>
    `;
    
    const actions = document.createElement("div");
    actions.className = "chart-actions";
    
    const viewBtn = document.createElement("button");
    viewBtn.textContent = "👁️ View Full Size";
    viewBtn.className = "chart-action-btn";
    viewBtn.setAttribute("aria-label", `View full size chart by ${chart.ownerName}`);
    viewBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      viewFullSizeChart(chart);
    });
    
    actions.appendChild(viewBtn);
    overlay.appendChild(info);
    overlay.appendChild(actions);
    
    itemDiv.appendChild(img);
    itemDiv.appendChild(ownerOverlay);
    itemDiv.appendChild(overlay);
    
    // Add keyboard navigation support
    itemDiv.setAttribute("tabindex", "0");
    itemDiv.setAttribute("role", "gridcell");
    itemDiv.setAttribute("aria-label", `Community life chart by ${chart.ownerName}: ${chart.chartTitle}`);
    
    // Click handler
    itemDiv.addEventListener("click", () => viewFullSizeChart(chart));
    
    // Keyboard handler
    itemDiv.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        viewFullSizeChart(chart);
      }
    });
    
    usersItems.appendChild(itemDiv);
  });
}

// Function to make chart public from gallery
async function makeChartPublicFromGallery() {
  try {
    // Show loading spinner immediately
    showLoading();
    
    // Show a more specific loading message
    const loadingState = document.getElementById("loadingState");
    const loadingText = loadingState.querySelector("p");
    loadingText.textContent = "Making your chart public...";
    
    // Instead of generating a placeholder image, redirect to the main app
    // with a special parameter to trigger the public chart creation
    window.location.href = "/app?action=makePublicFromGallery";
    
  } catch (error) {
    console.error("Error in makeChartPublicFromGallery:", error);
    hideLoading();
    throw error;
  }
}



function viewFullSizeChart(chart) {
  const fullSizeWindow = window.open('', '_blank');
  
  // Try to parse chart data for additional information
  let chartData = null;
  let events = [];
  let birthDate = null;
  let deathDate = null;
  
  try {
    if (chart.chartData) {
      chartData = JSON.parse(chart.chartData);
      events = chartData.events || [];
      birthDate = chartData.birthDate;
      deathDate = chartData.deathDate;
    }
  } catch (e) {
    console.log("Could not parse chart data:", e);
    // Continue without chart data - the image will still be displayed
  }
  
  const hasEvents = events && events.length > 0;
  const isCelebrity = chart.owner === -1;
  
  // For celebrity charts, if we have events but the image might not show them,
  // we'll display the events in a more prominent way
  const shouldEmphasizeEvents = isCelebrity && hasEvents;
  
  // Sanitize chart title and owner name for security
  const safeTitle = chart.chartTitle ? chart.chartTitle.replace(/[<>]/g, '') : 'Untitled Chart';
  const safeOwnerName = chart.ownerName ? chart.ownerName.replace(/[<>]/g, '') : 'Anonymous';
  
  fullSizeWindow.document.write(`
    <html>
      <head>
        <title>${chart.chartTitle}</title>
        <style>
          body { 
            margin: 0; 
            padding: 20px; 
            text-align: center; 
            background: #fafafa; 
            font-family: 'Inter', -apple-system, sans-serif; 
          }
          .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            overflow: hidden;
          }
          .chart-header {
            padding: 30px 20px;
            background: linear-gradient(135deg, #4361ee, #7209b7);
            color: white;
          }
          .chart-header h1 {
            margin: 0 0 10px 0;
            font-size: 2.5rem;
            font-weight: 700;
          }
          .chart-header p {
            margin: 0;
            font-size: 1.1rem;
            opacity: 0.9;
          }
          .chart-content {
            padding: 30px;
          }
          img { 
            max-width: 100%; 
            height: auto; 
            border: 1px solid #eaeaea; 
            border-radius: 8px; 
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          }
          .chart-info {
            margin-top: 30px;
            text-align: left;
            max-width: 800px;
            margin-left: auto;
            margin-right: auto;
          }
          .chart-info h2 {
            color: #333;
            border-bottom: 2px solid #4361ee;
            padding-bottom: 10px;
            margin-bottom: 20px;
          }
          .event-list {
            display: grid;
            gap: 15px;
            margin-top: 20px;
          }
          .event-item {
            background: #f8f9fa;
            border-left: 4px solid #4361ee;
            padding: 15px;
            border-radius: 8px;
          }
          .event-title {
            font-weight: 600;
            color: #333;
            margin-bottom: 5px;
          }
          .event-date {
            color: #666;
            font-size: 0.9rem;
            margin-bottom: 8px;
          }
          .event-description {
            color: #555;
            line-height: 1.5;
          }
          .metadata {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin-top: 20px;
          }
          .metadata h3 {
            margin: 0 0 15px 0;
            color: #333;
          }
          .metadata p {
            margin: 5px 0;
            color: #666;
          }
          .no-events {
            text-align: center;
            color: #666;
            font-style: italic;
            padding: 40px 20px;
          }
          .celebrity-events-notice {
            background: #e3f2fd;
            border: 1px solid #2196f3;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 20px;
            color: #1976d2;
          }
          .celebrity-events-notice p {
            margin: 0;
            font-size: 0.95rem;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="chart-header">
            <h1>${safeTitle}</h1>
            <p>by ${safeOwnerName} • ${new Date(chart.createdAt).toLocaleDateString()}</p>
          </div>
          <div class="chart-content">
            <img src="${chart.imageData}" alt="${safeTitle}">
            
            <div class="chart-info">
              ${hasEvents ? `
                <h2>Life Events (${events.length})</h2>
                ${shouldEmphasizeEvents ? `
                  <div class="celebrity-events-notice">
                    <p><strong>Note:</strong> This celebrity chart contains ${events.length} life events. The events are listed below and may also be visible on the chart image above.</p>
                  </div>
                ` : ''}
                <div class="event-list">
                  ${events.map(event => `
                    <div class="event-item">
                      <div class="event-title">${event.title ? event.title.replace(/[<>]/g, '') : 'Untitled Event'}</div>
                      <div class="event-date">${new Date(event.startDate).toLocaleDateString()}${event.endDate && event.endDate !== event.startDate ? ` - ${new Date(event.endDate).toLocaleDateString()}` : ''}</div>
                      ${event.description ? `<div class="event-description">${event.description.replace(/[<>]/g, '')}</div>` : ''}
                    </div>
                  `).join('')}
                </div>
              ` : `
                <div class="no-events">
                  <h2>Life Events</h2>
                  <p>No detailed events available for this chart.</p>
                </div>
              `}
              
              ${birthDate || deathDate ? `
                <div class="metadata">
                  <h3>Chart Information</h3>
                  ${birthDate ? `<p><strong>Birth Date:</strong> ${new Date(birthDate).toLocaleDateString()}</p>` : ''}
                  ${deathDate ? `<p><strong>Death Date:</strong> ${new Date(deathDate).toLocaleDateString()}</p>` : ''}
                  ${isCelebrity ? `<p><strong>Type:</strong> Celebrity Life Chart</p>` : '<p><strong>Type:</strong> Personal Life Chart</p>'}
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      </body>
    </html>
  `);
  fullSizeWindow.document.close();
} 