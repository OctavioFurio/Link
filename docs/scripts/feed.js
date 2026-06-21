/**
 * @fileoverview Funcionalidades do feed principal da aplicação Link.
 *
 * Carrega o feed e as sugestões, e permite a criação e interação entre posts de usuários.
 *
 * @authors Murilo M. Grosso, Octávio X. Fúrio
 */

const TOP_K_FEED = 10;
const TOP_K_SEARCH = 5;
const MAX_POST_LEN = 256;

const USER_ID = localStorage.getItem("user_id");
const TEMP_USERNAME = localStorage.getItem("username");
const IS_LOGGED = USER_ID && USER_ID != "undefined";

const COMPOSE_TEXTAREA = document.getElementById("post-input");

let feedOffset = 0;
let feedEnded = false;
let feedLoading = false;

let minkLayers = null;

(IS_LOGGED ? loadLogged : loadNotLogged)();

loadFeed(true);
loadMinkLayers().then(layers => { minkLayers = layers; });

window.addEventListener("scroll", () => {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 400) 
        loadFeed();
});

/**
 * Versão da página principal se estiver logado.
 *
 * Inicializa botões, chat privado e sugestões.
 * 
 * @returns {void}
 */
function loadLogged() {
    updateProfBtn();

	document.getElementById("post-btn").addEventListener("click", handleNewPost);
	document.getElementById("search-btn").addEventListener("click", handleSearch);
	COMPOSE_TEXTAREA.addEventListener("input", handleInputCounter);

    initChat(USER_ID);
    loadSuggestions();
}

/**
 * Versão da página principal se não estiver logado.
 *
 * Remove conteúdos do site.
 * 
 * @returns {void}
 */
function loadNotLogged() {
  	document.querySelector('.main-content').style.gridTemplateColumns = '1fr';
  	document.querySelector('.sidebar').style.display = 'none';
  	document.querySelector('#search-input').style.display = 'none';
  	document.querySelector('#search-btn').style.display = 'none';
	
	const compose = document.querySelector('.compose');
	compose.classList.remove('compose');
	compose.classList.add('footnote');
	compose.innerHTML = "Faça login para criar, interagir e conectar!";
}


/**
 * Renderiza o Mink de um post em um canvas.
 *
 * Ignora se as camadas ou cores ainda não estiverem carregadas.
 *
 * @param {HTMLCanvasElement} canvas - Canvas alvo da renderização.
 * @param {number[]} colors - Vetor de 9 valores RGB representando as cores do Mink.
 * @returns {void}
 */
function drawPostMink(canvas, colors) {
    if (!colors || !minkLayers || !canvas) return;
    renderMink(canvas, colors, minkLayers);
}

/**
 * Atualiza o botão de perfil.
 *
 * Se estiver logado, muda o texto do botão de perfil para o nome do usuário.
 * Também exibe o nome do usuário na caixa para escrever posts.
 * 
 * @returns {void}
 */
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

/**
 * Carrega e exibe posts do feed recomendado.
 *
 * Suporta paginação via scroll infinito. Quando `reset` é `true`,
 * reinicia o offset e limpa o container antes de renderizar.
 * Busca o perfil de cada autor em paralelo para atualizar nome e Mink.
 *
 * @async
 * @param {boolean} [reset=false] - Se `true`, reinicia o feed do início.
 * @returns {Promise<void>}
 */
async function loadFeed(reset = false) {
    if (feedLoading || (feedEnded && !reset))
        return;

    feedLoading = true;

    const container = document.getElementById("posts-container");

    if (reset) {
        feedOffset = 0;
        feedEnded = false;

        container.innerHTML = `
            <div style='padding:1rem;text-align:center'>
                <img src="images/Mink-run.gif"
                     alt="Jink, a fuinha, saltando."
                     style='width:200px'>
            </div>
        `;
    }

    try {
        const posts = await apiFetch(
            `/rec/feed/${USER_ID}?top_k=${TOP_K_FEED}&offset=${feedOffset}`
        );

        if (!posts.length) {
            feedEnded = true;

            if (feedOffset === 0)
                setFeedMessage(container, "Sem postagens ainda.");

            return;
        }

        const [likedIds, followingIds] = IS_LOGGED
            ? await Promise.all([
                apiFetch(`/users/${USER_ID}/likes`),
                apiFetch(`/users/${USER_ID}/followings`),
            ])
            : [[], []];

        const likedSet = new Set(likedIds);
        const followingSet = new Set(followingIds);

        if (reset)
            container.innerHTML = "";

        const postElements = posts.map(post => {
            const el = renderPost(
                post,
                post.temp_username,
                likedSet.has(post.post_id)
            );

            container.appendChild(el);

            return el;
        });

        posts.forEach(async (post, i) => {
            try {
                const profile = await apiFetch(`/users/${post.user_id}/profile`);
                updatePostUsername(postElements[i], profile.username);
                drawPostMink(postElements[i].querySelector(".post-mink"), profile.mink_colors);

                const followBtn = postElements[i].querySelector(".follow-btn");
                if (followBtn) {
                    const already = followingSet.has(post.user_id);
                    followBtn.classList.toggle("following", already);
                    followBtn.textContent = already ? "Seguindo" : "Seguir";
                }
            } catch {}
        });

        feedOffset += posts.length;

        if (posts.length < TOP_K_FEED)
            feedEnded = true;

    } catch (error) {
        console.error("Fail to load feed:", error);

        if (feedOffset === 0)
            setFeedMessage(
                container,
                "Falha ao carregar postagens."
            );
    } finally {
        feedLoading = false;
    }
}

