import cors from "cors";
import express from "express";
import http from "node:http";
import type { Duplex } from "node:stream";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { WebSocketServer } from "ws";
import { auth } from "./auth.js";
import { verifyDatabaseConnection } from "./db.js";
import {
    acceptIncomingFriendRequest,
    getAcceptedFriends,
    getIncomingFriendRequests,
    rejectIncomingFriendRequest,
    searchFriendByChessUserId,
    sendFriendRequestByChessUserId
} from "./friendshipStore.js";
import { GameManager } from "./GameManager.js";
import { getMatchHistoryByUserId } from "./gameStore.js";
import { closeRedisConnection, verifyRedisConnection } from "./redis.js";
import { startRuntimeGameFlusher } from "./runtimeGameFlusher.js";
import type { AuthenticatedSocket } from "./socketTypes.js";
import { getUserProfileById } from "./userStore.js";

const port = Number(process.env.PORT ?? 8080);
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";
const gameManager = new GameManager();

function rejectUpgrade(socket: Duplex, statusLine: string) {
    socket.write(`HTTP/1.1 ${statusLine}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
}

async function bootstrap() {
    await verifyDatabaseConnection();
    await verifyRedisConnection();
    const flusher = startRuntimeGameFlusher();
    await gameManager.hydrateActiveGames();

    const app = express();
    app.use(express.json());
    app.use(cors({
        origin: frontendOrigin,
        credentials: true
    }));
    app.all("/api/auth", toNodeHandler(auth));
    app.all("/api/auth/*splat", toNodeHandler(auth));
    app.get("/health", (_req, res) => {
        res.json({ ok: true });
    });

    app.get("/api/matches/history", async (req, res) => {
        try {
            const session = await auth.api.getSession({
                headers: fromNodeHeaders(req.headers)
            });

            if (!session?.user?.id) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }

            const limitParam = Number(req.query.limit);
            const limit = Number.isFinite(limitParam) ? limitParam : 50;
            const matches = await getMatchHistoryByUserId(session.user.id, limit);
            res.json({ matches });
        } catch (error) {
            console.error("Failed to fetch match history:", error);
            res.status(500).json({ message: "Failed to fetch match history" });
        }
    });

    app.get("/api/me", async (req, res) => {
        try {
            const session = await auth.api.getSession({
                headers: fromNodeHeaders(req.headers)
            });

            if (!session?.user?.id) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }

            const profile = await getUserProfileById(session.user.id);

            if (!profile) {
                res.status(404).json({ message: "Profile not found" });
                return;
            }

            res.json({ profile });
        } catch (error) {
            console.error("Failed to fetch profile:", error);
            res.status(500).json({ message: "Failed to fetch profile" });
        }
    });

    app.get("/api/friends/search", async (req, res) => {
        try {
            const session = await auth.api.getSession({
                headers: fromNodeHeaders(req.headers)
            });

            if (!session?.user?.id) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }

            const chessUserId = typeof req.query.chessUserId === "string" ? req.query.chessUserId.trim().toUpperCase() : "";
            if (!/^[A-Z0-9]{8}$/.test(chessUserId)) {
                res.status(400).json({ message: "Chess ID must be 8 uppercase letters or numbers." });
                return;
            }

            const result = await searchFriendByChessUserId(session.user.id, chessUserId);
            res.json({ result });
        } catch (error) {
            console.error("Failed to search friend by Chess ID:", error);
            res.status(500).json({ message: "Failed to search for player" });
        }
    });

    app.post("/api/friends/request", async (req, res) => {
        try {
            const session = await auth.api.getSession({
                headers: fromNodeHeaders(req.headers)
            });

            if (!session?.user?.id) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }

            const chessUserId = typeof req.body?.chessUserId === "string" ? req.body.chessUserId.trim().toUpperCase() : "";
            if (!/^[A-Z0-9]{8}$/.test(chessUserId)) {
                res.status(400).json({ message: "Chess ID must be 8 uppercase letters or numbers." });
                return;
            }

            const outcome = await sendFriendRequestByChessUserId(session.user.id, chessUserId);

            if (outcome === "not_found") {
                res.status(404).json({ message: "Player not found", outcome });
                return;
            }

            if (outcome === "self") {
                res.status(409).json({ message: "You cannot add yourself", outcome });
                return;
            }

            if (outcome === "blocked") {
                res.status(409).json({ message: "This player cannot be added right now", outcome });
                return;
            }

            res.json({ outcome });
        } catch (error) {
            console.error("Failed to send friend request:", error);
            res.status(500).json({ message: "Failed to send friend request" });
        }
    });

    app.get("/api/friends/requests/incoming", async (req, res) => {
        try {
            const session = await auth.api.getSession({
                headers: fromNodeHeaders(req.headers)
            });

            if (!session?.user?.id) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }

            const requests = await getIncomingFriendRequests(session.user.id);
            res.json({ requests });
        } catch (error) {
            console.error("Failed to fetch incoming friend requests:", error);
            res.status(500).json({ message: "Failed to fetch incoming requests" });
        }
    });

    app.get("/api/friends", async (req, res) => {
        try {
            const session = await auth.api.getSession({
                headers: fromNodeHeaders(req.headers)
            });

            if (!session?.user?.id) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }

            const friends = await getAcceptedFriends(session.user.id);
            res.json({ friends });
        } catch (error) {
            console.error("Failed to fetch friends:", error);
            res.status(500).json({ message: "Failed to fetch friends" });
        }
    });

    app.post("/api/friends/requests/:id/accept", async (req, res) => {
        try {
            const session = await auth.api.getSession({
                headers: fromNodeHeaders(req.headers)
            });

            if (!session?.user?.id) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }

            const request = await acceptIncomingFriendRequest(req.params.id, session.user.id);

            if (!request) {
                res.status(404).json({ message: "Friend request not found" });
                return;
            }

            res.json({ outcome: "accepted" });
        } catch (error) {
            console.error("Failed to accept friend request:", error);
            res.status(500).json({ message: "Failed to accept friend request" });
        }
    });

    app.post("/api/friends/requests/:id/reject", async (req, res) => {
        try {
            const session = await auth.api.getSession({
                headers: fromNodeHeaders(req.headers)
            });

            if (!session?.user?.id) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }

            const request = await rejectIncomingFriendRequest(req.params.id, session.user.id);

            if (!request) {
                res.status(404).json({ message: "Friend request not found" });
                return;
            }

            res.json({ outcome: "declined" });
        } catch (error) {
            console.error("Failed to reject friend request:", error);
            res.status(500).json({ message: "Failed to reject friend request" });
        }
    });

    const server = http.createServer(app);
    const wss = new WebSocketServer({ noServer: true });

    wss.on("connection", (socket) => {
        const authedSocket = socket as AuthenticatedSocket;
        gameManager.addUser(authedSocket);
        authedSocket.on("close", () => {
            gameManager.removeUser(authedSocket);
        });
    });

    server.on("upgrade", async (request, socket, head) => {
        try {
            const host = request.headers.host ?? "localhost";
            const url = new URL(request.url ?? "/", `http://${host}`);
            if (url.pathname !== "/ws") {
                rejectUpgrade(socket, "404 Not Found");
                return;
            }

            const session = await auth.api.getSession({
                headers: fromNodeHeaders(request.headers)
            });

            if (!session?.user?.id) {
                rejectUpgrade(socket, "401 Unauthorized");
                return;
            }

            wss.handleUpgrade(request, socket, head, (ws) => {
                const authedSocket = ws as AuthenticatedSocket;
                const preferredName = typeof session.user.name === "string" ? session.user.name.trim() : "";
                const fallbackName = typeof session.user.email === "string" ? session.user.email.trim().split("@")[0] : "";
                authedSocket.userId = session.user.id;
                authedSocket.userName = preferredName || fallbackName || "";
                wss.emit("connection", authedSocket, request);
            });
        } catch (error) {
            console.error("WebSocket upgrade failed:", error);
            rejectUpgrade(socket, "500 Internal Server Error");
        }
    });

    server.listen(port, () => {
        console.log(`Backend listening on http://localhost:${port}`);
    });

    const shutdown = async () => {
        flusher.stop();
        await closeRedisConnection();
        server.close();
    };

    process.on("SIGINT", () => {
        void shutdown();
    });

    process.on("SIGTERM", () => {
        void shutdown();
    });
}

bootstrap().catch((error) => {
    console.error("Startup failed:", error);
    process.exit(1);
});
