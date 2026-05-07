const API = "https://YOUR-BACKEND.onrender.com";  // ← update after Render deploy

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

// Feed
async function loadFeed() {
  const container = document.getElementById("posts-container");
  container.innerHTML = "<p style='color:var(--muted);padding:1rem'>Loading…</p>";
  const posts = await fetch(`${API}/rec/feed/${USER_ID}?top_k=15`).then(r => r.json());
  container.innerHTML = "";
  if (!posts.length) { container.innerHTML = "<p style='color:var(--muted);padding:1rem'>No posts yet.</p>"; return; }
  posts.forEach(p => container.appendChild(renderPost(p)));
}

function renderPost(p) {
  const card = document.createElement("div");
  card.className = "post-card";
  card.innerHTML = `
    <div class="post-meta">${p.user_id.slice(0, 8)}… · ${p.likes ?? 0} ♥</div>
    <div class="post-content">${escHtml(p.content)}</div>
    <div class="post-actions">
      <button class="like-btn" data-id="${p.post_id}">♥ Like</button>
    </div>`;
  card.querySelector(".like-btn").addEventListener("click", () => likePost(p.post_id, card));
  return card;
}

async function likePost(post_id, card) {
  await fetch(`${API}/posts/${post_id}/like?user_id=${USER_ID}`, { method: "POST" });
  const meta = card.querySelector(".post-meta");
  // Optimistic UI update
  const current = parseInt(meta.textContent.match(/(\d+) ♥/)?.[1] ?? "0");
  meta.textContent = meta.textContent.replace(/\d+ ♥/, `${current + 1} ♥`);
  toast("Liked!");
}

// Compose
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
  toast("Posted!");
  loadFeed();
});

// Recommendations
async function loadSuggestions() {
  const list = document.getElementById("suggestions-list");
  const users = await fetch(`${API}/rec/users/${USER_ID}?top_k=5`).then(r => r.json());
  list.innerHTML = "";
  users.forEach(u => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${u.username ?? u.user_id.slice(0, 8)}</span>
      <button class="follow-btn">Follow</button>`;
    list.appendChild(li);
  });
}

// Search
document.getElementById("search-btn").addEventListener("click", async () => {
  const q = document.getElementById("search-input").value.trim();
  if (!q) return;
  const users = await fetch(`${API}/users/search/${encodeURIComponent(q)}`).then(r => r.json());
  const list = document.getElementById("suggestions-list");
  const panel = document.getElementById("suggestions-panel");
  panel.querySelector("h3").textContent = `Results for "${q}"`;
  list.innerHTML = "";
  if (!users.length) { list.innerHTML = "<li style='color:var(--muted)'>No results</li>"; return; }
  users.forEach(u => {
    const li = document.createElement("li");
    li.textContent = u.username;
    list.appendChild(li);
  });
});

// Misc.
function escHtml(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 2000);
}