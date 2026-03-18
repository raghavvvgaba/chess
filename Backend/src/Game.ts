import { WebSocket } from "ws";
import { Chess } from "chess.js";
import { ACTION_REJECTED, GAME_OVER, INIT_GAME, MOVE_APPLIED, MOVE_REJECTED, PLAYER_CONNECTION_STATE, REMATCH_DECLINED, REMATCH_STATE, STORAGE_SYNC_FAILED } from "./messages.js";
import { appendMoveToRuntimeGame, completeRuntimeGame, initializeRuntimeGame, type RuntimeGameSnapshot } from "./runtimeGameStore.js";
import type { AuthenticatedSocket } from "./socketTypes.js";

type MoveRejectedReason = "not_your_turn" | "illegal_move" | "storage_sync_failed";
type ResultType = "checkmate" | "draw" | "opponent_left";
type ResultReason =
    | "checkmate"
    | "stalemate"
    | "threefold_repetition"
    | "insufficient_material"
    | "fifty_move_rule"
    | "opponent_left"
    | "other";
type WinnerColor = "white" | "black" | null;
type RematchStatus = "waiting" | "starting";
type PlayerColor = "white" | "black";
type PromotionPiece = "q" | "r" | "b" | "n";
type DisconnectResolution = "keep" | "remove";
type InitMoveHistoryEntry = {
    ply: number;
    san: string;
};

const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS ?? 20_000);

type GameOverPayload = {
    result: ResultType;
    reason: ResultReason;
    winnerColor: WinnerColor;
    fen: string;
    turn: "w" | "b" | null;
};

type GameConstructorOptions = {
    onRematchReady: (game: Game) => Promise<void>;
    onDisconnectTimeout: (game: Game) => void;
    suppressInitMessages?: boolean;
    initialSnapshot?: RuntimeGameSnapshot;
};

export class Game {
    public board: Chess;
    private startTime: Date;
    private whitePlayer: AuthenticatedSocket;
    private blackPlayer: AuthenticatedSocket;
    private isConcluded = false;
    private rematchRequestedByWhite = false;
    private rematchRequestedByBlack = false;
    private rematchStarting = false;
    private ply = 0;
    private moveHistory: InitMoveHistoryEntry[] = [];
    private readonly gameId: string;
    private readonly onRematchReady: (game: Game) => Promise<void>;
    private readonly onDisconnectTimeout: (game: Game) => void;
    private disconnectedWhite = false;
    private disconnectedBlack = false;
    private whiteReconnectTimer: NodeJS.Timeout | null = null;
    private blackReconnectTimer: NodeJS.Timeout | null = null;
    private whiteDisconnectEpoch = 0;
    private blackDisconnectEpoch = 0;

    constructor(
        player1: AuthenticatedSocket,
        player2: AuthenticatedSocket,
        gameId: string,
        options: GameConstructorOptions
    ) {
        this.whitePlayer = player1;
        this.blackPlayer = player2;
        this.board = new Chess();
        this.startTime = new Date();
        this.gameId = gameId;
        this.onRematchReady = options.onRematchReady;
        this.onDisconnectTimeout = options.onDisconnectTimeout;

        if (options.initialSnapshot) {
            this.restoreFromSnapshot(options.initialSnapshot);
        }

        if (!options.suppressInitMessages) {
            this.sendInitGameMessages();
        }
    }

    static async createNew(
        player1: AuthenticatedSocket,
        player2: AuthenticatedSocket,
        gameId: string,
        onRematchReady: (game: Game) => Promise<void>,
        onDisconnectTimeout: (game: Game) => void
    ) {
        const game = new Game(player1, player2, gameId, {
            onRematchReady,
            onDisconnectTimeout,
            suppressInitMessages: true
        });

        await initializeRuntimeGame({
            gameId,
            whiteUserId: game.whitePlayer.userId,
            blackUserId: game.blackPlayer.userId,
            whiteUserName: game.whitePlayer.userName,
            blackUserName: game.blackPlayer.userName,
            currentFen: game.board.fen(),
            turn: game.board.turn(),
            startedAt: game.startTime.toISOString()
        });

        game.sendInitGameMessages();
        return game;
    }

