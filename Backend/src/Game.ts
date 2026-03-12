import { WebSocket } from "ws";
import { Chess } from "chess.js";
import { GAME_OVER, INIT_GAME, MOVE_APPLIED, MOVE_REJECTED, REMATCH_DECLINED, REMATCH_STATE } from "./messages.js";
import { finishGame as finishGameInStore, saveMove } from "./gameStore.js";
import type { AuthenticatedSocket } from "./socketTypes.js";

type MoveRejectedReason = "not_your_turn" | "illegal_move";
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

export class Game {
    public player1: AuthenticatedSocket;
    public player2: AuthenticatedSocket;
    public board: Chess;
    private startTime: Date;
    private whitePlayer: AuthenticatedSocket;
    private blackPlayer: AuthenticatedSocket;
    private isConcluded = false;
    private rematchRequestedByWhite = false;
    private rematchRequestedByBlack = false;
    private rematchStarting = false;
    private ply = 0;
    private readonly gameId: string;
    private readonly onRematchReady: (game: Game) => Promise<void>;

    constructor(
        player1: AuthenticatedSocket,
        player2: AuthenticatedSocket,
        gameId: string,
        onRematchReady: (game: Game) => Promise<void>
    ) {
        this.player1 = player1;
        this.player2 = player2;
        this.whitePlayer = player1;
        this.blackPlayer = player2;
        this.board = new Chess();
        this.startTime = new Date();
        this.gameId = gameId;
        this.onRematchReady = onRematchReady;
        this.sendInitGameMessages();
    }

    containsPlayer(socket: AuthenticatedSocket) {
        return this.player1 === socket || this.player2 === socket;
    }

    makeMove(socket: AuthenticatedSocket, move: unknown) {
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
        } catch (e) {
            console.log(e);
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
        this.sendToBoth({
            type: MOVE_APPLIED,
            payload: moveAppliedPayload
        });
        const uci = `${appliedMove.from}${appliedMove.to}${appliedMove.promotion ?? ""}`;
        void saveMove({
            gameId: this.gameId,
            ply: this.ply,
            san: appliedMove.san,
            uci,
            fenAfter: this.board.fen(),
            playedByUserId: socket.userId
        }).catch((error) => {
            console.error("Failed to persist move:", error);
        });

        if (this.board.isGameOver()) {
            const gameOverPayload = this.getBoardGameOverPayload();
            this.finishGame(gameOverPayload);
        }
    }

    private isPromotionPiece(value: unknown): value is PromotionPiece {
        return value === "q" || value === "r" || value === "b" || value === "n";
    }

    requestRematch(socket: AuthenticatedSocket) {
        if (!this.isConcluded) {
            return;
        }

        const color = this.getColorForSocket(socket);
        if (!color) {
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

    handleDisconnect(socket: AuthenticatedSocket) {
        if (!this.containsPlayer(socket)) {
            return;
        }

        const disconnectedColor = this.getColorForSocket(socket);
        const remainingSocket = socket === this.player1 ? this.player2 : this.player1;

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
            return;
        }

        const winnerColor: WinnerColor =
            disconnectedColor === "white" ? "black" : disconnectedColor === "black" ? "white" : null;

        this.finishGame({
            result: "opponent_left",
            reason: "opponent_left",
            winnerColor,
            fen: this.board.fen(),
            turn: null
        });
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
                opponentName: this.blackPlayer.userName
            }
        });
        this.sendToSocket(this.blackPlayer, {
            type: INIT_GAME,
            payload: {
                color: "black",
                fen: initialFen,
                turn: initialTurn,
                playerName: this.blackPlayer.userName,
                opponentName: this.whitePlayer.userName
            }
        });
    }

    private getBoardGameOverPayload() {
        if (this.board.isCheckmate()) {
            return {
                result: "checkmate" as ResultType,
                reason: "checkmate" as ResultReason,
                winnerColor: this.board.turn() === "w" ? "black" as WinnerColor : "white" as WinnerColor,
                fen: this.board.fen(),
                turn: this.board.turn()
            };
        }
        if (this.board.isStalemate()) {
            return {
                result: "draw" as ResultType,
                reason: "stalemate" as ResultReason,
                winnerColor: null,
                fen: this.board.fen(),
                turn: this.board.turn()
            };
        }
        if (this.board.isThreefoldRepetition()) {
            return {
                result: "draw" as ResultType,
                reason: "threefold_repetition" as ResultReason,
                winnerColor: null,
                fen: this.board.fen(),
                turn: this.board.turn()
            };
        }
        if (this.board.isInsufficientMaterial()) {
            return {
                result: "draw" as ResultType,
                reason: "insufficient_material" as ResultReason,
                winnerColor: null,
                fen: this.board.fen(),
                turn: this.board.turn()
            };
        }
        if (this.board.isDrawByFiftyMoves()) {
            return {
                result: "draw" as ResultType,
                reason: "fifty_move_rule" as ResultReason,
                winnerColor: null,
                fen: this.board.fen(),
                turn: this.board.turn()
            };
        }
        return {
            result: "draw" as ResultType,
            reason: "other" as ResultReason,
            winnerColor: null,
            fen: this.board.fen(),
            turn: this.board.turn()
        };
    }

    private finishGame(payload: {
        result: ResultType;
        reason: ResultReason;
        winnerColor: WinnerColor;
        fen: string;
        turn: "w" | "b" | null;
    }) {
        this.isConcluded = true;
        this.rematchStarting = false;
        this.rematchRequestedByWhite = false;
        this.rematchRequestedByBlack = false;

        this.sendToBoth({
            type: GAME_OVER,
            payload
        });

        void finishGameInStore({
            gameId: this.gameId,
            status: "finished",
            result: this.getResultForPersistence(payload.winnerColor)
        }).catch((error) => {
            console.error("Failed to persist game result:", error);
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

    private getColorForSocket(socket: AuthenticatedSocket): PlayerColor | null {
        if (socket === this.whitePlayer) {
            return "white";
        }
        if (socket === this.blackPlayer) {
            return "black";
        }
        return null;
    }

    private sendToBoth(message: object) {
        this.sendToSocket(this.player1, message);
        this.sendToSocket(this.player2, message);
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
