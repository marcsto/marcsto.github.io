const PROGRESS_LIMIT_DAYS = 30;
const STRENGTH_LINE_COLOR = "#157a55";
const VOLUME_BAR_COLOR = "rgba(36, 90, 141, 0.22)";
const VOLUME_BAR_BORDER = "rgba(36, 90, 141, 0.38)";

const progressState = {
  chart: null,
  tokenClient: null,
  accessToken: sessionStorage.getItem(STORAGE_KEYS.accessToken) || "",
  tokenExpiresAt: toNumber(sessionStorage.getItem(STORAGE_KEYS.tokenExpiresAt), 0),
  tokenPromise: null,
  tokenPromiseSilentOnly: false,
  tokenReject: null,
  spreadsheetId: localStorage.getItem(STORAGE_KEYS.spreadsheetId) || "",
  databaseReady: Boolean(localStorage.getItem(STORAGE_KEYS.spreadsheetId)),
  databasePromise: null,
  flushPromise: null,
  hasGoogleGrant: localStorage.getItem(STORAGE_KEYS.hasGoogleGrant) === "1"
    || Boolean(localStorage.getItem(STORAGE_KEYS.spreadsheetId))
    || Boolean(sessionStorage.getItem(STORAGE_KEYS.accessToken)),
  pendingRows: readJson(STORAGE_KEYS.pendingRows, [])
};

const progressEls = {};

document.addEventListener("DOMContentLoaded", initProgressPage);

function initProgressPage() {
  cacheProgressElements();
  bindProgressEvents();

  if (progressState.accessToken && !isTokenFresh()) {
    clearAccessToken();
  }

  populateExerciseSelect();
  renderSelectedExerciseChart();
  updateAuthUi();
  setStatus(initialStatus(), progressState.pendingRows.length ? "error" : "");
  restoreAndRefreshProgress();
}

function cacheProgressElements() {
  progressEls.status = document.getElementById("progressStatus");
  progressEls.signInButton = document.getElementById("signInButton");
  progressEls.refreshButton = document.getElementById("refreshButton");
  progressEls.exerciseSelect = document.getElementById("exerciseSelect");
  progressEls.chartMessage = document.getElementById("chartMessage");
  progressEls.canvas = document.getElementById("progressChart");
}

function bindProgressEvents() {
  progressEls.signInButton.addEventListener("click", handleSignIn);
  progressEls.refreshButton.addEventListener("click", handleRefresh);
  progressEls.exerciseSelect.addEventListener("change", renderSelectedExerciseChart);

  window.addEventListener("pageshow", (event) => {
    if (event.persisted && progressState.hasGoogleGrant && !isTokenFresh()) {
      restoreAndRefreshProgress();
    }
  });
}

function initialStatus() {
  if (!hasClientId()) {
    return "Set CLIENT_ID";
  }

  if (progressState.pendingRows.length) {
    return `Queued ${progressState.pendingRows.length}`;
  }

  return isTokenFresh() || progressState.hasGoogleGrant ? "Loading" : "Local";
}

function hasClientId() {
  return Boolean(CLIENT_ID.trim());
}

function updateAuthUi() {
  progressEls.signInButton.disabled = !hasClientId();
  progressEls.refreshButton.disabled = !hasClientId();
  progressEls.signInButton.title = hasClientId() ? "Sync with Google" : "Add CLIENT_ID in config.js";

  const label = progressEls.signInButton.querySelector("span:last-child");
  if (label) {
    label.textContent = isTokenFresh() ? "Synced" : progressState.hasGoogleGrant ? "Sync" : "Sign in";
  }
}

function populateExerciseSelect() {
  const selectedValue = progressEls.exerciseSelect.value;
  const localRows = readWorkoutRowsFromLocalStorage();
  const rowExerciseNames = Array.from(new Set(localRows.map((row) => row.exercise))).filter(Boolean);
  const strengthExercises = DEFAULT_EXERCISES
    .filter((exercise) => exercise.type !== "duration")
    .map((exercise) => exercise.name);
  const exerciseNames = Array.from(new Set([...strengthExercises, ...rowExerciseNames]))
    .filter((name) => !isDurationExerciseName(name))
    .sort((a, b) => getExerciseOrder(a) - getExerciseOrder(b) || a.localeCompare(b));

  progressEls.exerciseSelect.replaceChildren();

  exerciseNames.forEach((exerciseName) => {
    const option = document.createElement("option");
    option.value = exerciseName;
    option.textContent = exerciseName;
    progressEls.exerciseSelect.append(option);
  });

  if (exerciseNames.includes(selectedValue)) {
    progressEls.exerciseSelect.value = selectedValue;
  }
}

