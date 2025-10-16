// JavaScript for Admin Dashboard

let websocket = null;
let computers = [];
let students = [];
let bookings = [];
let tomorrowBookings = [];
let usersStatus = [];
let currentUser = null;
let weekSchedule = null;
let scheduleComputers = [];
let studentsSummary = [];

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
  // Require credentials before calling admin APIs
  if (!getAuthHeader()) {
    showAlert("Please login to access the admin dashboard.", "info");
    // Redirect to home to login
    setTimeout(() => {
      window.location.href = "/";
    }, 600);
    return;
  }
  try {
    await Promise.all([
      loadComputers(),
      loadStudents(),
      loadBookings(),
      loadTomorrowBookings(),
      loadUsersStatus(),
      loadWeekSchedule(),
      loadStudentsSummary(),
    ]);
    renderComputerGrid();
    renderBookingsTable();
    renderWeekSchedule();
    renderTomorrowBookingsTable();
    renderUsersStatusTable();
    updateLabStats();
    renderStudentsSummaryTable();
  } catch (error) {
    console.error("Error loading initial data:", error);
    // Fallback: try at least to load students summary so the table shows
    try {
      await loadStudentsSummary();
      renderStudentsSummaryTable();
    } catch (_) {}
    showAlert(
      "Some data failed to load. Verify credentials and refresh.",
      "warning"
    );
  }
}

