function generateCaptcha() {
    const ctx = document.getElementById("captcha").getContext("2d");
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ123456789";
    let captchaText = "";

    ctx.clearRect(0, 0, 100, 40);
    ctx.font = "24px Arial";

    for (let i = 0; i < 5; i++) {
        const char = chars.charAt(Math.floor(Math.random() * chars.length));
        captchaText += char;
        ctx.fillStyle = `rgb(${Math.random()*100},${Math.random()*100},${Math.random()*100})`;
        ctx.fillText(char, 15 * i + 5, 30);
    }

    return captchaText;
}

let captchaCode = "";

document.addEventListener("DOMContentLoaded", () => {
    const captchaCanvas = document.getElementById("captcha");
    if (captchaCanvas) {
        captchaCode = generateCaptcha();
    }

    const form = document.getElementById("login-form");
    if (form) {
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            const userCaptcha = document.getElementById("captcha-input").value.toUpperCase();

            if (userCaptcha === captchaCode) {
                window.location.href = "dashboard.html";
            } else {
                alert("Código CAPTCHA incorrecto.");
                captchaCode = generateCaptcha();
            }
        });
    }
});
