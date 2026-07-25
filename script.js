"use strict";

const sky = document.getElementById("sky");
const player = document.getElementById("p");
const score = document.getElementById("score");
const menu = document.getElementById("menu");
const over = document.getElementById("over");
const levelSelect = document.getElementById("levelSelect");
const title = document.getElementById("gameTitle");

const API_URL = "/api";

let serverGameId = null;
let scoreQueue = Promise.resolve();
let currentUser = null;
let fullscreenStarted = false;
let configTimer = null;

const game = {
    running: false,
    score: 0,
    level: 1,
    playerX: window.innerWidth / 2,
    playerSpeed: 420,
    moveLeft: false,
    moveRight: false,
    meteorSpeed: 220,
    meteorSize: 46,
    spawnDelay: 700,
    lastSpawn: 0,
    meteors: [],
    animationId: null,
    lastFrameTime: 0
};

function addDynamicStyles(){
    const style = document.createElement("style");

    style.textContent = `
        #adminPanel{
            display:none;
            position:fixed;
            top:85px;
            right:20px;
            z-index:1100;
            width:280px;
            padding:16px;
            border:1px solid #46eaff;
            border-radius:14px;
            background:rgba(2,10,35,.95);
            color:white;
            box-shadow:0 0 25px #087eff;
        }

        #adminPanel h3{
            margin-bottom:12px;
            color:#72eeff;
        }

        #adminPanel input,
        #adminPanel select,
        #adminPanel button{
            width:100%;
            margin-top:8px;
            padding:10px;
            border:0;
            border-radius:8px;
            font-size:14px;
        }

        #adminPanel button{
            cursor:pointer;
            color:white;
            font-weight:bold;
            background:#087eff;
        }

        #adminMessage{
            min-height:18px;
            margin-top:8px;
            color:#8dffae;
            font-size:12px;
        }

        body.effect-pulse #gameTitle{
            animation-duration:5s,1s,1.5s,.18s;
        }

        body.effect-glitch #gameTitle{
            animation-name:glitchMove,titleFloat,rgbText,ledBlink;
        }

        body.effect-static #gameTitle{
            animation:titleFloat 2.5s ease-in-out infinite;
        }

        @keyframes glitchMove{
            0%,100%{left:-100%;transform:skew(0deg)}
            20%{transform:skew(14deg)}
            22%{transform:skew(-18deg)}
            40%{left:20%;transform:skew(0deg)}
            60%{left:70%;transform:skew(-12deg)}
            80%{left:110%;transform:skew(10deg)}
        }
    `;

    document.head.appendChild(style);
}

function createAuthScreen(){
    const auth = document.createElement("div");

    auth.id = "authScreen";
    auth.innerHTML = `
        <div class="auth-card">
            <h1>SANDRO GAME V2</h1>
            <p>Login atau buat akun untuk bermain</p>

            <input id="authUsername"
                type="text"
                maxlength="20"
                autocomplete="username"
                placeholder="Username">

            <input id="authPassword"
                type="password"
                maxlength="72"
                autocomplete="current-password"
                placeholder="Password minimal 8 karakter">

            <button id="loginButton">LOGIN</button>
            <button id="registerButton">DAFTAR AKUN</button>
            <p id="authMessage"></p>
        </div>
    `;

    document.body.appendChild(auth);

    const style = document.createElement("style");

    style.textContent = `
        #authScreen{
            position:fixed;
            inset:0;
            z-index:2000;
            display:flex;
            justify-content:center;
            align-items:center;
            background:rgba(0,0,10,.92);
            color:white;
        }

        .auth-card{
            width:min(90%,390px);
            padding:28px;
            border:1px solid #36d9ff;
            border-radius:18px;
            background:rgba(5,15,45,.95);
            box-shadow:0 0 30px #087eff;
            text-align:center;
        }

        .auth-card h1{
            margin-bottom:12px;
            color:#7eeaff;
        }

        .auth-card input,
        .auth-card button{
            width:100%;
            margin-top:12px;
            padding:13px;
            border:0;
            border-radius:9px;
            font-size:16px;
        }

        .auth-card button{
            cursor:pointer;
            color:white;
            font-weight:bold;
            background:#087eff;
        }

        .auth-card button + button{
            background:#8d35dd;
        }

        #authMessage{
            min-height:22px;
            margin-top:15px;
            color:#ffb7b7;
        }
    `;

    document.head.appendChild(style);
    return auth;
}

