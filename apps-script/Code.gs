const SPREADSHEET_ID = '1vaYtEN1voxtk11Ep30NvxecsxnjILGSvqPYRMacARy4';

const RESOURCES = {
  rooms: {
    sheetName: 'Habitaciones',
    headers: ['id', 'number', 'type', 'capacity', 'rate', 'status', 'createdAt', 'updatedAt']
  },
  reservations: {
    sheetName: 'Reservaciones',
    headers: ['id', 'code', 'guestId', 'roomId', 'checkIn', 'checkOut', 'nights', 'total', 'status', 'actual_check_in_at', 'actual_check_out_at', 'createdAt', 'updatedAt']
  },
  guests: {
    sheetName: 'Huespedes',
    headers: ['id', 'name', 'document', 'email', 'phone', 'createdAt', 'updatedAt']
  },
  payments: {
    sheetName: 'Pagos',
    headers: ['id', 'reservationId', 'amount', 'method', 'status', 'paidAt', 'createdAt', 'updatedAt']
  },
  users: {
    sheetName: 'Usuarios',
    headers: ['id', 'name', 'email', 'role', 'status', 'createdAt', 'updatedAt']
  },
  config: {
    sheetName: 'Configuracion',
    headers: ['key', 'value', 'description', 'updatedAt']
  }
};

// Estados de reservacion que bloquean la habitacion (ocupan fechas).
// "cancelada" y "check-out" NO bloquean: liberan la habitacion.
const BLOCKING_RESERVATION_STATUSES = ['pendiente', 'confirmada', 'check-in'];

const TEXT_HEADERS = [
  'id',
  'number',
  'name',
  'type',
  'code',
  'guestId',
  'roomId',
  'reservationId',
  'document',
  'email',
  'phone',
  'method',
  'role',
  'status',
  'checkIn',
  'checkOut',
  'actual_check_in_at',
  'actual_check_out_at',
  'paidAt',
  'createdAt',
  'updatedAt',
  'key',
  'value',
  'description'
];

const SEED_DATA = {
  rooms: [
    { id: 'room-101', number: '101', type: 'Doble', capacity: 2, rate: 160000, status: 'disponible' },
    { id: 'room-102', number: '102', type: 'Familiar', capacity: 4, rate: 260000, status: 'reservada' },
    { id: 'room-201', number: '201', type: 'Suite vista mar', capacity: 2, rate: 320000, status: 'ocupada' },
    { id: 'room-202', number: '202', type: 'Twin', capacity: 2, rate: 180000, status: 'mantenimiento' },
    { id: 'room-301', number: '301', type: 'Multiple', capacity: 6, rate: 360000, status: 'disponible' }
  ],
  guests: [
    { id: 'guest-1', name: 'Laura Martinez', document: 'CC 1020304050', email: 'laura@example.com', phone: '+57 300 111 2233' },
    { id: 'guest-2', name: 'Carlos Perez', document: 'CE 445566', email: 'carlos@example.com', phone: '+57 301 555 7788' }
  ],
  reservations: [
    {
      id: 'res-1001',
      code: 'CB-1001',
      guestId: 'guest-1',
      roomId: 'room-102',
      checkIn: '2026-06-22',
      checkOut: '2026-06-25',
      nights: 3,
      total: 780000,
      status: 'confirmada'
    },
    {
      id: 'res-1002',
      code: 'CB-1002',
      guestId: 'guest-2',
      roomId: 'room-201',
      checkIn: '2026-06-18',
      checkOut: '2026-06-20',
      nights: 2,
      total: 640000,
      status: 'check-in'
    }
  ],
  users: [
    { id: 'user-admin', name: 'Administrador', email: 'admin@centralbeach.local', role: 'admin', status: 'activo' }
  ]
};

