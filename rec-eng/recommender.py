"""
Implementação da Engine de Recomendação.

Aqui dispõe-se o conjunto principal de funções da engine de recomendação.

Esse módulo possui todos os métodos que a engine de recomendação
requer para prover suas funcionalidades.

A implementação da engine está contida neste módulo.

Autores:
    Murilo M. Grosso
    Octávio X. Fúrio
"""

import os, re, html, json
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

_URL      = re.compile(r"https?://\S+")
_MENTION  = re.compile(r"@\S+")
_HTMLTAG  = re.compile(r"<[^>]+>")
_HASHTAG  = re.compile(r"#\S+")
_MULTI_SP = re.compile(r"\s{2,}")

# Palavras semanticamente irrelevantes
PTBR_STOP = {
    "de","da","do","das","dos","em","na","no","nas","nos","a","o","as","os",
    "e","é","eu","me","meu","minha","meus","minhas","te","tu","você","vc",
    "que","não","nao","com","para","pra","pro","por","isso","mas","se",
    "ele","ela","eles","elas","um","uma","uns","umas","também","tbm",
    "já","ja","mais","menos","muito","bem","ser","ter","está","tá","ta",
    "foi","vai","vou","tem","tô","to","só","so","aqui","lá","la","li",
    "cara","gente","pessoal","né","ne","sim","num","são","sao","sou",
    "fui","ver","ir","ser","fazer","faz","ai","aí","ou","alguém","algum",
    "sobre","quando","como","esse","essa","esses","essas","aquele","aquela",
    "quem","qual","qualquer","outro","outra","mesmo","mesma","então","entao",
    "até","ate","ainda","depois","antes","sempre","nunca","tudo","nada",
    "aqui","lá","la","aquele","aquela","nesse","nessa","neste","nesta",
    "kkkk", "kkkkk", "kkkkkk", "kkkkkkk", "kkkkkkkk", "kkkkkkkkk", "kkkkkkkkkk",
    # Expansível, mas já deve cobrir a maioria das stopwords do Link
}


def clean_text(text: str) -> str:
    """
    Normaliza um texto bruto removendo o máximo possível de ruído.

    Tags HTML são removidas primeiro para que entidades HTML aninhadas sejam 
    corretamente decodificadas pelo html.unescape em seguida. 
    URLs, menções e hashtags são então eliminadas por não carregarem semântica útil 
    para o modelo TF-IDF que usamos. 
    Quebras de linha são substituídas por espaços e múltiplos espaços consecutivos são colapsados.
    E, finalmente, aspas simples e duplas nas bordas são removidas.

    Args:
        text: Texto bruto a ser limpo.

    Returns:
        str: Texto normalizado, limpo, para tokenização e indexação.
    """
    text = _HTMLTAG.sub(" ", text)
    text = html.unescape(text)
    text = _URL.sub("", text)
    text = _MENTION.sub("", text)
    text = _HASHTAG.sub("", text)
    text = text.replace("\n", " ").replace("\r", " ")
    return _MULTI_SP.sub(" ", text).strip().strip("\"'")


def dedup(posts: list[str]) -> list[str]:
    """
    Remove posts duplicados e preserva a ordem (primeira ocorrência).

    Considera apenas caracteres em lowercase, sem espaços.
    Posts muito pequenos são descartados.

    Args:
        posts: Lista de textos para deduplicar.

    Returns:
        list[str]: Sublista de posts únicos, na ordem em que aparecem pela primeira vez.
    """
    seen, out = set(), []
    for p in posts:
        k = "".join(c for c in p.lower().strip() if c.isprintable())
        if len(k) >= 8 and k not in seen:
            seen.add(k)
            out.append(p)
    return out


