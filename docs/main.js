const TOP_K_FEED = 10;
const TOP_K_SEARCH = 5;
const MAX_POST_LEN = 256;

const USER_ID = localStorage.getItem("user_id");
const TEMP_USERNAME = localStorage.getItem("username");

const COMPOSE_TEXTAREA = document.getElementById("post-input");

if (!USER_ID || USER_ID == "undefined") {
    localStorage.removeItem("user_id");
    localStorage.removeItem("username");
    window.location.href = `${DOMAIN}/login`;
} else {
    updateProfBtn();
    loadAll();
}

document.getElementById("post-btn").addEventListener("click", handleNewPost);
document.getElementById("search-btn").addEventListener("click", handleSearch);
COMPOSE_TEXTAREA.addEventListener("input", handleInputCounter);

function loadAll() {
    loadFeed();
    loadSuggestions();
}

function updateProfBtn() {
    const profileBtn = document.getElementById("profile-btn");
    const textBox = document.getElementById("compose-author");
    const username = localStorage.getItem("username");
    if (username) {
        profileBtn.textContent = username;
        profileBtn.href = `${DOMAIN}/profile`;
        profileBtn.setAttribute("aria-label", 'Seu perfil.');
        textBox.innerHTML = `Olá, ${username}! Crie aqui sua próxima publicação!`;
    }
}

async function loadFeed() {
    const container = document.getElementById("posts-container");
    setFeedMessage(container, "Carregando...");
 
    try {
        const [posts, likedIds] = await Promise.all([
            apiFetch(`/rec/feed/${USER_ID}?top_k=${TOP_K_FEED}`),
            apiFetch(`/users/${USER_ID}/likes`),
        ]);
        const likedSet = new Set(likedIds);

        container.innerHTML = "";
        if (!posts.length) {
            setFeedMessage(container, "Sem postagens ainda.");
            return;
        }

        const postElements = posts.map(post => {
            const render = renderPost(post, post.temp_username, likedSet.has(post.post_id));
            container.appendChild(render);
            return render;
        });

        posts.forEach(async (post, i) => {
            const userData = await apiFetch(`/users/${post.user_id}`);
            updatePostUsername(postElements[i], userData.username);
        });
    } catch (error) {
        console.error("Fail to load feed:", error);
        setFeedMessage(container, "Falha ao carregar postagens.");
    }
}

function setFeedMessage(container, message) {
  container.innerHTML = `
    <p style='color:var(--muted-text-color);padding:1rem'>
        ${message}
    </p>`;
}

function renderPost(post, username, liked=false) {
    const card = document.createElement("article");
    card.className = "post-card";
    card.innerHTML = `
        <div class="post-meta">${username}</div>
        <div class="post-content">${escHtml(post.content)}</div>
        <div class="post-actions">
            <button class="like-btn${liked ? " button-selected" : ""}" data-id="${post.post_id}">
                ${liked ? "♥ Curtiu!" : "♥ Curtir"}
            </button>
        </div>`;
    if (!liked) {
        card.querySelector(".like-btn").addEventListener("click", () => 
            likePost(post.post_id, card));
    }
    return card;
}

async function likePost(postId, card) {
    const btn = card.querySelector(".like-btn");
    btn.classList.add("button-selected");
    btn.textContent = "♥ Curtiu!";
    btn.onclick = null;

    try {
        await apiFetch(`/posts/${postId}/like?user_id=${USER_ID}`, { method: "POST" });
        toast("Curtido!");
    } catch (error) {
        console.error(`Fail to like post ${postId}:`, error);
        btn.classList.remove("button-selected");
        btn.textContent = "♥ Curtir";
        btn.onclick = () => likePost(postId, card);
    }
}

function updatePostUsername(postElement, username) {
    postElement.querySelector(".post-meta").textContent = username;
}

async function loadSuggestions() {
    const list = document.getElementById("suggestions-list");
    setListMessage(list, "Carregando...");

    try {
        const users = await apiFetch(`/rec/users/${USER_ID}?top_k=${TOP_K_SEARCH}`);

        list.innerHTML = "";
        if (!users.length) {
            setListMessage(list, "Sem resultados.");
            return;
        }

        users.forEach(user => list.appendChild(renderUserLi(user)));
    } catch (error) {
        console.error("Fail to load suggestions:", error);
        setListMessage(list, "Falha ao carregar sugestões!");
    }
}

function setListMessage(list, message) {
    list.innerHTML = `<li style='color:var(--muted-text-color)'>${message}</li>`;
}

function renderUserLi(user) {
    const li = document.createElement("li");
    li.innerHTML = `
        <span>${user.username ?? user.user_id}</span>
        <button class="follow-btn">Seguir</button>`;
    return li;
}

async function handleNewPost() {
    const input = document.getElementById("post-input");
    const content = input.value.trim();
    if (!content) return;

    try {
        await apiFetch("/posts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: USER_ID, content: content, temp_username:TEMP_USERNAME }),
        });
        input.value = "";
        input.dispatchEvent(new Event("input"));
        toast("Publicado!");
        loadFeed();
    } catch (error) {
        console.error("Fail to post:", error);
        toast("Falha ao publicar!");
    }
}
 
async function handleSearch() {
    const query = document.getElementById("search-input").value.trim();
    if (!query) return;

    const list = document.getElementById("suggestions-list");
    const panel = document.getElementById("suggestions-panel");
    panel.querySelector("sidebar-heading").textContent = `Resultados para "${query}"`;
    setListMessage(list, "Buscando...");

    try {
        const users = await apiFetch(`/users/search/${encodeURIComponent(query)}?top_k=${TOP_K_SEARCH}`);

        list.innerHTML = "";
        if (!users.length) {
            setListMessage(list, "Sem resultados.");
            toast("Nenhum usuário encontrado!");
            return;
        }

        users.forEach(user => list.appendChild(renderUserLi(user)));
        toast("Usuários encontrados!");
    } catch (error) {
        console.error("Fail to search users:", error);
        setListMessage(list, "Sem resultados.");
        toast("Falha ao procurar usuários!");
    }
}

function handleInputCounter() {
    const currentLength = COMPOSE_TEXTAREA.value.length;
    const charCount = document.getElementById("compose-count");
    charCount.textContent = `${currentLength}/${MAX_POST_LEN}`;
  
    if (currentLength >= MAX_POST_LEN) {
        charCount.style.color = "var(--main-color)";
        charCount.style.fontWeight = "bold";
    } 
    else {
        charCount.style.color = "var(--muted-text-color)";
        charCount.style.fontWeight = "normal";
    }
}
