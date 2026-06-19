from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import auth, users, posts, rec, chat

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://octaviofurio.github.io"],
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type"],
)

app.include_router(rec.router)
app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(users.router)
app.include_router(posts.router)