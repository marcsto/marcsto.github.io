const CLIENT_ID = "239257173932-1s7jhkik7k1iadtp1ak96s7l9eop9ubv.apps.googleusercontent.com";
const API_KEY = "AIzaSyAoWx24hAws1Fm-wNP2p_HjgHXtOqfl8ow";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const SPREADSHEET_NAME = "Workout Tracker Data";
const SHEET_NAME = "Workout Log";
const SHEET_HEADERS = ["Timestamp", "Exercise Name", "Reps", "Weight"];

const DEFAULT_EXERCISES = [
  { name: "Benchpress", icon: "fitness_center", shortName: "BP" },
  { name: "Deadlift", icon: "exercise", shortName: "DL" },
  { name: "Squats", icon: "accessibility_new", shortName: "SQ" },
  { name: "Lunges", icon: "directions_run", shortName: "LG" },
  { name: "Overhead Press", icon: "exercise", shortName: "OHP" },
  { name: "Rows", icon: "rowing", shortName: "ROW" }
];

const STORAGE_PREFIX = "workoutTracker.v1.";
const STORAGE_KEYS = {
  spreadsheetId: `${STORAGE_PREFIX}spreadsheetId`,
  exerciseCache: `${STORAGE_PREFIX}exerciseCache`,
  pendingRows: `${STORAGE_PREFIX}pendingRows`,
  hasGoogleGrant: `${STORAGE_PREFIX}hasGoogleGrant`,
  accessToken: `${STORAGE_PREFIX}accessToken`,
  tokenExpiresAt: `${STORAGE_PREFIX}tokenExpiresAt`
};

const SHEETS_API = "https://sheets.googleapis.com/v4";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