async function loadComputers() {
  const response = await fetch("/api/admin/computers", {
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

async function loadStudents() {
  const response = await fetch("/api/admin/students", {
    headers: {
      Authorization: getAuthHeader(),
    },
  });
  if (response.ok) {
    students = await response.json();
  } else {
    throw new Error("Failed to load students");
  }
}

async function loadBookings() {
  const response = await fetch("/api/lab-status");
  if (response.ok) {
    const data = await response.json();
    bookings = data.upcoming_bookings || [];
  } else {
    throw new Error("Failed to load bookings");
  }
}

async function loadTomorrowBookings() {
  const response = await fetch("/api/admin/bookings/tomorrow", {
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

async function loadUsersStatus() {
  const response = await fetch("/api/admin/users/status", {
    headers: {
      Authorization: getAuthHeader(),
    },
  });
  if (response.ok) {
    usersStatus = await response.json();
  } else {
    throw new Error("Failed to load users status");
  }
}

async function loadWeekSchedule() {
  const response = await fetch("/api/admin/schedule/week", {
    headers: { Authorization: getAuthHeader() },
  });
  if (!response.ok) throw new Error("Failed to load week schedule");
  weekSchedule = await response.json();
  scheduleComputers = weekSchedule.computers || [];
}

async function loadStudentsSummary() {
  // Try summary endpoint first
  const response = await fetch("/api/admin/students/summary", {
    headers: { Authorization: getAuthHeader() },
  });
  if (response.ok) {
    studentsSummary = await response.json();
    return;
  }
  // Fallback: fetch raw students and map
  const rawRes = await fetch("/api/admin/students", {
    headers: { Authorization: getAuthHeader() },
  });
  if (!rawRes.ok) throw new Error("Failed to load students");
  const rawStudents = await rawRes.json();
  studentsSummary = rawStudents.map((s) => ({
    id: s.id,
    name: s.name,
    email: s.email,
    study: s.study || "",
    department: s.department || "",
    date: s.registered_at || s.date || null,
    is_active: typeof s.active === "boolean" ? s.active : null,
    usage_days_total: s.usage_days_total ?? null,
    usage_days_remaining: s.usage_days_remaining ?? null,
  }));
}

// Render computer grid
function renderComputerGrid() {
  const grid = document.getElementById("computer-grid");
  grid.innerHTML = "";

  computers.forEach((computer) => {
    const computerCard = createComputerCard(computer);
    grid.appendChild(computerCard);
  });
  populateAssignSelects();
}

function createComputerCard(computer) {
  const col = document.createElement("div");
  col.className = "col-md-4 col-lg-3";

  const card = document.createElement("div");
  card.className = `computer-card ${computer.status}`;
  // Build simple assign UI inside card

  const statusClass =
    computer.status === "available"
      ? "available"
      : computer.status === "in_use"
      ? "in-use"
      : "maintenance";

  // Lookup usage info for the assigned student, if any
  let usageText = "-";
  const assignedOnText = computer.last_updated
    ? formatDateTime(computer.last_updated)
    : "";
  if (
    computer.current_user &&
    Array.isArray(studentsSummary) &&
    studentsSummary.length > 0
  ) {
    const summary = studentsSummary.find(
      (s) => s.name === computer.current_user
    );
    if (summary && summary.usage_days_total != null) {
      const remaining = summary.usage_days_remaining ?? 0;
      usageText = `${remaining}/${summary.usage_days_total}`;
    }
  }

  card.innerHTML = `
        <div class="computer-status ${statusClass}">
            <span class="status-indicator ${statusClass}"></span>
            ${computer.name}
        </div>
        <div class="computer-info">
            ${
              computer.status === "available"
                ? `<div class=\"mb-2\"><select class=\"form-select form-select-sm\" id=\"assignSelect-${computer.id}\"></select></div>
                   <button class=\"btn btn-sm btn-success\" onclick=\"assignStudent(${computer.id})\">Assign</button>`
                : `<div class=\"mb-1\"><strong>Assigned to:</strong> ${
                    computer.current_user || ""
                  }</div>
                   <div class=\"mb-1\"><strong>Usage Left:</strong> ${usageText}</div>
                   <div class=\"mb-1\"><strong>Assigned On:</strong> ${assignedOnText}</div>
                   <button class=\"btn btn-sm btn-outline-danger\" onclick=\"unassignStudent(${
                     computer.id
                   })\">Unassign</button>`
            }
            <div class=\"mt-2\">
              <button class=\"btn btn-sm btn-outline-secondary\" onclick=\"deleteComputer(${
                computer.id
              })\">Delete</button>
            </div>
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

function populateAssignSelects() {
  // fill selects with students
  computers.forEach((c) => {
    const sel = document.getElementById(`assignSelect-${c.id}`);
    if (sel) {
      sel.innerHTML = students
        .map((s) => `<option value="${s.id}">${s.name}</option>`)
        .join("");
    }
  });
}

// Render bookings table
function renderBookingsTable() {
  const tbody = document.getElementById("bookings-table");
  if (!tbody) return;
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
  const student = students.find((s) => s.id === booking.student_id);

  const statusBadge = getStatusBadge(booking.status);

  row.innerHTML = `
        <td>${computer ? computer.name : "Unknown"}</td>
        <td>${student ? student.name : "Unknown"}</td>
        <td>${formatDateTime(booking.start_time)}</td>
        <td>${formatDateTime(booking.end_time)}</td>
        <td>${statusBadge}</td>
        <td>
            <button class="btn btn-sm btn-outline-danger" onclick="cancelBooking(${
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

function renderStudentsSummaryTable() {
  const tbody = document.getElementById("students-summary-table");
  if (!tbody) return;
  tbody.innerHTML = "";
  studentsSummary.forEach((s) => {
    const tr = document.createElement("tr");
    const activeBadge =
      s.is_active === true
        ? '<span class="badge bg-success">Active</span>'
        : '<span class="badge bg-secondary">Inactive</span>';
    const usageText =
      s.usage_days_total != null
        ? `${s.usage_days_remaining ?? 0}/${s.usage_days_total}`
        : "-";
    tr.innerHTML = `
      <td>${s.name || ""}</td>
      <td>${s.email || ""}</td>
      <td>${s.study || ""}</td>
      <td>${s.department || ""}</td>
      <td>${s.date ? formatDateTime(s.date) : ""}</td>
      <td>${activeBadge}</td>
      <td>${usageText}</td>
      <td>
        <button class="btn btn-sm btn-outline-primary" onclick="toggleStudentActive(${
          s.id
        })">Toggle Active</button>
        <button class="btn btn-sm btn-outline-secondary ms-1" onclick="openEditUsage(${
          s.id
        })">Edit Usage</button>
        <button class="btn btn-sm btn-outline-danger ms-1" onclick="deleteStudent(${
          s.id
        })">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openEditUsage(studentId) {
  document.getElementById("editUsageStudentId").value = String(studentId);
  const field = document.getElementById("editUsageDays");
  if (field) field.value = "";
  new bootstrap.Modal(document.getElementById("editUsageModal")).show();
}

