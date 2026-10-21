// Shared schema for manual entries and photo transcriptions. Missing is not zero.
export const BIKE_METRICS = [
  { key: "distanceMiles", label: "Distance", unit: "mi", step: "0.01", min: 0 },
  { key: "calories", label: "Calories", unit: "kcal", step: "1", min: 0 },
  { key: "avgCadenceRpm", label: "Average cadence", unit: "rpm", step: "1", min: 0 },
  { key: "avgPowerWatts", label: "Average power", unit: "W", step: "1", min: 0 },
  { key: "avgResistance", label: "Average resistance", unit: "level", step: "0.1", min: 0 },
  { key: "maxResistance", label: "Max resistance", unit: "level", step: "0.1", min: 0 },
  { key: "avgInclinePercent", label: "Average incline", unit: "%", step: "0.1" },
  { key: "maxInclinePercent", label: "Max incline", unit: "%", step: "0.1" }
];

export const BIKE_PROGRESS_METRICS = [
  { key: "durationMinutes", label: "Duration", unit: "min" },
  ...BIKE_METRICS,
  { key: "avgSpeedMph", label: "Average speed (calculated)", unit: "mph" }
];

export function isBiking(name) {
  return String(name).toLowerCase() === "biking";
}

export function normalizeCycling(input, { strict = false } = {}) {
  const cycling = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    if (strict && input != null) throw new Error("Ride metrics must be an object.");
    return cycling;
  }
  for (const { key, label, min } of BIKE_METRICS) {
    const value = input[key];
    if (value == null || value === "") continue;
    const number = typeof value === "number" ? value : NaN;
    if (!Number.isFinite(number) || (min != null && number < min)) {
      if (strict) throw new Error(`${label} must be a valid${min === 0 ? " non-negative" : ""} number.`);
      continue;
    }
    cycling[key] = number;
  }
  if (typeof input.caloriesEstimated === "boolean") cycling.caloriesEstimated = input.caloriesEstimated;
  for (const [avg, max] of [["avgResistance", "maxResistance"], ["avgInclinePercent", "maxInclinePercent"]]) {
    if (strict && cycling[avg] != null && cycling[max] != null && cycling[avg] > cycling[max]) {
      throw new Error("A maximum cannot be lower than its average.");
    }
  }
  return cycling;
}

export function bikeNumber(value) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

export function bikeMetricValue(workout, key) {
  if (key === "durationMinutes") return workout.reps > 0 ? workout.reps : null;
  const metrics = normalizeCycling(workout.cycling);
  if (key === "avgSpeedMph") {
    return metrics.distanceMiles != null && workout.reps > 0 ? metrics.distanceMiles * 60 / workout.reps : null;
  }
  return metrics[key] ?? null;
}

export function bikeSummaryLines(workout) {
  const m = normalizeCycling(workout.cycling);
  return [
    `${bikeNumber(workout.reps)} min`,
    m.distanceMiles != null ? `${bikeNumber(m.distanceMiles)} mi` : null,
    m.avgPowerWatts != null ? `${bikeNumber(m.avgPowerWatts)} W` : null,
    m.avgCadenceRpm != null ? `${bikeNumber(m.avgCadenceRpm)} rpm` : null
  ].filter(Boolean);
}

export function bikeDetailMetrics(workout) {
  const m = normalizeCycling(workout.cycling);
  const entries = [{ label: "Duration", value: `${bikeNumber(workout.reps)} min` }];
  for (const { key, label, unit } of BIKE_METRICS) {
    entries.push({
      label: key === "calories" && m.caloriesEstimated ? "Calories (estimated)" : label,
      value: m[key] == null ? "Not recorded" : unit === "level" ? bikeNumber(m[key]) : `${bikeNumber(m[key])}${unit === "%" ? "" : " "}${unit}`
    });
  }
  const speed = bikeMetricValue(workout, "avgSpeedMph");
  if (speed != null) entries.push({ label: "Average speed (calculated)", value: `${bikeNumber(speed)} mph` });
  const order = ["Duration", "Distance", "Average power", "Average cadence", m.caloriesEstimated ? "Calories (estimated)" : "Calories", "Average speed (calculated)", "Average resistance", "Max resistance", "Average incline", "Max incline"];
  return entries.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
}

export function workoutDateKey(workout) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(workout.workoutDate || "")) return workout.workoutDate;
  const date = workout.timestamp;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function bikeProgressRows(workouts, metricKey, startDate, endDate) {
  return workouts.filter((row) => isBiking(row.exerciseName))
    .filter((row) => workoutDateKey(row) >= startDate && workoutDateKey(row) <= endDate)
    .sort((a, b) => workoutDateKey(a).localeCompare(workoutDateKey(b)) || a.timestamp - b.timestamp)
    .map((row) => ({ date: workoutDateKey(row), value: bikeMetricValue(row, metricKey), workout: row }));
}
