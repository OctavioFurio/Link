import os, json
import firebase_admin
from firebase_admin import credentials, firestore

def _init():
    if firebase_admin._apps:
        return

    sa = json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT"])
    cred = credentials.Certificate(sa)
    firebase_admin.initialize_app(cred)

_init()
db = firestore.client()