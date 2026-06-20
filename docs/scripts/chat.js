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
        lastMessageId   = null;
        receiverName.textContent = username;

        userList.querySelectorAll("li").forEach(el => el.classList.remove("active"));
        li.classList.add("active");

        messagesDiv.innerHTML = "";
        loadMessages();
    }

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