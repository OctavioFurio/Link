import grpc
import torch
from concurrent import futures
import rec_pb2, rec_pb2_grpc
from model import Model
import os, json

N_USERS = int(os.getenv("N_USERS", 10))
N_ITEMS = int(os.getenv("N_ITEMS", 50))
DIM     = int(os.getenv("EMB_DIM", 32))

model = Model()

# Persistent - no online training
CKPT = "model.pt"
if os.path.exists(CKPT):
    model.load_state_dict(torch.load(CKPT, map_location="cpu"))
model.eval()

# Firestore maps
USER_MAP: dict[str, int] = json.loads(os.getenv("USER_MAP", "{}"))
ITEM_MAP: dict[str, int] = json.loads(os.getenv("ITEM_MAP", "{}"))
INV_ITEM = {v: k for k, v in ITEM_MAP.items()}
INV_USER = {v: k for k, v in USER_MAP.items()}


class RecommenderServicer(rec_pb2_grpc.RecommenderServicer):

    def GetContentFeed(self, request, context):
        return rec_pb2.FeedResponse(  # type: ignore
            post_ids=[1,2,3],
            scores=[1,2,3]
        )

    def GetUserSuggestions(self, request, context):
        return rec_pb2.UserResponse(  # type: ignore
            user_ids=[1,2,3], 
            scores=[1,2,3]
        )


def serve():
    port = os.getenv("PORT", "50051")
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=4))
    rec_pb2_grpc.add_RecommenderServicer_to_server(RecommenderServicer(), server)
    server.add_insecure_port(f"[::]:{port}")
    server.start()
    print(f"gRPC RecEngine listening on {port}")
    server.wait_for_termination()

if __name__ == "__main__":
    serve()