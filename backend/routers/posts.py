import uuid

from fastapi import APIRouter, HTTPException
from google.cloud.firestore_v1 import SERVER_TIMESTAMP
from google.cloud.firestore_v1.transforms import Increment

from config import OK, MAX_LEN
from schemas import PostIn, LikeIn
from services.database import col, get_doc, doc_dict

router = APIRouter(prefix="/posts")


@router.post("")
def create_post(body: PostIn):
    content = body.content.strip()
    if not content:
        raise HTTPException(400, "Content cannot be empty")
    if len(content) > MAX_LEN:
        raise HTTPException(400, f"Content exceeds {MAX_LEN} characters")
    pid = str(uuid.uuid4())
    col("posts").document(pid).set({
        "user_id":       body.user_id,
        "temp_username": body.temp_username,
        "content":       content[:MAX_LEN],
        "likes_count":   0,
        "created_at":    SERVER_TIMESTAMP,
    })
    return {"post_id": pid}


@router.get("/{post_id}")
def get_post(post_id: str):
    return doc_dict(get_doc("posts", post_id), "post_id")


@router.post("/{post_id}/like")
def like_post(post_id: str, body: LikeIn):
    ref = col("likes").document(f"{body.user_id}_{post_id}")
    if ref.get().exists:
        raise HTTPException(409, "Already liked")
    ref.set({"user_id": body.user_id, "post_id": post_id, "created_at": SERVER_TIMESTAMP})
    col("posts").document(post_id).update({"likes_count": Increment(1)})
    return OK


@router.delete("/{post_id}/like")
def unlike_post(post_id: str, body: LikeIn):
    ref = col("likes").document(f"{body.user_id}_{post_id}")
    if not ref.get().exists:
        raise HTTPException(404, "Like not found")
    ref.delete()
    col("posts").document(post_id).update({"likes_count": Increment(-1)})
    return OK