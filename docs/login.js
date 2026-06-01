async function handleLogin(e) {
    e.preventDefault();
 
    const username = document.getElementById("username-input").value.trim();
    const password = document.getElementById("password-input").value;
 
    if (!username || !password) {
        toast("Preencha todos os campos.");
        return;
    }
 
    const btn = document.getElementById("signin-btn");
    btn.disabled = true;
    btn.textContent = "Entrando...";
 
    try {
        const res = await fetch(`${API}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        });
 
        const data = await res.json();
 
        if (!res.ok) {
            toast(data?.detail ?? "Erro ao entrar.");
            return;
        }
 
        localStorage.setItem("user_id", data.user_id);
        localStorage.setItem("username", data.username);
 
        toast(data.created ? "Conta criada!" : "Bem-vindo de volta!");
 
        setTimeout(() => {
            window.location.href = "https://octaviofurio.github.io/Link";
        }, 800);
 
    } catch (error) {
        console.error("Login error:", error);
        toast("Falha ao entrar.");
    } finally {
        btn.disabled = false;
        btn.textContent = "Entrar";
    }
}
 
document.querySelector(".login-form").addEventListener("submit", handleLogin);