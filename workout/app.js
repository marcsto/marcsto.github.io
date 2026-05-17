const DEFAULT_REPS = 8;
const MIN_REPS = 1;
const MAX_REPS = 30;
const DEFAULT_WEIGHT = 0;
const MIN_WEIGHT = 0;
const DEFAULT_MAX_WEIGHT = 500;
const WEIGHT_STEP = 2.5;

const state = {
  tokenClient: null,
  accessToken: sessionStorage.getItem(STORAGE_KEYS.accessToken) || "",
  tokenExpiresAt: toNumber(sessionStorage.getItem(STORAGE_KEYS.tokenExpiresAt), 0),
  tokenPromise: null,
  tokenPromiseSilentOnly: false,
  tokenReject: null,
  spreadsheetId: localStorage.getItem(STORAGE_KEYS.spreadsheetId) || "",
  databaseReady: false,
  databasePromise: null,
  flushPromise: null,
  hasGoogleGrant: localStorage.getItem(STORAGE_KEYS.hasGoogleGrant) === "1"
    || Boolean(localStorage.getItem(STORAGE_KEYS.spreadsheetId))
    || Boolean(sessionStorage.getItem(STORAGE_KEYS.accessToken)),
  exerciseCache: readJson(STORAGE_KEYS.exerciseCache, {}),
  pendingRows: readJson(STORAGE_KEYS.pendingRows, []),
  activeExercise: null
};

const els = {};

document.addEventListener("DOMContentLoaded", initApp);

function initApp() {
  cacheElements();
  bindEvents();
  if (state.accessToken && !isTokenFresh()) {
    clearAccessToken();
  }
  renderHome();
  updateAuthUi();
  setSyncStatus(initialSyncText(), state.pendingRows.length ? "error" : "");
  restoreAuthenticatedSession();
}

function cacheElements() {
  els.signInButton = document.getElementById("signInButton");
  els.syncStatus = document.getElementById("syncStatus");
  els.homeView = document.getElementById("homeView");
  els.entryView = document.getElementById("entryView");
  els.exerciseGrid = document.getElementById("exerciseGrid");
  els.backButton = document.getElementById("backButton");
  els.exerciseTitle = document.getElementById("exerciseTitle");
  els.lastLogged = document.getElementById("lastLogged");
  els.repsSlider = document.getElementById("repsSlider");
  els.repsValue = document.getElementById("repsValue");
  els.repsDown = document.getElementById("repsDown");
  els.repsUp = document.getElementById("repsUp");
  els.weightSlider = document.getElementById("weightSlider");
  els.weightValue = document.getElementById("weightValue");
  els.weightDown = document.getElementById("weightDown");
  els.weightUp = document.getElementById("weightUp");
  els.saveButton = document.getElementById("saveButton");
  els.entryStatus = document.getElementById("entryStatus");
}

function bindEvents() {
  els.signInButton.addEventListener("click", handleSignIn);
  els.backButton.addEventListener("click", showHome);
  els.repsSlider.addEventListener("input", () => setReps(els.repsSlider.value));
  els.weightSlider.addEventListener("input", () => setWeight(els.weightSlider.value));
  els.repsDown.addEventListener("click", () => setReps(getReps() - 1));
  els.repsUp.addEventListener("click", () => setReps(getReps() + 1));
  els.weightDown.addEventListener("click", () => setWeight(getWeight() - WEIGHT_STEP));
  els.weightUp.addEventListener("click", () => setWeight(getWeight() + WEIGHT_STEP));
  els.saveButton.addEventListener("click", handleSave);

  window.addEventListener("online", () => {
    if (state.accessToken && state.spreadsheetId) {
      flushPendingRows();
    }
  });

  window.addEventListener("pageshow", (event) => {
    if (event.persisted && state.hasGoogleGrant && !isTokenFresh()) {
      restoreAuthenticatedSession();
    }
  });
}

function initialSyncText() {
  if (!hasClientId()) {
    return "Set CLIENT_ID";
  }

  if (state.pendingRows.length) {
    return `Queued ${state.pendingRows.length}`;
  }

  if (isTokenFresh()) {
    return "Synced";
  }

  if (state.hasGoogleGrant) {
    return "Restoring";
  }

  return state.spreadsheetId ? "Local + sheet" : "Local";
}

function hasClientId() {
  return Boolean(CLIENT_ID.trim());
}

