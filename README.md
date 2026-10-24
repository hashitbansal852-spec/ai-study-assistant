# AI Study Assistant

Upload a PDF of your study notes, then ask questions and get answers based **only on that document**. If the PDF doesn't cover the question, the app says so instead of guessing.

This is a Retrieval-Augmented Generation (RAG) project: relevant parts of the PDF are found first, and only those parts are given to the language model.

## Features

- Upload a PDF (PDF only, up to 10 MB), with errors shown on the page
- Ask questions about the document in the browser
- Answers come only from the uploaded PDF, with a fixed refusal sentence when the answer isn't there
- Source pages are shown under each answer
- Each document has a status (`processing`, `ready`, `failed`) stored in MySQL
- Every question and answer is saved in a chat history table

## Tech stack

| Layer       | Technology                                                            |
| ----------- | --------------------------------------------------------------------- |
| Frontend    | EJS, HTML, CSS, JavaScript (`fetch`)                                  |
| Backend     | Node.js, Express, Multer                                              |
| Database    | MySQL (`mysql2`)                                                      |
| AI pipeline | Python, PyMuPDF, Sentence Transformers (`all-MiniLM-L6-v2`), ChromaDB |
| LLM         | Groq API                                                              |

## How it works

**Uploading a PDF**

```
Browser -> Express (Multer validates and saves the file, row saved in MySQL)
        -> ingest.py: extract text per page -> split into chunks
                      -> create embeddings -> store in ChromaDB
        -> document marked "ready"
```

**Asking a question**

```
Browser -> Express (checks the document exists and is ready)
        -> ask.py: embed the question -> find the 5 closest chunks of that document
                   -> send them to Groq with strict rules -> JSON answer
        -> Express saves it in MySQL and returns the answer and source pages
```

Express runs the Python scripts as child processes and reads the JSON they print.

## Project structure

```
ai-study-assistant/
├── ai/
│   ├── ingest.py
│   ├── ask.py
│   └── requirements.txt
├── backend/
│   ├── server.js
│   ├── db.js
│   ├── schema.sql
│   ├── views/
│   │   ├── home.ejs
│   │   └── ask.ejs
│   └── public/
│       ├── css/
│       └── js/
│           ├── upload.js
│           └── chat.js
├── .gitignore
└── README.md
```

## Setup

**You need:** Node.js, Python 3.11, MySQL, and a free [Groq API key](https://console.groq.com).

> The Python path in `server.js` points to `ai/venv/Scripts/python.exe`, so the setup below is for **Windows**. On macOS or Linux, change `pythonPath` to `ai/venv/bin/python`.

**1. Database**

Create a database and a user, then run the schema:

```sql
CREATE DATABASE ai_study_assistant;
USE ai_study_assistant;
-- then run the contents of backend/schema.sql
```

**2. Python**

```
cd ai
py -3.11 -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

**3. Node**

```
cd backend
npm install
mkdir uploads
```

**4. Environment files**

`ai/.env`

```
GROQ_API_KEY=your_key_here
```

`backend/.env`

```
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_NAME=study_assistant
DB_USER=your_user
DB_PASSWORD=your_password
```

**5. Run**

```
cd backend
node server.js
```

Open http://localhost:3000.

The first upload is slower because the embedding model is downloaded and loaded.

## Design decisions

- **Answers are grounded.** The system prompt tells the model to use only the supplied excerpts and to reply with an exact refusal sentence otherwise. The code uses that sentence to hide the sources when nothing was found.
- **Each document is filtered by id.** Chunks are stored with a `document_id`, and queries filter on it, so documents never mix.
- **Uploads are validated.** File type and size are checked, files are saved under random UUID names, and SQL uses parameterized queries.
- **The server doesn't trust the browser.** The document id sent with a question is looked up in MySQL before anything runs.
- **Failures are reported.** If ingest fails, the document is marked `failed` with a reason.

## Known limitations

- **No user accounts yet.** Anyone with a document id can open that document, so this is a single-user project.
- **Slow per request.** Each upload and question starts a new Python process that reloads the embedding model.
- **Basic chunking.** Chunks are fixed-size character slices (800 characters, 150 overlap), so some cut sentences in half.
- **Scanned PDFs are not supported.** They contain images, not text.
- **PDFs are stored on local disk** in `backend/uploads/`.

## Roadmap

- [ ] User accounts with bcrypt and sessions, and per-user documents
- [ ] Quiz generation from a document
- [ ] Keep one Python service running so the model loads only once
- [ ] Sentence-aware chunking
- [ ] Cloud file storage
