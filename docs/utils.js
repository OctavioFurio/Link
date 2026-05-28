const API = "https://link-4lqo.onrender.com";
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