class SemanticSpace:
    """
    Espaço vetorial TF-IDF sobre o corpus de posts, com suporte a exportação de modelo.

    Normaliza um TfidfVectorizer com (f(tf) = log(1+tf)), vocabulário limitado a vocab_size 
    e considerando stopwords. 
    Os vetores são L2-normalizados, o que simplifica similaridade cosseno a um produto escalar.
    """

    # TODO: Averiguar se aumentar o vocabulário automaticamente após
    # N posts é uma estratégia válida.
    def __init__(self, vocab_size: int = 8000, min_df: int = 1):
        """
        Inicializa o vetorizador TF-IDF com as configurações do espaço semântico.

        Args:
            vocab_size: Nro máximo de termos no vocabulário. 
                Termos menos frequentes são descartados primeiro.
            min_df: Freq. mínima no corpus para um termo entrar no vocabulário.
                Valor 1 são os hapax legomenon! Pelo corpus ser pequeno, consideraremos
                o valor 1. Idealmente, seria usado para excluir os n% de palavras mais raras.
        """
        self.vectorizer = TfidfVectorizer(
            max_features=vocab_size,
            token_pattern=r"(?u)\b\w+\b",
            sublinear_tf=True,
            min_df=min_df,
            stop_words=list(PTBR_STOP),
        )

    def fit(self, posts: list[str]) -> "SemanticSpace":
        """
        Treina o vocabulário e os pesos IDF sobre o corpus fornecido.

        Args:
            posts: Lista de textos para construir o vocabulário e calcular os IDFs. 
                Note que duplicatas no corpus inflam artificialmente a DF de termos.

        Returns:
            SemanticSpace: A própria instância.
        """
        self.vectorizer.fit(posts)
        return self

    def embed(self, texts: list[str]):
        """
        Transforma uma lista de textos em uma matriz esparsa L2-normalizada.

        Args:
            texts: Textos a vetorizar. Termos fora do vocabulário são ignorados.

        Returns:
            scipy.sparse.csr_matrix: Matriz (len(texts), vocab_size) com cada linha 
            L2-normalizada. Pronta para similaridade de cosseno.
        """
        return normalize(self.vectorizer.transform(texts), norm="l2", axis=1)

    def embed_one(self, text: str) -> np.ndarray:
        """
        Vetoriza um único texto em um vetor denso L2-normalizado.

        Args:
            text: Texto a vetorizar.

        Returns:
            np.ndarray: Vetor denso (vocab_size,), float32, L2-normalizado.
        """
        vec = np.asarray(self.embed([text]).todense())[0].astype(np.float32)
        norm = np.linalg.norm(vec)
        return vec / norm if norm > 0 else vec

    @property
    def vocab_size(self) -> int:
        """
        Número de termos do vocabulário após o fit.

        Returns:
            int: Tamanho do vocabulário.
        """
        return len(self.vectorizer.vocabulary_)

    def shared_model_bytes(self) -> int:
        """
        Tamanho em bytes do vetor IDF (parte compartilhada do modelo).

        Returns:
            int: Bytes ocupados pelo array IDF (vocab_size * 4 bytes em float32).
        """
        return self.vectorizer.idf_.nbytes

    def export(self, out_dir: str = "semantic_model") -> str:
        """
        Serializa o modelo treinado em disco no formato legível por clientes externos.

        Exporta três arquivos: 
        idf.bin, contendo o vetor IDF float32 little-endian,
        vocab.json, mapeando cada termo ao seu respectivo índice de coluna,
        e config.json com os hiperparâmetros e a lista de stopwords. 
        
        Esse formato permite replicação desacoplada do python em si.

        Args:
            out_dir: Caminho do diretório de saída.

        Returns:
            str: Caminho do diretório onde os arquivos foram salvos.
        """
        os.makedirs(out_dir, exist_ok=True)
        idf = self.vectorizer.idf_.astype(np.float32)
        idf.tofile(os.path.join(out_dir, "idf.bin"))
        with open(os.path.join(out_dir, "vocab.json"), "w") as f:
            json.dump(
                {term: int(idx) for term, idx in self.vectorizer.vocabulary_.items()}, f
            )
        with open(os.path.join(out_dir, "config.json"), "w") as f:
            json.dump(
                {
                    "vocab_size": self.vocab_size,
                    "stop_words": sorted(PTBR_STOP),
                },
                f,
                indent=2,
                ensure_ascii=False,
            )
        total = sum(
            os.path.getsize(os.path.join(out_dir, fn)) for fn in os.listdir(out_dir)
        )
        print(f"Model exported to {out_dir}/ -- {total / 1024:.0f} KB")
        return out_dir


