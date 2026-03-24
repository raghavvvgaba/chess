import { ALREADY_IN_GAME, ALREADY_WAITING, ACTION_REJECTED, CANCEL_MATCHMAKING, CANCEL_ROOM, CREATE_ROOM, INIT_GAME, INVALID_MESSAGE, JOIN_ROOM, LEAVE_GAME_VIEW, MATCHMAKING_CANCELLED, MOVE, QUIT_GAME, RECONNECT_GAME, REMATCH_REQUEST, ROOM_CREATED, ROOM_JOIN_FAILED, WAITING_FOR_OPPONENT } from "./messages.js";
import { Game } from "./Game.js";
import { createGame, isRoomCodeTaken } from "./gameStore.js";
import { getActiveRuntimeGameIds, getRuntimeGameSnapshot } from "./runtimeGameStore.js";
import type { AuthenticatedSocket } from "./socketTypes.js";

type ClientInitGameMessage = { type: typeof INIT_GAME };
type ClientCancelMatchmakingMessage = { type: typeof CANCEL_MATCHMAKING };
type ClientRematchRequestMessage = { type: typeof REMATCH_REQUEST };
type ClientQuitGameMessage = { type: typeof QUIT_GAME };
type ClientReconnectGameMessage = { type: typeof RECONNECT_GAME };
type ClientLeaveGameViewMessage = { type: typeof LEAVE_GAME_VIEW };
type ClientCreateRoomMessage = { type: typeof CREATE_ROOM };
type ClientCancelRoomMessage = { type: typeof CANCEL_ROOM };
type ClientJoinRoomMessage = {
    type: typeof JOIN_ROOM;
    payload: {
        roomCode: string;
    };
};
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
    | ClientCreateRoomMessage
    | ClientCancelRoomMessage
    | ClientJoinRoomMessage
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
    | "invalid_create_room_payload"
    | "invalid_cancel_room_payload"
    | "invalid_join_room_payload"
    | "invalid_rematch_request_payload"
    | "invalid_quit_game_payload"
    | "invalid_move_payload";

type RoomJoinFailedReason = "not_found" | "host_offline" | "self_join" | "host_unavailable" | "creation_failed";

type PendingRoomEntry = {
    hostSocket: AuthenticatedSocket;
    createdAtMs: number;
    expiresAtMs: number;
    isJoining: boolean;
};

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 6;
const ROOM_TTL_MS = 120_000;
const ROOM_SWEEP_INTERVAL_MS = 5_000;

