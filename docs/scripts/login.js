/**
 * @fileoverview Serviço de autenticação da aplicação Link.
 *
 * Gerencia o login e cadastro de usuários.
 *
 * @authors Murilo M. Grosso
 */

const LOGIN_TIMER_MS = 800;

const TEXTS = {
    signin: {
        button: "Entrar",
        loading: "Entrando...",
        success: "Bem-vindo de volta!",
        fail: "Falha ao entrar.",
        invalid: "Usuário ou senha incorreto(s)!",
    },
    signup: {
        button: "Cadastrar",
        loading: "Cadastrando...",
        success: "Conta criada!",
        fail: "Falha ao cadastrar.",
        invalid: "Falha, usuário já cadastrado!",
    },
    fill: "Preencha todos os campos.",
};

document.getElementById("signin-btn").addEventListener("click", () => handleSubmit("signin"));
document.getElementById("signup-btn").addEventListener("click", () => handleSubmit("signup"));

/**
 * Processa o envio do formulário de autenticação.
 *
 * Lê as credenciais do formulário, desabilita o botão
 * correspondente durante a requisição e redireciona
 * para a página principal em caso de sucesso.
 *
 * @async
 * @param {"signin" | "signup"} action - Ação a ser executada.
 * @returns {Promise<void>}
 */
async function handleSubmit(action) {
    const username = document.getElementById("username-input").value.trim();
    const password = document.getElementById("password-input").value;

    if (!username || !password) {
        toast(TEXTS.fill);
        return;
    }

    const actionTexts = TEXTS[action];
    const isSignin = action === "signin";
    const btn = document.getElementById(isSignin ? "signin-btn" : "signup-btn");

    btn.disabled = true;
    btn.textContent = actionTexts.loading;

    try {
        const res = await fetch(`${API}/auth/${action}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        });

        if (!res.ok) {
            toast(actionTexts.invalid);
            return;
        }

        const data = await res.json();

        setLocalStorage(data);
        toast(actionTexts.success);

        setTimeout(() => {
            window.location.href = DOMAIN;
        }, LOGIN_TIMER_MS);

    } catch (error) {
        console.error("Erro auth:", error);
        toast(actionTexts.fail);
    } finally {
        btn.disabled = false;
        btn.textContent = actionTexts.button;
    }
}