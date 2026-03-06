import { WebSocket } from "ws";
import { ALREADY_WAITING, CANCEL_MATCHMAKING, INIT_GAME, MATCHMAKING_CANCELLED, MOVE, MOVE_REJECTED, REMATCH_DECLINED, REMATCH_REQUEST, WAITING_FOR_OPPONENT } from "./messages";
import { Game } from "./Game";

export class GameManager {
    private games: Game[];
    private pendingUser: WebSocket | null;
    private users: WebSocket[];

    constructor() {
        this.games = [];
        this.pendingUser = null;
        this.users = [];
    }

    addUser(socket: WebSocket) {
        this.users.push(socket);
        this.addHandler(socket);

    }
    removeUser(socket: WebSocket) {
        this.users = this.users.filter(user => user !== socket);
        if (this.pendingUser === socket) {
            this.pendingUser = null;
        }
        const game = this.games.find(currentGame => currentGame.containsPlayer(socket));
        if (game) {
            game.handleDisconnect(socket);
            this.games = this.games.filter(currentGame => currentGame !== game);
        }
        // stop the game here because user left
    }
    private addHandler(socket: WebSocket) {
        socket.on("message", (data) => {
            const message = JSON.parse(data.toString());
            if (message.type === INIT_GAME) {
                if (this.pendingUser === socket) {
                    socket.send(JSON.stringify({
                        type: ALREADY_WAITING
                    }));
                    return;
                }
                if (this.pendingUser) {
                    const game = new Game(this.pendingUser, socket);
                    this.games.push(game);
                    this.pendingUser = null;
                } else {
                    this.pendingUser = socket;
                    socket.send(JSON.stringify({
                        type: WAITING_FOR_OPPONENT
                    }));
                }
            }
            if (message.type === CANCEL_MATCHMAKING) {
                if (this.pendingUser === socket) {
                    this.pendingUser = null;
                }
                socket.send(JSON.stringify({
                    type: MATCHMAKING_CANCELLED
                }));
            }
            if (message.type === MOVE) {
                const game = this.games.find(game => game.player1 === socket || game.player2 === socket);
                if (game) {
                    game.makeMove(socket, message.payload.move);
                } else {
                    socket.send(JSON.stringify({
                        type: MOVE_REJECTED,
                        payload: {
                            reason: "game_not_found"
                        }
                    }));
                }
            }
            if (message.type === REMATCH_REQUEST) {
                const game = this.games.find(currentGame => currentGame.containsPlayer(socket));
                if (game) {
                    game.requestRematch(socket);
                } else {
                    socket.send(JSON.stringify({
                        type: REMATCH_DECLINED,
                        payload: {
                            by: "system",
                            reason: "expired"
                        }
                    }));
                }
            }
        })
    }
}