function updateAuthUi() {
  els.signInButton.disabled = !hasClientId();
  els.signInButton.title = hasClientId() ? "Sync with Google" : "Add CLIENT_ID in config.js";

  const label = els.signInButton.querySelector("span:last-child");
  if (label) {
    label.textContent = isTokenFresh() ? "Synced" : state.hasGoogleGrant ? "Sync" : "Sign in";
  }
}

function renderHome() {
  const sortedExercises = getSortedExercises();
  els.exerciseGrid.replaceChildren();

  sortedExercises.forEach((exercise) => {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "exercise-tile";
    tile.setAttribute("aria-label", `Open ${exercise.name}`);
    tile.addEventListener("click", () => openExercise(exercise));

    const iconWrap = document.createElement("span");
    iconWrap.className = "tile-icon";
    iconWrap.setAttribute("aria-hidden", "true");

    const icon = document.createElement("span");
    icon.className = "material-symbols-rounded";
    icon.textContent = exercise.icon;
    iconWrap.append(icon);

    const name = document.createElement("span");
    name.className = "exercise-name";
    name.textContent = exercise.name;

    const meta = document.createElement("span");
    meta.className = "exercise-meta";
    meta.textContent = getTileMeta(exercise.name);

    tile.append(iconWrap, name, meta);
    els.exerciseGrid.append(tile);
  });
}

function getSortedExercises() {
  return DEFAULT_EXERCISES
    .map((exercise, index) => ({ ...exercise, index }))
    .sort((a, b) => {
      const aTime = getExerciseTime(a.name);
      const bTime = getExerciseTime(b.name);
      return bTime - aTime || a.index - b.index;
    });
}

function getExerciseTime(exerciseName) {
  const timestamp = state.exerciseCache[exerciseName]?.timestamp;
  return timestamp ? Date.parse(timestamp) || 0 : 0;
}

function getTileMeta(exerciseName) {
  const cached = state.exerciseCache[exerciseName];
  if (!cached) {
    return "";
  }

  return `${formatWeight(cached.weight)} lb x ${cached.reps}`;
}

function openExercise(exercise) {
  state.activeExercise = exercise;
  const cached = state.exerciseCache[exercise.name] || {};
  const reps = toNumber(cached.reps, DEFAULT_REPS);
  const weight = toNumber(cached.weight, DEFAULT_WEIGHT);

  els.exerciseTitle.textContent = exercise.name;
  ensureWeightRange(weight);
  setReps(reps);
  setWeight(weight);
  updateLastLogged();
  setEntryStatus("", "");

  els.homeView.hidden = true;
  els.entryView.hidden = false;
}

function showHome() {
  els.entryView.hidden = true;
  els.homeView.hidden = false;
  state.activeExercise = null;
  renderHome();
}

function setReps(value) {
  const reps = clamp(Math.round(toNumber(value, DEFAULT_REPS)), MIN_REPS, MAX_REPS);
  els.repsSlider.value = String(reps);
  els.repsValue.textContent = String(reps);
}

function getReps() {
  return toNumber(els.repsSlider.value, DEFAULT_REPS);
}

function setWeight(value) {
  const weight = snapWeight(toNumber(value, DEFAULT_WEIGHT));
  ensureWeightRange(weight);
  els.weightSlider.value = String(weight);
  els.weightValue.textContent = `${formatWeight(weight)} lb`;
}

function getWeight() {
  return snapWeight(toNumber(els.weightSlider.value, DEFAULT_WEIGHT));
}

function snapWeight(value) {
  const snapped = Math.round(value / WEIGHT_STEP) * WEIGHT_STEP;
  return clamp(Number(snapped.toFixed(1)), MIN_WEIGHT, getWeightMax());
}

function ensureWeightRange(weight) {
  if (weight <= getWeightMax()) {
    return;
  }

  const nextMax = Math.ceil(weight / 50) * 50;
  els.weightSlider.max = String(nextMax);
}

function getWeightMax() {
  return toNumber(els.weightSlider.max, DEFAULT_MAX_WEIGHT);
}

function handleSave() {
  if (!state.activeExercise) {
    return;
  }

  const row = {
    timestamp: new Date().toISOString(),
    exerciseName: state.activeExercise.name,
    reps: getReps(),
    weight: getWeight()
  };

  updateExerciseCache(row);
  renderHome();
  updateLastLogged();
  setEntryStatus(`Saved ${formatTime(row.timestamp)}`, "ok");
  persistWorkoutRow(row, { interactive: true });
}

