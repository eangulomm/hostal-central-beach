const STORAGE_KEY = "centralBeachMvpData";
const API_BASE_URL = "https://script.google.com/macros/s/AKfycbw1bHAL-PUPiGDKuI7FeaqqbhL6wnxgV_NoOk7TQLC66YeX-vvPIYlffdcqYUIqDYFvXA/exec";
const API_RESOURCES = ["rooms", "guests", "reservations", "payments"];

const roomStatuses = ["disponible", "reservada", "ocupada", "mantenimiento"];
const reservationStatuses = ["pendiente", "confirmada", "check-in", "check-out", "cancelada"];
const paymentStatuses = ["pendiente", "parcial", "pagado", "vencido"];
const paymentMethods = ["efectivo", "tarjeta", "transferencia", "nequi", "datafono"];

// Estados de reservacion que bloquean la habitacion (ocupan fechas).
// "cancelada" y "check-out" NO bloquean: liberan la habitacion.
const BLOCKING_RESERVATION_STATUSES = ["pendiente", "confirmada", "check-in"];

// Cantidad de dias mostrados en la matriz del Calendario de ocupacion.
const CALENDAR_RANGE_DAYS = 14;

// Estados de pago que cuentan como dinero efectivamente recibido/valido.
// "cancelado" y "anulado" NO suman.
const VALID_PAYMENT_STATUSES = ["pagado", "completado", "confirmado", "parcial"];

const initialData = {
  rooms: [
    { id: "room-101", number: "101", type: "Doble", capacity: 2, rate: 160000, status: "disponible" },
    { id: "room-102", number: "102", type: "Familiar", capacity: 4, rate: 260000, status: "reservada" },
    { id: "room-201", number: "201", type: "Suite vista mar", capacity: 2, rate: 320000, status: "ocupada" },
    { id: "room-202", number: "202", type: "Twin", capacity: 2, rate: 180000, status: "mantenimiento" }
  ],
  guests: [
    { id: "guest-1", name: "Laura Martinez", document: "CC 1020304050", email: "laura@example.com", phone: "+57 300 111 2233" },
    { id: "guest-2", name: "Carlos Perez", document: "CE 445566", email: "carlos@example.com", phone: "+57 301 555 7788" }
  ],
  reservations: [
    {
      id: "res-1001",
      code: "CB-1001",
      guestId: "guest-1",
      roomId: "room-102",
      checkIn: "2026-06-22",
      checkOut: "2026-06-25",
      nights: 3,
      total: 780000,
      status: "confirmada"
    },
    {
      id: "res-1002",
      code: "CB-1002",
      guestId: "guest-2",
      roomId: "room-201",
      checkIn: "2026-06-18",
      checkOut: "2026-06-20",
      nights: 2,
      total: 640000,
      status: "check-in"
    }
  ],
  payments: [
    { id: "pay-1", reservationId: "res-1001", amount: 390000, method: "transferencia", status: "parcial", paidAt: "2026-06-15" },
    { id: "pay-2", reservationId: "res-1002", amount: 640000, method: "tarjeta", status: "pagado", paidAt: "2026-06-18" }
  ]
};

const sectionLoading = new Set();
let loadingDepth = 0;

let state = hasApiUrl() ? createEmptyState() : loadState();
let activeModal = null;
let saving = false;
// Primer dia mostrado en el Calendario de ocupacion. Por defecto, hoy.
let calendarStartDate = todayIso();
// Filtros activos del modulo Pagos.
let paymentFilters = { date: "", method: "", status: "" };
// Fecha seleccionada en el modulo Reportes / Cierre de caja. Por defecto, hoy.
let reportsSelectedDate = todayIso();

const els = {
  title: document.getElementById("view-title"),
  navItems: document.querySelectorAll(".nav-item"),
  views: document.querySelectorAll(".view"),
  modal: document.getElementById("entity-modal"),
  modalTitle: document.getElementById("modal-title"),
  modalFields: document.getElementById("modal-fields"),
  modalForm: document.getElementById("entity-form"),
  reservationSummary: document.getElementById("reservation-summary"),
  appAlert: document.getElementById("app-alert"),
  modalStatus: document.getElementById("modal-status"),
  modalSubmit: document.getElementById("modal-submit-btn"),
  modalSubmitLabel: document.querySelector("#modal-submit-btn .button-label"),
  modalSubmitSpinner: document.querySelector("#modal-submit-btn .button-spinner"),
  loadingOverlay: document.getElementById("loading-overlay"),
  sectionLoaders: {
    rooms: document.getElementById("section-loader-rooms"),
    guests: document.getElementById("section-loader-guests"),
    reservations: document.getElementById("section-loader-reservations"),
    payments: document.getElementById("section-loader-payments")
  },
  calendarTableHead: document.getElementById("calendar-table-head"),
  calendarTableBody: document.getElementById("calendar-table-body"),
  calendarRangeLabel: document.getElementById("calendar-range-label"),
  calendarDetailModal: document.getElementById("calendar-detail-modal"),
  calendarDetailTitle: document.getElementById("calendar-detail-title"),
  calendarDetailBody: document.getElementById("calendar-detail-body"),
  reservationDetailModal: document.getElementById("reservation-detail-modal"),
  reservationDetailTitle: document.getElementById("reservation-detail-title"),
  reservationDetailBody: document.getElementById("reservation-detail-body"),
  reservationReceiptModal: document.getElementById("reservation-receipt-modal"),
  reservationReceiptBody: document.getElementById("reservation-receipt-body"),
  paymentFilterDate: document.getElementById("payment-filter-date"),
  paymentFilterMethod: document.getElementById("payment-filter-method"),
  paymentFilterStatus: document.getElementById("payment-filter-status"),
  paymentsFilteredCount: document.getElementById("payments-filtered-count"),
  paymentsFilteredTotal: document.getElementById("payments-filtered-total"),
  reportsDateInput: document.getElementById("reports-date-input"),
  reportsPaymentsTable: document.getElementById("reports-payments-table"),
  reportsPendingTable: document.getElementById("reports-pending-table"),
  reportsDateLabelPrint: document.getElementById("reports-date-label-print")
};

document.addEventListener("DOMContentLoaded", initializeApp);

async function initializeApp() {
  bindNavigation();
  bindButtons();
  showLoading("Cargando información...");

  if (!hasApiUrl()) {
    console.info("[Central Beach] Modo local: API_BASE_URL esta vacio. Usando localStorage.");
    renderAll();
    hideLoading();
    return;
  }

  if (!isApiEnabled()) {
    const message = "API_BASE_URL debe ser una URL valida de Apps Script terminada en /exec.";
    console.error("[Central Beach] Configuracion de API invalida.", { API_BASE_URL });
    showNotice(message, "error", false);
    hideLoading();
    return;
  }

  if (isApiEnabled()) {
    console.info("[Central Beach] Modo API: cargando datos desde Google Sheets.", { API_BASE_URL });
    await loadRemoteState();
  }
}

function createEmptyState() {
  return {
    rooms: [],
    guests: [],
    reservations: [],
    payments: []
  };
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(initialData);

  try {
    return JSON.parse(saved);
  } catch (error) {
    console.warn("No se pudo leer el estado guardado.", error);
    return structuredClone(initialData);
  }
}

