import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import * as config from "../config.js";
import { getStepFreshness } from "../step-freshness.js";

const source = (await readFile(new URL("../calendar.js", import.meta.url), "utf8"))
  .replace(/^import[\s\S]*?from ".*?";\r?\n/gm, "");
const html = await readFile(new URL("../calendar.html", import.meta.url), "utf8");

// Exercise startup with the actual calendar handlers and both deployed HTML versions.
function documentFromMarkup(markup) {
  function element(tag = "div") {
    const node = {
      tag, id: "", className: "", children: [], dataset: {}, open: false,
      style: { setProperty() {} },
      classList: { toggle() {} },
      addEventListener() {}, setAttribute() {},
      append(...children) { children.forEach((child) => { child.parent = this; this.children.push(child); }); },
      replaceChildren(...children) { this.children = []; this.append(...children); },
      remove() { this.parent.children = this.parent.children.filter((child) => child !== this); },
      querySelectorAll(selector) {
        const matches = (child) => selector === "button.steps-line"
          && child.tag === "button" && child.className === "steps-line";
        return this.children.flatMap((child) => [
          ...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)
        ]);
      },
      querySelector(selector) {
        if (selector === ".material-symbols-rounded") return this.children.find((child) => child.className === "material-symbols-rounded");
        return null;
      },
      close() { this.open = false; }, showModal() { this.open = true; }
    };
    return node;
  }
  const body = element("body");
  for (const match of markup.matchAll(/<([a-z0-9]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
    const node = element(match[1]);
    node.id = match[2];
    body.append(node);
  }
  const find = (node, id) => node.id === id ? node : node.children.map((child) => find(child, id)).find(Boolean);
  return { body, createElement: element, getElementById: (id) => find(body, id) || null, addEventListener() {} };
}

function calendar(markup) {
  const document = documentFromMarkup(markup);
  let authHandler;
  const subscriptions = [];
  const context = vm.createContext({
    ...config, getStepFreshness, document,
    window: { setInterval() {} },
    watchAuth: (callback) => { authHandler = callback; },
    getFirestorePersistenceStatus: () => "enabled",
    subscribeWorkouts: async (_uid, callback) => {
      subscriptions.push("workouts");
      callback([{ exerciseName: "Squats", reps: 10, weight: 60, timestamp: new Date() }]);
      return () => {};
    },
    subscribeDailySteps: async (_uid, _start, callback) => {
      subscriptions.push("steps"); callback([], { fromCache: false }); return () => {};
    }
  });
  vm.runInContext(`${source}\nthis.start = initCalendar; this.details = renderStepDetails;`, context);
  return { document, context, subscriptions, authenticate: (user) => authHandler(user) };
}

for (const [name, markup] of [
  ["current HTML", html],
  ["cached HTML without step dialog", html.replace(/<dialog[\s\S]*?<\/dialog>/, "")],
  ["cached HTML with the old freshness banner", html.replace(/<dialog[\s\S]*?<\/dialog>/, '<details id="stepsSync"></details>')]
]) {
  test(`calendar starts and loads signed-in data with ${name}`, async () => {
    const app = calendar(markup);
    app.context.start();
    assert.equal(app.document.getElementById("calendarGrid").children.length, 28);
    await app.authenticate({ uid: "test" });
    assert.deepEqual(app.subscriptions, ["workouts", "steps"]);
    assert.equal(app.document.getElementById("calendarStatus").textContent, "Synced");
    assert.equal(app.document.getElementById("stepsSync"), null);
    const dialog = app.document.getElementById("stepsDetailDialog");
    assert.ok(dialog);
    dialog.dataset.date = "2026-09-18";
    app.context.details();
    dialog.showModal();
    assert.match(app.document.getElementById("stepsDetailStatus").textContent, /no synced data/);
    await app.authenticate(null);
    assert.equal(dialog.open, false);
    assert.equal(app.document.getElementById("calendarStatus").textContent, "Sign in");
  });
}
