import hashlib
import secrets

def make_salt() -> str:
    return secrets.token_hex(16)

def hash_password(password: str, salt: str) -> str:
    return hashlib.sha256(f"{salt}{password}".encode()).hexdigest()

def verify_password(password: str, data: dict) -> bool:
    return data.get("hashed_password") == hash_password(password, data.get("salt", ""))