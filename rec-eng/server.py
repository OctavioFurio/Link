"""
Engine de recomendação (gRPC)

Ao inicializar:
    1. Busca todos os posts da Firestore, treina SemanticSpace, cria matriz de posts candidatos.
    2. Re-treina a cada REFIT_INTERVAL segundos em segundo plano.
    3. A cada chamada de GetContentFeed: carrega lista de likes do usuário (Firestore),
       cria/atualiza seu perfil, o salva, retorna recomendações.

Variáveis do ambiente
---------------------
PORT                     Porta do gRPC                       (default: 50051)
REFIT_INTERVAL           Segundos entre re-treinos           (default: 3600 (1 hora))
FIREBASE_SERVICE_ACCOUNT JSON do Service Account do Firebase (obrigatório)

Autores:
    Murilo M. Grosso
    Octávio X. Fúrio
"""

import os
import json
import time
import logging
import threading
from concurrent import futures

import grpc
import numpy as np

import rec_pb2
import rec_pb2_grpc
from recommender import SemanticSpace, UserProfile, recommend, clean_text
from sklearn.preprocessing import normalize

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

import firebase_admin
from firebase_admin import credentials, firestore as fs

if not firebase_admin._apps:
    _sa = json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT"])
    firebase_admin.initialize_app(credentials.Certificate(_sa))

DB = fs.client()


def _all_posts() -> list[tuple[str, str]]:
    """
    Busca e limpa todos os posts disponíveis na Firestore.

    Percorre todos os posts, limpa o campo content de cada documento 
    com clean_text (de recommender.py) e descarta posts onde o resultado
    tenha menos de 8 caracteres (insuficientes para treino/embedding).

    Returns:
        list[tuple[str, str]]: Lista de pares (post_id, cleaned_content),
        um para cada post válido pós-limpeza encontrado. A ordem segue a
        ordem de iteração retornada pelo Firestore (não garantida).
    """
    out = []
    for d in DB.collection("posts").stream():
        data = d.to_dict() or {}
        content = clean_text(data.get("content", ""))
        if len(content) >= 8:
            out.append((d.id, content))
    return out


def _liked_post_ids(user_id: str) -> list[str]:
    """
    Lista os IDs dos posts curtidos por um usuário.

    Consulta a coleção likes filtrando por user_id e ordenando
    pelo campo created_at em ordem crescente, tal que o primeiro
    elemento da lista seja o like mais antigo, e o último, o mais
    recente.

    Args:
        user_id: ID do usuário cujos likes serão buscados.

    Returns:
        list[str]: IDs dos posts curtidos, ordenados do mais antigo para
        o mais recente. Lista vazia caso o usuário não tenha curtido
        nenhum post ainda (implicando cold-start)
    """
    docs = (
        DB.collection("likes")
        .where("user_id", "==", user_id)
        .order_by("created_at")
        .stream()
    )
    return [d.to_dict().get("post_id", "") for d in docs]


def _load_profile(user_id: str, vocab_size: int) -> UserProfile | None:
    """
    Carrega o perfil de recomendação salvo de um usuário.

    Busca o documento do usuário na coleção rec_profiles e, se
    existir e tiver um vetor armazenado, o desserializa em
    um UserProfile a ser usado para as recomendações.

    Args:
        user_id: ID do usuário cujo perfil será carregado.
        vocab_size: Tamanho do vocabulário do SemanticSpace
        atual, usado para reconstruir o vetor a partir dos bytes salvos.

    Returns:
        UserProfile | None: O perfil salvo do usuário, ou None, se
        não houver perfil salvo (e.g. usuário novo).
    """
    doc = DB.collection("rec_profiles").document(user_id).get()
    if doc.exists:
        raw = (doc.to_dict() or {}).get("vec")
        if raw:
            return UserProfile.from_bytes(bytes(raw), vocab_size)
    return None


