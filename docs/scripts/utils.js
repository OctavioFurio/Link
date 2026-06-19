const API = "https://link-4lqo.onrender.com";
const DOMAIN = "https://octaviofurio.github.io/Link"
const TOAST_TIMER_MS = 2000;

function apiFetch(path, options) {
    return fetch(`${API}${path}`, options).then(r => r.json());
}

function escHtml(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function toast(message) {
    const el = document.getElementById("toast");
    el.textContent = message;
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), TOAST_TIMER_MS);
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = () => resolve(img);
        img.onerror = reject;

        img.src = src;
    });
}

function timeAgo(isoString) {
    const diff = Date.now() - new Date(isoString).getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours   = Math.floor(minutes / 60);
    const days    = Math.floor(hours / 24);

    if (seconds < 60)  return "agora mesmo";
    if (minutes < 60)  return `${minutes}min atrás`;
    if (hours < 24)    return `${hours}h atrás`;
    if (days < 7)      return `${days}d atrás`;
    return new Date(isoString).toLocaleDateString("pt-BR");
}

function setLocalStorage(userData) {
    localStorage.setItem("user_id", userData.user_id);
    localStorage.setItem("username", userData.username);
}

function handleExit() {
    localStorage.removeItem("user_id");
    localStorage.removeItem("username");
    window.location.href = `${DOMAIN}/login`;
}