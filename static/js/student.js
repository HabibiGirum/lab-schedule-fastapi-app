// JavaScript for Student Dashboard

let websocket = null;
let computers = [];
let myBookings = [];
let tomorrowBookings = [];
let currentUser = null;

// Initialize the application
document.addEventListener("DOMContentLoaded", function () {
  initializeWebSocket();
  loadInitialData();
  setupEventListeners();
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
    await Promise.all([
      loadComputers(),
      loadMyBookings(),
      loadTomorrowBookings(),
    ]);
    renderComputerGrid();
    renderMyBookingsTable();
    renderTomorrowBookingsTable();
    updateLabStats();
    populateBookingDropdowns();
  } catch (error) {
    console.error("Error loading initial data:", error);
    showAlert("Error loading data. Please refresh the page.", "danger");
  }
}

async function loadComputers() {
  const response = await fetch("/api/student/computers", {
    headers: {
      Authorization: getAuthHeader(),
    },
  });
  if (response.ok) {
    computers = await response.json();
  } else {
    throw new Error("Failed to load computers");
  }
}

async function loadMyBookings() {
  const response = await fetch("/api/student/bookings", {
    headers: {
      Authorization: getAuthHeader(),
    },
  });
  if (response.ok) {
    myBookings = await response.json();
  } else {
    throw new Error("Failed to load bookings");
  }
}

async function loadTomorrowBookings() {
  const response = await fetch("/api/student/bookings/tomorrow", {
    headers: {
      Authorization: getAuthHeader(),
    },
  });
  if (response.ok) {
    tomorrowBookings = await response.json();
  } else {
    throw new Error("Failed to load tomorrow's bookings");
  }
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

// Render my bookings table
function renderMyBookingsTable() {
  const tbody = document.getElementById("my-bookings-table");
  tbody.innerHTML = "";

  const upcomingBookings = myBookings
    .filter((booking) => {
      const endTime = new Date(booking.end_time);
      return endTime > new Date();
    })
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  upcomingBookings.forEach((booking) => {
    const row = createMyBookingRow(booking);
    tbody.appendChild(row);
  });
}

function createMyBookingRow(booking) {
  const row = document.createElement("tr");

  const computer = computers.find((c) => c.id === booking.computer_id);
  const statusBadge = getStatusBadge(booking.status);

  row.innerHTML = `
        <td>${computer ? computer.name : "Unknown"}</td>
        <td>${formatDateTime(booking.start_time)}</td>
        <td>${formatDateTime(booking.end_time)}</td>
        <td>${statusBadge}</td>
        <td>
            <button class="btn btn-sm btn-outline-danger" onclick="cancelMyBooking(${
              booking.id
            })">
                <i class="fas fa-times"></i> Cancel
            </button>
        </td>
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

// Render tomorrow's bookings table
function renderTomorrowBookingsTable() {
  const tbody = document.getElementById("tomorrow-bookings-table");
  tbody.innerHTML = "";

  tomorrowBookings.forEach((booking) => {
    const row = createTomorrowBookingRow(booking);
    tbody.appendChild(row);
  });
}

function createTomorrowBookingRow(booking) {
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

// Event listeners
function setupEventListeners() {
  // Set default times for booking (Addis Ababa timezone)
  const now = new Date();
  const startTime = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 2 hours from now

  document.getElementById("startTime").value = formatDateTimeLocal(startTime);
  document.getElementById("endTime").value = formatDateTimeLocal(endTime);
}

// API functions
async function createBooking() {
  const computerId = parseInt(document.getElementById("bookingComputer").value);
  const startTime = document.getElementById("startTime").value;
  const endTime = document.getElementById("endTime").value;

  try {
    const response = await fetch("/api/student/bookings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: getAuthHeader(),
      },
      body: JSON.stringify({
        computer_id: computerId,
        start_time: startTime,
        end_time: endTime,
      }),
    });

    if (response.ok) {
      await loadMyBookings();
      renderMyBookingsTable();
      bootstrap.Modal.getInstance(
        document.getElementById("bookingModal")
      ).hide();
      document.getElementById("bookingForm").reset();
      showAlert("Booking created successfully!", "success");
    } else {
      const error = await response.json();
      showAlert(`Error: ${error.detail}`, "danger");
    }
  } catch (error) {
    console.error("Error creating booking:", error);
    showAlert("Error creating booking. Please try again.", "danger");
  }
}

async function cancelMyBooking(bookingId) {
  if (confirm("Are you sure you want to cancel this booking?")) {
    try {
      showAlert("Booking cancellation feature coming soon!", "info");
    } catch (error) {
      console.error("Error cancelling booking:", error);
      showAlert("Error cancelling booking. Please try again.", "danger");
    }
  }
}

// Utility functions
function populateBookingDropdowns() {
  const computerSelect = document.getElementById("bookingComputer");

  // Clear existing options
  computerSelect.innerHTML = '<option value="">Select Computer</option>';

  // Add computers
  computers.forEach((computer) => {
    const option = document.createElement("option");
    option.value = computer.id;
    option.textContent = computer.name;
    computerSelect.appendChild(option);
  });
}

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

function formatDateTimeLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
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

function getAuthHeader() {
  // This would normally get the auth token from localStorage or cookies
  // For now, we'll use basic auth
  const username = localStorage.getItem("username");
  const password = localStorage.getItem("password");
  if (username && password) {
    return "Basic " + btoa(username + ":" + password);
  }
  return "";
}

function logout() {
  localStorage.removeItem("username");
  localStorage.removeItem("password");
  window.location.href = "/";
}