    static fromRuntimeSnapshot(
        snapshot: RuntimeGameSnapshot,
        sockets: {
            whitePlayer: AuthenticatedSocket;
            blackPlayer: AuthenticatedSocket;
        },
        onRematchReady: (game: Game) => Promise<void>,
        onDisconnectTimeout: (game: Game) => void
    ) {
        return new Game(sockets.whitePlayer, sockets.blackPlayer, snapshot.gameId, {
            onRematchReady,
            onDisconnectTimeout,
            suppressInitMessages: true,
            initialSnapshot: snapshot
        });
    }

    containsPlayer(socket: AuthenticatedSocket) {
        return this.whitePlayer === socket || this.blackPlayer === socket;
    }

    containsUserId(userId: string) {
        return this.whitePlayer.userId === userId || this.blackPlayer.userId === userId;
    }

    async makeMove(socket: AuthenticatedSocket, move: unknown) {
        if (this.isConcluded) {
            this.sendMoveRejected(socket, "illegal_move");
            return;
        }

        if (typeof move !== "object" || move === null) {
            this.sendMoveRejected(socket, "illegal_move");
            return;
        }

        const maybeMove = move as { from?: unknown; to?: unknown; promotion?: unknown };
        if (typeof maybeMove.from !== "string" || typeof maybeMove.to !== "string") {
            this.sendMoveRejected(socket, "illegal_move");
            return;
        }
        if (typeof maybeMove.promotion !== "undefined" && !this.isPromotionPiece(maybeMove.promotion)) {
            this.sendMoveRejected(socket, "illegal_move");
            return;
        }

        const validatedMove: {
            from: string;
            to: string;
            promotion?: PromotionPiece;
        } = {
            from: maybeMove.from,
            to: maybeMove.to,
        };
        if (typeof maybeMove.promotion !== "undefined") {
            validatedMove.promotion = maybeMove.promotion;
        }

        const turnPlayer = this.board.turn() === "w" ? this.whitePlayer : this.blackPlayer;
        if (socket !== turnPlayer) {
            this.sendMoveRejected(socket, "not_your_turn");
            return;
        }

        let appliedMove: {
            from: string;
            to: string;
            promotion?: PromotionPiece;
            san: string;
        } | null = null;
        try {
            const result = this.board.move(validatedMove);
            if (result) {
                appliedMove = {
                    from: result.from,
                    to: result.to,
                    promotion: this.isPromotionPiece(result.promotion) ? result.promotion : undefined,
                    san: result.san
                };
            }
        } catch (error) {
            console.log(error);
            this.sendMoveRejected(socket, "illegal_move");
            return;
        }

        if (!appliedMove) {
            this.sendMoveRejected(socket, "illegal_move");
            return;
        }

        this.ply += 1;
        const moveAppliedPayload = {
            move: appliedMove,
            fen: this.board.fen(),
            turn: this.board.turn(),
            san: appliedMove.san,
            ply: this.ply
        };
        const uci = `${appliedMove.from}${appliedMove.to}${appliedMove.promotion ?? ""}`;

        try {
            await appendMoveToRuntimeGame({
                gameId: this.gameId,
                currentFen: this.board.fen(),
                turn: this.board.turn(),
                ply: this.ply,
                move: {
                    ply: this.ply,
                    san: appliedMove.san,
                    uci,
                    fenAfter: this.board.fen(),
                    playedByUserId: socket.userId,
                    playedAt: new Date().toISOString()
                }
            });
        } catch (error) {
            this.board.undo();
            this.ply -= 1;
            console.error("Failed to persist runtime move:", error);
            this.sendMoveRejected(socket, "storage_sync_failed");
            this.sendStorageSyncFailed(socket, "move_sync_failed");
            return;
        }

        this.sendToBoth({
            type: MOVE_APPLIED,
            payload: moveAppliedPayload
        });

        this.moveHistory.push({
            ply: this.ply,
            san: appliedMove.san
        });

        if (this.board.isGameOver()) {
            const gameOverPayload = this.getBoardGameOverPayload();
            await this.finishGame(gameOverPayload);
        }
    }

    private isPromotionPiece(value: unknown): value is PromotionPiece {
        return value === "q" || value === "r" || value === "b" || value === "n";
    }

