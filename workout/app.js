import { DEFAULT_EXERCISES, isDurationExercise, isDurationExerciseName } from "./config.js";
import {
  addWorkoutSet,
  deleteWorkoutSet,
  getFirestorePersistenceStatus,
  signInWithGoogle,
  subscribeWorkouts,
  watchAuth
} from "./firebase.js";

const DEFAULT_REPS = 8;
const MIN_REPS = 1;
const MAX_REPS = 30;
const DEFAULT_DURATION_MINUTES = 30;
const MIN_DURATION_MINUTES = 5;
const MAX_DURATION_MINUTES = 180;
const DURATION_STEP_MINUTES = 5;
const DEFAULT_WEIGHT = 0;
const MIN_WEIGHT = 0;
const DEFAULT_MAX_WEIGHT = 500;
const WEIGHT_STEP = 2.5;
const SAVE_COOLDOWN_MS = 1000;
const IDLE_CLOCK_DELAY_MS = 30 * 60 * 1000;
const CLOCK_UPDATE_MS = 1000;

const state = {
  user: null,
  activeExercise: null,
  workouts: [],
  exerciseCache: {},
  unsubscribeWorkouts: null,
  saveCooldownTimer: null,
  idleTimer: null,
  clockTimer: null,
  lastInteractionAt: Date.now(),
  isIdleClockVisible: false
};

const els = {};

document.addEventListener("DOMContentLoaded", initApp);

function initApp() {
  cacheElements();
  bindEvents();
  renderHome();
  setSyncStatus("Loading", "");
  resetIdleTimer();
  watchAuth(handleAuthState);
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
  els.repsLabel = document.getElementById("repsLabel");
  els.repsValue = document.getElementById("repsValue");
  els.repsDown = document.getElementById("repsDown");
  els.repsUp = document.getElementById("repsUp");
  els.weightControl = document.getElementById("weightControl");
  els.weightSlider = document.getElementById("weightSlider");
  els.weightValue = document.getElementById("weightValue");
  els.weightDown = document.getElementById("weightDown");
  els.weightUp = document.getElementById("weightUp");
  els.saveButton = document.getElementById("saveButton");
  els.entryStatus = document.getElementById("entryStatus");
  els.recentSetList = document.getElementById("recentSetList");
  els.idleClockOverlay = document.getElementById("idleClockOverlay");
  els.idleClockTime = document.getElementById("idleClockTime");
}

function bindEvents() {
  els.signInButton.addEventListener("click", handleSignIn);
  els.backButton.addEventListener("click", showHome);
  els.repsSlider.addEventListener("input", () => setReps(els.repsSlider.value));
  els.weightSlider.addEventListener("input", () => setWeight(els.weightSlider.value));
  els.repsDown.addEventListener("click", () => setReps(getReps() - getPrimaryStep()));
  els.repsUp.addEventListener("click", () => setReps(getReps() + getPrimaryStep()));
  els.weightDown.addEventListener("click", () => setWeight(getWeight() - WEIGHT_STEP));
  els.weightUp.addEventListener("click", () => setWeight(getWeight() + WEIGHT_STEP));
  els.saveButton.addEventListener("click", handleSave);
  els.idleClockOverlay.addEventListener("click", wakeFromIdleClock);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  ["pointerdown", "keydown", "input", "wheel"].forEach((eventName) => {
    document.addEventListener(eventName, handleUserActivity, { capture: true, passive: true });
  });
}

function handleUserActivity() {
  if (state.isIdleClockVisible) {
    wakeFromIdleClock();
    return;
  }

  resetIdleTimer();
}

function resetIdleTimer() {
  state.lastInteractionAt = Date.now();
  scheduleIdleTimer();
}

function scheduleIdleTimer() {
  window.clearTimeout(state.idleTimer);

  if (document.visibilityState === "hidden" || state.isIdleClockVisible) {
    return;
  }

  state.idleTimer = window.setTimeout(checkIdleTimeout, IDLE_CLOCK_DELAY_MS);
}

function checkIdleTimeout() {
  const idleFor = Date.now() - state.lastInteractionAt;
  if (idleFor >= IDLE_CLOCK_DELAY_MS) {
    showIdleClock();
    return;
  }

  state.idleTimer = window.setTimeout(checkIdleTimeout, IDLE_CLOCK_DELAY_MS - idleFor);
}