def _save_profile(user_id: str, profile: UserProfile) -> None:
    """
    Persiste o perfil de recomendação de um usuário na Firestore.

    Serializa o vetor do perfil e grava (com merge) o documento do
    usuário na coleção rec_profiles, junto com o número 'n' de likes
    já incorporados ao perfil (para detectar quais likes não foram 
    processados ainda).

    Args:
        user_id: ID do usuário cujo perfil será salvo.
        profile: Perfil (atualizado) a ser persistido.
    """
    DB.collection("rec_profiles").document(user_id).set(
        {"vec": list(profile.to_bytes()), "n": profile.n},
        merge=True,
    )


class _State:
    """ 
    Snapshot constante do estado de recomendação carregado em memória.

    Cada re-treino (_build_state) produz um novo _State, que é trocado
    atomicamente em _state sob _state_lock, por segurança.
    Isso permite que requisições em andamento continuem usando o
    estado antigo enquanto um novo é construído em segundo plano.

    Attributes:
        space: Instância de SemanticSpace treinada, usada para gerar 
        embeddings de novos textos, quando requisitado.
        cand_emb: Matriz esparsa (e L2-normalizada) com o embedding de
        cada post candidato, na mesma ordem de post_ids.
        post_ids: Lista de IDs dos posts, alinhada por índice com as
        linhas de cand_emb.
        content_by_id: Mapa de post_id para o conteúdo limpo do post, 
        usado para evitar releituras à Firestore.
    """

    __slots__ = ("space", "cand_emb", "post_ids", "content_by_id")

    def __init__(self, space, cand_emb, post_ids, content_by_id):
        """
        Inicializa o snapshot de estado.

        Args:
            space: SemanticSpace treinado.
            cand_emb: Matriz de embeddings dos posts candidatos.
            post_ids: IDs dos posts, alinhados com cand_emb.
            content_by_id: Mapa de post_id para conteúdo limpo.
        """
        self.space        = space
        self.cand_emb     = cand_emb
        self.post_ids     = post_ids
        self.content_by_id: dict[str, str] = content_by_id

_state: _State | None = None
_state_lock = threading.Lock()

def _build_state() -> _State:
    """
    Constrói um novo snapshot de estado a partir da Firestore.

    Busca todos os posts disponíveis, treina um novo
    SemanticSpace sobre o conjunto de conteúdo único e
    calcula a matriz de embeddings L2-normalizados de todos os posts
    (incluindo duplicatas).

    Returns:
        _State: Novo snapshot.

    Raises:
        RuntimeError: Se não houver nenhum post válido na Firestore.
    """
    log.info("Carregando posts")
    pairs = _all_posts()
    if not pairs:
        raise RuntimeError("Sem posts na Firestore. SemanticSpace não existe.")

    post_ids, contents = zip(*pairs)
    post_ids = list(post_ids)
    contents = list(contents)
    content_by_id = dict(zip(post_ids, contents))

    fit_corpus = list(dict.fromkeys(contents))
    
    space = SemanticSpace(vocab_size=8000, min_df=1)
    space.fit(fit_corpus)

    cand_emb = normalize(space.vectorizer.transform(contents), norm="l2", axis=1)

    log.info(
        "SemanticSpace pronto. Treinado com %d posts, vocab=%d, matrix de %.0f KB",
        len(post_ids), space.vocab_size,
        (cand_emb.data.nbytes + cand_emb.indices.nbytes + cand_emb.indptr.nbytes) / 1024,
    )
    return _State(space, cand_emb, post_ids, content_by_id)


def _refit_loop(interval: int) -> None:
    """
    Método em segundo-plano que re-treina o estado periodicamente.

    Dorme por interval segundos, reconstrói o estado com
    _build_state e o publica em _state sob _state_lock.
    Roda indefinidamente em uma thread daemon.
    Erros durante o re-treino são logados e o estado anterior 
    é mantido em uso.

    Args:
        interval: Intervalo em segundos entre cada tentativa de re-treino.
    """
    global _state
    while True:
        time.sleep(interval)
        try:
            with _state_lock:
                _state = _build_state()
        except Exception:
            log.exception("Erro no refit; mantendo antigo estado.")


def _get_state() -> _State:
    """
    Retorna o snapshot de estado em uso no momento.

    Returns:
        _State: Estado de recomendação corrente.

    Raises:
        RuntimeError: Se o estado ainda não tiver sido inicializado.
    """
    with _state_lock:
        s = _state
    if s is None:
        raise RuntimeError("Estado não inicializado.")
    return s


