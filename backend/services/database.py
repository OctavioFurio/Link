"""
Utilitários de acesso ao banco de dados da aplicação Link.

Este módulo centraliza operações comuns utilizadas pelos
serviços da aplicação para interação com o Firestore.

Funcionalidades:
    - Acesso simplificado a coleções.
    - Recuperação segura de documentos.
    - Conversão de documentos para dicionários.
    - Remoção de campos sensíveis de usuários.
    - Geração de identificadores de conversa.

Autores:
    Murilo M. Grosso
"""

from typing import cast

from fastapi import HTTPException
from google.cloud.firestore_v1.base_document import DocumentSnapshot

from firebase_client import db

SENSITIVE_USER_FIELDS = ("hashed_password", "salt")
"""
Campos que não devem ser retornados pela API.

Utilizados por user_dict() para impedir o vazamento
de informações relacionadas à autenticação.
"""


def col(name: str):
    """
    Retorna uma referência para uma coleção do Firestore.

    Args:
        name:
            Nome da coleção.

    Returns:
        CollectionReference:
            Referência para a coleção solicitada.
    """
    return db.collection(name)


def get_doc(collection: str, doc_id: str) -> DocumentSnapshot:
    """
    Recupera um documento pelo identificador.

    Args:
        collection:
            Nome da coleção.

        doc_id:
            Identificador do documento.

    Returns:
        DocumentSnapshot:
            Documento encontrado.

    Raises:
        HTTPException(404):
            Documento não encontrado.
    """
    doc = cast(DocumentSnapshot, col(collection).document(doc_id).get())
    if not doc.exists:
        raise HTTPException(404, f"{doc_id} not found in {collection}")
    return doc


def doc_dict(doc: DocumentSnapshot, id_key: str) -> dict:
    """
    Converte um documento do Firestore para dicionário.

    O identificador do documento é incluído utilizando
    a chave especificada.

    Args:
        doc:
            Documento do Firestore.

        id_key:
            Nome da chave utilizada para armazenar o ID.

    Returns:
        dict:
            Dados do documento acrescidos do identificador.
    """
    return {id_key: doc.id} | (doc.to_dict() or {})


def user_dict(doc: DocumentSnapshot) -> dict:
    """
    Converte um documento de usuário para resposta pública.

    Campos relacionados à autenticação são removidos antes
    da serialização.

    Args:
        doc:
            Documento de usuário.

    Returns:
        dict:
            Dados públicos do usuário.
    """
    data = {k: v for k, v in (doc.to_dict() or {}).items() if k not in SENSITIVE_USER_FIELDS}
    return {"user_id": doc.id} | data


def chat_id(a: str, b: str) -> str:
    """
    Gera o identificador único de uma conversa.

    Os IDs dos participantes são ordenados antes da
    composição para garantir que:

        chat_id(A, B) == chat_id(B, A)

    Isso evita a criação de conversas duplicadas para
    os mesmos participantes.

    Args:
        a:
            ID do primeiro usuário.

        b:
            ID do segundo usuário.

    Returns:
        str:
            Identificador da conversa.
    """
    return "__".join(sorted([a, b]))