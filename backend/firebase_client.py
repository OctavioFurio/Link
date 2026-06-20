"""
Cliente do Firebase Firestore para a aplicação Link.

Este módulo é responsável por inicializar a conexão com
o Firebase Admin SDK e expor um cliente global do Firestore
utilizado por toda a aplicação.

Autores:
    Murilo M. Grosso
    Octávio X. Fúrio
"""

import os, json
import firebase_admin
from firebase_admin import credentials, firestore

def _init():
    """
    Inicializa o Firebase Admin SDK.

    A inicialização só ocorre uma vez, mesmo que o módulo
    seja importado múltiplas vezes.

    O Service Account é carregado da variável de ambiente FIREBASE_SERVICE_ACCOUNT.
    """
    if firebase_admin._apps:
        return

    sa = json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT"])
    cred = credentials.Certificate(sa)
    firebase_admin.initialize_app(cred)

_init()
db = firestore.client()