function updateExerciseCache(row) {
  state.exerciseCache[row.exerciseName] = {
    reps: row.reps,
    weight: row.weight,
    timestamp: row.timestamp
  };
  writeJson(STORAGE_KEYS.exerciseCache, state.exerciseCache);
}

function updateLastLogged() {
  const exerciseName = state.activeExercise?.name;
  const cached = exerciseName ? state.exerciseCache[exerciseName] : null;
  els.lastLogged.textContent = cached
    ? `Last ${formatWeight(cached.weight)} lb x ${cached.reps}, ${formatDateTime(cached.timestamp)}`
    : "";
}

async function handleSignIn() {
  if (!hasClientId()) {
    setSyncStatus("Set CLIENT_ID", "error");
    return;
  }

  try {
    setSyncStatus("Signing in", "");
    await ensureAccessToken({ interactive: true, forceConsent: !state.hasGoogleGrant });
    await initializeDatabase();
    await flushPendingRows();
    syncCacheFromSheet();
  } catch (error) {
    reportSyncError(error);
  }
}

async function persistWorkoutRow(row, options = {}) {
  enqueuePendingRow(row);

  if (!hasClientId()) {
    setEntryStatus("Saved locally. Add CLIENT_ID in config.js to sync.", "error");
    setSyncStatus(`Queued ${state.pendingRows.length}`, "error");
    return;
  }

  setSyncStatus("Syncing", "");

  try {
    await ensureAccessToken({ interactive: Boolean(options.interactive), silent: state.hasGoogleGrant });
    await initializeDatabase();
    await flushPendingRows();
    setSyncStatus(state.pendingRows.length ? `Queued ${state.pendingRows.length}` : "Synced", state.pendingRows.length ? "error" : "ok");
    setEntryStatus(`Synced ${formatTime(row.timestamp)}`, "ok");
  } catch (error) {
    reportSyncError(error);
  }
}

async function restoreAuthenticatedSession() {
  if (!hasClientId() || !state.hasGoogleGrant) {
    return;
  }

  try {
    setSyncStatus("Restoring", "");
    if (!isTokenFresh()) {
      await waitForGoogleIdentity();
      await ensureAccessToken({ silent: true });
    }
    await initializeDatabase();
    await flushPendingRows();
    syncCacheFromSheet();
  } catch {
    setSyncStatus(state.pendingRows.length ? `Queued ${state.pendingRows.length}` : "Tap sign in", state.pendingRows.length ? "error" : "");
  }
}

async function flushPendingRows() {
  if (state.flushPromise) {
    return state.flushPromise;
  }

  if (!state.pendingRows.length) {
    setSyncStatus("Synced", "ok");
    return;
  }

  state.flushPromise = (async () => {
    while (state.pendingRows.length) {
      setSyncStatus(`Syncing ${state.pendingRows.length}`, "");
      await appendWorkoutRow(state.pendingRows[0]);
      state.pendingRows.shift();
      writeJson(STORAGE_KEYS.pendingRows, state.pendingRows);
    }

    setSyncStatus("Synced", "ok");
  })();

  try {
    return await state.flushPromise;
  } finally {
    state.flushPromise = null;
  }
}

function enqueuePendingRow(row) {
  const exists = state.pendingRows.some((pending) => (
    pending.timestamp === row.timestamp
    && pending.exerciseName === row.exerciseName
    && pending.reps === row.reps
    && pending.weight === row.weight
  ));

  if (!exists) {
    state.pendingRows.push(row);
    writeJson(STORAGE_KEYS.pendingRows, state.pendingRows);
  }
}

function initTokenClient() {
  if (state.tokenClient) {
    return state.tokenClient;
  }

  if (!window.google?.accounts?.oauth2) {
    throw new Error("Google Identity Services did not load.");
  }

  state.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: DRIVE_SCOPE,
    callback: () => {},
    error_callback: (error) => {
      if (state.tokenReject) {
        state.tokenReject(new Error(error?.type || "Google sign-in failed."));
      }
    }
  });

  return state.tokenClient;
}

