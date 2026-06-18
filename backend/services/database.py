from typing import cast

from fastapi import HTTPException
from google.cloud.firestore_v1.base_document import DocumentSnapshot

from firebase_client import db

SENSITIVE_USER_FIELDS = ("hashed_password", "salt")

def col(name: str):
    return db.collection(name)

def get_doc(collection: str, doc_id: str) -> DocumentSnapshot:
    doc = cast(DocumentSnapshot, col(collection).document(doc_id).get())
    if not doc.exists:
        raise HTTPException(404, f"{doc_id} not found in {collection}")
    return doc

def doc_dict(doc: DocumentSnapshot, id_key: str) -> dict:
    return {id_key: doc.id} | (doc.to_dict() or {})

def user_dict(doc: DocumentSnapshot) -> dict:
    data = {k: v for k, v in (doc.to_dict() or {}).items() if k not in SENSITIVE_USER_FIELDS}
    return {"user_id": doc.id} | data

def chat_id(a: str, b: str) -> str:
    return "__".join(sorted([a, b]))