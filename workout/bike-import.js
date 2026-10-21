import { BIKE_METRICS, normalizeCycling } from "./biking.js";

// Validate outside the browser before touching Firestore.
export function prepareBikeImport(input) {
  const date = input.workoutDate;
  const anchor = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || Number.isNaN(anchor.getTime()) || anchor.toISOString().slice(0, 10) !== date) {
    throw new Error("workoutDate must be a real calendar date (YYYY-MM-DD).");
  }
  if (typeof input.durationMinutes !== "number" || !Number.isFinite(input.durationMinutes) || input.durationMinutes <= 0) {
    throw new Error("durationMinutes must be a positive number.");
  }
  const hash = input.source?.photoSha256;
  if (!/^[a-f0-9]{64}$/.test(hash || "")) throw new Error("source.photoSha256 must be the SHA-256 of the original photo.");
  const allowed = new Set([...BIKE_METRICS.map((metric) => metric.key), "caloriesEstimated"]);
  for (const key of Object.keys(input.cycling || {})) {
    if (!allowed.has(key)) throw new Error(`Unknown cycling metric: ${key}`);
  }
  const cycling = normalizeCycling(input.cycling, { strict: true });
  if (cycling.calories != null && typeof input.cycling.caloriesEstimated !== "boolean") {
    throw new Error("Specify whether the photo's calories are estimated.");
  }
  return {
    id: `bike-photo-${date}-${hash}`,
    workout: {
      exerciseName: "Biking", reps: input.durationMinutes, weight: 0,
      workoutDate: date, cycling,
      source: {
        type: "photo", photoSha256: hash,
        ...(typeof input.source.device === "string" ? { device: input.source.device.slice(0, 120) } : {})
      },
      // Sorting anchor only. The photo has no time; workoutDate is authoritative.
      timestamp: anchor.toISOString()
    }
  };
}
