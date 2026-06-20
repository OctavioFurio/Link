/**
 * @fileoverview Utilitários compartilhados da aplicação Link.
 *
 * Disponibiliza funções auxiliares usadas em todas as páginas.
 *
 * @authors Murilo M. Grosso, Octávio X. Fúrio
 */

const API = "https://link-4lqo.onrender.com";
const DOMAIN = "https://octaviofurio.github.io/Link"
const TOAST_TIMER_MS = 2000;

/**
 * Realiza uma requisição autenticada à API e retorna o JSON da resposta.
 *
 * @param {string} path - Caminho do endpoint, relativo à URL base da API.
 * @param {RequestInit} [options] - Opções repassadas ao `fetch`.
 * @returns {Promise<any>} Dados retornados pela API.
 * @throws {Error} Se a resposta HTTP indicar falha.
 */
function apiFetch(path, options) {
    return fetch(`${API}${path}`, options).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
    });
}

/**
 * Escapa caracteres especiais HTML para evitar XSS.
 *
 * @param {string} s - String a ser modificada.
 * @returns {string} String com `&`, `<` e `>` substituídos pelas entidades HTML correspondentes.
 */
function escHtml(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/**
 * Exibe uma notificação temporária na tela.
 *
 * Localiza o elemento `#toast`, define seu texto e o torna
 * visível por {@link TOAST_TIMER_MS} milissegundos.
 *
 * @param {string} message - Mensagem a ser exibida.
 * @returns {void}
 */
function toast(message) {
    const el = document.getElementById("toast");
    el.textContent = message;
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), TOAST_TIMER_MS);
}

/**
 * Carrega uma imagem a partir de uma URL e retorna uma Promise.
 *
 * @param {string} src - Caminho ou URL da imagem.
 * @returns {Promise<HTMLImageElement>} Elemento de imagem carregado.
 * @throws {Error} Se o carregamento da imagem falhar.
 */
function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = () => resolve(img);
        img.onerror = reject;

        img.src = src;
    });
}

/**
 * Converte uma string de data ISO 8601 em texto relativo ao momento atual.
 *
 * @param {string} isoString - Data no formato ISO 8601.
 * @returns {string} Texto relativo como a data formatada em pt-BR.
 */
function timeAgo(isoString) {
    const diff = Date.now() - new Date(isoString).getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return "agora mesmo";
    if (minutes < 60) return `${minutes}min atrás`;
    if (hours < 24) return `${hours}h atrás`;
    if (days < 7) return `${days}d atrás`;
    return new Date(isoString).toLocaleDateString("pt-BR");
}

/**
 * Persiste os dados do usuário autenticado no localStorage.
 *
 * @param {{ user_id: string, username: string }} userData - Dados retornados pela API de autenticação.
 * @returns {void}
 */
function setLocalStorage(userData) {
    localStorage.setItem("user_id", userData.user_id);
    localStorage.setItem("username", userData.username);
}

/**
 * Encerra a sessão do usuário.
 *
 * Remove os dados do localStorage e redireciona para a página de login.
 *
 * @returns {void}
 */
function handleExit() {
    localStorage.removeItem("user_id");
    localStorage.removeItem("username");
    window.location.href = `${DOMAIN}/login`;
}