function saveState() {
  if (hasApiUrl()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function showLoading(message = "Cargando información...") {
  loadingDepth += 1;

  if (!els.loadingOverlay) return;

  const label = els.loadingOverlay.querySelector(".loading-panel strong");
  if (label) {
    label.textContent = message;
  }

  els.loadingOverlay.classList.remove("hidden");
}

function hideLoading() {
  loadingDepth = Math.max(loadingDepth - 1, 0);

  if (loadingDepth > 0 || !els.loadingOverlay) return;

  els.loadingOverlay.classList.add("hidden");
}

function showSectionLoading(resource, message) {
  sectionLoading.add(resource);
  setSectionLoaderMessage(resource, message || sectionLoadingMessage(resource));
}

function hideSectionLoading(resource) {
  sectionLoading.delete(resource);
  setSectionLoaderMessage(resource, sectionLoadingMessage(resource));
}

function isSectionLoading(resource) {
  return sectionLoading.has(resource);
}

function sectionLoadingMessage(resource) {
  const messages = {
    rooms: "Cargando habitaciones...",
    guests: "Cargando huespedes...",
    reservations: "Cargando reservaciones...",
    payments: "Cargando pagos..."
  };

  return messages[resource] || "Cargando...";
}

function setSectionLoaderMessage(resource, message) {
  const loader = els.sectionLoaders?.[resource];
  if (!loader) return;

  const textNode = loader.querySelector("span:last-child");
  if (textNode) {
    textNode.textContent = message;
  }

  loader.classList.toggle("hidden", !sectionLoading.has(resource));
}

async function loadRemoteState(options = {}) {
  const resources = [...API_RESOURCES];
  resources.forEach((resource) => showSectionLoading(resource));

  try {
    const results = await Promise.allSettled(
      resources.map(async (resource) => {
        const data = await apiGet(resource);
        return { resource, data };
      })
    );

    results.forEach((result, index) => {
      const resource = resources[index];

      if (result.status === "fulfilled") {
        state[resource] = result.value.data;
        return;
      }

      console.error("[Central Beach] Error cargando recurso.", { resource, error: result.reason });
      showNotice(`No se pudo cargar ${resource}: ${result.reason.message}`, "error", false);
      });
  } catch (error) {
    console.error("[Central Beach] Error cargando datos desde Google Sheets.", error);
    showNotice(`No se pudo cargar Google Sheets: ${error.message}`, "error", false);
  } finally {
    resources.forEach((resource) => hideSectionLoading(resource));
    hideLoading();
  }

  renderAll();

  if (options.showSuccess) {
    showNotice("Guardado correctamente", "success");
  }
}

async function apiGet(resource) {
  const response = await apiRequest(resource);
  return Array.isArray(response.data) ? response.data : [];
}

async function persistEntity(resource, entity, method) {
  if (!entity) return null;

  if (hasApiUrl() && !isApiEnabled()) {
    const message = "API_BASE_URL no es una URL /exec valida.";
    console.error("[Central Beach] No se pudo guardar: configuracion de API invalida.", { API_BASE_URL });
    throw new Error(message);
  }

  if (!isApiEnabled()) return null;

  console.info("[Central Beach] Inicio de POST.", { resource, method, entity });
  const response = await apiRequest(resource, { method, id: entity.id, body: entity });
  console.info("[Central Beach] Fin de POST.", { resource, method, response });
  return response.data || null;
}

async function persistRooms() {
  if (hasApiUrl() && !isApiEnabled()) {
    const message = "API_BASE_URL no es una URL /exec valida.";
    console.error("[Central Beach] No se pudieron sincronizar habitaciones: configuracion de API invalida.", { API_BASE_URL });
    showNotice(message, "error", false);
    return false;
  }

  if (!isApiEnabled()) return false;

  try {
    await Promise.all(
      state.rooms.map((room) => apiRequest("rooms", { method: "PUT", id: room.id, body: room }))
    );
    return true;
  } catch (error) {
    console.error("[Central Beach] Error sincronizando habitaciones.", error);
    showNotice(`No se pudieron sincronizar las habitaciones: ${error.message}`, "error", false);
    return false;
  }
}

async function persistRoomsByIds(roomIds) {
  const uniqueRoomIds = [...new Set(roomIds.filter(Boolean))];
  if (!uniqueRoomIds.length) return true;

  try {
    await Promise.all(
      uniqueRoomIds.map((roomId) => {
        const room = findById(state.rooms, roomId);
        return room ? apiRequest("rooms", { method: "PUT", id: room.id, body: room }) : Promise.resolve();
      })
    );
    return true;
  } catch (error) {
    console.error("[Central Beach] Error sincronizando habitaciones relacionadas.", error);
    showNotice(`No se pudieron sincronizar las habitaciones: ${error.message}`, "error", false);
    return false;
  }
}

async function apiRequest(resource, options = {}) {
  const method = options.method || "GET";
  const url = new URL(API_BASE_URL.trim(), window.location.href);

  url.searchParams.set("resource", resource);
  if (options.id) {
    url.searchParams.set("id", options.id);
  }

  const fetchOptions = method === "GET"
    ? {}
    : {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(method === "POST" ? options.body : { ...options.body, _method: method })
    };

  console.info("[Central Beach API]", method === "GET" ? "GET" : `POST (${method})`, url.toString(), options.body || "");

  let response;
  try {
    response = await fetch(url.toString(), fetchOptions);
  } catch (error) {
    console.error("[Central Beach API] Error de red o CORS.", { method, url: url.toString(), error });
    throw new Error(`Error de red o CORS: ${error.message}`);
  }

  const responseText = await response.text();
  let payload;

  try {
    payload = JSON.parse(responseText);
  } catch (error) {
    console.error("[Central Beach API] Respuesta no JSON.", {
      status: response.status,
      body: responseText.slice(0, 500)
    });
    throw new Error(`La API respondio con contenido no JSON. HTTP ${response.status}`);
  }

  if (!response.ok || !payload.ok) {
    console.error("[Central Beach API] Error de API.", {
      status: response.status,
      payload
    });
    throw new Error(payload.error || `Error HTTP ${response.status}`);
  }

  console.info("[Central Beach API] OK", { resource, method, payload });
  return payload;
}

function hasApiUrl() {
  return API_BASE_URL.trim() !== "";
}

function isApiEnabled() {
  try {
    const url = new URL(API_BASE_URL.trim());
    return url.protocol === "https:" && url.pathname.endsWith("/exec");
  } catch (error) {
    return false;
  }
}

function showNotice(message, type = "success", autoHide = true) {
  if (!els.appAlert) return;

  els.appAlert.textContent = message;
  els.appAlert.className = `app-alert ${type}`;

  if (autoHide) {
    window.setTimeout(() => {
      if (els.appAlert.textContent === message) {
        els.appAlert.className = "app-alert hidden";
        els.appAlert.textContent = "";
      }
    }, 4500);
  }
}

function setModalStatus(message = "", type = "") {
  if (!els.modalStatus) return;

  els.modalStatus.textContent = message;
  els.modalStatus.className = `modal-status ${type}`.trim();
}

function setSaving(value) {
  saving = value;

  if (els.modalSubmit) {
    els.modalSubmit.disabled = value;
  }

  if (els.modalSubmitLabel) {
    els.modalSubmitLabel.textContent = value ? "Guardando..." : (els.modalSubmit.dataset.label || "Guardar");
  }

  if (els.modalSubmitSpinner) {
    els.modalSubmitSpinner.classList.toggle("hidden", !value);
  }

  if (value) {
    setModalStatus("Guardando...");
  } else if (els.modalStatus?.textContent === "Guardando...") {
    setModalStatus("");
  }
}

function bindNavigation() {
  els.navItems.forEach((button) => {
    button.addEventListener("click", () => {
      const viewName = button.dataset.view;
      els.navItems.forEach((item) => item.classList.toggle("active", item === button));
      els.views.forEach((view) => view.classList.toggle("active", view.id === viewName));
      els.title.textContent = button.textContent;
    });
  });
}

function bindButtons() {
  document.getElementById("new-room-btn").addEventListener("click", () => openRoomModal());
  document.getElementById("new-guest-btn").addEventListener("click", () => openGuestModal());
  document.getElementById("new-reservation-btn").addEventListener("click", () => openReservationModal());
  document.getElementById("new-payment-btn").addEventListener("click", () => openPaymentModal());
  document.getElementById("close-modal-btn").addEventListener("click", closeModal);
  document.getElementById("cancel-modal-btn").addEventListener("click", closeModal);
  els.modalForm.addEventListener("submit", handleSubmit);

  populatePaymentFilterOptions();

  document.getElementById("calendar-prev-btn").addEventListener("click", () => shiftCalendarRange(-CALENDAR_RANGE_DAYS));
  document.getElementById("calendar-today-btn").addEventListener("click", () => setCalendarRangeToToday());
  document.getElementById("calendar-next-btn").addEventListener("click", () => shiftCalendarRange(CALENDAR_RANGE_DAYS));
  document.getElementById("calendar-detail-close-btn").addEventListener("click", closeCalendarDetailModal);
  document.getElementById("calendar-detail-close-btn-2").addEventListener("click", closeCalendarDetailModal);

  document.getElementById("reservation-detail-close-btn").addEventListener("click", closeReservationDetailModal);
  document.getElementById("reservation-detail-close-btn-2").addEventListener("click", closeReservationDetailModal);
  document.getElementById("reservation-detail-register-payment-btn").addEventListener("click", () => {
    const reservationId = activeReservationDetailId;
    closeReservationDetailModal();
    if (reservationId) openPaymentModal(null, reservationId);
  });

  document.getElementById("reservation-receipt-close-btn").addEventListener("click", closeReservationReceipt);
  document.getElementById("reservation-receipt-close-btn-2").addEventListener("click", closeReservationReceipt);
  document.getElementById("reservation-receipt-print-btn").addEventListener("click", printReservationReceipt);
  document.getElementById("reservation-receipt-copy-btn").addEventListener("click", () => {
    if (activeReservationReceiptId) copyReservationReceiptSummary(activeReservationReceiptId);
  });
  document.getElementById("reservation-receipt-whatsapp-btn").addEventListener("click", () => {
    if (activeReservationReceiptId) openReservationWhatsApp(activeReservationReceiptId);
  });

  if (els.paymentFilterDate) {
    els.paymentFilterDate.addEventListener("change", () => {
      paymentFilters.date = els.paymentFilterDate.value;
      renderPayments();
    });
  }
  if (els.paymentFilterMethod) {
    els.paymentFilterMethod.addEventListener("change", () => {
      paymentFilters.method = els.paymentFilterMethod.value;
      renderPayments();
    });
  }
  if (els.paymentFilterStatus) {
    els.paymentFilterStatus.addEventListener("change", () => {
      paymentFilters.status = els.paymentFilterStatus.value;
      renderPayments();
    });
  }
  const paymentFilterClearBtn = document.getElementById("payment-filter-clear-btn");
  if (paymentFilterClearBtn) {
    paymentFilterClearBtn.addEventListener("click", () => {
      paymentFilters = { date: "", method: "", status: "" };
      if (els.paymentFilterDate) els.paymentFilterDate.value = "";
      if (els.paymentFilterMethod) els.paymentFilterMethod.value = "";
      if (els.paymentFilterStatus) els.paymentFilterStatus.value = "";
      renderPayments();
    });
  }

  if (els.reportsDateInput) {
    els.reportsDateInput.value = reportsSelectedDate;
    els.reportsDateInput.addEventListener("change", () => {
      reportsSelectedDate = els.reportsDateInput.value || todayIso();
      renderReports();
    });
  }

  const reportsTodayBtn = document.getElementById("reports-today-btn");
  if (reportsTodayBtn) {
    reportsTodayBtn.addEventListener("click", () => {
      reportsSelectedDate = todayIso();
      if (els.reportsDateInput) els.reportsDateInput.value = reportsSelectedDate;
      renderReports();
    });
  }

  const reportsCopyBtn = document.getElementById("reports-copy-btn");
  if (reportsCopyBtn) {
    reportsCopyBtn.addEventListener("click", copyCashCloseSummary);
  }

  const reportsPrintBtn = document.getElementById("reports-print-btn");
  if (reportsPrintBtn) {
    reportsPrintBtn.addEventListener("click", printCashClose);
  }

  window.addEventListener("afterprint", () => {
    document.body.classList.remove("printing-cash-close");
    document.body.classList.remove("printing-receipt");
  });
}

let activeReservationDetailId = null;
let activeReservationReceiptId = null;

function renderAll() {
  renderDashboard();
  renderCajaHoy();
  renderRooms();
  renderGuests();
  renderReservations();
  renderPayments();
  renderCalendar();
  renderReports();
  saveState();
}

// ===== Dashboard =====

function getTodayIso() {
  return new Date().toISOString().slice(0, 10);
}

function getCurrentMonthPrefix() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${month}`;
}

function getMonthlyReservations() {
  const prefix = getCurrentMonthPrefix();
  return state.reservations.filter(
    (r) => String(r.checkIn || "").startsWith(prefix) && r.status !== "cancelada"
  );
}

function getMonthlyPayments() {
  const prefix = getCurrentMonthPrefix();
  const validStatuses = ["pagado", "completado", "confirmado", "parcial"];
  return state.payments.filter(
    (p) =>
      validStatuses.includes(String(p.status).toLowerCase()) &&
      (String(p.paidAt || "").startsWith(prefix) || String(p.createdAt || "").startsWith(prefix))
  );
}

function populatePaymentFilterOptions() {
  if (els.paymentFilterMethod) {
    const methods = [...new Set(paymentMethods)];
    els.paymentFilterMethod.innerHTML = `<option value="">Todos</option>${
      methods.map((m) => `<option value="${escapeAttr(m)}">${capitalize(m)}</option>`).join("")
    }`;
  }

  if (els.paymentFilterStatus) {
    const statuses = [...new Set([...paymentStatuses, "completado", "confirmado", "cancelado", "anulado"])];
    els.paymentFilterStatus.innerHTML = `<option value="">Todos</option>${
      statuses.map((s) => `<option value="${escapeAttr(s)}">${capitalize(s)}</option>`).join("")
    }`;
  }
}

function calculateDashboardMetrics() {
  const today = getTodayIso();

  const arrivalsToday = state.reservations.filter(
    (r) => r.checkIn === today && ["pendiente", "confirmada"].includes(r.status)
  );

  const departuresToday = state.reservations.filter(
    (r) => r.checkOut === today && r.status === "check-in"
  );

  const stayingNow = state.reservations.filter((r) => r.status === "check-in");

  const occupiedRooms = state.rooms.filter((r) => r.status === "ocupada").length;
  const availableRooms = state.rooms.filter((r) => r.status === "disponible").length;
  const maintenanceRooms = state.rooms.filter((r) => r.status === "mantenimiento");
  const totalRooms = state.rooms.length;
  const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

  const activeReservations = state.reservations.filter((r) =>
    BLOCKING_RESERVATION_STATUSES.includes(r.status)
  );

  const monthlyIncome = getMonthlyReservations().reduce(
    (sum, r) => sum + Number(r.total || 0), 0
  );

  const monthlyPayments = getMonthlyPayments().reduce(
    (sum, p) => sum + Number(p.amount || 0), 0
  );

  const totalActiveBalance = activeReservations.reduce(
    (sum, r) => sum + Number(r.total || 0), 0
  );
  const paidForActive = state.payments
    .filter((p) => {
      const res = state.reservations.find((r) => r.id === p.reservationId);
      return res && BLOCKING_RESERVATION_STATUSES.includes(res.status) &&
        ["pagado", "completado", "confirmado", "parcial"].includes(String(p.status).toLowerCase());
    })
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const pendingBalance = Math.max(0, totalActiveBalance - paidForActive);

  // Alertas
  const alerts = [];

  const pendingArrivals = state.reservations.filter(
    (r) => r.checkIn === today && r.status === "pendiente"
  );
  if (pendingArrivals.length > 0) {
    alerts.push({
      type: "warning",
      icon: "⚠",
      message: `${pendingArrivals.length} llegada${pendingArrivals.length > 1 ? "s" : ""} hoy con pago pendiente`
    });
  }

  if (maintenanceRooms.length > 0) {
    alerts.push({
      type: "info",
      icon: "🔧",
      message: `${maintenanceRooms.length} habitacion${maintenanceRooms.length > 1 ? "es" : ""} en mantenimiento`
    });
  }

  const reservationsWithPendingPayment = activeReservations.filter((r) => {
    const paid = state.payments
      .filter((p) => p.reservationId === r.id &&
        ["pagado", "completado", "confirmado", "parcial"].includes(String(p.status).toLowerCase()))
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
    return paid < Number(r.total || 0);
  });
  if (reservationsWithPendingPayment.length > 0) {
    alerts.push({
      type: "danger",
      icon: "💳",
      message: `${reservationsWithPendingPayment.length} reserva${reservationsWithPendingPayment.length > 1 ? "s" : ""} activa${reservationsWithPendingPayment.length > 1 ? "s" : ""} con pago incompleto`
    });
  }

  return {
    arrivalsToday,
    departuresToday,
    stayingNow,
    occupiedRooms,
    availableRooms,
    totalRooms,
    occupancyRate,
    activeReservations,
    monthlyIncome,
    monthlyPayments,
    pendingBalance,
    alerts
  };
}

function renderOpsCard(reservation) {
  return `
    <div class="ops-card">
      <div class="ops-card-name">${guestName(reservation.guestId)}</div>
      <div class="ops-card-room">${roomLabel(reservation.roomId)}</div>
      ${badge(reservation.status)}
    </div>
  `;
}

function renderEmptyOps(message) {
  return `<div class="ops-empty">${message}</div>`;
}

function renderDashboard() {
  if (isSectionLoading("rooms") || isSectionLoading("reservations")) return;

  const m = calculateDashboardMetrics();
  const today = getTodayIso();

  // Métricas fila 1
  document.getElementById("metric-arrivals-today").textContent = m.arrivalsToday.length;
  document.getElementById("metric-departures-today").textContent = m.departuresToday.length;
  document.getElementById("metric-occupied").textContent = m.occupiedRooms;
  document.getElementById("metric-available").textContent = m.availableRooms;
  document.getElementById("metric-occupancy-rate").textContent = `${m.occupancyRate}%`;
  document.getElementById("metric-active-reservations").textContent = m.activeReservations.length;

  // Métricas fila 2
  document.getElementById("metric-monthly-income").textContent = formatMoney(m.monthlyIncome);
  document.getElementById("metric-monthly-payments").textContent = formatMoney(m.monthlyPayments);
  document.getElementById("metric-pending-balance").textContent = formatMoney(m.pendingBalance);

  // Etiqueta fecha
  const todayEl = document.getElementById("dashboard-today-label");
  if (todayEl) {
    todayEl.textContent = formatDate(today);
  }

  // Llegadas
  const arrivalsCountEl = document.getElementById("ops-arrivals-count");
  const arrivalsListEl = document.getElementById("ops-arrivals-list");
  if (arrivalsCountEl) arrivalsCountEl.textContent = m.arrivalsToday.length;
  if (arrivalsListEl) {
    arrivalsListEl.innerHTML = m.arrivalsToday.length
      ? m.arrivalsToday.map(renderOpsCard).join("")
      : renderEmptyOps("Sin llegadas programadas para hoy");
  }

  // Salidas
  const departuresCountEl = document.getElementById("ops-departures-count");
  const departuresListEl = document.getElementById("ops-departures-list");
  if (departuresCountEl) departuresCountEl.textContent = m.departuresToday.length;
  if (departuresListEl) {
    departuresListEl.innerHTML = m.departuresToday.length
      ? m.departuresToday.map(renderOpsCard).join("")
      : renderEmptyOps("Sin salidas programadas para hoy");
  }

  // Alojados ahora
  const stayingCountEl = document.getElementById("ops-staying-count");
  const stayingListEl = document.getElementById("ops-staying-list");
  if (stayingCountEl) stayingCountEl.textContent = m.stayingNow.length;
  if (stayingListEl) {
    stayingListEl.innerHTML = m.stayingNow.length
      ? m.stayingNow.map(renderOpsCard).join("")
      : renderEmptyOps("No hay huespedes alojados actualmente");
  }

  // Alertas
  const alertCountEl = document.getElementById("dashboard-alert-count");
  const alertsEl = document.getElementById("dashboard-alerts");
  if (alertCountEl) {
    alertCountEl.textContent = m.alerts.length;
    alertCountEl.classList.toggle("hidden", m.alerts.length === 0);
  }
  if (alertsEl) {
    alertsEl.innerHTML = m.alerts.length
      ? m.alerts.map((a) => `
          <div class="alert-item alert-item--${a.type}">
            <span class="alert-item-icon">${a.icon}</span>
            <span>${a.message}</span>
          </div>
        `).join("")
      : `<div class="alert-item alert-item--ok"><span class="alert-item-icon">✓</span><span>Sin alertas activas</span></div>`;
  }

  // Estado de habitaciones
  const statusCounts = roomStatuses.map((status) => ({
    status,
    count: state.rooms.filter((room) => room.status === status).length
  }));

  const roomStatusEl = document.getElementById("room-status-list");
  if (roomStatusEl) {
    roomStatusEl.innerHTML = statusCounts.map((item) => `
      <div class="status-item">
        <div>
          <strong>${capitalize(item.status)}</strong>
          <span>${item.count} habitacion${item.count === 1 ? "" : "es"}</span>
        </div>
        ${badge(item.status)}
      </div>
    `).join("");
  }
}

// ===== Caja y Pagos =====

function isValidPayment(payment) {
  return VALID_PAYMENT_STATUSES.includes(String(payment?.status || "").toLowerCase());
}

// Funcion central de estado financiero por reservacion.
// Usa unicamente state.reservations y state.payments (ya cargados), sin llamadas a la API.
function calculatePaymentSummary(reservationId) {
  const reservation = findById(state.reservations, reservationId);
  const totalReservation = Number(reservation?.total || 0);
  const payments = state.payments
    .filter((payment) => payment.reservationId === reservationId)
    .slice()
    .sort((a, b) => String(b.paidAt || "").localeCompare(String(a.paidAt || "")));

  const validPayments = payments.filter(isValidPayment);
  const totalPaid = validPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const balanceDue = Math.max(0, totalReservation - totalPaid);

  let paymentStatus;
  if (validPayments.length === 0) {
    paymentStatus = "pendiente";
  } else if (totalPaid >= totalReservation) {
    paymentStatus = "pagado";
  } else {
    paymentStatus = "parcial";
  }

  return {
    totalReservation,
    totalPaid,
    balanceDue,
    paymentStatus,
    payments
  };
}

function paymentStatusBadge(status) {
  const labels = {
    pendiente: "Pendiente",
    parcial: "Parcial",
    pagado: "Pagado",
  };
  const label = labels[String(status).toLowerCase()] || capitalize(status);
  return `<span class="badge ${status}" style="white-space:nowrap">${label}</span>`;
}

// Calcula el cierre de caja para una fecha cualquiera (YYYY-MM-DD).
// Usa unicamente state.payments / state.reservations ya cargados en memoria; sin llamadas a la API.
function calculateDailyCashClose(dateIso) {
  const paymentsOfDay = state.payments.filter(
    (payment) => isValidPayment(payment) && String(payment.paidAt || "").slice(0, 10) === dateIso
  );

  const totalRecibido = paymentsOfDay.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  const sumByMethod = (method) =>
    paymentsOfDay
      .filter((payment) => String(payment.method || "").toLowerCase() === method)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  const totalEfectivo = sumByMethod("efectivo");
  const totalTransferencia = sumByMethod("transferencia");
  const totalTarjeta = sumByMethod("tarjeta");
  const knownMethods = ["efectivo", "transferencia", "tarjeta"];
  const totalOtros = paymentsOfDay
    .filter((payment) => !knownMethods.includes(String(payment.method || "").toLowerCase()))
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  const reservationsWithBalance = (reservations) =>
    reservations.filter((reservation) => calculatePaymentSummary(reservation.id).balanceDue > 0);

  const arrivalsPending = reservationsWithBalance(
    state.reservations.filter((r) => r.checkIn === dateIso && BLOCKING_RESERVATION_STATUSES.includes(r.status))
  );

  const departuresPending = reservationsWithBalance(
    state.reservations.filter((r) => r.checkOut === dateIso && r.status === "check-in")
  );

  const pendingBalancesMap = new Map();
  [...arrivalsPending, ...departuresPending].forEach((reservation) => pendingBalancesMap.set(reservation.id, reservation));

  return {
    dateIso,
    paymentsOfDay,
    totalRecibido,
    totalEfectivo,
    totalTransferencia,
    totalTarjeta,
    totalOtros,
    cantidadPagos: paymentsOfDay.length,
    arrivalsPending,
    departuresPending,
    pendingBalances: [...pendingBalancesMap.values()]
  };
}

// Calcula los datos de "Caja de hoy" (Dashboard) reutilizando calculateDailyCashClose.
function calculateCajaHoy() {
  const close = calculateDailyCashClose(getTodayIso());

  return {
    paymentsToday: close.paymentsOfDay,
    totalHoy: close.totalRecibido,
    totalEfectivo: close.totalEfectivo,
    totalTransferencia: close.totalTransferencia,
    totalTarjeta: close.totalTarjeta,
    totalOtros: close.totalOtros,
    arrivalsTodayPending: close.arrivalsPending,
    departuresTodayPending: close.departuresPending
  };
}

function renderReservationBalanceCard(reservation) {
  const summary = calculatePaymentSummary(reservation.id);
  return `
    <div class="ops-card">
      <div class="ops-card-name">${guestName(reservation.guestId)}</div>
      <div class="ops-card-room">${roomLabel(reservation.roomId)} · Saldo ${formatMoney(summary.balanceDue)}</div>
      ${paymentStatusBadge(summary.paymentStatus)}
    </div>
  `;
}

function renderCajaHoy() {
  if (isSectionLoading("payments") || isSectionLoading("reservations")) return;

  const caja = calculateCajaHoy();

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText("caja-hoy-count", `${caja.paymentsToday.length} pago${caja.paymentsToday.length === 1 ? "" : "s"}`);
  setText("caja-total-hoy", formatMoney(caja.totalHoy));
  setText("caja-efectivo", formatMoney(caja.totalEfectivo));
  setText("caja-transferencia", formatMoney(caja.totalTransferencia));
  setText("caja-tarjeta", formatMoney(caja.totalTarjeta));
  setText("caja-otros", formatMoney(caja.totalOtros));

  setText("caja-arrivals-pending-count", caja.arrivalsTodayPending.length);
  setText("caja-departures-pending-count", caja.departuresTodayPending.length);

  const arrivalsListEl = document.getElementById("caja-arrivals-pending-list");
  if (arrivalsListEl) {
    arrivalsListEl.innerHTML = caja.arrivalsTodayPending.length
      ? caja.arrivalsTodayPending.map(renderReservationBalanceCard).join("")
      : renderEmptyOps("Sin llegadas con saldo pendiente hoy");
  }

  const departuresListEl = document.getElementById("caja-departures-pending-list");
  if (departuresListEl) {
    departuresListEl.innerHTML = caja.departuresTodayPending.length
      ? caja.departuresTodayPending.map(renderReservationBalanceCard).join("")
      : renderEmptyOps("Sin salidas con saldo pendiente hoy");
  }
}

// ===== Reportes / Cierre diario de caja =====

function renderReports() {
  if (isSectionLoading("payments") || isSectionLoading("reservations")) return;
  if (!document.getElementById("reports-payments-table")) return;

  const dateIso = reportsSelectedDate;
  const close = calculateDailyCashClose(dateIso);

  if (els.reportsDateInput && els.reportsDateInput.value !== dateIso) {
    els.reportsDateInput.value = dateIso;
  }

  if (els.reportsDateLabelPrint) {
    els.reportsDateLabelPrint.textContent = formatDate(dateIso);
  }

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText("report-total-recibido", formatMoney(close.totalRecibido));
  setText("report-total-efectivo", formatMoney(close.totalEfectivo));
  setText("report-total-transferencia", formatMoney(close.totalTransferencia));
  setText("report-total-tarjeta", formatMoney(close.totalTarjeta));
  setText("report-total-otros", formatMoney(close.totalOtros));
  setText("report-payments-count", close.cantidadPagos);
  setText("report-arrivals-pending-count", close.arrivalsPending.length);
  setText("report-departures-pending-count", close.departuresPending.length);

  const paymentsTbody = els.reportsPaymentsTable;
  if (paymentsTbody) {
    paymentsTbody.innerHTML = rowsOrEmpty(
      close.paymentsOfDay,
      close.paymentsOfDay.map((payment) => {
        const reservation = findById(state.reservations, payment.reservationId);
        return `
          <tr>
            <td>${formatDateTime(payment.paidAt)}</td>
            <td>${reservation ? guestName(reservation.guestId) : "-"}</td>
            <td>${reservation ? roomLabel(reservation.roomId) : "-"}</td>
            <td>${reservation?.code || "Sin reservacion"}</td>
            <td>${capitalize(payment.method)}</td>
            <td>${badge(payment.status)}</td>
            <td>${formatMoney(payment.amount)}</td>
          </tr>
        `;
      }).join(""),
      7
    );
  }

  const pendingTbody = els.reportsPendingTable;
  if (pendingTbody) {
    pendingTbody.innerHTML = rowsOrEmpty(
      close.pendingBalances,
      close.pendingBalances.map((reservation) => {
        const summary = calculatePaymentSummary(reservation.id);
        return `
          <tr>
            <td>${guestName(reservation.guestId)}</td>
            <td>${roomLabel(reservation.roomId)}</td>
            <td>${formatDate(reservation.checkIn)}</td>
            <td>${formatDate(reservation.checkOut)}</td>
            <td>${formatMoney(summary.totalReservation)}</td>
            <td>${formatMoney(summary.totalPaid)}</td>
            <td>${formatMoney(summary.balanceDue)}</td>
          </tr>
        `;
      }).join(""),
      7
    );
  }
}

// Construye el texto plano del resumen de cierre, reutilizado por copyCashCloseSummary().
function buildCashCloseSummaryText(dateIso) {
  const close = calculateDailyCashClose(dateIso);

  return [
    `Cierre de caja - ${dateIso}`,
    `Total recibido: ${formatMoney(close.totalRecibido)}`,
    `Efectivo: ${formatMoney(close.totalEfectivo)}`,
    `Transferencia: ${formatMoney(close.totalTransferencia)}`,
    `Tarjeta: ${formatMoney(close.totalTarjeta)}`,
    `Otros: ${formatMoney(close.totalOtros)}`,
    `Cantidad de pagos: ${close.cantidadPagos}`,
    `Saldos pendientes: ${close.pendingBalances.length}`
  ].join("\n");
}

function copyCashCloseSummary() {
  const text = buildCashCloseSummaryText(reportsSelectedDate);

  const fallbackCopy = () => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      document.execCommand("copy");
    } catch (error) {
      console.error("[Central Beach] No se pudo copiar el resumen.", error);
    }

    document.body.removeChild(textarea);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => showNotice("Resumen copiado al portapapeles", "success"))
      .catch(() => {
        fallbackCopy();
        showNotice("Resumen copiado al portapapeles", "success");
      });
    return;
  }

  fallbackCopy();
  showNotice("Resumen copiado al portapapeles", "success");
}

// Imprime unicamente el cierre de caja: agrega una clase al body que el CSS
// de impresion usa para ocultar menu, botones y el resto de las vistas.
function printCashClose() {
  document.body.classList.add("printing-cash-close");
  window.print();
}

function renderRooms() {
  const tbody = document.getElementById("rooms-table");
  if (isSectionLoading("rooms")) {
    tbody.innerHTML = loadingRows(6, 4);
    return;
  }

  tbody.innerHTML = rowsOrEmpty(
    state.rooms,
    state.rooms.map((room) => `
      <tr>
        <td><strong>${room.number}</strong></td>
        <td>${room.type}</td>
        <td>${room.capacity}</td>
        <td>${formatMoney(room.rate)}</td>
        <td>${renderRoomStatusSelect(room)}</td>
        <td>
          <div class="row-actions">
            <button class="ghost-button" type="button" onclick="openRoomModal('${room.id}')">Editar</button>
          </div>
        </td>
      </tr>
    `).join(""),
    6
  );
}

function renderGuests() {
  const tbody = document.getElementById("guests-table");
  if (isSectionLoading("guests")) {
    tbody.innerHTML = loadingRows(5, 4);
    return;
  }

  tbody.innerHTML = rowsOrEmpty(
    state.guests,
    state.guests.map((guest) => `
      <tr>
        <td><strong>${guest.name}</strong></td>
        <td>${guest.document}</td>
        <td>${guest.email}</td>
        <td>${guest.phone}</td>
        <td>
          <div class="row-actions">
            <button class="ghost-button" type="button" onclick="openGuestModal('${guest.id}')">Editar</button>
          </div>
        </td>
      </tr>
    `).join(""),
    5
  );
}

function renderReservations() {
  const tbody = document.getElementById("reservations-table");
  if (isSectionLoading("reservations") || isSectionLoading("payments")) {
    tbody.innerHTML = loadingRows(12, 5);
    return;
  }

  tbody.innerHTML = rowsOrEmpty(
    state.reservations,
    state.reservations.map((reservation) => {
      const summary = calculatePaymentSummary(reservation.id);
      return `
      <tr>
        <td><strong>${reservation.code}</strong></td>
        <td>${guestName(reservation.guestId)}</td>
        <td>${roomLabel(reservation.roomId)}</td>
        <td>${formatDate(reservation.checkIn)}</td>
        <td>${formatDate(reservation.checkOut)}</td>
        <td>${reservation.nights}</td>
        <td>${formatMoney(summary.totalReservation)}</td>
        <td>${formatMoney(summary.totalPaid)}</td>
        <td>${formatMoney(summary.balanceDue)}</td>
        <td>${paymentStatusBadge(summary.paymentStatus)}</td>
        <td>${renderReservationStatusSelect(reservation)}</td>
        <td>
          <div class="row-actions">
            <button class="row-btn" type="button" onclick="openReservationModal('${reservation.id}')">Editar</button>
            <button class="row-btn" type="button" onclick="showReservationDetail('${reservation.id}')">Detalle</button>
            <button class="row-btn" type="button" onclick="openReservationReceipt('${reservation.id}')">Comprobante</button>
            <button class="row-btn row-btn--wa" type="button" onclick="openReservationWhatsApp('${reservation.id}')">WhatsApp</button>
            ${["pendiente", "confirmada"].includes(reservation.status)
              ? `<button class="row-btn row-btn--green" type="button" onclick="performCheckIn('${reservation.id}')">Check-In</button>`
              : ""}
            ${reservation.status === "check-in"
              ? `<button class="row-btn row-btn--amber" type="button" onclick="performCheckOut('${reservation.id}')">Check-Out</button>`
              : ""}
          </div>
        </td>
      </tr>
    `;
    }).join(""),
    12
  );
}

function filteredPayments() {
  return state.payments.filter((payment) => {
    if (paymentFilters.date && String(payment.paidAt || "").slice(0, 10) !== paymentFilters.date) return false;
    if (paymentFilters.method && String(payment.method || "").toLowerCase() !== paymentFilters.method.toLowerCase()) return false;
    if (paymentFilters.status && String(payment.status || "").toLowerCase() !== paymentFilters.status.toLowerCase()) return false;
    return true;
  });
}

function renderPayments() {
  const tbody = document.getElementById("payments-table");
  if (isSectionLoading("payments")) {
    tbody.innerHTML = loadingRows(7, 4);
    return;
  }

  const visiblePayments = filteredPayments();

  tbody.innerHTML = rowsOrEmpty(
    visiblePayments,
    visiblePayments.map((payment) => {
      const reservation = findById(state.reservations, payment.reservationId);
      return `
        <tr>
          <td><strong>${reservation?.code || "Sin reservacion"}</strong></td>
          <td>${reservation ? guestName(reservation.guestId) : "-"}</td>
          <td>${formatMoney(payment.amount)}</td>
          <td>${capitalize(payment.method)}</td>
          <td>${badge(payment.status)}</td>
          <td>${formatDate(payment.paidAt)}</td>
          <td>
            <div class="row-actions">
              <button class="ghost-button" type="button" onclick="openPaymentModal('${payment.id}')">Editar</button>
            </div>
          </td>
        </tr>
      `;
    }).join(""),
    7
  );

  const totalFiltrado = visiblePayments
    .filter(isValidPayment)
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  if (els.paymentsFilteredCount) {
    els.paymentsFilteredCount.textContent = `${visiblePayments.length} pago${visiblePayments.length === 1 ? "" : "s"}`;
  }
  if (els.paymentsFilteredTotal) {
    els.paymentsFilteredTotal.textContent = formatMoney(totalFiltrado);
  }
}

// ===== Calendario de ocupacion =====

function calendarDateRange() {
  const days = [];
  for (let i = 0; i < CALENDAR_RANGE_DAYS; i++) {
    days.push(addDaysIso(calendarStartDate, i));
  }
  return days;
}

function shiftCalendarRange(days) {
  calendarStartDate = addDaysIso(calendarStartDate, days);
  renderCalendar();
}

function setCalendarRangeToToday() {
  calendarStartDate = todayIso();
  renderCalendar();
}

function renderCalendar() {
  if (!els.calendarTableHead || !els.calendarTableBody) return;

  const days = calendarDateRange();
  renderCalendarHeader(days);
  updateCalendarRangeLabel(days);

  const colspan = 2 + days.length;
  const isLoading = isSectionLoading("rooms") || isSectionLoading("reservations");

  if (isLoading) {
    els.calendarTableBody.innerHTML = loadingRows(colspan, 5);
    return;
  }

  if (!state.rooms.length) {
    els.calendarTableBody.innerHTML = `<tr><td class="empty-row" colspan="${colspan}">Sin habitaciones registradas</td></tr>`;
    return;
  }

  els.calendarTableBody.innerHTML = state.rooms
    .slice()
    .sort((a, b) => String(a.number).localeCompare(String(b.number), "es", { numeric: true }))
    .map((room) => renderCalendarRow(room, days))
    .join("");
}

function renderCalendarHeader(days) {
  const today = todayIso();

  els.calendarTableHead.innerHTML = `
    <tr>
      <th>Habitacion</th>
      <th>Tipo</th>
      ${days.map((dateIso) => `
        <th class="calendar-day-head ${dateIso === today ? "is-today" : ""}">${formatCalendarHeaderDate(dateIso)}</th>
      `).join("")}
    </tr>
  `;
}

function formatCalendarHeaderDate(dateIso) {
  const date = new Date(`${dateIso}T00:00:00`);
  const weekday = capitalize(new Intl.DateTimeFormat("es-CO", { weekday: "short" }).format(date));
  const day = new Intl.DateTimeFormat("es-CO", { day: "2-digit" }).format(date);
  const month = capitalize(new Intl.DateTimeFormat("es-CO", { month: "short" }).format(date).replace(".", ""));
  return `<span class="calendar-day-weekday">${weekday}</span><span class="calendar-day-num">${day} ${month}</span>`;
}

function updateCalendarRangeLabel(days) {
  if (!els.calendarRangeLabel) return;
  els.calendarRangeLabel.textContent = `${formatDate(days[0])} - ${formatDate(days[days.length - 1])}`;
}

function renderCalendarRow(room, days) {
  const activeReservations = state.reservations.filter((reservation) =>
    reservation.roomId === room.id && BLOCKING_RESERVATION_STATUSES.includes(reservation.status)
  );

  const cells = days
    .map((dateIso) => renderCalendarCell(room, dateIso, computeCalendarCellStatus(room, dateIso, activeReservations)))
    .join("");

  return `
    <tr>
      <td class="calendar-room-cell"><strong>${room.number}</strong></td>
      <td class="calendar-type-cell">${room.type}</td>
      ${cells}
    </tr>
  `;
}

// Determina el estado visual de una habitacion en un dia especifico.
// Prioridad: salida/entrada (turnover) > check-in > check-out > ocupada > mantenimiento > disponible.
// La fecha de checkout NO ocupa la noche, solo se marca como check-out (regla del proyecto).
function computeCalendarCellStatus(room, dateIso, activeReservations) {
  const checkInReservation = activeReservations.find((reservation) => reservation.checkIn === dateIso);
  const checkOutReservation = activeReservations.find((reservation) => reservation.checkOut === dateIso);

  if (checkInReservation && checkOutReservation) {
    return { type: "turnover", checkInReservation, checkOutReservation };
  }

  if (checkInReservation) {
    return { type: "check-in", reservation: checkInReservation };
  }

  if (checkOutReservation) {
    return { type: "check-out", reservation: checkOutReservation };
  }

  const occupiedReservation = activeReservations.find(
    (reservation) => dateIso > reservation.checkIn && dateIso < reservation.checkOut
  );

  if (occupiedReservation) {
    return { type: "ocupada", reservation: occupiedReservation };
  }

  if (room.status === "mantenimiento") {
    return { type: "mantenimiento" };
  }

  return { type: "disponible" };
}

function renderCalendarCell(room, dateIso, cellInfo) {
  if (cellInfo.type === "turnover") {
    return `<td class="calendar-cell cal-turnover" onclick="showCalendarTurnoverDetail('${cellInfo.checkOutReservation.id}', '${cellInfo.checkInReservation.id}')" title="Sale ${cellInfo.checkOutReservation.code} / Entra ${cellInfo.checkInReservation.code}">OUT/IN</td>`;
  }

  if (cellInfo.type === "check-in") {
    return `<td class="calendar-cell cal-checkin" onclick="showCalendarReservationDetail('${cellInfo.reservation.id}')" title="Check-in - ${cellInfo.reservation.code}">IN</td>`;
  }

  if (cellInfo.type === "check-out") {
    return `<td class="calendar-cell cal-checkout" onclick="showCalendarReservationDetail('${cellInfo.reservation.id}')" title="Check-out - ${cellInfo.reservation.code}">OUT</td>`;
  }

  if (cellInfo.type === "ocupada") {
    return `<td class="calendar-cell cal-ocupada" onclick="showCalendarReservationDetail('${cellInfo.reservation.id}')" title="Ocupada - ${cellInfo.reservation.code}"></td>`;
  }

  if (cellInfo.type === "mantenimiento") {
    return `<td class="calendar-cell cal-mantenimiento" title="Mantenimiento"></td>`;
  }

  return `<td class="calendar-cell cal-disponible" onclick="openReservationModalFromCalendar('${room.id}', '${dateIso}')" title="Disponible - clic para reservar"></td>`;
}

function openReservationModalFromCalendar(roomId, checkInIso) {
  openReservationModal(null, {
    roomId,
    checkIn: checkInIso,
    checkOut: addDaysIso(checkInIso, 1)
  });
}

function showCalendarReservationDetail(reservationId) {
  const reservation = findById(state.reservations, reservationId);
  if (!reservation) return;
  renderCalendarDetailModal([reservation]);
}

function showCalendarTurnoverDetail(checkOutReservationId, checkInReservationId) {
  const reservations = [
    findById(state.reservations, checkOutReservationId),
    findById(state.reservations, checkInReservationId)
  ].filter(Boolean);

  if (!reservations.length) return;
  renderCalendarDetailModal(reservations, true);
}

function renderCalendarDetailModal(reservations, isTurnover = false) {
  els.calendarDetailTitle.textContent = isTurnover ? "Salida y entrada el mismo dia" : "Detalle de reservacion";

  const turnoverLabels = ["Sale", "Entra"];
  const turnoverBadgeClass = ["check-out", "check-in"];

  els.calendarDetailBody.innerHTML = reservations.map((reservation, index) => `
    <div class="calendar-detail-card">
      ${isTurnover ? `<span class="badge ${turnoverBadgeClass[index]}">${turnoverLabels[index]}</span>` : ""}
      <div class="calendar-detail-grid">
        <div class="detail-item"><span>Huesped</span><strong>${guestName(reservation.guestId)}</strong></div>
        <div class="detail-item"><span>Habitacion</span><strong>${roomLabel(reservation.roomId)}</strong></div>
        <div class="detail-item"><span>Entrada</span><strong>${formatDate(reservation.checkIn)}</strong></div>
        <div class="detail-item"><span>Salida</span><strong>${formatDate(reservation.checkOut)}</strong></div>
        <div class="detail-item"><span>Estado</span><strong>${badge(reservation.status)}</strong></div>
        <div class="detail-item"><span>Total</span><strong>${formatMoney(reservation.total)}</strong></div>
      </div>
      <div class="calendar-detail-actions">
        <button class="ghost-button" type="button" onclick="editReservationFromCalendar('${reservation.id}')">Editar reservacion</button>
        <button class="ghost-button" type="button" onclick="openReservationReceipt('${reservation.id}')">Comprobante</button>
        ${["pendiente", "confirmada"].includes(reservation.status)
          ? `<button class="checkin-button" type="button" onclick="closeCalendarDetailModal(); performCheckIn('${reservation.id}')">Check-In</button>`
          : ""}
        ${reservation.status === "check-in"
          ? `<button class="checkout-button" type="button" onclick="closeCalendarDetailModal(); performCheckOut('${reservation.id}')">Check-Out</button>`
          : ""}
      </div>
    </div>
  `).join("");

  showCalendarDetailModal();
}

function editReservationFromCalendar(reservationId) {
  closeCalendarDetailModal();
  openReservationModal(reservationId);
}

// ===== Detalle de reservacion (historial de pagos) =====

function showReservationDetail(reservationId) {
  const reservation = findById(state.reservations, reservationId);
  if (!reservation) return;

  activeReservationDetailId = reservationId;
  const summary = calculatePaymentSummary(reservationId);

  els.reservationDetailTitle.textContent = `Detalle de reservacion ${reservation.code}`;

  const historyRows = summary.payments.length
    ? summary.payments.map((payment) => `
        <tr>
          <td>${formatDate(payment.paidAt)}</td>
          <td>${formatMoney(payment.amount)}</td>
          <td>${capitalize(payment.method)}</td>
          <td>${badge(payment.status)}</td>
        </tr>
      `).join("")
    : "";

  els.reservationDetailBody.innerHTML = `
    <div class="calendar-detail-grid">
      <div class="detail-item"><span>Huesped</span><strong>${guestName(reservation.guestId)}</strong></div>
      <div class="detail-item"><span>Habitacion</span><strong>${roomLabel(reservation.roomId)}</strong></div>
      <div class="detail-item"><span>Entrada</span><strong>${formatDate(reservation.checkIn)}</strong></div>
      <div class="detail-item"><span>Salida</span><strong>${formatDate(reservation.checkOut)}</strong></div>
    </div>
    <div class="payment-summary-grid">
      <div class="caja-metric"><span>Total reserva</span><strong>${formatMoney(summary.totalReservation)}</strong></div>
      <div class="caja-metric"><span>Total pagado</span><strong>${formatMoney(summary.totalPaid)}</strong></div>
      <div class="caja-metric"><span>Saldo pendiente</span><strong>${formatMoney(summary.balanceDue)}</strong></div>
      <div class="caja-metric"><span>Estado de pago</span><strong>${paymentStatusBadge(summary.paymentStatus)}</strong></div>
    </div>
    <h3>Historial de pagos</h3>
    ${historyRows
      ? `
        <table class="payment-history-table">
          <thead>
            <tr><th>Fecha</th><th>Monto</th><th>Metodo</th><th>Estado</th></tr>
          </thead>
          <tbody>${historyRows}</tbody>
        </table>
      `
      : `<div class="payment-history-empty">Sin pagos registrados para esta reservacion.</div>`
    }
  `;

  showReservationDetailModal();
}

function showReservationDetailModal() {
  if (typeof els.reservationDetailModal.showModal === "function") {
    els.reservationDetailModal.showModal();
    return;
  }
  els.reservationDetailModal.setAttribute("open", "");
}

function closeReservationDetailModal() {
  if (typeof els.reservationDetailModal.close === "function" && els.reservationDetailModal.open) {
    els.reservationDetailModal.close();
    return;
  }
  els.reservationDetailModal.removeAttribute("open");
}

function showCalendarDetailModal() {
  if (typeof els.calendarDetailModal.showModal === "function") {
    els.calendarDetailModal.showModal();
    return;
  }
  els.calendarDetailModal.setAttribute("open", "");
}

function closeCalendarDetailModal() {
  if (typeof els.calendarDetailModal.close === "function" && els.calendarDetailModal.open) {
    els.calendarDetailModal.close();
    return;
  }
  els.calendarDetailModal.removeAttribute("open");
}

// ===== Comprobante de reserva y WhatsApp =====

function openReservationReceipt(reservationId) {
  const reservation = findById(state.reservations, reservationId);
  if (!reservation) return;

  activeReservationReceiptId = reservationId;
  renderReservationReceipt(reservationId);
  showReservationReceiptModal();
}

function showReservationReceiptModal() {
  if (typeof els.reservationReceiptModal.showModal === "function") {
    els.reservationReceiptModal.showModal();
    return;
  }
  els.reservationReceiptModal.setAttribute("open", "");
}

function closeReservationReceipt() {
  if (typeof els.reservationReceiptModal.close === "function" && els.reservationReceiptModal.open) {
    els.reservationReceiptModal.close();
    return;
  }
  els.reservationReceiptModal.removeAttribute("open");
}

// Renderiza el comprobante de reserva. Trabaja unicamente con datos ya cargados
// en memoria (state.reservations/guests/rooms/payments), sin llamadas a la API.
function renderReservationReceipt(reservationId) {
  const reservation = findById(state.reservations, reservationId);
  if (!reservation) return;

  const guest = findById(state.guests, reservation.guestId);
  const room = findById(state.rooms, reservation.roomId);
  const summary = calculatePaymentSummary(reservationId);

  const paymentRows = summary.payments.length
    ? summary.payments.map((payment) => `
        <tr>
          <td>${formatDate(payment.paidAt)}</td>
          <td>${capitalize(payment.method)}</td>
          <td>${formatMoney(payment.amount)}</td>
        </tr>
      `).join("")
    : "";

  els.reservationReceiptBody.innerHTML = `
    <div class="receipt-document" id="receipt-printable">
      <div class="receipt-header">
        <div class="receipt-hotel-name">Hostal Central Beach</div>
        <div class="receipt-doc-title">Comprobante de reserva</div>
        <div class="receipt-meta">
          <span>Fecha de emision: ${formatDateTime(new Date().toISOString())}</span>
          <span>ID de reserva: ${reservation.code || reservation.id}</span>
        </div>
      </div>

      <div class="receipt-status-row">
        <span>Estado de la reserva:</span> ${badge(reservation.status)}
      </div>

      <div class="receipt-section">
        <h3>Huesped</h3>
        <div class="calendar-detail-grid">
          <div class="detail-item"><span>Nombre</span><strong>${guest?.name || "Huesped no encontrado"}</strong></div>
          <div class="detail-item"><span>Documento</span><strong>${guest?.document || "-"}</strong></div>
          <div class="detail-item"><span>Telefono</span><strong>${guest?.phone || "-"}</strong></div>
          <div class="detail-item"><span>Email</span><strong>${guest?.email || "-"}</strong></div>
          ${guest?.country ? `<div class="detail-item"><span>Pais</span><strong>${guest.country}</strong></div>` : ""}
        </div>
      </div>

      <div class="receipt-section">
        <h3>Habitacion</h3>
        <div class="calendar-detail-grid">
          <div class="detail-item"><span>Numero</span><strong>${room?.number || "-"}</strong></div>
          <div class="detail-item"><span>Tipo</span><strong>${room?.type || "-"}</strong></div>
          <div class="detail-item"><span>Capacidad</span><strong>${room?.capacity ? `${room.capacity} pers.` : "-"}</strong></div>
          ${room?.rate ? `<div class="detail-item"><span>Tarifa por noche</span><strong>${formatMoney(room.rate)}</strong></div>` : ""}
        </div>
      </div>

      <div class="receipt-section">
        <h3>Estadia</h3>
        <div class="calendar-detail-grid">
          <div class="detail-item"><span>Entrada</span><strong>${formatDate(reservation.checkIn)}</strong></div>
          <div class="detail-item"><span>Salida</span><strong>${formatDate(reservation.checkOut)}</strong></div>
          <div class="detail-item"><span>Noches</span><strong>${reservation.nights}</strong></div>
        </div>
      </div>

      <div class="receipt-section">
        <h3>Resumen financiero</h3>
        <div class="payment-summary-grid">
          <div class="caja-metric"><span>Total reserva</span><strong>${formatMoney(summary.totalReservation)}</strong></div>
          <div class="caja-metric"><span>Total pagado</span><strong>${formatMoney(summary.totalPaid)}</strong></div>
          <div class="caja-metric"><span>Saldo pendiente</span><strong>${formatMoney(summary.balanceDue)}</strong></div>
          <div class="caja-metric"><span>Estado de pago</span><strong>${paymentStatusBadge(summary.paymentStatus)}</strong></div>
        </div>
      </div>

      <div class="receipt-section">
        <h3>Pagos</h3>
        ${paymentRows
          ? `
            <table class="payment-history-table">
              <thead>
                <tr><th>Fecha</th><th>Metodo</th><th>Monto</th></tr>
              </thead>
              <tbody>${paymentRows}</tbody>
            </table>
          `
          : `<div class="payment-history-empty">Sin pagos registrados para esta reservacion.</div>`
        }
      </div>

      <div class="receipt-notes">
        <p>Este comprobante confirma la reservacion registrada en el sistema.</p>
        <p>Aplican las politicas internas del alojamiento.</p>
      </div>
    </div>
  `;
}

// Imprime unicamente el comprobante de reserva: agrega una clase al body que el
// CSS de impresion usa para ocultar todo excepto el dialog del comprobante.
function printReservationReceipt() {
  document.body.classList.add("printing-receipt");
  window.print();
}

function copyReservationReceiptSummary(reservationId) {
  const text = buildReservationReceiptText(reservationId);
  if (!text) return;

  const fallbackCopy = () => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      document.execCommand("copy");
    } catch (error) {
      console.error("[Central Beach] No se pudo copiar el comprobante.", error);
    }

    document.body.removeChild(textarea);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => showNotice("Resumen del comprobante copiado al portapapeles", "success"))
      .catch(() => {
        fallbackCopy();
        showNotice("Resumen del comprobante copiado al portapapeles", "success");
      });
    return;
  }

  fallbackCopy();
  showNotice("Resumen del comprobante copiado al portapapeles", "success");
}

// Texto plano del comprobante, reutilizado por "Copiar resumen".
function buildReservationReceiptText(reservationId) {
  const reservation = findById(state.reservations, reservationId);
  if (!reservation) return "";

  const guest = findById(state.guests, reservation.guestId);
  const room = findById(state.rooms, reservation.roomId);
  const summary = calculatePaymentSummary(reservationId);

  return [
    "Hostal Central Beach",
    "Comprobante de reserva",
    `ID de reserva: ${reservation.code || reservation.id}`,
    `Estado: ${capitalize(reservation.status)}`,
    "",
    `Huesped: ${guest?.name || "-"}`,
    `Documento: ${guest?.document || "-"}`,
    `Telefono: ${guest?.phone || "-"}`,
    `Email: ${guest?.email || "-"}`,
    "",
    `Habitacion: ${room?.number || "-"}${room?.type ? ` - ${room.type}` : ""}`,
    `Entrada: ${reservation.checkIn}`,
    `Salida: ${reservation.checkOut}`,
    `Noches: ${reservation.nights}`,
    "",
    `Total: ${formatMoney(summary.totalReservation)}`,
    `Pagado: ${formatMoney(summary.totalPaid)}`,
    `Saldo pendiente: ${formatMoney(summary.balanceDue)}`,
    `Estado de pago: ${capitalize(summary.paymentStatus)}`
  ].join("\n");
}

// Mensaje de WhatsApp para la reservacion. Reutiliza calculatePaymentSummary/formatMoney,
// trabaja unicamente con datos ya cargados en memoria.
function buildReservationWhatsAppMessage(reservationId) {
  const reservation = findById(state.reservations, reservationId);
  if (!reservation) return "";

  const guest = findById(state.guests, reservation.guestId);
  const room = findById(state.rooms, reservation.roomId);
  const summary = calculatePaymentSummary(reservationId);

  return [
    `Hola ${guest?.name || ""}.`.trim(),
    "",
    "Tu reserva en Hostal Central Beach ha sido registrada.",
    "",
    `Habitacion: ${room?.number || "-"}`,
    `Entrada: ${reservation.checkIn}`,
    `Salida: ${reservation.checkOut}`,
    `Noches: ${reservation.nights}`,
    "",
    `Total: ${formatMoney(summary.totalReservation)}`,
    `Pagado: ${formatMoney(summary.totalPaid)}`,
    `Saldo pendiente: ${formatMoney(summary.balanceDue)}`,
    "",
    `Estado: ${capitalize(reservation.status)}`,
    "",
    "Te esperamos."
  ].join("\n");
}

// Deja unicamente digitos en el numero (quita espacios, guiones, parentesis y el "+"),
// conservando el codigo de pais. Es el formato que espera https://wa.me/.
function normalizePhoneForWhatsApp(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function openReservationWhatsApp(reservationId) {
  const reservation = findById(state.reservations, reservationId);
  if (!reservation) return;

  const guest = findById(state.guests, reservation.guestId);
  const phoneDigits = normalizePhoneForWhatsApp(guest?.phone);

  if (!phoneDigits) {
    showNotice("El huesped no tiene telefono registrado.", "error");
    return;
  }

  const message = buildReservationWhatsAppMessage(reservationId);
  window.open(`https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`, "_blank");
}

function renderRoomStatusSelect(room) {
  return `
    <select aria-label="Estado de habitacion ${room.number}" onchange="updateRoomStatus('${room.id}', this.value)">
      ${roomStatuses.map((status) => `<option value="${status}" ${room.status === status ? "selected" : ""}>${capitalize(status)}</option>`).join("")}
    </select>
  `;
}

function renderReservationStatusSelect(reservation) {
  return `
    <select aria-label="Estado de reservacion ${reservation.code}" onchange="updateReservationStatus('${reservation.id}', this.value)">
      ${reservationStatuses.map((status) => `<option value="${status}" ${reservation.status === status ? "selected" : ""}>${capitalize(status)}</option>`).join("")}
    </select>
  `;
}

async function updateRoomStatus(roomId, status) {
  if (!hasApiUrl()) {
    const room = updateCollectionItem("rooms", roomId, { status });
    console.info("[Central Beach] Habitacion actualizada en modo local.", room);
    showNotice("Guardado correctamente", "success");
    return;
  }

  const currentRoom = findById(state.rooms, roomId);
  const payload = { ...currentRoom, status };

  try {
    const saved = await persistEntity("rooms", payload, "PUT");
    if (saved) {
      upsertResourceItem("rooms", saved);
    } else {
      await refreshResource("rooms");
    }
    renderResource("rooms");
    showNotice("Guardado correctamente", "success");
  } catch (error) {
    console.error("[Central Beach] Error actualizando habitacion.", error);
    renderResource("rooms");
    showNotice("No se pudo guardar. Revisa tu conexion o la consola.", "error", false);
  }
}

async function updateReservationStatus(reservationId, status) {
  const currentReservation = findById(state.reservations, reservationId);
  if (!currentReservation) return;

  if (BLOCKING_RESERVATION_STATUSES.includes(status)) {
    const availability = checkRoomAvailability(currentReservation.roomId, currentReservation.checkIn, currentReservation.checkOut, reservationId);
    if (!availability.available) {
      const conflict = availability.conflict;
      showNotice(
        `No se pudo cambiar el estado: la habitacion ya esta reservada del ${formatDate(conflict.checkIn)} al ${formatDate(conflict.checkOut)} (reservacion ${conflict.code}).`,
        "error",
        false
      );
      renderResource("reservations");
      return;
    }
  }

  if (!hasApiUrl()) {
    state.reservations = state.reservations.map((reservation) =>
      reservation.id === reservationId ? { ...reservation, status } : reservation
    );

    const reservation = findById(state.reservations, reservationId);
    reconcileReservationRooms(reservation);
    renderAll();
    console.info("[Central Beach] Reservacion actualizada en modo local.", reservation);
    showNotice("Guardado correctamente", "success");
    return;
  }

  const previousRoomId = currentReservation?.roomId;
  const payload = { ...currentReservation, status };

  try {
    const saved = await persistEntity("reservations", payload, "PUT");
    if (saved) {
      upsertResourceItem("reservations", saved);
      reconcileReservationRooms(saved, previousRoomId);
      const roomsSynced = await persistRoomsByIds([previousRoomId, saved.roomId]);
      if (!roomsSynced) throw new Error("No se pudieron sincronizar las habitaciones relacionadas.");
    } else {
      await refreshResource("reservations");
      const refreshedReservation = findById(state.reservations, reservationId);
      reconcileReservationRooms(refreshedReservation, previousRoomId);
      const roomsSynced = await persistRoomsByIds([previousRoomId, refreshedReservation?.roomId]);
      if (!roomsSynced) throw new Error("No se pudieron sincronizar las habitaciones relacionadas.");
    }
    renderResource("rooms");
    renderResource("reservations");
    showNotice("Guardado correctamente", "success");
  } catch (error) {
    console.error("[Central Beach] Error actualizando reservacion.", error);
    renderResource("reservations");
    showNotice(error?.message || "No se pudo guardar. Revisa tu conexion o la consola.", "error", false);
  }
}

function updateCollectionItem(collection, id, updates) {
  let updatedItem = null;
  state[collection] = state[collection].map((item) => {
    if (item.id !== id) return item;
    updatedItem = { ...item, ...updates };
    return updatedItem;
  });
  renderAll();
  return updatedItem;
}

async function refreshResource(resource) {
  console.info("[Central Beach] Refrescando recurso.", { resource });
  showSectionLoading(resource);

  try {
    state[resource] = await apiGet(resource);
  } finally {
    hideSectionLoading(resource);
  }

  renderResource(resource);
}

function upsertResourceItem(resource, item) {
  if (!item || !item.id) return;

  const index = state[resource].findIndex((currentItem) => currentItem.id === item.id);

  if (index === -1) {
    state[resource] = [...state[resource], item];
    return;
  }

  state[resource] = state[resource].map((currentItem) =>
    currentItem.id === item.id ? item : currentItem
  );
}

function renderResource(resource) {
  if (resource === "rooms") {
    renderRooms();
    renderDashboard();
    renderCajaHoy();
    renderReservations();
    renderCalendar();
    renderReports();
    return;
  }

  if (resource === "guests") {
    renderGuests();
    renderDashboard();
    renderReservations();
    renderPayments();
    renderReports();
    return;
  }

  if (resource === "reservations") {
    renderReservations();
    renderDashboard();
    renderCajaHoy();
    renderPayments();
    renderCalendar();
    renderReports();
    return;
  }

  if (resource === "payments") {
    renderPayments();
    renderDashboard();
    renderCajaHoy();
    renderReservations();
    renderReports();
  }
}

function openRoomModal(id = null) {
  const room = id ? findById(state.rooms, id) : null;
  activeModal = { type: "room", id };
  els.modalTitle.textContent = room ? "Editar habitacion" : "Nueva habitacion";
  els.reservationSummary.classList.add("hidden");
  els.modalFields.innerHTML = `
    ${field("number", "Numero", "text", room?.number || "", true)}
    ${field("type", "Tipo", "text", room?.type || "", true)}
    ${field("capacity", "Capacidad", "number", room?.capacity || 2, true, { min: 1 })}
    ${field("rate", "Tarifa por noche", "number", room?.rate || 150000, true, { min: 0 })}
    ${selectField("status", "Estado", roomStatuses, room?.status || "disponible", true)}
  `;
  showModal();
}

function openGuestModal(id = null) {
  const guest = id ? findById(state.guests, id) : null;
  activeModal = { type: "guest", id };
  els.modalTitle.textContent = guest ? "Editar huesped" : "Nuevo huesped";
  els.reservationSummary.classList.add("hidden");
  els.modalFields.innerHTML = `
    ${field("name", "Nombre completo", "text", guest?.name || "", true)}
    ${field("document", "Documento", "text", guest?.document || "", true)}
    ${field("email", "Email", "email", guest?.email || "", true)}
    ${field("phone", "Telefono", "tel", guest?.phone || "", true)}
  `;
  showModal();
}

function openReservationModal(id = null, prefill = null) {
  const reservation = id ? findById(state.reservations, id) : null;
  activeModal = { type: "reservation", id };
  els.modalTitle.textContent = reservation ? "Editar reservacion" : "Nueva reservacion";

  const initialCheckIn = reservation?.checkIn || prefill?.checkIn || todayIso();
  const initialCheckOut = reservation?.checkOut || prefill?.checkOut || addDaysIso(initialCheckIn, 1);
  const roomOptions = buildReservationRoomOptions(id, initialCheckIn, initialCheckOut);
  const preferredRoomId = reservation?.roomId || prefill?.roomId || "";
  const initialRoomId = roomOptions.some((option) => option.value === preferredRoomId)
    ? preferredRoomId
    : (roomOptions[0]?.value || "");

  els.modalFields.innerHTML = `
    ${selectField("guestId", "Huesped", state.guests.map((guest) => ({ value: guest.id, label: guest.name })), reservation?.guestId || "", true)}
    ${selectField("roomId", "Habitacion disponible", roomOptions, initialRoomId, true)}
    ${field("checkIn", "Fecha de entrada", "date", initialCheckIn, true)}
    ${field("checkOut", "Fecha de salida", "date", initialCheckOut, true)}
    ${selectField("status", "Estado", reservationStatuses, reservation?.status || "pendiente", true)}
  `;

  els.modalFields.querySelectorAll("[name='checkIn'], [name='checkOut']").forEach((input) => {
    input.addEventListener("change", () => {
      refreshReservationRoomOptions(id);
      updateReservationSummary();
    });
  });

  els.modalFields.querySelector("[name='roomId']").addEventListener("change", updateReservationSummary);
  els.modalFields.querySelector("[name='status']").addEventListener("change", updateReservationSummary);

  updateReservationSummary();
  showModal();
}

function buildReservationRoomOptions(reservationId, checkIn, checkOut) {
  const availableRooms = availableRoomsForReservation(reservationId, checkIn, checkOut);
  const rooms = availableRooms.length ? availableRooms : [{ id: "", number: "Sin habitaciones disponibles", type: "", rate: 0 }];

  return rooms.map((room) => ({
    value: room.id,
    label: room.id ? `${room.number} - ${room.type} (${formatMoney(room.rate)})` : room.number
  }));
}

// Reconstruye el <select> de habitaciones cuando cambian las fechas, conservando
// la seleccion actual si sigue siendo valida para el nuevo rango de fechas.
function refreshReservationRoomOptions(reservationId) {
  const select = els.modalFields.querySelector("[name='roomId']");
  if (!select) return;

  const checkIn = els.modalFields.querySelector("[name='checkIn']")?.value;
  const checkOut = els.modalFields.querySelector("[name='checkOut']")?.value;
  const previousValue = select.value;
  const options = buildReservationRoomOptions(reservationId, checkIn, checkOut);
  const stillValid = options.some((option) => option.value === previousValue && option.value !== "");
  const selectedValue = stillValid ? previousValue : (options[0]?.value || "");

  select.innerHTML = options
    .map((option) => `<option value="${escapeAttr(option.value)}" ${option.value === selectedValue ? "selected" : ""}>${option.label}</option>`)
    .join("");
}

function openPaymentModal(id = null, prefillReservationId = null) {
  const payment = id ? findById(state.payments, id) : null;
  activeModal = { type: "payment", id };
  els.modalTitle.textContent = payment ? "Editar pago" : "Registrar pago";
  els.reservationSummary.classList.add("hidden");

  const reservationOptions = state.reservations.map((reservation) => ({
    value: reservation.id,
    label: `${reservation.code} - ${guestName(reservation.guestId)} (${formatMoney(reservation.total)})`
  }));

  const initialReservationId = payment?.reservationId || prefillReservationId || reservationOptions[0]?.value || "";

  els.modalFields.innerHTML = `
    ${selectField("reservationId", "Reservacion", reservationOptions, initialReservationId, true)}
    ${field("amount", "Monto", "number", payment?.amount || 0, true, { min: 0 })}
    ${selectField("method", "Metodo de pago", paymentMethods, payment?.method || "efectivo", true)}
    ${selectField("status", "Estado del pago", paymentStatuses, payment?.status || "pendiente", true)}
    ${field("paidAt", "Fecha de pago", "date", payment?.paidAt || todayIso(), true)}
  `;
  showModal();
}

async function handleSubmit(event) {
  event.preventDefault();
  if (!activeModal || saving) {
    console.info("[Central Beach] Submit ignorado: no hay modal activo o ya hay un guardado en curso.");
    return;
  }

  const formData = new FormData(els.modalForm);
  const values = Object.fromEntries(formData.entries());
  const modalContext = { ...activeModal };
  const modalType = modalContext.type;
  const resource = resourceForModal(modalType);
  const method = modalContext.id ? "PUT" : "POST";

  setSaving(true);

  try {
    if (!hasApiUrl()) {
      let savedEntity = null;
      if (modalType === "room") savedEntity = saveRoom(values);
      if (modalType === "guest") savedEntity = saveGuest(values);
      if (modalType === "reservation") savedEntity = saveReservation(values);
      if (modalType === "payment") savedEntity = savePayment(values);

      closeModal();
      renderAll();
      console.info("[Central Beach] Registro guardado en modo local.", { modalType, savedEntity });
      showNotice("Guardado correctamente", "success");
      return;
    } else {
      if (!isApiEnabled()) {
        const message = "API_BASE_URL no es una URL /exec valida.";
        console.error("[Central Beach] Guardado cancelado por configuracion invalida.", { API_BASE_URL });
        setModalStatus(message, "error");
        showNotice("No se pudo guardar. Revisa tu conexion o la consola.", "error", false);
        return;
      }

      const previousReservation = modalContext.id ? findById(state.reservations, modalContext.id) : null;
      const payload = buildPayload(modalType, values, modalContext.id);
      const saved = await persistEntity(resource, payload, method);

      if (saved) {
        upsertResourceItem(resource, saved);
        if (resource === "reservations") {
          reconcileReservationRooms(saved, previousReservation?.roomId);
          const roomsSynced = await persistRoomsByIds([previousReservation?.roomId, saved.roomId]);
          if (!roomsSynced) throw new Error("No se pudieron sincronizar las habitaciones relacionadas.");
          renderResource("rooms");
        }
        renderResource(resource);
      } else {
        await refreshResource(resource);
        if (resource === "reservations") {
          const refreshedReservation = modalContext.id
            ? findById(state.reservations, modalContext.id)
            : findById(state.reservations, state.reservations[state.reservations.length - 1]?.id);
          reconcileReservationRooms(refreshedReservation, previousReservation?.roomId);
          const roomsSynced = await persistRoomsByIds([previousReservation?.roomId, refreshedReservation?.roomId]);
          if (!roomsSynced) throw new Error("No se pudieron sincronizar las habitaciones relacionadas.");
          renderResource("rooms");
        }
      }

      closeModal();
      showNotice("Guardado correctamente", "success");
    }
  } catch (error) {
    console.error("[Central Beach] Error guardando formulario.", error);
    const userMessage = error?.message || "No se pudo guardar.";
    setModalStatus(userMessage, "error");
    showNotice(userMessage, "error", false);
  } finally {
    if (activeModal) setSaving(false);
  }
}

// Valida en el frontend que una reservacion tenga fechas coherentes y no choque con otra
// reservacion activa en la misma habitacion. Lanza un Error (capturado por el caller) si hay conflicto.
// Si el estado del borrador no es bloqueante (cancelada/check-out), no valida solapamiento.
function validateReservationDraft(payload, excludeReservationId = null) {
  if (payload.checkOut <= payload.checkIn) {
    throw new Error("La fecha de salida debe ser posterior a la fecha de entrada.");
  }

  if (!BLOCKING_RESERVATION_STATUSES.includes(payload.status)) return;

  const availability = checkRoomAvailability(payload.roomId, payload.checkIn, payload.checkOut, excludeReservationId);

  if (!availability.available) {
    const conflict = availability.conflict;
    throw new Error(
      `La habitacion ya esta reservada del ${formatDate(conflict.checkIn)} al ${formatDate(conflict.checkOut)} (reservacion ${conflict.code}). Elige otras fechas u otra habitacion.`
    );
  }
}

function buildPayload(type, values, id = null) {
  if (type === "room") {
    return {
      ...(id ? { id } : {}),
      number: values.number.trim(),
      type: values.type.trim(),
      capacity: Number(values.capacity),
      rate: Number(values.rate),
      status: values.status
    };
  }

  if (type === "guest") {
    return {
      ...(id ? { id } : {}),
      name: values.name.trim(),
      document: values.document.trim(),
      email: values.email.trim(),
      phone: values.phone.trim()
    };
  }

  if (type === "reservation") {
    const existingReservation = id ? findById(state.reservations, id) : null;
    const room = findById(state.rooms, values.roomId);
    const nights = calculateNights(values.checkIn, values.checkOut);

    if (!room) {
      throw new Error("Selecciona una habitacion disponible.");
    }

    const payload = {
      ...(id ? { id } : {}),
      code: existingReservation?.code || nextReservationCode(),
      guestId: values.guestId,
      roomId: values.roomId,
      checkIn: values.checkIn,
      checkOut: values.checkOut,
      nights,
      total: nights * Number(room.rate || 0),
      status: values.status
    };

    validateReservationDraft(payload, id);

    return payload;
  }

  if (type === "payment") {
    return {
      ...(id ? { id } : {}),
      reservationId: values.reservationId,
      amount: Number(values.amount),
      method: values.method,
      status: values.status,
      paidAt: values.paidAt
    };
  }

  throw new Error("Tipo de formulario no soportado.");
}

function saveRoom(values) {
  const payload = {
    number: values.number.trim(),
    type: values.type.trim(),
    capacity: Number(values.capacity),
    rate: Number(values.rate),
    status: values.status
  };

  return saveEntity("rooms", payload, () => ({ id: makeId("room") }));
}

function saveGuest(values) {
  const payload = {
    name: values.name.trim(),
    document: values.document.trim(),
    email: values.email.trim(),
    phone: values.phone.trim()
  };

  return saveEntity("guests", payload, () => ({ id: makeId("guest") }));
}

function saveReservation(values) {
  const previous = activeModal.id ? findById(state.reservations, activeModal.id) : null;
  const room = findById(state.rooms, values.roomId);
  const nights = calculateNights(values.checkIn, values.checkOut);
  const payload = {
    guestId: values.guestId,
    roomId: values.roomId,
    checkIn: values.checkIn,
    checkOut: values.checkOut,
    nights,
    total: nights * Number(room?.rate || 0),
    status: values.status
  };

  validateReservationDraft(payload, activeModal.id);

  let savedReservation;

  if (activeModal.id) {
    state.reservations = state.reservations.map((reservation) => {
      if (reservation.id !== activeModal.id) return reservation;
      savedReservation = { ...reservation, ...payload };
      return savedReservation;
    });
  } else {
    savedReservation = {
      id: makeId("res"),
      code: nextReservationCode(),
      ...payload
    };
    state.reservations.push(savedReservation);
  }

  reconcileReservationRooms(savedReservation, previous?.roomId);
  return savedReservation;
}

function savePayment(values) {
  const payload = {
    reservationId: values.reservationId,
    amount: Number(values.amount),
    method: values.method,
    status: values.status,
    paidAt: values.paidAt
  };

  return saveEntity("payments", payload, () => ({ id: makeId("pay") }));
}

function saveEntity(collection, payload, defaultsFactory) {
  let savedItem;

  if (activeModal.id) {
    state[collection] = state[collection].map((item) => {
      if (item.id !== activeModal.id) return item;
      savedItem = { ...item, ...payload };
      return savedItem;
    });
    return savedItem;
  }

  savedItem = { ...defaultsFactory(), ...payload };
  state[collection].push(savedItem);
  return savedItem;
}

function resourceForModal(type) {
  return {
    room: "rooms",
    guest: "guests",
    reservation: "reservations",
    payment: "payments"
  }[type];
}

// Convierte una fecha 'YYYY-MM-DD' en un entero comparable (AAAAMMDD).
// Evita bugs de zona horaria al comparar fechas con new Date(...).
function dateToComparableNumber(value) {
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  return (year * 10000) + (month * 100) + day;
}

// Determina si dos rangos de fechas [checkInA, checkOutA) y [checkInB, checkOutB) se solapan.
// El dia de checkout NO bloquea: una reserva 20->25 y otra 25->28 son validas (no se solapan).
function dateRangesOverlap(checkInA, checkOutA, checkInB, checkOutB) {
  const startA = dateToComparableNumber(checkInA);
  const endA = dateToComparableNumber(checkOutA);
  const startB = dateToComparableNumber(checkInB);
  const endB = dateToComparableNumber(checkOutB);

  return startA < endB && startB < endA;
}

// Revisa si una habitacion esta disponible para un rango de fechas dado.
// Solo las reservas en estado bloqueante (BLOCKING_RESERVATION_STATUSES) cuentan como conflicto.
// excludeReservationId permite ignorar la propia reserva al editar.
function checkRoomAvailability(roomId, checkIn, checkOut, excludeReservationId = null) {
  if (!roomId || !checkIn || !checkOut) {
    return { available: true, conflict: null };
  }

  const conflict = state.reservations.find((reservation) => {
    if (reservation.roomId !== roomId) return false;
    if (excludeReservationId && reservation.id === excludeReservationId) return false;
    if (!BLOCKING_RESERVATION_STATUSES.includes(reservation.status)) return false;
    return dateRangesOverlap(checkIn, checkOut, reservation.checkIn, reservation.checkOut);
  }) || null;

  return { available: !conflict, conflict };
}

function availableRoomsForReservation(reservationId, checkIn, checkOut) {
  const currentRoomId = findById(state.reservations, reservationId)?.roomId;

  return state.rooms.filter((room) => {
    if (room.id === currentRoomId) return true;
    if (room.status === "mantenimiento") return false;
    return checkRoomAvailability(room.id, checkIn, checkOut, reservationId).available;
  });
}

function reconcileReservationRooms(reservation, previousRoomId = null) {
  if (!reservation) return;

  if (previousRoomId && previousRoomId !== reservation.roomId) {
    reconcileRoomStatusFromReservations(previousRoomId);
  }

  reconcileRoomStatusFromReservations(reservation.roomId);
}

function reconcileRoomStatusFromReservations(roomId) {
  const activeReservations = state.reservations.filter((reservation) =>
    reservation.roomId === roomId && BLOCKING_RESERVATION_STATUSES.includes(reservation.status)
  );

  if (activeReservations.some((reservation) => reservation.status === "check-in")) {
    setRoomStatus(roomId, "ocupada");
    return;
  }

  if (activeReservations.length > 0) {
    setRoomStatus(roomId, "reservada");
    return;
  }

  const room = findById(state.rooms, roomId);
  if (room && room.status !== "mantenimiento") {
    setRoomStatus(roomId, "disponible");
  }
}

function setRoomStatus(roomId, status) {
  state.rooms = state.rooms.map((room) =>
    room.id === roomId ? { ...room, status } : room
  );
}

function updateReservationSummary() {
  const roomId = els.modalFields.querySelector("[name='roomId']")?.value;
  const checkIn = els.modalFields.querySelector("[name='checkIn']")?.value;
  const checkOut = els.modalFields.querySelector("[name='checkOut']")?.value;
  const status = els.modalFields.querySelector("[name='status']")?.value;
  const room = findById(state.rooms, roomId);
  const nights = calculateNights(checkIn, checkOut);
  const total = nights * Number(room?.rate || 0);
  const hasInvalidRange = Boolean(checkIn && checkOut && checkOut <= checkIn);
  const isBlockingStatus = BLOCKING_RESERVATION_STATUSES.includes(status);
  const availability = (hasInvalidRange || !isBlockingStatus)
    ? { available: true, conflict: null }
    : checkRoomAvailability(roomId, checkIn, checkOut, activeModal?.id);

  els.reservationSummary.classList.remove("hidden");
  els.reservationSummary.innerHTML = `
    <div class="summary-item">
      <span>Noches</span>
      <strong>${nights}</strong>
    </div>
    <div class="summary-item">
      <span>Tarifa</span>
      <strong>${formatMoney(room?.rate || 0)}</strong>
    </div>
    <div class="summary-item">
      <span>Total</span>
      <strong>${formatMoney(total)}</strong>
    </div>
    ${hasInvalidRange ? `
      <div class="availability-warning">
        La fecha de salida debe ser posterior a la fecha de entrada.
      </div>
    ` : ""}
    ${!hasInvalidRange && !availability.available ? `
      <div class="availability-warning">
        Esta habitacion ya esta reservada del ${formatDate(availability.conflict.checkIn)} al ${formatDate(availability.conflict.checkOut)} (reservacion ${availability.conflict.code}). Elige otras fechas u otra habitacion.
      </div>
    ` : ""}
  `;
}

function showModal() {
  setSaving(false);
  setModalStatus("");

  if (typeof els.modal.showModal === "function") {
    els.modal.showModal();
    return;
  }

  els.modal.setAttribute("open", "");
}

function closeModal() {
  setSaving(false);
  activeModal = null;
  els.modalForm.reset();
  els.modalFields.innerHTML = "";
  els.reservationSummary.classList.add("hidden");
  setModalStatus("");

  if (typeof els.modal.close === "function" && els.modal.open) {
    els.modal.close();
    return;
  }

  els.modal.removeAttribute("open");
}

function field(name, label, type, value, required = false, attrs = {}) {
  const attrText = Object.entries(attrs).map(([key, attrValue]) => `${key}="${attrValue}"`).join(" ");
  return `
    <div class="field">
      <label for="${name}">${label}</label>
      <input id="${name}" name="${name}" type="${type}" value="${escapeAttr(value)}" ${required ? "required" : ""} ${attrText}>
    </div>
  `;
}

function selectField(name, label, options, value, required = false) {
  const normalizedOptions = options.map((option) =>
    typeof option === "string" ? { value: option, label: capitalize(option) } : option
  );

  return `
    <div class="field">
      <label for="${name}">${label}</label>
      <select id="${name}" name="${name}" ${required ? "required" : ""}>
        ${normalizedOptions.map((option) => `<option value="${escapeAttr(option.value)}" ${option.value === value ? "selected" : ""}>${option.label}</option>`).join("")}
      </select>
    </div>
  `;
}

function rowsOrEmpty(items, rows, colspan) {
  if (items.length) return rows;
  return `<tr><td class="empty-row" colspan="${colspan}">Sin registros</td></tr>`;
}

function loadingRows(colspan, count) {
  const rows = [];

  for (let i = 0; i < count; i++) {
    rows.push(`
      <tr>
        <td colspan="${colspan}" class="section-skeleton">
          <div class="skeleton-row"></div>
        </td>
      </tr>
    `);
  }

  return rows.join("");
}

function findById(items, id) {
  return items.find((item) => item.id === id);
}

function guestName(guestId) {
  return findById(state.guests, guestId)?.name || "Huesped no encontrado";
}

function roomLabel(roomId) {
  const room = findById(state.rooms, roomId);
  return room ? `${room.number} - ${room.type}` : "Habitacion no encontrada";
}

function calculateNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${checkOut}T00:00:00`);
  const diff = Math.round((end - start) / 86400000);
  return Math.max(diff, 0);
}