async function submitEditUsage() {
  const studentId = parseInt(
    document.getElementById("editUsageStudentId").value
  );
  const daysVal = document.getElementById("editUsageDays").value;
  const days = parseInt(daysVal, 10);
  if (isNaN(days)) {
    showAlert("Enter a valid number of days.", "warning");
    return;
  }
  try {
    const res = await fetch(`/api/admin/students/${studentId}/usage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: getAuthHeader(),
      },
      body: JSON.stringify({ days }),
    });
    if (!res.ok) {
      const t = await res.text();
      showAlert(`Update usage failed: ${t}`, "danger");
      return;
    }
    await loadStudentsSummary();
    renderStudentsSummaryTable();
    bootstrap.Modal.getInstance(
      document.getElementById("editUsageModal")
    ).hide();
    showAlert("Usage updated.", "success");
  } catch (e) {
    showAlert("Error updating usage.", "danger");
  }
}

function renderWeekSchedule() {
  if (!weekSchedule) return;
  const headers = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  headers.forEach((h, i) => {
    const el = document.getElementById(`weekday-header-${i}`);
    if (el) el.textContent = h;
  });
  const pcSelect = document.getElementById("scheduleComputerSelect");
  if (pcSelect) {
    pcSelect.innerHTML = scheduleComputers
      .map((c) => `<option value="${c.id}">${c.name}</option>`)
      .join("");
  }
  const tbody = document.getElementById("weekly-schedule-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  weekSchedule.rows.forEach((row) => {
    const tr = document.createElement("tr");
    const studentTd = document.createElement("td");
    studentTd.textContent = row.student_name;
    tr.appendChild(studentTd);
    row.days.forEach((cell) => {
      const td = document.createElement("td");
      td.className = "text-center";
      if (cell.has_booking) {
        const comp = scheduleComputers.find((c) => c.id === cell.computer_id);
        td.innerHTML = `
          <div class=\"d-grid gap-1\">
            <span class=\"badge bg-primary\">${comp ? comp.name : "PC"}</span>
            <button class=\"btn btn-sm btn-outline-danger\" data-student=\"${
              row.student_id
            }\" data-date=\"${
          cell.date
        }\" onclick=\"toggleWeekCell(this)\">Remove</button>
          </div>`;
      } else {
        const pcOptions = scheduleComputers
          .map((c) => `<option value=\"${c.id}\">${c.name}</option>`)
          .join("");
        td.innerHTML = `
          <div class=\"input-group input-group-sm\">
            <select class=\"form-select\" id=\"week-pc-${row.student_id}-${cell.date}\">${pcOptions}</select>
            <button class=\"btn btn-success\" data-student=\"${row.student_id}\" data-date=\"${cell.date}\" onclick=\"toggleWeekCell(this)\">Add</button>
          </div>`;
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

async function toggleWeekCell(btn) {
  const studentId = parseInt(btn.getAttribute("data-student"));
  const date = btn.getAttribute("data-date");
  const inlineSelect = document.getElementById(`week-pc-${studentId}-${date}`);
  const topSelect = document.getElementById("scheduleComputerSelect");
  let computerId = undefined;
  if (inlineSelect && inlineSelect.value)
    computerId = parseInt(inlineSelect.value);
  else if (topSelect && topSelect.value) computerId = parseInt(topSelect.value);
  const payload = { student_id: studentId, date };
  if (btn.textContent.includes("Add")) payload.computer_id = computerId;
  const res = await fetch("/api/admin/schedule/toggle", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errText = await res.text();
    showAlert(`Schedule update failed: ${errText}`, "danger");
    return;
  }
  await loadWeekSchedule();
  renderWeekSchedule();
}

// Render tomorrow's bookings table
function renderTomorrowBookingsTable() {
  const tbody = document.getElementById("tomorrow-bookings-table");
  if (!tbody) return;
  tbody.innerHTML = "";

  tomorrowBookings.forEach((booking) => {
    const row = createTomorrowBookingRow(booking);
    tbody.appendChild(row);
  });
}

function createTomorrowBookingRow(booking) {
  const row = document.createElement("tr");

  const computer = computers.find((c) => c.id === booking.computer_id);
  const student = students.find((s) => s.id === booking.student_id);
  const statusBadge = getStatusBadge(booking.status);

  row.innerHTML = `
        <td>${computer ? computer.name : "Unknown"}</td>
        <td>${student ? student.name : "Unknown"}</td>
        <td>${formatDateTime(booking.start_time)}</td>
        <td>${formatDateTime(booking.end_time)}</td>
        <td>${statusBadge}</td>
    `;

  return row;
}

// Render users status table
function renderUsersStatusTable() {
  const tbody = document.getElementById("user-status-table");
  if (!tbody) return;
  tbody.innerHTML = "";

  usersStatus.forEach((user) => {
    const row = createUserStatusRow(user);
    tbody.appendChild(row);
  });
}

function createUserStatusRow(user) {
  const row = document.createElement("tr");

  const hasBookingBadge = user.has_tomorrow_booking
    ? '<span class="badge bg-success">Yes</span>'
    : '<span class="badge bg-secondary">No</span>';

  row.innerHTML = `
        <td>${user.username}</td>
        <td>${user.student_name || "N/A"}</td>
        <td>${user.student_id || "N/A"}</td>
        <td>${hasBookingBadge}</td>
        <td>${user.tomorrow_bookings.length}</td>
        <td><button class="btn btn-sm btn-outline-danger" onclick="deleteUser(${
          user.user_id
        })">Delete</button></td>
    `;

  return row;
}

// Modal functions
function openComputerStatusModal(computer) {
  document.getElementById("statusComputerId").value = computer.id;
  document.getElementById("statusSelect").value = computer.status;
  document.getElementById("currentUser").value = computer.current_user || "";

  const currentUserDiv = document.getElementById("currentUserDiv");
  if (computer.status === "in_use") {
    currentUserDiv.style.display = "block";
  } else {
    currentUserDiv.style.display = "none";
  }

  new bootstrap.Modal(document.getElementById("computerStatusModal")).show();
}

// Event listeners
function setupEventListeners() {
  // Status select change
  document
    .getElementById("statusSelect")
    .addEventListener("change", function () {
      const currentUserDiv = document.getElementById("currentUserDiv");
      if (this.value === "in_use") {
        currentUserDiv.style.display = "block";
      } else {
        currentUserDiv.style.display = "none";
      }
    });
}

// API functions
async function addStudent() {
  const name = document.getElementById("studentName").value;
  const email = document.getElementById("studentEmail").value;
  const studentId = document.getElementById("studentId").value;
  const study = document.getElementById("studentStudy")
    ? document.getElementById("studentStudy").value
    : "";
  const department = document.getElementById("studentDepartment")
    ? document.getElementById("studentDepartment").value
    : "";
  const date = document.getElementById("studentDate")
    ? document.getElementById("studentDate").value
    : "";
  const usageDaysRaw = document.getElementById("studentUsageDays")
    ? document.getElementById("studentUsageDays").value
    : "";
  const usage_days = usageDaysRaw ? parseInt(usageDaysRaw) : undefined;

  try {
    const response = await fetch("/api/admin/students", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: getAuthHeader(),
      },
      body: JSON.stringify({
        name,
        email,
        student_id: studentId,
        study,
        department,
        date,
        usage_days,
      }),
    });

    if (response.ok) {
      await Promise.all([loadStudents(), loadStudentsSummary()]);
      bootstrap.Modal.getInstance(
        document.getElementById("addStudentModal")
      ).hide();
      document.getElementById("addStudentForm").reset();
      showAlert("Student added successfully!", "success");
      renderStudentsSummaryTable();
    } else {
      let detail = "Unknown error";
      try {
        const error = await response.json();
        detail = error.detail || JSON.stringify(error);
      } catch (_) {
        detail = await response.text();
      }
      showAlert(`Error: ${detail}`, "danger");
    }
  } catch (error) {
    console.error("Error adding student:", error);
    showAlert("Error adding student. Please try again.", "danger");
  }
}

