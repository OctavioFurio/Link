"""
Configuração principal da aplicação Link utilizando FastAPI.

Este módulo é responsável por criar a instância principal
da aplicação, configurar middlewares globais e registrar
todos os roteadores responsáveis pelos endpoints da API.

Autores:
    Murilo M. Grosso
    Octávio X. Fúrio
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import auth, users, posts, rec, chat

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://octaviofurio.github.io"],
    allow_methods=["GET", "DELETE", "PUT", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(rec.router)
app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(users.router)
app.include_router(posts.router)