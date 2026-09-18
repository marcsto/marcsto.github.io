import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import * as config from "../config.js";

// Run the actual form handlers with an in-memory DOM and Firestore subscription.
const source = (await readFile(new URL("../app.js", import.meta.url), "utf8"))
  .replace(/^import[\s\S]*?from ".*?";\r?\n/gm, "");

function element() {
  const listeners = {};
  return {
    value: "", max: "500", disabled: false,
    classList: { toggle() {} }, style: { setProperty() {} },
    parentElement: { classList: { toggle() {} } },
    addEventListener(type, listener) { (listeners[type] ||= []).push(listener); },
    fire(type) { for (const listener of listeners[type] || []) listener(); },
    setAttribute() {}, replaceChildren() {}, append() {}, querySelector() { return null; }
  };
}

function workout(dayOffset, hour, reps, weight, exerciseName = "Benchpress") {
  const timestamp = new Date();
  timestamp.setDate(timestamp.getDate() + dayOffset);
  timestamp.setHours(hour, 0, 0, 0);
  return { id: `${exerciseName}:${timestamp}`, exerciseName, timestamp, reps, weight };
}

async function form(history = []) {
  const elements = new Map();
  const saved = [];
  let publish;
  let rows = history;
  const context = vm.createContext({
    ...config, Date,
    document: {
      addEventListener() {},
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
      },
      createElement: element
    },
    window: { clearTimeout() {}, setTimeout() { return 1; } },
    getFirestorePersistenceStatus: () => "enabled",
    subscribeWorkouts: async (_uid, callback) => { publish = callback; callback(rows); return () => {}; },
    addWorkoutSet: async (_uid, row) => {
      saved.push(row);
      rows = [...rows, { ...row, id: `saved-${saved.length}` }];
      publish(rows);
    }
  });
  vm.runInContext(`${source}\nthis.app = { cacheElements, bindEvents, handleAuthState, openExercise, showHome, handleSave, handleLogDateChange, resetLogDate };`, context);
  const app = context.app;
  app.cacheElements();
  app.bindEvents();
  await app.handleAuthState({ uid: "test" });
  const open = (name = "Benchpress") => app.openExercise(config.DEFAULT_EXERCISES.find((exercise) => exercise.name === name));
  const values = () => [Number(elements.get("repsSlider").value), Number(elements.get("weightSlider").value)];
  const edit = (id, value) => { elements.get(id).value = String(value); elements.get(id).fire("input"); };
  const save = async () => { elements.get("saveButton").disabled = false; await app.handleSave(); };
  const sync = (nextRows = rows) => { rows = nextRows; publish(rows); };
  return { app, open, values, edit, save, sync, saved, elements };
}

const history = () => [
  workout(-3, 12, 4, 200),
  workout(-1, 12, 12, 45),
  workout(-1, 13, 8, 95),
  workout(-1, 14, 5, 135),
  workout(-1, 15, 3, 250, "Deadlift")
];

test("prefills each set from the last exercise day in chronological order; extra sets retain edits", async () => {
  const ui = await form(history().reverse());
  ui.open();
  assert.deepEqual(ui.values(), [12, 45]);
  assert.equal(ui.saved.length, 0);
  ui.edit("weightSlider", 50);
  ui.edit("repsSlider", 10);
  await ui.save();
  assert.equal(ui.saved[0].weight, 50);
  assert.equal(ui.saved[0].reps, 10);
  assert.deepEqual(ui.values(), [8, 95]);
  ui.sync();
  assert.deepEqual(ui.values(), [8, 95]);
  await ui.save();
  assert.deepEqual(ui.values(), [5, 135]);
  ui.edit("weightSlider", 140);
  ui.edit("repsSlider", 6);
  await ui.save();
  assert.deepEqual(ui.values(), [6, 140]);
  await ui.save();
  assert.deepEqual(ui.values(), [6, 140]);
});

test("resumes the correct set after reopening or reloading with sets already saved today", async () => {
  const ui = await form([...history(), workout(0, 1, 10, 50)]);
  ui.open();
  assert.deepEqual(ui.values(), [8, 95]);
  ui.app.showHome();
  ui.open("Deadlift");
  ui.open();
  assert.deepEqual(ui.values(), [8, 95]);
});

test("late history prefills an untouched form but never overwrites slider or button edits", async () => {
  const ui = await form();
  ui.open();
  assert.deepEqual(ui.values(), [8, 0]);
  ui.sync(history());
  assert.deepEqual(ui.values(), [12, 45]);

  const edited = await form();
  edited.open();
  edited.edit("weightSlider", 70);
  edited.sync(history());
  assert.deepEqual(edited.values(), [8, 70]);

  const clicked = await form();
  clicked.open();
  clicked.elements.get("repsUp").fire("click");
  clicked.sync(history());
  assert.deepEqual(clicked.values(), [9, 0]);
});

test("backdated entries use the day before the selected date and count its existing sets", async () => {
  const older = workout(-5, 12, 15, 40);
  const ui = await form([...history(), older, workout(-5, 13, 10, 80)]);
  ui.open();
  const selectedDate = workout(-3, 12, 1, 0).timestamp;
  ui.elements.get("logDateInput").value = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`;
  ui.app.handleLogDateChange();
  assert.deepEqual(ui.values(), [10, 80]);
  ui.app.resetLogDate();
  assert.deepEqual(ui.values(), [12, 45]);
});

test("no previous session keeps existing defaults and duration logging keeps its current behavior", async () => {
  const ui = await form([workout(0, 1, 9, 60), workout(-1, 10, 20, 0, "Biking"), workout(-1, 11, 45, 0, "Biking")]);
  ui.open();
  assert.deepEqual(ui.values(), [9, 60]);
  await ui.save();
  assert.deepEqual(ui.values(), [9, 60]);
  ui.open("Biking");
  assert.equal(ui.values()[0], 45);
  await ui.save();
  assert.equal(ui.values()[0], 45);
  assert.equal(ui.saved.at(-1).weight, 0);
});

test("previous sets use local calendar days, including sets either side of midnight", async () => {
  const ui = await form([workout(-2, 23, 20, 30), workout(-1, 0, 12, 45), workout(-1, 23, 8, 95)]);
  ui.open();
  assert.deepEqual(ui.values(), [12, 45]);
  await ui.save();
  assert.deepEqual(ui.values(), [8, 95]);
});