async function addComputer() {
  const name = document.getElementById("computerName").value;

  try {
    const response = await fetch("/api/admin/computers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: getAuthHeader(),
      },
      body: JSON.stringify({ name }),
    });

    if (response.ok) {
      await loadComputers();
      renderComputerGrid();
      updateLabStats();
      bootstrap.Modal.getInstance(
        document.getElementById("addComputerModal")
      ).hide();
      document.getElementById("addComputerForm").reset();
      showAlert("Computer added successfully!", "success");
    } else {
      const error = await response.json();
      showAlert(`Error: ${error.detail}`, "danger");
    }
  } catch (error) {
    console.error("Error adding computer:", error);
    showAlert("Error adding computer. Please try again.", "danger");
  }
}

async function addUser() {
  const username = document.getElementById("username").value;
  const email = document.getElementById("userEmail").value;
  const password = document.getElementById("password").value;

  try {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, email, password }),
    });

    if (response.ok) {
      bootstrap.Modal.getInstance(
        document.getElementById("addUserModal")
      ).hide();
      document.getElementById("addUserForm").reset();
      showAlert("Admin user added successfully!", "success");
    } else {
      let detail = "Unknown error";
      try {
        const err = await response.json();
        detail = err.detail || JSON.stringify(err);
      } catch (_) {
        detail = await response.text();
      }
      showAlert(`Error: ${detail}`, "danger");
    }
  } catch (error) {
    console.error("Error adding user:", error);
    showAlert("Error adding user. Please try again.", "danger");
  }
}

