"use strict";

const $ = id => document.getElementById(id);

const player = $("p");
const menu = $("menu");
const gameOver = $("over");
const scoreText = $("score");
const levelUp = $("levelUp");
const levelSelect = $("levelSelect");

const state = {
    user:null,
    score:0,
    level:1,
    playerX:innerWidth / 2,
    direction:0,
    running:false,
    gameId:null,
    meteorTimer:null,
    frame:null,
    fullscreenBusy:false
};

const meteors = [];

function requestFullscreenMode(){
    if(document.fullscreenElement || state.fullscreenBusy){
        return;
    }

    const element = document.documentElement;
    const request = element.requestFullscreen ||
        element.webkitRequestFullscreen ||
        element.msRequestFullscreen;

    if(!request){
        return;
    }

    state.fullscreenBusy = true;

    try{
        const result = request.call(element);

        if(result?.finally){
            result.finally(() => {
                state.fullscreenBusy = false;
            });
        }else{
            setTimeout(() => {
                state.fullscreenBusy = false;
            },500);
        }
    }catch(error){
        state.fullscreenBusy = false;
    }
}

function enableFullscreenAnywhere(){
    document.addEventListener("pointerdown",requestFullscreenMode,true);
    document.addEventListener("touchstart",requestFullscreenMode,true);
    document.addEventListener("click",requestFullscreenMode,true);
}

function showMessage(element,text,error = true){
    if(!element){
        return;
    }

    element.textContent = text;
    element.style.color = error ? "#ff7777" : "#7dffb2";
}

function updateScore(){
    scoreText.textContent =
        `Score : ${state.score} | Level : ${state.level}`;
}

function showLevelUp(){
    levelUp.textContent = `LEVEL ${state.level} UP!`;
    levelUp.classList.remove("show");

    void levelUp.offsetWidth;

    levelUp.classList.add("show");

    setTimeout(() => {
        levelUp.classList.remove("show");
    },1200);
}

function increaseLevel(){
    const newLevel = Math.min(
        30,
        Math.floor(state.score / 10) + Number(levelSelect.value || 1)
    );

    if(newLevel > state.level){
        state.level = newLevel;
        updateScore();
        showLevelUp();
        restartMeteorTimer();
    }
}

function restartMeteorTimer(){
    clearInterval(state.meteorTimer);

    if(!state.running){
        return;
    }

    state.meteorTimer = setInterval(
        createMeteor,
        Math.max(350,1100 - state.level * 20)
    );
}

function createAuthScreen(){
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

    switchButton.addEventListener("click",() => {
        registerMode = !registerMode;

        title.textContent = registerMode
            ? "DAFTAR AKUN"
            : "LOGIN";

        submit.textContent = registerMode
            ? "DAFTAR"
            : "LOGIN";

        switchButton.textContent = registerMode
            ? "Sudah punya akun? Login"
            : "Belum punya akun? Daftar";

        password.autocomplete = registerMode
            ? "new-password"
            : "current-password";

        showMessage(message,"");
    });

    form.addEventListener("submit",async event => {
        event.preventDefault();

        const name = username.value.trim().toLowerCase();
        const pass = password.value;

        if(!/^[a-z0-9_]{3,20}$/.test(name)){
            showMessage(
                message,
                "Username hanya boleh berisi huruf, angka, dan underscore."
            );
            return;
        }

        if(pass.length < 8){
            showMessage(message,"Password minimal 8 karakter.");
            return;
        }

        submit.disabled = true;
        submit.textContent = registerMode ? "MENDAFTAR..." : "LOGIN...";

        try{
            const response = await fetch(
                registerMode
                    ? "/api/auth/register"
                    : "/api/auth/login",
                {
                    method:"POST",
                    headers:{
                        "Content-Type":"application/json"
                    },
                    body:JSON.stringify({
                        username:name,
                        password:pass
                    })
                }
            );

            const data = await response.json();

            if(!response.ok){
                throw new Error(data.error || "Autentikasi gagal.");
            }

            state.user = data.user;
            screen.remove();

            showUserPanel();
            await loadConfig();
        }catch(error){
            showMessage(message,error.message);
        }finally{
            submit.disabled = false;
            submit.textContent = registerMode ? "DAFTAR" : "LOGIN";
        }
    });
}

