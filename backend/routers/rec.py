"""
Serviço de recomendação da aplicação Link.

Este módulo disponibiliza os endpoints responsáveis pela
geração do feed personalizado e pela sugestão de usuários
para seguir.

Endpoints:
    GET /rec/feed/{user_id}
    GET /rec/users/{user_id}

Autores:
    Octávio X. Fúrio
"""

from fastapi import APIRouter, Query

from services.database import col, get_doc, doc_dict, user_dict
from rec_client import get_feed, get_user_suggestions

router = APIRouter(prefix="/rec")
"""
Rotas relacionadas ao sistema de recomendação.

Prefixo:
    /rec
"""

_OWN_POST_PINNED = 1


@router.get("/feed/{user_id}")
def rec_feed(user_id: str, top_k: int = Query(default=10, ge=1, le=100), offset: int = Query(default=0, ge=0)):
    """
    Retorna publicações recomendadas para um usuário.

    Na primeira página os posts mais recentes do próprio usuário são injetados
    no topo, garantindo visibilidade de publicações recém-criadas que ainda não 
    foram indexadas pela engine de recomendação (adição pós teste de usabilidade). 

    As recomendações são solicitadas à engine de recomendação. 
    Caso o serviço esteja indisponível, são retornadas as publicações mais
    recentes cadastradas, como fallback.

    Args:
        user_id: Identificador do usuário.
        top_k: Quantidade máxima de publicações retornadas.
        offset: Deslocamento utilizado no feed (scroll infinito).

    Returns:
        list: Lista de publicações recomendadas.
    """
    pinned_ids: list[str] = []
    if offset == 0:
        pinned_ids = [
            d.id for d in (
                col("posts")
                .where("user_id", "==", user_id)
                .order_by("created_at", direction="DESCENDING")
                .limit(_OWN_POST_PINNED)
                .stream()
            )
        ]

    pinned_set = frozenset(pinned_ids)

    try:
        rec_ids = get_feed(user_id, top_k, offset)
    except Exception:
        rec_ids = [d.id for d in (
            col("posts")
            .order_by("created_at", direction="DESCENDING")
            .offset(offset)
            .limit(top_k)
            .stream()
        )]

    filtered_ids = [pid for pid in rec_ids if pid not in pinned_set]
    final_ids = (pinned_ids + filtered_ids)[:top_k]

    return [doc_dict(d, "post_id") for pid in final_ids if (d := get_doc("posts", pid)).exists]


@router.get("/users/{user_id}")
def rec_users(user_id: str, top_k: int = Query(default=5, ge=1, le=50)):
    """
    Retorna sugestões de usuários para seguir.

    As recomendações são obtidas através da engine de recomendação.
    Caso o serviço esteja indisponível, são retornados os primeiros 
    usuários cadastrados no sistema, como fallback.

    Args:
        user_id: Identificador do usuário.
        top_k: Quantidade máxima de sugestões retornadas.

    Returns:
        list: Lista de usuários recomendados.
    """
    try:
        ids = get_user_suggestions(user_id, top_k)
    except Exception:
        ids = [d.id for d in col("users").limit(top_k).stream()]
    return [user_dict(d) for uid in ids if (d := get_doc("users", uid)).exists]