def _build_profile(user_id: str, state: _State) -> UserProfile:
    """
    Obtém o perfil de um usuário.

    Cria um UserProfile considerando todos os likes do usuário.

    Incremental: Se não houver tido um refit, basta considerar
    apenas as novas interações do usuário. O método carrega o perfil
    previamente salvo (se houver e for compatível com o vocabulário
    atual), identifica quais likes ainda não foram incorporados
    (com base em saved.n) e atualiza o perfil apenas com esses
    likes novos, usando o embedding em cache (content_by_id) ou,
    se não houver, buscando o post na Firestore.

    Caso novos likes tenham sido processados, o perfil resultante é
    persistido através de _save_profile.

    Args:
        user_id: ID do usuário cujo perfil será construído/atualizado.
        state: Snapshot de estado atual, para embeddings e cache de conteúdo.

    Returns:
        UserProfile: Perfil atualizado do usuário. Caso o usuário seja novo
        no Link (i.e. sem interações), retorna um perfil vazio.
    """
    liked_ids = _liked_post_ids(user_id)
    if not liked_ids:
        return UserProfile(state.space.vocab_size)

    saved    = _load_profile(user_id, state.space.vocab_size)
    saved_n  = saved.n if saved is not None else 0

    if saved is not None and len(saved.vec) != state.space.vocab_size:
        saved   = None
        saved_n = 0

    profile = saved if saved is not None else UserProfile(state.space.vocab_size)

    new_liked_ids = liked_ids[saved_n:]
    for pid in new_liked_ids:
        content = state.content_by_id.get(pid)
        if not content:
            doc = DB.collection("posts").document(pid).get()
            if not doc.exists:
                continue
            content = clean_text((doc.to_dict() or {}).get("content", ""))
        if content:
            profile.update(state.space.embed_one(content), weight=1.0)

    if new_liked_ids:
        _save_profile(user_id, profile)

    return profile


