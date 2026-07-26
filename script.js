"use strict";

const $ = id => document.getElementById(id);

const player = $("p");
const menu = $("menu");
const gameOver = $("over");
const scoreText = $("score");
const levelUp = $("levelUp");
const levelSelect = $("levelSelect");

const state = {
    user: null,
    score: 0,
    level: 1,
    startingLevel: 1,
    playerX: window.innerWidth / 2,
    direction: 0,
    running: false,
    gameId: null,
    meteorTimer: null,
    frame: null,
    fullscreenBusy: false,
    finishing: false,
    levelNoticeTimer: null
};

const meteors = [];

function levelSettings(level) {
    const currentLevel = Math.max(
        1,
        Math.min(30, Number(level) || 1)
    );

    return {
        interval: Math.max(220, 1250 - currentLevel * 34),
        speedMin: 2.5 + currentLevel * 0.22,
        speedMax: 4 + currentLevel * 0.3,
        size: window.innerWidth <= 600 ? 48 : 58
    };
}

function updateScore() {
    scoreText.innerHTML = `
        <div class="score-value">Score : ${state.score}</div>
        <div class="level-value">Level : ${state.level}</div>
    `;
}

function showLevelUp() {
    clearTimeout(state.levelNoticeTimer);

    levelUp.textContent = `LEVEL ${state.level} MENINGKAT!`;
    levelUp.classList.remove("show");

    void levelUp.offsetWidth;
    levelUp.classList.add("show");

    state.levelNoticeTimer = setTimeout(() => {
        levelUp.classList.remove("show");
    }, 1200);
}

function updateLevel(showNotice = true) {
    const nextLevel = Math.min(
        30,
        state.startingLevel + Math.floor(state.score / 10)
    );

    if (nextLevel > state.level) {
        state.level = nextLevel;
        updateScore();

        if (showNotice) {
            showLevelUp();
        }

        restartMeteorTimer();
    }
}

function restartMeteorTimer() {
    clearInterval(state.meteorTimer);
    state.meteorTimer = null;

    if (!state.running) {
        return;
    }

    state.meteorTimer = setInterval(
        createMeteor,
        levelSettings(state.level).interval
    );
}

function updatePlayer() {
    const width = player.offsetWidth || 70;
    const min = width / 2;
    const max = Math.max(min, window.innerWidth - width / 2);

    state.playerX += state.direction * 7;
    state.playerX = Math.max(min, Math.min(max, state.playerX));

    player.style.left = `${state.playerX}px`;
}

function setDirection(value) {
    state.direction = value;

    player.classList.remove("walk-left", "walk-right");

    if (value < 0) {
        player.classList.add("walk-left");
    } else if (value > 0) {
        player.classList.add("walk-right");
    }
}

function createMeteor() {
    if (!state.running) {
        return;
    }

    const settings = levelSettings(state.level);
    const meteor = document.createElement("div");
    const startY = -settings.size - 90;
    const x = Math.random() * Math.max(
        1,
        window.innerWidth - settings.size
    );

    meteor.className = "a";
    meteor.style.left = `${x}px`;
    meteor.style.top = `${startY}px`;

    document.body.appendChild(meteor);

    meteors.push({
        element: meteor,
        y: startY,
        speed: settings.speedMin +
            Math.random() * (settings.speedMax - settings.speedMin)
    });
}

function overlap(first, second) {
    return first.left < second.right &&
        first.right > second.left &&
        first.top < second.bottom &&
        first.bottom > second.top;
}

function removeMeteor(index) {
    const meteor = meteors[index];

    if (meteor?.element?.isConnected) {
        meteor.element.remove();
    }

    meteors.splice(index, 1);
}

function clearMeteors() {
    for (let index = meteors.length - 1; index >= 0; index--) {
        removeMeteor(index);
    }
}

async function saveMeteorEscaped() {
    if (!state.gameId || !state.running) {
        return;
    }

    try {
        const response = await fetch(
            `/api/games/${state.gameId}/meteor-escaped`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );

        if (response.status === 401) {
            await logout();
            return;
        }

        if (!response.ok) {
            return;
        }

        const data = await response.json();

        if (Number.isFinite(data.score)) {
            state.score = data.score;
        }

        if (Number.isFinite(data.level)) {
            const oldLevel = state.level;

            state.level = Math.max(
                1,
                Math.min(30, Number(data.level))
            );

            if (state.level > oldLevel) {
                showLevelUp();
                restartMeteorTimer();
            }
        }

        updateScore();
    } catch {
        // Permainan tetap berjalan jika server tidak tersedia.
    }
}

