import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCycling, bikeSummaryLines, bikeDetailMetrics, bikeMetricValue, bikeProgressRows, workoutDateKey } from "../biking.js";
import { prepareBikeImport } from "../bike-import.js";

const cycling = { distanceMiles: 5.51, calories: 179, caloriesEstimated: true, avgCadenceRpm: 59, avgPowerWatts: 63, avgResistance: 13, maxResistance: 15, avgInclinePercent: 0, maxInclinePercent: 0 };
const ride = { exerciseName: "Biking", reps: 28, cycling, workoutDate: "2026-10-20", timestamp: new Date("2026-10-20T12:00:00Z") };
const input = () => ({ workoutDate: ride.workoutDate, durationMinutes: ride.reps, cycling: { ...cycling }, source: { device: "NordicTrack / iFIT", photoSha256: "a".repeat(64) } });

test("photo metrics preserve precision, real zeros, estimated calories, and calculated speed", () => {
  assert.deepEqual(normalizeCycling(cycling), cycling);
  assert.deepEqual(bikeSummaryLines(ride), ["28 min", "5.51 mi", "63 W", "59 rpm"]);
  const details = bikeDetailMetrics(ride);
  assert.equal(details.find((m) => m.label === "Average incline").value, "0%");
  assert.equal(details.find((m) => m.label === "Calories (estimated)").value, "179 kcal");
  assert.equal(details.find((m) => m.label === "Average speed (calculated)").value, "11.81 mph");
});

test("legacy rides and absent metrics do not invent zero readings", () => {
  const legacy = { ...ride, cycling: undefined };
  assert.deepEqual(bikeSummaryLines(legacy), ["28 min"]);
  assert.equal(bikeMetricValue(legacy, "avgPowerWatts"), null);
  assert.equal(bikeMetricValue(legacy, "durationMinutes"), 28);
  assert.equal(bikeDetailMetrics(legacy).find((m) => m.label === "Average incline").value, "Not recorded");
  assert.deepEqual(normalizeCycling({ distanceMiles: null, calories: "", avgPowerWatts: NaN, avgCadenceRpm: false }), {});
});

test("progress retains individual rides, missing values, date boundaries, and zero incline", () => {
  const second = { ...ride, reps: 60, cycling: { avgPowerWatts: 120 }, timestamp: new Date("2026-10-20T15:00:00Z") };
  const legacy = { ...ride, cycling: {}, workoutDate: "2026-10-19" };
  const rows = bikeProgressRows([second, ride, legacy, { ...ride, workoutDate: "2026-11-01" }, { ...ride, exerciseName: "VR" }], "avgPowerWatts", "2026-10-01", "2026-10-21");
  assert.deepEqual(rows.map((r) => r.value), [null, 63, 120]);
  assert.equal(bikeProgressRows([ride], "avgInclinePercent", "2026-10-01", "2026-10-21")[0].value, 0);
  assert.equal(workoutDateKey({ ...ride, timestamp: new Date("2026-10-21T01:00:00Z") }), "2026-10-20");
});

test("imports are stable per source/date and retain backward-compatible duration", () => {
  const prepared = prepareBikeImport(input());
  assert.equal(prepared.id, prepareBikeImport(input()).id);
  assert.equal(prepared.workout.reps, 28);
  assert.equal(prepared.workout.workoutDate, "2026-10-20");
  assert.deepEqual(prepared.workout.cycling, cycling);
  assert.equal(prepared.workout.source.type, "photo");
});

test("reject invalid readings and ambiguous or mistyped imports before a database write", () => {
  for (const changed of [
    { workoutDate: "2026-02-30" }, { workoutDate: "10/20/2026" },
    { durationMinutes: 0 }, { durationMinutes: "28" },
    { cycling: { distanceMiles: -1 } }, { cycling: { avgPowerWatts: "63" } },
    { cycling: { avgResistance: 15, maxResistance: 13 } },
    { cycling: { calories: 179 } }, { cycling: { distanceKm: 5.51 } },
    { source: { photoSha256: "wrong" } }
  ]) assert.throws(() => prepareBikeImport({ ...input(), ...changed }));
  assert.equal(normalizeCycling({ avgInclinePercent: -1 }, { strict: true }).avgInclinePercent, -1);
});
