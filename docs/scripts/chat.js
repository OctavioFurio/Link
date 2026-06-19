function initChat(userId) {
    const widget = document.getElementById("chat-widget");
    if (!widget) return;

    const chatBox      = document.getElementById("chat-box");
    const toggleBtn    = document.getElementById("chat-toggle-btn");
    const messagesDiv  = document.getElementById("chat-messages");
    const chatInput    = document.getElementById("chat-input");
    const sendBtn      = document.getElementById("chat-send-btn");
    const userList     = document.getElementById("chat-user-list");
    const receiverName = document.getElementById("chat-receiver-name");
    const refreshBtn   = document.getElementById("chat-refresh-btn");

    let chatPollInterval = null;
    let currentReceiver  = null;

    widget.style.display = "flex";

    toggleBtn.addEventListener("click", () => {
        chatBox.classList.toggle("hidden");
        if (!chatBox.classList.contains("hidden")) {
            loadChatUsers();
        } else {
            clearInterval(chatPollInterval);
        }
    });

    refreshBtn.addEventListener("click", () => loadChatUsers());

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

    function selectReceiver(uid, username, li) {
        currentReceiver = uid;
        receiverName.textContent = username;

        userList.querySelectorAll("li").forEach(el => el.classList.remove("active"));
        li.classList.add("active");

        messagesDiv.innerHTML = "";
        clearInterval(chatPollInterval);

        loadMessages();
        chatPollInterval = setInterval(loadMessages, 10000);
    }

    async function loadMessages() {
        if (!currentReceiver) return;
        try {
            const msgs = await apiFetch(`/chat/messages?user_a=${userId}&user_b=${currentReceiver}`);
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
}