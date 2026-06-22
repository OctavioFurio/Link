"""
Serviço de usuários da aplicação Link.

Este módulo disponibiliza os endpoints responsáveis pelo
gerenciamento de perfis, relacionamentos entre usuários e
personalização da conta.

Endpoints:
    GET    /users/search/{query}
    GET    /users/{user_id}
    DELETE /users/{user_id}

    GET    /users/{user_id}/colors
    PUT    /users/{user_id}/colors

    GET    /users/{user_id}/bio
    PUT    /users/{user_id}/bio

    GET    /users/{user_id}/likes
    GET    /users/{user_id}/likes_received

    GET    /users/{user_id}/followings
    GET    /users/{user_id}/followers

    POST   /users/{user_id}/follow
    DELETE /users/{user_id}/follow

Autores:
    Murilo M. Grosso
    Octávio X. Fúrio
"""

from fastapi import APIRouter, HTTPException, Query
from google.cloud.firestore_v1 import SERVER_TIMESTAMP

from config import OK, MAX_LEN
from schemas import FollowIn, ColorsIn, BioIn
from services.database import col, get_doc, user_dict

router = APIRouter(prefix="/users")
"""
Rotas relacionadas ao sistema de gerenciamento de usuários.

Prefixo:
    /users
"""


@router.get("/search/{query}")
def search_users(query: str, top_k: int = Query(default=5, ge=1, le=50)):
    """
    Busca usuários pelo início do nome de usuário (prefix-search).

    A pesquisa retorna usuários cujo username começa com o texto informado.

    Args:
        query:Texto utilizado na busca.
        top_k: Quantidade máxima de resultados retornados.

    Returns:
        list: Lista de usuários encontrados.
    """
    docs = (
        col("users")
        .where("username", ">=", query)
        .where("username", "<=", query + "\uf8ff")
        .limit(top_k)
        .stream()
    )
    return [user_dict(d) for d in docs]


@router.get("/{user_id}/profile")
def get_user_profile(user_id: str):
    """
    Retorna dados públicos e cores do Mink de um usuário.

    Combina as informações de perfil e paleta de cores em uma única requisição.

    Args:
        user_id: Identificador do usuário.

    Returns:
        dict: Username e cores do Mink do usuário.
    """
    data = (get_doc("users", user_id).to_dict() or {})
    return {
        "user_id":     user_id,
        "username":    data.get("username"),
        "mink_colors": data.get("mink_colors"),
    }


@router.get("/{user_id}")
def get_user(user_id: str):
    """
    Retorna os dados públicos de um usuário.

    Args:
        user_id: Identificador do usuário.

    Returns:
        dict: Dados do perfil do usuário.
    """
    return user_dict(get_doc("users", user_id))


@router.delete("/{user_id}")
def delete_user(user_id: str):
    """
    Remove um usuário do sistema.

    Args:
        user_id: Identificador do usuário a ser removido.

    Returns:
        dict: Resposta de sucesso.
    """
    get_doc("users", user_id)
    col("users").document(user_id).delete()
    return OK


@router.get("/{user_id}/colors")
def get_colors(user_id: str):
    """
    Retorna a paleta de cores do Mink.

    Returns:
        dict: Vetor contendo 9 valores RGB.
    """
    return {"mink_colors": (get_doc("users", user_id).to_dict() or {}).get("mink_colors")}


@router.put("/{user_id}/colors")
def set_colors(user_id: str, body: ColorsIn):
    """
    Atualiza a paleta de cores do Mink.

    Args:
        body (ColorsIn): Nova configuração de cores.

    Returns:
        dict: Resposta de sucesso.
    """
    get_doc("users", user_id)
    col("users").document(user_id).update({"mink_colors": body.colors})
    return OK


@router.get("/{user_id}/likes")
def get_likes(user_id: str):
    """
    Retorna as publicações curtidas por um usuário.

    Args:
        user_id: Identificador do usuário.

    Returns:
        list: Lista de IDs das publicações curtidas.
    """
    return [d.to_dict()["post_id"] for d in col("likes").where("user_id", "==", user_id).stream()]


@router.get("/{user_id}/followings")
def get_followings(user_id: str):
    """
    Retorna os usuários seguidos por um usuário.

    Returns:
        list: Lista de IDs dos usuários seguidos.
    """
    return [d.to_dict()["followed_id"] for d in col("follows").where("follower_id", "==", user_id).stream()]


@router.post("/{user_id}/follow")
def follow(user_id: str, body: FollowIn):
    """
    Segue outro usuário.

    Args:
        user_id: Usuário que deseja seguir.
        body (FollowIn): Usuário a ser seguido.

    Returns:
        dict: Resposta de sucesso.

    Raises:
        HTTPException(409): Já segue o usuário.
    """
    ref = col("follows").document(f"{user_id}_{body.user_id}")
    if ref.get().exists:
        raise HTTPException(409, "Ja segue")
    ref.set({"follower_id": user_id, "followed_id": body.user_id, "created_at": SERVER_TIMESTAMP})
    return OK


@router.get("/{user_id}/followers")
def get_followers(user_id: str):
    """
    Retorna os seguidores de um usuário.

    Returns:
        list: Lista de IDs dos seguidores.
    """
    return [
        d.to_dict()["follower_id"]
        for d in col("follows")
        .where("followed_id", "==", user_id)
        .stream()
    ]


@router.delete("/{user_id}/follow")
def unfollow(user_id: str, body: FollowIn):
    """
    Deixa de seguir outro usuário.

    Args:
        user_id: Usuário que está deixando de seguir.
        body (FollowIn): Usuário que deixará de ser seguido.

    Returns:
        dict: Resposta de sucesso.

    Raises:
        HTTPException(404): Não segue o usuário.
    """
    ref = col("follows").document(f"{user_id}_{body.user_id}")
    if not ref.get().exists:
        raise HTTPException(404, "Nao seguindo")
    ref.delete()
    return OK


@router.get("/{user_id}/likes_received")
def likes_received(user_id: str):
    """
    Calcula o total de curtidas recebidas por um usuário (para perfil).

    O valor corresponde à soma das curtidas de todas
    as publicações pertencentes ao usuário.

    Args:
        user_id: Identificador do usuário.

    Returns:
        dict: Quantidade total de curtidas recebidas.
    """
    total = 0

    posts = col("posts") \
        .where("user_id", "==", user_id) \
        .stream()

    for post in posts:
        total += post.to_dict().get("likes_count", 0)

    return {"likes": total}


@router.put("/{user_id}/bio")
def set_user_bio(user_id: str, body: BioIn):
    """
    Atualiza a biografia de um usuário.

    O texto é normalizado e limitado ao tamanho máximo
    configurado pela aplicação.

    Args:
        body (BioIn): Nova biografia.

    Returns:
        dict: Resposta de sucesso.
    """
    get_doc("users", user_id)
    col("users").document(user_id).update({"bio": body.bio.strip()[:MAX_LEN]})
    return OK


@router.get("/{user_id}/bio")
def get_user_bio(user_id: str):
    """
    Retorna a biografia de um usuário.

    Returns:
        dict: Conteúdo da biografia.
    """
    doc = get_doc("users", user_id)
    return {"bio": (doc.to_dict() or {}).get("bio", "")}