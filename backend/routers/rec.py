"""
Serviço de recomendação da aplicação Link.

Este módulo disponibiliza os endpoints responsáveis pela
geração do feed personalizado e pela sugestão de usuários
para seguir.

Endpoints:
    GET /rec/feed/{user_id}
    GET /rec/users/{user_id}

Autores:
    Murilo M. Grosso
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


@router.get("/feed/{user_id}")
def rec_feed(user_id: str, top_k: int = Query(default=10, ge=1, le=100), offset: int = Query(default=0, ge=0)):
    """
    Retorna publicações recomendadas para um usuário.

    As recomendações são solicitadas à engine de
    recomendação. Caso o serviço esteja
    indisponível, são retornadas as publicações mais
    recentes cadastradas na plataforma.

    Args:
        user_id:
            Identificador do usuário.

        top_k:
            Quantidade máxima de publicações retornadas.

        offset:
            Deslocamento utilizado no feed.

    Returns:
        list:
            Lista de publicações recomendadas.
    """
    try:
        ids = get_feed(user_id, top_k)
    except Exception:
        ids = [d.id for d in (
            col("posts")
            .order_by("created_at", direction="DESCENDING")
            .offset(offset)
            .limit(top_k)
            .stream()
        )]
    return [doc_dict(d, "post_id") for pid in ids if (d := get_doc("posts", pid)).exists]


@router.get("/users/{user_id}")
def rec_users(user_id: str, top_k: int = Query(default=5, ge=1, le=50)):
    """
    Retorna sugestões de usuários para seguir.

    As recomendações são obtidas através da engine de
    recomendação. Caso o serviço esteja
    indisponível, são retornados os primeiros usuários
    cadastrados no sistema.

    Args:
        user_id:
            Identificador do usuário.

        top_k:
            Quantidade máxima de sugestões retornadas.

    Returns:
        list:
            Lista de usuários recomendados.
    """
    try:
        ids = get_user_suggestions(user_id, top_k)
    except Exception:
        ids = [d.id for d in col("users").limit(top_k).stream()]
    return [user_dict(d) for uid in ids if (d := get_doc("users", uid)).exists]