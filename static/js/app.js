// JavaScript for Computer Lab Scheduler - Login Page

let websocket = null;
let computers = [];
let bookings = [];

// Initialize the application
document.addEventListener("DOMContentLoaded", function () {
  initializeWebSocket();
  loadInitialData();
});

// WebSocket connection
function initializeWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  websocket = new WebSocket(wsUrl);

  websocket.onopen = function (event) {
    console.log("WebSocket connected");
    updateConnectionStatus(true);
  };

  websocket.onmessage = function (event) {
    try {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
    } catch (e) {
      console.log("Received message:", event.data);
    }
  };

  websocket.onclose = function (event) {
    console.log("WebSocket disconnected");
    updateConnectionStatus(false);
    // Attempt to reconnect after 3 seconds
    setTimeout(initializeWebSocket, 3000);
  };

  websocket.onerror = function (error) {
    console.error("WebSocket error:", error);
    updateConnectionStatus(false);
  };
}

function updateConnectionStatus(connected) {
  const statusElement = document.getElementById("connection-status");
  if (connected) {
    statusElement.textContent = "Connected";
    statusElement.className = "badge bg-success";
  } else {
    statusElement.textContent = "Disconnected";
    statusElement.className = "badge bg-danger";
  }
}

function handleWebSocketMessage(data) {
  if (data.type === "computer_status_update") {
    updateComputerInGrid(data);
    refreshLabStats();
  }
}

// Load initial data
async function loadInitialData() {
  try {
    await Promise.all([loadComputers(), loadBookings()]);
    renderComputerGrid();
    renderBookingsTable();
    updateLabStats();
  } catch (error) {
    console.error("Error loading initial data:", error);
    showAlert("Error loading data. Please refresh the page.", "danger");
  }
}

async function loadComputers() {
  const response = await fetch("/api/computers");
  computers = await response.json();
}

async function loadBookings() {
  const response = await fetch("/api/lab-status");
  const data = await response.json();
  bookings = data.upcoming_bookings || [];
}

// Render computer grid
function renderComputerGrid() {
  const grid = document.getElementById("computer-grid");
  grid.innerHTML = "";

  computers.forEach((computer) => {
    const computerCard = createComputerCard(computer);
    grid.appendChild(computerCard);
  });
}

function createComputerCard(computer) {
  const col = document.createElement("div");
  col.className = "col-md-4 col-lg-3";

  const card = document.createElement("div");
  card.className = `computer-card ${computer.status}`;

  const statusClass =
    computer.status === "available"
      ? "available"
      : computer.status === "in_use"
      ? "in-use"
      : "maintenance";

  card.innerHTML = `
        <div class="computer-status ${statusClass}">
            <span class="status-indicator ${statusClass}"></span>
            ${computer.name}
        </div>
        <div class="computer-info">
            <div><strong>Status:</strong> ${computer.status
              .replace("_", " ")
              .toUpperCase()}</div>
            ${
              computer.current_user
                ? `<div><strong>User:</strong> ${computer.current_user}</div>`
                : ""
            }
            <div><strong>Last Updated:</strong> ${formatDateTime(
              computer.last_updated
            )}</div>
        </div>
    `;

  col.appendChild(card);
  return col;
}

function updateComputerInGrid(data) {
  const computer = computers.find((c) => c.id === data.computer_id);
  if (computer) {
    computer.status = data.status;
    computer.current_user = data.current_user;
    computer.last_updated = data.timestamp;
    renderComputerGrid();
  }
}

// Render bookings table
function renderBookingsTable() {
  const tbody = document.getElementById("bookings-table");
  tbody.innerHTML = "";

  const upcomingBookings = bookings
    .filter((booking) => {
      const endTime = new Date(booking.end_time);
      return endTime > new Date();
    })
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  upcomingBookings.forEach((booking) => {
    const row = createBookingRow(booking);
    tbody.appendChild(row);
  });
}

function createBookingRow(booking) {
  const row = document.createElement("tr");

  const computer = computers.find((c) => c.id === booking.computer_id);
  const statusBadge = getStatusBadge(booking.status);

  row.innerHTML = `
        <td>${computer ? computer.name : "Unknown"}</td>
        <td>${formatDateTime(booking.start_time)}</td>
        <td>${formatDateTime(booking.end_time)}</td>
        <td>${statusBadge}</td>
    `;

  return row;
}

function getStatusBadge(status) {
  const badges = {
    scheduled: '<span class="badge bg-primary">Scheduled</span>',
    active: '<span class="badge bg-success">Active</span>',
    completed: '<span class="badge bg-secondary">Completed</span>',
    cancelled: '<span class="badge bg-danger">Cancelled</span>',
  };
  return badges[status] || '<span class="badge bg-secondary">Unknown</span>';
}

// Update lab statistics
function updateLabStats() {
  const stats = {
    available: computers.filter((c) => c.status === "available").length,
    inUse: computers.filter((c) => c.status === "in_use").length,
    maintenance: computers.filter((c) => c.status === "maintenance").length,
    total: computers.length,
  };

  document.getElementById("available-count").textContent = stats.available;
  document.getElementById("in-use-count").textContent = stats.inUse;
  document.getElementById("maintenance-count").textContent = stats.maintenance;
  document.getElementById("total-count").textContent = stats.total;
}

function refreshLabStats() {
  updateLabStats();
}

// Login functionality
async function login() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  if (!username || !password) {
    showAlert("Please enter both username and password.", "warning");
    return;
  }

  try {
    // Store credentials for API calls
    localStorage.setItem("username", username);
    localStorage.setItem("password", password);

    // Test authentication by getting user info
    const response = await fetch("/api/auth/me", {
      headers: {
        Authorization: "Basic " + btoa(username + ":" + password),
      },
    });

    if (response.ok) {
      const user = await response.json();

      // Redirect based on user role
      if (user.role === "admin") {
        window.location.href = "/admin";
      } else if (user.role === "student") {
        window.location.href = "/student";
      } else {
        showAlert("Unknown user role. Please contact administrator.", "danger");
      }
    } else {
      const error = await response.json();
      showAlert(`Login failed: ${error.detail}`, "danger");
      localStorage.removeItem("username");
      localStorage.removeItem("password");
    }
  } catch (error) {
    console.error("Login error:", error);
    showAlert("Login failed. Please check your credentials.", "danger");
    localStorage.removeItem("username");
    localStorage.removeItem("password");
  }
}

// Utility functions
function refreshData() {
  loadInitialData();
  showAlert("Data refreshed!", "info");
}

function formatDateTime(dateString) {
  const date = new Date(dateString);
  // Convert to Addis Ababa timezone (UTC+3)
  const addisAbabaTime = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  return addisAbabaTime.toLocaleString("en-US", {
    timeZone: "Africa/Addis_Ababa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function showAlert(message, type) {
  // Create alert element
  const alertDiv = document.createElement("div");
  alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
  alertDiv.style.cssText =
    "top: 20px; right: 20px; z-index: 9999; min-width: 300px;";
  alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

  document.body.appendChild(alertDiv);

  // Auto remove after 5 seconds
  setTimeout(() => {
    if (alertDiv.parentNode) {
      alertDiv.parentNode.removeChild(alertDiv);
    }
  }, 5000);
}