addDynamicStyles();

const authScreen = createAuthScreen();
const authUsername = document.getElementById("authUsername");
const authPassword = document.getElementById("authPassword");
const authMessage = document.getElementById("authMessage");

function createAdminPanel(){
    if(document.getElementById("adminPanel")){
        return;
    }

    const panel = document.createElement("div");

    panel.id = "adminPanel";
    panel.innerHTML = `
        <h3>ADMIN CONTROL</h3>

        <label>Teks berjalan</label>
        <input id="runningTextInput"
            maxlength="80"
            placeholder="Masukkan teks running">

        <label>Efek global</label>
        <select id="effectSelect">
            <option value="rainbow">Rainbow</option>
            <option value="pulse">Pulse</option>
            <option value="glitch">Glitch</option>
            <option value="static">Static</option>
        </select>

        <button id="saveGlobalConfig">SIMPAN PERUBAHAN</button>
        <p id="adminMessage"></p>
    `;

    document.body.appendChild(panel);

    document.getElementById("saveGlobalConfig")
        .addEventListener("click",saveGlobalConfig);
}

async function requestJson(url, options = {}){
    const response = await fetch(url,{
        credentials:"same-origin",
        ...options,
        headers:{
            "Content-Type":"application/json",
            ...(options.headers || {})
        }
    });

    const data = await response.json().catch(() => ({}));

    if(!response.ok){
        throw new Error(data.error || "Terjadi kesalahan");
    }

    return data;
}

async function authenticate(mode){
    const username = authUsername.value.trim();
    const password = authPassword.value;

    if(!username || password.length < 8){
        authMessage.textContent =
            "Username dan password minimal 8 karakter.";
        return;
    }

    try{
        const endpoint = mode === "register"
            ? "/auth/register"
            : "/auth/login";

        const result = await requestJson(`${API_URL}${endpoint}`,{
            method:"POST",
            body:JSON.stringify({ username,password })
        });

        currentUser = result.user;
        authScreen.remove();
        menu.style.display = "flex";

        if(currentUser?.isAdmin){
            createAdminPanel();
            document.getElementById("adminPanel").style.display = "block";
        }

        loadGlobalConfig();
        startConfigPolling();
    }catch(error){
        authMessage.textContent = error.message;
    }
}

document.getElementById("loginButton")
    .addEventListener("click",() => authenticate("login"));

document.getElementById("registerButton")
    .addEventListener("click",() => authenticate("register"));

authPassword.addEventListener("keydown",event => {
    if(event.key === "Enter"){
        authenticate("login");
    }
});

async function loadGlobalConfig(){
    try{
        const config = await requestJson(`${API_URL}/game-config`);

        title.textContent = config.runningText || "SANDRO GAME V2";
        document.body.classList.remove(
            "effect-rainbow",
            "effect-pulse",
            "effect-glitch",
            "effect-static"
        );
        document.body.classList.add(`effect-${config.effect || "rainbow"}`);

        const input = document.getElementById("runningTextInput");
        const select = document.getElementById("effectSelect");

        if(input){
            input.value = config.runningText || "";
        }

        if(select){
            select.value = config.effect || "rainbow";
        }
    }catch(error){
        console.warn("Konfigurasi global belum tersedia:",error);
    }
}

function startConfigPolling(){
    if(configTimer){
        return;
    }

    configTimer = setInterval(loadGlobalConfig,2000);
}

