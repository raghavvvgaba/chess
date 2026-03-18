import cors from "cors";
import express from "express";
import http from "node:http";
import type { Duplex } from "node:stream";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { WebSocketServer } from "ws";
import { auth } from "./auth.js";
import { verifyDatabaseConnection } from "./db.js";
import { GameManager } from "./GameManager.js";
import { closeRedisConnection, verifyRedisConnection } from "./redis.js";
import { startRuntimeGameFlusher } from "./runtimeGameFlusher.js";
import type { AuthenticatedSocket } from "./socketTypes.js";

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
    app.use(cors({
        origin: frontendOrigin,
        credentials: true
    }));
    app.all("/api/auth", toNodeHandler(auth));
    app.all("/api/auth/*splat", toNodeHandler(auth));
    app.get("/health", (_req, res) => {
        res.json({ ok: true });
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