function nextReservationCode() {
  const maxNumber = state.reservations.reduce((max, reservation) => {
    const numeric = Number(String(reservation.code || "").replace(/\D/g, ""));
    return Number.isFinite(numeric) ? Math.max(max, numeric) : max;
  }, 1000);

  return `CB-${maxNumber + 1}`;
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-CO", { year: "numeric", month: "short", day: "2-digit" })
    .format(new Date(`${value}T00:00:00`));
}

// Igual que formatDate, pero incluye la hora si el valor trae timestamp completo (ISO con "T").
function formatDateTime(value) {
  if (!value) return "-";
  const raw = String(value);

  if (!raw.includes("T")) return formatDate(raw);

  return new Intl.DateTimeFormat("es-CO", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(raw));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(value, days) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function badge(value) {
  return `<span class="badge ${String(value).toLowerCase()}">${capitalize(value)}</span>`;
}

function capitalize(value) {
  return String(value || "")
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("-");
}

function escapeAttr(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// ===== Check-In / Check-Out =====

async function performCheckIn(reservationId) {
  const reservation = findById(state.reservations, reservationId);
  if (!reservation) return;

  if (!["pendiente", "confirmada"].includes(reservation.status)) {
    showNotice("Solo se puede hacer check-in a reservaciones pendientes o confirmadas.", "error", false);
    return;
  }

  const room = findById(state.rooms, reservation.roomId);
  if (room && room.status === "mantenimiento") {
    showNotice("La habitacion esta en mantenimiento. No se puede hacer check-in.", "error", false);
    return;
  }

  if (!window.confirm("¿Confirmar check-in para esta reservacion?")) return;

  showNotice("Procesando check-in...", "");

  try {
    const now = new Date().toISOString();
    const updatedReservation = { ...reservation, status: "check-in", actual_check_in_at: now };
    const updatedRoom = room ? { ...room, status: "ocupada" } : null;

    if (!hasApiUrl()) {
      upsertResourceItem("reservations", updatedReservation);
      if (updatedRoom) upsertResourceItem("rooms", updatedRoom);
      renderResource("reservations");
      renderResource("rooms");
      showNotice("Check-in realizado correctamente.", "success");
      return;
    }

    const savedReservation = await persistEntity("reservations", updatedReservation, "PUT");
    if (savedReservation) {
      upsertResourceItem("reservations", savedReservation);
    } else {
      await refreshResource("reservations");
    }

    if (updatedRoom) {
      const savedRoom = await persistEntity("rooms", updatedRoom, "PUT");
      if (savedRoom) {
        upsertResourceItem("rooms", savedRoom);
      } else {
        await refreshResource("rooms");
      }
    }

    renderResource("reservations");
    renderResource("rooms");
    showNotice("Check-in realizado correctamente.", "success");
  } catch (error) {
    console.error("[Central Beach] Error en check-in.", error);
    showNotice(error?.message || "No se pudo completar el check-in. Revisa la consola.", "error", false);
  }
}

async function performCheckOut(reservationId) {
  const reservation = findById(state.reservations, reservationId);
  if (!reservation) return;

  if (reservation.status !== "check-in") {
    showNotice("Solo se puede hacer check-out a reservaciones en estado check-in.", "error", false);
    return;
  }

  if (!window.confirm("¿Confirmar check-out para esta reservacion?")) return;

  showNotice("Procesando check-out...", "");

  try {
    const now = new Date().toISOString();
    const updatedReservation = { ...reservation, status: "check-out", actual_check_out_at: now };
    const room = findById(state.rooms, reservation.roomId);
    const updatedRoom = room ? { ...room, status: "disponible" } : null;

    if (!hasApiUrl()) {
      upsertResourceItem("reservations", updatedReservation);
      if (updatedRoom) upsertResourceItem("rooms", updatedRoom);
      renderResource("reservations");
      renderResource("rooms");
      showNotice("Check-out realizado correctamente.", "success");
      return;
    }

    const savedReservation = await persistEntity("reservations", updatedReservation, "PUT");
    if (savedReservation) {
      upsertResourceItem("reservations", savedReservation);
    } else {
      await refreshResource("reservations");
    }

    if (updatedRoom) {
      const savedRoom = await persistEntity("rooms", updatedRoom, "PUT");
      if (savedRoom) {
        upsertResourceItem("rooms", savedRoom);
      } else {
        await refreshResource("rooms");
      }
    }

    renderResource("reservations");
    renderResource("rooms");
    showNotice("Check-out realizado correctamente.", "success");
  } catch (error) {
    console.error("[Central Beach] Error en check-out.", error);
    showNotice(error?.message || "No se pudo completar el check-out. Revisa la consola.", "error", false);
  }
}

window.openRoomModal = openRoomModal;
window.openGuestModal = openGuestModal;
window.openReservationModal = openReservationModal;
window.openPaymentModal = openPaymentModal;
window.updateRoomStatus = updateRoomStatus;
window.updateReservationStatus = updateReservationStatus;
window.openReservationModalFromCalendar = openReservationModalFromCalendar;
window.showCalendarReservationDetail = showCalendarReservationDetail;
window.showCalendarTurnoverDetail = showCalendarTurnoverDetail;
window.editReservationFromCalendar = editReservationFromCalendar;
window.showReservationDetail = showReservationDetail;
window.closeReservationDetailModal = closeReservationDetailModal;
window.performCheckIn = performCheckIn;
window.performCheckOut = performCheckOut;

/* =============================================
   MOBILE-FIRST LAYER v4.0
   Hamburger menu, FAB, mobile card renderers
   ============================================= */

// ── MOBILE MENU ─────────────────────────────
(function initMobileMenu() {
  const hamburgerBtn  = document.getElementById("hamburger-btn");
  const sidebar       = document.getElementById("mobile-sidebar");
  const overlay       = document.getElementById("sidebar-overlay");
  const mobileTitle   = document.getElementById("mobile-view-title");

  if (!hamburgerBtn || !sidebar || !overlay) return;

  function openMenu() {
    sidebar.classList.add("is-open");
    overlay.classList.add("is-visible");
    hamburgerBtn.classList.add("is-open");
    hamburgerBtn.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }

  function closeMenu() {
    sidebar.classList.remove("is-open");
    overlay.classList.remove("is-visible");
    hamburgerBtn.classList.remove("is-open");
    hamburgerBtn.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }

  hamburgerBtn.addEventListener("click", () => {
    sidebar.classList.contains("is-open") ? closeMenu() : openMenu();
  });

  overlay.addEventListener("click", closeMenu);

  // Update mobile title and close sidebar when nav item is clicked
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (mobileTitle) {
        mobileTitle.textContent = btn.querySelector(".nav-label")?.textContent || btn.textContent.trim();
      }
      if (window.innerWidth <= 768) closeMenu();
    });
  });
})();

