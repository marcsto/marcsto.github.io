const CALENDAR_DAYS = 28;
const DAYS_PER_WEEK = 7;
const VISIBLE_WORKOUT_LINES = 4;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const calendarState = {
  tokenClient: null,
  accessToken: getStoredAccessToken(),
  tokenExpiresAt: getStoredTokenExpiresAt(),
  tokenPromise: null,
  tokenPromiseSilentOnly: false,
  tokenReject: null,
  spreadsheetId: localStorage.getItem(STORAGE_KEYS.spreadsheetId) || "",
  databaseReady: Boolean(localStorage.getItem(STORAGE_KEYS.spreadsheetId)),
  databasePromise: null,
  flushPromise: null,
  hasGoogleGrant: localStorage.getItem(STORAGE_KEYS.hasGoogleGrant) === "1"
    || Boolean(localStorage.getItem(STORAGE_KEYS.spreadsheetId))
    || Boolean(getStoredAccessToken()),
  pendingRows: readJson(STORAGE_KEYS.pendingRows, [])
};

const calendarEls = {};

document.addEventListener("DOMContentLoaded", initCalendar);

function initCalendar() {
  cacheCalendarElements();
  bindCalendarEvents();

  if (calendarState.accessToken && !isTokenFresh()) {
    clearAccessToken();
  }

  renderCalendarSkeleton();
  updateAuthUi();
  setStatus(initialStatus(), calendarState.pendingRows.length ? "error" : "");
  restoreAndLoadCalendar();
}

function cacheCalendarElements() {
  calendarEls.status = document.getElementById("calendarStatus");
  calendarEls.signInButton = document.getElementById("signInButton");
  calendarEls.refreshButton = document.getElementById("refreshButton");
  calendarEls.dateRangeLabel = document.getElementById("dateRangeLabel");
  calendarEls.grid = document.getElementById("calendarGrid");
}

function bindCalendarEvents() {
  calendarEls.signInButton.addEventListener("click", handleSignIn);
  calendarEls.refreshButton.addEventListener("click", handleRefresh);

  window.addEventListener("pageshow", (event) => {
    if (event.persisted && calendarState.hasGoogleGrant && !isTokenFresh()) {
      restoreAndLoadCalendar();
    }
  });
}

function initialStatus() {
  if (!hasClientId()) {
    return "Set CLIENT_ID";
  }

  if (calendarState.pendingRows.length) {
    return `Queued ${calendarState.pendingRows.length}`;
  }

  return isTokenFresh() || calendarState.hasGoogleGrant ? "Loading" : "Tap Sync";
}

function hasClientId() {
  return Boolean(CLIENT_ID.trim());
}

function updateAuthUi() {
  calendarEls.signInButton.disabled = !hasClientId();
  calendarEls.refreshButton.disabled = !hasClientId();
  calendarEls.signInButton.title = hasClientId() ? "Sync with Google" : "Add CLIENT_ID in config.js";

  const label = calendarEls.signInButton.querySelector("span:last-child");
  if (label) {
    label.textContent = isTokenFresh() ? "Synced" : calendarState.hasGoogleGrant ? "Sync" : "Sign in";
  }
}

async function handleSignIn() {
  if (!hasClientId()) {
    setStatus("Set CLIENT_ID", "error");
    return;
  }

  try {
    setStatus("Signing in", "");
    await ensureAccessToken({ interactive: true, forceConsent: !calendarState.hasGoogleGrant });
    await initializeDatabase();
    await flushPendingRows();
    await loadCalendarFromSheet();
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
    await ensureAccessToken({ interactive: true, silent: calendarState.hasGoogleGrant });
    await initializeDatabase();
    await flushPendingRows();
    await loadCalendarFromSheet();
  } catch (error) {
    reportError(error);
  }
}

async function restoreAndLoadCalendar() {
  if (!hasClientId()) {
    setStatus("Set CLIENT_ID", "error");
    return;
  }

  if (!calendarState.hasGoogleGrant && !isTokenFresh()) {
    renderCalendarSkeleton("Sign in to load your workout history.");
    setStatus("Tap Sync", "");
    return;
  }

  try {
    setStatus("Loading", "");
    if (!isTokenFresh()) {
      await waitForGoogleIdentity();
      await ensureAccessToken({ silent: true });
    }
    await initializeDatabase();
    await flushPendingRows();
    await loadCalendarFromSheet();
  } catch {
    renderCalendarSkeleton("Tap Sync to load your workout history.");
    setStatus(calendarState.pendingRows.length ? `Queued ${calendarState.pendingRows.length}` : "Tap Sync", calendarState.pendingRows.length ? "error" : "");
  }
}