class UserProfile:
    """
    Representa o vetor de interesse de um usuário, mantido via média móvel exponencial
    sobre os embeddings dos posts curtidos, em ordem de interação.

    Cold-start: Enquanto o número de interações for menor que cold_start_k,
    o perfil usa média aritmética simples para que os primeiros likes tenham 
    peso proporcional igual. Após cold_start_k interações, muda para a média
    móvel exponencial, dando maior peso às interações mais recentes.

    O vetor é mantido L2-normalizado após cada atualização, o que garante
    que a similaridade cosseno com os candidatos seja computacionalmente simples.
    """

    __slots__ = ("vec", "n", "decay", "cold_start_k")

    def __init__(self, vocab_size: int, decay: float = 0.85, cold_start_k: int = 5):
        """
        Inicializa um perfil vazio.

        Args:
            vocab_size: Dimensão do espaço vetorial (igual ao vocab_size do SemanticSpace).
            decay: Fator de retenção da MME após o cold-start acabar. Valores menores tornam
                o perfil mais reativo a novas interações.
            cold_start_k: Número de interações iniciais durante as quais
                a média aritmética é usada no lugar da MME.
        """
        self.vec = np.zeros(vocab_size, dtype=np.float32)
        self.n = 0
        self.decay = decay
        self.cold_start_k = cold_start_k

    def update(self, post_embedding: np.ndarray, weight: float = 1.0) -> None:
        """
        Incorpora um novo post ao perfil via MME (ou média aritmética no cold-start).

        O embedding é escalonado por weight e re-normalizado antes da
        atualização, de modo que weight funcione como um sinal de relevância.
        
        Args:
            post_embedding: Vetor denso do post curtido, de shape (vocab_size,).
            weight: Peso relativo desta interação.
        """
        emb = post_embedding.astype(np.float32) * weight
        norm = np.linalg.norm(emb)
        if norm > 0:
            emb /= norm

        if self.n == 0:
            self.vec = emb.copy()
        else:
            alpha = (
                1.0 / (self.n + 1)
                if self.n < self.cold_start_k
                else (1.0 - self.decay)
            )
            self.vec = (1.0 - alpha) * self.vec + alpha * emb
            nrm = np.linalg.norm(self.vec)
            if nrm > 0:
                self.vec /= nrm

        self.n += 1

    def nbytes(self) -> int:
        """
        Tamanho em bytes do vetor de perfil armazenado em memória.

        Returns:
            int: Bytes ocupados por self.vec (vocab_size * 4 bytes em float32).
        """
        return self.vec.nbytes

    def to_bytes(self) -> bytes:
        """
        Serializa o perfil em um blob de bytes para persistência.

        O layout é: 
        [n, cold_start_k] como int32 (8 bytes), seguido de 
        [decay] como float32 (4 bytes), seguido do 
        {vetor de perfil} como float32 (vocab_size * 4 bytes). 
        
        Returns:
            bytes: Representação binária do perfil.
        """
        meta = np.array([self.n, self.cold_start_k], dtype=np.int32)
        params = np.array([self.decay], dtype=np.float32)
        return meta.tobytes() + params.tobytes() + self.vec.tobytes()

    @classmethod
    def from_bytes(cls, data: bytes, vocab_size: int) -> "UserProfile":
        """
        Desserializa um perfil a partir de um blob produzido por to_bytes.

        Args:
            data: Blob de bytes no formato descrito em to_bytes.
            vocab_size: Dimensão esperada do vetor de perfil. Deve coincidir
                com o vocab_size do SemanticSpace atual.

        Returns:
            UserProfile: Perfil reconstruído com o estado exato no momento
            da serialização, incluindo n, decay, cold_start_k e vec.
        """
        meta = np.frombuffer(data[:8], dtype=np.int32)
        params = np.frombuffer(data[8:12], dtype=np.float32)
        vec = np.frombuffer(data[12:], dtype=np.float32).copy()

        profile = cls(vocab_size, decay=float(params[0]), cold_start_k=int(meta[1]))
        profile.vec = vec
        profile.n = int(meta[0])

        return profile


def recommend(
        user: UserProfile,
        candidate_embeddings,
        candidate_ids: list,
        top_k: int = 10,
        deprioritize_ids: frozenset = frozenset(),
) -> list[tuple]:
    """
    Ranqueia posts candidatos por similaridade cosseno ao perfil do usuário.

    Computa similaridades via produto escalar entre o vetor de perfil denso
    e a matriz de candidatos esparsa. Os candidatos são então particionados 
    em dois buckets:
        fresh (não curtidos) e 
        seen (curtidos)
        
    e concatenados nessa ordem antes do corte em top_k.

    Itens em deprioritize_ids não são removidos do resultado, só empurrados 
    para o final da lista. 
    
    Isso evita que o feed fique vazio quando o usuário já curtiu tudo que existe
    na base, o que pode acontecer quando o corpus de postagens é pequeno.

    Args:
        user: Perfil do usuário.
        candidate_embeddings: Matriz esparsa (n_posts, vocab_size),
            L2-normalizada; normalmente state.cand_emb.
        candidate_ids: Lista de IDs dos posts, alinhada por índice com as
            linhas de candidate_embeddings.
        top_k: Número máximo de itens a retornar.
        deprioritize_ids: Conjunto de IDs a rebaixar para o fim da lista
            (i.e. posts já curtidos pelo usuário).

    Returns:
        list[tuple[str, float]]: Lista de pares (post_id, score) ordenada
        por score decrescente, com itens depriorizados ao final,
        truncada em para conter só top_k pares.
    """
    # .dot() por ser esparço
    sims = np.asarray(candidate_embeddings.dot(user.vec)).ravel()
    fresh, seen = [], []
    for i in np.argsort(-sims):
        item   = (candidate_ids[i], float(sims[i]))
        bucket = seen if candidate_ids[i] in deprioritize_ids else fresh
        bucket.append(item)
    return (fresh + seen)[:top_k]