    requestRematch(socket: AuthenticatedSocket) {
        if (!this.isConcluded) {
            this.sendActionRejected(socket, "game_not_concluded");
            return;
        }

        const color = this.getColorForSocket(socket);
        if (!color) {
            this.sendActionRejected(socket, "not_game_participant");
            return;
        }

        if (color === "white") {
            this.rematchRequestedByWhite = true;
        } else {
            this.rematchRequestedByBlack = true;
        }

        if (this.rematchRequestedByWhite && this.rematchRequestedByBlack) {
            if (this.rematchStarting) {
                return;
            }
            this.rematchStarting = true;
            void this.onRematchReady(this);
            return;
        }

        this.sendRematchState("waiting");
    }

    getWhitePlayer() {
        return this.whitePlayer;
    }

    getBlackPlayer() {
        return this.blackPlayer;
    }

    reattachPlayer(userId: string, socket: AuthenticatedSocket) {
        if (this.whitePlayer.userId === userId) {
            this.whitePlayer = socket;
            this.disconnectedWhite = false;
            this.whiteDisconnectEpoch += 1;
            if (this.whiteReconnectTimer) {
                clearTimeout(this.whiteReconnectTimer);
                this.whiteReconnectTimer = null;
            }
            this.sendInitGameMessageToPlayer("white");
            this.sendConnectionStateToOpponent("white", "reconnected");
            return true;
        }

        if (this.blackPlayer.userId === userId) {
            this.blackPlayer = socket;
            this.disconnectedBlack = false;
            this.blackDisconnectEpoch += 1;
            if (this.blackReconnectTimer) {
                clearTimeout(this.blackReconnectTimer);
                this.blackReconnectTimer = null;
            }
            this.sendInitGameMessageToPlayer("black");
            this.sendConnectionStateToOpponent("black", "reconnected");
            return true;
        }

        return false;
    }

    getGameId() {
        return this.gameId;
    }

    handleRematchStartFailed() {
        if (!this.isConcluded) {
            return;
        }

        this.rematchStarting = false;
        this.rematchRequestedByWhite = false;
        this.rematchRequestedByBlack = false;
        this.sendToBoth({
            type: REMATCH_DECLINED,
            payload: {
                by: "system",
                reason: "failed_to_start"
            }
        });
    }

    async handleDisconnect(socket: AuthenticatedSocket): Promise<DisconnectResolution> {
        if (!this.containsPlayer(socket)) {
            return "keep";
        }

        const disconnectedColor = this.getColorForSocket(socket);
        if (!disconnectedColor) {
            return "keep";
        }

        const remainingSocket = disconnectedColor === "white" ? this.blackPlayer : this.whitePlayer;

        if (this.isConcluded) {
            if (this.rematchRequestedByWhite || this.rematchRequestedByBlack) {
                this.sendToSocket(remainingSocket, {
                    type: REMATCH_DECLINED,
                    payload: {
                        by: "system",
                        reason: "opponent_disconnected"
                    }
                });
            }
            this.rematchRequestedByWhite = false;
            this.rematchRequestedByBlack = false;
            this.rematchStarting = false;
            return "remove";
        }

        this.markPlayerDisconnected(disconnectedColor);
        const disconnectEpoch = this.bumpDisconnectEpoch(disconnectedColor);
        this.sendConnectionStateToOpponent(disconnectedColor, "reconnecting");
        this.startReconnectTimer(disconnectedColor, disconnectEpoch);
        return "keep";
    }

    private restoreFromSnapshot(snapshot: RuntimeGameSnapshot) {
        this.board = new Chess(snapshot.currentFen);
        this.startTime = new Date(snapshot.startedAt);
        this.ply = snapshot.ply;
        this.moveHistory = snapshot.moves.map((move) => ({
            ply: move.ply,
            san: move.san
        }));
        this.isConcluded = snapshot.status !== "active";
    }

