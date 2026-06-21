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
        Returna
            [(post_id, cleaned_content), ...] 
        para cada post na Firestore.
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
        Retorna os posts curtidos por esse usuário, 
        ordenados por data (mais antigo primeiro).
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
        Carrega um UserProfile salvo, ou None se não houver.
    """
    doc = DB.collection("rec_profiles").document(user_id).get()
    if doc.exists:
        raw = (doc.to_dict() or {}).get("vec")
        if raw:
            return UserProfile.from_bytes(bytes(raw), vocab_size)
    return None


def _save_profile(user_id: str, profile: UserProfile) -> None:
    DB.collection("rec_profiles").document(user_id).set(
        {"vec": list(profile.to_bytes()), "n": profile.n},
        merge=True,
    )


class _State:
    __slots__ = ("space", "cand_emb", "post_ids", "content_by_id")

    def __init__(self, space, cand_emb, post_ids, content_by_id):
        self.space        = space
        self.cand_emb     = cand_emb
        self.post_ids     = post_ids # list[str]
        self.content_by_id: dict[str, str] = content_by_id  # post_id -> conteúdo sanitizado

_state: _State | None = None
_state_lock = threading.Lock()

def _build_state() -> _State:
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
    global _state
    while True:
        time.sleep(interval)
        try:
            with _state_lock:
                _state = _build_state()
        except Exception:
            log.exception("Erro no refit; mantendo antigo estado.")


def _get_state() -> _State:
    with _state_lock:
        s = _state
    if s is None:
        raise RuntimeError("Estado não inicializado.")
    return s


def _build_profile(user_id: str, state: _State) -> UserProfile:
    """
    Cria um UserProfile considerando todos os likes do usuário.

    Incremental: Se não houver tido um refit, basta considerar
    apenas as novas interações do usuário.
    """
    liked_ids = _liked_post_ids(user_id)
    if not liked_ids:
        return UserProfile(state.space.vocab_size)

    saved    = _load_profile(user_id, state.space.vocab_size)
    saved_n  = saved.n if saved is not None else 0

    # refit do tokenizador ocorreu
    if saved is not None and len(saved.vec) != state.space.vocab_size:
        saved   = None
        saved_n = 0

    profile = saved if saved is not None else UserProfile(state.space.vocab_size)

    # Só considera o novo
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

    def GetContentFeed(self, request, context):
        user_id = request.user_id
        top_k   = request.top_k or 10

        try:
            state = _get_state()
        except RuntimeError as e:
            context.abort(grpc.StatusCode.UNAVAILABLE, str(e))
            return

        profile = _build_profile(user_id, state)

        if profile.n == 0:
            recs = [(pid, 0.0) for pid in state.post_ids[-top_k:][::-1]]
        else:
            liked_ids = frozenset(_liked_post_ids(user_id))
            recs = recommend(
                profile,
                state.cand_emb,
                state.post_ids,
                top_k=top_k,
                deprioritize_ids=liked_ids,
            )

        return rec_pb2.FeedResponse(
            post_ids=[pid for pid, _ in recs],
            scores  =[s   for _, s   in recs],
        )

    def GetUserSuggestions(self, request, context):
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
    global _state
    refit_interval = int(os.getenv("REFIT_INTERVAL", "3600"))
    
    port = os.getenv("PORT", "50051")

    log.info("Building initial SemanticSpace…")
    _state = _build_state()

    t = threading.Thread(target=_refit_loop, args=(refit_interval,), daemon=True)
    t.start()

    server = grpc.server(futures.ThreadPoolExecutor(max_workers=4))
    rec_pb2_grpc.add_RecommenderServicer_to_server(RecommenderServicer(), server)
    server.add_insecure_port(f"[::]:{port}")
    server.start()
    log.info("gRPC RecEngine listening on :%s", port)
    server.wait_for_termination()


if __name__ == "__main__":
    serve()