async function loadCalendarFromSheet() {
  setStatus("Loading", "");
  const rows = await fetchWorkoutRows();
  const days = getCalendarDays();
  const byDate = groupRowsByDate(rows, days[0], days[days.length - 1]);
  renderCalendar(days, byDate);
  setStatus(calendarState.pendingRows.length ? `Queued ${calendarState.pendingRows.length}` : "Synced", calendarState.pendingRows.length ? "error" : "ok");
}

function renderCalendarSkeleton(message = "") {
  const days = getCalendarDays();
  const byDate = new Map();
  renderCalendar(days, byDate);

  if (message) {
    const firstPastCell = calendarEls.grid.querySelector(".calendar-cell:not(.is-future) .workout-lines");
    if (firstPastCell) {
      firstPastCell.textContent = message;
    }
  }
}

function renderCalendar(days, workoutsByDate) {
  calendarEls.grid.replaceChildren();
  calendarEls.dateRangeLabel.textContent = formatDateRange(days[0], days[days.length - 1]);
  const today = startOfDay(new Date());

  days.forEach((date) => {
    const key = dateKey(date);
    const summaries = summarizeDay(workoutsByDate.get(key) || []);
    const isToday = sameDate(date, today);
    const isFuture = date > today;

    const cell = document.createElement("article");
    cell.className = "calendar-cell";
    cell.classList.toggle("is-today", isToday);
    cell.classList.toggle("is-future", isFuture);
    cell.classList.toggle("has-workout", summaries.length > 0);
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", buildCellLabel(date, summaries));

    const dateBar = document.createElement("div");
    dateBar.className = "cell-date";

    const dayNumber = document.createElement("span");
    dayNumber.textContent = String(date.getDate());
    dateBar.append(dayNumber);

    if (isToday) {
      const todayLabel = document.createElement("span");
      todayLabel.className = "today-label";
      todayLabel.textContent = "Today";
      dateBar.append(todayLabel);
    }

    const lines = document.createElement("div");
    lines.className = "workout-lines";

    summaries.slice(0, VISIBLE_WORKOUT_LINES).forEach((summary) => {
      const line = document.createElement("div");
      line.className = "workout-line";
      line.style.setProperty("--exercise-color", summary.color);
      line.style.setProperty("--exercise-bg", summary.tint);
      line.textContent = summary.shortText;
      line.title = summary.fullText;
      lines.append(line);
    });

    if (summaries.length > VISIBLE_WORKOUT_LINES) {
      const moreLine = document.createElement("div");
      moreLine.className = "workout-line more-line";
      moreLine.textContent = `+${summaries.length - VISIBLE_WORKOUT_LINES} more`;
      lines.append(moreLine);
    }

    cell.append(dateBar, lines);
    calendarEls.grid.append(cell);
  });
}

function getCalendarDays() {
  const today = startOfDay(new Date());
  const currentSunday = addDays(today, -today.getDay());
  const start = addDays(currentSunday, -(CALENDAR_DAYS - DAYS_PER_WEEK));
  return Array.from({ length: CALENDAR_DAYS }, (_, index) => addDays(start, index));
}

function groupRowsByDate(rows, startDate, endDate) {
  const start = startOfDay(startDate);
  const end = addDays(startOfDay(endDate), 1);
  const byDate = new Map();

  rows
    .map(parseWorkoutRow)
    .filter(Boolean)
    .filter((row) => row.date >= start && row.date < end)
    .sort((a, b) => a.date - b.date)
    .forEach((row) => {
      const key = dateKey(row.date);
      if (!byDate.has(key)) {
        byDate.set(key, []);
      }

      byDate.get(key).push(row);
    });

  return byDate;
}

function parseWorkoutRow(values) {
  const [timestamp, exerciseName, reps, weight] = values;
  const date = new Date(timestamp);

  if (!timestamp || !exerciseName || Number.isNaN(date.getTime())) {
    return null;
  }

  return {
    timestamp,
    date,
    exerciseName,
    reps: toNumber(reps, 0),
    weight: isDurationExerciseName(exerciseName) ? "" : toNumber(weight, 0)
  };
}

function summarizeDay(rows) {
  const byExercise = new Map();

  rows.forEach((row) => {
    if (!byExercise.has(row.exerciseName)) {
      byExercise.set(row.exerciseName, []);
    }

    byExercise.get(row.exerciseName).push(row);
  });

  return Array.from(byExercise.entries()).map(([exerciseName, sets]) => summarizeExercise(exerciseName, sets));
}