    private sendInitGameMessages() {
        const initialFen = this.board.fen();
        const initialTurn = this.board.turn();
        this.sendToSocket(this.whitePlayer, {
            type: INIT_GAME,
            payload: {
                color: "white",
                fen: initialFen,
                turn: initialTurn,
                playerName: this.whitePlayer.userName,
                opponentName: this.blackPlayer.userName,
                moveHistory: this.moveHistory
            }
        });
        this.sendToSocket(this.blackPlayer, {
            type: INIT_GAME,
            payload: {
                color: "black",
                fen: initialFen,
                turn: initialTurn,
                playerName: this.blackPlayer.userName,
                opponentName: this.whitePlayer.userName,
                moveHistory: this.moveHistory
            }
        });
    }

    private sendInitGameMessageToPlayer(color: PlayerColor) {
        const socket = color === "white" ? this.whitePlayer : this.blackPlayer;
        const opponent = color === "white" ? this.blackPlayer : this.whitePlayer;
        this.sendToSocket(socket, {
            type: INIT_GAME,
            payload: {
                color,
                fen: this.board.fen(),
                turn: this.board.turn(),
                playerName: socket.userName,
                opponentName: opponent.userName,
                moveHistory: this.moveHistory
            }
        });
    }

    private getBoardGameOverPayload(): GameOverPayload {
        if (this.board.isCheckmate()) {
            return {
                result: "checkmate",
                reason: "checkmate",
                winnerColor: this.board.turn() === "w" ? "black" : "white",
                fen: this.board.fen(),
                turn: this.board.turn()
            };
        }
        if (this.board.isStalemate()) {
            return {
                result: "draw",
                reason: "stalemate",
                winnerColor: null,
                fen: this.board.fen(),
                turn: this.board.turn()
            };
        }
        if (this.board.isThreefoldRepetition()) {
            return {
                result: "draw",
                reason: "threefold_repetition",
                winnerColor: null,
                fen: this.board.fen(),
                turn: this.board.turn()
            };
        }
        if (this.board.isInsufficientMaterial()) {
            return {
                result: "draw",
                reason: "insufficient_material",
                winnerColor: null,
                fen: this.board.fen(),
                turn: this.board.turn()
            };
        }
        if (this.board.isDrawByFiftyMoves()) {
            return {
                result: "draw",
                reason: "fifty_move_rule",
                winnerColor: null,
                fen: this.board.fen(),
                turn: this.board.turn()
            };
        }
        return {
            result: "draw",
            reason: "other",
            winnerColor: null,
            fen: this.board.fen(),
            turn: this.board.turn()
        };
    }

    private async finishGame(payload: GameOverPayload) {
        if (this.isConcluded && payload.reason !== "opponent_left") {
            return;
        }

        try {
            const resultForPersistence = payload.reason === "opponent_left"
                ? null
                : this.getResultForPersistence(payload.winnerColor);

            await completeRuntimeGame({
                gameId: this.gameId,
                status: payload.reason === "opponent_left" ? "aborted" : "finished",
                result: resultForPersistence,
                currentFen: payload.fen,
                turn: payload.turn,
                endedAt: new Date().toISOString()
            });
        } catch (error) {
            console.error("Failed to persist runtime game result:", error);
            this.sendStorageSyncFailed(payload.winnerColor === null ? null : payload.winnerColor === "white" ? this.whitePlayer : this.blackPlayer, "game_sync_failed");
            return;
        }

        this.isConcluded = true;
        this.clearReconnectTimers();
        this.rematchStarting = false;
        this.rematchRequestedByWhite = false;
        this.rematchRequestedByBlack = false;

        this.sendToBoth({
            type: GAME_OVER,
            payload
        });
    }

    private sendRematchState(status: RematchStatus) {
        this.sendToBoth({
            type: REMATCH_STATE,
            payload: {
                requestedByWhite: this.rematchRequestedByWhite,
                requestedByBlack: this.rematchRequestedByBlack,
                status
            }
        });
    }

    private sendMoveRejected(socket: AuthenticatedSocket, reason: MoveRejectedReason) {
        this.sendToSocket(socket, {
            type: MOVE_REJECTED,
            payload: {
                reason,
                fen: this.board.fen(),
                turn: this.board.turn()
            }
        });
    }

