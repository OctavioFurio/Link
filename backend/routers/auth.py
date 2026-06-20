"""
Serviço de autenticação da aplicação Link.

Este módulo disponibiliza os endpoints responsáveis pelo
cadastro e autenticação de usuários.

Endpoints:
    POST /auth/signup
    POST /auth/signin

Autores:
    Murilo M. Grosso
    Octávio X. Fúrio
"""


import uuid

from fastapi import APIRouter, HTTPException
from google.cloud.firestore_v1 import SERVER_TIMESTAMP

from config import DEFAULT_MINK_COLORS, DEFAULT_BIO
from schemas import LoginIn
from services.database import col
from services.security import make_salt, hash_password, verify_password

router = APIRouter(prefix="/auth")
"""
Rotas relacionadas ao sistema de autentificação.

Prefixo:
    /auth
"""


@router.post("/signin")
def signin(body: LoginIn):
    """
    Autentica um usuário existente.

    Busca o usuário pelo username informado e valida
    a senha utilizando o hash e o salt armazenado no banco.

    Args:
        body (LoginIn): 
            Credenciais do usuário.

    Returns:
        dict:
            user_id e username do usuário autenticado.

    Raises:
        HTTPException(404):
            Usuário não encontrado.
            
        HTTPException(401):
            Senha incorreta.
    """
    docs = list(col("users").where("username", "==", body.username).limit(1).stream())
    if not docs:
        raise HTTPException(404, "User not found")
    doc  = docs[0]
    data = doc.to_dict() or {}
    if not verify_password(body.password, data):
        raise HTTPException(401, "Incorrect password")
    return {"user_id": doc.id, "username": data["username"]}


@router.post("/signup")
def signup(body: LoginIn):
    """
    Cria uma nova conta de usuário.

    O username deve ser único no sistema. Durante o
    cadastro é gerado um UUID para identificação do
    usuário e a senha é armazenada utilizando hash
    SHA-256 com salt aleatório.

    Args:
        body (LoginIn):
            Dados de cadastro.

    Returns:
        dict:
            user_id e username da conta criada.

    Raises:
        HTTPException(409):
            Username já está em uso.
    """
    if list(col("users").where("username", "==", body.username).limit(1).stream()):
        raise HTTPException(409, "Username already in use")
    salt = make_salt()
    uid  = str(uuid.uuid4())
    col("users").document(uid).set({
        "username":        body.username,
        "salt":            salt,
        "hashed_password": hash_password(body.password, salt),
        "mink_colors":     DEFAULT_MINK_COLORS,
        "bio":             DEFAULT_BIO,
        "created_at":      SERVER_TIMESTAMP,
    })
    return {"user_id": uid, "username": body.username}