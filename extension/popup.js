const DEFAULTS = {
  enabled: true,
  autoSkip: true,
  hideOverlays: true,
  speedUpAds: true,
};

const ids = ["enabled", "autoSkip", "hideOverlays", "speedUpAds"];

function load() {
  chrome.storage.sync.get(DEFAULTS, (stored) => {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) el.checked = !!stored[id];
    }
  });
}

function save(key, value) {
  chrome.storage.sync.set({ [key]: value });
}

document.addEventListener("DOMContentLoaded", () => {
  load();
  for (const id of ids) {
    document.getElementById(id)?.addEventListener("change", (e) => {
      save(id, e.target.checked);
    });
  }
});
