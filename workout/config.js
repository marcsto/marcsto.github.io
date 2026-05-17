export const DEFAULT_EXERCISES = [
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

export function getExerciseByName(exerciseName) {
  return DEFAULT_EXERCISES.find((exercise) => exercise.name.toLowerCase() === String(exerciseName).toLowerCase());
}

export function isDurationExercise(exercise) {
  return exercise?.type === "duration";
}

export function isDurationExerciseName(exerciseName) {
  return isDurationExercise(getExerciseByName(exerciseName));
}

export function abbreviateExercise(exerciseName) {
  const match = getExerciseByName(exerciseName);
  if (match?.shortName) {
    return match.shortName;
  }

  return String(exerciseName)
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

export function getExerciseStyle(exerciseName) {
  const match = getExerciseByName(exerciseName);
  if (match?.color && match?.tint) {
    return {
      color: match.color,
      tint: match.tint
    };
  }

  const hue = hashString(String(exerciseName)) % 360;
  return {
    color: `hsl(${hue} 58% 62%)`,
    tint: `hsl(${hue} 45% 16%)`
  };
}

function hashString(value) {
  return Array.from(value).reduce((hash, character) => (
    ((hash << 5) - hash + character.charCodeAt(0)) >>> 0
  ), 0);
}