async function saveGlobalConfig(){
    const message = document.getElementById("adminMessage");
    const runningText = document.getElementById("runningTextInput").value.trim();
    const effect = document.getElementById("effectSelect").value;

    try{
        await requestJson(`${API_URL}/admin/game-config`,{
            method:"POST",
            body:JSON.stringify({ runningText,effect })
        });

        message.textContent = "Perubahan berhasil diterapkan.";
        await loadGlobalConfig();
    }catch(error){
        message.textContent = error.message;
    }
}

async function enterFullscreen(){
    if(fullscreenStarted || document.fullscreenElement){
        return;
    }

    if(!document.documentElement.requestFullscreen){
        return;
    }

    try{
        await document.documentElement.requestFullscreen();
        fullscreenStarted = true;
    }catch(error){
        console.warn("Fullscreen tidak diizinkan:",error);
    }
}

document.getElementById("fs").addEventListener("click",enterFullscreen);

async function createServerGame(){
    const result = await requestJson(`${API_URL}/games`,{
        method:"POST"
    });

    serverGameId = result.gameId;
}

function showLevelUp(){
    const levelUp = document.getElementById("levelUp");

    levelUp.classList.remove("show");
    void levelUp.offsetWidth;
    levelUp.textContent = `LEVEL ${game.level}!`;
    levelUp.classList.add("show");
}

function reportMeteorEscaped(){
    if(!serverGameId){
        return;
    }

    scoreQueue = scoreQueue
        .then(async () => {
            const result = await requestJson(
                `${API_URL}/games/${serverGameId}/meteor-escaped`,
                { method:"POST" }
            );

            const previousLevel = game.level;

            game.score = result.score;
            game.level = result.level;
            updateHUD();

            if(game.level > previousLevel){
                showLevelUp();
                applyLevel(game.level);
            }
        })
        .catch(error => {
            console.warn("Skor belum diterima server:",error);
        });
}

async function saveServerScore(){
    if(!serverGameId){
        return;
    }

    await scoreQueue;

    try{
        await requestJson(
            `${API_URL}/games/${serverGameId}/finish`,
            { method:"POST" }
        );
    }catch(error){
        console.warn("High score belum tersimpan:",error);
    }finally{
        serverGameId = null;
        scoreQueue = Promise.resolve();
    }
}

function updateHUD(){
    score.textContent =
        `Score : ${game.score} | Level : ${game.level}`;
}

function applyLevel(level){
    game.level = level;
    game.meteorSpeed = 220 + (level - 1) * 24;
    game.spawnDelay = Math.max(180,700 - (level - 1) * 22);
}

function updatePlayer(dt){
    let direction = 0;

    if(game.moveLeft) direction--;
    if(game.moveRight) direction++;

    game.playerX += direction * game.playerSpeed * dt;

    game.playerX = Math.max(
        50,
        Math.min(game.playerX,window.innerWidth - 50)
    );

    player.style.left = `${game.playerX}px`;
}

function resetGame(){
    game.running = false;
    game.score = 0;
    game.playerX = window.innerWidth / 2;
    game.moveLeft = false;
    game.moveRight = false;
    game.lastSpawn = 0;
    game.lastFrameTime = 0;

    if(game.animationId !== null){
        cancelAnimationFrame(game.animationId);
        game.animationId = null;
    }

    game.meteors.forEach(meteor => meteor.element.remove());
    game.meteors = [];

    player.style.left = `${game.playerX}px`;
    updateHUD();
}

function createMeteor(){
    const element = document.createElement("div");

    element.className = "a";
    element.style.left =
        `${Math.random() * (window.innerWidth - game.meteorSize)}px`;
    element.style.top = "-70px";

    sky.appendChild(element);

    game.meteors.push({
        element,
        speed:game.meteorSpeed,
        y:-70
    });
}

function isTouching(a,b){
    return (
        a.left < b.right &&
        a.right > b.left &&
        a.top < b.bottom &&
        a.bottom > b.top
    );
}