function gameLoop() {
    if (!state.running) {
        return;
    }

    updatePlayer();

    const playerRect = player.getBoundingClientRect();

    for (let index = meteors.length - 1; index >= 0; index--) {
        const meteor = meteors[index];

        meteor.y += meteor.speed;
        meteor.element.style.top = `${meteor.y}px`;

        if (overlap(playerRect, meteor.element.getBoundingClientRect())) {
            endGame();
            return;
        }

        if (meteor.y > window.innerHeight + 100) {
            removeMeteor(index);

            state.score++;
            updateLevel();
            updateScore();

            void saveMeteorEscaped();
        }
    }

    state.frame = requestAnimationFrame(gameLoop);
}

async function createServerGame() {
    if (!state.user) {
        return false;
    }

    try {
        const response = await fetch("/api/games", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                level: state.level
            })
        });

        if (response.status === 401) {
            await logout();
            return false;
        }

        if (!response.ok) {
            return false;
        }

        const data = await response.json();

        if (!data.gameId) {
            return false;
        }

        state.gameId = data.gameId;
        return true;
    } catch {
        return false;
    }
}

async function finishServerGame() {
    if (!state.gameId || state.finishing) {
        return;
    }

    state.finishing = true;

    const gameId = state.gameId;
    state.gameId = null;

    try {
        await fetch(`/api/games/${gameId}/finish`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            }
        });
    } catch {
        // Data lokal tetap aman walaupun server gagal merespons.
    } finally {
        state.finishing = false;
    }
}

async function startGame() {
    if (!state.user) {
        createAuthScreen();
        return;
    }

    requestFullscreenMode();
    stopGame();

    state.score = 0;
    state.startingLevel = Math.max(
        1,
        Math.min(30, Number(levelSelect.value) || 1)
    );
    state.level = state.startingLevel;
    state.playerX = window.innerWidth / 2;
    state.gameId = null;
    state.running = true;

    updateScore();

    menu.style.display = "none";
    gameOver.style.display = "none";

    const created = await createServerGame();

    if (!created) {
        stopGame();
        menu.style.display = "flex";
        return;
    }

    restartMeteorTimer();
    state.frame = requestAnimationFrame(gameLoop);
}

function stopGame() {
    state.running = false;

    clearInterval(state.meteorTimer);
    cancelAnimationFrame(state.frame);

    state.meteorTimer = null;
    state.frame = null;

    setDirection(0);
    clearMeteors();
}

function endGame() {
    if (!state.running) {
        return;
    }

    stopGame();
    void finishServerGame();

    gameOver.style.display = "flex";
}

function requestFullscreenMode() {
    if (document.fullscreenElement || state.fullscreenBusy) {
        return;
    }

    const request =
        document.documentElement.requestFullscreen ||
        document.documentElement.webkitRequestFullscreen ||
        document.documentElement.msRequestFullscreen;

    if (typeof request !== "function") {
        return;
    }

    state.fullscreenBusy = true;

    try {
        const result = request.call(document.documentElement);

        if (result && typeof result.finally === "function") {
            result.finally(() => {
                state.fullscreenBusy = false;
            });
        } else {
            setTimeout(() => {
                state.fullscreenBusy = false;
            }, 700);
        }
    } catch {
        state.fullscreenBusy = false;
    }
}

function bindMovement(button, direction) {
    if (!button) {
        return;
    }

    button.addEventListener("pointerdown", event => {
        event.preventDefault();
        requestFullscreenMode();
        setDirection(direction);
    });

    ["pointerup", "pointercancel", "pointerleave"].forEach(type => {
        button.addEventListener(type, () => setDirection(0));
    });
}

async function loadConfig() {
    try {
        const response = await fetch("/api/game-config");

        if (!response.ok) {
            return;
        }

        const data = await response.json();
        const title = $("gameTitle");

        if (title && data.runningText) {
            title.textContent = data.runningText;
        }

        document.body.dataset.effect = data.effect || "rainbow";
    } catch {
        // Konfigurasi default HTML tetap digunakan.
    }
}

