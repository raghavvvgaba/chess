import { WebSocket } from "ws";
import { Chess } from "chess.js";
import { GAME_OVER, INIT_GAME, MOVE_APPLIED, MOVE_REJECTED, REMATCH_DECLINED, REMATCH_STATE } from "./messages";

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

export class Game {
    public player1: WebSocket;
    public player2: WebSocket;
    public board: Chess;
    private startTime: Date;
    private whitePlayer: WebSocket;
    private blackPlayer: WebSocket;
    private isConcluded = false;
    private rematchRequestedByWhite = false;
    private rematchRequestedByBlack = false;

    constructor(player1: WebSocket, player2: WebSocket) {
        this.player1 = player1;
        this.player2 = player2;
        this.whitePlayer = player1;
        this.blackPlayer = player2;
        this.board = new Chess();
        this.startTime = new Date();
        this.sendInitGameMessages();
    }

    containsPlayer(socket: WebSocket) {
        return this.player1 === socket || this.player2 === socket;
    }

    makeMove(socket: WebSocket, move: {
        from: string,
        to: string,
        promotion?: string
    }) {
        if (this.isConcluded) {
            this.sendMoveRejected(socket, "illegal_move");
            return;
        }

        const turnPlayer = this.board.turn() === "w" ? this.whitePlayer : this.blackPlayer;
        if (socket !== turnPlayer) {
            this.sendMoveRejected(socket, "not_your_turn");
            return;
        }

        let appliedMove: {
            from: string;
            to: string;
            promotion?: string;
        } | null = null;
        try {
            const result = this.board.move(move);
            if (result) {
                appliedMove = {
                    from: result.from,
                    to: result.to,
                    promotion: result.promotion
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

        const moveAppliedPayload = {
            move: appliedMove,
            fen: this.board.fen(),
            turn: this.board.turn()
        };
        this.sendToBoth({
            type: MOVE_APPLIED,
            payload: moveAppliedPayload
        });

        if (this.board.isGameOver()) {
            const gameOverPayload = this.getBoardGameOverPayload();
            this.finishGame(gameOverPayload);
        }
    }

    requestRematch(socket: WebSocket) {
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
            this.sendRematchState("starting");
            this.startRematchWithSwappedColors();
            return;
        }

        this.sendRematchState("waiting");
    }

    handleDisconnect(socket: WebSocket) {
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

    private startRematchWithSwappedColors() {
        const previousWhitePlayer = this.whitePlayer;
        this.whitePlayer = this.blackPlayer;
        this.blackPlayer = previousWhitePlayer;
        this.board = new Chess();
        this.startTime = new Date();
        this.isConcluded = false;
        this.rematchRequestedByWhite = false;
        this.rematchRequestedByBlack = false;
        this.sendInitGameMessages();
    }

    private sendInitGameMessages() {
        const initialFen = this.board.fen();
        const initialTurn = this.board.turn();
        this.sendToSocket(this.whitePlayer, {
            type: INIT_GAME,
            payload: {
                color: "white",
                fen: initialFen,
                turn: initialTurn
            }
        });
        this.sendToSocket(this.blackPlayer, {
            type: INIT_GAME,
            payload: {
                color: "black",
                fen: initialFen,
                turn: initialTurn
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

    private sendMoveRejected(socket: WebSocket, reason: MoveRejectedReason) {
        this.sendToSocket(socket, {
            type: MOVE_REJECTED,
            payload: {
                reason,
                fen: this.board.fen(),
                turn: this.board.turn()
            }
        });
    }

    private getColorForSocket(socket: WebSocket): PlayerColor | null {
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

    private sendToSocket(socket: WebSocket, message: object) {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
        }
    }
}