function normalizeRoomCode(value: string) {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

type CreateGamePairInput = {
    whitePlayer: AuthenticatedSocket;
    blackPlayer: AuthenticatedSocket;
    roomCode: string;
};

type CreateGamePairWithRoomCodeGeneratorInput = {
    whitePlayer: AuthenticatedSocket;
    blackPlayer: AuthenticatedSocket;
};

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

    if (parsed.type === CREATE_ROOM) {
        if (typeof parsed.payload !== "undefined") {
            return { ok: false, reason: "invalid_create_room_payload" };
        }
        return { ok: true, message: { type: CREATE_ROOM } };
    }

    if (parsed.type === CANCEL_ROOM) {
        if (typeof parsed.payload !== "undefined") {
            return { ok: false, reason: "invalid_cancel_room_payload" };
        }
        return { ok: true, message: { type: CANCEL_ROOM } };
    }

    if (parsed.type === JOIN_ROOM) {
        if (!isPlainObject(parsed.payload) || typeof parsed.payload.roomCode !== "string") {
            return { ok: false, reason: "invalid_join_room_payload" };
        }

        const roomCode = normalizeRoomCode(parsed.payload.roomCode);
        if (roomCode.length !== ROOM_CODE_LENGTH) {
            return { ok: false, reason: "invalid_join_room_payload" };
        }

        return {
            ok: true,
            message: {
                type: JOIN_ROOM,
                payload: { roomCode }
            }
        };
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
    private pendingRoomsByCode: Map<string, PendingRoomEntry>;
    private pendingRoomCodeByUserId: Map<string, string>;

    constructor() {
        this.games = [];
        this.pendingUser = null;
        this.users = [];
        this.activeGameByUserId = new Map();
        this.pendingRoomsByCode = new Map();
        this.pendingRoomCodeByUserId = new Map();

        const sweepTimer = setInterval(() => {
            this.cleanupExpiredPendingRooms();
        }, ROOM_SWEEP_INTERVAL_MS);
        sweepTimer.unref();
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
            }).catch((error) => {
                console.error("Failed to handle user disconnect:", error);
            }).finally(() => {
                this.removePendingRoomForUser(socket.userId);
            });
            return;
        }
        this.removePendingRoomForUser(socket.userId);
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
                this.removePendingRoomForUser(socket.userId);
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
                    this.removePendingRoomForUser(waitingPlayer.userId);
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
                        await this.createAndRegisterGamePairWithGeneratedRoomCode({
                            whitePlayer: waitingPlayer,
                            blackPlayer: socket
                        });
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

            if (message.type === CREATE_ROOM) {
                this.cleanupExpiredPendingRooms();
                this.cleanupConcludedGameForUser(socket.userId);
                if (this.isUserInGame(socket.userId)) {
                    this.sendActionRejected(socket, "already_in_game");
                    return;
                }
                if (this.isUserQueued(socket.userId)) {
                    this.sendActionRejected(socket, "already_waiting");
                    return;
                }
                if (this.pendingUser === socket) {
                    this.sendActionRejected(socket, "already_waiting");
                    return;
                }

                this.removePendingRoomForUser(socket.userId);

                try {
                    const now = Date.now();
                    const roomCode = await this.generateUniquePendingRoomCode();
                    const expiresAtMs = now + ROOM_TTL_MS;
                    this.pendingRoomsByCode.set(roomCode, {
                        hostSocket: socket,
                        createdAtMs: now,
                        expiresAtMs,
                        isJoining: false
                    });
                    this.pendingRoomCodeByUserId.set(socket.userId, roomCode);
                    socket.send(JSON.stringify({
                        type: ROOM_CREATED,
                        payload: {
                            roomCode,
                            expiresAtMs
                        }
                    }));
                } catch (error) {
                    console.error("Failed to create pending room:", error);
                    this.sendActionRejected(socket, "room_creation_failed");
                }
                return;
            }

            if (message.type === CANCEL_ROOM) {
                this.removePendingRoomForUser(socket.userId);
                return;
            }

            if (message.type === JOIN_ROOM) {
                this.cleanupExpiredPendingRooms();
                this.cleanupConcludedGameForUser(socket.userId);
                if (this.isUserInGame(socket.userId)) {
                    this.sendActionRejected(socket, "already_in_game");
                    return;
                }
                if (this.isUserQueued(socket.userId)) {
                    this.sendActionRejected(socket, "already_waiting");
                    return;
                }
                if (this.pendingUser === socket) {
                    this.sendActionRejected(socket, "already_waiting");
                    return;
                }

                const roomEntry = this.pendingRoomsByCode.get(message.payload.roomCode);
                if (!roomEntry) {
                    this.sendRoomJoinFailed(socket, "not_found");
                    return;
                }
                if (roomEntry.expiresAtMs <= Date.now()) {
                    this.removePendingRoomByCode(message.payload.roomCode);
                    this.sendRoomJoinFailed(socket, "not_found");
                    return;
                }
                if (roomEntry.isJoining) {
                    this.sendRoomJoinFailed(socket, "host_unavailable");
                    return;
                }
                const hostSocket = roomEntry.hostSocket;

                if (hostSocket.userId === socket.userId) {
                    this.sendRoomJoinFailed(socket, "self_join");
                    return;
                }

                if (!this.users.includes(hostSocket)) {
                    this.removePendingRoomByCode(message.payload.roomCode);
                    this.sendRoomJoinFailed(socket, "host_offline");
                    return;
                }

                this.cleanupConcludedGameForUser(hostSocket.userId);
                if (this.isUserInGame(hostSocket.userId)) {
                    this.removePendingRoomByCode(message.payload.roomCode);
                    this.sendRoomJoinFailed(socket, "host_unavailable");
                    return;
                }
                if (this.isUserQueued(hostSocket.userId)) {
                    this.removePendingRoomByCode(message.payload.roomCode);
                    this.sendRoomJoinFailed(socket, "host_unavailable");
                    return;
                }
                if (this.pendingUser === hostSocket) {
                    this.removePendingRoomByCode(message.payload.roomCode);
                    this.sendRoomJoinFailed(socket, "host_unavailable");
                    return;
                }

                if (this.pendingRoomCodeByUserId.has(socket.userId)) {
                    this.removePendingRoomForUser(socket.userId);
                }

                this.pendingRoomsByCode.set(message.payload.roomCode, {
                    ...roomEntry,
                    isJoining: true
                });

                try {
                    await this.createAndRegisterGamePair({
                        whitePlayer: hostSocket,
                        blackPlayer: socket,
                        roomCode: message.payload.roomCode
                    });
                    this.removePendingRoomByCode(message.payload.roomCode);
                } catch (error) {
                    console.error("Failed to create room game row:", error);
                    const pendingRoom = this.pendingRoomsByCode.get(message.payload.roomCode);
                    if (pendingRoom && pendingRoom.hostSocket.userId === hostSocket.userId) {
                        this.pendingRoomsByCode.set(message.payload.roomCode, {
                            ...pendingRoom,
                            isJoining: false
                        });
                    }
                    this.sendRoomJoinFailed(socket, "creation_failed");
                    this.sendActionRejected(hostSocket, "room_creation_failed");
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
            const nextGame = await this.createGamePairWithGeneratedRoomCode({
                whitePlayer: nextWhitePlayer,
                blackPlayer: nextBlackPlayer
            });
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

    private async createAndRegisterGamePair(input: CreateGamePairInput) {
        const game = await this.createGamePair(input);
        this.games.push(game);
        this.registerGame(game, input.whitePlayer.userId, input.blackPlayer.userId);
    }

    private async createAndRegisterGamePairWithGeneratedRoomCode(input: CreateGamePairWithRoomCodeGeneratorInput) {
        const game = await this.createGamePairWithGeneratedRoomCode(input);
        this.games.push(game);
        this.registerGame(game, input.whitePlayer.userId, input.blackPlayer.userId);
    }

    private async createGamePair(input: CreateGamePairInput) {
        const persistedGame = await createGame({
            whiteUserId: input.whitePlayer.userId,
            blackUserId: input.blackPlayer.userId,
            roomCode: input.roomCode
        });
        return Game.createNew(
            input.whitePlayer,
            input.blackPlayer,
            persistedGame.id,
            async (currentGame) => this.startRematch(currentGame),
            (currentGame) => this.handleDisconnectTimeout(currentGame)
        );
    }

    private async createGamePairWithGeneratedRoomCode(input: CreateGamePairWithRoomCodeGeneratorInput) {
        let persistedGame: { id: string } | null = null;
        let lastError: unknown = null;

        for (let attempt = 0; attempt < 10; attempt += 1) {
            try {
                const roomCode = await this.generateUniqueGameRoomCode();
                persistedGame = await createGame({
                    whiteUserId: input.whitePlayer.userId,
                    blackUserId: input.blackPlayer.userId,
                    roomCode
                });
                break;
            } catch (error) {
                lastError = error;
                if (!this.isUniqueViolationError(error)) {
                    throw error;
                }
            }
        }

        if (!persistedGame) {
            throw lastError ?? new Error("Failed to create game with unique room code");
        }

        return Game.createNew(
            input.whitePlayer,
            input.blackPlayer,
            persistedGame.id,
            async (currentGame) => this.startRematch(currentGame),
            (currentGame) => this.handleDisconnectTimeout(currentGame)
        );
    }

    private removePendingRoomForUser(userId: string) {
        const roomCode = this.pendingRoomCodeByUserId.get(userId);
        if (!roomCode) {
            return;
        }
        this.pendingRoomCodeByUserId.delete(userId);
        this.pendingRoomsByCode.delete(roomCode);
    }

    private removePendingRoomByCode(roomCode: string) {
        const roomEntry = this.pendingRoomsByCode.get(roomCode);
        if (roomEntry) {
            this.pendingRoomCodeByUserId.delete(roomEntry.hostSocket.userId);
        }
        this.pendingRoomsByCode.delete(roomCode);
    }

    private cleanupExpiredPendingRooms() {
        const now = Date.now();
        for (const [roomCode, roomEntry] of this.pendingRoomsByCode.entries()) {
            if (roomEntry.expiresAtMs <= now) {
                this.pendingRoomsByCode.delete(roomCode);
                this.pendingRoomCodeByUserId.delete(roomEntry.hostSocket.userId);
            }
        }
    }

    private sendRoomJoinFailed(socket: AuthenticatedSocket, reason: RoomJoinFailedReason) {
        socket.send(JSON.stringify({
            type: ROOM_JOIN_FAILED,
            payload: { reason }
        }));
    }

    private async generateUniquePendingRoomCode() {
        this.cleanupExpiredPendingRooms();
        for (let attempt = 0; attempt < 25; attempt += 1) {
            const code = this.generateRoomCode();
            if (this.pendingRoomsByCode.has(code)) {
                continue;
            }
            const takenInGames = await isRoomCodeTaken(code);
            if (!takenInGames) {
                return code;
            }
        }

        throw new Error("Unable to generate unique room code");
    }

    private async generateUniqueGameRoomCode() {
        for (let attempt = 0; attempt < 10; attempt += 1) {
            const code = this.generateRoomCode();
            if (this.pendingRoomsByCode.has(code)) {
                continue;
            }
            const takenInGames = await isRoomCodeTaken(code);
            if (!takenInGames) {
                return code;
            }
        }

        throw new Error("Unable to generate unique game room code");
    }

    private generateRoomCode() {
        let code = "";
        for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
            const randomIndex = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);
            code += ROOM_CODE_ALPHABET[randomIndex];
        }
        return code;
    }

    private sendActionRejected(socket: AuthenticatedSocket, reason: string) {
        socket.send(JSON.stringify({
            type: ACTION_REJECTED,
            payload: { reason }
        }));
    }

    private isUniqueViolationError(error: unknown) {
        if (!error || typeof error !== "object") {
            return false;
        }
        return (error as { code?: string }).code === "23505";
    }
}