// ── FAB ─────────────────────────────────────
(function initFAB() {
  const fabMain   = document.getElementById("fab-main-btn");
  const fabMenu   = document.getElementById("fab-menu");
  const fabIcon   = document.getElementById("fab-icon");

  if (!fabMain || !fabMenu) return;

  let fabOpen = false;

  function openFAB() {
    fabOpen = true;
    fabMenu.classList.add("is-open");
    fabMenu.setAttribute("aria-hidden", "false");
    fabMain.classList.add("is-open");
    fabMain.setAttribute("aria-expanded", "true");
    if (fabIcon) fabIcon.textContent = "✕";
  }

  function closeFAB() {
    fabOpen = false;
    fabMenu.classList.remove("is-open");
    fabMenu.setAttribute("aria-hidden", "true");
    fabMain.classList.remove("is-open");
    fabMain.setAttribute("aria-expanded", "false");
    if (fabIcon) fabIcon.textContent = "＋";
  }

  fabMain.addEventListener("click", () => fabOpen ? closeFAB() : openFAB());

  document.addEventListener("click", (e) => {
    if (fabOpen && !document.getElementById("fab-container").contains(e.target)) closeFAB();
  });

  // FAB option actions
  function navigateTo(view) {
    closeFAB();
    const btn = document.querySelector(`.nav-item[data-view="${view}"]`);
    if (btn) btn.click();
  }

  const fabNuevaReserva = document.getElementById("fab-nueva-reserva");
  const fabNuevoHuesped = document.getElementById("fab-nuevo-huesped");
  const fabNuevoPago    = document.getElementById("fab-nuevo-pago");

  if (fabNuevaReserva) {
    fabNuevaReserva.addEventListener("click", () => {
      closeFAB();
      // Wait for view to switch if needed, then open modal
      navigateTo("reservations");
      setTimeout(() => {
        if (typeof openReservationModal === "function") openReservationModal();
      }, 80);
    });
  }

  if (fabNuevoHuesped) {
    fabNuevoHuesped.addEventListener("click", () => {
      closeFAB();
      navigateTo("guests");
      setTimeout(() => {
        if (typeof openGuestModal === "function") openGuestModal();
      }, 80);
    });
  }

  if (fabNuevoPago) {
    fabNuevoPago.addEventListener("click", () => {
      closeFAB();
      navigateTo("payments");
      setTimeout(() => {
        if (typeof openPaymentModal === "function") openPaymentModal();
      }, 80);
    });
  }
})();

