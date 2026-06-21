# Link
Uma simples rede social.
Trabalho exclusivamente para fins acadêmicos, feito por Murilo M. Grosso e Octávio X. Fúrio para as disciplinas de Sistemas Distribuídos e Introdução ao Desenvolvimento Web.

## Arquitetura do Sitema
```mermaid
graph TD
    FE[<b>Front-end</b><br><i>HTML/CSS/JS<br/>GitHub Pages</i>] <-->|REST/HTTPS| API

    API[<b>Aplicação / Back-end</b><br><i>Python + FastAPI<br/>Render Web Service</i>]

    ENG[<b>Engine de Recomendação</b><br><i>Render Private Service</i>]

    Base[(<b>Firebase</b><br><i>Firestore</i>)]

    API <-->|gRPC| ENG
    API <-->|Firebase Admin SDK / Firestore client| Base
    ENG <-->|Firebase Admin SDK / Firestore client| Base

    linkStyle default interpolate linear
```

## Front-end
 
Interface construída com **HTML5, CSS3 e JavaScript** (padrão), hospedada via **GitHub Pages**.
 
> Dado que GitHub Pages serve apenas conteúdo estático, a interatividade vem do JS, que consome a API REST descrita na seção [Back-end](#back-end).
 
---
 
### Páginas
 
| Página | Descrição |
|---|---|
| **Login** | Autenticação e Login/Cadastro via formulário |
| **Feed** | Publicações recomendadas + sugestões de usuários para seguir |
| **Perfil** | Avatar customizável (Mink), biografia e estatísticas |
 
---
 
### Scripts
 
| Módulo | Responsabilidade |
|---|---|
| `utils.js` | Requisições à API, toast de notificações, formatação de tempo relativo, sanitização anti-XSS, sessão (`localStorage`) |
| `login.js` | Autenticação e redirecionamento |
| `feed.js` | Feed, paginação por scroll infinito, curtidas, seguir, busca de usuários |
| `chat.js` | Widget de bate-papo |
| `mink.js` | Renderização do avatar em `<canvas>`, composição de camadas e colorização destas |
| `profile.js` | Edição de perfil (cores da Mink, bio) e exibição de estatísticas (seguidores, seguindo, total de curtidas) |
 
---
 
### Login
 
**Estrutura:** `<main>` com `<form>` (validação nativa do navegador) // `#toast` // `<footer>`
 
**Endpoints consumidos:** `POST /auth/signin` & `POST /auth/signup`
 
> Sessão com (`user_id`, `username`) em `localStorage` se sucesso.
 
---
 
### Feed
 
**Estrutura:** `<header>` (logotipo, `<nav>`, busca, login, (botão de sair, se logado)) // `<main>` & `<aside>` (sugestões de perfis) // widget de chat // `#toast` // `<footer>`
 
**Endpoints consumidos:**
 
| Ação | Endpoint |
|---|---|
| Carregar feed | `GET /rec/feed/{user_id}` |
| Carregar sugestões de perfis | `GET /rec/users/{user_id}` |
| Curtir / descurtir | `POST` / `DELETE /posts/{post_id}/like` |
| Buscar usuários | `GET /users/search/{query}` |
| Seguir (ou deixar de seguir) usuário | `POST` / `DELETE /{user_id}/follow` |
 
**Fluxo de carregamento:**
```
1. GET /rec/feed/{user_id}        IDs ordenados pela engine de recomendação (caso contrário, mais recentes)
2. Render imediato                Usa temp_username cacheado no doc do post (Firestore)
3. GET /users/{user_id}/profile   Async, em background: patch de username temporário (2) + cores do Mink
4. Scroll infinito                TOP_K_FEED = 10, novo lote via parâmetro offset (atualizado após scroll)
```
 
> Trade-off: o passo 3 reduz a latência percebida, porém com risco de discrepâncias entre o nome exibido e o nome atual do autor.
 
---
 
### Perfil
 
**Estrutura:** `<header>` // `<main>` // widget de chat // `#toast` // `<footer>`
 
**Endpoints consumidos:**
 
| Ação | Endpoint |
|---|---|
| Ler / atualizar cores do Mink | `GET` / `PUT /users/{user_id}/colors` |
| Ler / atualizar bio | `GET` / `PUT /users/{user_id}/bio` |
| Curtidas recebidas | `GET /users/{user_id}/likes_received` |
| Seguidores / seguindo | `GET /users/{user_id}/followers` & `GET /users/{user_id}/followings` |
| Publicações do usuário | `GET /posts/user/{user_id}` |
 
---
 
### Chat (widget)
 
Presente nas páginas Feed e Perfil, para permitir conversas privadas entre usuários.
 
**Endpoints consumidos:**
 
| Ação | Endpoint |
|---|---|
| Listar as conversas | `GET /chat/conversations/{user_id}` |
| Carregar todas as mensagens | `GET /chat/messages` |
| Enviar nova mensagem | `POST /chat/message` |
 
**Fluxo:**
- Lista de contatos = (usuários seguidos) ∪ (usuários com histórico de conversa).
- Carregamento usa o ID da última mensagem conhecida como cursor, buscando apenas mensagens novas (para reduzir leituras no Firestore)
- **Sem polling automático:** a ideia inicial usava short-polling, mas foi descartada pelo limite de leituras diárias do plano gratuito do Firestore. A atualização agora é manual, disparada por (1) abertura da aba de chat ou (2) ação explícita do usuário para checar novas mensagens.
---
 
### Componentes compartilhados
 
- **`#toast`** — notificação temporária (por 2s, alertando sobre curtidas, login, erros e atualizações), oculta por padrão, instanciada uma única vez por página.
- **Ícones SVG inline** — coleção [Feather](https://feathericons.com/), em vez de `<img>`, permitindo recolorização em tempo real via CSS/JS.
- **CSS compartilhado** — uma única folha de estilo entre as três páginas, com variáveis globais em `:root` (paleta de cores, tipografia et cetera).
- Scripts incluídos ao final do `<body>`, garantindo DOM pronto antes da execução.

## Back-end

API REST construída com **FastAPI** e hospedada no Render.com em: `https://link-4lqo.onrender.com`

---

### Serviços

| Módulo | Prefixo | Descrição |
|---|---|---|
| `auth.py` | `/auth` | Cadastro e login |
| `users.py` | `/users` | Perfil, follows, cores, bio |
| `posts.py` | `/posts` | Publicações e curtidas |
| `chat.py` | `/chat` | Mensagens entre usuários |
| `rec.py` | `/rec` | Feed e sugestões de usuários |

---

### Auth — `/auth`

#### POST `/auth/signin`
Autentica um usuário existente.

**Body:**
```json
{ "username": "string", "password": "string" }
```

**Resposta:**
```json
{ "user_id": "uuid", "username": "string" }
```

**Erros:** `404` usuário não encontrado & `401` senha incorreta

---

#### POST `/auth/signup`
Cria uma nova conta.

**Body:**
```json
{ "username": "string", "password": "string" }
```

**Resposta:**
```json
{ "user_id": "uuid", "username": "string" }
```

**Erros:** `409` username já em uso

> A senha é armazenada como hash SHA-256 com salt aleatório. **Nunca** é retornada pela API.

---

### Users — `/users`

#### GET `/users/search/{query}`
Busca usuários cujo username começa com `query`.

**Params da Query:** `top_k` (padrão: 5)

**Resposta:** lista de objetos de usuário (sem campos sensíveis).

---

#### GET `/users/{user_id}`
Retorna dados públicos de um usuário.

**Resposta:**
```json
{ "user_id": "uuid", "username": "string", "bio": "string", "mink_colors": [0..255 x 9] }
```

---

#### DELETE `/users/{user_id}`
Remove um usuário do sistema.

---

#### GET `/users/{user_id}/colors`
Retorna a paleta de cores do Mink do usuário.

**Resposta:**
```json
{ "mink_colors": [r1, g1, b1, r2, g2, b2, r3, g3, b3] }
```

> Array de 9 inteiros (0–255) representando 3 cores RGB: pelo secundário, pelo principal e fundo/olhos.

---

#### PUT `/users/{user_id}/colors`
Atualiza a paleta de cores do Mink.

**Body:**
```json
{ "colors": [r1', g1', b1', r2', g2', b2', r3', g3', b3'] }
```

---

#### GET `/users/{user_id}/bio`
Retorna a bio do usuário.

**Resposta:** `{ "bio": "string" }`

---

#### PUT `/users/{user_id}/bio`
Atualiza a bio (máx. 256 caracteres).

**Body:** `{ "bio": "string" }`

---

#### GET `/users/{user_id}/likes`
Retorna lista de `post_id`s curtidos pelo usuário.

---

#### GET `/users/{user_id}/likes_received`
Soma total de curtidas recebidas em todas as publicações do usuário.

**Resposta:** `{ "likes": number }`

---

#### GET `/users/{user_id}/followings`
Lista os IDs dos usuários que `user_id` segue.

---

#### GET `/users/{user_id}/followers`
Lista os IDs dos seguidores de `user_id`.

---

#### POST `/users/{user_id}/follow`
Segue outro usuário.

**Body:** `{ "user_id": "id_a_seguir" }`

**Erros:** `409` já segue

---

#### DELETE `/users/{user_id}/follow`
Deixa de seguir um usuário.

**Body:** `{ "user_id": "id_a_deixar_de_seguir" }`

**Erros:** `404` não estava seguindo

---

### Posts — `/posts`

#### POST `/posts`
Cria uma publicação (máx. 256 caracteres).

**Body:**
```json
{ "user_id": "uuid", "content": "string", "temp_username": "string" }
```

**Resposta:** `{ "post_id": "uuid" }`

---

#### GET `/posts/{post_id}`
Retorna uma publicação pelo ID.

**Resposta:**
```json
{
  "post_id": "uuid",
  "user_id": "uuid",
  "content": "string",
  "likes_count": 0,
  "created_at": "timestamp"
}
```

---

#### GET `/posts/user/{user_id}`
Lista todas as publicações de um usuário.

---

#### POST `/posts/{post_id}/like`
Curte uma publicação. Incrementa `likes_count` atomicamente.

**Body:** `{ "user_id": "uuid" }`

**Erros:** `409` já curtiu

---

#### DELETE `/posts/{post_id}/like`
Remove a curtida. Decrementa `likes_count` atomicamente.

**Body:** `{ "user_id": "uuid" }`

**Erros:** `404` curtida não encontrada

---

### Chat — `/chat`

#### POST `/chat/message`
Envia uma mensagem para outro usuário (máx. 256 caracteres).

**Body:**
```json
{ "sender_id": "uuid", "receiver_id": "uuid", "content": "string" }
```

**Resposta:** `{ "message_id": "uuid" }`

> O chat entre dois usuários é identificado por um ID composto (`menor_id__maior_id`), gerado automaticamente.

---

#### GET `/chat/messages`
Retorna as mensagens de uma conversa, em ordem cronológica.

**Params da Query:**

| Param | Tipo | Padrão | Máx |
|---|---|---|---|
| `user_a` | string | — | — |
| `user_b` | string | — | — |
| `limit` | int | 30 | 100 |

**Resposta:** lista de mensagens com `message_id`, `sender_id`, `content`, `created_at`.

---

#### GET `/chat/conversations/{user_id}`
Lista os IDs dos usuários com quem `user_id` já trocou mensagens.

---

### Rec — `/rec`

#### GET `/rec/feed/{user_id}`
Retorna publicações recomendadas para o usuário. Usa um serviço externo de recomendação; em caso de falha, cai para as publicações mais recentes.

**Params da Query:** `top_k` (padrão: 10) · `offset` (padrão: 0)

---

#### GET `/rec/users/{user_id}`
Retorna sugestões de usuários para seguir. Também usa o serviço de recomendação com fallback para os primeiros usuários cadastrados.

**Params da Query:** `top_k` (padrão: 5)

## Database

Para armazenar os dados, este projeto usa o **Firestore** (Firebase), e possui a seguinte estrutura:

| Coleção | Documento | Campos principais |
|---|---|---|
| `users` | `{user_id}` | `username`, `hashed_password`, `salt`, `mink_colors`, `bio` |
| `posts` | `{post_id}` | `user_id`, `content`, `likes_count`, `created_at` |
| `likes` | `{user_id}_{post_id}` | `user_id`, `post_id` |
| `follows` | `{follower_id}_{followed_id}` | `follower_id`, `followed_id` |
| `chats` | `{id_a}_{id_b}` | `participants[]` + subcoleção `messages` |
