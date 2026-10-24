import sys
import pymupdf
from sentence_transformers import SentenceTransformer
import chromadb
import json
import os

embedder = SentenceTransformer("all-MiniLM-L6-v2")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "db")

client = chromadb.PersistentClient(path=DB_PATH)

collection = client.get_or_create_collection(
    name="study_material", metadata={"hnsw:space": "cosine"}
)


if len(sys.argv) != 3:
    sys.exit("Usage: python ingest.py <pdf_path> <document_id>")

pdf_path = sys.argv[1]
document_id = sys.argv[2]

error_dict = {
    "status": "error",
    "message": "",
    "document_id": document_id,
}


def extract_text(pdf):
    pieces = []

    try:
        with pymupdf.open(pdf) as doc:
            for page_number, page in enumerate(doc, start=1):
                text = page.get_text()

                pieces.append(
                    {
                        "page": page_number,
                        "text": text,
                    }
                )
    except Exception:
        error_dict["message"] = "Failed to read the PDF"
        print(json.dumps(error_dict, indent=4))
        sys.exit(1)

    return pieces


def chunking(text, size=800, overlap=150):
    if size <= 0:
        raise ValueError("size must be positive")

    if overlap >= size:
        raise ValueError("overlap must be smaller than size")

    pieces = []
    start = 0

    while start < len(text):
        pieces.append(text[start : start + size])
        
        if start + size >= len(text):
            break
        
        start += size - overlap

    return pieces


doc = extract_text(pdf_path)

chunk_docs = []

for page in doc:

    if len(page["text"].strip()) > 0:
        chunk_page = chunking(page["text"])
        page_number = page["page"]

        for i, chunk_single_text in enumerate(chunk_page):

            chunk_docs.append(
                {
                    "id": f"{document_id}_p{page_number}_c{i}",
                    "documents": chunk_single_text,
                    "metadata": {
                        "document_id": document_id,
                        "page": page_number,
                    },
                }
            )


if len(chunk_docs) <= 0:
    error_dict["message"] = "No extractable text or chunks found in the PDF"
    print(json.dumps(error_dict, indent=4))
    sys.exit(1)

ids = []
documents = []
metadatas = []
embeds = []

for i in range(len(chunk_docs)):

    embeds.append(embedder.encode(chunk_docs[i]["documents"]).tolist())
    ids.append(chunk_docs[i]["id"])
    documents.append(chunk_docs[i]["documents"])
    metadatas.append(chunk_docs[i]["metadata"])

collection.delete(where={"document_id": document_id})

collection.upsert(
    ids=ids,
    documents=documents,
    metadatas=metadatas,
    embeddings=embeds,
)

pass_dict = {
    "status": "ok",
    "message": "Document ingested successfully",
    "document_id": document_id,
    "chunks_ingested": len(embeds),
}

print(json.dumps(pass_dict, indent=4))