function showUserPanel(){
    document.getElementById("userPanel")?.remove();

    const panel = document.createElement("div");

    panel.id = "userPanel";
    panel.innerHTML = `
        <span>👤 ${state.user.username}</span>
        <button id="logoutButton">LOGOUT</button>
    `;

    document.body.appendChild(panel);
    $("logoutButton").addEventListener("click",logout);
}

async function logout(){
    stopGame();

    try{
        await fetch("/api/auth/logout",{method:"POST"});
    }catch(error){}

    state.user = null;
    state.gameId = null;

    document.getElementById("userPanel")?.remove();

    menu.style.display = "flex";
    gameOver.style.display = "none";

    createAuthScreen();
}

async function loadConfig(){
    try{
        const response = await fetch("/api/game-config");
        const data = await response.json();

        if(data.runningText){
            $("gameTitle").textContent = data.runningText;
        }

        document.body.dataset.effect = data.effect || "rainbow";
    }catch(error){}
}

function updatePlayer(){
    const width = player.offsetWidth || 70;
    const min = width / 2;
    const max = innerWidth - width / 2;

    state.playerX += state.direction * 7;
    state.playerX = Math.max(min,Math.min(max,state.playerX));

    player.style.left = `${state.playerX}px`;
}

function setDirection(value){
    state.direction = value;

    player.classList.remove("walk-left","walk-right");

    if(value < 0){
        player.classList.add("walk-left");
    }else if(value > 0){
        player.classList.add("walk-right");
    }
}

function createMeteor(){
    if(!state.running){
        return;
    }

    const meteor = document.createElement("div");
    const size = innerWidth <= 600 ? 48 : 58;
    const x = Math.random() * Math.max(1,innerWidth - size);

    meteor.className = "a";
    meteor.style.left = `${x}px`;
    meteor.style.top = `${-size - 90}px`;

    document.body.appendChild(meteor);

    meteors.push({
        element:meteor,
        y:-size - 90,
        speed:3 + state.level * .25 + Math.random() * 2
    });
}

function overlap(first,second){
    return first.left < second.right &&
        first.right > second.left &&
        first.top < second.bottom &&
        first.bottom > second.top;
}

function removeMeteor(index){
    meteors[index]?.element.remove();
    meteors.splice(index,1);
}

function clearMeteors(){
    while(meteors.length){
        removeMeteor(0);
    }
}

async function saveMeteorEscaped(){
    if(!state.gameId){
        return;
    }

    try{
        const response = await fetch(
            `/api/games/${state.gameId}/meteor-escaped`,
            {method:"POST"}
        );

        if(!response.ok){
            return;
        }

        const data = await response.json();

        if(Number(data.level) > state.level){
            state.level = Math.min(30,Number(data.level));
            updateScore();
            showLevelUp();
            restartMeteorTimer();
        }
    }catch(error){}
}

function gameLoop(){
    if(!state.running){
        return;
    }

    updatePlayer();

    const playerRect = player.getBoundingClientRect();

    for(let index = meteors.length - 1;index >= 0;index--){
        const meteor = meteors[index];

        meteor.y += meteor.speed;
        meteor.element.style.top = `${meteor.y}px`;

        if(overlap(
            playerRect,
            meteor.element.getBoundingClientRect()
        )){
            endGame();
            return;
        }

        if(meteor.y > innerHeight + 100){
            removeMeteor(index);

            state.score++;
            updateScore();
            increaseLevel();
            saveMeteorEscaped();
        }
    }

    state.frame = requestAnimationFrame(gameLoop);
}

async function createServerGame(){
    try{
        const response = await fetch("/api/games",{
            method:"POST",
            headers:{
                "Content-Type":"application/json"
            },
            body:JSON.stringify({
                level:state.level
            })
        });

        if(response.status === 401){
            await logout();
            return false;
        }

        if(!response.ok){
            return false;
        }

        const data = await response.json();
        state.gameId = data.gameId;

        return Boolean(state.gameId);
    }catch(error){
        return false;
    }
}

