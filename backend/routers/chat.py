"""
Serviço de bate-papo da aplicação Link.

Este módulo disponibiliza os endpoints responsáveis pelo
envio e recebimento de mensagens entre usuários.

Endpoints:
    POST /chat/message
    GET /chat/messages
    GET /chat/conversations/{user_id}

Autores:
    Murilo M. Grosso
    Octávio X. Fúrio
"""


import uuid

from fastapi import APIRouter, HTTPException, Query
from google.cloud.firestore_v1 import SERVER_TIMESTAMP

from config import MAX_LEN
from schemas import MessageIn
from services.database import col, chat_id

router = APIRouter(prefix="/chat")
"""
Rotas relacionadas ao sistema de mensagens privadas.

Prefixo:
    /chat
"""


@router.post("/message")
def send_message(body: MessageIn):
    """
    Envia uma mensagem particular para outro usuário.

    Caso ainda não exista uma conversa entre os dois
    participantes, ela é criada automaticamente.

    Args:
        body (MessageIn): 
            Corpo da mensagem.

    Returns:
        dict:
            Identificador da mensagem criada.

    Raises:
        HTTPException(400):
            Mensagem vazia ou maior que o tamanho limite.
    """

    content = body.content.strip()
    if not content or len(content) > MAX_LEN:
        raise HTTPException(400, "Invalid message")

    cid = chat_id(body.sender_id, body.receiver_id)
    mid = str(uuid.uuid4())

    chat_ref = col("chats").document(cid)
    if not chat_ref.get().exists:
        chat_ref.set({
            "participants": [body.sender_id, body.receiver_id],
            "created_at":   SERVER_TIMESTAMP,
        })

    chat_ref.collection("messages").document(mid).set({
        "sender_id":  body.sender_id,
        "content":    content,
        "created_at": SERVER_TIMESTAMP,
    })
    return {"message_id": mid}


@router.get("/messages")
def get_messages(
    user_a: str,
    user_b: str,
    limit: int = Query(default=30, le=100),
    after: str | None = Query(default=None),
):
    """
    Retorna as mensagens trocadas entre dois usuários.

    As mensagens são retornadas em ordem cronológica,
    limitadas pela quantidade especificada.

    Args:
        user_a: 
            ID do usuário A.

        user_b: 
            ID do usuário B.
            
        limit: 
            Quantidade máxima de mensagens retornadas
            (máximo de 100).

        after:
            ID da última mensagem já conhecida pelo cliente.
            Quando informado, retorna apenas as mensagens
            posteriores a ela, reduzindo o tráfego no refresh.

    Returns:
        list:
            Lista de mensagens ordenadas pela data de envio.
    """

    conv_ref = col("chats").document(chat_id(user_a, user_b))
    query = conv_ref.collection("messages").order_by("created_at", direction="DESCENDING")

    if after:
        snapshot = conv_ref.collection("messages").document(after).get()
        if snapshot.exists:
            query = query.end_before(snapshot)

    docs = query.limit(limit).stream()
    return list(reversed([{"message_id": d.id} | (d.to_dict() or {}) for d in docs]))


@router.get("/conversations/{user_id}")
def get_conversations(user_id: str):
    """
    Busca por todas as conversas ativas de um usuário.

    Args:
        user_id: 
            ID do usuário.

    Returns:
        list:
            Lista contendo os IDs dos usuários com os
            quais o usuário já trocou mensagens.
    """
    docs = col("chats").where("participants", "array_contains", user_id).stream()
    return [
        other
        for doc in docs
        for other in (doc.to_dict() or {}).get("participants", [])
        if other != user_id
    ]