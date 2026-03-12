import { ALREADY_WAITING, CANCEL_MATCHMAKING, INIT_GAME, MATCHMAKING_CANCELLED, MOVE, MOVE_REJECTED, REMATCH_DECLINED, REMATCH_REQUEST, WAITING_FOR_OPPONENT } from "./messages.js";
import { Game } from "./Game.js";
import { createGame } from "./gameStore.js";
import type { AuthenticatedSocket } from "./socketTypes.js";

export class GameManager {
    private games: Game[];
    private pendingUser: AuthenticatedSocket | null;
    private users: AuthenticatedSocket[];

    constructor() {
        this.games = [];
        this.pendingUser = null;
        this.users = [];
    }

    addUser(socket: AuthenticatedSocket) {
        this.users.push(socket);
        this.addHandler(socket);

    }
    removeUser(socket: AuthenticatedSocket) {
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
    private addHandler(socket: AuthenticatedSocket) {
        socket.on("message", async (data) => {
            const message = JSON.parse(data.toString());
            if (message.type === INIT_GAME) {
                if (this.pendingUser === socket) {
                    socket.send(JSON.stringify({
                        type: ALREADY_WAITING
                    }));
                    return;
                }
                if (this.pendingUser) {
                    const waitingPlayer = this.pendingUser;
                    this.pendingUser = null;
                    try {
                        const persistedGame = await createGame({
                            whiteUserId: waitingPlayer.userId,
                            blackUserId: socket.userId
                        });
                        const game = new Game(
                            waitingPlayer,
                            socket,
                            persistedGame.id,
                            async (currentGame) => this.startRematch(currentGame)
                        );
                        this.games.push(game);
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
                    game.makeMove(socket, message?.payload?.move);
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

    private async startRematch(currentGame: Game) {
        const nextWhitePlayer = currentGame.getBlackPlayer();
        const nextBlackPlayer = currentGame.getWhitePlayer();

        try {
            const persistedGame = await createGame({
                whiteUserId: nextWhitePlayer.userId,
                blackUserId: nextBlackPlayer.userId
            });
            const nextGame = new Game(
                nextWhitePlayer,
                nextBlackPlayer,
                persistedGame.id,
                async (game) => this.startRematch(game)
            );
            this.games = this.games.filter((game) => game !== currentGame);
            this.games.push(nextGame);
        } catch (error) {
            console.error("Failed to create rematch game row:", error);
            currentGame.handleRematchStartFailed();
        }
    }
}
