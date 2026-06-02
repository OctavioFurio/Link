const LOGIN_TIMER_MS = 800;

let activeAction = "signin";

document.getElementById("signin-btn").addEventListener("click", () => {
    activeAction = "signin";
});
document.getElementById("signup-btn").addEventListener("click", () => {
    activeAction = "signup";
});
document.querySelector(".login-form").addEventListener("submit", handleSubmit);

async function handleSubmit(e) {
    e.preventDefault();

    const username = document.getElementById("username-input").value.trim();
    const password = document.getElementById("password-input").value;

    if (!username || !password) {
        toast("Preencha todos os campos.");
        return;
    }

    const isSignin = activeAction === "signin";

    if(isSignin) {
        const btn = document.getElementById("signin-btn");
        const otherBtn = document.getElementById("signup-btn");
    }
    else {
        const btn = document.getElementById("signup-btn");
        const otherBtn = document.getElementById("signin-btn");
    }

    btn.disabled = true;
    otherBtn.disabled = true;
    btn.classList.add("button-selected");
    btn.textContent = isSignin ? "Entrando..." : "Cadastrando...";

    try {
        const res = await fetch(`${API}//auth/${activeAction}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        });

        if (!res.ok) {
            toast(isSignin ? "Usuário ou senha incorreto(s)!" : "Falha, usuário já cadastrado!");
            return;
        }

        const data = await res.json();

        localStorage.setItem("user_id", data.user_id);
        localStorage.setItem("username", data.username);

        toast(isSignin ? "Bem-vindo de volta!" : "Conta criada!");

        setTimeout(() => {
            window.location.href = DOMAIN;
        }, LOGIN_TIMER_MS);

    } catch (error) {
        console.error("Auth error:", error);
        toast(isSignin ? "Falha ao entrar." : "Falha ao Cadastrar.");
    } finally {
        btn.disabled = false;
        otherBtn.disabled = false;
        btn.classList.remove("button-selected");
        btn.textContent = isSignin ? "Entrar" : "Cadastrar";
    }
}