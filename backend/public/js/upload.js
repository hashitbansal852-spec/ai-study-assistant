const form = document.querySelector("#upload-form")
const error_message = document.querySelector("#error")
const sub_btn = document.querySelector("#submit_btn")
const wait = document.createElement("p")

form.addEventListener("submit", async (e) => {

    e.preventDefault()
    sub_btn.disabled = true
    error_message.after(wait)
    wait.textContent = "Processing your PDF, this can take a few seconds..."
    error_message.textContent = ""
    let formdata = new FormData(form)
    try {
        const response = await fetch("/", {
            method: "post",
            body: formdata,
        })

        const result = await response.json()

        if (!response.ok) {
            const err_msg = result.error
            error_message.textContent = err_msg
            return
        }

        window.location.href = result.redirectUrl
    }
    catch (error) {
        console.log(error)
        error_message.textContent = "Unable to connect to the server"
    }
    finally {
        sub_btn.disabled = false
        wait.textContent = ""
    }
})