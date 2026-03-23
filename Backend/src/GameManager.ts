import { ALREADY_IN_GAME, ALREADY_WAITING, ACTION_REJECTED, CANCEL_MATCHMAKING, INIT_GAME, INVALID_MESSAGE, LEAVE_GAME_VIEW, MATCHMAKING_CANCELLED, MOVE, QUIT_GAME, RECONNECT_GAME, REMATCH_REQUEST, WAITING_FOR_OPPONENT } from "./messages.js";
import { Game } from "./Game.js";
import { createGame } from "./gameStore.js";
import { getActiveRuntimeGameIds, getRuntimeGameSnapshot } from "./runtimeGameStore.js";
import type { AuthenticatedSocket } from "./socketTypes.js";

type ClientInitGameMessage = { type: typeof INIT_GAME };
type ClientCancelMatchmakingMessage = { type: typeof CANCEL_MATCHMAKING };
type ClientRematchRequestMessage = { type: typeof REMATCH_REQUEST };
type ClientQuitGameMessage = { type: typeof QUIT_GAME };
type ClientReconnectGameMessage = { type: typeof RECONNECT_GAME };
type ClientLeaveGameViewMessage = { type: typeof LEAVE_GAME_VIEW };
type ClientMoveMessage = {
    type: typeof MOVE;
    payload: {
        move: {
            from: string;
            to: string;
            promotion?: string;
        };
    };
};

type ClientMessage =
    | ClientInitGameMessage
    | ClientCancelMatchmakingMessage
    | ClientReconnectGameMessage
    | ClientLeaveGameViewMessage
    | ClientRematchRequestMessage
    | ClientQuitGameMessage
    | ClientMoveMessage;

type InvalidMessageReason =
    | "invalid_json"
    | "invalid_message_shape"
    | "unknown_message_type"
    | "invalid_init_game_payload"
    | "invalid_cancel_matchmaking_payload"
    | "invalid_reconnect_game_payload"
    | "invalid_leave_game_view_payload"
    | "invalid_rematch_request_payload"
    | "invalid_quit_game_payload"
    | "invalid_move_payload";

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseClientMessage(rawData: string): { ok: true; message: ClientMessage } | { ok: false; reason: InvalidMessageReason } {
    let parsed: unknown;

    try {
        parsed = JSON.parse(rawData);
    } catch {
        return { ok: false, reason: "invalid_json" };
    }

    if (!isPlainObject(parsed)) {
        return { ok: false, reason: "invalid_message_shape" };
    }

    if (typeof parsed.type !== "string") {
        return { ok: false, reason: "invalid_message_shape" };
    }

    if (parsed.type === INIT_GAME) {
        if (typeof parsed.payload !== "undefined") {
            return { ok: false, reason: "invalid_init_game_payload" };
        }
        return { ok: true, message: { type: INIT_GAME } };
    }

    if (parsed.type === CANCEL_MATCHMAKING) {
        if (typeof parsed.payload !== "undefined") {
            return { ok: false, reason: "invalid_cancel_matchmaking_payload" };
        }
        return { ok: true, message: { type: CANCEL_MATCHMAKING } };
    }

    if (parsed.type === RECONNECT_GAME) {
        if (typeof parsed.payload !== "undefined") {
            return { ok: false, reason: "invalid_reconnect_game_payload" };
        }
        return { ok: true, message: { type: RECONNECT_GAME } };
    }

    if (parsed.type === LEAVE_GAME_VIEW) {
        if (typeof parsed.payload !== "undefined") {
            return { ok: false, reason: "invalid_leave_game_view_payload" };
        }
        return { ok: true, message: { type: LEAVE_GAME_VIEW } };
    }

    if (parsed.type === REMATCH_REQUEST) {
        if (typeof parsed.payload !== "undefined") {
            return { ok: false, reason: "invalid_rematch_request_payload" };
        }
        return { ok: true, message: { type: REMATCH_REQUEST } };
    }

    if (parsed.type === QUIT_GAME) {
        if (typeof parsed.payload !== "undefined") {
            return { ok: false, reason: "invalid_quit_game_payload" };
        }
        return { ok: true, message: { type: QUIT_GAME } };
    }

    if (parsed.type === MOVE) {
        if (!isPlainObject(parsed.payload)) {
            return { ok: false, reason: "invalid_move_payload" };
        }

        const maybeMove = parsed.payload.move;
        if (!isPlainObject(maybeMove)) {
            return { ok: false, reason: "invalid_move_payload" };
        }

        if (typeof maybeMove.from !== "string" || typeof maybeMove.to !== "string") {
            return { ok: false, reason: "invalid_move_payload" };
        }

        if (typeof maybeMove.promotion !== "undefined" && typeof maybeMove.promotion !== "string") {
            return { ok: false, reason: "invalid_move_payload" };
        }

        return {
            ok: true,
            message: {
                type: MOVE,
                payload: {
                    move: {
                        from: maybeMove.from,
                        to: maybeMove.to,
                        ...(typeof maybeMove.promotion === "string" ? { promotion: maybeMove.promotion } : {})
                    }
                }
            }
        };
    }

    return { ok: false, reason: "unknown_message_type" };
}

