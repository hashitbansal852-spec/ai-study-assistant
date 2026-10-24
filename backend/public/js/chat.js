const form = document.querySelector("#question-form")
const questionInput = document.querySelector("#question")
const error_message = document.querySelector("#error")
const sub_btn = document.querySelector("#submit_btn")
const ans = document.querySelector("#answer")
const sources_box = document.querySelector("#sources")

form.addEventListener("submit", async (e) => {
    e.preventDefault()
    sub_btn.disabled = true
    error_message.textContent = ""
    ans.textContent = ""
    sources_box.textContent = ""
    const question = questionInput.value.trim()

    try {
        const response = await fetch("/ask", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                question: question,
                documentId: form.dataset.documentId
            }),
        })

        const result = await response.json()

        if (!response.ok) {
            error_message.textContent = result.error
            return
        }

        ans.textContent = result.answer

        if (result.sources.length > 0) {
            const pages = [...new Set(result.sources.map((s) => s.page))]
                .sort((a, b) => a - b)
            sources_box.textContent = "Sources: pages " + pages.join(", ")
        }
    }
    catch (error) {
        console.log(error)
        error_message.textContent = "Unable to connect to the server"
    }
    finally {
        sub_btn.disabled = false
    }
})