function setupSheets() {
  const spreadsheet = getSpreadsheet_();
  const createdSheets = [];
  const seededRows = {};

  Object.keys(RESOURCES).forEach(function(resourceName) {
    const config = RESOURCES[resourceName];
    const sheetInfo = getOrCreateSheet_(spreadsheet, config.sheetName);

    if (sheetInfo.created) {
      createdSheets.push(config.sheetName);
    }

    ensureHeaders_(sheetInfo.sheet, config.headers);
  });

  Object.keys(SEED_DATA).forEach(function(resourceName) {
    seededRows[resourceName] = seedRows_(resourceName, SEED_DATA[resourceName], 'id');
  });

  return {
    ok: true,
    spreadsheetId: SPREADSHEET_ID,
    createdSheets: createdSheets,
    seededRows: seededRows
  };
}

function doGet(e) {
  try {
    const resourceName = getResourceName_(e);
    const rows = list_(resourceName);
    const id = e.parameter.id;

    if (id) {
      const record = rows.find(function(row) {
        return String(row.id) === String(id);
      });
      return json_({ ok: true, data: record || null });
    }

    return json_({ ok: true, data: rows });
  } catch (error) {
    return error_(error);
  }
}

function doPost(e) {
  try {
    const resourceName = getResourceName_(e);
    const body = parseBody_(e);
    const method = String(body._method || e.parameter._method || 'POST').toUpperCase();

    if (method === 'PUT') {
      return json_({ ok: true, data: update_(resourceName, e.parameter.id || body.id, body) });
    }

    if (method === 'DELETE') {
      remove_(resourceName, e.parameter.id || body.id);
      return json_({ ok: true });
    }

    return json_({ ok: true, data: create_(resourceName, body) });
  } catch (error) {
    return error_(error);
  }
}

function doPut(e) {
  try {
    const resourceName = getResourceName_(e);
    const body = parseBody_(e);
    return json_({ ok: true, data: update_(resourceName, e.parameter.id || body.id, body) });
  } catch (error) {
    return error_(error);
  }
}

function doDelete(e) {
  try {
    const resourceName = getResourceName_(e);
    remove_(resourceName, e.parameter.id);
    return json_({ ok: true });
  } catch (error) {
    return error_(error);
  }
}

function list_(resourceName) {
  const config = getResourceConfig_(resourceName);
  const sheet = getSheet_(config);
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) return [];

  return sheet.getRange(2, 1, lastRow - 1, config.headers.length)
    .getValues()
    .filter(function(row) {
      return row.some(function(cell) {
        return cell !== '';
      });
    })
    .map(function(row) {
      return rowToObject_(config.headers, row);
    });
}

// Convierte una fecha 'YYYY-MM-DD' en un entero comparable (AAAAMMDD).
// Evita ambiguedades de zona horaria al comparar fechas.
function dateToComparableNumber_(value) {
  const parts = String(value).slice(0, 10).split('-');
  return (Number(parts[0]) * 10000) + (Number(parts[1]) * 100) + Number(parts[2]);
}

// Determina si dos rangos de fechas [checkInA, checkOutA) y [checkInB, checkOutB) se solapan.
// El dia de checkout NO bloquea: una reserva 20->25 y otra 25->28 son validas (no se solapan).
function dateRangesOverlap(checkInA, checkOutA, checkInB, checkOutB) {
  const startA = dateToComparableNumber_(checkInA);
  const endA = dateToComparableNumber_(checkOutA);
  const startB = dateToComparableNumber_(checkInB);
  const endB = dateToComparableNumber_(checkOutB);

  return startA < endB && startB < endA;
}