function summarizeExercise(exerciseName, sets) {
  const exerciseStyle = getExerciseStyle(exerciseName);
  const shortName = abbreviateExercise(exerciseName);
  const isDuration = isDurationExerciseName(exerciseName);
  const reps = sets.map((set) => set.reps);
  const weights = sets.map((set) => set.weight);
  const uniqueReps = uniqueValues(reps);
  const uniqueWeights = uniqueValues(weights);
  let detail;

  if (isDuration) {
    detail = summarizeDurations(reps);
  } else if (uniqueReps.length === 1 && uniqueWeights.length === 1) {
    detail = `${sets.length}x${formatNumber(uniqueReps[0])}@${formatNumber(uniqueWeights[0])}`;
  } else if (uniqueWeights.length === 1) {
    detail = `${sets.length}s ${compactSequence(reps, formatNumber)}@${formatNumber(uniqueWeights[0])}`;
  } else if (uniqueReps.length === 1) {
    detail = `${sets.length}x${formatNumber(uniqueReps[0])}@${compactSequence(weights, formatNumber)}`;
  } else {
    detail = `${sets.length}s ${compactSetPairs(sets)}`;
  }

  const shortText = `${shortName} ${detail}`;
  return {
    shortText,
    fullText: isDuration
      ? `${exerciseName}: ${sets.map((set) => `${formatNumber(set.reps)} minutes`).join(", ")}`
      : `${exerciseName}: ${sets.map((set) => `${formatNumber(set.reps)} reps at ${formatNumber(set.weight)} lb`).join(", ")}`,
    color: exerciseStyle.color,
    tint: exerciseStyle.tint
  };
}

function summarizeDurations(minutes) {
  const uniqueMinutes = uniqueValues(minutes);

  if (minutes.length === 1) {
    return `${formatNumber(minutes[0])}m`;
  }

  if (uniqueMinutes.length === 1) {
    return `${minutes.length}x${formatNumber(uniqueMinutes[0])}m`;
  }

  return `${minutes.length}s ${compactSequence(minutes, (value) => `${formatNumber(value)}m`)}`;
}

