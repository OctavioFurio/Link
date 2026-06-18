import uuid
import hashlib
import secrets

from typing import cast
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from firebase_client import db
from google.cloud.firestore_v1 import SERVER_TIMESTAMP
from google.cloud.firestore_v1.transforms import Increment
from google.cloud.firestore_v1.base_document import DocumentSnapshot

from rec_client import get_feed, get_user_suggestions

OK = {"ok": True}
MAX_POST_LEN = 256
SENSITIVE_USER_FIELDS = ("hashed_password", "salt")
DEFAULT_MINK_COLORS = [242, 236, 152, 242, 194, 154, 87, 154, 241]

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
    temp_username: str


class LoginIn(BaseModel):
    username: str
    password: str


class LikeIn(BaseModel):
    user_id: str


class ColorsIn(BaseModel):
    colors: list[int]


class FollowIn(BaseModel):
    user_id: str


def _make_salt() -> str:
    return secrets.token_hex(16)
 
 
def _hash_password(password: str, salt: str) -> str:
    return hashlib.sha256(f"{salt}{password}".encode()).hexdigest()
 
 
def _verify_password(password: str, data: dict) -> bool:
    salt = data.get("salt")
    return data.get("hashed_password") == _hash_password(password, salt)


def _get_doc(id: str, collection: str) -> DocumentSnapshot:
    doc = cast(DocumentSnapshot, db.collection(collection).document(id).get())
    if not doc.exists:
        raise HTTPException(404, f"{id} not found in {collection}")
    return doc


def _serialize(id: str, id_key: str, doc: DocumentSnapshot) -> dict:
    return {id_key: id} | (doc.to_dict() or {})


def _serialize_user(id: str, doc: DocumentSnapshot) -> dict:
    data = doc.to_dict() or {}
    public_data = {k: v for k, v in data.items() if k not in SENSITIVE_USER_FIELDS}
    return {"user_id": id} | public_data


@app.post("/auth/signin")
def sigin(body: LoginIn):
    results = list(
        db.collection("users")
          .where("username", "==", body.username)
          .limit(1)
          .stream()
    )
    if not results:
        raise HTTPException(404, "User not found")

    doc = results[0]
    data = doc.to_dict() or {}
    if not _verify_password(body.password, data):
        raise HTTPException(401, "Incorrect password")

    return {"user_id": doc.id, "username": data["username"]}


@app.post("/auth/signup")
def signup(body: LoginIn):
    results = list(
        db.collection("users")
          .where("username", "==", body.username)
          .limit(1)
          .stream()
    )
    if results:
        raise HTTPException(409, "Username already in use")

    uid = str(uuid.uuid4())
    salt = _make_salt()
    db.collection("users").document(uid).set({
        "username": body.username,
        "salt": salt,
        "hashed_password": _hash_password(body.password, salt),
        "mink_colors": DEFAULT_MINK_COLORS,
        "created_at": SERVER_TIMESTAMP,
    })

    return {"user_id": uid, "username": body.username}


@app.get("/users/{user_id}")
def get_user(user_id: str):
    doc = _get_doc(user_id, "users")
    return _serialize_user(user_id, doc)


@app.delete("/users/{user_id}")
def remove_user(user_id: str):
    _get_doc(user_id, "users")
    db.collection("users").document(user_id).delete()
    return OK


@app.put("/users/{user_id}/colors")
def set_user_mink_colors(user_id: str, body: ColorsIn):
    _get_doc(user_id, "users")
    db.collection("users").document(user_id).update({
        "mink_colors": body.colors
    })
    return OK


@app.get("/users/{user_id}/colors")
def get_user_mink_colors(user_id: str):
    doc = _get_doc(user_id, "users")
    return {"mink_colors": (doc.to_dict() or {}).get("mink_colors")}