// Revisa si una habitacion esta disponible para un rango de fechas dado.
// Solo las reservas en estado bloqueante (BLOCKING_RESERVATION_STATUSES) cuentan como conflicto.
// excludeReservationId permite ignorar la propia reserva al editar.
function checkRoomAvailability(roomId, checkIn, checkOut, excludeReservationId) {
  if (!roomId || !checkIn || !checkOut) {
    return { available: true, conflict: null };
  }

  const reservations = list_('reservations');
  const conflict = reservations.find(function(reservation) {
    if (String(reservation.roomId) !== String(roomId)) return false;
    if (excludeReservationId && String(reservation.id) === String(excludeReservationId)) return false;
    if (BLOCKING_RESERVATION_STATUSES.indexOf(reservation.status) === -1) return false;
    return dateRangesOverlap(checkIn, checkOut, reservation.checkIn, reservation.checkOut);
  });

  return {
    available: !conflict,
    conflict: conflict || null
  };
}

// Valida que una transicion de estado de reservacion sea valida.
// Impide transiciones ilegales aunque la API sea llamada manualmente.
function validateStatusTransition_(currentStatus, newStatus) {
  if (!currentStatus || currentStatus === newStatus) return; // nueva reservacion o sin cambio

  var validTransitions = {
    'pendiente':   ['confirmada', 'check-in', 'cancelada'],
    'confirmada':  ['check-in', 'cancelada', 'pendiente'],
    'check-in':    ['check-out'],
    'check-out':   [],
    'cancelada':   []
  };

  var allowed = validTransitions[currentStatus];
  if (!allowed) return; // estado desconocido, dejar que otras validaciones fallen

  if (allowed.indexOf(newStatus) === -1) {
    throw new Error(
      'Transicion de estado invalida: de "' + currentStatus + '" a "' + newStatus + '". ' +
      'Transiciones permitidas: ' + (allowed.length ? allowed.join(', ') : 'ninguna') + '.'
    );
  }
}

// Validacion obligatoria de reservaciones: fechas coherentes y sin solapamiento con otra
// reserva activa en la misma habitacion. Lanza un Error que doPost/doPut devuelven como { ok: false }.
// excludeReservationId permite ignorar la propia reserva al editar.
function validateReservationRecord_(record, excludeReservationId) {
  if (!record.roomId) {
    throw new Error('La reservacion requiere una habitacion.');
  }

  if (!record.checkIn || !record.checkOut) {
    throw new Error('La reservacion requiere fecha de entrada y de salida.');
  }

  if (dateToComparableNumber_(record.checkOut) <= dateToComparableNumber_(record.checkIn)) {
    throw new Error('La fecha de salida debe ser posterior a la fecha de entrada.');
  }

  if (BLOCKING_RESERVATION_STATUSES.indexOf(record.status) === -1) return;

  const availability = checkRoomAvailability(record.roomId, record.checkIn, record.checkOut, excludeReservationId);

  if (!availability.available) {
    const conflict = availability.conflict;
    throw new Error(
      'La habitacion ya esta reservada del ' + conflict.checkIn + ' al ' + conflict.checkOut +
      ' (reservacion ' + conflict.code + '). Elige otras fechas u otra habitacion.'
    );
  }
}

function create_(resourceName, payload) {
  const config = getResourceConfig_(resourceName);
  const sheet = getSheet_(config);
  const now = new Date().toISOString();
  const record = Object.assign({}, payload, {
    id: payload.id || Utilities.getUuid(),
    createdAt: payload.createdAt || now,
    updatedAt: now
  });

  if (resourceName === 'reservations') {
    validateReservationRecord_(record, null);
  }

  appendRecord_(sheet, config.headers, normalizeRecord_(config.headers, record));
  return record;
}