async function updateComputerStatus() {
  const computerId = parseInt(
    document.getElementById("statusComputerId").value
  );
  const status = document.getElementById("statusSelect").value;
  const currentUser = document.getElementById("currentUser").value;

  try {
    const response = await fetch(`/api/admin/computers/${computerId}/status`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: getAuthHeader(),
      },
      body: JSON.stringify({
        computer_id: computerId,
        status: status,
        current_user: currentUser || null,
      }),
    });

    if (response.ok) {
      await loadComputers();
      renderComputerGrid();
      updateLabStats();
      bootstrap.Modal.getInstance(
        document.getElementById("computerStatusModal")
      ).hide();
      showAlert("Computer status updated successfully!", "success");
    } else {
      const error = await response.json();
      showAlert(`Error: ${error.detail}`, "danger");
    }
  } catch (error) {
    console.error("Error updating computer status:", error);
    showAlert("Error updating computer status. Please try again.", "danger");
  }
}

async function cancelBooking(bookingId) {
  if (confirm("Are you sure you want to cancel this booking?")) {
    try {
      showAlert("Booking cancellation feature coming soon!", "info");
    } catch (error) {
      console.error("Error cancelling booking:", error);
      showAlert("Error cancelling booking. Please try again.", "danger");
    }
  }
}

async function assignStudent(computerId) {
  const sel = document.getElementById(`assignSelect-${computerId}`);
  if (!sel || !sel.value) {
    showAlert("Select a student first", "warning");
    return;
  }
  const studentId = parseInt(sel.value);
  const res = await fetch("/api/admin/assign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify({ computer_id: computerId, student_id: studentId }),
  });
  if (!res.ok) {
    const t = await res.text();
    showAlert(`Assign failed: ${t}`, "danger");
    return;
  }
  try {
    const data = await res.json();
    if (data && typeof data.usage_days_remaining === "number") {
      if (data.usage_days_remaining <= 0) {
        showAlert("This student's usage days have expired.", "warning");
      } else {
        showAlert(
          `Assigned. Remaining usage days: ${data.usage_days_remaining}.`,
          "success"
        );
      }
    } else {
      showAlert("Assigned.", "success");
    }
  } catch (_) {
    showAlert("Assigned.", "success");
  }
  await loadComputers();
  renderComputerGrid();
  // Refresh summary to reflect usage decrement
  await loadStudentsSummary();
  renderStudentsSummaryTable();
}

async function unassignStudent(computerId) {
  const res = await fetch("/api/admin/unassign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify({ computer_id: computerId }),
  });
  if (!res.ok) {
    const t = await res.text();
    showAlert(`Unassign failed: ${t}`, "danger");
    return;
  }
  await loadComputers();
  renderComputerGrid();
}

