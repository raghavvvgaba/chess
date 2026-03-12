import { ALREADY_IN_GAME, ALREADY_WAITING, CANCEL_MATCHMAKING, INIT_GAME, MATCHMAKING_CANCELLED, MOVE, MOVE_REJECTED, REMATCH_DECLINED, REMATCH_REQUEST, WAITING_FOR_OPPONENT } from "./messages.js";
import { Game } from "./Game.js";
import { createGame } from "./gameStore.js";
import type { AuthenticatedSocket } from "./socketTypes.js";

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
        this.addHandler(socket);

    }

    removeUser(socket: AuthenticatedSocket) {
        this.users = this.users.filter(user => user !== socket);
        if (this.pendingUser === socket) {
            this.pendingUser = null;
        }
        const game = this.getGameForUserId(socket.userId);
        if (game && game.containsPlayer(socket)) {
            game.handleDisconnect(socket);
            this.games = this.games.filter(currentGame => currentGame !== game);
            this.unregisterGame(game);
        }
        // stop the game here because user left
    }

    private addHandler(socket: AuthenticatedSocket) {
        socket.on("message", async (data) => {
            const message = JSON.parse(data.toString());
            if (message.type === INIT_GAME) {
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
                        const game = new Game(
                            waitingPlayer,
                            socket,
                            persistedGame.id,
                            async (currentGame) => this.startRematch(currentGame)
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
                    socket.send(JSON.stringify({
                        type: ALREADY_WAITING
                    }));
                    return;
                }
                socket.send(JSON.stringify({
                    type: MATCHMAKING_CANCELLED
                }));
            }
            if (message.type === MOVE) {
                const game = this.getGameForUserId(socket.userId);
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
                const game = this.getGameForUserId(socket.userId);
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
            this.unregisterGame(currentGame);
            this.games.push(nextGame);
            this.registerGame(nextGame, nextWhitePlayer.userId, nextBlackPlayer.userId);
        } catch (error) {
            console.error("Failed to create rematch game row:", error);
            currentGame.handleRematchStartFailed();
        }
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
}
