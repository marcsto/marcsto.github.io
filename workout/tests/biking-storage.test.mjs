import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { isBiking, normalizeCycling } from "../biking.js";

const source = (await readFile(new URL("../firebase.js", import.meta.url), "utf8"))
  .replace(/^import[\s\S]*?from ".*?";\r?\n/gm, "")
  .replace(/^export /gm, "");

function storage() {
  let saved;
  const context = vm.createContext({
    Date, console, isBiking, normalizeCycling,
    initializeApp: () => ({}), getAuth: () => ({}), getFirestore: () => ({}),
    GoogleAuthProvider: class {}, browserLocalPersistence: {},
    setPersistence: async () => {}, enableIndexedDbPersistence: async () => {},
    collection: (_db, ...parts) => parts.join("/"),
    Timestamp: { fromDate: (date) => ({ toDate: () => date }) },
    addDoc: async (path, data) => { saved = { path, data }; return { id: "saved" }; }
  });
  vm.runInContext(`${source}\nthis.api = { addWorkoutSet, workoutFromDocument };`, context);
  return { api: context.api, saved: () => saved };
}

test("Firestore writer and reader round-trip optional biking metrics without losing zero or precision", async () => {
  const db = storage();
  const cycling = { distanceMiles: 5.51, calories: 179, caloriesEstimated: true, avgPowerWatts: 63, avgCadenceRpm: 59, avgResistance: 13, maxResistance: 15, avgInclinePercent: 0, maxInclinePercent: 0 };
  const timestamp = new Date("2026-10-20T12:00:00Z");
  await db.api.addWorkoutSet("test-user", { exerciseName: "Biking", reps: 28, weight: 0, timestamp, cycling });
  const saved = db.saved();
  assert.equal(saved.path, "users/test-user/workouts");
  const loaded = db.api.workoutFromDocument({ id: "saved", data: () => saved.data });
  assert.deepEqual(loaded.cycling, cycling);
  assert.equal(loaded.reps, 28);
  assert.equal(loaded.timestamp, timestamp);
});

test("old duration and strength documents retain their meanings; imported date and source survive reads", async () => {
  const db = storage();
  await db.api.addWorkoutSet("test-user", { exerciseName: "Benchpress", reps: 8, weight: 95, cycling: { avgPowerWatts: 63 } });
  assert.equal(db.saved().data.cycling, undefined);
  const old = db.api.workoutFromDocument({ id: "legacy", data: () => ({ exerciseName: "Biking", reps: 30 }) });
  assert.deepEqual(old.cycling, {});
  assert.equal(old.reps, 30);
  const loaded = db.api.workoutFromDocument({ id: "photo", data: () => ({ exerciseName: "Biking", reps: 28, workoutDate: "2026-10-20", source: { type: "photo" } }) });
  assert.equal(loaded.workoutDate, "2026-10-20");
  assert.equal(loaded.source.type, "photo");
});

test("invalid readings never reach the Firestore writer", async () => {
  const db = storage();
  await assert.rejects(db.api.addWorkoutSet("test-user", { exerciseName: "Biking", reps: 28, cycling: { distanceMiles: -5 } }), /non-negative/);
  assert.equal(db.saved(), undefined);
});
