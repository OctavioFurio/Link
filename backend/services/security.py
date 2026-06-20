"""
Módulo de segurança da aplicação Link.

Este módulo contém funções responsáveis pelo tratamento
e verificação de credenciais de usuários.

Funcionalidades:
    - Geração de salt aleatório para senhas.
    - Hash de senhas com SHA-256.
    - Verificação de credenciais armazenadas.

Autores:
    Murilo M. Grosso
    Octávio X. Fúrio
"""

import hashlib
import secrets


def make_salt() -> str:
    """
    Gera um salt aleatório para reforçar a segurança de senhas.

    O salt é utilizado para evitar ataques de rainbow table,
    garantindo que senhas iguais resultem em hashes diferentes.

    Returns:
        str:
            String hexadecimal aleatória.
    """
    return secrets.token_hex(16)


def hash_password(password: str, salt: str) -> str:
    """
    Gera um hash SHA-256 da senha combinada com o salt.

    A concatenação segue o formato:
        salt + password

    Args:
        password:
            Senha em texto puro.

        salt:
            Valor aleatório associado ao usuário.

    Returns:
        str:
            Hash hexadecimal SHA-256 da senha.
    """
    return hashlib.sha256(f"{salt}{password}".encode()).hexdigest()


def verify_password(password: str, data: dict) -> bool:
    """
    Verifica se a senha informada corresponde ao hash armazenado.

    A verificação é feita recalculando o hash da senha
    utilizando o salt armazenado no banco de dados.

    Args:
        password:
            Senha em texto puro fornecida pelo usuário.

        data:
            Documento do usuário contendo hashed_password e salt.

    Returns:
        bool:
            True se a senha estiver correta, False caso contrário.
    """
    return data.get("hashed_password") == hash_password(password, data.get("salt", ""))