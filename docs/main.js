const TOP_K_FEED = 10;
const TOP_K_SEARCH = 5;
const MAX_POST_LEN = 256;

const USER_ID = localStorage.getItem("user_id");
const TEMP_USERNAME = localStorage.getItem("username");
const IS_LOGGED = USER_ID && USER_ID != "undefined";

const COMPOSE_TEXTAREA = document.getElementById("post-input");

if (IS_LOGGED) {
    updateProfBtn();

	document.getElementById("post-btn").addEventListener("click", handleNewPost);
	document.getElementById("search-btn").addEventListener("click", handleSearch);
	document.getElementById("exit-btn").addEventListener("click", handleExit);
	COMPOSE_TEXTAREA.addEventListener("input", handleInputCounter);
}
else {
  	document.querySelector('.main-content').style.gridTemplateColumns = '1fr';
  	document.querySelector('.sidebar').style.display = 'none';
  	document.querySelector('#search-input').style.display = 'none';
  	document.querySelector('#search-btn').style.display = 'none';
	document.querySelector('#exit-btn').style.display = 'none';
	
	const compose = document.querySelector('.compose');
	compose.classList.remove('compose');
	compose.classList.add('footnote');
	compose.innerHTML = "Faça login para criar, interagir e conectar!";

}
loadAll();

function loadAll() {
    loadFeed();
    if (IS_LOGGED) loadSuggestions();
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
    
    container.innerHTML = `
        <div style='padding:1rem;text-align:center'>
            <img src="Mink-run.gif" alt="Jink, a fuinha, saltando." style='width:200px'>
        </div>
    `;
 
    try {
        const posts = await apiFetch(`/rec/feed/${USER_ID}?top_k=${TOP_K_FEED}`);
        const likedIds = IS_LOGGED ? await apiFetch(`/users/${USER_ID}/likes`) : [];
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
	if(IS_LOGGED) {
        card.innerHTML = `
            <div class="post-meta"><span class="post-name">${username}</span> | ${timeAgo(post.created_at)}</div>
            <div class="post-content">${escHtml(post.content)}</div>
            <div class="post-actions">
                <button class="like-btn${liked ? " liked" : ""}" 
                        data-id="${post.post_id}" 
                        data-likes="${post.likes_count}">
                    ${liked ? "♥" : "♡"} ${post.likes_count}
                </button>
            </div>
        `;
        card.querySelector(".like-btn").addEventListener("click", (e) => 
            toggleLike(e.currentTarget));
	}
	else {
		card.innerHTML = `
			<div class="post-meta"><span class="post-name">${username}</span> | ${timeAgo(post.created_at)}</div>
			<div class="post-content">${escHtml(post.content)}</div>
		`;
	}
    return card;
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

async function toggleLike(btn) {
    const postId = btn.dataset.id;
    const wasLiked = btn.classList.contains("liked");
    const likes = Number(btn.dataset.likes);
    const newLiked = !wasLiked;
    const newLikes = wasLiked ? likes - 1 : likes + 1;

    btn.classList.toggle("liked", newLiked);
    btn.textContent = `${newLiked ? "♥" : "♡"} ${newLikes}`;
    btn.dataset.likes = newLikes;
    btn.disabled = true;

    try {
        await apiFetch(`/posts/${postId}/like`, {
            method: newLiked ? "POST" : "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: USER_ID }),
        });
        toast(newLiked ? "Curtido!" : "Descurtido!");
    } catch (error) {
        console.error(`Fail to toggle like on post ${postId}:`, error);
        toast(newLiked ? "Falha ao curtir, tente novamente." : "Falha ao descurtir, tente novamente.");

        btn.classList.toggle("liked", wasLiked);
        btn.textContent = `${wasLiked ? "♥" : "♡"} ${likes}`;
        btn.dataset.likes = likes;
    } finally {
        btn.disabled = false;
    }
}

function updatePostUsername(postElement, username) {
    postElement.querySelector(".post-name").textContent = username;
}

async function loadSuggestions() {
    const list = document.getElementById("suggestions-list");
    setListMessage(list, "Carregando...");

    try {
        const users = await apiFetch(`/rec/users/${USER_ID}?top_k=${TOP_K_SEARCH}`);
        const followingIds = await apiFetch(`/users/${USER_ID}/followings`);
        const followingSet = new Set(followingIds);

        list.innerHTML = "";
        if (!users.length) {
            setListMessage(list, "Sem resultados.");
            return;
        }

        users.forEach(user => list.appendChild(renderUserLi(user, followingSet.has(user.user_id))));
    } catch (error) {
        console.error("Fail to load suggestions:", error);
        setListMessage(list, "Falha ao carregar sugestões.");
    }
}

function setListMessage(list, message) {
    list.innerHTML = `<li style='color:var(--muted-text-color)'>${message}</li>`;
}

function renderUserLi(user, following=false) {
    const li = document.createElement("li");
    li.innerHTML = `
        <span>${user.username ?? "???"}</span>
        <button class="follow-btn${following ? " following" : ""}" 
                data-id="${user.user_id}">
            ${following ? "Seguindo" : "Seguir"}
        </button>`;
    li.querySelector(".follow-btn").addEventListener("click", (e) => 
        toggleFollow(e.currentTarget));
    return li;
}

async function toggleFollow(btn) {
    const userId = btn.dataset.id;
    const isFollowing = btn.classList.contains("following");
    const newFollowing = !isFollowing;

    btn.classList.toggle("following", newFollowing);
    btn.textContent = `${newFollowing ? "Seguindo" : "Seguir"}`;
    btn.disabled = true;

    try {
        await apiFetch(`/users/${USER_ID}/follow`, {
            method: newFollowing ? "POST" : "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId }),
        });
        toast(newFollowing ? "Seguiu!" : "Deixou de seguir!");
    } catch (error) {
        console.error(`Fail to toggle follow on user ${userId}:`, error);
        toast(newFollowing ? "Falha ao seguir, tente novamente." : "Falha ao deixar de seguir, tente novamente.");

        btn.classList.toggle("following", isFollowing);
        btn.textContent = `${isFollowing ? "Seguindo" : "Seguir"}`;
    } finally {
        btn.disabled = false;
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
            body: JSON.stringify({ user_id: USER_ID, content: content, temp_username:TEMP_USERNAME }),
        });
        input.value = "";
        input.dispatchEvent(new Event("input"));
        toast("Publicado!");
        loadFeed();
    } catch (error) {
        console.error("Fail to post:", error);
        toast("Falha ao publicar, tente novamente.");
    }
}
 
