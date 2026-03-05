import { WebSocket } from "ws";
import { Chess } from 'chess.js'
import { GAME_OVER, INIT_GAME, MOVE } from "./messages";
export class Game {
    public player1: WebSocket;
    public player2: WebSocket;
    public board: Chess;
    private startTime: Date;
    private moveCount = 0;

    constructor(player1: WebSocket, player2: WebSocket) {
        this.player1 = player1;
        this.player2 = player2;
        this.board = new Chess();
        this.startTime = new Date();
        this.player1.send(JSON.stringify({
            type: INIT_GAME,
            payload: {
                color: "white"
            }
        }));
        this.player2.send(JSON.stringify({
            type: INIT_GAME,
            payload: {
                color: "black"
            }
        }));
    }

    makeMove(socket: WebSocket, move: {
        from: string,
        to: string
    }) {
        if (this.moveCount % 2 === 0 && socket !== this.player1) {
            console.log("Early return 1 " + this.moveCount);
            return;
        }
        if (this.moveCount % 2 === 1 && socket !== this.player2) {
            console.log("Early return 2");
            return;
        }
        try {
            this.board.move(move);
            this.moveCount++;
            console.log(this.moveCount);
        } catch (e) {
            console.log(e);
            return;
        }
        if (this.board.isGameOver()) {
            // send the game over message to both players
            this.player1.send(JSON.stringify({
                type: GAME_OVER,
                payload: {
                    winner: this.board.turn() === "w" ? "black" : "white"
                }
            }))
            this.player2.send(JSON.stringify({
                type: GAME_OVER,
                payload: {
                    winner: this.board.turn() === "w" ? "black" : "white"
                }
            }))
            return;
        }

        const opponent = socket === this.player1 ? this.player2 : this.player1;
        console.log("Sending move to opponent:", move);
        opponent.send(JSON.stringify({
            type: MOVE,
            payload: move
        }));
 
    }
}