export class GameManager {
    private games: Game[];
    private pendingUser: AuthenticatedSocket | null;
    private users: AuthenticatedSocket[];
    private activeGameByUserId: Map<string, Game>;

    constructor() {
        this.games = [];
        this.pendingUser = null;
        this.users = [];
        this.activeGameByUserId = new Map();
    }

    addUser(socket: AuthenticatedSocket) {
        this.users.push(socket);
        const activeGame = this.getActiveGameForUserId(socket.userId);
        if (activeGame) {
            activeGame.reattachPlayer(socket.userId, socket);
            this.addHandler(socket);
            return;
        }
        this.addHandler(socket);
    }

    async hydrateActiveGames() {
        const activeGameIds = await getActiveRuntimeGameIds();

        for (const gameId of activeGameIds) {
            const snapshot = await getRuntimeGameSnapshot(gameId);
            if (!snapshot) {
                continue;
            }

            const whitePlayer = this.users.find((socket) => socket.userId === snapshot.whiteUserId);
            const blackPlayer = this.users.find((socket) => socket.userId === snapshot.blackUserId);

            if (!whitePlayer || !blackPlayer) {
                continue;
            }

            const existingGame = this.games.find((game) => game.getGameId() === gameId);
            if (existingGame) {
                this.cleanupConcludedGameForUser(snapshot.whiteUserId);
                this.cleanupConcludedGameForUser(snapshot.blackUserId);
                this.registerGame(existingGame, snapshot.whiteUserId, snapshot.blackUserId);
                continue;
            }

            this.cleanupConcludedGameForUser(snapshot.whiteUserId);
            this.cleanupConcludedGameForUser(snapshot.blackUserId);

            const game = Game.fromRuntimeSnapshot(snapshot, {
                whitePlayer,
                blackPlayer
            }, async (currentGame) => this.startRematch(currentGame), (currentGame) => this.handleDisconnectTimeout(currentGame));
            this.games.push(game);
            this.registerGame(game, snapshot.whiteUserId, snapshot.blackUserId);
        }
    }

    removeUser(socket: AuthenticatedSocket) {
        this.users = this.users.filter(user => user !== socket);
        if (this.pendingUser === socket) {
            this.pendingUser = null;
        }
        const game = this.getGameForUserId(socket.userId);
        if (game && game.containsPlayer(socket)) {
            void game.handleDisconnect(socket).then((resolution) => {
                if (resolution !== "remove") {
                    return;
                }
                this.games = this.games.filter(currentGame => currentGame !== game);
                this.unregisterGame(game);
            });
        }
    }