async function handleSearch() {
    const query = document.getElementById("search-input").value.trim();
    if (!query) return;

    const list = document.getElementById("suggestions-list");
    const panel = document.getElementById("suggestions-panel");
    panel.querySelector(".sidebar-heading").textContent = `Resultados para "${query}"`;
    setListMessage(list, "Buscando...");

    try {
        const users = await apiFetch(`/users/search/${encodeURIComponent(query)}?top_k=${TOP_K_SEARCH}`);
        const followingIds = await apiFetch(`/users/${USER_ID}/followings`);
        const followingSet = new Set(followingIds);

        list.innerHTML = "";
        if (!users.length) {
            setListMessage(list, "Sem resultados.");
            toast("Nenhum usuário encontrado!");
            return;
        }

        users.forEach(user => list.appendChild(renderUserLi(user, followingSet.has(user.user_id))));
        toast("Usuários encontrados!");
    } catch (error) {
        console.error("Fail to search users:", error);
        setListMessage(list, "Sem resultados.");
        toast("Falha ao procurar usuários, tente novamente.");
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

function handleExit() {
	localStorage.removeItem("user_id");
    localStorage.removeItem("username");	
    window.location.href = `${DOMAIN}/login`;
}

if (IS_LOGGED) {
    const widget       = document.getElementById("chat-widget");
    const chatBox      = document.getElementById("chat-box");
    const toggleBtn    = document.getElementById("chat-toggle-btn");
    const messagesDiv  = document.getElementById("chat-messages");
    const chatInput    = document.getElementById("chat-input");
    const sendBtn      = document.getElementById("chat-send-btn");
    const userList     = document.getElementById("chat-user-list");
    const receiverName = document.getElementById("chat-receiver-name");

    let chatPollInterval = null;
    let currentReceiver  = null;
    let currentReceiverName = null;

    widget.style.display = "flex";

    toggleBtn.addEventListener("click", () => {
        chatBox.classList.toggle("hidden");
        if (!chatBox.classList.contains("hidden")) loadChatUsers();
    });

    sendBtn.addEventListener("click", sendChatMessage);
    chatInput.addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
    });

    async function loadChatUsers() {
        userList.innerHTML = `<li style="color:var(--muted-text-color)">Carregando…</li>`;
        try {
            const followingIds = await apiFetch(`/users/${USER_ID}/followings`);
            userList.innerHTML = "";

            if (!followingIds.length) {
                userList.innerHTML = `<li style="color:var(--muted-text-color)">Ninguém ainda.</li>`;
                return;
            }

            await Promise.all(followingIds.map(async uid => {
                const userData = await apiFetch(`/users/${uid}`);
                const li = document.createElement("li");
                li.textContent = userData.username ?? uid;
                li.dataset.id  = uid;
                li.addEventListener("click", () => selectReceiver(uid, userData.username, li));
                userList.appendChild(li);
            }));
        } catch (e) {
            console.error("Falha ao carregar usuários:", e);
        }
    }

    function selectReceiver(uid, username, li) {
        currentReceiver     = uid;
        currentReceiverName = username;
        receiverName.textContent = username;

        userList.querySelectorAll("li").forEach(el => el.classList.remove("active"));
        li.classList.add("active");

        messagesDiv.innerHTML = "";
        clearInterval(chatPollInterval);
        loadMessages();
        chatPollInterval = setInterval(loadMessages, 3000);
    }

    async function loadMessages() {
        if (!currentReceiver) return;
        try {
            const msgs = await apiFetch(`/chat/messages?user_a=${USER_ID}&user_b=${currentReceiver}`);
            renderMessages(msgs);
        } catch (e) {
            console.error("Falha ao carregar mensagens:", e);
        }
    }

    function renderMessages(msgs) {
        const atBottom = messagesDiv.scrollHeight - messagesDiv.scrollTop <= messagesDiv.clientHeight + 40;
        messagesDiv.innerHTML = "";

        if (!msgs.length) {
            messagesDiv.innerHTML = `<p style="color:var(--muted-text-color);font-size:var(--font-size-small);text-align:center;padding:.5rem">Nenhuma mensagem ainda.</p>`;
            return;
        }

        msgs.forEach(msg => {
            const mine = msg.sender_id === USER_ID;
            const div  = document.createElement("div");
            div.className = `chat-msg ${mine ? "mine" : "theirs"}`;
            div.textContent = msg.content;
            messagesDiv.appendChild(div);
        });

        if (atBottom) messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    async function sendChatMessage() {
        const content = chatInput.value.trim();
        if (!content || !currentReceiver) return;
        chatInput.value = "";
        try {
            await apiFetch("/chat/message", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sender_id: USER_ID, receiver_id: currentReceiver, content }),
            });
            await loadMessages();
        } catch (e) {
            console.error("Falha ao enviar mensagem:", e);
            toast("Falha ao enviar mensagem.");
        }
    }
}