function getExerciseOrder(exerciseName) {
  const index = DEFAULT_EXERCISES.findIndex((exercise) => exercise.name === exerciseName);
  return index === -1 ? 999 : index;
}

function renderSelectedExerciseChart() {
  if (!window.Chart) {
    progressEls.chartMessage.textContent = "Loading chart library...";
    return;
  }

  const selectedExercise = progressEls.exerciseSelect.value;
  const rawData = localStorage.getItem(STORAGE_KEYS.workoutRows) || "[]";
  progressState.chart = renderWorkoutProgressComboChart(progressEls.canvas, rawData, selectedExercise, progressState.chart);
  const processed = parseWorkoutProgressData(rawData, selectedExercise);
  progressEls.chartMessage.textContent = processed.labels.length
    ? `${selectedExercise}: ${processed.labels.length} workout days`
    : `${selectedExercise}: no weighted sets found`;
}

function parseWorkoutProgressData(rawLocalStorageData, selectedExercise) {
  const rows = normalizeRawWorkoutRows(rawLocalStorageData)
    .filter((row) => row.exercise === selectedExercise)
    .filter((row) => row.weight > 0 && row.reps > 0);
  const byDate = new Map();

  rows.forEach((row) => {
    const workoutDate = new Date(row.date);
    if (Number.isNaN(workoutDate.getTime())) {
      return;
    }

    const key = dateKey(workoutDate);
    const e1rm = row.weight * (1 + (row.reps / 30));
    const volume = row.reps * row.weight;

    if (!byDate.has(key)) {
      byDate.set(key, {
        label: formatChartDate(workoutDate),
        sortDate: startOfDay(workoutDate),
        e1rm,
        volume
      });
      return;
    }

    const day = byDate.get(key);
    day.e1rm = Math.max(day.e1rm, e1rm);
    day.volume += volume;
  });

  const days = Array.from(byDate.values())
    .sort((a, b) => a.sortDate - b.sortDate)
    .slice(-PROGRESS_LIMIT_DAYS);

  return {
    labels: days.map((day) => day.label),
    e1rmData: days.map((day) => roundToOne(day.e1rm)),
    volumeData: days.map((day) => Math.round(day.volume))
  };
}

function renderWorkoutProgressComboChart(canvas, rawLocalStorageData, selectedExercise, existingChart = null) {
  const processed = parseWorkoutProgressData(rawLocalStorageData, selectedExercise);

  if (existingChart) {
    existingChart.destroy();
  }

  return new Chart(canvas, {
    type: "bar",
    data: {
      labels: processed.labels,
      datasets: [
        {
          type: "line",
          label: "E1RM",
          data: processed.e1rmData,
          yAxisID: "y",
          borderColor: STRENGTH_LINE_COLOR,
          backgroundColor: STRENGTH_LINE_COLOR,
          borderWidth: 3,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.3,
          fill: false,
          order: 1
        },
        {
          type: "bar",
          label: "Volume",
          data: processed.volumeData,
          yAxisID: "y1",
          backgroundColor: VOLUME_BAR_COLOR,
          borderColor: VOLUME_BAR_BORDER,
          borderWidth: 1,
          borderRadius: 4,
          order: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          labels: {
            boxWidth: 12,
            font: {
              weight: "bold"
            }
          }
        },
        tooltip: {
          callbacks: {
            title: (items) => items[0]?.label || "",
            label: (context) => (
              context.dataset.yAxisID === "y"
                ? `E1RM: ${formatNumber(context.parsed.y)} lb`
                : `Volume: ${formatNumber(context.parsed.y)} lb`
            )
          }
        }
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 6
          },
          grid: {
            display: false
          }
        },
        y: {
          type: "linear",
          display: true,
          position: "left",
          title: {
            display: true,
            text: "E1RM"
          },
          ticks: {
            callback: (value) => `${value}`
          }
        },
        y1: {
          type: "linear",
          display: true,
          position: "right",
          title: {
            display: true,
            text: "Volume"
          },
          grid: {
            drawOnChartArea: false
          },
          ticks: {
            callback: (value) => `${value}`
          }
        }
      }
    }
  });
}

function normalizeRawWorkoutRows(rawLocalStorageData) {
  const rows = Array.isArray(rawLocalStorageData)
    ? rawLocalStorageData
    : parseJson(rawLocalStorageData, []);

  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row) => ({
      date: row.date || row.timestamp || "",
      exercise: row.exercise || row.exerciseName || "",
      weight: toNumber(row.weight, 0),
      reps: toNumber(row.reps, 0)
    }))
    .filter((row) => row.date && row.exercise);
}

