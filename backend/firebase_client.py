import firebase_admin
from firebase_admin import credentials, firestore
import os, json

def _init():
    if firebase_admin._apps:
        return
    # set env's FIREBASE_SERVICE_ACCOUNT as JSON
    # TODO: Actually figure out how to do this
    sa = json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT"])
    cred = credentials.Certificate(sa)
    firebase_admin.initialize_app(cred)

_init()
db = firestore.client()