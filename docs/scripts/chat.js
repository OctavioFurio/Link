/**
 * @fileoverview Sistema de chat privado da aplicação Link.
 *
 * Gerencia a interface do widget de mensagens, incluindo
 * a listagem de contatos, seleção de conversa, envio e
 * recebimento incremental de mensagens via refresh manual.
 *
 * @authors Murilo M. Grosso
 */

/**
 * Inicializa o widget de chat para o usuário autenticado.
 *
 * @param {string} userId - ID do usuário autenticado.
 * @returns {void}
 */
function initChat(userId) {
    const widget = document.getElementById("chat-widget");
    if (!widget) return;

    const chatBox = document.getElementById("chat-box");
    const chatInput = document.getElementById("chat-input");
    const sendBtn = document.getElementById("chat-send-btn");
    const userList = document.getElementById("chat-user-list");
    const toggleBtn = document.getElementById("chat-toggle-btn");
    const messagesDiv = document.getElementById("chat-messages");
    const refreshBtn = document.getElementById("chat-refresh-btn");
    const receiverName = document.getElementById("chat-receiver-name");

    let currentReceiver = null;
    let lastMessageId   = null;

    widget.style.display = "flex";

    toggleBtn.addEventListener("click", () => {
        chatBox.classList.toggle("hidden");
        if (!chatBox.classList.contains("hidden")) {
            loadChatUsers();
        }
    });

    refreshBtn.addEventListener("click", () => {
        if (currentReceiver) loadMessages(true);
        else loadChatUsers();
    });

    sendBtn.addEventListener("click", sendChatMessage);
    chatInput.addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
    });

    /**
     * Carrega a lista de contatos disponíveis para conversa.
     *
     * Combina os usuários seguidos com os que já tiveram conversas,
     * removendo duplicatas, e renderiza cada um como item clicável.
     *
     * @async
     * @returns {Promise<void>}
     */
    async function loadChatUsers() {
        userList.innerHTML = `<li style="color:var(--muted-text-color)">Carregando…</li>`;
        try {
            const [followingIds, conversationIds] = await Promise.all([
                apiFetch(`/users/${userId}/followings`),
                apiFetch(`/chat/conversations/${userId}`),
            ]);

            const allIds = [...new Set([...followingIds, ...conversationIds])];

            userList.innerHTML = "";
            if (!allIds.length) {
                userList.innerHTML = `<li style="color:var(--muted-text-color)">Ninguém ainda.</li>`;
                return;
            }

            await Promise.all(allIds.map(async uid => {
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

    /**
     * Seleciona um destinatário e abre a conversa correspondente.
     *
     * Reseta o estado da conversa anterior, marca o item como ativo
     * na lista e carrega as mensagens do início.
     *
     * @param {string} uid - ID do usuário selecionado.
     * @param {string} username - Nome do usuário selecionado.
     * @param {HTMLLIElement} li - Elemento da lista que foi clicado.
     * @returns {void}
     */
    function selectReceiver(uid, username, li) {
        currentReceiver = uid;
        lastMessageId   = null;
        receiverName.textContent = username;

        userList.querySelectorAll("li").forEach(el => el.classList.remove("active"));
        li.classList.add("active");

        messagesDiv.innerHTML = "";
        loadMessages();
    }

    /**
     * Busca mensagens da conversa ativa.
     *
     * Quando `full` é `false`, usa `lastMessageId` para buscar
     * apenas mensagens novas. Quando `full` é `true`, recarrega 
     * toda a conversa do início.
     *
     * @async
     * @param {boolean} [full=false] - Se `true`, recarrega todas as mensagens.
     * @returns {Promise<void>}
     */
    async function loadMessages(full = false) {
        if (!currentReceiver) return;
        try {
            const after = (!full && lastMessageId) ? `&after=${lastMessageId}` : "";
            const msgs  = await apiFetch(`/chat/messages?user_a=${userId}&user_b=${currentReceiver}${after}`);
            if (msgs.length) renderMessages(msgs, full);
        } catch (e) {
            console.error("Falha ao carregar mensagens:", e);
        }
    }

    /**
     * Renderiza mensagens no painel da conversa.
     *
     * Em modo incremental, acrescenta as mensagens ao final do DOM.
     * Em modo completo (`full`), limpa o painel antes de renderizar.
     * Mantém o scroll no fundo se o usuário já estava lá.
     *
     * @param {Object[]} msgs - Lista de mensagens retornadas pela API.
     * @param {boolean} [full=false] - Se `true`, limpa o painel antes de renderizar.
     * @returns {void}
     */
    function renderMessages(msgs, full = false) {
        const atBottom = messagesDiv.scrollHeight - messagesDiv.scrollTop <= messagesDiv.clientHeight + 40;

        if (full) messagesDiv.innerHTML = "";

        if (!msgs.length && full) {
            messagesDiv.innerHTML = `<p style="color:var(--muted-text-color);font-size:var(--font-size-small);text-align:center;padding:.5rem">Nenhuma mensagem ainda.</p>`;
            return;
        }

        msgs.forEach(msg => {
            const mine = msg.sender_id === userId;
            const div  = document.createElement("div");
            div.className = `chat-msg ${mine ? "mine" : "theirs"}`;
            div.textContent = msg.content;
            messagesDiv.appendChild(div);
        });

        lastMessageId = msgs[msgs.length - 1].message_id;

        if (atBottom) messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    /**
     * Envia a mensagem digitada para o destinatário ativo.
     *
     * Limpa o campo de input antes do envio e atualiza
     * as mensagens em caso de sucesso.
     *
     * @async
     * @returns {Promise<void>}
     */
    async function sendChatMessage() {
        const content = chatInput.value.trim();
        if (!content || !currentReceiver) return;
        chatInput.value = "";
        try {
            await apiFetch("/chat/message", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sender_id: userId, receiver_id: currentReceiver, content }),
            });
            await loadMessages();
        } catch (e) {
            console.error("Falha ao enviar mensagem:", e);
            toast("Falha ao enviar mensagem.");
        }
    }
}