function showMessage(element, text, error = true) {
    if (!element) {
        return;
    }

    element.textContent = text;
    element.style.color = error ? "#ff7777" : "#7dffb2";
}

function showAdminPanel() {
    if (!state.user?.isAdmin) {
        return;
    }

    document.getElementById("adminPanel")?.remove();

    const panel = document.createElement("div");
    panel.id = "adminPanel";

    panel.innerHTML = `
        <h3>ADMIN PANEL</h3>

        <label for="adminRunningText">Teks berjalan</label>
        <input id="adminRunningText"
            maxlength="80"
            placeholder="Masukkan teks berjalan">

        <label for="adminEffect">Efek teks</label>
        <select id="adminEffect">
            <option value="rainbow">Rainbow</option>
            <option value="pulse">Pulse</option>
            <option value="glitch">Glitch</option>
            <option value="static">Static</option>
        </select>

        <button id="saveAdminConfig" type="button">
            SIMPAN KONFIGURASI
        </button>

        <p id="adminMessage"></p>
    `;

    document.body.appendChild(panel);

    const textInput = $("adminRunningText");
    const effectSelect = $("adminEffect");
    const message = $("adminMessage");
    const saveButton = $("saveAdminConfig");

    fetch("/api/game-config")
        .then(response => {
            if (!response.ok) {
                throw new Error("Konfigurasi tidak tersedia.");
            }

            return response.json();
        })
        .then(data => {
            textInput.value = data.runningText || "SANDRO GAME V2";
            effectSelect.value = data.effect || "rainbow";
        })
        .catch(() => {
            textInput.value = "SANDRO GAME V2";
            effectSelect.value = "rainbow";
        });

    saveButton.addEventListener("click", async () => {
        const runningText = textInput.value.trim();

        if (!runningText) {
            showMessage(message, "Teks berjalan tidak boleh kosong.");
            return;
        }

        saveButton.disabled = true;

        try {
            const response = await fetch("/api/admin/game-config", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    runningText,
                    effect: effectSelect.value
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error || "Gagal menyimpan konfigurasi."
                );
            }

            $("gameTitle").textContent = data.runningText;
            document.body.dataset.effect = data.effect;

            showMessage(
                message,
                "Konfigurasi admin berhasil disimpan.",
                false
            );
        } catch (error) {
            showMessage(
                message,
                error.message || "Terjadi kesalahan."
            );
        } finally {
            saveButton.disabled = false;
        }
    });
}

function showUserPanel() {
    document.getElementById("userPanel")?.remove();

    const panel = document.createElement("div");
    panel.id = "userPanel";

    const username = document.createElement("span");
    username.textContent = `👤 ${state.user.username}`;

    panel.appendChild(username);

    if (state.user.isAdmin) {
        const adminLabel = document.createElement("strong");
        adminLabel.textContent = "ADMIN";
        panel.appendChild(adminLabel);
    }

    const logoutButton = document.createElement("button");
    logoutButton.id = "logoutButton";
    logoutButton.type = "button";
    logoutButton.textContent = "LOGOUT";

    panel.appendChild(logoutButton);
    document.body.appendChild(panel);

    logoutButton.addEventListener("click", logout);
    showAdminPanel();
}

async function logout() {
    stopGame();
    await finishServerGame();

    try {
        await fetch("/api/auth/logout", {
            method: "POST"
        });
    } catch {
        // Sesi lokal tetap dihapus.
    }

    state.user = null;
    state.gameId = null;

    document.getElementById("userPanel")?.remove();
    document.getElementById("adminPanel")?.remove();
    document.getElementById("authScreen")?.remove();

    menu.style.display = "flex";
    gameOver.style.display = "none";

    createAuthScreen();
}

