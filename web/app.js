const form = document.getElementById("form");
const input = document.getElementById("url");
const player = document.getElementById("player");
const hint = document.getElementById("hint");

const ALLOWED = /\.(mp4|webm|ogg|ogv|m3u8)(\?|$)/i;

function isLikelyDirectVideo(url) {
  try {
    const u = new URL(url);
    if (ALLOWED.test(u.pathname + u.search)) return true;
    // HLS sin extensión en path
    if (u.pathname.endsWith(".m3u8")) return true;
    return false;
  } catch {
    return false;
  }
}

function play(url) {
  if (!isLikelyDirectVideo(url)) {
    hint.textContent =
      "URL no reconocida como video directo. Usa un enlace que termine en .mp4 o .webm, o instala la extensión para sitios como YouTube.";
    hint.classList.remove("hidden");
    player.classList.remove("active");
    return;
  }
  player.src = url;
  player.classList.add("active");
  hint.classList.add("hidden");
  player.play().catch(() => {
    hint.textContent =
      "No se pudo reproducir. Comprueba la URL o CORS del servidor.";
    hint.classList.remove("hidden");
  });
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const url = input.value.trim();
  if (url) play(url);
});

const params = new URLSearchParams(location.search);
const q = params.get("v") || params.get("url");
if (q) {
  input.value = q;
  play(q);
}
