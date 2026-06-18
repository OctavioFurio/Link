from pydantic import BaseModel

class LoginIn(BaseModel):
    username: str
    password: str

class PostIn(BaseModel):
    user_id: str
    content: str
    temp_username: str

class LikeIn(BaseModel):
    user_id: str

class FollowIn(BaseModel):
    user_id: str

class ColorsIn(BaseModel):
    colors: list[int]

class MessageIn(BaseModel):
    sender_id: str
    receiver_id: str
    content: str

class BioIn(BaseModel):
    bio: str