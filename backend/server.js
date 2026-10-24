require("dotenv").config();
const express = require("express")
const path = require("path")
const { v4: uuidv4 } = require("uuid")
const multer = require("multer")
const sql = require("./db")
const { execFile } = require("child_process");
const { promisify } = require("util");
const { json } = require("stream/consumers");

const runFile = promisify(execFile)

const app = express()

const port = process.env.PORT || 3000

const aiPath = path.join(__dirname, "..", "ai")
const ingestPath = path.join(aiPath, "ingest.py")
const pythonPath = path.join(aiPath, "venv/Scripts/python.exe")
const askPath = path.join(aiPath, "ask.py")

app.set("view engine", "ejs")
app.set("views", path.join(__dirname, "views"))

app.use(express.static(path.join(__dirname, "public/css")))
app.use(express.static(path.join(__dirname, "public/js")))

app.use(express.urlencoded({ extended: true }))
app.use(express.json())

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, "uploads"))
    },

    filename: (req, file, cb) => {
        cb(null, `${uuidv4()}.pdf`)
    },
})

const upload = multer({
    storage,

    limits: {
        fileSize: 10 * 1024 * 1024,
    },

    fileFilter: (req, file, cb) => {
        if (file.mimetype == "application/pdf") {
            cb(null, true)
        }
        else {
            cb(new Error("Only pdf is allowed"))
        }
    }
})

app.get("/", (req, res) => {
    res.render("home")
})

const uploadpdf = upload.single("pdf")

app.post("/", (req, res) => {

    uploadpdf(req, res, async (err) => {

        if (err) {
            if (err.code == "LIMIT_FILE_SIZE") {
                return res.status(400).json({ error: "File must be under 10 MB" })
            }

            return res.status(400).json({ error: err.message })
        }

        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" })
        }

        let doc_id = null;

        try {
            const [result] = await sql.query(
                "INSERT INTO documents (original_name, stored_name, file_path) VALUES (?, ?, ?)",
                [req.file.originalname, req.file.filename, req.file.path]
            );

            doc_id = result.insertId;

            const { stdout, stderr } = await runFile(
                pythonPath,
                [ingestPath, req.file.path, String(doc_id)]
            );

            const output = JSON.parse(stdout);

            if (output.status !== "ok") {
                throw new Error(output.message || "Document processing failed");
            }

            await sql.query(
                "UPDATE documents SET status = ?, error_message = NULL WHERE id = ?",
                ["ready", doc_id]
            );

        } catch (err) {

            if (doc_id !== null) {
                try {
                    await sql.query(
                        "UPDATE documents SET status = ?, error_message = ? WHERE id = ?",
                        ["failed", err.message, doc_id]
                    );
                } catch (dbErr) {
                    console.error("Failed to update document status:", dbErr.message);
                }
            }

            return res.status(500).json({
                error: "Failed to save or process document"
            });
        }

        return res.status(200).json({
            redirectUrl: `/ask?file=${encodeURIComponent(req.file.originalname)}&documentId=${encodeURIComponent(doc_id)}`
        });

    })
})

app.get("/ask", async (req, res) => {
    try {
        const [rows] = await sql.query(
            "SELECT id, original_name FROM documents WHERE id = ?",
            [req.query.documentId]
        )
        if (rows.length === 0) return res.status(404).send("Document not found")
        res.render("ask", { filename: rows[0].original_name, documentId: rows[0].id })
    } catch (err) {
        console.error(err.message)
        res.status(500).send("Something went wrong")
    }
})

app.post("/ask", async (req, res) => {
    const { question, documentId } = req.body
    if (typeof question !== "string" || question.trim() === "") {
        return res.status(400).json({ error: "Question is required" })
    }
    try {
        const [rows] = await sql.query(
            "SELECT id FROM documents WHERE id = ? AND status = 'ready'",
            [documentId]
        )
        if (rows.length === 0) {
            return res.status(404).json({ error: "Document not found or not ready" })
        }

        const { stdout } = await runFile(pythonPath, [askPath, String(rows[0].id), question.trim()])
        const output = JSON.parse(stdout)
        if (output.status !== "ok") {
            return res.status(500).json({ error: "Could not generate an answer" })
        }

        await sql.query(
            "INSERT INTO chat_history (document_id, question, answer, sources) VALUES (?, ?, ?, ?)",
            [rows[0].id, question.trim(), output.answer, JSON.stringify(output.sources)]
        )
        res.json({ answer: output.answer, sources: output.sources })
    } catch (err) {
        console.error("Ask failed:", err.message)
        res.status(500).json({ error: "Could not generate an answer" })
    }
})

app.listen(port, () => {
    console.log(`server is live at port ${port}`)
})