function hitPlayer(meteor){
    const p = player.getBoundingClientRect();
    const m = meteor.element.getBoundingClientRect();

    return isTouching(
        {
            left:m.left + 8,
            right:m.right - 8,
            top:m.top + 8,
            bottom:m.bottom - 8
        },
        {
            left:p.left + 30,
            right:p.right - 30,
            top:p.top + 15,
            bottom:p.bottom - 8
        }
    );
}

function updateMeteors(dt){
    for(let i = game.meteors.length - 1;i >= 0;i--){
        const meteor = game.meteors[i];

        meteor.y += meteor.speed * dt;
        meteor.element.style.transform =
            `translateY(${meteor.y}px)`;

        if(hitPlayer(meteor)){
            gameOver();
            return;
        }

        if(meteor.element.getBoundingClientRect().top >
            window.innerHeight){

            meteor.element.remove();
            game.meteors.splice(i,1);
            reportMeteorEscaped();
        }
    }
}

function gameOver(){
    if(!game.running){
        return;
    }

    game.running = false;
    game.moveLeft = false;
    game.moveRight = false;
    over.style.display = "flex";

    saveServerScore();

    if(game.animationId !== null){
        cancelAnimationFrame(game.animationId);
        game.animationId = null;
    }
}

function gameLoop(time){
    if(!game.running){
        return;
    }

    const dt = game.lastFrameTime
        ? Math.min((time - game.lastFrameTime) / 1000,.033)
        : 0;

    game.lastFrameTime = time;
    updatePlayer(dt);

    if(time - game.lastSpawn >= game.spawnDelay){
        game.lastSpawn = time;
        createMeteor();
    }

    updateMeteors(dt);

    if(game.running){
        game.animationId = requestAnimationFrame(gameLoop);
    }
}

async function startGame(){
    enterFullscreen();
    resetGame();

    const selectedLevel = parseInt(levelSelect.value,10) || 1;
    applyLevel(selectedLevel);
    updateHUD();

    try{
        await createServerGame();

        menu.style.display = "none";
        over.style.display = "none";
        game.running = true;
        game.animationId = requestAnimationFrame(gameLoop);
    }catch(error){
        alert(error.message);
    }
}

function openLevelMenu(){
    over.style.display = "none";
    menu.style.display = "flex";
}

function setMove(direction,state){
    if(direction === "left") game.moveLeft = state;
    if(direction === "right") game.moveRight = state;
}

function bindHoldButton(button,direction){
    button.addEventListener("pointerdown",event => {
        event.preventDefault();
        setMove(direction,true);
    });

    ["pointerup","pointercancel","pointerleave"].forEach(name => {
        button.addEventListener(name,() => {
            setMove(direction,false);
        });
    });
}

bindHoldButton(document.getElementById("l"),"left");
bindHoldButton(document.getElementById("r"),"right");

document.addEventListener("keydown",event => {
    if(event.key === "ArrowLeft" || event.key.toLowerCase() === "a"){
        game.moveLeft = true;
    }

    if(event.key === "ArrowRight" || event.key.toLowerCase() === "d"){
        game.moveRight = true;
    }
});

document.addEventListener("keyup",event => {
    if(event.key === "ArrowLeft" || event.key.toLowerCase() === "a"){
        game.moveLeft = false;
    }

    if(event.key === "ArrowRight" || event.key.toLowerCase() === "d"){
        game.moveRight = false;
    }
});

window.addEventListener("blur",() => {
    game.moveLeft = false;
    game.moveRight = false;
});

window.addEventListener("resize",() => {
    game.playerX = Math.max(
        50,
        Math.min(game.playerX,window.innerWidth - 50)
    );

    player.style.left = `${game.playerX}px`;
});

document.getElementById("start")
    .addEventListener("click",startGame);

document.getElementById("restart")
    .addEventListener("click",startGame);

document.getElementById("pickLevel")
    .addEventListener("click",openLevelMenu);

updateHUD();
player.style.left = `${game.playerX}px`;