// Widget de chat reutilizável. Chame initChat(userId) em qualquer página
// que tenha a marcação do widget (#chat-widget e os elementos internos).
// Se a página não tiver essa marcação, a função simplesmente não faz nada.
function initChat(userId) {
    const widget = document.getElementById("chat-widget");
    if (!widget) return;

    const chatBox       = document.getElementById("chat-box");
    const toggleBtn     = document.getElementById("chat-toggle-btn");
    const messagesDiv   = document.getElementById("chat-messages");
    const chatInput     = document.getElementById("chat-input");
    const sendBtn       = document.getElementById("chat-send-btn");
    const userList      = document.getElementById("chat-user-list");
    const receiverName  = document.getElementById("chat-receiver-name");
    const notifBadge    = document.getElementById("chat-notif-badge");

    let chatPollInterval = null;
    let currentReceiver  = null;
    let currentReceiverName = null;
    let unreadInterval = null;

    widget.style.display = "flex";

    pollUnread();
    setInterval(pollUnread, 10000);

    toggleBtn.addEventListener("click", () => {
        chatBox.classList.toggle("hidden");
        if (!chatBox.classList.contains("hidden")) {
            loadChatUsers().then(() => {
                pollUnread();
                unreadInterval = setInterval(pollUnread, 5000);
            });
        } else {
            clearInterval(unreadInterval);
        }
    });

    sendBtn.addEventListener("click", sendChatMessage);
    chatInput.addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
    });

    async function loadChatUsers() {
        userList.innerHTML = `<li style="color:var(--muted-text-color)">Carregando…</li>`;
        try {
            const [followingIds, conversationIds] = await Promise.all([
                apiFetch(`/users/${userId}/followings`),
                apiFetch(`/chat/conversations/${userId}`),
            ]);

            // Une os dois sem repetir
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

            pollUnread();
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

        loadMessages().then(() => {
            // Marca como lido: salva a contagem atual
            const msgs = messagesDiv.querySelectorAll(".chat-msg");
            setSeenCount(uid, msgs.length);
            updateBadge(li, uid, msgs.length);
        });

        chatPollInterval = setInterval(loadMessages, 3000);
    }

    async function loadMessages() {
        if (!currentReceiver) return;
        try {
            const msgs = await apiFetch(`/chat/messages?user_a=${userId}&user_b=${currentReceiver}`);
            renderMessages(msgs);

            // Conversa aberta = marcar como lido automaticamente
            setSeenCount(currentReceiver, msgs.length);
            const activeLi = userList.querySelector(`li[data-id="${currentReceiver}"]`);
            if (activeLi) updateBadge(activeLi, currentReceiver, msgs.length);
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
            const mine = msg.sender_id === userId;
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
                body: JSON.stringify({ sender_id: userId, receiver_id: currentReceiver, content }),
            });
            await loadMessages();
        } catch (e) {
            console.error("Falha ao enviar mensagem:", e);
            toast("Falha ao enviar mensagem.");
        }
    }

    // Guarda quantas mensagens cada conversa tinha na última vez que foi vista
    function getSeenCount(uid) {
        return parseInt(localStorage.getItem(`chat_seen_${uid}`) || "0");
    }
    function setSeenCount(uid, count) {
        localStorage.setItem(`chat_seen_${uid}`, count);
    }

    // Atualiza o badge de uma li
    function updateBadge(li, uid, totalCount) {
        const seen    = getSeenCount(uid);
        const unread  = totalCount - seen;
        let badge = li.querySelector(".chat-badge");

        if (unread > 0) {
            if (!badge) {
                badge = document.createElement("span");
                badge.className = "chat-badge";
                li.appendChild(badge);
            }
            badge.textContent = unread > 99 ? "99+" : unread;
        } else {
            badge?.remove();
        }
    }

    async function pollUnread() {
        // Busca IDs mesmo com o chat fechado
        let monitoredIds = [];
        try {
            const [followingIds, conversationIds] = await Promise.all([
                apiFetch(`/users/${userId}/followings`),
                apiFetch(`/chat/conversations/${userId}`),
            ]);
            monitoredIds = [...new Set([...followingIds, ...conversationIds])];
        } catch {
            // Se falhar, usa o que já está na lista visual
            monitoredIds = [...userList.querySelectorAll("li[data-id]")].map(li => li.dataset.id);
        }

        let totalUnread = 0;
        await Promise.all(monitoredIds.map(async uid => {
            try {
                const msgs = await apiFetch(`/chat/messages?user_a=${userId}&user_b=${uid}`);
                totalUnread += Math.max(0, msgs.length - getSeenCount(uid));

                // Atualiza badge na lista visual se o item já existir
                const li = userList.querySelector(`li[data-id="${uid}"]`);
                if (li) updateBadge(li, uid, msgs.length);
            } catch {}
        }));

        if (totalUnread > 0) {
            notifBadge.textContent = totalUnread > 99 ? "99+" : totalUnread;
            notifBadge.style.display = "flex";
        } else {
            notifBadge.style.display = "none";
        }
    }
}