/**
 * Exibe uma mensagem centralizada no container do feed.
 *
 * @param {HTMLElement} container - Elemento onde a mensagem será exibida.
 * @param {string} message - Texto a ser exibido.
 * @returns {void}
 */
function setFeedMessage(container, message) {
  container.innerHTML = `
    <p style='color:var(--muted-text-color);padding:1rem'>
        ${message}
    </p>`;
}


/**
 * Cria e retorna o elemento HTML de um post.
 *
 * Inclui o canvas do Mink, autor, tempo relativo, conteúdo
 * e botão de curtida (apenas para usuários autenticados).
 *
 * @param {Object} post - Dados do post retornados pela API.
 * @param {string} username - Nome em cache de usuário a exibir.
 * @param {boolean} [liked=false] - Se o usuário autenticado já curtiu o post.
 * @returns {HTMLElement} Elemento `<article>` do post pronto para inserção no DOM.
 */
function renderPost(post, username, liked = false) {
    const card = document.createElement("article");
    card.className = "post-card";
    const proprio = post.user_id === USER_ID;

    card.innerHTML = `
        <div class="post-meta">
            <canvas class="post-mink" width="36" height="36"></canvas>
            <span class="post-author">${username}</span>
            | ${timeAgo(post.created_at)}
        </div>
        <div class="post-content">${escHtml(post.content)}</div>

        ${IS_LOGGED ? `
            <div class="post-actions">
                <button class="like-btn${liked ? " liked" : ""}"
                        data-id="${post.post_id}"
                        data-likes="${post.likes_count}">
                    ${liked ? "♥" : "♡"} ${post.likes_count}
                </button>
                ${!proprio ? `
                    <button class="follow-btn"
                            data-id="${post.user_id}"
                            style="margin-left:auto">
                        Seguir
                    </button>
                ` : ""}
            </div>
        ` : ""}
    `;

    if (IS_LOGGED) {
        card.querySelector(".like-btn")?.addEventListener("click", e =>
            toggleLike(e.currentTarget));
        card.querySelector(".follow-btn")?.addEventListener("click", e =>
            toggleFollow(e.currentTarget));
    }
    return card;
}

/**
 * Alterna a curtida de um post.
 *
 * Atualiza a UI otimisticamente e reverte em caso de erro na API.
 *
 * @async
 * @param {HTMLButtonElement} btn - Botão de curtida que disparou o evento.
 * @returns {Promise<void>}
 */
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

/**
 * Atualiza o nome do autor exibido em um post.
 *
 * Usado para substituir o username temporário pelo dado oficial da API.
 *
 * @param {HTMLElement} postElement - Elemento do post no DOM.
 * @param {string} username - Username definitivo a exibir.
 * @returns {void}
 */
function updatePostUsername(postElement, username) {
    postElement.querySelector(".post-author").textContent = username;
}

/**
 * Carrega e exibe sugestões de usuários para seguir.
 *
 * Busca recomendações da engine e marca os que o usuário já segue.
 *
 * @async
 * @returns {Promise<void>}
 */
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

/**
 * Exibe uma mensagem de estado dentro de uma lista.
 *
 * @param {HTMLUListElement} list - Elemento `<ul>` alvo.
 * @param {string} message - Texto a ser exibido como item da lista.
 * @returns {void}
 */
function setListMessage(list, message) {
    list.innerHTML = `<li style='color:var(--muted-text-color)'>${message}</li>`;
}

/**
 * Cria e retorna o elemento `<li>` de um usuário sugerido.
 *
 * Inclui o nome do usuário e um botão para seguir/deixar de seguir.
 *
 * @param {Object} user - Dados do usuário retornados pela API.
 * @param {boolean} [following=false] - Se o usuário autenticado já segue este usuário.
 * @returns {HTMLLIElement} Elemento `<li>` pronto para inserção no DOM.
 */
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

/**
 * Alterna o estado de seguir/deixar de seguir um usuário.
 *
 * Atualiza a UI otimisticamente e reverte em caso de erro na API.
 *
 * @async
 * @param {HTMLButtonElement} btn - Botão de seguir que disparou o evento.
 * @returns {Promise<void>}
 */
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

/**
 * Processa o envio de uma nova publicação.
 *
 * Lê o conteúdo do textarea, envia para a API e recarrega o feed em caso de sucesso.
 *
 * @async
 * @returns {Promise<void>}
 */
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
        loadFeed(true);
    } catch (error) {
        console.error("Fail to post:", error);
        toast("Falha ao publicar, tente novamente.");
    }
}

/**
 * Processa a busca de usuários pelo campo de pesquisa.
 *
 * Exibe os resultados no painel de sugestões com o estado de seguir atualizado.
 *
 * @async
 * @returns {Promise<void>}
 */
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

/**
 * Atualiza o contador de caracteres do textarea de composição.
 *
 * Destaca o contador em vermelho ao atingir o limite máximo.
 *
 * @returns {void}
 */
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