class RecommenderServicer(rec_pb2_grpc.RecommenderServicer):
    """
    Implementação do serviço gRPC Recommender.

    Expõe os dois RPCs definidos em rec_pb2_grpc: 
    GetContentFeed, para recomendar posts a um usuário, e 
    GetUserSuggestions, para sugerir outros usuários a seguir 
    com base no perfil de interesses do usuário.
    """

    def GetContentFeed(self, request, context):
        """
        Retorna um feed de posts recomendados para o usuário.

        Constrói/atualiza o perfil do usuário, busca os top_k
        posts mais similares ao perfil (priorizando posts não
        curtidos) e aplica paginação por offset. Caso o usuário
        ainda não tenha um perfil (nenhum like), retorna os posts
        mais recentes como fallback padrão.

        Args:
            request: Mensagem FeedRequest contendo:
                user_id (str): ID do usuário.
                top_k (int): Quantidade de posts desejados (Padrão: 10).
                offset (int): Quantidade de itens a pular, para paginação (max(offset, 0)).
            context: Contexto gRPC da chamada, usado para lidar com erros.

        Returns:
            rec_pb2.FeedResponse: Resposta contendo post_ids e
            scores paralelos, na ordem de relevância decrescente.
            Em caso de estado não inicializado, a chamada é abortada e nada é retornado.
        """
        user_id = request.user_id
        top_k   = request.top_k or 10
        offset  = max(0, request.offset)

        try:
            state = _get_state()
        except RuntimeError as e:
            context.abort(grpc.StatusCode.UNAVAILABLE, str(e))
            return

        profile = _build_profile(user_id, state)

        fetch_k = top_k + offset

        if profile.n == 0:
            recs = [(pid, 0.0) for pid in state.post_ids[-fetch_k:][::-1]]
        else:
            liked_ids = frozenset(_liked_post_ids(user_id))
            recs = recommend(
                profile,
                state.cand_emb,
                state.post_ids,
                top_k=fetch_k,
                deprioritize_ids=liked_ids,
            )

        recs = recs[offset:]

        return rec_pb2.FeedResponse(
            post_ids=[pid for pid, _ in recs],
            scores  =[s   for _, s   in recs],
        )

    def GetUserSuggestions(self, request, context):
        """
        Sugere usuários para seguir com base no perfil de interesses.

        Calcula a similaridade entre o perfil do usuário e os embeddings
        de cada post candidato, atribuindo a cada autor o maior score
        entre os posts dele. 
        Autores que o usuário já segue (e o próprio usuário) são excluídos. 
        Caso o usuário não tenha perfil (nenhum like), retorna uma lista 
        qualquer de usuários quaisquer como fallback, excluindo quem é seguido.

        Args:
            request: Mensagem UserRequest contendo:
                user_id (str): ID do usuário solicitante.
                top_k (int): Quantidade de sugestões desejadas (padrão: 5).
            context: Contexto gRPC da chamada, usado para lidar com erros.

        Returns:
            rec_pb2.UserResponse: Resposta contendo user_ids e
            scores paralelos, ordenados por score decrescente.
            Em caso de estado não inicializado, a chamada é abortada
            com grpc.StatusCode.UNAVAILABLE e nada é retornado.

        P.S.:
            A implementação faz uma leitura à Firestore por post
            candidato (DB.collection("posts").document(pid).get())
            para descobrir o autor, o que é um tanto ineficiente.
            Como é um modelo miniatura, não é tão problemático, 
            mas admitimos que para escalar o modelo, precisaríamos
            de uma abordagem mais eficaz.
        """
        user_id = request.user_id
        top_k   = request.top_k or 5

        try:
            state = _get_state()
        except RuntimeError as e:
            context.abort(grpc.StatusCode.UNAVAILABLE, str(e))
            return

        follow_docs     = DB.collection("follows").where("follower_id", "==", user_id).stream()
        already_follows = frozenset(d.to_dict().get("followed_id", "") for d in follow_docs) | {user_id}

        profile = _build_profile(user_id, state)

        if profile.n == 0:
            fallback = [
                d.id for d in DB.collection("users").limit(top_k * 3).stream()
                if d.id not in already_follows
            ][:top_k]
            return rec_pb2.UserResponse(user_ids=fallback, scores=[0.0] * len(fallback))

        sims = np.asarray(state.cand_emb.dot(profile.vec)).ravel()
        author_score: dict[str, float] = {}
        for i, pid in enumerate(state.post_ids):
            doc = DB.collection("posts").document(pid).get()
            if not doc.exists:
                continue
            author = (doc.to_dict() or {}).get("user_id", "")
            if author and author not in already_follows:
                author_score[author] = max(author_score.get(author, -1.0), float(sims[i]))

        ranked   = sorted(author_score.items(), key=lambda x: x[1], reverse=True)[:top_k]
        user_ids = [u for u, _ in ranked]
        scores   = [s for _, s in ranked]

        return rec_pb2.UserResponse(user_ids=user_ids, scores=scores)


def serve():
    """
    Inicializa o estado e sobe o servidor gRPC.

    Constrói o estado inicial de forma síncrona (bloqueante), inicia
    a thread do Daemon de re-treino em segundo plano (_refit_loop) 
    e registra o RecommenderServicer em um servidor gRPC com um pool 
    de até 4 threads, escutando na porta definida por PORT (ou 50051).
    
    Bloqueia a thread principal até o servidor ser encerrado.

    Variáveis de ambiente usadas:
        PORT: Porta TCP em que o servidor gRPC escuta (padrão: 50051).
        REFIT_INTERVAL: Intervalo em segundos entre re-treinos (padrão: 3600).
    """
    global _state
    refit_interval = int(os.getenv("REFIT_INTERVAL", "3600"))
    
    port = os.getenv("PORT", "50051")

    log.info("Criando SemanticSpace…")
    _state = _build_state()

    t = threading.Thread(target=_refit_loop, args=(refit_interval,), daemon=True)
    t.start()

    server = grpc.server(futures.ThreadPoolExecutor(max_workers=4))
    rec_pb2_grpc.add_RecommenderServicer_to_server(RecommenderServicer(), server)
    server.add_insecure_port(f"[::]:{port}")
    server.start()
    log.info("gRPC RecEngine ouvindo porta %s", port)
    server.wait_for_termination()


if __name__ == "__main__":
    serve()