async function finishServerGame(){
    if(!state.gameId){
        return;
    }

    try{
        await fetch(`/api/games/${state.gameId}/finish`,{
            method:"POST"
        });
    }catch(error){}

    state.gameId = null;
}

async function startGame(){
    if(!state.user){
        createAuthScreen();
        return;
    }

    stopGame();

    state.score = 0;
    state.level = Number(levelSelect.value) || 1;
    state.playerX = innerWidth / 2;
    state.running = true;

    updateScore();

    menu.style.display = "none";
    gameOver.style.display = "none";

    if(!await createServerGame()){
        stopGame();
        menu.style.display = "flex";
        return;
    }

    restartMeteorTimer();
    state.frame = requestAnimationFrame(gameLoop);
}

function stopGame(){
    state.running = false;

    clearInterval(state.meteorTimer);
    cancelAnimationFrame(state.frame);

    state.meteorTimer = null;
    state.frame = null;

    setDirection(0);
    clearMeteors();
}

function endGame(){
    if(!state.running){
        return;
    }

    stopGame();
    finishServerGame();

    gameOver.style.display = "flex";
}

function bindMovement(button,direction){
    button.addEventListener("pointerdown",event => {
        event.preventDefault();
        setDirection(direction);
    });

    ["pointerup","pointercancel","pointerleave"].forEach(type => {
        button.addEventListener(type,() => setDirection(0));
    });
}

$("start").addEventListener("click",startGame);
$("restart").addEventListener("click",startGame);

$("pickLevel").addEventListener("click",() => {
    stopGame();
    gameOver.style.display = "none";
    menu.style.display = "flex";
});

$("fs").addEventListener("click",requestFullscreenMode);

bindMovement($("l"),-1);
bindMovement($("r"),1);

document.addEventListener("keydown",event => {
    if(event.key === "ArrowLeft" || event.key.toLowerCase() === "a"){
        setDirection(-1);
    }

    if(event.key === "ArrowRight" || event.key.toLowerCase() === "d"){
        setDirection(1);
    }
});

document.addEventListener("keyup",event => {
    if(["ArrowLeft","ArrowRight","a","d"].includes(event.key)){
        setDirection(0);
    }
});

window.addEventListener("resize",() => {
    state.playerX = Math.min(state.playerX,innerWidth);
    updatePlayer();
});

const style = document.createElement("style");

style.textContent = `
#authScreen{
    position:fixed;
    inset:0;
    z-index:3000;
    display:flex;
    align-items:center;
    justify-content:center;
    background:rgba(0,0,0,.88);
    color:#fff;
}

.authBox{
    width:min(90%,380px);
    padding:28px;
    border:1px solid #00eaff;
    border-radius:18px;
    background:rgba(5,12,38,.97);
    box-shadow:0 0 30px #00bfff;
    text-align:center;
}

.authBox h1{
    margin-bottom:18px;
    color:#61efff;
}

.authBox input{
    width:100%;
    padding:13px;
    margin:7px 0;
    border:0;
    border-radius:8px;
    box-sizing:border-box;
    font-size:16px;
}

.authBox button{
    width:100%;
    padding:12px;
    margin-top:10px;
    border:0;
    border-radius:8px;
    background:#00aaff;
    color:#fff;
    font-weight:bold;
}

.authBox .secondary{
    background:transparent;
    color:#72eaff;
}

#authMessage{
    min-height:20px;
    margin-top:14px;
}

#userPanel{
    position:fixed;
    top:15px;
    right:15px;
    z-index:2000;
    display:flex;
    align-items:center;
    gap:7px;
    color:#fff;
    font-size:13px;
}

#userPanel button{
    padding:8px 10px;
    border:0;
    border-radius:7px;
    background:#a83232;
    color:#fff;
    font-weight:bold;
}

#levelUp{
    white-space:nowrap;
}
`;

document.head.appendChild(style);

enableFullscreenAnywhere();
updatePlayer();
updateScore();
createAuthScreen();
loadConfig();