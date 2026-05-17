const CLIENT_ID = "239257173932-1s7jhkik7k1iadtp1ak96s7l9eop9ubv.apps.googleusercontent.com";
const API_KEY = "AIzaSyAoWx24hAws1Fm-wNP2p_HjgHXtOqfl8ow";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const SPREADSHEET_NAME = "Workout Tracker Data";
const SHEET_NAME = "Workout Log";
const SHEET_HEADERS = ["Timestamp", "Exercise Name", "Reps", "Weight"];

const DEFAULT_EXERCISES = [
  { name: "Benchpress", icon: "fitness_center", shortName: "BP", color: "#4dc6d8", tint: "#102e34" },
  { name: "Deadlift", icon: "exercise", shortName: "DL", color: "#d9975f", tint: "#382416" },
  { name: "Squats", icon: "accessibility_new", shortName: "SQ", color: "#47d296", tint: "#143326" },
  { name: "Lunges", icon: "directions_run", shortName: "LG", color: "#f07b75", tint: "#3b1f21" },
  { name: "Overhead Press", icon: "exercise", shortName: "OHP", color: "#b39afa", tint: "#281f43" },
  { name: "Rows", icon: "rowing", shortName: "ROW", color: "#78bdf4", tint: "#142b43" },
  { name: "Abs", icon: "self_improvement", shortName: "ABS", color: "#f4c56f", tint: "#3a2b13" },
  { name: "VR", icon: "sports_esports", shortName: "VR", type: "duration", color: "#d785ef", tint: "#351a42" },
  { name: "Biking", icon: "directions_bike", shortName: "BIKE", type: "duration", color: "#7bdc7b", tint: "#1b351e" }
];

const STORAGE_PREFIX = "workoutTracker.v1.";
const STORAGE_KEYS = {
  spreadsheetId: `${STORAGE_PREFIX}spreadsheetId`,
  exerciseCache: `${STORAGE_PREFIX}exerciseCache`,
  workoutRows: `${STORAGE_PREFIX}workoutRows`,
  pendingRows: `${STORAGE_PREFIX}pendingRows`,
  hasGoogleGrant: `${STORAGE_PREFIX}hasGoogleGrant`,
  accessToken: `${STORAGE_PREFIX}accessToken`,
  tokenExpiresAt: `${STORAGE_PREFIX}tokenExpiresAt`
};

const SHEETS_API = "https://sheets.googleapis.com/v4";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
