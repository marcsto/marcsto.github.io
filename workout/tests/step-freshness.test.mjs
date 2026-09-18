import test from "node:test";
import assert from "node:assert/strict";
import { dailyStepsFromData, getStepFreshness, optionalTimestampToDate, SYNC_STALE_MS, SOURCE_STALE_MS } from "../step-freshness.js";

const now = new Date("2026-09-17T18:00:00Z");
const ago = (ms) => new Date(now - ms);
const hour = 3600000;
const row = (overrides = {}) => dailyStepsFromData({
  date: "2026-09-17", steps: 2400, sourceAppName: "RingConn",
  syncedAt: ago(60000), readAt: ago(120000), sourceLatestRecordAt: ago(hour),
  ...overrides
}, "2026-09-17");

test("a recent upload cannot hide RingConn records that are days old", () => {
  const status = getStepFreshness([row({ sourceLatestRecordAt: ago(72 * hour) })], now);
  assert.equal(status.tone, "warning");
  assert.match(status.message, /RingConn data may be stale \(3d ago\)/);
  assert.doesNotMatch(status.message, /sync overdue/);
});

test("offline queued uploads retain the original read age", () => {
  const status = getStepFreshness([row({ readAt: ago(48 * hour) })], now);
  assert.match(status.message, /sync overdue \(2d ago\)/);
});

test("fresh checks and source records show both ages", () => {
  const status = getStepFreshness([row()], now);
  assert.equal(status.tone, "ok");
  assert.match(status.message, /checked 2m ago.*RingConn record 1h ago/);
  assert.match(status.detail, /Last checked:.*Uploaded:.*step record ends:/);
});

test("thresholds are inclusive and warnings can occur together", () => {
  assert.equal(getStepFreshness([row({ readAt: ago(SYNC_STALE_MS - 1), sourceLatestRecordAt: ago(SOURCE_STALE_MS - 1) })], now).tone, "ok");
  const status = getStepFreshness([row({ readAt: ago(SYNC_STALE_MS), sourceLatestRecordAt: ago(SOURCE_STALE_MS) })], now);
  assert.match(status.message, /sync overdue/);
  assert.match(status.message, /data may be stale/);
});

test("legacy documents show unknown source freshness", () => {
  const legacy = dailyStepsFromData({ steps: 100, syncedAt: ago(hour) }, "2026-09-16");
  const status = getStepFreshness([legacy], now);
  assert.equal(status.tone, "warning");
  assert.match(status.message, /source freshness unknown/);
  assert.match(status.detail, /Update the Android companion/);
  assert.doesNotMatch(status.message, /no .* records/);
});

test("an explicit empty source differs from a legacy unknown source", () => {
  const status = getStepFreshness([row({ sourceLatestRecordAt: null })], now);
  assert.match(status.message, /no RingConn records in the last 30 days/);
});

test("missing or invalid timestamps never become fresh", () => {
  for (const value of [null, undefined, "", "invalid", { toDate: () => new Date(NaN) }, { toDate: () => { throw Error(); } }]) {
    assert.equal(optionalTimestampToDate(value), null);
  }
  assert.match(getStepFreshness([row({ syncedAt: null })], now).message, /freshness unknown/);
  assert.match(getStepFreshness([], now).message, /no synced data/);
});

test("Firestore timestamp objects and ISO timestamps deserialize", () => {
  assert.deepEqual(optionalTimestampToDate({ toDate: () => now }), now);
  assert.deepEqual(optionalTimestampToDate(now.toISOString()), now);
});

test("latest upload wins without mixing another source's timestamps", () => {
  const older = row({ syncedAt: ago(hour), sourceLatestRecordAt: ago(60000) });
  const newer = row({ sourceAppName: "Other source", sourceLatestRecordAt: ago(3 * 24 * hour) });
  for (const rows of [[older, newer], [newer, older]]) {
    assert.match(getStepFreshness(rows, now).message, /Other source data may be stale/);
  }
});

test("old calendar dates do not themselves imply stale source data", () => {
  assert.equal(getStepFreshness([row({ date: "2026-08-20" })], now).tone, "ok");
});

test("an open page becomes stale as time passes", () => {
  assert.equal(getStepFreshness([row()], now).tone, "ok");
  assert.match(getStepFreshness([row()], new Date(+now + 7 * hour)).message, /sync overdue/);
});

test("future phone timestamps are flagged rather than trusted", () => {
  assert.match(getStepFreshness([row({ readAt: new Date(+now + hour) })], now).message, /timestamp is in the future/);
});