@app.get("/users/{user_id}/likes")
def get_user_likes(user_id: str):
    docs = db.collection("likes").where("user_id", "==", user_id).stream()
    return [d.to_dict()["post_id"] for d in docs]


@app.post("/users/{user_id}/follow")
def follow_user(user_id: str, body: FollowIn):
    follow_ref = db.collection("follows").document(f"{user_id}_{body.user_id}")

    if follow_ref.get().exists:
        raise HTTPException(409, "Already following")

    follow_ref.set({"follower_id": user_id, "followed_id": body.user_id, "created_at": SERVER_TIMESTAMP})
    return OK


@app.delete("/users/{user_id}/follow")
def unfollow_user(user_id: str, body: FollowIn):
    follow_ref = db.collection("follows").document(f"{user_id}_{body.user_id}")

    if not follow_ref.get().exists:
        raise HTTPException(404, "Not following yet")

    follow_ref.delete()
    return OK


@app.get("/users/search/{query}")
def search_users(query: str, top_k: int = Query(default=5, ge=1, le=50)):
    results = (
        db.collection("users")
          .where("username", ">=", query)
          .where("username", "<=", query + "\uf8ff")
          .limit(top_k)
          .stream()
    )
    return [_serialize_user(d.id, d) for d in results]


@app.post("/posts")
def create_post(body: PostIn):
    content = body.content.strip()
    if not content:
        raise HTTPException(400, "Post content cannot be empty")
    if len(content) > MAX_POST_LEN:
        raise HTTPException(400, f"Post content exceeds {MAX_POST_LEN} characters")

    pid = str(uuid.uuid4())
    db.collection("posts").document(pid).set({
        "user_id": body.user_id,
        "temp_username": body.temp_username,
        "content": body.content[:MAX_POST_LEN],
        "likes_count": 0,
        "created_at": SERVER_TIMESTAMP,
    })
    return {"post_id": pid}


@app.get("/posts/{post_id}")
def get_post(post_id: str):
    doc = _get_doc(post_id, "posts")
    return _serialize(post_id, "post_id", doc)


@app.post("/posts/{post_id}/like")
def like_post(post_id: str, body: LikeIn):
    like_ref = db.collection("likes").document(f"{body.user_id}_{post_id}")

    if like_ref.get().exists:
        raise HTTPException(409, "Already liked")

    like_ref.set({"user_id": body.user_id, "post_id": post_id, "created_at": SERVER_TIMESTAMP})
    db.collection("posts").document(post_id).update({"likes_count": Increment(1)})
    return OK


@app.delete("/posts/{post_id}/like")
def unlike_post(post_id: str, body: LikeIn):
    like_ref = db.collection("likes").document(f"{body.user_id}_{post_id}")

    if not like_ref.get().exists:
        raise HTTPException(404, "Like not found")

    like_ref.delete()
    db.collection("posts").document(post_id).update({"likes_count": Increment(-1)})
    return OK


@app.get("/rec/feed/{user_id}")
def rec_feed(user_id: str, top_k: int = Query(default=10, ge=1, le=100)):
    try:
        post_ids = get_feed(user_id, top_k)
    except Exception:
        docs = db.collection("posts").order_by("created_at", direction="DESCENDING").limit(top_k).stream()
        post_ids = [d.id for d in docs]

    posts = []
    for pid in post_ids:
        doc = _get_doc(pid, "posts")
        if doc.exists:
            posts.append({"post_id": pid} | (doc.to_dict() or {}))
    return posts


@app.get("/rec/users/{user_id}")
def rec_users(user_id: str, top_k: int = Query(default=5, ge=1, le=50)):
    try:
        user_ids = get_user_suggestions(user_id, top_k)
    except Exception:
        docs = db.collection("users").limit(top_k).stream()
        user_ids = [d.id for d in docs]

    users = []
    for uid in user_ids:
        doc = _get_doc(uid, "users")
        if doc.exists:
            users.append({"user_id": uid} | (doc.to_dict() or {}))
    return users