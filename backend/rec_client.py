"""
Client gRPC para a engine de recomendação.

Autores:
    Octávio X. Fúrio
"""

import os
import grpc
import rec_pb2
import rec_pb2_grpc

_CHANNEL = grpc.insecure_channel(os.getenv("REC_ENGINE_ADDR", "localhost:50051"))
_STUB    = rec_pb2_grpc.RecommenderStub(_CHANNEL)
_TIMEOUT = float(os.getenv("REC_TIMEOUT_SEC", "2.0"))


def get_feed(user_id: str, top_k: int = 10, offset: int = 0) -> list[str]:
    resp = _STUB.GetContentFeed(
        rec_pb2.FeedRequest(user_id=user_id, top_k=top_k, offset=offset),
        timeout=_TIMEOUT,
    )
    return list(resp.post_ids)


def get_user_suggestions(user_id: str, top_k: int = 5) -> list[str]:
    resp = _STUB.GetUserSuggestions(
        rec_pb2.UserRequest(user_id=user_id, top_k=top_k),
        timeout=_TIMEOUT,
    )
    return list(resp.user_ids)