// ── MOBILE CARD HELPERS ──────────────────────
function isMobile() {
  return window.innerWidth <= 768;
}

function mobileEmpty(message) {
  return `<div class="m-empty">${message}</div>`;
}

// ── ROOMS MOBILE CARDS ───────────────────────
function renderRoomsMobileCards() {
  const container = document.getElementById("rooms-cards");
  if (!container) return;

  if (isSectionLoading("rooms")) {
    container.innerHTML = `<div class="m-empty">Cargando habitaciones...</div>`;
    return;
  }

  if (!state.rooms || state.rooms.length === 0) {
    container.innerHTML = mobileEmpty("Sin habitaciones registradas");
    return;
  }

  container.innerHTML = state.rooms.map((room) => {
    const statusClass = room.status ? room.status.toLowerCase().replace(/\s+/g, "-") : "disponible";
    return `
      <div class="m-card">
        <div class="m-card-top">
          <div>
            <div class="m-card-title">Hab. ${room.number}</div>
            <div class="m-card-subtitle">${room.type} · Cap. ${room.capacity} pers.</div>
          </div>
          <span class="badge ${statusClass}">${capitalize(room.status)}</span>
        </div>
        <div class="m-card-meta">
          <span class="m-card-meta-item">
            <span class="m-card-meta-label">Tarifa:</span> ${formatMoney(room.rate)} / noche
          </span>
        </div>
        <div class="m-card-actions">
          <button class="secondary-button" type="button" onclick="openRoomModal('${room.id}')">✏️ Editar</button>
        </div>
      </div>
    `;
  }).join("");
}

