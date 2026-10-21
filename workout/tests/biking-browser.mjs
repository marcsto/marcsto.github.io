// Integration / visual check: no production Firebase reads or writes.
// NODE_PATH must include Playwright. Screenshots go to the OS temporary directory.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const { chromium } = createRequire(import.meta.url)("playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const artifacts = path.join(tmpdir(), "workout-biking-qa");
await mkdir(artifacts, { recursive: true });
const server = createServer(async (req, res) => {
  const relative = new URL(req.url, "http://localhost").pathname.replace(/^\/workout\//, "");
  const target = path.resolve(root, relative);
  if (!target.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const content = await readFile(target);
    res.setHeader("Content-Type", target.endsWith(".js") ? "text/javascript" : target.endsWith(".css") ? "text/css" : "text/html");
    res.end(content);
  } catch { res.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/workout/`;
const fakeFirebase = `
const date = new Date(); date.setDate(date.getDate() - 1); date.setHours(12, 0, 0, 0);
const key = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
const earlier = new Date(date); earlier.setDate(earlier.getDate()-3);
let rows = [
 {id:'photo', exerciseName:'Biking', reps:28, weight:0, timestamp:date, workoutDate:key(date), cycling:{distanceMiles:5.51,calories:179,caloriesEstimated:true,avgCadenceRpm:59,avgPowerWatts:63,avgResistance:13,maxResistance:15,avgInclinePercent:0,maxInclinePercent:0},source:{type:'photo',device:'NordicTrack / iFIT'}},
 {id:'old', exerciseName:'Biking', reps:30, weight:0, timestamp:earlier},
 ...['Benchpress','Squats','Rows','Lunges'].map((name,i)=>({id:'s'+i,exerciseName:name,reps:8,weight:100,timestamp:date}))
];
let publish;
export const getFirestorePersistenceStatus = () => 'enabled';
export const watchAuth = cb => { cb({uid:'fixture'}); return ()=>{}; };
export const signInWithGoogle = async () => {};
export const subscribeWorkouts = async (_, cb) => { publish=cb; cb(rows); return ()=>{}; };
export const subscribeDailySteps = async (_, __, cb) => {cb([{date:key(date),steps:8500}],{fromCache:false});return ()=>{};};
export const getWorkoutsForExercise = async (_, name) => rows.filter(r=>r.exerciseName===name);
export const addWorkoutSet = async (_, row) => { window.savedWorkout=row; rows.push({...row,id:'saved'}); publish?.(rows); };
export const deleteWorkoutSet = async () => {};
`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext();
  await context.route("**/workout/firebase.js*", (route) => route.fulfill({ contentType: "text/javascript", body: fakeFirebase }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [390, 980, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${base}calendar.html`);
    await page.locator(".bike-line").first().waitFor();
    assert.equal(await page.locator(".calendar-cell").count(), 28);
    const card = page.locator(".bike-line").filter({ hasText: "5.51 mi" });
    assert.match(await card.innerText(), /63 W/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(artifacts, `calendar-${width}.png`), fullPage: true });
    await card.click();
    assert.equal(await page.locator("#bikeDetailDialog").isVisible(), true);
    assert.match(await page.locator("#bikeDetailContent").innerText(), /179 kcal/);
    assert.match(await page.locator("#bikeDetailContent").innerText(), /11.81 mph/);
    await page.screenshot({ path: path.join(artifacts, `details-${width}.png`) });
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#bikeDetailDialog").isVisible(), false);
    await page.locator(".bike-line").filter({ hasText: "30 min" }).click();
    assert.match(await page.locator("#bikeDetailContent").innerText(), /Not recorded/);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}progress.html?exercise=Biking`);
  await page.waitForFunction(() => document.querySelector("#chartMessage")?.textContent.includes("latest 63 W"));
  assert.equal(await page.locator("#bikeMetricControl").isVisible(), true);
  await page.screenshot({ path: path.join(artifacts, "progress-phone.png") });
  await page.locator("#bikeMetricSelect").selectOption("avgInclinePercent");
  await page.waitForFunction(() => document.querySelector("#chartMessage")?.textContent.includes("latest 0 %"));
  await page.locator("#bikeMetricSelect").selectOption("durationMinutes");
  await page.waitForFunction(() => document.querySelector("#chartMessage")?.textContent.includes("2 rides"));
  await page.locator("#exerciseSelect").selectOption("Benchpress");
  await page.waitForFunction(() => document.querySelector("#chartMessage")?.textContent.includes("workout days"));
  assert.equal(await page.locator("#bikeMetricControl").isVisible(), false);
  await page.goto(`${base}index.html`);
  await page.getByRole("button", { name: "Open Biking", exact: true }).click();
  assert.equal(await page.locator("#repsSlider").inputValue(), "28");
  await page.getByText("Ride metrics (optional)", { exact: true }).click();
  await page.getByLabel("Distance (mi)", { exact: true }).fill("6.25");
  await page.getByLabel("Average power (W)", { exact: true }).fill("70");
  await page.getByLabel("Average incline (%)", { exact: true }).fill("0");
  await page.screenshot({ path: path.join(artifacts, "entry-phone.png"), fullPage: true });
  await page.locator("#saveButton").click();
  await page.waitForFunction(() => window.savedWorkout);
  const saved = await page.evaluate(() => window.savedWorkout);
  assert.equal(saved.reps, 28);
  assert.deepEqual(saved.cycling, { distanceMiles: 6.25, avgPowerWatts: 70, avgInclinePercent: 0 });
  assert.equal(await page.getByLabel("Distance (mi)", { exact: true }).inputValue(), "");
  await page.locator("#backButton").click();
  await page.getByRole("button", { name: "Open Benchpress", exact: true }).click();
  assert.equal(await page.locator(".bike-entry-fields").isVisible(), false);
  assert.deepEqual(errors, []);
  console.log(`Browser checks passed; screenshots: ${artifacts}`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
