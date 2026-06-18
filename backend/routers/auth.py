import uuid

from fastapi import APIRouter, HTTPException
from google.cloud.firestore_v1 import SERVER_TIMESTAMP

from config import DEFAULT_MINK_COLORS, DEFAULT_BIO
from schemas import LoginIn
from services.database import col
from services.security import make_salt, hash_password, verify_password

router = APIRouter(prefix="/auth")


@router.post("/signin")
def signin(body: LoginIn):
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