const API = "https://link-4lqo.onrender.com";
const TOP_K_FEED = 15;
const TOP_K_SEARCH = 5;

const TOAST_TIMER_MS = 2000;

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
        <p style='color:var(--muted-text-color);padding:1rem'>
            Carregando…
        </p>`;

    try {
        const posts = await fetch(
            `${API}/rec/feed/${USER_ID}?top_k=${TOP_K_FEED}`
        ).then(r => r.json());

        container.innerHTML = "";

        if (!posts.length) { 
            container.innerHTML = `
                <p style='color:var(--muted-text-color);padding:1rem'>
                    Sem postagens ainda.
                </p>`;
            return; 
        }

        const postElementsPromises = posts.map(async post => {
            const userData = await fetch(
                `${API}/users/${post.user_id}`
            ).then(r => r.json()); 

           return renderPost(post, userData.username);
        });

        const postElements = await Promise.all(postElementsPromises);
        postElements.forEach(post => container.appendChild(post));
    } catch (error) {
        console.error("Fail to load feed:", error);
        container.innerHTML = `
            <p style='color:var(--muted-text-color);padding:1rem'>
                Falha ao carregar postagens.
            </p>`;
    }
}

function renderPost(post, username) {
    const card = document.createElement("article");
    card.className = "post-card";
    card.innerHTML = `
        <div class="post-meta">${username}</div>
        <div class="post-content">${escHtml(post.content)}</div>
        <div class="post-actions">
            <button class="like-btn" data-id="${post.post_id}">♥ Curtir</button>
        </div>`;
    card.querySelector(".like-btn").addEventListener("click", () => likePost(post.post_id, card));
    return card;
}

async function likePost(post_id, card) {
    const btn = card.querySelector(".like-btn");
    btn.classList.add("button-selected");
    btn.textContent = "♥ Curtiu!";

    try {
        await fetch(`${API}/posts/${post_id}/like?user_id=${USER_ID}`, { method: "POST" });
        toast("Curtido!");
    } catch (error) {
        console.error(`Fail to like post ${post_id}:`, error);
        btn.classList.remove("button-selected");
        btn.textContent = "♥ Curtir";
    }
}

document.getElementById("post-btn").addEventListener("click", async () => {
    const input = document.getElementById("post-input");
    const content = input.value.trim();
    if (!content) return;

    try {
        await fetch(`${API}/posts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: USER_ID, content }),
        });

        input.value = "";
        toast("Publicado!");
        loadFeed();
    } catch (error) {
        console.error(`Fail to post:`, error);
        toast("Falha ao publicar!");
    }
});

async function loadSuggestions() {
    const list = document.getElementById("suggestions-list");
    
    list.innerHTML = "<li style='color:var(--muted-text-color)'>Carregando...</li>";

    try{
        const users = await fetch(`${API}/rec/users/${USER_ID}?top_k=${TOP_K_SEARCH}`)
            .then(r => r.json());

        list.innerHTML = "";
        if (!users.length){
            list.innerHTML = "<li style='color:var(--muted-text-color)'>Sem resultados.</li>";
            return;
        }

        users.forEach(user => {
            const li = document.createElement("li");
            li.innerHTML = `
                <span>${user.username ?? user.user_id}</span>
                <button class="follow-btn">Seguir</button>`;
            list.appendChild(li);
        });
    } catch (error) {
        console.error(`Fail to load suggestions:`, error);
        list.innerHTML = "<li style='color:var(--muted-text-color)'>Sem resultados.</li>";
    }
}

document.getElementById("search-btn").addEventListener("click", async () => {
    const query = document.getElementById("search-input").value.trim();
    if (!query) return;

    const list = document.getElementById("suggestions-list");
    const panel = document.getElementById("suggestions-panel");

    panel.querySelector("h3").textContent = `Resultados para "${query}"`;
    list.innerHTML = "<li style='color:var(--muted-text-color)'>Buscando...</li>";

    try {
        const users = await fetch(`${API}/users/search/${encodeURIComponent(query)}`)
            .then(r => r.json());

        list.innerHTML = "";
        if (!users.length) { 
            list.innerHTML = "<li style='color:var(--muted-text-color)'>Sem resultados.</li>";
            toast("Nenhum usuário encontrado!");
            return; 
        }
        users.forEach(user => {
            const li = document.createElement("li");
            li.innerHTML = `
                <span>${user.username ?? user.user_id}</span>
                <button class="follow-btn">Seguir</button>`;
            list.appendChild(li);
        });

        toast("Usuários encontrados!");
    } catch (error) {
        console.error(`Fail to search users:`, error);
        list.innerHTML = "<li style='color:var(--muted-text-color)'>Sem resultados.</li>";
        toast("Falha ao procurar usuários!");
    }
});

function escHtml(s) {
    return s
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;");
}

function toast(message) {
    const toast = document.getElementById("toast");

    toast.textContent = message;
    toast.classList.remove("hidden");

    setTimeout(() => toast.classList.add("hidden"), TOAST_TIMER_MS);
}