"use strict";

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const production = process.env.NODE_ENV === "production";

if (production && !process.env.ADMIN_PASSWORD) {
    throw new Error("ADMIN_PASSWORD wajib diatur pada Railway Variables");
}

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "sandro011021";
const DATA_DIR = process.env.DATA_DIR || (
    production ? "/data" : path.join(__dirname, "private-data")
);

fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });

const db = new Database(path.join(DATA_DIR, "sandro-game.db"));

app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", "data:"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            frameAncestors: ["'none'"]
        }
    }
}));

app.use(cookieParser());
app.use(express.json({ limit: "10kb" }));

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false
});

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_event_at INTEGER NOT NULL,
        score INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 1,
        finished INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS high_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        score INTEGER NOT NULL,
        level INTEGER NOT NULL,
        created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS server_settings (
        setting_key TEXT PRIMARY KEY,
        setting_value TEXT NOT NULL
    );
`);

try {
    fs.chmodSync(path.join(DATA_DIR, "sandro-game.db"), 0o600);
} catch {}

const findUser = db.prepare(`
    SELECT * FROM users WHERE username = ?
`);

const insertUser = db.prepare(`
    INSERT INTO users
    (id, username, password_hash, is_admin, created_at)
    VALUES (?, ?, ?, ?, ?)
`);

const updateAdmin = db.prepare(`
    UPDATE users
    SET password_hash = ?, is_admin = 1
    WHERE username = ?
