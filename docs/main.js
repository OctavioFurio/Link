const TOP_K_FEED = 15;
const TOP_K_SEARCH = 5;
const MAX_POST_LEN = 256;

function setFeedMessage(container, message) {
  container.innerHTML = `
    <p style='color:var(--muted-text-color);padding:1rem'>
        ${message}
    </p>`;
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

// TODO
let userId = "73aa628f-c8e8-4490-b2d2-2ab92d0c11b7"
loadAll();
// let userId = localStorage.getItem("user_id");
// if (!userId) {
//     window.location.href = "https://octaviofurio.github.io/Link/login.html";
// } else {
//     loadAll();
// }

function loadAll() {
    loadFeed();
    loadSuggestions();
}

async function loadFeed() {
    const container = document.getElementById("posts-container");
    setFeedMessage(container, "Carregando...");
 
    try {
        const posts = await apiFetch(`/rec/feed/${userId}?top_k=${TOP_K_FEED}`);

        container.innerHTML = "";
        if (!posts.length) {
            setFeedMessage(container, "Sem postagens ainda.");
            return;
        }

        const postElements = await Promise.all(
            posts.map(async post => {
            const userData = await apiFetch(`/users/${post.user_id}`);
            return renderPost(post, userData.username);
            })
        );

        postElements.forEach(element => container.appendChild(element));
    } catch (error) {
        console.error("Fail to load feed:", error);
        setFeedMessage(container, "Falha ao carregar postagens.");
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
    card.querySelector(".like-btn").addEventListener("click", 
        () => likePost(post.post_id, card));
    return card;
}
 
async function likePost(postId, card) {
    const btn = card.querySelector(".like-btn");
    btn.classList.add("button-selected");
    btn.textContent = "♥ Curtiu!";

    try {
        await apiFetch(`/posts/${postId}/like?user_id=${userId}`, { method: "POST" });
        toast("Curtido!");
    } catch (error) {
        console.error(`Fail to like post ${postId}:`, error);
        btn.classList.remove("button-selected");
        btn.textContent = "♥ Curtir";
    }
}
 
async function handleNewPost() {
    const input = document.getElementById("post-input");
    const content = input.value.trim();
    if (!content) return;

    try {
        await apiFetch("/posts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId, content }),
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
 
async function loadSuggestions() {
    const list = document.getElementById("suggestions-list");
    setListMessage(list, "Carregando...");

    try {
        const users = await apiFetch(`/rec/users/${userId}?top_k=${TOP_K_SEARCH}`);

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
 
async function handleSearch() {
    const query = document.getElementById("search-input").value.trim();
    if (!query) return;

    const list = document.getElementById("suggestions-list");
    const panel = document.getElementById("suggestions-panel");
    panel.querySelector("h3").textContent = `Resultados para "${query}"`;
    setListMessage(list, "Buscando...");

    try {
        const users = await apiFetch(`/users/search/${encodeURIComponent(query)}`);

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
    const currentLength = composeTextarea.value.length;
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
 
document.getElementById("post-btn").addEventListener("click", handleNewPost);
document.getElementById("search-btn").addEventListener("click", handleSearch);

const composeTextarea = document.getElementById("post-input");
composeTextarea.addEventListener("input", handleInputCounter);