"""
Serviço de publicações da aplicação Link.

Este módulo disponibiliza os endpoints responsáveis pela
criação, consulta e interação com publicações dos usuários.

Endpoints:
    POST   /posts
    GET    /posts/{post_id}
    GET    /posts/user/{user_id}
    POST   /posts/{post_id}/like
    DELETE /posts/{post_id}/like

Autores:
    Murilo M. Grosso
    Octávio X. Fúrio
"""

import uuid

from fastapi import APIRouter, HTTPException
from google.cloud.firestore_v1 import SERVER_TIMESTAMP
from google.cloud.firestore_v1.transforms import Increment

from config import OK, MAX_LEN
from schemas import PostIn, LikeIn
from services.database import col, get_doc, doc_dict

router = APIRouter(prefix="/posts")
"""
Rotas relacionadas ao sistema de publicações.

Prefixo:
    /posts
"""


@router.post("")
def create_post(body: PostIn):
    """
    Cria uma nova publicação.

    O conteúdo é validado para garantir que não esteja
    vazio e que respeite o limite máximo de caracteres.

    Args:
        body (PostIn):
            Dados da publicação.

    Returns:
        dict:
            Identificador da publicação criada.

    Raises:
        HTTPException(400):
            Conteúdo vazio ou maior que o tamanho limite.
    """
    content = body.content.strip()
    if not content or len(content) > MAX_LEN:
        raise HTTPException(400, "Invalid content")
    pid = str(uuid.uuid4())
    col("posts").document(pid).set({
        "user_id":       body.user_id,
        "temp_username": body.temp_username,
        "content":       content[:MAX_LEN],
        "likes_count":   0,
        "created_at":    SERVER_TIMESTAMP,
    })
    return {"post_id": pid}


@router.get("/user/{user_id}")
def get_posts_by_user(user_id: str):
    """
    Retorna todas as publicações de um usuário.

    Args:
        user_id:
            Identificador do usuário.

    Returns:
        list:
            Lista de publicações criadas pelo usuário.
    """
    docs = (
        col("posts")
        .where("user_id", "==", user_id)
        .stream()
    )

    return [
        doc_dict(d, "post_id")
        for d in docs
    ]


@router.get("/{post_id}")
def get_post(post_id: str):
    """
    Retorna uma publicação pelo seu identificador.

    Args:
        post_id:
            Identificador da publicação.

    Returns:
        dict:
            Dados da publicação.
    """
    return doc_dict(get_doc("posts", post_id), "post_id")


@router.post("/{post_id}/like")
def like_post(post_id: str, body: LikeIn):
    """
    Registra uma curtida em uma publicação.

    A operação incrementa o contador de curtidas de
    forma atômica no banco de dados.

    Args:
        post_id:
            Identificador da publicação.

        body (LikeIn):
            Dados da curtida.

    Returns:
        dict:
            Resposta de sucesso.

    Raises:
        HTTPException(409):
            O usuário já curtiu a publicação.
    """
    ref = col("likes").document(f"{body.user_id}_{post_id}")
    if ref.get().exists:
        raise HTTPException(409, "Already liked")
    ref.set({"user_id": body.user_id, "post_id": post_id, "created_at": SERVER_TIMESTAMP})
    col("posts").document(post_id).update({"likes_count": Increment(1)})
    return OK


@router.delete("/{post_id}/like")
def unlike_post(post_id: str, body: LikeIn):
    """
    Remove uma curtida de uma publicação.

    A operação decrementa o contador de curtidas de
    forma atômica no banco de dados.

    Args:
        post_id:
            Identificador da publicação.

        body (LikeIn):
            Dados da curtida a ser removida.

    Returns:
        dict:
            Resposta de sucesso.

    Raises:
        HTTPException(404):
            Curtida não encontrada.
    """
    ref = col("likes").document(f"{body.user_id}_{post_id}")
    if not ref.get().exists:
        raise HTTPException(404, "Like not found")
    ref.delete()
    col("posts").document(post_id).update({"likes_count": Increment(-1)})
    return OK