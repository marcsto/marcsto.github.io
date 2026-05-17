const CLIENT_ID = "239257173932-1s7jhkik7k1iadtp1ak96s7l9eop9ubv.apps.googleusercontent.com";
const API_KEY = "AIzaSyAoWx24hAws1Fm-wNP2p_HjgHXtOqfl8ow";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const SPREADSHEET_NAME = "Workout Tracker Data";
const SHEET_NAME = "Workout Log";
const SHEET_HEADERS = ["Timestamp", "Exercise Name", "Reps", "Weight"];

const DEFAULT_EXERCISES = [
  { name: "Benchpress", icon: "fitness_center", shortName: "BP", color: "#1f7a8c", tint: "#e8f5f7" },
  { name: "Deadlift", icon: "exercise", shortName: "DL", color: "#8a4f2a", tint: "#f7eee6" },
  { name: "Squats", icon: "accessibility_new", shortName: "SQ", color: "#157a55", tint: "#e8f5ef" },
  { name: "Lunges", icon: "directions_run", shortName: "LG", color: "#b7433f", tint: "#fbecec" },
  { name: "Overhead Press", icon: "exercise", shortName: "OHP", color: "#6b4fa3", tint: "#f0edf8" },
  { name: "Rows", icon: "rowing", shortName: "ROW", color: "#245a8d", tint: "#e9f0f7" },
  { name: "Abs", icon: "self_improvement", shortName: "ABS", color: "#c78322", tint: "#fff4df" },
  { name: "VR", icon: "sports_esports", shortName: "VR", type: "duration", color: "#8b3f9f", tint: "#f5eafa" },
  { name: "Biking", icon: "directions_bike", shortName: "BIKE", type: "duration", color: "#2f7d32", tint: "#eaf6ea" }
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
