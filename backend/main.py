import uuid

from typing import cast
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from firebase_client import db
from google.cloud.firestore_v1 import SERVER_TIMESTAMP
from google.cloud.firestore_v1.transforms import Increment
from google.cloud.firestore_v1.base_document import DocumentSnapshot

from rec_client import get_feed, get_user_suggestions

app = FastAPI()

# TODO: LIMITAR!!!
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class PostIn(BaseModel):
    user_id: str
    content: str

class UserIn(BaseModel):
    username: str
    hashed_password: str

@app.post("/users")
def create_user(body: UserIn):
    uid = str(uuid.uuid4())
    db.collection("users").document(uid).set({
        "username": body.username,
        "hashed_password": body.hashed_password,
        "created_at": SERVER_TIMESTAMP,
    })
    return {"user_id": uid}

@app.get("/users/{user_id}")
def get_user(user_id: str):
    doc = cast(
        DocumentSnapshot, 
        db.collection("users").document(user_id).get())
    if not doc.exists:
        raise HTTPException(404)
    return {"user_id": user_id} | (doc.to_dict() or {})

@app.get("/users/search/{query}")
def search_users(query: str):
    results = (
        db.collection("users")
          .where("username", ">=", query)
          .where("username", "<=", query + "\uf8ff")
          .limit(10)
          .stream()
    )
    return [{"user_id": d.id} | (d.to_dict() or {}) for d in results]

@app.post("/posts")
def create_post(body: PostIn):
    pid = str(uuid.uuid4())
    db.collection("posts").document(pid).set({
        "user_id": body.user_id,
        "content": body.content,
        "created_at": SERVER_TIMESTAMP,
        "likes": 0,
    })
    return {"post_id": pid}

@app.get("/posts/{post_id}")
def get_post(post_id: str):
    doc = cast(
        DocumentSnapshot, 
        db.collection("posts").document(post_id).get())
    if not doc.exists:
        raise HTTPException(404)
    return {"post_id": post_id} | (doc.to_dict() or {})

@app.post("/posts/{post_id}/like")
def like_post(post_id: str, user_id: str):
    db.collection("posts")
        .document(post_id)
        .update({"likes": Increment(1)})
    return {"ok": True}

@app.get("/rec/feed/{user_id}")
def rec_feed(user_id: str, top_k: int = 10):
    try:
        post_ids = get_feed(user_id, top_k)
    except Exception:
        docs = db.collection("posts")
            .order_by("created_at", direction="DESCENDING")
            .limit(top_k).stream()
        post_ids = [d.id for d in docs]

    posts = []
    for pid in post_ids:
        doc = cast(
            DocumentSnapshot, 
            db.collection("posts").document(pid).get())
        if doc.exists:
            posts.append({"post_id": pid} | (doc.to_dict() or {}))
    return posts

@app.get("/rec/users/{user_id}")
def rec_users(user_id: str, top_k: int = 5):
    try:
        user_ids = get_user_suggestions(user_id, top_k)
    except Exception:
        docs = db.collection("users").limit(top_k).stream()
        user_ids = [d.id for d in docs]

    users = []
    for uid in user_ids:
        doc = cast(
            DocumentSnapshot, 
            db.collection("users").document(uid).get())
        if doc.exists:
            users.append({"user_id": uid} | (doc.to_dict() or {}))
    return users