function readWorkoutRowsFromLocalStorage() {
  return normalizeRawWorkoutRows(localStorage.getItem(STORAGE_KEYS.workoutRows) || "[]");
}

async function handleSignIn() {
  if (!hasClientId()) {
    setStatus("Set CLIENT_ID", "error");
    return;
  }

  try {
    setStatus("Signing in", "");
    await ensureAccessToken({ interactive: true, forceConsent: !progressState.hasGoogleGrant });
    await refreshWorkoutRowsFromSheet();
  } catch (error) {
    reportError(error);
  }
}

async function handleRefresh() {
  if (!hasClientId()) {
    setStatus("Set CLIENT_ID", "error");
    return;
  }

  try {
    setStatus("Refreshing", "");
    await ensureAccessToken({ interactive: true, silent: progressState.hasGoogleGrant });
    await refreshWorkoutRowsFromSheet();
  } catch (error) {
    reportError(error);
  }
}

async function restoreAndRefreshProgress() {
  if (!hasClientId() || !progressState.hasGoogleGrant) {
    return;
  }

  try {
    setStatus("Loading", "");
    if (!isTokenFresh()) {
      await waitForGoogleIdentity();
      await ensureAccessToken({ silent: true });
    }
    await refreshWorkoutRowsFromSheet();
  } catch {
    setStatus(progressState.pendingRows.length ? `Queued ${progressState.pendingRows.length}` : "Local", progressState.pendingRows.length ? "error" : "");
  }
}

async function refreshWorkoutRowsFromSheet() {
  await initializeDatabase();
  await flushPendingRows();
  const sheetRows = await fetchWorkoutRows();
  cacheWorkoutRows(sheetRowsToLocalRows(sheetRows));
  populateExerciseSelect();
  renderSelectedExerciseChart();
  setStatus(progressState.pendingRows.length ? `Queued ${progressState.pendingRows.length}` : "Synced", progressState.pendingRows.length ? "error" : "ok");
}

async function fetchWorkoutRows() {
  const range = encodeURIComponent(a1Range("A2:D"));
  const response = await googleFetch(`${SHEETS_API}/spreadsheets/${progressState.spreadsheetId}/values/${range}?majorDimension=ROWS`);
  return response.values || [];
}

function sheetRowsToLocalRows(sheetRows) {
  return sheetRows
    .map(([timestamp, exerciseName, reps, weight]) => ({
      date: timestamp,
      exercise: exerciseName,
      reps: toNumber(reps, 0),
      weight: toNumber(weight, 0)
    }))
    .filter((row) => row.date && row.exercise);
}

function cacheWorkoutRows(rows) {
  const mergedRows = [...readWorkoutRowsFromLocalStorage()];

  rows.forEach((row) => {
    const exists = mergedRows.some((storedRow) => (
      storedRow.date === row.date
      && storedRow.exercise === row.exercise
      && storedRow.reps === row.reps
      && storedRow.weight === row.weight
    ));

    if (!exists) {
      mergedRows.push(row);
    }
  });

  mergedRows.sort((a, b) => new Date(a.date) - new Date(b.date));
  writeJson(STORAGE_KEYS.workoutRows, mergedRows);
}

async function flushPendingRows() {
  progressState.pendingRows = readJson(STORAGE_KEYS.pendingRows, []);

  if (progressState.flushPromise) {
    return progressState.flushPromise;
  }

  if (!progressState.pendingRows.length) {
    return;
  }

  progressState.flushPromise = (async () => {
    while (progressState.pendingRows.length) {
      setStatus(`Syncing ${progressState.pendingRows.length}`, "");
      await appendWorkoutRow(progressState.pendingRows[0]);
      progressState.pendingRows.shift();
      writeJson(STORAGE_KEYS.pendingRows, progressState.pendingRows);
    }
  })();

  try {
    return await progressState.flushPromise;
  } finally {
    progressState.flushPromise = null;
  }
}