// ── GUESTS MOBILE CARDS ──────────────────────
function renderGuestsMobileCards() {
  const container = document.getElementById("guests-cards");
  if (!container) return;

  if (isSectionLoading("guests")) {
    container.innerHTML = mobileEmpty("Cargando huespedes...");
    return;
  }

  if (!state.guests || state.guests.length === 0) {
    container.innerHTML = mobileEmpty("Sin huespedes registrados");
    return;
  }

  container.innerHTML = state.guests.map((guest) => `
    <div class="m-card">
      <div class="m-card-top">
        <div>
          <div class="m-card-title">${guest.name}</div>
          <div class="m-card-subtitle">${guest.document || "Sin documento"}</div>
        </div>
      </div>
      <div class="m-card-meta">
        ${guest.email ? `<span class="m-card-meta-item">📧 ${guest.email}</span>` : ""}
        ${guest.phone ? `<span class="m-card-meta-item">📞 ${guest.phone}</span>` : ""}
      </div>
      <div class="m-card-actions">
        <button class="secondary-button" type="button" onclick="openGuestModal('${guest.id}')">✏️ Editar</button>
      </div>
    </div>
  `).join("");
}

// ── RESERVATIONS MOBILE CARDS ────────────────
function renderReservationsMobileCards() {
  const container = document.getElementById("reservations-cards");
  if (!container) return;

  if (isSectionLoading("reservations") || isSectionLoading("payments")) {
    container.innerHTML = mobileEmpty("Cargando reservaciones...");
    return;
  }

  if (!state.reservations || state.reservations.length === 0) {
    container.innerHTML = mobileEmpty("Sin reservaciones registradas");
    return;
  }

  container.innerHTML = state.reservations.map((res) => {
    const summary = calculatePaymentSummary(res.id);
    const statusClass = res.status ? res.status.toLowerCase().replace(/\s+/g, "-") : "pendiente";
    const payClass    = summary.paymentStatus ? summary.paymentStatus.toLowerCase() : "pendiente";

    const checkinBtn = ["pendiente", "confirmada"].includes(res.status)
      ? `<button class="checkin-button" type="button" onclick="performCheckIn('${res.id}')">✅ Check-In</button>`
      : "";
    const checkoutBtn = res.status === "check-in"
      ? `<button class="checkout-button" type="button" onclick="performCheckOut('${res.id}')">🚪 Check-Out</button>`
      : "";

    return `
      <div class="m-card">
        <div class="m-card-top">
          <div>
            <div class="m-card-title">${guestName(res.guestId)}</div>
            <div class="m-card-subtitle">${roomLabel(res.roomId)} · ${res.code}</div>
          </div>
          <span class="badge ${statusClass}">${capitalize(res.status)}</span>
        </div>
        <div class="m-card-meta">
          <span class="m-card-meta-item">📅 ${formatDate(res.checkIn)} → ${formatDate(res.checkOut)}</span>
          <span class="m-card-meta-item">🌙 ${res.nights} noche${res.nights === 1 ? "" : "s"}</span>
        </div>
        <div class="m-card-financials">
          <div class="m-fin-item">
            <span>Total</span>
            <strong>${formatMoney(summary.totalReservation)}</strong>
          </div>
          <div class="m-fin-item">
            <span>Pagado</span>
            <strong>${formatMoney(summary.totalPaid)}</strong>
          </div>
          <div class="m-fin-item">
            <span>Saldo</span>
            <strong>${formatMoney(summary.balanceDue)}</strong>
          </div>
        </div>
        <div class="m-card-row">
          Estado pago: ${paymentStatusBadge(summary.paymentStatus)}
        </div>
        <div class="m-card-actions">
          <button class="ghost-button" type="button" onclick="showReservationDetail('${res.id}')">🔍 Detalle</button>
          <button class="secondary-button" type="button" onclick="openReservationModal('${res.id}')">✏️ Editar</button>
          <button class="ghost-button" type="button" onclick="openReservationReceipt('${res.id}')">🧾 Comprobante</button>
          <button class="whatsapp-button" type="button" onclick="openReservationWhatsApp('${res.id}')">📲 WhatsApp</button>
          ${checkinBtn}${checkoutBtn}
        </div>
      </div>
    `;
  }).join("");
}

