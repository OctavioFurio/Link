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
    const btn = document.getElementById(isSignin ? "signin-btn" : "signup-btn");
    btn.disabled = true;
    btn.classList.add("button-selected");
    btn.textContent = isSignin ? "Entrando..." : "Cadastrando...";

    try {
        const data = await apiFetch(`/${activeAction}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        });

        localStorage.setItem("user_id", data.user_id);
        localStorage.setItem("username", data.username);

        toast(isSignin ? "Bem-vindo de volta!" : "Conta criada!");

        setTimeout(() => {
            window.location.href = "https://octaviofurio.github.io/Link";
        }, 800);

    } catch (error) {
        console.error("Auth error:", error);
        toast(isSignin ? "Falha ao entrar." : "Falha ao Cadastrar.");
    } finally {
        btn.disabled = false;
        btn.classList.remove("button-selected");
        btn.textContent = isSignin ? "Entrar" : "Cadastrar";
    }
}