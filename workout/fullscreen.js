const fullscreenState = {
  button: null,
  icon: null,
  label: null,
  wakeLock: null
};

document.addEventListener("DOMContentLoaded", initFullscreenButton);

function initFullscreenButton() {
  fullscreenState.button = document.getElementById("fullscreenButton");
  if (!fullscreenState.button) {
    return;
  }

  fullscreenState.icon = fullscreenState.button.querySelector(".fullscreen-icon");
  fullscreenState.label = fullscreenState.button.querySelector(".fullscreen-label");
  fullscreenState.button.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  document.addEventListener("visibilitychange", restoreWakeLockIfNeeded);
  updateFullscreenButton();
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await releaseWakeLock();
      await document.exitFullscreen();
      return;
    }

    await document.documentElement.requestFullscreen();
    await requestWakeLock();
  } catch (error) {
    showFullscreenStatus(error?.message || "Fullscreen unavailable");
  } finally {
    updateFullscreenButton();
  }
}

async function handleFullscreenChange() {
  if (document.fullscreenElement) {
    await requestWakeLock();
  } else {
    await releaseWakeLock();
  }

  updateFullscreenButton();
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) {
    showFullscreenStatus("Awake unavailable");
    return;
  }

  if (fullscreenState.wakeLock) {
    return;
  }

  try {
    fullscreenState.wakeLock = await navigator.wakeLock.request("screen");
    fullscreenState.wakeLock.addEventListener("release", () => {
      fullscreenState.wakeLock = null;
      updateFullscreenButton();
    });
  } catch (error) {
    showFullscreenStatus(error?.message || "Awake unavailable");
  }
}

async function releaseWakeLock() {
  if (!fullscreenState.wakeLock) {
    return;
  }

  const wakeLock = fullscreenState.wakeLock;
  fullscreenState.wakeLock = null;
  await wakeLock.release();
}

async function restoreWakeLockIfNeeded() {
  if (document.visibilityState === "visible" && document.fullscreenElement) {
    await requestWakeLock();
    updateFullscreenButton();
  }
}

function updateFullscreenButton() {
  const isFullscreen = Boolean(document.fullscreenElement);
  const isAwake = Boolean(fullscreenState.wakeLock);

  fullscreenState.button?.classList.toggle("is-active", isFullscreen);

  if (fullscreenState.icon) {
    fullscreenState.icon.textContent = isFullscreen ? "fullscreen_exit" : "fullscreen";
  }

  if (fullscreenState.label) {
    fullscreenState.label.textContent = isFullscreen && isAwake ? "Awake" : isFullscreen ? "Full" : "Full";
  }

  if (fullscreenState.button) {
    fullscreenState.button.title = isFullscreen
      ? isAwake ? "Exit fullscreen and release wake lock" : "Exit fullscreen"
      : "Enter fullscreen and keep screen awake";
  }
}

function showFullscreenStatus(message) {
  if (!fullscreenState.label) {
    return;
  }

  fullscreenState.label.textContent = message;
  window.setTimeout(updateFullscreenButton, 2200);
}