function update_(resourceName, id, payload) {
  if (!id) throw new Error('El parametro id es requerido para actualizar.');

  const config = getResourceConfig_(resourceName);
  const sheet = getSheet_(config);
  const values = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), config.headers.length).getValues();
  const idIndex = config.headers.indexOf('id');

  if (idIndex === -1) throw new Error('La hoja no tiene columna id.');

  for (var rowIndex = 1; rowIndex < values.length; rowIndex++) {
    if (String(values[rowIndex][idIndex]) === String(id)) {
      const current = rowToObject_(config.headers, values[rowIndex]);
      const updated = Object.assign({}, current, payload, {
        id: id,
        createdAt: current.createdAt || payload.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      if (resourceName === 'reservations') {
        if (payload.status && current.status && payload.status !== current.status) {
          validateStatusTransition_(current.status, payload.status);
        }
        validateReservationRecord_(updated, id);
      }

      const newRow = recordToRow_(config.headers, normalizeRecord_(config.headers, updated));
      const writeRange = sheet.getRange(rowIndex + 1, 1, 1, config.headers.length);

      applyTextFormatsToRange_(sheet, config.headers, rowIndex + 1, 1);
      writeRange.setValues([newRow]);
      return updated;
    }
  }

  throw new Error('Registro no encontrado: ' + id);
}

function remove_(resourceName, id) {
  if (!id) throw new Error('El parametro id es requerido para eliminar.');

  const config = getResourceConfig_(resourceName);
  const sheet = getSheet_(config);
  const values = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), config.headers.length).getValues();
  const idIndex = config.headers.indexOf('id');

  if (idIndex === -1) throw new Error('La hoja no tiene columna id.');

  for (var rowIndex = 1; rowIndex < values.length; rowIndex++) {
    if (String(values[rowIndex][idIndex]) === String(id)) {
      sheet.deleteRow(rowIndex + 1);
      return true;
    }
  }

  throw new Error('Registro no encontrado: ' + id);
}

function seedRows_(resourceName, records, uniqueKey) {
  const config = getResourceConfig_(resourceName);
  const sheet = getSheet_(config);
  const existingRows = getExistingRowsByKey_(sheet, config.headers, uniqueKey);
  const now = new Date().toISOString();
  let createdCount = 0;
  let repairedCount = 0;

  records.forEach(function(record) {
    const key = record[uniqueKey];
    const existingRowNumber = existingRows[String(key)];

    if (existingRowNumber) {
      if (repairSeedRow_(sheet, config.headers, existingRowNumber, record)) {
        repairedCount++;
      }
      return;
    }

    const seededRecord = normalizeRecord_(config.headers, Object.assign({}, record, {
      createdAt: record.createdAt || now,
      updatedAt: record.updatedAt || now
    }));

    appendRecord_(sheet, config.headers, seededRecord);
    existingRows[String(key)] = sheet.getLastRow();
    createdCount++;
  });

  return {
    created: createdCount,
    repaired: repairedCount
  };
}

function repairSeedRow_(sheet, headers, rowNumber, seedRecord) {
  const valueRange = sheet.getRange(rowNumber, 1, 1, headers.length);
  const values = valueRange.getValues()[0];
  const displayValues = valueRange.getDisplayValues()[0];
  const currentRecord = rowToObject_(headers, values);
  let changed = false;

  Object.keys(seedRecord).forEach(function(fieldName) {
    const index = headers.indexOf(fieldName);
    const displayValue = index === -1 ? '' : String(displayValues[index] || '');

    if (index === -1) return;

    if (currentRecord[fieldName] === '' || displayValue.indexOf('#ERROR!') === 0) {
      currentRecord[fieldName] = seedRecord[fieldName];
      changed = true;
    }
  });

  if (!changed) return false;

  currentRecord.updatedAt = new Date().toISOString();
  applyTextFormatsToRange_(sheet, headers, rowNumber, 1);
  valueRange.setValues([recordToRow_(headers, normalizeRecord_(headers, currentRecord))]);
  return true;
}

function getExistingRowsByKey_(sheet, headers, uniqueKey) {
  const uniqueKeyIndex = headers.indexOf(uniqueKey);
  const existingRows = {};
  const lastRow = sheet.getLastRow();

  if (uniqueKeyIndex === -1 || lastRow <= 1) return existingRows;

  sheet.getRange(2, uniqueKeyIndex + 1, lastRow - 1, 1).getValues().forEach(function(row, index) {
    if (row[0] !== '') {
      existingRows[String(row[0])] = index + 2;
    }
  });

  return existingRows;
}