async function appendWorkoutRow(row) {
  const range = encodeURIComponent(a1Range("A:D"));
  await googleFetch(`${SHEETS_API}/spreadsheets/${progressState.spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({
      values: [[row.timestamp, row.exerciseName, row.reps, row.weight]]
    })
  });
}

async function initializeDatabase() {
  if (progressState.databaseReady && progressState.spreadsheetId) {
    return progressState.spreadsheetId;
  }

  if (progressState.databasePromise) {
    return progressState.databasePromise;
  }

  progressState.databasePromise = (async () => {
    setStatus("Finding sheet", "");
    const file = await findSpreadsheet();
    if (!file?.id) {
      throw new Error("Workout sheet was not found. Log a workout first.");
    }

    progressState.spreadsheetId = file.id;
    progressState.databaseReady = true;
    localStorage.setItem(STORAGE_KEYS.spreadsheetId, file.id);
    return file.id;
  })();

  try {
    return await progressState.databasePromise;
  } finally {
    progressState.databasePromise = null;
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

function initTokenClient() {
  if (progressState.tokenClient) {
    return progressState.tokenClient;
  }

  if (!window.google?.accounts?.oauth2) {
    throw new Error("Google Identity Services did not load.");
  }

  progressState.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: DRIVE_SCOPE,
    callback: () => {},
    error_callback: (error) => {
      if (progressState.tokenReject) {
        progressState.tokenReject(new Error(error?.type || "Google sign-in failed."));
      }
    }
  });

  return progressState.tokenClient;
}

function ensureAccessToken(options = {}) {
  if (isTokenFresh()) {
    return Promise.resolve(progressState.accessToken);
  }

  if (progressState.tokenPromise) {
    if (options.interactive && progressState.tokenPromiseSilentOnly) {
      return progressState.tokenPromise.catch(() => {
        progressState.tokenPromise = null;
        progressState.tokenPromiseSilentOnly = false;
        return ensureAccessToken(options);
      });
    }

    return progressState.tokenPromise;
  }

  if (!options.interactive && !options.silent) {
    return Promise.reject(new Error("Sign in to sync."));
  }

  progressState.tokenPromise = requestGoogleToken(getTokenPrompt(options))
    .catch((error) => {
      if (options.interactive && options.silent) {
        return requestGoogleToken(getTokenPrompt({ ...options, silent: false }));
      }

      throw error;
    })
    .finally(() => {
      progressState.tokenPromise = null;
      progressState.tokenPromiseSilentOnly = false;
    });
  progressState.tokenPromiseSilentOnly = Boolean(options.silent && !options.interactive);

  return progressState.tokenPromise;
}

function requestGoogleToken(prompt) {
  const tokenClient = initTokenClient();

  return new Promise((resolve, reject) => {
    progressState.tokenReject = reject;
    tokenClient.callback = (response) => {
      progressState.tokenReject = null;

      if (response?.error) {
        reject(new Error(response.error_description || response.error));
        return;
      }

      storeAccessToken(response);
      progressState.hasGoogleGrant = true;
      localStorage.setItem(STORAGE_KEYS.hasGoogleGrant, "1");
      updateAuthUi();
      resolve(progressState.accessToken);
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

  return progressState.hasGoogleGrant ? "" : "consent";
}

async function googleFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${progressState.accessToken}`);

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
  const data = text ? parseJson(text, {}) : {};

  if (!response.ok) {
    throw new Error(getGoogleErrorMessage(data) || `Google API request failed (${response.status}).`);
  }

  return data;
}

function isTokenFresh() {
  return Boolean(progressState.accessToken && Date.now() < progressState.tokenExpiresAt - 60000);
}

function storeAccessToken(response) {
  progressState.accessToken = response.access_token;
  progressState.tokenExpiresAt = Date.now() + (toNumber(response.expires_in, 3600) * 1000);
  sessionStorage.setItem(STORAGE_KEYS.accessToken, progressState.accessToken);
  sessionStorage.setItem(STORAGE_KEYS.tokenExpiresAt, String(progressState.tokenExpiresAt));
}

function clearAccessToken() {
  progressState.accessToken = "";
  progressState.tokenExpiresAt = 0;
  sessionStorage.removeItem(STORAGE_KEYS.accessToken);
  sessionStorage.removeItem(STORAGE_KEYS.tokenExpiresAt);

  if (progressEls.signInButton) {
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

function reportError(error) {
  setStatus(error?.message || "Sync failed", "error");
}

function setStatus(message, tone) {
  progressEls.status.textContent = message;
  progressEls.status.classList.toggle("is-ok", tone === "ok");
  progressEls.status.classList.toggle("is-error", tone === "error");
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

function getExerciseByName(exerciseName) {
  return DEFAULT_EXERCISES.find((exercise) => exercise.name.toLowerCase() === String(exerciseName).toLowerCase());
}

function isDurationExerciseName(exerciseName) {
  return getExerciseByName(exerciseName)?.type === "duration";
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

function parseJson(text, fallback) {
  try {
    const value = JSON.parse(text);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function getGoogleErrorMessage(data) {
  return data?.error?.message || data?.error_description || data?.error || "";
}

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundToOne(value) {
  return Math.round(value * 10) / 10;
}

function formatNumber(value) {
  const number = toNumber(value, 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatChartDate(date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "numeric",
    day: "numeric"
  }).format(date);
}
