import { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import { useNavigate } from "react-router";
import ChessBoard from "../components/ChessBoard";
import useSocket from "../hooks/useSocket";

export const INIT_GAME = "init_game";
export const MOVE = "move";
export const GAME_OVER = "game_over";
export const WAITING_FOR_OPPONENT = "waiting_for_opponent";
export const ALREADY_WAITING = "already_waiting";
export const CANCEL_MATCHMAKING = "cancel_matchmaking";
export const MATCHMAKING_CANCELLED = "matchmaking_cancelled";
export const MOVE_APPLIED = "move_applied";
export const MOVE_REJECTED = "move_rejected";
export const REMATCH_REQUEST = "rematch_request";
export const REMATCH_STATE = "rematch_state";
export const REMATCH_DECLINED = "rematch_declined";

type GameState = "idle" | "waiting" | "in_game";
type PlayerColor = "white" | "black" | null;
type Turn = "w" | "b" | null;
type MoveRejectedReason = "not_your_turn" | "illegal_move" | "game_not_found";
type MatchResult = "checkmate" | "draw" | "opponent_left";
type MatchReason =
    | "checkmate"
    | "stalemate"
    | "threefold_repetition"
    | "insufficient_material"
    | "fifty_move_rule"
    | "opponent_left"
    | "other";
type RematchStateType = "idle" | "requested" | "waiting" | "declined";

type MatchConclusion = {
    isOpen: boolean;
    result: MatchResult;
    reason: MatchReason;
    winnerColor: PlayerColor;
    isWinner: boolean;
    rematchState: RematchStateType;
    rematchMessage: string;
};

const DEFAULT_MATCH_CONCLUSION: MatchConclusion = {
    isOpen: false,
    result: "draw",
    reason: "other",
    winnerColor: null,
    isWinner: false,
    rematchState: "idle",
    rematchMessage: ""
};

function Game() {
    const navigate = useNavigate();
    const socket = useSocket();
    const chessRef = useRef(new Chess());
    const [board, setBoard] = useState(chessRef.current.board());
    const [gameState, setGameState] = useState<GameState>("idle");
    const [statusMessage, setStatusMessage] = useState<string>("");
    const [cancelRequested, setCancelRequested] = useState(false);
    const [playerColor, setPlayerColor] = useState<PlayerColor>(null);
    const [currentTurn, setCurrentTurn] = useState<Turn>("w");
    const [matchConclusion, setMatchConclusion] = useState<MatchConclusion>(DEFAULT_MATCH_CONCLUSION);

    useEffect(() => {
        if (!socket) {
            return;
        }

        const getMoveRejectedMessage = (reason: MoveRejectedReason) => {
            if (reason === "not_your_turn") {
                return "Not your turn.";
            }
            if (reason === "illegal_move") {
                return "Illegal move.";
            }
            return "Move rejected: game not found.";
        };

        const getRematchDeclinedMessage = (reason: string) => {
            if (reason === "opponent_disconnected") {
                return "Rematch unavailable. Opponent disconnected.";
            }
            if (reason === "expired") {
                return "Rematch request expired.";
            }
            return "Rematch declined by opponent.";
        };

        socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            console.log(message);

            switch (message.type) {
                case INIT_GAME:
                    chessRef.current = new Chess();
                    if (typeof message.payload?.fen === "string") {
                        try {
                            chessRef.current.load(message.payload.fen);
                        } catch (e) {
                            console.log(e);
                        }
                    }
                    setBoard(chessRef.current.board());
                    setCurrentTurn(message.payload?.turn === "b" ? "b" : "w");
                    setGameState("in_game");
                    setStatusMessage("");
                    setCancelRequested(false);
                    setPlayerColor(message.payload?.color === "black" ? "black" : "white");
                    setMatchConclusion(DEFAULT_MATCH_CONCLUSION);
                    break;
                case WAITING_FOR_OPPONENT:
                    setGameState("waiting");
                    setStatusMessage("Waiting for another player to join...");
                    setCancelRequested(false);
                    setCurrentTurn(null);
                    break;
                case ALREADY_WAITING:
                    setGameState("waiting");
                    setStatusMessage("You are already waiting for an opponent.");
                    setCancelRequested(false);
                    setCurrentTurn(null);
                    break;
                case MATCHMAKING_CANCELLED:
                    setGameState("idle");
                    setStatusMessage("Matchmaking cancelled.");
                    setCancelRequested(false);
                    setPlayerColor(null);
                    setCurrentTurn(null);
                    navigate("/");
                    break;
                case MOVE_APPLIED:
                    if (typeof message.payload?.fen === "string") {
                        try {
                            chessRef.current.load(message.payload.fen);
                            setBoard(chessRef.current.board());
                        } catch (e) {
                            console.log(e);
                        }
                    }
                    setCurrentTurn(message.payload?.turn === "b" ? "b" : "w");
                    setStatusMessage("");
                    break;
                case MOVE_REJECTED:
                    if (typeof message.payload?.fen === "string") {
                        try {
                            chessRef.current.load(message.payload.fen);
                            setBoard(chessRef.current.board());
                        } catch (e) {
                            console.log(e);
                        }
                    }
                    if (message.payload?.turn === "w" || message.payload?.turn === "b") {
                        setCurrentTurn(message.payload.turn);
                    } else {
                        setCurrentTurn(chessRef.current.turn());
                    }
                    setStatusMessage(getMoveRejectedMessage(message.payload?.reason));
                    break;
                case GAME_OVER: {
                    if (typeof message.payload?.fen === "string") {
                        try {
                            chessRef.current.load(message.payload.fen);
                            setBoard(chessRef.current.board());
                        } catch (e) {
                            console.log(e);
                        }
                    }

                    const winnerColor: PlayerColor =
                        message.payload?.winnerColor === "white" || message.payload?.winnerColor === "black"
                            ? message.payload.winnerColor
                            : message.payload?.winner === "white" || message.payload?.winner === "black"
                                ? message.payload.winner
                                : null;
                    const result: MatchResult =
                        message.payload?.result === "checkmate" ||
                        message.payload?.result === "opponent_left" ||
                        message.payload?.result === "draw"
                            ? message.payload.result
                            : winnerColor
                                ? "checkmate"
                                : "draw";
                    const reason: MatchReason =
                        message.payload?.reason === "checkmate" ||
                        message.payload?.reason === "stalemate" ||
                        message.payload?.reason === "threefold_repetition" ||
                        message.payload?.reason === "insufficient_material" ||
                        message.payload?.reason === "fifty_move_rule" ||
                        message.payload?.reason === "opponent_left" ||
                        message.payload?.reason === "other"
                            ? message.payload.reason
                            : result === "checkmate"
                                ? "checkmate"
                                : "other";
                    const isWinner = !!winnerColor && !!playerColor && winnerColor === playerColor;

                    setCurrentTurn(null);
                    setStatusMessage("");
                    setMatchConclusion({
                        isOpen: true,
                        result,
                        reason,
                        winnerColor,
                        isWinner,
                        rematchState: "idle",
                        rematchMessage: ""
                    });
                    break;
                }
                case REMATCH_STATE: {
                    setMatchConclusion((previous) => {
                        if (!previous.isOpen) {
                            return previous;
                        }

                        const requestedByWhite = !!message.payload?.requestedByWhite;
                        const requestedByBlack = !!message.payload?.requestedByBlack;
                        const status = message.payload?.status;
                        const myRequested = playerColor === "white" ? requestedByWhite : playerColor === "black" ? requestedByBlack : false;
                        const opponentRequested = playerColor === "white" ? requestedByBlack : playerColor === "black" ? requestedByWhite : false;

                        if (status === "starting") {
                            return {
                                ...previous,
                                rematchState: "requested",
                                rematchMessage: "Starting rematch..."
                            };
                        }
                        if (myRequested && !opponentRequested) {
                            return {
                                ...previous,
                                rematchState: "requested",
                                rematchMessage: "Rematch requested. Waiting for opponent..."
                            };
                        }
                        if (!myRequested && opponentRequested) {
                            return {
                                ...previous,
                                rematchState: "waiting",
                                rematchMessage: "Opponent requested a rematch."
                            };
                        }
                        return {
                            ...previous,
                            rematchState: "idle",
                            rematchMessage: ""
                        };
                    });
                    break;
                }
                case REMATCH_DECLINED:
                    setMatchConclusion((previous) => {
                        if (!previous.isOpen) {
                            return previous;
                        }
                        return {
                            ...previous,
                            rematchState: "declined",
                            rematchMessage: getRematchDeclinedMessage(message.payload?.reason)
                        };
                    });
                    break;
            }
        };

        return () => {
            socket.onmessage = null;
        };
    }, [socket, navigate, playerColor]);

    if (!socket) {
        return <div>Connecting...</div>;
    }

    const getConclusionTitle = () => {
        if (matchConclusion.result === "checkmate") {
            return "Checkmate";
        }
        if (matchConclusion.result === "opponent_left") {
            return "Opponent Left";
        }
        return "Draw";
    };

    const getDrawReasonLabel = (reason: MatchReason) => {
        if (reason === "stalemate") return "Stalemate";
        if (reason === "threefold_repetition") return "Threefold repetition";
        if (reason === "insufficient_material") return "Insufficient material";
        if (reason === "fifty_move_rule") return "Fifty-move rule";
        return "Agreement or other";
    };

    const getConclusionSubtitle = () => {
        if (matchConclusion.result === "checkmate") {
            if (matchConclusion.isWinner) {
                return `You won as ${playerColor === "black" ? "Black" : "White"}.`;
            }
            return "You lost.";
        }
        if (matchConclusion.result === "opponent_left") {
            return "Match ended • Opponent disconnected.";
        }
        return `Draw • ${getDrawReasonLabel(matchConclusion.reason)}.`;
    };

    const getRematchButtonLabel = () => {
        if (matchConclusion.rematchState === "requested") {
            return "Requested...";
        }
        if (matchConclusion.rematchState === "waiting") {
            return "Accept Rematch";
        }
        return "Rematch";
    };

    const isRematchButtonDisabled = matchConclusion.rematchState === "requested";

    const handleStartGame = () => {
        if (gameState !== "idle") {
            return;
        }
        socket.send(JSON.stringify({
            type: INIT_GAME
        }));
        setGameState("waiting");
        setStatusMessage("Waiting for another player to join...");
        setCancelRequested(false);
        setPlayerColor(null);
        setCurrentTurn(null);
    };

    const handleCancelMatchmaking = () => {
        if (gameState !== "waiting" || cancelRequested) {
            return;
        }
        setCancelRequested(true);
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: CANCEL_MATCHMAKING
            }));
        }
        setGameState("idle");
        setStatusMessage("Matchmaking cancelled.");
        setPlayerColor(null);
        setCurrentTurn(null);
        navigate("/", { replace: true });
    };

    const handleRematchRequest = () => {
        if (!matchConclusion.isOpen || isRematchButtonDisabled) {
            return;
        }
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: REMATCH_REQUEST
            }));
            setMatchConclusion((previous) => ({
                ...previous,
                rematchState: "requested",
                rematchMessage: "Rematch requested. Waiting for opponent..."
            }));
        }
    };

    const handleGoHome = () => {
        navigate("/", { replace: true });
    };

    if (gameState !== "in_game") {
        return (
            <main className="min-h-screen bg-[#262522] flex items-center justify-center p-4">
                <section className="w-full max-w-xl bg-[#2f2e2b] border border-[#45433f] rounded-xl p-8 text-center text-white space-y-4 shadow-lg">
                    {gameState === "idle" && (
                        <>
                            <h1 className="text-3xl font-bold">Start a Match</h1>
                            <p className="text-gray-300">Click below to enter matchmaking.</p>
                            <button
                                onClick={handleStartGame}
                                className="w-full bg-[#b58863] hover:bg-[#a0764b] text-white font-bold text-xl px-6 py-4 rounded-xl shadow transition-colors"
                            >
                                Start Game
                            </button>
                        </>
                    )}
                    {gameState === "waiting" && (
                        <>
                            <h1 className="text-3xl font-bold">Waiting for another player...</h1>
                            <p className="text-gray-300">You will be moved to the board automatically when a match is found.</p>
                            <button
                                onClick={handleCancelMatchmaking}
                                disabled={cancelRequested}
                                className={`w-full text-white font-bold text-xl px-6 py-4 rounded-xl shadow transition-colors ${cancelRequested ? "bg-[#6e614f] text-gray-200 cursor-not-allowed" : "bg-[#4a4a48] hover:bg-[#5a5a58]"}`}
                            >
                                {cancelRequested ? "Cancel requested..." : "Cancel Matchmaking"}
                            </button>
                        </>
                    )}
                    {statusMessage && <p className="text-sm text-gray-400">{statusMessage}</p>}
                </section>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-[#262522] flex flex-col items-center justify-center p-4 gap-5 relative">
            <div className="w-full max-w-5xl bg-[#2f2e2b] border border-[#45433f] rounded-lg px-4 py-3 text-white text-center font-semibold">
                You are playing as {playerColor === "black" ? "Black" : "White"}
            </div>
            <div className="w-full flex flex-col lg:flex-row items-center justify-center gap-8">
                <section className="flex-1 flex flex-col items-center w-full max-w-2xl">
                    <div className="w-full aspect-square max-w-xl bg-[#f0d9b5] rounded-lg shadow-lg flex items-center justify-center">
                        <ChessBoard
                            socket={socket}
                            board={board}
                            isInteractive={gameState === "in_game" && !matchConclusion.isOpen}
                            playerColor={playerColor}
                            currentTurn={currentTurn}
                            orientation={playerColor === "black" ? "black" : "white"}
                            setStatusMessage={setStatusMessage}
                        />
                    </div>
                </section>
                <aside className="w-full max-w-xs flex flex-col items-center gap-8 mt-8 lg:mt-0">
                    {statusMessage && <div className="text-gray-200">{statusMessage}</div>}
                </aside>
            </div>

            {matchConclusion.isOpen && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <section className="w-full max-w-md bg-[#2f2e2b] border border-[#5f5b53] rounded-2xl p-8 text-center text-white shadow-2xl animate-[fadeIn_.2s_ease-out]">
                        <div className="inline-flex items-center justify-center px-4 py-1 rounded-full bg-[#b58863] text-sm font-bold tracking-wide mb-5">
                            Match Concluded
                        </div>
                        <h2 className="text-4xl font-extrabold mb-3">{getConclusionTitle()}</h2>
                        <p className="text-gray-200 mb-6">{getConclusionSubtitle()}</p>

                        {matchConclusion.rematchMessage && (
                            <p className="text-sm text-gray-300 mb-6">{matchConclusion.rematchMessage}</p>
                        )}

                        <div className="flex flex-col sm:flex-row gap-3">
                            <button
                                onClick={handleRematchRequest}
                                disabled={isRematchButtonDisabled}
                                className={`flex-1 font-bold px-5 py-3 rounded-xl transition-colors ${isRematchButtonDisabled ? "bg-[#6e614f] text-gray-200 cursor-not-allowed" : "bg-[#b58863] hover:bg-[#a0764b] text-white"}`}
                            >
                                {getRematchButtonLabel()}
                            </button>
                            <button
                                onClick={handleGoHome}
                                className="flex-1 bg-[#3c3b38] hover:bg-[#4a4945] text-white font-bold px-5 py-3 rounded-xl transition-colors"
                            >
                                Home
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </main>
    );
}

export default Game;