function ensureAccessToken(options = {}) {
  if (isTokenFresh()) {
    return Promise.resolve(state.accessToken);
  }

  if (state.tokenPromise) {
    if (options.interactive && state.tokenPromiseSilentOnly) {
      return state.tokenPromise.catch(() => {
        state.tokenPromise = null;
        state.tokenPromiseSilentOnly = false;
        return ensureAccessToken(options);
      });
    }

    return state.tokenPromise;
  }

  if (!options.interactive && !options.silent) {
    return Promise.reject(new Error("Sign in to sync."));
  }

  state.tokenPromise = requestGoogleToken(getTokenPrompt(options))
    .catch((error) => {
      if (options.interactive && options.silent) {
        return requestGoogleToken(getTokenPrompt({ ...options, silent: false }));
      }

      throw error;
    })
    .finally(() => {
      state.tokenPromise = null;
      state.tokenPromiseSilentOnly = false;
    });
  state.tokenPromiseSilentOnly = Boolean(options.silent && !options.interactive);

  return state.tokenPromise;
}

function requestGoogleToken(prompt) {
  const tokenClient = initTokenClient();

  return new Promise((resolve, reject) => {
    state.tokenReject = reject;
    tokenClient.callback = (response) => {
      state.tokenReject = null;

      if (response?.error) {
        reject(new Error(response.error_description || response.error));
        return;
      }

      storeAccessToken(response);
      state.hasGoogleGrant = true;
      localStorage.setItem(STORAGE_KEYS.hasGoogleGrant, "1");
      updateAuthUi();
      resolve(state.accessToken);
    };

    tokenClient.requestAccessToken({ prompt });
  });
}

function getTokenPrompt(options) {
  if (options.silent) {
    return "none";
  }

  if (options.forceConsent) {
    return "consent";
  }

  return state.hasGoogleGrant ? "" : "consent";
}

function isTokenFresh() {
  return Boolean(state.accessToken && Date.now() < state.tokenExpiresAt - 60000);
}

function storeAccessToken(response) {
  state.accessToken = response.access_token;
  state.tokenExpiresAt = Date.now() + (toNumber(response.expires_in, 3600) * 1000);
  sessionStorage.setItem(STORAGE_KEYS.accessToken, state.accessToken);
  sessionStorage.setItem(STORAGE_KEYS.tokenExpiresAt, String(state.tokenExpiresAt));
}

function clearAccessToken() {
  state.accessToken = "";
  state.tokenExpiresAt = 0;
  sessionStorage.removeItem(STORAGE_KEYS.accessToken);
  sessionStorage.removeItem(STORAGE_KEYS.tokenExpiresAt);

  if (els.signInButton) {
    updateAuthUi();
  }
}

function waitForGoogleIdentity(timeoutMs = 5000) {
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timerId = window.setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        window.clearInterval(timerId);
        resolve();
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        window.clearInterval(timerId);
        reject(new Error("Google Identity Services did not load."));
      }
    }, 100);
  });
}

async function initializeDatabase() {
  if (state.databaseReady && state.spreadsheetId) {
    return state.spreadsheetId;
  }

  if (state.databasePromise) {
    return state.databasePromise;
  }

  state.databasePromise = (async () => {
    setSyncStatus("Finding sheet", "");
    const file = await findSpreadsheet();

    if (file?.id) {
      state.spreadsheetId = file.id;
      state.databaseReady = true;
      localStorage.setItem(STORAGE_KEYS.spreadsheetId, file.id);
      setSyncStatus("Sheet ready", "ok");
      return file.id;
    }

    setSyncStatus("Creating sheet", "");
    const spreadsheet = await createSpreadsheet();
    state.spreadsheetId = spreadsheet.spreadsheetId;
    state.databaseReady = true;
    localStorage.setItem(STORAGE_KEYS.spreadsheetId, state.spreadsheetId);
    setSyncStatus("Sheet ready", "ok");
    return state.spreadsheetId;
  })();

  try {
    return await state.databasePromise;
  } finally {
    state.databasePromise = null;
  }
}

async function findSpreadsheet() {
  const query = [
    `name = '${escapeDriveQuery(SPREADSHEET_NAME)}'`,
    "mimeType = 'application/vnd.google-apps.spreadsheet'",
    "trashed = false"
  ].join(" and ");

  const params = new URLSearchParams({
    q: query,
    spaces: "drive",
    pageSize: "10",
    orderBy: "modifiedTime desc",
    fields: "files(id,name,modifiedTime)"
  });

  const response = await googleFetch(`${DRIVE_API}/files?${params}`);
  return response.files?.[0] || null;
}