async function deleteComputer(computerId) {
  if (!confirm("Delete this computer? This will remove related bookings.")) {
    return;
  }
  try {
    let res = await fetch(`/api/admin/computers/${computerId}`, {
      method: "DELETE",
      headers: { Authorization: getAuthHeader() },
    });
    if (res.status === 404) {
      // fallback to POST endpoint
      res = await fetch(`/api/admin/computers/delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: getAuthHeader(),
        },
        body: JSON.stringify({ computer_id: computerId }),
      });
    }
    if (!res.ok) {
      const t = await res.text();
      showAlert(`Delete computer failed: ${t}`, "danger");
      return;
    }
    await loadComputers();
    renderComputerGrid();
    updateLabStats();
    showAlert("Computer deleted.", "success");
  } catch (e) {
    showAlert("Error deleting computer.", "danger");
  }
}

async function deleteUser(userId) {
  if (
    !confirm("Delete this user? This will remove linked student and bookings.")
  ) {
    return;
  }
  try {
    let res = await fetch(`/api/admin/users/${userId}`, {
      method: "DELETE",
      headers: { Authorization: getAuthHeader() },
    });
    if (res.status === 404) {
      res = await fetch(`/api/admin/users/delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: getAuthHeader(),
        },
        body: JSON.stringify({ user_id: userId }),
      });
    }
    if (!res.ok) {
      const t = await res.text();
      showAlert(`Delete user failed: ${t}`, "danger");
      return;
    }
    await Promise.all([loadUsersStatus(), loadStudentsSummary()]);
    renderUsersStatusTable();
    renderStudentsSummaryTable();
    showAlert("User deleted.", "success");
  } catch (e) {
    showAlert("Error deleting user.", "danger");
  }
}

async function toggleStudentActive(studentId) {
  try {
    let res = await fetch(`/api/admin/students/${studentId}/toggle-active`, {
      method: "POST",
      headers: { Authorization: getAuthHeader() },
    });
    if (res.status === 404) {
      res = await fetch(`/api/admin/students/toggle-active`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: getAuthHeader(),
        },
        body: JSON.stringify({ student_id: studentId }),
      });
    }
    if (!res.ok) {
      const t = await res.text();
      showAlert(`Toggle active failed: ${t}`, "danger");
      return;
    }
    await loadStudentsSummary();
    renderStudentsSummaryTable();
    showAlert("Student active state toggled.", "success");
  } catch (e) {
    showAlert("Error toggling student.", "danger");
  }
}

async function deleteStudent(studentId) {
  if (!confirm("Delete this student and linked user/bookings?")) return;
  try {
    let res = await fetch(`/api/admin/students/${studentId}`, {
      method: "DELETE",
      headers: { Authorization: getAuthHeader() },
    });
    if (!res.ok) {
      const t = await res.text();
      showAlert(`Delete student failed: ${t}`, "danger");
      return;
    }
    await Promise.all([loadStudents(), loadStudentsSummary()]);
    renderStudentsSummaryTable();
    showAlert("Student deleted.", "success");
  } catch (e) {
    showAlert("Error deleting student.", "danger");
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

async function addUserSimple() {
  const name = document.getElementById("simpleName").value;
  const email = document.getElementById("simpleEmail").value;
  const role = "admin"; // forced on server; input removed

  try {
    const response = await fetch("/api/admin/users/simple", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: getAuthHeader(),
      },
      body: JSON.stringify({ name, email, role }),
    });

    if (response.ok) {
      const userData = await response.json();
      bootstrap.Modal.getInstance(
        document.getElementById("addUserSimpleModal")
      ).hide();
      document.getElementById("addUserSimpleForm").reset();

      // Show credentials to admin
      showAlert(
        `User created successfully!<br>
         <strong>Username:</strong> ${userData.username}<br>
         <strong>Password:</strong> ${userData.password}<br>
         <strong>Student ID:</strong> ${userData.student_id || "N/A"}`,
        "success"
      );

      // Refresh data
      await loadInitialData();
    } else {
      const error = await response.json();
      showAlert(`Error: ${error.detail}`, "danger");
    }
  } catch (error) {
    console.error("Error adding user:", error);
    showAlert("Error adding user. Please try again.", "danger");
  }
}