`);

const insertSession = db.prepare(`
    INSERT INTO sessions
    (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
`);

const findSession = db.prepare(`
    SELECT
        users.id,
        users.username,
        users.is_admin,
        sessions.expires_at
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
`);

const deleteSession = db.prepare(`
    DELETE FROM sessions WHERE token_hash = ?
`);

const insertGame = db.prepare(`
    INSERT INTO games
    (id, user_id, created_at, last_event_at, score, level, finished)
    VALUES (?, ?, ?, ?, 0, ?, 0)
`);

const findGame = db.prepare(`
    SELECT * FROM games WHERE id = ?
`);

const addScore = db.prepare(`
    UPDATE games
    SET
        score = score + 1,
        level = MIN(30, level + CASE
            WHEN ((score + 1) % 10) = 0 THEN 1
            ELSE 0
        END),
        last_event_at = ?
    WHERE id = ? AND finished = 0
`);

const finishGame = db.prepare(`
    UPDATE games
    SET finished = 1
    WHERE id = ? AND finished = 0
`);

const insertHighScore = db.prepare(`
    INSERT INTO high_scores
    (user_id, username, score, level, created_at)
    VALUES (?, ?, ?, ?, ?)
`);

const getSetting = db.prepare(`
    SELECT setting_value
    FROM server_settings
    WHERE setting_key = ?
`);

const setSetting = db.prepare(`
    INSERT INTO server_settings
    (setting_key, setting_value)
    VALUES (?, ?)
    ON CONFLICT(setting_key)
    DO UPDATE SET setting_value = excluded.setting_value
`);

function normalizeUsername(value) {
    if (typeof value !== "string") return null;

    const username = value.trim().toLowerCase();

    return /^[a-z0-9_]{3,20}$/.test(username)
        ? username
        : null;
}

function validPassword(value) {
    return typeof value === "string" &&
        value.length >= 8 &&
        value.length <= 72;
}

function tokenHash(token) {
    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
}

function safeUser(user) {
    return {
        id: user.id,
        username: user.username,
        isAdmin: Boolean(user.is_admin ?? user.isAdmin)
    };
}

function currentUser(req) {
    const token = req.cookies?.sandro_session;

    if (!token) return null;

    const session = findSession.get(tokenHash(token));

    if (!session || session.expires_at <= Date.now()) {
        if (session) deleteSession.run(tokenHash(token));
        return null;
    }

    return {
        id: session.id,
        username: session.username,
        isAdmin: Boolean(session.is_admin)
    };
}

function requireAuth(req, res, next) {
    const user = currentUser(req);

    if (!user) {
        return res.status(401).json({
            error: "Silakan login terlebih dahulu"
        });
    }

    req.user = user;
    next();
}

function requireAdmin(req, res, next) {
    if (!req.user?.isAdmin) {
        return res.status(403).json({
            error: "Akses admin ditolak"
        });
    }

    next();
}

function createSession(user, res) {
    const token = crypto.randomBytes(32).toString("hex");

    insertSession.run(
        crypto.randomUUID(),
        user.id,
        tokenHash(token),
        Date.now() + 7 * 24 * 60 * 60 * 1000
    );

    res.cookie("sandro_session", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: production,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/"
    });
}

function getConfig() {
    return {
        runningText:
            getSetting.get("running_text")?.setting_value ||
            "SANDRO GAME V2",
        effect:
            getSetting.get("effect")?.setting_value ||
            "rainbow"
    };
}

const adminHash = bcrypt.hashSync(ADMIN_PASSWORD, 12);
const existingAdmin = findUser.get(ADMIN_USERNAME);

if (existingAdmin) {
    updateAdmin.run(adminHash, ADMIN_USERNAME);
} else {
    insertUser.run(
        crypto.randomUUID(),
        ADMIN_USERNAME,
        adminHash,
        1,
        Date.now()
    );
}

if (!getSetting.get("running_text")) {
    setSetting.run("running_text", "SANDRO GAME V2");
}

if (!getSetting.get("effect")) {
    setSetting.run("effect", "rainbow");
}

app.get("/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        service: "sandro-game-server"
    });
});

app.post("/api/auth/register", authLimiter, async (req, res) => {
    const username = normalizeUsername(req.body?.username);
    const password = req.body?.password;

    if (!username || !validPassword(password)) {
        return res.status(400).json({
            error: "Username tidak valid atau password minimal 8 karakter"
        });
    }

    if (username === ADMIN_USERNAME || findUser.get(username)) {
        return res.status(409).json({
            error: "Username sudah digunakan"
        });
    }

    const user = {
        id: crypto.randomUUID(),
        username,
        isAdmin: false
    };

    insertUser.run(
        user.id,
        username,
        await bcrypt.hash(password, 12),
        0,
        Date.now()
    );

    createSession(user, res);

    res.status(201).json({
        user
    });
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
    const username = normalizeUsername(req.body?.username);
    const password = req.body?.password;
    const user = username ? findUser.get(username) : null;

    if (
        !user ||
        !validPassword(password) ||
        !(await bcrypt.compare(password, user.password_hash))
    ) {
        return res.status(401).json({
            error: "Username atau password salah"
        });
    }

    const userData = safeUser(user);
    createSession(userData, res);

    res.json({
        user: userData
    });
});

app.get("/api/auth/me", (req, res) => {
    const user = currentUser(req);

    if (!user) {
        return res.status(401).json({
            error: "Belum login"
        });
    }

    res.json({ user });
});

app.post("/api/auth/logout", (req, res) => {
    const token = req.cookies?.sandro_session;

    if (token) {
        deleteSession.run(tokenHash(token));
    }

    res.clearCookie("sandro_session", {
        httpOnly: true,
        sameSite: "lax",
        secure: production,
        path: "/"
    });

    res.json({ loggedOut: true });
});

app.get("/api/game-config", (req, res) => {
    res.json(getConfig());
});

app.post(
    "/api/admin/game-config",
    requireAuth,
    requireAdmin,
    (req, res) => {
        const runningText = String(req.body?.runningText || "")
            .trim()
            .slice(0, 80);

        const effects = ["rainbow", "pulse", "glitch", "static"];
        const effect = effects.includes(req.body?.effect)
            ? req.body.effect
            : "rainbow";

        if (!runningText) {
            return res.status(400).json({
                error: "Teks berjalan tidak boleh kosong"
            });
        }

        setSetting.run("running_text", runningText);
        setSetting.run("effect", effect);

        res.json({
            saved: true,
            ...getConfig()
        });
    }
);

app.post("/api/games", requireAuth, (req, res) => {
    const level = Math.max(
        1,
        Math.min(30, Number(req.body?.level) || 1)
    );

    const gameId = crypto.randomUUID();
    const now = Date.now();

    insertGame.run(
        gameId,
        req.user.id,
        now,
        now,
        level
    );

    res.status(201).json({ gameId });
});

app.post(
    "/api/games/:id/meteor-escaped",
    requireAuth,
    (req, res) => {
        const game = findGame.get(req.params.id);

        if (!game || game.user_id !== req.user.id) {
            return res.status(404).json({
                error: "Game tidak ditemukan"
            });
        }

        if (game.finished) {
            return res.status(409).json({
                error: "Game sudah selesai"
            });
        }

        const seconds = Math.max(
            1,
            (Date.now() - game.created_at) / 1000
        );

        if (game.score >= Math.floor(seconds * 20)) {
            return res.status(429).json({
                error: "Event terlalu cepat"
            });
        }

        addScore.run(Date.now(), game.id);

        const updated = findGame.get(game.id);

        res.json({
            score: updated.score,
            level: updated.level
        });
    }
);

app.post(
    "/api/games/:id/finish",
    requireAuth,
    (req, res) => {
        const game = findGame.get(req.params.id);

        if (!game || game.user_id !== req.user.id) {
            return res.status(404).json({
                error: "Game tidak ditemukan"
            });
        }

        const result = finishGame.run(game.id);

        if (result.changes && !req.user.isAdmin) {
            insertHighScore.run(
                req.user.id,
                req.user.username,
                game.score,
                game.level,
                Date.now()
            );
        }

        res.json({ saved: true });
    }
);

app.get("/api/high-scores", (req, res) => {
    const scores = db.prepare(`
        SELECT username, score, level, created_at
        FROM high_scores
        WHERE username != ?
        ORDER BY score DESC, created_at ASC
        LIMIT 10
    `).all(ADMIN_USERNAME);

    res.json(scores);
});

app.use((req, res, next) => {
    if (/\.(db|db-shm|db-wal|sqlite|sqlite3)$/i.test(req.path)) {
        return res.status(404).end();
    }

    next();
});

app.use(express.static(__dirname));

app.use((req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Sandro Game berjalan pada port ${PORT}`);
});

function shutdown() {
    server.close(() => {
        db.close();
        process.exit(0);
    });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);