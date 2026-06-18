from fastapi import APIRouter, HTTPException, Query
from google.cloud.firestore_v1 import SERVER_TIMESTAMP

from config import OK, MAX_LEN
from schemas import FollowIn, ColorsIn, BioIn
from services.database import col, get_doc, user_dict

router = APIRouter(prefix="/users")

@router.get("/search/{query}")
def search_users(query: str, top_k: int = Query(default=5, ge=1, le=50)):
    docs = (
        col("users")
        .where("username", ">=", query)
        .where("username", "<=", query + "\uf8ff")
        .limit(top_k)
        .stream()
    )
    return [user_dict(d) for d in docs]


@router.get("/{user_id}")
def get_user(user_id: str):
    return user_dict(get_doc("users", user_id))


@router.delete("/{user_id}")
def delete_user(user_id: str):
    get_doc("users", user_id)
    col("users").document(user_id).delete()
    return OK


@router.get("/{user_id}/colors")
def get_colors(user_id: str):
    return {"mink_colors": (get_doc("users", user_id).to_dict() or {}).get("mink_colors")}


@router.put("/{user_id}/colors")
def set_colors(user_id: str, body: ColorsIn):
    get_doc("users", user_id)
    col("users").document(user_id).update({"mink_colors": body.colors})
    return OK


@router.get("/{user_id}/likes")
def get_likes(user_id: str):
    return [d.to_dict()["post_id"] for d in col("likes").where("user_id", "==", user_id).stream()]


@router.get("/{user_id}/followings")
def get_followings(user_id: str):
    return [d.to_dict()["followed_id"] for d in col("follows").where("follower_id", "==", user_id).stream()]


@router.post("/{user_id}/follow")
def follow(user_id: str, body: FollowIn):
    ref = col("follows").document(f"{user_id}_{body.user_id}")
    if ref.get().exists:
        raise HTTPException(409, "Already following")
    ref.set({"follower_id": user_id, "followed_id": body.user_id, "created_at": SERVER_TIMESTAMP})
    return OK


@router.delete("/{user_id}/follow")
def unfollow(user_id: str, body: FollowIn):
    ref = col("follows").document(f"{user_id}_{body.user_id}")
    if not ref.get().exists:
        raise HTTPException(404, "Not following")
    ref.delete()
    return OK


@router.put("/{user_id}/bio")
def set_user_bio(user_id: str, body: BioIn):
    get_doc("users", user_id)
    col("users").document(user_id).update({"bio": body.bio.strip()[:MAX_LEN]})
    return OK


@router.get("/{user_id}/bio")
def get_user_bio(user_id: str):
    doc = get_doc("users", user_id)
    return {"bio": (doc.to_dict() or {}).get("bio", "")}