function appendRecord_(sheet, headers, record) {
  const nextRow = sheet.getLastRow() + 1;
  const row = recordToRow_(headers, record);

  applyTextFormatsToRange_(sheet, headers, nextRow, 1);
  sheet.getRange(nextRow, 1, 1, headers.length).setValues([row]);
}

function recordToRow_(headers, record) {
  return headers.map(function(header) {
    return record[header] !== undefined ? record[header] : '';
  });
}

function normalizeRecord_(headers, record) {
  return headers.reduce(function(normalized, header) {
    if (record[header] === undefined || record[header] === null) {
      normalized[header] = '';
      return normalized;
    }

    normalized[header] = isTextHeader_(header) ? String(record[header]) : record[header];
    return normalized;
  }, {});
}

function applyTextFormatsToRange_(sheet, headers, startRow, rowCount) {
  headers.forEach(function(header, index) {
    if (isTextHeader_(header)) {
      sheet.getRange(startRow, index + 1, rowCount, 1).setNumberFormat('@');
    }
  });
}

function applyTextFormatsToSheet_(sheet, headers) {
  const rowCount = Math.max(sheet.getMaxRows(), 1);
  applyTextFormatsToRange_(sheet, headers, 1, rowCount);
}

function isTextHeader_(header) {
  return TEXT_HEADERS.indexOf(header) !== -1;
}

function getSheet_(config) {
  const spreadsheet = getSpreadsheet_();
  const sheetInfo = getOrCreateSheet_(spreadsheet, config.sheetName);

  ensureHeaders_(sheetInfo.sheet, config.headers);
  return sheetInfo.sheet;
}

function getOrCreateSheet_(spreadsheet, sheetName) {
  let sheet = spreadsheet.getSheetByName(sheetName);

  if (sheet) {
    return { sheet: sheet, created: false };
  }

  sheet = spreadsheet.insertSheet(sheetName);
  return { sheet: sheet, created: true };
}

function ensureHeaders_(sheet, expectedHeaders) {
  const range = sheet.getRange(1, 1, 1, expectedHeaders.length);
  const currentHeaders = range.getValues()[0];
  const headersMatch = expectedHeaders.every(function(header, index) {
    return currentHeaders[index] === header;
  });

  if (!headersMatch) {
    range.setValues([expectedHeaders]);
  }

  applyTextFormatsToSheet_(sheet, expectedHeaders);
  sheet.setFrozenRows(1);
}

function rowToObject_(headers, row) {
  return headers.reduce(function(record, header, index) {
    record[header] = row[index];
    return record;
  }, {});
}

function getSpreadsheet_() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID === 'REEMPLAZA_CON_EL_ID_DE_TU_GOOGLE_SHEET') {
    throw new Error('Configura SPREADSHEET_ID con el ID real de Google Sheets.');
  }

  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getResourceName_(e) {
  const resourceName = e.parameter.resource;
  if (!resourceName || !RESOURCES[resourceName]) {
    throw new Error('Recurso invalido. Usa rooms, guests, reservations, payments, users o config.');
  }
  return resourceName;
}

function getResourceConfig_(resourceName) {
  const config = RESOURCES[resourceName];
  if (!config) throw new Error('Recurso no soportado: ' + resourceName);
  return config;
}

function parseBody_(e) {
  if (!e.postData || !e.postData.contents) return {};

  const contentType = e.postData.type || '';
  const contents = e.postData.contents;
  const trimmed = contents.trim();

  if (contentType.indexOf('application/json') !== -1 || trimmed.charAt(0) === '{') {
    return JSON.parse(contents);
  }

  return Object.assign({}, e.parameter);
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function error_(error) {
  return json_({
    ok: false,
    error: error.message || String(error)
  });
}
