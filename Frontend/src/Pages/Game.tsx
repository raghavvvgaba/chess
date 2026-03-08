import { useEffect, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
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
type MoveColor = "white" | "black";
type LastMove = { from: Square; to: Square } | null;
type PromotionPiece = "q" | "r" | "b" | "n";

type MoveHistoryEntry = {
    ply: number;
    san: string;
    color: MoveColor;
    moveNumber: number;
};

type MoveHistoryRow = {
    moveNumber: number;
    white?: MoveHistoryEntry;
    black?: MoveHistoryEntry;
};

type MatchConclusion = {
    isOpen: boolean;
    result: MatchResult;
    reason: MatchReason;
    winnerColor: PlayerColor;
    isWinner: boolean;
    rematchState: RematchStateType;
    rematchMessage: string;
};

type PendingPromotion = {
    isOpen: boolean;
    from: Square | null;
    to: Square | null;
    availablePromotions: PromotionPiece[];
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

const DEFAULT_PENDING_PROMOTION: PendingPromotion = {
    isOpen: false,
    from: null,
    to: null,
    availablePromotions: []
};

const getPlayerDisplayName = (value: unknown, fallback: string) => {
    if (typeof value !== "string") {
        return fallback;
    }
    const trimmedValue = value.trim();
    return trimmedValue.length ? trimmedValue : fallback;
};

const getSquareFromCoordinates = (row: number, col: number): Square => {
    return `${String.fromCharCode(97 + col)}${8 - row}` as Square;
};

const getCheckedKingSquare = (chess: Chess): Square | null => {
    if (!chess.inCheck()) {
        return null;
    }
    const checkedColor = chess.turn();
    const boardState = chess.board();
    for (let row = 0; row < boardState.length; row += 1) {
        for (let col = 0; col < boardState[row].length; col += 1) {
            const piece = boardState[row][col];
            if (piece && piece.type === "k" && piece.color === checkedColor) {
                return getSquareFromCoordinates(row, col);
            }
        }
    }
    return null;
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
    const [currentFen, setCurrentFen] = useState<string>(chessRef.current.fen());
    const [lastMove, setLastMove] = useState<LastMove>(null);
    const [checkedKingSquare, setCheckedKingSquare] = useState<Square | null>(null);
    const [myPlayerName, setMyPlayerName] = useState("User 1");
    const [opponentPlayerName, setOpponentPlayerName] = useState("User 2");
    const [matchConclusion, setMatchConclusion] = useState<MatchConclusion>(DEFAULT_MATCH_CONCLUSION);
    const [moveHistory, setMoveHistory] = useState<MoveHistoryEntry[]>([]);
    const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion>(DEFAULT_PENDING_PROMOTION);
    const desktopHistoryRef = useRef<HTMLDivElement | null>(null);

    const syncBoardStateFromChess = () => {
        setBoard(chessRef.current.board());
        setCurrentTurn(chessRef.current.turn());
        setCurrentFen(chessRef.current.fen());
        setCheckedKingSquare(getCheckedKingSquare(chessRef.current));
    };

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
                    syncBoardStateFromChess();
                    setGameState("in_game");
                    setStatusMessage("");
                    setCancelRequested(false);
                    setPlayerColor(message.payload?.color === "black" ? "black" : "white");
                    setMyPlayerName(getPlayerDisplayName(message.payload?.playerName, "User 1"));
                    setOpponentPlayerName(getPlayerDisplayName(message.payload?.opponentName, "User 2"));
                    setMatchConclusion(DEFAULT_MATCH_CONCLUSION);
                    setLastMove(null);
                    setMoveHistory([]);
                    setPendingPromotion(DEFAULT_PENDING_PROMOTION);
                    break;
                case WAITING_FOR_OPPONENT:
                    setGameState("waiting");
                    setStatusMessage("Waiting for another player to join...");
                    setCancelRequested(false);
                    setCurrentTurn(null);
                    setCheckedKingSquare(null);
                    setMyPlayerName("User 1");
                    setOpponentPlayerName("User 2");
                    setPendingPromotion(DEFAULT_PENDING_PROMOTION);
                    break;
                case ALREADY_WAITING:
                    setGameState("waiting");
                    setStatusMessage("You are already waiting for an opponent.");
                    setCancelRequested(false);
                    setCurrentTurn(null);
                    setCheckedKingSquare(null);
                    setMyPlayerName("User 1");
                    setOpponentPlayerName("User 2");
                    setPendingPromotion(DEFAULT_PENDING_PROMOTION);
                    break;
                case MATCHMAKING_CANCELLED:
                    setGameState("idle");
                    setStatusMessage("Matchmaking cancelled.");
                    setCancelRequested(false);
                    setPlayerColor(null);
                    setCurrentTurn(null);
                    setCheckedKingSquare(null);
                    setLastMove(null);
                    setMyPlayerName("User 1");
                    setOpponentPlayerName("User 2");
                    setPendingPromotion(DEFAULT_PENDING_PROMOTION);
                    navigate("/");
                    break;
                case MOVE_APPLIED:
                    if (typeof message.payload?.fen === "string") {
                        try {
                            chessRef.current.load(message.payload.fen);
                            syncBoardStateFromChess();
                        } catch (e) {
                            console.log(e);
                        }
                    }
                    setStatusMessage("");
                    setPendingPromotion(DEFAULT_PENDING_PROMOTION);
                    if (
                        typeof message.payload?.move?.from === "string" &&
                        typeof message.payload?.move?.to === "string"
                    ) {
                        setLastMove({
                            from: message.payload.move.from as Square,
                            to: message.payload.move.to as Square
                        });
                    }
                    if (typeof message.payload?.san === "string" && typeof message.payload?.ply === "number") {
                        const ply = message.payload.ply;
                        const color: MoveColor = ply % 2 === 1 ? "white" : "black";
                        setMoveHistory((previous) => [
                            ...previous,
                            {
                                ply,
                                san: message.payload.san,
                                color,
                                moveNumber: Math.ceil(ply / 2)
                            }
                        ]);
                    }
                    break;
                case MOVE_REJECTED:
                    if (typeof message.payload?.fen === "string") {
                        try {
                            chessRef.current.load(message.payload.fen);
                            syncBoardStateFromChess();
                        } catch (e) {
                            console.log(e);
                        }
                    }
                    setStatusMessage(getMoveRejectedMessage(message.payload?.reason));
                    setPendingPromotion(DEFAULT_PENDING_PROMOTION);
                    break;
                case GAME_OVER: {
                    if (typeof message.payload?.fen === "string") {
                        try {
                            chessRef.current.load(message.payload.fen);
                            syncBoardStateFromChess();
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
                    setCheckedKingSquare(null);
                    setStatusMessage("");
                    setPendingPromotion(DEFAULT_PENDING_PROMOTION);
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

    useEffect(() => {
        const scrollToBottom = (element: HTMLDivElement | null) => {
            if (!element) {
                return;
            }
            element.scrollTop = element.scrollHeight;
        };
        scrollToBottom(desktopHistoryRef.current);
    }, [moveHistory]);

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
    const latestPly = moveHistory.length ? moveHistory[moveHistory.length - 1].ply : null;

    const getMoveHistoryRows = (): MoveHistoryRow[] => {
        const rowMap = new Map<number, MoveHistoryRow>();
        for (const entry of moveHistory) {
            const existing = rowMap.get(entry.moveNumber) ?? { moveNumber: entry.moveNumber };
            if (entry.color === "white") {
                existing.white = entry;
            } else {
                existing.black = entry;
            }
            rowMap.set(entry.moveNumber, existing);
        }
        return Array.from(rowMap.values()).sort((a, b) => a.moveNumber - b.moveNumber);
    };

    const renderMoveHistoryTable = (
        scrollRef: { current: HTMLDivElement | null },
        maxHeightClass = "max-h-80"
    ) => {
        const rows = getMoveHistoryRows();
        if (rows.length === 0) {
            return (
                <div className="text-sm text-gray-400 py-8 text-center">
                    No moves yet
                </div>
            );
        }
        return (
            <div ref={scrollRef} className={`${maxHeightClass} overflow-y-auto pr-1`}>
                <div className="space-y-1">
                    {rows.map((row) => (
                        <div
                            key={row.moveNumber}
                            className="grid grid-cols-[36px_minmax(0,1fr)_minmax(0,1fr)] gap-2 items-center rounded-lg px-2 py-1.5 hover:bg-[#3a3936] transition-colors"
                        >
                            <div className="text-xs text-gray-400 font-semibold">{row.moveNumber}.</div>
                            <div
                                className={`text-sm px-2 py-1 rounded-md text-center ${row.white?.ply === latestPly ? "bg-[#b58863] text-white font-semibold" : "bg-[#3a3936] text-gray-100"}`}
                            >
                                {row.white?.san ?? "—"}
                            </div>
                            <div
                                className={`text-sm px-2 py-1 rounded-md text-center ${row.black?.ply === latestPly ? "bg-[#b58863] text-white font-semibold" : "bg-[#3a3936] text-gray-100"}`}
                            >
                                {row.black?.san ?? "—"}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const handleMoveRequest = (move: { from: Square; to: Square; promotion?: PromotionPiece }) => {
        if (socket.readyState !== WebSocket.OPEN) {
            setStatusMessage("Connection issue. Try again.");
            return;
        }
        socket.send(JSON.stringify({
            type: MOVE,
            payload: {
                move
            }
        }));
    };

    const handlePromotionRequired = (payload: {
        from: Square;
        to: Square;
        availablePromotions: PromotionPiece[];
    }) => {
        setPendingPromotion({
            isOpen: true,
            from: payload.from,
            to: payload.to,
            availablePromotions: payload.availablePromotions
        });
    };

    const handleCancelPromotion = () => {
        setPendingPromotion(DEFAULT_PENDING_PROMOTION);
    };

    const handleSelectPromotion = (promotion: PromotionPiece) => {
        if (!pendingPromotion.isOpen || !pendingPromotion.from || !pendingPromotion.to) {
            return;
        }
        handleMoveRequest({
            from: pendingPromotion.from,
            to: pendingPromotion.to,
            promotion
        });
        setPendingPromotion(DEFAULT_PENDING_PROMOTION);
        setStatusMessage("");
    };

    const getPromotionLabel = (piece: PromotionPiece) => {
        if (piece === "q") return "Queen";
        if (piece === "r") return "Rook";
        if (piece === "b") return "Bishop";
        return "Knight";
    };

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
        setCheckedKingSquare(null);
        setLastMove(null);
        setMyPlayerName("User 1");
        setOpponentPlayerName("User 2");
        setPendingPromotion(DEFAULT_PENDING_PROMOTION);
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
        setCheckedKingSquare(null);
        setLastMove(null);
        setMyPlayerName("User 1");
        setOpponentPlayerName("User 2");
        setPendingPromotion(DEFAULT_PENDING_PROMOTION);
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
        setPendingPromotion(DEFAULT_PENDING_PROMOTION);
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
        <main className="h-dvh bg-[#262522] flex flex-col relative overflow-hidden pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <div className="w-full flex-1 flex flex-col lg:flex-row gap-2 lg:gap-4 p-2 lg:p-4 min-h-0">
                <section className="flex-1 flex items-center justify-center min-h-0">
                    <div className="w-full max-w-[calc(100dvh-11rem)] sm:max-w-[calc(100dvh-12rem)] lg:max-w-[calc(100dvh-10rem)] flex flex-col gap-1.5 sm:gap-2">
                    {/* Opponent info - above the board */}
                    <div className="w-full flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-1.5 sm:py-2 bg-[#3a3936] rounded-lg shrink-0">
                        <div className={`w-7 h-7 sm:w-9 sm:h-9 rounded-full flex items-center justify-center shrink-0 ${playerColor === "white" ? "bg-[#262522] border-2 border-gray-500" : "bg-white"}`}>
                            {playerColor === "white" ? (
                                <span className="text-white text-xs sm:text-sm font-bold">♔</span>
                            ) : (
                                <span className="text-black text-xs sm:text-sm font-bold">♔</span>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-white text-sm sm:text-base font-semibold truncate">{opponentPlayerName}</p>
                            <p className="text-gray-400 text-xs truncate">{playerColor === "white" ? "Black" : "White"}</p>
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                            {currentTurn === (playerColor === "white" ? "b" : "w") && (
                                <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-green-500 animate-pulse" />
                            )}
                        </div>
                    </div>

                    {/* Chess Board */}
                    <div className="w-full shrink-0">
                        <ChessBoard
                            board={board}
                            isInteractive={gameState === "in_game" && !matchConclusion.isOpen && !pendingPromotion.isOpen}
                            playerColor={playerColor}
                            currentTurn={currentTurn}
                            orientation={playerColor === "black" ? "black" : "white"}
                            setStatusMessage={setStatusMessage}
                            fen={currentFen}
                            lastMove={lastMove}
                            checkedKingSquare={checkedKingSquare}
                            onMoveRequest={handleMoveRequest}
                            onPromotionRequired={handlePromotionRequired}
                        />
                    </div>

                    {/* Current player info - below the board */}
                    <div className="w-full flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-1.5 sm:py-2 bg-[#3a3936] rounded-lg shrink-0">
                        <div className={`w-7 h-7 sm:w-9 sm:h-9 rounded-full flex items-center justify-center shrink-0 ${playerColor === "black" ? "bg-[#262522] border-2 border-gray-500" : "bg-white"}`}>
                            {playerColor === "black" ? (
                                <span className="text-white text-xs sm:text-sm font-bold">♔</span>
                            ) : (
                                <span className="text-black text-xs sm:text-sm font-bold">♔</span>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-white text-sm sm:text-base font-semibold truncate">{myPlayerName}</p>
                            <p className="text-gray-400 text-xs truncate">{playerColor === "black" ? "Black" : "White"}</p>
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                            {currentTurn === (playerColor === "white" ? "w" : "b") && (
                                <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-green-500 animate-pulse" />
                            )}
                        </div>
                    </div>
                    </div>
                </section>

                <aside className="hidden lg:flex w-[340px] xl:w-[380px] shrink-0 flex-col gap-4 self-stretch">
                    {statusMessage && (
                        <div className="rounded-xl border border-[#45433f] bg-[#2f2e2b] text-gray-200 px-4 py-3 text-sm">
                            {statusMessage}
                        </div>
                    )}
                    <section className="rounded-xl border border-[#45433f] bg-[#2f2e2b] text-white p-4 flex-1 min-h-0">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-lg font-bold">Move History</h3>
                            <span className="text-xs px-2 py-1 rounded-full bg-[#3a3936] text-gray-300">
                                {moveHistory.length} moves
                            </span>
                        </div>
                        <div className="grid grid-cols-[36px_minmax(0,1fr)_minmax(0,1fr)] gap-2 px-2 pb-2 text-[11px] uppercase tracking-wide text-gray-400">
                            <div>#</div>
                            <div className="text-center">White</div>
                            <div className="text-center">Black</div>
                        </div>
                        {renderMoveHistoryTable(desktopHistoryRef, "max-h-[calc(100vh-220px)]")}
                    </section>
                </aside>
            </div>

            {pendingPromotion.isOpen && !matchConclusion.isOpen && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <section className="w-full max-w-sm bg-[#2f2e2b] border border-[#5f5b53] rounded-2xl p-6 text-center text-white shadow-2xl">
                        <h2 className="text-2xl font-extrabold mb-2">Choose Promotion</h2>
                        <p className="text-sm text-gray-300 mb-5">Select the piece for your pawn promotion.</p>

                        <div className="grid grid-cols-2 gap-3 mb-5">
                            {(["q", "r", "b", "n"] as PromotionPiece[])
                                .filter((piece) => pendingPromotion.availablePromotions.includes(piece))
                                .map((piece) => (
                                    <button
                                        key={piece}
                                        onClick={() => handleSelectPromotion(piece)}
                                        className="bg-[#3a3936] hover:bg-[#4a4945] border border-[#5f5b53] rounded-xl px-3 py-3 flex flex-col items-center gap-2 transition-colors"
                                    >
                                        <img
                                            className="w-10 h-10 object-contain"
                                            src={`/Pieces/${playerColor === "black" ? piece : `w${piece}`}.png`}
                                            alt={getPromotionLabel(piece)}
                                        />
                                        <span className="text-sm font-semibold">{getPromotionLabel(piece)}</span>
                                    </button>
                                ))}
                        </div>

                        <button
                            onClick={handleCancelPromotion}
                            className="w-full bg-[#3c3b38] hover:bg-[#4a4945] text-white font-bold px-5 py-2.5 rounded-xl transition-colors"
                        >
                            Cancel
                        </button>
                    </section>
                </div>
            )}

            {matchConclusion.isOpen && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
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
