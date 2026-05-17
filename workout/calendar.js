import {
  DEFAULT_EXERCISES,
  abbreviateExercise,
  getExerciseStyle,
  isDurationExerciseName
} from "./config.js";
import {
  getFirestorePersistenceStatus,
  signInWithGoogle,
  subscribeWorkouts,
  watchAuth
} from "./firebase.js";

const CALENDAR_DAYS = 28;
const DAYS_PER_WEEK = 7;
const VISIBLE_WORKOUT_LINES = 4;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const calendarState = {
  user: null,
  workouts: [],
  unsubscribeWorkouts: null
};

const calendarEls = {};

document.addEventListener("DOMContentLoaded", initCalendar);

function initCalendar() {
  cacheCalendarElements();
  bindCalendarEvents();
  renderCalendarSkeleton();
  setStatus("Loading", "");
  watchAuth(handleAuthState);
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
  calendarEls.refreshButton.addEventListener("click", renderCurrentCalendar);
}

async function handleAuthState(user) {
  calendarState.user = user;
  updateAuthUi();

  if (calendarState.unsubscribeWorkouts) {
    calendarState.unsubscribeWorkouts();
    calendarState.unsubscribeWorkouts = null;
  }

  if (!user) {
    calendarState.workouts = [];
    renderCalendarSkeleton("Sign in to load your workout history.");
    setStatus("Sign in", "");
    return;
  }

  setStatus("Loading", "");
  try {
    calendarState.unsubscribeWorkouts = await subscribeWorkouts(user.uid, (workouts) => {
      calendarState.workouts = workouts;
      renderCurrentCalendar();
      setStatus(getReadyStatus(), "ok");
    }, (error) => {
      renderCalendarSkeleton(error.message || "Could not load workouts.");
      setStatus("Sync error", "error");
    });
  } catch (error) {
    renderCalendarSkeleton(error.message || "Could not start Firestore.");
    setStatus("Sync error", "error");
  }
}

async function handleSignIn() {
  if (calendarState.user) {
    setStatus(getReadyStatus(), "ok");
    return;
  }

  try {
    setStatus("Signing in", "");
    await signInWithGoogle();
  } catch (error) {
    setStatus("Sign-in failed", "error");
    renderCalendarSkeleton(error.message || "Sign-in failed.");
  }
}

function updateAuthUi() {
  const label = calendarEls.signInButton.querySelector("span:last-child");
  if (label) {
    label.textContent = calendarState.user ? "Signed in" : "Sign in";
  }

  calendarEls.signInButton.title = calendarState.user
    ? `Signed in as ${calendarState.user.email || "Google user"}`
    : "Sign in with Google";
}

function getReadyStatus() {
  return getFirestorePersistenceStatus() === "unavailable" ? "Online" : "Synced";
}

function renderCurrentCalendar() {
  const days = getCalendarDays();
  const byDate = groupRowsByDate(calendarState.workouts, days[0], days[days.length - 1]);
  renderCalendar(days, byDate);
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
    .filter((row) => row.timestamp >= start && row.timestamp < end)
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach((row) => {
      const key = dateKey(row.timestamp);
      if (!byDate.has(key)) {
        byDate.set(key, []);
      }

      byDate.get(key).push(row);
    });

  return byDate;
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

function setStatus(message, tone) {
  calendarEls.status.textContent = message;
  calendarEls.status.classList.toggle("is-ok", tone === "ok");
  calendarEls.status.classList.toggle("is-error", tone === "error");
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
  const number = Number(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function buildCellLabel(date, summaries) {
  const dateLabel = `${WEEKDAY_LABELS[date.getDay()]}, ${date.toLocaleDateString()}`;

  if (!summaries.length) {
    return `${dateLabel}: no workouts`;
  }

  return `${dateLabel}: ${summaries.map((summary) => summary.fullText).join("; ")}`;
}