function showIdleClock() {
  if (state.isIdleClockVisible) {
    return;
  }

  window.clearTimeout(state.idleTimer);
  state.idleTimer = null;
  state.isIdleClockVisible = true;
  updateIdleClock();
  els.idleClockOverlay.hidden = false;
  document.documentElement.classList.add("is-idle-clock");
  state.clockTimer = window.setInterval(updateIdleClock, CLOCK_UPDATE_MS);
}

function wakeFromIdleClock() {
  if (!state.isIdleClockVisible) {
    resetIdleTimer();
    return;
  }

  state.isIdleClockVisible = false;
  window.clearInterval(state.clockTimer);
  state.clockTimer = null;
  els.idleClockOverlay.hidden = true;
  document.documentElement.classList.remove("is-idle-clock");
  showHome();
  resetIdleTimer();
}

function handleVisibilityChange() {
  if (document.visibilityState === "hidden") {
    window.clearTimeout(state.idleTimer);
    return;
  }

  if (Date.now() - state.lastInteractionAt >= IDLE_CLOCK_DELAY_MS) {
    showIdleClock();
    return;
  }

  scheduleIdleTimer();
}

function updateIdleClock() {
  const now = new Date();
  const hours = now.getHours() % 12 || 12;
  const minutes = String(now.getMinutes()).padStart(2, "0");
  els.idleClockTime.textContent = `${hours}:${minutes}`;
  els.idleClockTime.dateTime = now.toISOString();
}

async function handleAuthState(user) {
  state.user = user;
  updateAuthUi();

  if (state.unsubscribeWorkouts) {
    state.unsubscribeWorkouts();
    state.unsubscribeWorkouts = null;
  }

  if (!user) {
    state.workouts = [];
    state.exerciseCache = {};
    renderHome();
    setSyncStatus("Sign in", "");
    return;
  }

  setSyncStatus("Loading", "");
  try {
    state.unsubscribeWorkouts = await subscribeWorkouts(user.uid, (workouts) => {
      state.workouts = workouts;
      state.exerciseCache = buildExerciseCache(workouts);
      renderHome();
      updateLastLogged();
      renderRecentSets();
      setSyncStatus(getReadyStatus(), "ok");
    }, (error) => {
      setSyncStatus("Sync error", "error");
      setEntryStatus(error.message || "Could not load workouts.", "error");
    });
  } catch (error) {
    setSyncStatus("Sync error", "error");
    setEntryStatus(error.message || "Could not start Firestore.", "error");
  }
}

async function handleSignIn() {
  if (state.user) {
    setSyncStatus(getReadyStatus(), "ok");
    return;
  }

  try {
    setSyncStatus("Signing in", "");
    await signInWithGoogle();
  } catch (error) {
    setSyncStatus("Sign-in failed", "error");
    setEntryStatus(error.message || "Sign-in failed.", "error");
  }
}

function updateAuthUi() {
  const label = els.signInButton.querySelector("span:last-child");
  if (label) {
    label.textContent = state.user ? "Signed in" : "Sign in";
  }

  els.signInButton.title = state.user ? `Signed in as ${state.user.email || "Google user"}` : "Sign in with Google";
}

function getReadyStatus() {
  const persistenceStatus = getFirestorePersistenceStatus();
  return persistenceStatus === "unavailable" ? "Online" : "Synced";
}

function buildExerciseCache(workouts) {
  return workouts.reduce((cache, workout) => {
    const current = cache[workout.exerciseName];
    if (!current || workout.timestamp > current.timestamp) {
      cache[workout.exerciseName] = {
        reps: workout.reps,
        weight: workout.weight,
        timestamp: workout.timestamp
      };
    }

    return cache;
  }, {});
}

