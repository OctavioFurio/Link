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
    docs = col("chats").where("participants", "array_contains", user_id).stream()
    return [
        other
        for doc in docs
        for other in (doc.to_dict() or {}).get("participants", [])
        if other != user_id
    ]