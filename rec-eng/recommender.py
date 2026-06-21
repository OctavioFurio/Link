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
}


def clean_text(text: str) -> str:
    text = _HTMLTAG.sub(" ", text)
    text = html.unescape(text)
    text = _URL.sub("", text)
    text = _MENTION.sub("", text)
    text = _HASHTAG.sub("", text)
    text = text.replace("\n", " ").replace("\r", " ")
    return _MULTI_SP.sub(" ", text).strip().strip("\"'")

def dedup(posts: list[str]) -> list[str]:
    seen, out = set(), []
    for p in posts:
        k = "".join(c for c in p.lower().strip() if c.isprintable())
        if len(k) >= 8 and k not in seen:
            seen.add(k)
            out.append(p)
    return out


class SemanticSpace:
    # TODO: Averiguar se aumentar o vocabulário automaticamente após
    # N posts é uma estratégia válida.
    def __init__(self, vocab_size: int = 8000, min_df: int = 1):
        self.vectorizer = TfidfVectorizer(
            max_features=vocab_size,
            token_pattern=r"(?u)\b\w+\b",
            sublinear_tf=True,
            min_df=min_df,
            stop_words=list(PTBR_STOP),
        )

    def fit(self, posts: list[str]) -> "SemanticSpace":
        self.vectorizer.fit(posts)
        return self

    def embed(self, texts: list[str]):
        return normalize(self.vectorizer.transform(texts), norm="l2", axis=1)

    def embed_one(self, text: str) -> np.ndarray:
        vec = np.asarray(self.embed([text]).todense())[0].astype(np.float32)
        norm = np.linalg.norm(vec)
        return vec / norm if norm > 0 else vec

    @property
    def vocab_size(self) -> int:
        return len(self.vectorizer.vocabulary_)

    def shared_model_bytes(self) -> int:
        return self.vectorizer.idf_.nbytes

    def export(self, out_dir: str = "semantic_model") -> str:
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
    Média móvel exponencial, levando em conta vetores de posts curtidos.

    Cold-start: Usa média aritmética para que as primeiras interações não se percam.
    """
    __slots__ = ("vec", "n", "decay", "cold_start_k")

    def __init__(self, vocab_size: int, decay: float = 0.85, cold_start_k: int = 5):
        self.vec = np.zeros(vocab_size, dtype=np.float32)
        self.n = 0
        self.decay = decay
        self.cold_start_k = cold_start_k

    def update(self, post_embedding: np.ndarray, weight: float = 1.0) -> None:
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
        return self.vec.nbytes

    def to_bytes(self) -> bytes:
        meta = np.array([self.n, self.cold_start_k], dtype=np.int32)
        params = np.array([self.decay], dtype=np.float32)
        return meta.tobytes() + params.tobytes() + self.vec.tobytes()

    @classmethod
    def from_bytes(cls, data: bytes, vocab_size: int) -> "UserProfile":
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
    Itens em `deprioritize_ids` (ex.: posts já curtidos) não são
    removidos do resultado — apenas empurrados para o final da
    lista, atrás de todo o conteúdo ainda não visto. Isso evita
    que o feed fique vazio quando o usuário já curtiu tudo que
    existe na base.
    """
    # .dot() por ser esparço
    sims = np.asarray(candidate_embeddings.dot(user.vec)).ravel()
    fresh, seen = [], []
    for i in np.argsort(-sims):
        item   = (candidate_ids[i], float(sims[i]))
        bucket = seen if candidate_ids[i] in deprioritize_ids else fresh
        bucket.append(item)
    return (fresh + seen)[:top_k]