    private addHandler(socket: AuthenticatedSocket) {
        socket.on("message", async (data) => {
            const parsedMessage = parseClientMessage(data.toString());

            if (!parsedMessage.ok) {
                socket.send(JSON.stringify({
                    type: INVALID_MESSAGE,
                    payload: {
                        reason: parsedMessage.reason
                    }
                }));
                return;
            }

            const message = parsedMessage.message;
            if (message.type === INIT_GAME) {
                this.cleanupConcludedGameForUser(socket.userId);
                if (this.pendingUser === socket || this.isUserQueued(socket.userId)) {
                    socket.send(JSON.stringify({
                        type: ALREADY_WAITING
                    }));
                    return;
                }
                if (this.isUserInGame(socket.userId)) {
                    socket.send(JSON.stringify({
                        type: ALREADY_IN_GAME
                    }));
                    return;
                }
                if (this.pendingUser) {
                    const waitingPlayer = this.pendingUser;
                    this.cleanupConcludedGameForUser(waitingPlayer.userId);
                    if (waitingPlayer.userId === socket.userId) {
                        socket.send(JSON.stringify({
                            type: ALREADY_WAITING
                        }));
                        return;
                    }
                    if (this.isUserInGame(waitingPlayer.userId)) {
                        this.pendingUser = null;
                        waitingPlayer.send(JSON.stringify({
                            type: MATCHMAKING_CANCELLED
                        }));
                        socket.send(JSON.stringify({
                            type: WAITING_FOR_OPPONENT
                        }));
                        this.pendingUser = socket;
                        return;
                    }
                    this.pendingUser = null;
                    try {
                        const persistedGame = await createGame({
                            whiteUserId: waitingPlayer.userId,
                            blackUserId: socket.userId
                        });
                        const game = await Game.createNew(
                            waitingPlayer,
                            socket,
                            persistedGame.id,
                            async (currentGame) => this.startRematch(currentGame),
                            (currentGame) => this.handleDisconnectTimeout(currentGame)
                        );
                        this.games.push(game);
                        this.registerGame(game, waitingPlayer.userId, socket.userId);
                    } catch (error) {
                        console.error("Failed to create game row:", error);
                        waitingPlayer.send(JSON.stringify({
                            type: MATCHMAKING_CANCELLED
                        }));
                        socket.send(JSON.stringify({
                            type: MATCHMAKING_CANCELLED
                        }));
                    }
                } else {
                    this.pendingUser = socket;
                    socket.send(JSON.stringify({
                        type: WAITING_FOR_OPPONENT
                    }));
                }
                return;
            }

            if (message.type === CANCEL_MATCHMAKING) {
                if (this.pendingUser === socket) {
                    this.pendingUser = null;
                    socket.send(JSON.stringify({
                        type: MATCHMAKING_CANCELLED
                    }));
                    return;
                }
                if (this.isUserQueued(socket.userId)) {
                    this.sendActionRejected(socket, "not_queue_owner");
                    return;
                }
                this.sendActionRejected(socket, "not_in_matchmaking");
                return;
            }

            if (message.type === RECONNECT_GAME) {
                const game = this.getGameForUserId(socket.userId);
                if (!game) {
                    this.sendActionRejected(socket, "not_in_game");
                    return;
                }

                if (game.isGameConcluded()) {
                    this.removeConcludedGame(game);
                    this.sendActionRejected(socket, "not_in_game");
                    return;
                }

                try {
                    game.reattachPlayer(socket.userId, socket);
                } catch (error) {
                    console.error("Failed to reattach player:", error);
                    this.sendActionRejected(socket, "reconnect_failed");
                }
                return;
            }

            if (message.type === LEAVE_GAME_VIEW) {
                const game = this.getGameForUserId(socket.userId);
                if (!game) {
                    return;
                }
                if (game.isGameConcluded()) {
                    this.removeConcludedGame(game);
                    return;
                }
                game.markPlayerAway(socket.userId);
                return;
            }

            if (message.type === MOVE) {
                const game = this.getGameForUserId(socket.userId);
                if (game) {
                    if (game.isGameConcluded()) {
                        this.removeConcludedGame(game);
                        this.sendActionRejected(socket, "not_in_game");
                        return;
                    }
                    if (!game.containsPlayer(socket)) {
                        this.sendActionRejected(socket, "not_game_participant");
                        return;
                    }
                    await game.makeMove(socket, message.payload.move);
                    if (game.isGameConcluded()) {
                        this.removeConcludedGame(game);
                    }
                } else {
                    this.sendActionRejected(socket, "not_in_game");
                }
                return;
            }

            if (message.type === REMATCH_REQUEST) {
                const game = this.getGameForUserId(socket.userId);
                if (game) {
                    if (game.isGameConcluded()) {
                        this.removeConcludedGame(game);
                        this.sendActionRejected(socket, "not_in_game");
                        return;
                    }
                    if (!game.containsPlayer(socket)) {
                        this.sendActionRejected(socket, "not_game_participant");
                        return;
                    }
                    game.requestRematch(socket);
                } else {
                    this.sendActionRejected(socket, "not_in_game");
                }
            }

            if (message.type === QUIT_GAME) {
                const game = this.getGameForUserId(socket.userId);
                if (game) {
                    if (game.isGameConcluded()) {
                        this.removeConcludedGame(game);
                        this.sendActionRejected(socket, "not_in_game");
                        return;
                    }
                    if (!game.containsPlayer(socket)) {
                        this.sendActionRejected(socket, "not_game_participant");
                        return;
                    }
                    await game.quitGame(socket);
                    if (game.isGameConcluded()) {
                        this.removeConcludedGame(game);
                    }
                } else {
                    this.sendActionRejected(socket, "not_in_game");
                }
                return;
            }
        });
    }