async function createSpreadsheet() {
  const response = await googleFetch(`${SHEETS_API}/spreadsheets?fields=spreadsheetId,spreadsheetUrl`, {
    method: "POST",
    body: JSON.stringify({
      properties: {
        title: SPREADSHEET_NAME
      },
      sheets: [
        {
          properties: {
            title: SHEET_NAME,
            gridProperties: {
              rowCount: 1000,
              columnCount: SHEET_HEADERS.length
            }
          }
        }
      ]
    })
  });

  await writeHeaderRow(response.spreadsheetId);
  return response;
}

async function writeHeaderRow(spreadsheetId) {
  const range = encodeURIComponent(a1Range("A1:D1"));
  await googleFetch(`${SHEETS_API}/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({
      values: [SHEET_HEADERS]
    })
  });
}

async function appendWorkoutRow(row) {
  const range = encodeURIComponent(a1Range("A:D"));
  await googleFetch(`${SHEETS_API}/spreadsheets/${state.spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({
      values: [[row.timestamp, row.exerciseName, row.reps, row.weight]]
    })
  });
}

async function syncCacheFromSheet() {
  try {
    if (!state.spreadsheetId || !isTokenFresh()) {
      return;
    }

    setSyncStatus("Refreshing", "");
    const range = encodeURIComponent(a1Range("A2:D"));
    const response = await googleFetch(`${SHEETS_API}/spreadsheets/${state.spreadsheetId}/values/${range}?majorDimension=ROWS`);
    const rows = response.values || [];
    let changed = false;

    rows.forEach((values) => {
      const [timestamp, exerciseName, reps, weight] = values;
      if (!timestamp || !exerciseName) {
        return;
      }

      const incomingTime = Date.parse(timestamp) || 0;
      const currentTime = getExerciseTime(exerciseName);

      if (incomingTime > currentTime) {
        state.exerciseCache[exerciseName] = {
          reps: toNumber(reps, DEFAULT_REPS),
          weight: toNumber(weight, DEFAULT_WEIGHT),
          timestamp
        };
        changed = true;
      }
    });

    if (changed) {
      writeJson(STORAGE_KEYS.exerciseCache, state.exerciseCache);
      renderHome();
      if (state.activeExercise) {
        updateLastLogged();
      }
    }

    setSyncStatus(state.pendingRows.length ? `Queued ${state.pendingRows.length}` : "Synced", state.pendingRows.length ? "error" : "ok");
  } catch (error) {
    reportSyncError(error);
  }
}

async function googleFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${state.accessToken}`);

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(addApiKey(url), {
    ...options,
    headers
  });

  if (response.status === 401) {
    clearAccessToken();
  }

  const text = await response.text();
  const data = text ? parseJson(text) : {};

  if (!response.ok) {
    throw new Error(getGoogleErrorMessage(data) || `Google API request failed (${response.status}).`);
  }

  return data;
}

function addApiKey(url) {
  if (!API_KEY.trim()) {
    return url;
  }

  const apiUrl = new URL(url);
  apiUrl.searchParams.set("key", API_KEY.trim());
  return apiUrl.toString();
}

function a1Range(range) {
  const escapedSheetName = SHEET_NAME.replace(/'/g, "''");
  return `'${escapedSheetName}'!${range}`;
}

function escapeDriveQuery(value) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function reportSyncError(error) {
  const message = error?.message || "Sync failed.";
  setSyncStatus(state.pendingRows.length ? `Queued ${state.pendingRows.length}` : "Sync failed", "error");
  setEntryStatus(message, "error");
}

function setSyncStatus(message, tone) {
  els.syncStatus.textContent = message;
  els.syncStatus.classList.toggle("is-ok", tone === "ok");
  els.syncStatus.classList.toggle("is-error", tone === "error");
}

function setEntryStatus(message, tone) {
  els.entryStatus.textContent = message;
  els.entryStatus.classList.toggle("is-ok", tone === "ok");
  els.entryStatus.classList.toggle("is-error", tone === "error");
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function getGoogleErrorMessage(data) {
  return data?.error?.message || data?.error_description || data?.error || "";
}

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatWeight(weight) {
  const number = toNumber(weight, DEFAULT_WEIGHT);
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}
