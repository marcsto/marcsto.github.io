// Run from the repository root; defaults to a read-only preview.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { prepareBikeImport } from "../bike-import.js";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
if (!args.includes("--file")) throw new Error("Usage: node workout/scripts/import-bike.mjs --file <private.json> [--apply] [--update-id <existing-id>]");
const prepared = prepareBikeImport(JSON.parse(await readFile(option("--file"), "utf8")));
const apply = args.includes("--apply");
const newRide = args.includes("--new-ride");
const updateId = args.includes("--update-id") ? option("--update-id") : null;
if (updateId && (updateId.includes("/") || updateId.startsWith("--"))) throw new Error("Invalid workout document ID.");

let browser;
for (const endpoint of [process.env.WORKOUT_CDP_URL, "http://127.0.0.1:9222", "http://[::1]:9222"].filter(Boolean)) {
  try { browser = await chromium.connectOverCDP(endpoint); break; } catch { /* Try the other loopback binding. */ }
}
if (!browser) throw new Error("Start the logged-in Chrome profile with remote debugging first.");
let page;
try {
  const context = browser.contexts()[0];
  page = await context.newPage();
  // Firestore keeps a live connection; waiting for network idle can never finish.
  await page.goto("https://marc.ai/workout/calendar.html", { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(async ({ prepared, apply, updateId, newRide }) => {
    const appModule = await import("https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js");
    const { getAuth } = await import("https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js");
    const { getFirestore, collection, getDocsFromServer, doc, runTransaction, Timestamp, getDocFromServer } = await import("https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js");
    const app = appModule.getApp();
    const auth = getAuth(app);
    await auth.authStateReady();
    if (!auth.currentUser) throw new Error("Sign in to the workout tracker in this Chrome profile before importing.");
    const db = getFirestore(app);
    const workouts = collection(db, "users", auth.currentUser.uid, "workouts");
    const snapshot = await getDocsFromServer(workouts);
    const dateOf = (row) => row.workoutDate || new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(row.timestamp.toDate());
    const sameDay = snapshot.docs.filter((d) => d.data().exerciseName === "Biking" && dateOf(d.data()) === prepared.workout.workoutDate);
    const previous = snapshot.docs.find((d) => d.id === prepared.id || (d.data().source?.photoSha256 === prepared.workout.source.photoSha256 && dateOf(d.data()) === prepared.workout.workoutDate));
    if (previous) return { status: "already-imported", id: previous.id, workoutDate: dateOf(previous.data()) };
    const candidates = sameDay.map((d) => ({ id: d.id, minutes: d.data().reps, cycling: d.data().cycling || null }));
    if (!apply) return { status: "preview", workout: prepared.workout, existingRidesOnDate: candidates };
    if (!updateId && candidates.length && !newRide) throw new Error("Existing biking entries on this date. Review the preview and use --update-id to enrich the matching ride, or --new-ride only for a distinct session.");
    if (updateId && !sameDay.some((d) => d.id === updateId)) throw new Error("The selected workout is not a biking entry on this date.");
    const target = doc(workouts, updateId || prepared.id);
    const outcome = await runTransaction(db, async (transaction) => {
      const current = await transaction.get(target);
      if (current.exists() && current.data().source?.photoSha256 === prepared.workout.source.photoSha256) return "already-imported";
      if (current.exists() && !updateId) throw new Error("Import ID already exists with different data.");
      if (updateId && (!current.exists() || current.data().exerciseName !== "Biking" || dateOf(current.data()) !== prepared.workout.workoutDate)) throw new Error("Selected workout changed; preview it again.");
      if (updateId && (current.data().source || Object.keys(current.data().cycling || {}).length)) throw new Error("Selected ride already contains metrics. Review it before replacing any data.");
      const data = { ...prepared.workout, timestamp: current.exists() ? current.data().timestamp : Timestamp.fromDate(new Date(prepared.workout.timestamp)) };
      transaction.set(target, data, { merge: true });
      return updateId ? "updated" : "created";
    });
    const saved = (await getDocFromServer(target)).data();
    if (saved.reps !== prepared.workout.reps || saved.workoutDate !== prepared.workout.workoutDate || Object.entries(prepared.workout.cycling).some(([key, value]) => saved.cycling?.[key] !== value)) throw new Error("Server readback did not match the import.");
    return { status: outcome, verifiedFromServer: true, id: target.id, workoutDate: saved.workoutDate, minutes: saved.reps, cycling: saved.cycling };
  }, { prepared, apply, updateId, newRide });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await page?.close();
  await browser.close();
}
