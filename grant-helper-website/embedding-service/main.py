"""
Local embedding HTTP service for the grant-helper Node API.
Uses sentence-transformers (MiniLM L6 v2, 384-d) — compatible with existing document_chunks vectors.
"""

import os
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer

DEFAULT_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL
EMBED_BATCH_SIZE = max(1, min(64, int(os.environ.get("EMBED_BATCH_SIZE", "32"))))

app = FastAPI(title="Grant helper embeddings", version="1.0.0")
_model: Optional[SentenceTransformer] = None


def get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(EMBEDDING_MODEL)
    return _model


class EmbedRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1)


class EmbedResponse(BaseModel):
    embeddings: list[list[float]]
    model: str


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "model": EMBEDDING_MODEL, "loaded": _model is not None}


@app.post("/embed", response_model=EmbedResponse)
def embed(body: EmbedRequest) -> EmbedResponse:
    model = get_model()
    texts = body.texts
    out_vectors: list[list[float]] = []

    for start in range(0, len(texts), EMBED_BATCH_SIZE):
        batch = texts[start : start + EMBED_BATCH_SIZE]
        if not batch:
            continue
        encoded = model.encode(
            batch,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        for row in encoded:
            out_vectors.append([float(x) for x in row.tolist()])

    if len(out_vectors) != len(texts):
        raise HTTPException(status_code=500, detail="Embedding count mismatch")

    return EmbedResponse(embeddings=out_vectors, model=EMBEDDING_MODEL)