function renderHome() {
  const sortedExercises = getSortedExercises();
  els.exerciseGrid.replaceChildren();

  sortedExercises.forEach((exercise) => {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "exercise-tile";
    tile.style.setProperty("--exercise-color", exercise.color || "#157a55");
    tile.style.setProperty("--exercise-bg", exercise.tint || "#13281f");
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
  return timestamp ? timestamp.getTime() : 0;
}

function getTileMeta(exerciseName) {
  const cached = state.exerciseCache[exerciseName];
  if (!cached) {
    return "";
  }

  if (isDurationExerciseName(exerciseName)) {
    return `${formatNumber(cached.reps)} min`;
  }

  return `${formatWeight(cached.weight)} lb x ${cached.reps}`;
}

function openExercise(exercise) {
  state.activeExercise = exercise;
  const cached = state.exerciseCache[exercise.name] || {};
  const reps = toNumber(cached.reps, getDefaultPrimaryValue(exercise));
  const weight = toNumber(cached.weight, DEFAULT_WEIGHT);

  els.exerciseTitle.textContent = exercise.name;
  configureEntryControls(exercise);
  setReps(reps);

  if (!isDurationExercise(exercise)) {
    ensureWeightRange(weight);
    setWeight(weight);
  }

  updateLastLogged();
  renderRecentSets();
  setEntryStatus("", "");
  els.homeView.hidden = true;
  els.entryView.hidden = false;
}

function showHome() {
  els.entryView.hidden = true;
  els.homeView.hidden = false;
  state.activeExercise = null;
  renderRecentSets();
  renderHome();
}

function configureEntryControls(exercise) {
  const isDuration = isDurationExercise(exercise);
  els.repsLabel.textContent = isDuration ? "Minutes" : "Reps";
  els.repsDown.textContent = isDuration ? `-${DURATION_STEP_MINUTES}` : "-1";
  els.repsUp.textContent = isDuration ? `+${DURATION_STEP_MINUTES}` : "+1";
  els.repsSlider.min = String(isDuration ? MIN_DURATION_MINUTES : MIN_REPS);
  els.repsSlider.max = String(isDuration ? MAX_DURATION_MINUTES : MAX_REPS);
  els.repsSlider.step = String(isDuration ? DURATION_STEP_MINUTES : 1);
  els.weightControl.hidden = isDuration;
  els.weightSlider.disabled = isDuration;
  els.weightDown.disabled = isDuration;
  els.weightUp.disabled = isDuration;
  els.entryStatus.parentElement.classList.toggle("is-duration-entry", isDuration);
}

function getPrimaryStep() {
  return isDurationExercise(state.activeExercise) ? DURATION_STEP_MINUTES : 1;
}

function getPrimaryBounds() {
  if (isDurationExercise(state.activeExercise)) {
    return {
      min: MIN_DURATION_MINUTES,
      max: MAX_DURATION_MINUTES,
      step: DURATION_STEP_MINUTES,
      defaultValue: DEFAULT_DURATION_MINUTES
    };
  }

  return {
    min: MIN_REPS,
    max: MAX_REPS,
    step: 1,
    defaultValue: DEFAULT_REPS
  };
}

function getDefaultPrimaryValue(exercise) {
  return isDurationExercise(exercise) ? DEFAULT_DURATION_MINUTES : DEFAULT_REPS;
}

function setReps(value) {
  const bounds = getPrimaryBounds();
  const rawValue = toNumber(value, bounds.defaultValue);
  const rounded = isDurationExercise(state.activeExercise)
    ? snapToStep(rawValue, bounds.step)
    : Math.round(rawValue);
  const reps = clamp(rounded, bounds.min, bounds.max);
  els.repsSlider.value = String(reps);
  els.repsValue.textContent = isDurationExercise(state.activeExercise) ? `${formatNumber(reps)} min` : String(reps);
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

function snapToStep(value, step) {
  return Math.round(value / step) * step;
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

async function handleSave() {
  if (els.saveButton.disabled) {
    return;
  }

  if (!state.activeExercise) {
    return;
  }

  startSaveCooldown();

  if (!state.user) {
    await handleSignIn();
    if (!state.user) {
      return;
    }
  }

  const isDuration = isDurationExercise(state.activeExercise);
  const workout = {
    exerciseName: state.activeExercise.name,
    reps: getReps(),
    weight: isDuration ? 0 : getWeight(),
    timestamp: new Date()
  };

  updateExerciseCache(workout);
  renderHome();
  updateLastLogged();
  renderRecentSets();
  setEntryStatus(`Saved ${formatTime(workout.timestamp)}`, "ok");
  setSyncStatus("Saving", "");

  try {
    await addWorkoutSet(state.user.uid, workout);
    setSyncStatus(getReadyStatus(), "ok");
  } catch (error) {
    setSyncStatus("Queued", "error");
    setEntryStatus(error.message || "Saved locally. Will sync when possible.", "error");
  }
}

function startSaveCooldown() {
  window.clearTimeout(state.saveCooldownTimer);
  els.saveButton.disabled = true;
  state.saveCooldownTimer = window.setTimeout(() => {
    els.saveButton.disabled = false;
    state.saveCooldownTimer = null;
  }, SAVE_COOLDOWN_MS);
}

async function handleDeleteSet(workout) {
  if (!state.user || !workout?.id) {
    return;
  }

  state.workouts = state.workouts.filter((candidate) => candidate.id !== workout.id);
  state.exerciseCache = buildExerciseCache(state.workouts);
  renderHome();
  updateLastLogged();
  renderRecentSets();
  setEntryStatus(`Deleted ${formatSetSummary(workout)}`, "ok");
  setSyncStatus("Deleting", "");

  try {
    await deleteWorkoutSet(state.user.uid, workout.id);
    setSyncStatus(getReadyStatus(), "ok");
  } catch (error) {
    if (!state.workouts.some((candidate) => candidate.id === workout.id)) {
      state.workouts = [workout, ...state.workouts];
      state.exerciseCache = buildExerciseCache(state.workouts);
      renderHome();
      updateLastLogged();
      renderRecentSets();
    }

    setSyncStatus("Delete failed", "error");
    setEntryStatus(error.message || "Could not delete set.", "error");
  }
}

function renderRecentSets() {
  if (!els.recentSetList) {
    return;
  }

  els.recentSetList.replaceChildren();

  if (!state.activeExercise) {
    return;
  }

  const recentSets = state.workouts
    .filter((workout) => workout.exerciseName === state.activeExercise.name)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 12);

  if (!recentSets.length) {
    const empty = document.createElement("p");
    empty.className = "recent-empty";
    empty.textContent = "No sets yet.";
    els.recentSetList.append(empty);
    return;
  }

  recentSets.forEach((workout) => {
    const row = document.createElement("div");
    row.className = "recent-set-row";

    const details = document.createElement("div");
    details.className = "recent-set-details";

    const summary = document.createElement("span");
    summary.className = "recent-set-summary";
    summary.textContent = formatSetSummary(workout);

    const timestamp = document.createElement("span");
    timestamp.className = "recent-set-time";
    timestamp.textContent = formatRelativeDateTime(workout.timestamp);

    details.append(summary, timestamp);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-set-button";
    deleteButton.setAttribute("aria-label", `Delete ${formatSetSummary(workout)} from ${formatRelativeDateTime(workout.timestamp)}`);
    deleteButton.title = "Delete set";
    deleteButton.addEventListener("click", () => handleDeleteSet(workout));

    const deleteIcon = document.createElement("span");
    deleteIcon.className = "material-symbols-rounded";
    deleteIcon.setAttribute("aria-hidden", "true");
    deleteIcon.textContent = "delete";
    deleteButton.append(deleteIcon);

    row.append(details, deleteButton);
    els.recentSetList.append(row);
  });
}

function updateExerciseCache(workout) {
  state.exerciseCache[workout.exerciseName] = {
    reps: workout.reps,
    weight: workout.weight,
    timestamp: workout.timestamp
  };
}

function updateLastLogged() {
  const exerciseName = state.activeExercise?.name;
  const cached = exerciseName ? state.exerciseCache[exerciseName] : null;

  if (cached && isDurationExerciseName(exerciseName)) {
    els.lastLogged.textContent = `Last ${formatNumber(cached.reps)} min, ${formatDateTime(cached.timestamp)}`;
    return;
  }

  els.lastLogged.textContent = cached
    ? `Last ${formatWeight(cached.weight)} lb x ${cached.reps}, ${formatDateTime(cached.timestamp)}`
    : "";
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

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatWeight(weight) {
  return formatNumber(toNumber(weight, DEFAULT_WEIGHT));
}

function formatNumber(value) {
  const number = toNumber(value, 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function formatTime(date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatRelativeDateTime(date) {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return `Today ${formatTime(date)}`;
  }

  return formatDateTime(date);
}

function formatSetSummary(workout) {
  if (isDurationExerciseName(workout.exerciseName)) {
    return `${formatNumber(workout.reps)} min`;
  }

  return `${formatNumber(workout.reps)}@${formatWeight(workout.weight)}`;
}
