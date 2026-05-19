const API = "https://link-4lqo.onrender.com";
const TOP_K_FEED = 100;
const TOP_K_SEARCH = 5;

// Demo user_id (no auth for now)
let USER_ID = localStorage.getItem("user_id");
if (!USER_ID) {
  fetch(`${API}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: `user_${Math.random().toString(36).slice(2, 7)}` }),
  })
    .then(r => r.json())
    .then(d => { USER_ID = d.user_id; localStorage.setItem("user_id", USER_ID); loadAll(); });
} else {
  loadAll();
}

function loadAll() {
    loadFeed();
    loadSuggestions();
}

async function loadFeed() {
    const container = document.getElementById("posts-container");
    container.innerHTML = `
        <p style='color:var(--muted-text-color);padding:1rem'>Carregando…</p>`;
    const posts = 
        await fetch(`${API}/rec/feed/${USER_ID}?top_k=${TOP_K_FEED}`).then(r => r.json());
    container.innerHTML = "";
    if (!posts.length) { 
        container.innerHTML = `
            <p style='color:var(--muted-text-color);padding:1rem'>No posts yet.</p>`;
        return; 
    }
    posts.forEach(post => container.appendChild(renderPost(post)));
}

function renderPost(post) {
    const card = document.createElement("article");
    card.className = "post-card";
    card.innerHTML = `
        <div class="post-meta">${post.user_id}</div>
        <div class="post-content">${escHtml(post.content)}</div>
        <div class="post-actions">
            <button class="like-btn" data-id="${post.post_id}">♥ Curtir</button>
        </div>`;
    card.querySelector(".like-btn").addEventListener("click", () => likePost(post.post_id, card));
    return card;
}

async function likePost(post_id, card) {
    await fetch(`${API}/posts/${post_id}/like?user_id=${USER_ID}`, { method: "POST" });
    const btn = card.querySelector(".like-btn");
    btn.classList.add(".liked-btn");
    btn.style.background = "var(--main-color)";
    btn.style.color = "var(--foreground-color)";
    btn.textContent = "♥ Curtiu!";
    toast("Curtido!");
}

document.getElementById("post-btn").addEventListener("click", async () => {
    const input = document.getElementById("post-input");
    const content = input.value.trim();
    if (!content) return;
    await fetch(`${API}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: USER_ID, content }),
    });
    input.value = "";
    toast("Publicado!");
    loadFeed();
});

async function loadSuggestions() {
    const list = document.getElementById("suggestions-list");
    const users = await fetch(`${API}/rec/users/${USER_ID}?top_k=${TOP_K_SEARCH}`).then(r => r.json());
    list.innerHTML = "";
    users.forEach(user => {
        const li = document.createElement("li");
        li.innerHTML = `<span>${user.username ?? user.user_id}</span>
            <button class="follow-btn">Seguir</button>`;
        list.appendChild(li);
    });
}

document.getElementById("search-btn").addEventListener("click", async () => {
    const q = document.getElementById("search-input").value.trim();
    if (!q) return;
    const users = await fetch(`${API}/users/search/${encodeURIComponent(q)}`).then(r => r.json());
    const list = document.getElementById("suggestions-list");
    const panel = document.getElementById("suggestions-panel");
    panel.querySelector("h3").textContent = `Resultados para "${q}"`;
    list.innerHTML = "";
    if (!users.length) { 
        list.innerHTML = "<li style='color:var(--muted-text-color)'>Sem resultados</li>"; 
        return; 
    }
    users.forEach(user => {
        const li = document.createElement("li");
        li.innerHTML = `<span>${user.username ?? user.user_id}</span>
            <button class="follow-btn">Seguir</button>`;
        list.appendChild(li);
    });
});

function escHtml(s) {
    return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function toast(message) {
    const t = document.getElementById("toast");
    t.textContent = message;
    t.classList.remove("hidden");
    setTimeout(() => t.classList.add("hidden"), 2000);
}