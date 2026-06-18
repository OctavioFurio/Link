import uuid

from fastapi import APIRouter, HTTPException, Query
from google.cloud.firestore_v1 import SERVER_TIMESTAMP

from config import MAX_LEN
from schemas import MessageIn
from services.database import col, chat_id

router = APIRouter(prefix="/chat")


@router.post("/message")
def send_message(body: MessageIn):
    content = body.content.strip()
    if not content or len(content) > MAX_LEN:
        raise HTTPException(400, "Invalid message")
    mid = str(uuid.uuid4())
    col("chats").document(chat_id(body.sender_id, body.receiver_id)) \
                .collection("messages").document(mid).set({
                    "sender_id":  body.sender_id,
                    "content":    content,
                    "created_at": SERVER_TIMESTAMP,
                })
    return {"message_id": mid}


@router.get("/messages")
def get_messages(user_a: str, user_b: str, limit: int = Query(default=30, le=100)):
    docs = (
        col("chats").document(chat_id(user_a, user_b))
        .collection("messages")
        .order_by("created_at", direction="DESCENDING")
        .limit(limit)
        .stream()
    )
    return list(reversed([{"message_id": d.id} | (d.to_dict() or {}) for d in docs]))


@router.get("/conversations/{user_id}")
def get_conversations(user_id: str):
    return [
        other
        for chat in col("chats").stream()
        if user_id in (parts := chat.id.split("__"))
        for other in parts if other != user_id
    ]