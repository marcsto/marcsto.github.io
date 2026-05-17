import { DEFAULT_EXERCISES, isDurationExerciseName } from "./config.js";
import {
  getFirestorePersistenceStatus,
  getWorkoutsForExercise,
  signInWithGoogle,
  watchAuth
} from "./firebase.js";

const PROGRESS_LIMIT_DAYS = 30;
const STRENGTH_LINE_COLOR = "#31c48d";
const VOLUME_BAR_COLOR = "rgba(98, 168, 234, 0.22)";
const VOLUME_BAR_BORDER = "rgba(98, 168, 234, 0.48)";
const CHART_TEXT_COLOR = "#a7b3bc";
const CHART_GRID_COLOR = "rgba(167, 179, 188, 0.16)";

const progressState = {
  user: null,
  chart: null,
  loadingRun: 0
};

const progressEls = {};

document.addEventListener("DOMContentLoaded", initProgressPage);

async function initProgressPage() {
  cacheProgressElements();
  bindProgressEvents();
  populateExerciseSelect();
  await waitForChart();
  renderEmptyChart();
  setStatus("Loading", "");
  watchAuth(handleAuthState);
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
  progressEls.refreshButton.addEventListener("click", renderSelectedExerciseChart);
  progressEls.exerciseSelect.addEventListener("change", renderSelectedExerciseChart);
}

async function handleAuthState(user) {
  progressState.user = user;
  updateAuthUi();

  if (!user) {
    renderEmptyChart("Sign in to load progress.");
    setStatus("Sign in", "");
    return;
  }

  await renderSelectedExerciseChart();
}

async function handleSignIn() {
  if (progressState.user) {
    setStatus(getReadyStatus(), "ok");
    return;
  }

  try {
    setStatus("Signing in", "");
    await signInWithGoogle();
  } catch (error) {
    setStatus("Sign-in failed", "error");
    renderEmptyChart(error.message || "Sign-in failed.");
  }
}

function updateAuthUi() {
  const label = progressEls.signInButton.querySelector("span:last-child");
  if (label) {
    label.textContent = progressState.user ? "Signed in" : "Sign in";
  }

  progressEls.signInButton.title = progressState.user
    ? `Signed in as ${progressState.user.email || "Google user"}`
    : "Sign in with Google";
}

function getReadyStatus() {
  return getFirestorePersistenceStatus() === "unavailable" ? "Online" : "Synced";
}

function populateExerciseSelect() {
  const strengthExercises = DEFAULT_EXERCISES.filter((exercise) => exercise.type !== "duration");
  progressEls.exerciseSelect.replaceChildren();

  strengthExercises.forEach((exercise) => {
    const option = document.createElement("option");
    option.value = exercise.name;
    option.textContent = exercise.name;
    progressEls.exerciseSelect.append(option);
  });
}

async function renderSelectedExerciseChart() {
  if (!window.Chart) {
    renderEmptyChart("Loading chart library...");
    return;
  }

  const selectedExercise = progressEls.exerciseSelect.value;
  if (!progressState.user) {
    renderEmptyChart("Sign in to load progress.");
    return;
  }

  const currentRun = progressState.loadingRun + 1;
  progressState.loadingRun = currentRun;
  setStatus("Loading", "");
  progressEls.chartMessage.textContent = `${selectedExercise}: loading`;

  try {
    const workouts = await getWorkoutsForExercise(progressState.user.uid, selectedExercise);
    if (currentRun !== progressState.loadingRun) {
      return;
    }

    progressState.chart = renderWorkoutProgressComboChart(progressEls.canvas, workouts, selectedExercise, progressState.chart);
    const processed = processWorkoutProgressData(workouts, selectedExercise);
    progressEls.chartMessage.textContent = processed.labels.length
      ? `${selectedExercise}: ${processed.labels.length} workout days`
      : `${selectedExercise}: no weighted sets found`;
    setStatus(getReadyStatus(), "ok");
  } catch (error) {
    renderEmptyChart(error.message || "Could not load progress.");
    setStatus("Sync error", "error");
  }
}

function processWorkoutProgressData(workouts, selectedExercise) {
  const cutoff = startOfDay(new Date());
  cutoff.setDate(cutoff.getDate() - (PROGRESS_LIMIT_DAYS - 1));

  const byDate = new Map();

  workouts
    .filter((workout) => workout.exerciseName === selectedExercise)
    .filter((workout) => !isDurationExerciseName(workout.exerciseName))
    .filter((workout) => workout.timestamp >= cutoff)
    .filter((workout) => workout.weight > 0 && workout.reps > 0)
    .forEach((workout) => {
      const key = dateKey(workout.timestamp);
      const e1rm = workout.weight * (1 + (workout.reps / 30));
      const volume = workout.reps * workout.weight;

      if (!byDate.has(key)) {
        byDate.set(key, {
          label: formatChartDate(workout.timestamp),
          sortDate: startOfDay(workout.timestamp),
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
    .sort((a, b) => a.sortDate - b.sortDate);

  return {
    labels: days.map((day) => day.label),
    e1rmData: days.map((day) => roundToOne(day.e1rm)),
    volumeData: days.map((day) => Math.round(day.volume))
  };
}

function renderWorkoutProgressComboChart(canvas, workouts, selectedExercise, existingChart = null) {
  const processed = processWorkoutProgressData(workouts, selectedExercise);

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
            color: CHART_TEXT_COLOR,
            boxWidth: 12,
            font: {
              weight: "bold"
            }
          }
        },
        tooltip: {
          backgroundColor: "#111922",
          borderColor: "#2a3846",
          borderWidth: 1,
          titleColor: "#f4f7f8",
          bodyColor: "#f4f7f8",
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
            color: CHART_TEXT_COLOR,
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
            text: "E1RM",
            color: CHART_TEXT_COLOR
          },
          ticks: {
            color: CHART_TEXT_COLOR,
            callback: (value) => `${value}`
          },
          grid: {
            color: CHART_GRID_COLOR
          }
        },
        y1: {
          type: "linear",
          display: true,
          position: "right",
          title: {
            display: true,
            text: "Volume",
            color: CHART_TEXT_COLOR
          },
          grid: {
            drawOnChartArea: false
          },
          ticks: {
            color: CHART_TEXT_COLOR,
            callback: (value) => `${value}`
          }
        }
      }
    }
  });
}

function renderEmptyChart(message = "") {
  progressEls.chartMessage.textContent = message;

  if (!window.Chart) {
    return;
  }

  progressState.chart = renderWorkoutProgressComboChart(progressEls.canvas, [], progressEls.exerciseSelect.value || "", progressState.chart);
}

function waitForChart(timeoutMs = 5000) {
  if (window.Chart) {
    return Promise.resolve();
  }

  progressEls.chartMessage.textContent = "Loading chart library...";
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timerId = window.setInterval(() => {
      if (window.Chart || Date.now() - startedAt >= timeoutMs) {
        window.clearInterval(timerId);
        resolve();
      }
    }, 100);
  });
}

function setStatus(message, tone) {
  progressEls.status.textContent = message;
  progressEls.status.classList.toggle("is-ok", tone === "ok");
  progressEls.status.classList.toggle("is-error", tone === "error");
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

function roundToOne(value) {
  return Math.round(value * 10) / 10;
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}