    private sendStorageSyncFailed(socket: AuthenticatedSocket | null, reason: "move_sync_failed" | "game_sync_failed") {
        if (!socket) {
            this.sendToBoth({
                type: STORAGE_SYNC_FAILED,
                payload: { reason }
            });
            return;
        }

        this.sendToSocket(socket, {
            type: STORAGE_SYNC_FAILED,
            payload: { reason }
        });
    }

    private sendActionRejected(socket: AuthenticatedSocket, reason: string) {
        this.sendToSocket(socket, {
            type: ACTION_REJECTED,
            payload: { reason }
        });
    }

    private getColorForSocket(socket: AuthenticatedSocket): PlayerColor | null {
        if (socket === this.whitePlayer) {
            return "white";
        }
        if (socket === this.blackPlayer) {
            return "black";
        }
        return null;
    }

    private markPlayerDisconnected(color: PlayerColor) {
        if (color === "white") {
            this.disconnectedWhite = true;
            return;
        }
        this.disconnectedBlack = true;
    }

    private startReconnectTimer(color: PlayerColor, disconnectEpoch: number) {
        const timer = setTimeout(() => {
            void this.handleReconnectTimeout(color, disconnectEpoch);
        }, RECONNECT_GRACE_MS);

        if (color === "white") {
            if (this.whiteReconnectTimer) {
                clearTimeout(this.whiteReconnectTimer);
            }
            this.whiteReconnectTimer = timer;
            return;
        }

        if (this.blackReconnectTimer) {
            clearTimeout(this.blackReconnectTimer);
        }
        this.blackReconnectTimer = timer;
    }

    private async handleReconnectTimeout(color: PlayerColor, expectedEpoch: number) {
        if (this.isConcluded) {
            return;
        }

        if (color === "white") {
            if (this.whiteDisconnectEpoch !== expectedEpoch) {
                return;
            }
            this.whiteReconnectTimer = null;
            if (!this.disconnectedWhite) {
                return;
            }
        } else {
            if (this.blackDisconnectEpoch !== expectedEpoch) {
                return;
            }
            this.blackReconnectTimer = null;
            if (!this.disconnectedBlack) {
                return;
            }
        }

        const winnerColor: WinnerColor = color === "white" ? "black" : "white";
        await this.finishGame({
            result: "opponent_left",
            reason: "opponent_left",
            winnerColor,
            fen: this.board.fen(),
            turn: null
        });
        if (this.isConcluded) {
            this.onDisconnectTimeout(this);
        }
    }

    private clearReconnectTimers() {
        if (this.whiteReconnectTimer) {
            clearTimeout(this.whiteReconnectTimer);
            this.whiteReconnectTimer = null;
        }
        if (this.blackReconnectTimer) {
            clearTimeout(this.blackReconnectTimer);
            this.blackReconnectTimer = null;
        }
        this.whiteDisconnectEpoch += 1;
        this.blackDisconnectEpoch += 1;
        this.disconnectedWhite = false;
        this.disconnectedBlack = false;
    }

    private bumpDisconnectEpoch(color: PlayerColor) {
        if (color === "white") {
            this.whiteDisconnectEpoch += 1;
            return this.whiteDisconnectEpoch;
        }
        this.blackDisconnectEpoch += 1;
        return this.blackDisconnectEpoch;
    }

    private sendConnectionStateToOpponent(disconnectedColor: PlayerColor, state: "reconnecting" | "reconnected") {
        const disconnectedPlayer = disconnectedColor === "white" ? this.whitePlayer : this.blackPlayer;
        const opponent = disconnectedColor === "white" ? this.blackPlayer : this.whitePlayer;
        this.sendToSocket(opponent, {
            type: PLAYER_CONNECTION_STATE,
            payload: {
                userId: disconnectedPlayer.userId,
                state,
                graceMs: RECONNECT_GRACE_MS
            }
        });
    }

    private sendToBoth(message: object) {
        this.sendToSocket(this.whitePlayer, message);
        this.sendToSocket(this.blackPlayer, message);
    }

    private sendToSocket(socket: AuthenticatedSocket, message: object) {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
        }
    }

    private getResultForPersistence(winnerColor: WinnerColor): "white" | "black" | "draw" {
        if (winnerColor === "white") {
            return "white";
        }
        if (winnerColor === "black") {
            return "black";
        }
        return "draw";
    }
}