    private async startRematch(currentGame: Game) {
        const nextWhitePlayer = currentGame.getBlackPlayer();
        const nextBlackPlayer = currentGame.getWhitePlayer();

        try {
            const persistedGame = await createGame({
                whiteUserId: nextWhitePlayer.userId,
                blackUserId: nextBlackPlayer.userId
            });
            const nextGame = await Game.createNew(
                nextWhitePlayer,
                nextBlackPlayer,
                persistedGame.id,
                async (game) => this.startRematch(game),
                (game) => this.handleDisconnectTimeout(game)
            );
            this.games = this.games.filter((game) => game !== currentGame);
            this.unregisterGame(currentGame);
            this.games.push(nextGame);
            this.registerGame(nextGame, nextWhitePlayer.userId, nextBlackPlayer.userId);
        } catch (error) {
            console.error("Failed to create rematch game row:", error);
            currentGame.handleRematchStartFailed();
        }
    }

    private handleDisconnectTimeout(game: Game) {
        this.games = this.games.filter((currentGame) => currentGame !== game);
        this.unregisterGame(game);
    }

    private getGameForUserId(userId: string) {
        return this.activeGameByUserId.get(userId) ?? null;
    }

    private isUserQueued(userId: string) {
        return this.pendingUser?.userId === userId;
    }

    private isUserInGame(userId: string) {
        return this.activeGameByUserId.has(userId);
    }

    private getActiveGameForUserId(userId: string) {
        const game = this.getGameForUserId(userId);
        if (!game) {
            return null;
        }
        if (game.isGameConcluded()) {
            this.removeConcludedGame(game);
            return null;
        }
        return game;
    }

    private cleanupConcludedGameForUser(userId: string) {
        const game = this.getGameForUserId(userId);
        if (!game) {
            return;
        }
        if (game.isGameConcluded()) {
            this.removeConcludedGame(game);
        }
    }

    private registerGame(game: Game, whiteUserId: string, blackUserId: string) {
        this.activeGameByUserId.set(whiteUserId, game);
        this.activeGameByUserId.set(blackUserId, game);
    }

    private unregisterGame(game: Game) {
        for (const [userId, currentGame] of this.activeGameByUserId.entries()) {
            if (currentGame === game) {
                this.activeGameByUserId.delete(userId);
            }
        }
    }

    private removeConcludedGame(game: Game) {
        this.games = this.games.filter((currentGame) => currentGame !== game);
        this.unregisterGame(game);
    }

    private sendActionRejected(socket: AuthenticatedSocket, reason: string) {
        socket.send(JSON.stringify({
            type: ACTION_REJECTED,
            payload: { reason }
        }));
    }
}
