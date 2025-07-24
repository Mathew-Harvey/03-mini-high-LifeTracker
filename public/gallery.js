// Gallery page JavaScript
let token = localStorage.getItem("token");
const baseUrl = window.location.origin;

// DOM elements
const galleryItems = document.getElementById("galleryItems");
const backToChartButton = document.getElementById("backToChartButton");
const refreshGalleryButton = document.getElementById("refreshGalleryButton");
const regenerateCelebrityChartsButton = document.getElementById("regenerateCelebrityChartsButton");
const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");

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

// Event listeners
backToChartButton.addEventListener("click", () => {
  window.location.href = "/";
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
      alert(`✅ ${data.message}`);
      // Refresh the gallery to show updated charts
      await loadGallery();
    } else {
      throw new Error(data.error || "Failed to regenerate celebrity charts");
    }
  } catch (error) {
    console.error("Error regenerating celebrity charts:", error);
    alert("Error regenerating celebrity charts: " + error.message);
  } finally {
    // Restore button state
    regenerateCelebrityChartsButton.textContent = originalText;
    regenerateCelebrityChartsButton.disabled = false;
  }
});

// Initialize gallery
document.addEventListener("DOMContentLoaded", () => {
  loadGallery();
});

async function loadGallery() {
  showLoading();
  
  try {
    // Check if user has made their chart public
    const statusResponse = await fetchWithRetry(baseUrl + "/api/user-public-status", {
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

    if (!statusData.hasPublicChart) {
      // Show blurred gallery with prompt
      showPrivateGalleryPrompt();
    } else {
      // Show public charts
      await showPublicCharts();
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
  
  // Show skeleton loading items
  galleryItems.innerHTML = "";
  for (let i = 0; i < 6; i++) {
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
    galleryItems.appendChild(skeletonItem);
  }
}

function showError(message) {
  loadingState.style.display = "none";
  errorState.style.display = "block";
  errorState.querySelector("p").textContent = message;
  galleryItems.innerHTML = "";
}

function showPrivateGalleryPrompt() {
  loadingState.style.display = "none";
  errorState.style.display = "none";
  
  galleryItems.innerHTML = `
    <div class="private-gallery-prompt">
      <div class="blurred-preview">
        <div class="blur-overlay">
          <h3>🤝 I'll show you mine if you show me yours</h3>
          <p>Make your life chart public to see other public life charts and get inspired by different life journeys!</p>
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
      // Navigate back to main page to make chart public
      window.location.href = "/?makePublic=true";
    } catch (error) {
      console.error("Error navigating to make public:", error);
      // Restore button state on error
      makeChartPublicBtn.textContent = originalText;
      makeChartPublicBtn.disabled = false;
    }
  });
}

async function showPublicCharts() {
  try {
    const response = await fetchWithRetry(baseUrl + "/api/public-charts", {
      headers: { "Authorization": "Bearer " + token }
    });
    const data = await response.json();

    if (!response.ok) {
      if (data.requiresPublic) {
        showPrivateGalleryPrompt();
        return;
      }
      
      // Handle specific error cases
      if (response.status === 401) {
        localStorage.removeItem("token");
        window.location.href = "/";
        return;
      }
      
      throw new Error(data.error || `Failed to load public charts: ${response.status}`);
    }

    loadingState.style.display = "none";
    errorState.style.display = "none";

    if (data.publicCharts.length === 0) {
      galleryItems.innerHTML = `
        <div class="empty-gallery">
          <h3>🌟 No Public Charts Yet</h3>
          <p>You're among the first! Your public chart will help inspire others to share their life journeys.</p>
        </div>
      `;
      return;
    }

    // Display public charts in a modern grid layout
    galleryItems.innerHTML = "";
    data.publicCharts.forEach(chart => {
      const itemDiv = document.createElement("div");
      itemDiv.className = "public-gallery-item";
      
      const img = document.createElement("img");
      img.src = chart.imageData;
      img.alt = `${chart.ownerName}'s Life Chart`;
      
      // Add error handling for image loading
      img.onerror = () => {
        img.src = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjhmOWZhIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBhdmFpbGFibGU8L3RleHQ+PC9zdmc+";
        img.alt = "Image not available";
      };
      
      const overlay = document.createElement("div");
      overlay.className = "chart-overlay";
      
      const info = document.createElement("div");
      info.className = "chart-info";
      info.innerHTML = `
        <h4>${chart.chartTitle}</h4>
        <p>by ${chart.ownerName}</p>
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
      itemDiv.appendChild(overlay);
      
      // Add keyboard navigation support
      itemDiv.setAttribute("tabindex", "0");
      itemDiv.setAttribute("role", "gridcell");
      itemDiv.setAttribute("aria-label", `Life chart by ${chart.ownerName}: ${chart.chartTitle}`);
      
      // Click handler
      itemDiv.addEventListener("click", () => viewFullSizeChart(chart));
      
      // Keyboard handler
      itemDiv.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          viewFullSizeChart(chart);
        }
      });
      
      galleryItems.appendChild(itemDiv);
    });

  } catch (err) {
    console.error("Public charts loading error:", err);
    
    let errorMessage = "Error loading public charts. Please try again.";
    
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