// ── PAYMENTS MOBILE CARDS ────────────────────
function renderPaymentsMobileCards() {
  const container = document.getElementById("payments-cards");
  if (!container) return;

  if (isSectionLoading("payments")) {
    container.innerHTML = mobileEmpty("Cargando pagos...");
    return;
  }

  const visiblePayments = filteredPayments();

  if (!visiblePayments || visiblePayments.length === 0) {
    container.innerHTML = mobileEmpty("Sin pagos para los filtros seleccionados");
    return;
  }

  container.innerHTML = visiblePayments.map((payment) => {
    const reservation = findById(state.reservations, payment.reservationId);
    const payClass = payment.status ? payment.status.toLowerCase() : "pendiente";
    return `
      <div class="m-card">
        <div class="m-card-top">
          <div>
            <div class="m-card-title">${formatMoney(payment.amount)}</div>
            <div class="m-card-subtitle">${reservation ? guestName(reservation.guestId) : "Sin huesped"}</div>
          </div>
          <span class="badge ${payClass}">${capitalize(payment.status)}</span>
        </div>
        <div class="m-card-meta">
          ${reservation ? `<span class="m-card-meta-item">🔖 ${reservation.code}</span>` : ""}
          <span class="m-card-meta-item">💳 ${capitalize(payment.method)}</span>
          <span class="m-card-meta-item">📅 ${formatDate(payment.paidAt)}</span>
        </div>
        <div class="m-card-actions">
          <button class="secondary-button" type="button" onclick="openPaymentModal('${payment.id}')">✏️ Editar</button>
        </div>
      </div>
    `;
  }).join("");
}

