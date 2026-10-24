# Workout tracker

Static pages on https://marc.ai/workout/ with Firebase Auth and Firestore. Workouts live in `users/{signedInUserId}/workouts/{id}`. Never put personal workout exports, source photos, or credentials in this public repository.

## Biking metrics and photo imports

`reps` remains duration in minutes for duration exercises, including biking, for compatibility with old entries. Optional numeric readings live in `cycling`; names encode their units. Missing readings must be omitted, not converted to zero. Calories retain their estimated flag. Resistance is a machine level, so compare it on the same equipment. Average speed is calculated from distance and duration and is labeled accordingly.

The calendar shows minutes, miles, average watts, cadence, and calories (≈ marks estimated calories). Tap a biking card for all readings; multiple rides on a date remain distinct. Progress → Biking charts one selected metric per ride over the last 30 days. Legacy rides still appear in the duration chart; missing readings create gaps in other charts.

When the user provides a new workout photo:

1. Read the photo and confirm the workout date from their request in their timezone. Do not infer a date or time from the image filename. Leave unreadable fields out; ask about essential ambiguities.
2. Calculate the original photo's SHA-256. Save a transcription JSON **outside the repository**, using this shape (illustrative readings):

   ```json
   {
     "workoutDate": "2026-10-20",
     "durationMinutes": 28,
     "cycling": {
       "distanceMiles": 5.51,
       "calories": 179,
       "caloriesEstimated": true,
       "avgCadenceRpm": 59,
       "avgPowerWatts": 63,
       "avgResistance": 13,
       "maxResistance": 15,
       "avgInclinePercent": 0,
       "maxInclinePercent": 0
     },
     "source": { "device": "NordicTrack / iFIT", "photoSha256": "REPLACE_WITH_THE_64_CHARACTER_SHA256" }
   }
   ```

3. Use the logged-in Chrome skill to connect the user's existing profile. The workout site must be signed in. The importer uses that session and normal Firestore permissions; no service-account key or copied token is needed. Make Playwright available through the normal module path or `NODE_PATH` (the Codex workspace dependencies tool supplies the bundled location).
4. Preview: `node workout/scripts/import-bike.mjs --file <private-json-path>`. This validates units and data and reads existing biking entries on the date.
5. Import with the same command plus `--apply`. If a matching duration-only entry already exists, add `--update-id <id-from-preview>` to enrich it. Use `--new-ride` only after checking that the photo is a distinct session on that same date. The importer refuses to overwrite existing ride metrics. Repeating the same photo import is idempotent. A different photo of an existing ride must be reviewed to avoid duplication; never delete the old workout to bypass that check.
6. Verify the server readback and calendar. Report completion only after the write succeeds. If sign-in is unavailable, keep the private JSON ready and clearly report that the database write is pending.

Photo records store an explicit `workoutDate`. The timestamp is a sorting anchor when the time is unknown, not an asserted workout time. Original photos stay private and are not uploaded. Once the feature is deployed, future imports are database-only and require no site deployment.

## Checks

`node --test workout/tests/*.test.mjs`

Browser-check the calendar, ride dialog, optional logging fields, and biking progress at phone and desktop widths. Use fixtures or intercepted Firebase responses for tests; never create test workouts in the user's production database. HTML entry points use versioned JS/CSS URLs to avoid stale static-site assets.