function abbreviateExercise(exerciseName) {
  const match = getExerciseByName(exerciseName);
  if (match?.shortName) {
    return match.shortName;
  }

  return exerciseName
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

function getExerciseStyle(exerciseName) {
  const match = getExerciseByName(exerciseName);
  if (match?.color && match?.tint) {
    return {
      color: match.color,
      tint: match.tint
    };
  }

  const hue = hashString(exerciseName) % 360;
  return {
    color: `hsl(${hue} 58% 36%)`,
    tint: `hsl(${hue} 62% 94%)`
  };
}

function getExerciseByName(exerciseName) {
  return DEFAULT_EXERCISES.find((exercise) => exercise.name.toLowerCase() === String(exerciseName).toLowerCase());
}

function isDurationExerciseName(exerciseName) {
  return getExerciseByName(exerciseName)?.type === "duration";
}

function hashString(value) {
  return Array.from(value).reduce((hash, character) => (
    ((hash << 5) - hash + character.charCodeAt(0)) >>> 0
  ), 0);
}

function compactSequence(values, formatter) {
  const runs = [];

  values.forEach((value) => {
    const lastRun = runs[runs.length - 1];
    if (lastRun && lastRun.value === value) {
      lastRun.count += 1;
      return;
    }

    runs.push({ value, count: 1 });
  });

  return runs
    .map((run) => (run.count > 1 ? `${run.count}x${formatter(run.value)}` : formatter(run.value)))
    .join("/");
}

function compactSetPairs(sets) {
  const runs = [];

  sets.forEach((set) => {
    const value = `${formatNumber(set.reps)}@${formatNumber(set.weight)}`;
    const lastRun = runs[runs.length - 1];
    if (lastRun && lastRun.value === value) {
      lastRun.count += 1;
      return;
    }

    runs.push({ value, count: 1 });
  });

  return runs
    .map((run) => (run.count > 1 ? `${run.count}x${run.value}` : run.value))
    .join("/");
}

function uniqueValues(values) {
  return Array.from(new Set(values));
}

async function fetchWorkoutRows() {
  const range = encodeURIComponent(a1Range("A2:D"));
  const response = await googleFetch(`${SHEETS_API}/spreadsheets/${calendarState.spreadsheetId}/values/${range}?majorDimension=ROWS`);
  return response.values || [];
}

async function flushPendingRows() {
  calendarState.pendingRows = readJson(STORAGE_KEYS.pendingRows, []);

  if (calendarState.flushPromise) {
    return calendarState.flushPromise;
  }

  if (!calendarState.pendingRows.length) {
    return;
  }

  calendarState.flushPromise = (async () => {
    while (calendarState.pendingRows.length) {
      setStatus(`Syncing ${calendarState.pendingRows.length}`, "");
      await appendWorkoutRow(calendarState.pendingRows[0]);
      calendarState.pendingRows.shift();
      writeJson(STORAGE_KEYS.pendingRows, calendarState.pendingRows);
    }
  })();

  try {
    return await calendarState.flushPromise;
  } finally {
    calendarState.flushPromise = null;
  }
}

async function appendWorkoutRow(row) {
  const range = encodeURIComponent(a1Range("A:D"));
  await googleFetch(`${SHEETS_API}/spreadsheets/${calendarState.spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({
      values: [[row.timestamp, row.exerciseName, row.reps, row.weight]]
    })
  });
}

async function initializeDatabase() {
  if (calendarState.databaseReady && calendarState.spreadsheetId) {
    return calendarState.spreadsheetId;
  }

  if (calendarState.databasePromise) {
    return calendarState.databasePromise;
  }

  calendarState.databasePromise = (async () => {
    setStatus("Finding sheet", "");
    const file = await findSpreadsheet();

    if (file?.id) {
      calendarState.spreadsheetId = file.id;
      calendarState.databaseReady = true;
      localStorage.setItem(STORAGE_KEYS.spreadsheetId, file.id);
      return file.id;
    }

    setStatus("Creating sheet", "");
    const spreadsheet = await createSpreadsheet();
    calendarState.spreadsheetId = spreadsheet.spreadsheetId;
    calendarState.databaseReady = true;
    localStorage.setItem(STORAGE_KEYS.spreadsheetId, calendarState.spreadsheetId);
    return calendarState.spreadsheetId;
  })();

  try {
    return await calendarState.databasePromise;
  } finally {
    calendarState.databasePromise = null;
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

function initTokenClient() {
  if (calendarState.tokenClient) {
    return calendarState.tokenClient;
  }

  if (!window.google?.accounts?.oauth2) {
    throw new Error("Google Identity Services did not load.");
  }

  calendarState.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: DRIVE_SCOPE,
    callback: () => {},
    error_callback: (error) => {
      if (calendarState.tokenReject) {
        calendarState.tokenReject(new Error(error?.type || "Google sign-in failed."));
      }
    }
  });

  return calendarState.tokenClient;
}

function ensureAccessToken(options = {}) {
  if (isTokenFresh()) {
    return Promise.resolve(calendarState.accessToken);
  }

  if (calendarState.tokenPromise) {
    if (options.interactive && calendarState.tokenPromiseSilentOnly) {
      return calendarState.tokenPromise.catch(() => {
        calendarState.tokenPromise = null;
        calendarState.tokenPromiseSilentOnly = false;
        return ensureAccessToken(options);
      });
    }

    return calendarState.tokenPromise;
  }

  if (!options.interactive && !options.silent) {
    return Promise.reject(new Error("Sign in to sync."));
  }

  calendarState.tokenPromise = requestGoogleToken(getTokenPrompt(options))
    .catch((error) => {
      if (options.interactive && options.silent) {
        return requestGoogleToken(getTokenPrompt({ ...options, silent: false }));
      }

      throw error;
    })
    .finally(() => {
      calendarState.tokenPromise = null;
      calendarState.tokenPromiseSilentOnly = false;
    });
  calendarState.tokenPromiseSilentOnly = Boolean(options.silent && !options.interactive);

  return calendarState.tokenPromise;
}

function requestGoogleToken(prompt) {
  const tokenClient = initTokenClient();

  return new Promise((resolve, reject) => {
    calendarState.tokenReject = reject;
    tokenClient.callback = (response) => {
      calendarState.tokenReject = null;

      if (response?.error) {
        reject(new Error(response.error_description || response.error));
        return;
      }

      storeAccessToken(response);
      calendarState.hasGoogleGrant = true;
      localStorage.setItem(STORAGE_KEYS.hasGoogleGrant, "1");
      updateAuthUi();
      resolve(calendarState.accessToken);
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

  return calendarState.hasGoogleGrant ? "" : "consent";
}

async function googleFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${calendarState.accessToken}`);

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

function isTokenFresh() {
  return Boolean(calendarState.accessToken && Date.now() < calendarState.tokenExpiresAt - 60000);
}

function storeAccessToken(response) {
  calendarState.accessToken = response.access_token;
  calendarState.tokenExpiresAt = Date.now() + (toNumber(response.expires_in, 3600) * 1000);
  storeAccessTokenForTabs(calendarState.accessToken, calendarState.tokenExpiresAt);
}

function clearAccessToken() {
  calendarState.accessToken = "";
  calendarState.tokenExpiresAt = 0;
  clearAccessTokenForTabs();

  if (calendarEls.signInButton) {
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
  calendarEls.status.textContent = message;
  calendarEls.status.classList.toggle("is-ok", tone === "ok");
  calendarEls.status.classList.toggle("is-error", tone === "error");
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

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function sameDate(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateRange(start, end) {
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function buildCellLabel(date, summaries) {
  const dateLabel = `${WEEKDAY_LABELS[date.getDay()]}, ${date.toLocaleDateString()}`;

  if (!summaries.length) {
    return `${dateLabel}: no workouts`;
  }

  return `${dateLabel}: ${summaries.map((summary) => summary.fullText).join("; ")}`;
}