// ── REPORTS MOBILE CARDS ─────────────────────
function renderReportsMobileCards(close) {
  // Payments of day cards
  const paymentsCardsEl = document.getElementById("reports-payments-cards");
  if (paymentsCardsEl) {
    if (!close.paymentsOfDay || close.paymentsOfDay.length === 0) {
      paymentsCardsEl.innerHTML = mobileEmpty("Sin pagos para esta fecha");
    } else {
      paymentsCardsEl.innerHTML = close.paymentsOfDay.map((payment) => {
        const reservation = findById(state.reservations, payment.reservationId);
        const payClass = payment.status ? payment.status.toLowerCase() : "pendiente";
        return `
          <div class="m-card">
            <div class="m-card-top">
              <div>
                <div class="m-card-title">${formatMoney(payment.amount)}</div>
                <div class="m-card-subtitle">${reservation ? guestName(reservation.guestId) : "Sin huesped"} · ${reservation ? roomLabel(reservation.roomId) : "-"}</div>
              </div>
              <span class="badge ${payClass}">${capitalize(payment.status)}</span>
            </div>
            <div class="m-card-meta">
              ${reservation ? `<span class="m-card-meta-item">🔖 ${reservation.code}</span>` : ""}
              <span class="m-card-meta-item">💳 ${capitalize(payment.method)}</span>
              <span class="m-card-meta-item">🕐 ${formatDateTime(payment.paidAt)}</span>
            </div>
          </div>
        `;
      }).join("");
    }
  }

  // Pending balances cards
  const pendingCardsEl = document.getElementById("reports-pending-cards");
  if (pendingCardsEl) {
    if (!close.pendingBalances || close.pendingBalances.length === 0) {
      pendingCardsEl.innerHTML = mobileEmpty("Sin saldos pendientes");
    } else {
      pendingCardsEl.innerHTML = close.pendingBalances.map((reservation) => {
        const summary = calculatePaymentSummary(reservation.id);
        return `
          <div class="m-card">
            <div class="m-card-top">
              <div>
                <div class="m-card-title">${guestName(reservation.guestId)}</div>
                <div class="m-card-subtitle">${roomLabel(reservation.roomId)}</div>
              </div>
              <span class="badge pendiente">Pendiente</span>
            </div>
            <div class="m-card-meta">
              <span class="m-card-meta-item">📅 ${formatDate(reservation.checkIn)} → ${formatDate(reservation.checkOut)}</span>
            </div>
            <div class="m-card-financials">
              <div class="m-fin-item">
                <span>Total</span>
                <strong>${formatMoney(summary.totalReservation)}</strong>
              </div>
              <div class="m-fin-item">
                <span>Pagado</span>
                <strong>${formatMoney(summary.totalPaid)}</strong>
              </div>
              <div class="m-fin-item">
                <span>Saldo</span>
                <strong style="color:var(--danger)">${formatMoney(summary.balanceDue)}</strong>
              </div>
            </div>
          </div>
        `;
      }).join("");
    }
  }
}

// ── PATCH: WRAP EXISTING RENDER FUNCTIONS ────
// Intercept the original render functions to also render mobile cards

const _origRenderRooms        = renderRooms;
const _origRenderGuests       = renderGuests;
const _origRenderReservations = renderReservations;
const _origRenderPayments     = renderPayments;
const _origRenderReports      = renderReports;

renderRooms = function() {
  _origRenderRooms();
  renderRoomsMobileCards();
};

renderGuests = function() {
  _origRenderGuests();
  renderGuestsMobileCards();
};

renderReservations = function() {
  _origRenderReservations();
  renderReservationsMobileCards();
};

renderPayments = function() {
  _origRenderPayments();
  renderPaymentsMobileCards();
};

renderReports = function() {
  _origRenderReports();
  // Also render mobile cards for reports
  if (typeof calculateDailyCashClose === "function") {
    const close = calculateDailyCashClose(reportsSelectedDate);
    renderReportsMobileCards(close);
  }
};

// ── WINDOW RESIZE: RE-RENDER IF BREAKPOINT CHANGES ──
let _lastMobile = isMobile();
window.addEventListener("resize", () => {
  const nowMobile = isMobile();
  if (nowMobile !== _lastMobile) {
    _lastMobile = nowMobile;
    if (typeof renderAll === "function") renderAll();
  }
}, { passive: true });

