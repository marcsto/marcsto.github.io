const HOUR_MS = 60 * 60 * 1000;
export const SYNC_STALE_MS = 6 * HOUR_MS;
export const SOURCE_STALE_MS = 24 * HOUR_MS;

// Missing timestamps must stay unknown, never default to the current time.
export function optionalTimestampToDate(value) {
  if (value == null || value === "") return null;
  try {
    const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  } catch {
    return null;
  }
}

export function dailyStepsFromData(data, id) {
  return {
    date: data.date || id,
    steps: Math.max(0, Math.round(Number(data.steps) || 0)),
    sourceAppName: data.sourceAppName || "",
    syncedAt: optionalTimestampToDate(data.syncedAt),
    readAt: optionalTimestampToDate(data.readAt),
    sourceLatestRecordAt: optionalTimestampToDate(data.sourceLatestRecordAt),
    hasSourceTimestamp: Object.hasOwn(data, "sourceLatestRecordAt")
  };
}

export function getStepFreshness(rows, now = new Date()) {
  // Use one upload's metadata together; never combine timestamps from different sources.
  const latest = rows.reduce((best, row) => {
    const time = row.syncedAt?.getTime();
    return Number.isFinite(time) && (!best || time > best.syncedAt.getTime()) ? row : best;
  }, null);
  if (!latest) {
    return {
      tone: "warning",
      message: rows.length ? "Steps: freshness unknown" : "Steps: no synced data",
      detail: "Open Workout Step Sync on your phone to sync steps and enable automatic updates."
    };
  }

  const source = latest.sourceAppName || "Step source";
  const checkedAt = latest.readAt || latest.syncedAt;
  const sourceAt = latest.sourceLatestRecordAt;
  const syncStale = now - checkedAt >= SYNC_STALE_MS;
  const sourceStale = sourceAt && now - sourceAt >= SOURCE_STALE_MS;
  const invalidClock = [checkedAt, latest.syncedAt, sourceAt]
    .some((date) => date && date - now > 5 * 60 * 1000);
  const issues = [];
  if (invalidClock) issues.push("timestamp is in the future");
  if (syncStale) issues.push(`sync overdue (${relativeAge(checkedAt, now)})`);
  if (sourceStale) issues.push(`${source} data may be stale (${relativeAge(sourceAt, now)})`);
  if (!sourceAt) issues.push(latest.hasSourceTimestamp
    ? `no ${source} records in the last 30 days`
    : "source freshness unknown");

  const timestamps = [
    `Last checked: ${checkedAt.toLocaleString()}.`,
    `Uploaded: ${latest.syncedAt.toLocaleString()}.`,
    sourceAt ? `Newest ${source} step record ends: ${sourceAt.toLocaleString()}.` : ""
  ].filter(Boolean).join(" ");
  const advice = [
    syncStale ? "Open Workout Step Sync and check automatic sync and background access." : "",
    sourceStale || (latest.hasSourceTimestamp && !sourceAt)
      ? `Open ${source} and let it sync to Health Connect; the next automatic upload will refresh the last 30 days.` : "",
    !latest.hasSourceTimestamp ? "Update the Android companion and run a sync to report source freshness." : "",
    invalidClock ? "Check the phone's date and time." : ""
  ].filter(Boolean).join(" ");
  return {
    tone: issues.length ? "warning" : "ok",
    message: issues.length ? `Steps: ${issues.join("; ")}`
      : `Steps checked ${relativeAge(checkedAt, now)} · ${source} record ${relativeAge(sourceAt, now)}`,
    detail: `${timestamps} ${advice} Freshness warnings start after 6 hours without a check or 24 hours without a recent source record. A recent record does not guarantee every day's total is complete.`.trim()
  };
}

function relativeAge(date, now) {
  const minutes = Math.max(0, Math.floor((now - date) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / (24 * 60))}d ago`;
}