function createAuthScreen() {
    document.getElementById("authScreen")?.remove();

    const screen = document.createElement("div");
    screen.id = "authScreen";

    screen.innerHTML = `
        <form class="authBox">
            <h1 id="authTitle">LOGIN</h1>

            <input id="authUsername"
                placeholder="Username"
                minlength="3"
                maxlength="20"
                autocomplete="username"
                required>

            <input id="authPassword"
                type="password"
                placeholder="Password minimal 8 karakter"
                minlength="8"
                maxlength="72"
                autocomplete="current-password"
                required>

            <button id="authSubmit" type="submit">LOGIN</button>

            <button id="authSwitch"
                type="button"
                class="secondary">
                Belum punya akun? Daftar
            </button>

            <p id="authMessage"></p>
        </form>
    `;

    document.body.appendChild(screen);

    const form = screen.querySelector("form");
    const title = $("authTitle");
    const username = $("authUsername");
    const password = $("authPassword");
    const submit = $("authSubmit");
    const switchButton = $("authSwitch");
    const message = $("authMessage");

    let registerMode = false;

    switchButton.addEventListener("click", () => {
        requestFullscreenMode();

        registerMode = !registerMode;

        title.textContent = registerMode ? "DAFTAR AKUN" : "LOGIN";
        submit.textContent = registerMode ? "DAFTAR" : "LOGIN";

        switchButton.textContent = registerMode
            ? "Sudah punya akun? Login"
            : "Belum punya akun? Daftar";

        password.autocomplete = registerMode
            ? "new-password"
            : "current-password";

        showMessage(message, "");
    });

    form.addEventListener("submit", async event => {
        event.preventDefault();
        requestFullscreenMode();

        const name = username.value.trim().toLowerCase();
        const pass = password.value;

        if (!/^[a-z0-9_]{3,20}$/.test(name)) {
            showMessage(
                message,
                "Username hanya boleh berisi huruf, angka, dan underscore."
            );
            return;
        }

        if (pass.length < 8 || pass.length > 72) {
            showMessage(
                message,
                "Password harus terdiri dari 8 sampai 72 karakter."
            );
            return;
        }

        submit.disabled = true;
        submit.textContent = registerMode ? "MENDAFTAR..." : "LOGIN...";

        try {
            const response = await fetch(
                registerMode
                    ? "/api/auth/register"
                    : "/api/auth/login",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        username: name,
                        password: pass
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Autentikasi gagal.");
            }

            state.user = data.user;
            screen.remove();

            showUserPanel();
            await loadConfig();
        } catch (error) {
            showMessage(
                message,
                error.message || "Terjadi kesalahan."
            );
        } finally {
            submit.disabled = false;
            submit.textContent = registerMode ? "DAFTAR" : "LOGIN";
        }
    });
}

function injectDynamicStyles() {
    const style = document.createElement("style");

    style.textContent = `
        #score {
            min-width: 180px;
            line-height: 1.35;
        }

        #score .score-value {
            font-size: 24px;
            font-weight: 900;
        }

        #score .level-value {
            margin-top: 3px;
            color: #ffe66d;
            font-size: 20px;
            font-weight: 900;
            text-shadow: 0 0 10px #ffb300;
        }

        #gameTitle {
            font-weight: 900 !important;
            -webkit-text-stroke: 1.5px rgba(255,255,255,.35);
        }

        #levelUp {
            white-space: nowrap;
            font-weight: 900;
        }

        #userPanel {
            position: fixed;
            top: 20px;
            left: 50%;
            display: flex;
            align-items: center;
            gap: 8px;
            z-index: 1001;
            padding: 8px 12px;
            border: 1px solid rgba(255,255,255,.35);
            border-radius: 10px;
            background: rgba(0,0,0,.65);
            color: white;
            transform: translateX(-50%);
        }

        #userPanel strong {
            padding: 4px 7px;
            border-radius: 5px;
            background: #ffb300;
            color: #151515;
            font-size: 11px;
        }

        #userPanel button,
        #adminPanel button {
            cursor: pointer;
        }

        #adminPanel {
            position: fixed;
            top: 75px;
            right: 20px;
            z-index: 1001;
            width: min(300px, calc(100vw - 40px));
            padding: 15px;
            border: 1px solid #00eaff;
            border-radius: 12px;
            background: rgba(0,0,0,.82);
            color: white;
            box-shadow: 0 0 18px rgba(0,234,255,.5);
        }

        #adminPanel label {
            display: block;
            margin-top: 8px;
            color: #ffe66d;
            font-size: 12px;
        }

        #adminPanel input,
        #adminPanel se