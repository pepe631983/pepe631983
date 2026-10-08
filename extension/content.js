/**
 * Detecta y cierra/salta anuncios en sitios de video conocidos.
 * Usa selectores por plataforma + heurísticas genéricas.
 */

const DEFAULTS = {
  enabled: true,
  autoSkip: true,
  hideOverlays: true,
  speedUpAds: true,
};

let settings = { ...DEFAULTS };

chrome.storage.sync.get(DEFAULTS, (stored) => {
  settings = { ...DEFAULTS, ...stored };
  if (settings.enabled) start();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  for (const key of Object.keys(changes)) {
    settings[key] = changes[key].newValue;
  }
  if (!settings.enabled) stop();
  else if (!observer) start();
});

/** @type {MutationObserver | null} */
let observer = null;
/** @type {number | null} */
let intervalId = null;

const PLATFORM = detectPlatform();

function detectPlatform() {
  const h = location.hostname;
  if (h.includes("youtube.com") || h.includes("youtu.be")) return "youtube";
  if (h.includes("twitch.tv")) return "twitch";
  if (h.includes("facebook.com")) return "facebook";
  if (h.includes("instagram.com")) return "instagram";
  if (h.includes("tiktok.com")) return "tiktok";
  if (h.includes("dailymotion.com")) return "dailymotion";
  if (h.includes("vimeo.com")) return "vimeo";
  return "generic";
}

/** Selectores de botones "Saltar" / cerrar anuncio */
const SKIP_SELECTORS = [
  ".ytp-ad-skip-button",
  ".ytp-ad-skip-button-modern",
  ".ytp-skip-ad-button",
  ".videoAdUiSkipButton",
  ".ad-showing .ytp-ad-skip-button-container button",
  "[class*='skip'][class*='ad'] button",
  "[data-testid='adSkipButton']",
  "button[aria-label*='Skip']",
  "button[aria-label*='Saltar']",
  "button[aria-label*='Omitir']",
  ".ytp-ad-overlay-close-button",
  ".ytp-ad-overlay-close-container",
  ".dismissible-overlay button",
  "[aria-label='Cerrar']",
  "[aria-label='Close']",
];

const OVERLAY_SELECTORS = [
  ".ytp-ad-overlay-container",
  ".ytp-ad-text-overlay",
  ".video-ads",
  ".ad-container",
  ".ad-showing",
  "[class*='AdOverlay']",
  "[id*='google_ads']",
];

function safeClick(el) {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.offsetParent === null && el.getBoundingClientRect().width === 0) {
    // still try hidden skip buttons on YT
  }
  try {
    el.click();
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    return true;
  } catch {
    return false;
  }
}

function queryAll(root, selector) {
  try {
    return [...root.querySelectorAll(selector)];
  } catch {
    return [];
  }
}

function clickSkipButtons(root = document) {
  if (!settings.autoSkip) return 0;
  let clicked = 0;
  for (const sel of SKIP_SELECTORS) {
    for (const el of queryAll(root, sel)) {
      if (safeClick(el)) clicked++;
    }
  }
  // Texto visible "Saltar anuncio"
  for (const btn of queryAll(root, "button, a, div[role='button']")) {
    const t = (btn.textContent || "").trim().toLowerCase();
    if (
      /^(saltar|omitir|skip|skip ad|saltar anuncio|omitir anuncio)/.test(t) &&
      t.length < 40
    ) {
      if (safeClick(btn)) clicked++;
    }
  }
  return clicked;
}

function hideOverlays(root = document) {
  if (!settings.hideOverlays) return;
  for (const sel of OVERLAY_SELECTORS) {
    for (const el of queryAll(root, sel)) {
      if (el instanceof HTMLElement) {
        el.style.setProperty("display", "none", "important");
        el.style.setProperty("visibility", "hidden", "important");
        el.setAttribute("data-vsa-hidden", "1");
      }
    }
  }
}

function handleYouTube() {
  const video = document.querySelector("video.html5-main-video, video");
  if (!video) return;

  const player = document.querySelector(".html5-video-player");
  const isAd =
    player?.classList.contains("ad-showing") ||
    player?.classList.contains("ad-interrupting") ||
    document.querySelector(".ad-showing .ytp-ad-player-overlay") ||
    document.querySelector(".ytp-ad-module");

  if (isAd && settings.speedUpAds) {
    try {
      if (video.playbackRate < 16) video.playbackRate = 16;
    } catch {
      /* ignore */
    }
  }

  if (isAd) {
    clickSkipButtons();
    hideOverlays();
  } else if (video.playbackRate > 2) {
    video.playbackRate = 1;
  }

  // Cerrar banners laterales de promoción en el reproductor
  for (const close of queryAll(document, ".ytp-ad-overlay-close-button")) {
    safeClick(close);
  }
}

function handleTwitch() {
  for (const sel of [
    "[data-a-target='player-ad-overlay-dismiss']",
    "[data-a-target='video-ad-countdown'] ~ button",
    ".player-ad-overlay-dismiss",
  ]) {
    for (const el of queryAll(document, sel)) safeClick(el);
  }
  hideOverlays();
}

function handleGeneric() {
  clickSkipButtons();
  hideOverlays();
}

function tick() {
  if (!settings.enabled) return;
  switch (PLATFORM) {
    case "youtube":
      handleYouTube();
      break;
    case "twitch":
      handleTwitch();
      break;
    default:
      handleGeneric();
  }
}

function onMutations() {
  tick();
}

function start() {
  if (observer) return;
  tick();
  observer = new MutationObserver(onMutations);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden"],
  });
  intervalId = window.setInterval(tick, 500);
}

function stop() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (intervalId != null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    chrome.storage.sync.get(DEFAULTS, (stored) => {
      settings = { ...DEFAULTS, ...stored };
      if (settings.enabled) start();
    });
  });
}
