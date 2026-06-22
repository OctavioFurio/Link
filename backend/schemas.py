"""
Modelos de dados (schemas) da aplicação Link.

Este módulo define os contratos utilizados pela API
para validação de entrada de dados.

Autores:
    Murilo M. Grosso
    Octávio X. Fúrio
"""

from pydantic import BaseModel


class LoginIn(BaseModel):
    """
    Dados de autenticação de usuário.

    Attributes:
        username: Nome de usuário.
        password: Senha em texto puro.
    """
    username: str
    password: str


class PostIn(BaseModel):
    """
    Dados para criação de uma publicação.

    Attributes:
        user_id: Identificador do autor.
        content: Conteúdo textual.
        temp_username: Username momentâneo do cliente (cache).
    """
    user_id: str
    content: str
    temp_username: str


class LikeIn(BaseModel):
    """
    Representa a ação de curtida em uma publicação.

    Attributes:
        user_id: Usuário que curtiu.
    """
    user_id: str


class FollowIn(BaseModel):
    """
    Representa a ação de seguir outro usuário.

    Attributes:
        user_id: Usuário a ser (ou deixar de ser) seguido.
    """
    user_id: str


class ColorsIn(BaseModel):
    """
    Paleta de cores do Mink.

    Attributes:
        colors: Lista de 9 inteiros (0..255).
    """
    colors: list[int]


class MessageIn(BaseModel):
    """
    Dados de envio de mensagem privada.

    Attributes:
        sender_id: Usuário remetente.
        receiver_id: Usuário destinatário.
        content: Conteúdo da mensagem.
    """
    sender_id: str
    receiver_id: str
    content: str


class BioIn(BaseModel):
    """
    Atualização da biografia do usuário.

    Attributes:
        bio: Texto da bio.
    """
    bio: str