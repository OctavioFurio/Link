import grpc, os
import rec_pb2, rec_pb2_grpc

_channel = None

def _get_stub():
    global _channel
    if _channel is None:
        host = os.getenv("REC_ENGINE_HOST", "localhost:50051")
        _channel = grpc.insecure_channel(host)
    return rec_pb2_grpc.RecommenderStub(_channel)

def get_feed(user_id: str, top_k: int = 10) -> list[str]:
    stub = _get_stub()
    resp = stub.GetContentFeed(rec_pb2.FeedRequest(user_id=user_id, top_k=top_k)) # type: ignore
    return list(resp.post_ids)

def get_user_suggestions(user_id: str, top_k: int = 5) -> list[str]:
    stub = _get_stub()
    resp = stub.GetUserSuggestions(rec_pb2.UserRequest(user_id=user_id, top_k=top_k)) # type: ignore
    return list(resp.user_ids)