import {
  DEFAULT_EXERCISES,
  abbreviateExercise,
  getExerciseStyle,
  isDurationExerciseName
} from "./config.js";
import {
  getFirestorePersistenceStatus,
  signInWithGoogle,
  subscribeDailySteps,
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
  dailySteps: [],
  unsubscribeWorkouts: null,
  unsubscribeDailySteps: null
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

  if (calendarState.unsubscribeDailySteps) {
    calendarState.unsubscribeDailySteps();
    calendarState.unsubscribeDailySteps = null;
  }

  if (!user) {
    calendarState.workouts = [];
    calendarState.dailySteps = [];
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
    const visibleDays = getCalendarDays();
    calendarState.unsubscribeDailySteps = await subscribeDailySteps(user.uid, dateKey(visibleDays[0]), (dailySteps) => {
      calendarState.dailySteps = dailySteps;
      renderCurrentCalendar();
      setStatus(getReadyStatus(), "ok");
    }, () => {
      setStatus("Steps error", "error");
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
  const stepsByDate = new Map(calendarState.dailySteps.map((dailySteps) => [dailySteps.date, dailySteps]));
  renderCalendar(days, byDate, stepsByDate);
}

function renderCalendarSkeleton(message = "") {
  const days = getCalendarDays();
  const byDate = new Map();
  renderCalendar(days, byDate, new Map());

  if (message) {
    const firstPastCell = calendarEls.grid.querySelector(".calendar-cell:not(.is-future) .workout-lines");
    if (firstPastCell) {
      firstPastCell.textContent = message;
    }
  }
}

function renderCalendar(days, workoutsByDate, stepsByDate) {
  calendarEls.grid.replaceChildren();
  calendarEls.dateRangeLabel.textContent = formatDateRange(days[0], days[days.length - 1]);
  const today = startOfDay(new Date());

  days.forEach((date) => {
    const key = dateKey(date);
    const summaries = summarizeDay(workoutsByDate.get(key) || []);
    const dailySteps = stepsByDate.get(key);
    const isToday = sameDate(date, today);
    const isFuture = date > today;

    const cell = document.createElement("article");
    cell.className = "calendar-cell";
    cell.classList.toggle("is-today", isToday);
    cell.classList.toggle("is-future", isFuture);
    cell.classList.toggle("has-workout", summaries.length > 0);
    cell.classList.toggle("has-steps", Boolean(dailySteps));
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", buildCellLabel(date, summaries, dailySteps));

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

    const stepsLine = document.createElement("div");
    stepsLine.className = "steps-line";
    if (dailySteps) {
      const stepsIcon = document.createElement("span");
      stepsIcon.className = "material-symbols-rounded";
      stepsIcon.setAttribute("aria-hidden", "true");
      stepsIcon.textContent = "directions_walk";

      const stepsCount = document.createElement("span");
      stepsCount.textContent = dailySteps.steps.toLocaleString();
      stepsLine.title = `${dailySteps.steps.toLocaleString()} steps${dailySteps.sourceAppName ? ` from ${dailySteps.sourceAppName}` : ""}`;
      stepsLine.append(stepsIcon, stepsCount);
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

    cell.append(dateBar, stepsLine, lines);
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
  const detail = isDuration ? formatDurationSets(sets) : formatWeightedSets(sets);

  const shortText = `${shortName}${sets.length} ${detail}`;
  return {
    shortText,
    fullText: isDuration
      ? `${exerciseName}: ${sets.map((set) => `${formatNumber(set.reps)} minutes`).join(", ")}`
      : `${exerciseName}: ${sets.map((set) => `${formatNumber(set.reps)} reps at ${formatNumber(set.weight)} lb`).join(", ")}`,
    color: exerciseStyle.color,
    tint: exerciseStyle.tint
  };
}

function formatWeightedSets(sets) {
  return sets
    .map((set) => `${formatNumber(set.reps)}@${formatNumber(set.weight)}`)
    .join(" ");
}

function formatDurationSets(sets) {
  return sets
    .map((set) => `${formatNumber(set.reps)}m`)
    .join(" ");
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

function buildCellLabel(date, summaries, dailySteps) {
  const dateLabel = `${WEEKDAY_LABELS[date.getDay()]}, ${date.toLocaleDateString()}`;
  const stepLabel = dailySteps ? `${dailySteps.steps.toLocaleString()} steps` : "no step data";

  if (!summaries.length) {
    return `${dateLabel}: ${stepLabel}; no workouts`;
  }

  return `${dateLabel}: ${stepLabel}; ${summaries.map((summary) => summary.fullText).join("; ")}`;
}
