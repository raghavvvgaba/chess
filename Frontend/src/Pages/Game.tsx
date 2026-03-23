import { useEffect, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { useNavigate, useSearchParams, useLocation } from "react-router";
import { motion } from "framer-motion";
import ChessBoard from "../components/ChessBoard";
import MatchConclusionModal from "../components/game/MatchConclusionModal";
import PromotionModal from "../components/game/PromotionModal";
import useSocket from "../hooks/useSocket";
import LoadingState from "../components/LoadingState";

export const INIT_GAME = "init_game";
export const MOVE = "move";
export const GAME_OVER = "game_over";
export const WAITING_FOR_OPPONENT = "waiting_for_opponent";
export const ALREADY_WAITING = "already_waiting";
export const ALREADY_IN_GAME = "already_in_game";
export const CANCEL_MATCHMAKING = "cancel_matchmaking";
export const MATCHMAKING_CANCELLED = "matchmaking_cancelled";
export const MOVE_APPLIED = "move_applied";
export const MOVE_REJECTED = "move_rejected";
export const INVALID_MESSAGE = "invalid_message";
export const STORAGE_SYNC_FAILED = "storage_sync_failed";
export const ACTION_REJECTED = "action_rejected";
export const REMATCH_REQUEST = "rematch_request";
export const REMATCH_STATE = "rematch_state";
export const REMATCH_DECLINED = "rematch_declined";
export const PLAYER_CONNECTION_STATE = "player_connection_state";
export const QUIT_GAME = "quit_game";
export const RECONNECT_GAME = "reconnect_game";
export const LEAVE_GAME_VIEW = "leave_game_view";

type GameState = "idle" | "waiting" | "waiting_elsewhere" | "in_game";
type PlayerColor = "white" | "black" | null;
type Turn = "w" | "b" | null;
type MoveRejectedReason = "not_your_turn" | "illegal_move" | "game_not_found" | "storage_sync_failed";
type MatchResult = "checkmate" | "draw" | "opponent_left";
type MatchReason =
    | "checkmate"
    | "stalemate"
    | "threefold_repetition"
    | "insufficient_material"
    | "fifty_move_rule"
    | "resigned"
    | "opponent_left"
    | "other";
type RematchStateType = "idle" | "requested" | "waiting" | "declined";
type MoveColor = "white" | "black";
type LastMove = { from: Square; to: Square } | null;
type PromotionPiece = "q" | "r" | "b" | "n";
type OpponentConnectionState = {
    isReconnecting: boolean;
    reconnectDeadlineMs: number | null;
    isReconnected: boolean;
};

type MoveHistoryEntry = {
    ply: number;
    san: string;
    color: MoveColor;
    moveNumber: number;
};

type InitMoveHistoryEntry = {
    ply: number;
    san: string;
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

const DEFAULT_OPPONENT_CONNECTION_STATE: OpponentConnectionState = {
    isReconnecting: false,
    reconnectDeadlineMs: null,
    isReconnected: false
};

const RECONNECTED_BANNER_DURATION_MS = 3000;

const normalizeRoomCode = (value: string | null) => (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

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
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const socket = useSocket();
    const roomCode = normalizeRoomCode(searchParams.get("room"));
    const initialGameData = (location.state as { initialGameData?: unknown } | null)?.initialGameData;
    const chessRef = useRef(new Chess());
    const [board, setBoard] = useState(chessRef.current.board());
    const [gameState, setGameState] = useState<GameState>("idle");
    const [statusMessage, setStatusMessage] = useState<string>("");
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
    const [opponentConnectionState, setOpponentConnectionState] = useState<OpponentConnectionState>(DEFAULT_OPPONENT_CONNECTION_STATE);
    const [quitRequested, setQuitRequested] = useState(false);
    const [quitDialogOpen, setQuitDialogOpen] = useState(false);
    const [connectionNowMs, setConnectionNowMs] = useState(() => Date.now());
    const desktopHistoryRef = useRef<HTMLDivElement | null>(null);
    const mobileHistoryRef = useRef<HTMLDivElement | null>(null);
    const reconnectRequestSentRef = useRef(false);
    const reconnectRedirectTimerRef = useRef<number | null>(null);
    const reconnectRequestSocketRef = useRef<WebSocket | null>(null);
    const leaveGameViewSentRef = useRef(false);
    const latestGameStateRef = useRef<GameState>("idle");
    const latestSocketRef = useRef<WebSocket | null>(null);

    const initializeGameFromPayload = (payload: any) => {
        chessRef.current = new Chess();
        if (typeof payload?.fen === "string") {
            try {
                chessRef.current.load(payload.fen);
            } catch (e) {
                console.log(e);
            }
        }
        setBoard(chessRef.current.board());
        setCurrentTurn(chessRef.current.turn());
        setCurrentFen(chessRef.current.fen());
        setCheckedKingSquare(getCheckedKingSquare(chessRef.current));
        setGameState("in_game");
        setStatusMessage("");
        setPlayerColor(payload?.color === "black" ? "black" : "white");
        setMyPlayerName(getPlayerDisplayName(payload?.playerName, "User 1"));
        setOpponentPlayerName(getPlayerDisplayName(payload?.opponentName, "User 2"));
        setMatchConclusion(DEFAULT_MATCH_CONCLUSION);
        setLastMove(null);
        setMoveHistory(parseInitMoveHistory(payload?.moveHistory));
        setPendingPromotion(DEFAULT_PENDING_PROMOTION);
        setOpponentConnectionState(DEFAULT_OPPONENT_CONNECTION_STATE);
        setQuitRequested(false);
        setQuitDialogOpen(false);
    };

    useEffect(() => {
        if (initialGameData) {
            initializeGameFromPayload(initialGameData);
            reconnectRequestSentRef.current = false;
            // Clear location state to prevent re-initialization on back nav etc
            navigate(location.pathname + location.search, { replace: true, state: {} });
        }
    }, [initialGameData, location.pathname, location.search, navigate]);

    useEffect(() => {
        return () => {
            if (reconnectRedirectTimerRef.current !== null) {
                window.clearTimeout(reconnectRedirectTimerRef.current);
                reconnectRedirectTimerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            return;
        }
        if (initialGameData) {
            return;
        }
        if (reconnectRequestSocketRef.current !== socket) {
            reconnectRequestSocketRef.current = socket;
            reconnectRequestSentRef.current = false;
        }
        if (gameState === "in_game") {
            return;
        }
        if (reconnectRequestSentRef.current) {
            return;
        }

        reconnectRequestSentRef.current = true;
        setStatusMessage("Reconnecting to active match...");
        socket.send(JSON.stringify({
            type: RECONNECT_GAME
        }));
    }, [socket, gameState, initialGameData]);

    useEffect(() => {
        latestGameStateRef.current = gameState;
        latestSocketRef.current = socket;
    }, [gameState, socket]);

    useEffect(() => {
        return () => {
            const activeSocket = latestSocketRef.current;
            if (
                latestGameStateRef.current === "in_game" &&
                activeSocket &&
                activeSocket.readyState === WebSocket.OPEN &&
                !leaveGameViewSentRef.current
            ) {
                leaveGameViewSentRef.current = true;
                activeSocket.send(JSON.stringify({
                    type: LEAVE_GAME_VIEW
                }));
            }
        };
    }, []);

    const parseInitMoveHistory = (value: unknown): MoveHistoryEntry[] => {
        if (!Array.isArray(value)) {
            return [];
        }

        const parsedMoves: InitMoveHistoryEntry[] = value.flatMap((entry) => {
            if (typeof entry !== "object" || entry === null) {
                return [];
            }

            const maybeEntry = entry as { ply?: unknown; san?: unknown };
            if (typeof maybeEntry.ply !== "number" || !Number.isFinite(maybeEntry.ply) || maybeEntry.ply < 1) {
                return [];
            }
            if (typeof maybeEntry.san !== "string" || maybeEntry.san.length === 0) {
                return [];
            }

            return [{
                ply: Math.floor(maybeEntry.ply),
                san: maybeEntry.san
            }];
        });

        parsedMoves.sort((a, b) => a.ply - b.ply);

        return parsedMoves.map((entry) => ({
            ply: entry.ply,
            san: entry.san,
            color: entry.ply % 2 === 1 ? "white" : "black",
            moveNumber: Math.ceil(entry.ply / 2)
        }));
    };

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
            if (reason === "storage_sync_failed") {
                return "Move could not be saved right now. Please try again.";
            }
            return "Move rejected: game not found.";
        };

        const getRematchDeclinedMessage = (reason: string) => {
            if (reason === "opponent_disconnected") {
                return "Rematch unavailable. Opponent disconnected.";
            }
            if (reason === "failed_to_start") {
                return "Rematch could not start. Please try again.";
            }
            if (reason === "expired") {
                return "Rematch request expired.";
            }
            return "Rematch declined by opponent.";
        };

        const getActionRejectedMessage = (reason: string) => {
            if (reason === "not_queue_owner") {
                return "Matchmaking is owned by another tab.";
            }
            if (reason === "not_in_matchmaking") {
                return "You are not currently in matchmaking.";
            }
            if (reason === "not_in_game") {
                return "You are not currently in a game.";
            }
            if (reason === "not_game_participant") {
                return "This tab is not the active participant for that game.";
            }
            if (reason === "game_not_concluded") {
                return "Rematch is only available after the game ends.";
            }
            return "Action rejected by server.";
        };

        socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            console.log(message);

            switch (message.type) {
                case INIT_GAME:
                    if (message.payload) {
                        initializeGameFromPayload(message.payload);
                    }
                    break;
                case WAITING_FOR_OPPONENT:
                    // If we're on the Game page and it says waiting, we should probably redirect home
                    // so the user can use the dashboard matchmaking modal.
                    navigate("/", { replace: true });
                    break;
                case ALREADY_WAITING:
                    navigate("/", { replace: true });
                    break;
                case ALREADY_IN_GAME:
                    // Handled by the server sending INIT_GAME payload automatically for reattaches
                    break;
                case MATCHMAKING_CANCELLED:
                    setGameState("idle");
                    setStatusMessage("Matchmaking cancelled.");
                    setPlayerColor(null);
                    setCurrentTurn(null);
                    setCheckedKingSquare(null);
                    setLastMove(null);
                    setMyPlayerName("User 1");
                    setOpponentPlayerName("User 2");
                    setPendingPromotion(DEFAULT_PENDING_PROMOTION);
                    setOpponentConnectionState(DEFAULT_OPPONENT_CONNECTION_STATE);
                    navigate("/", { replace: true });
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
                    setQuitRequested(false);
                    break;
                case INVALID_MESSAGE:
                    setStatusMessage("Received an invalid message response. Please retry.");
                    setPendingPromotion(DEFAULT_PENDING_PROMOTION);
                    break;
                case STORAGE_SYNC_FAILED:
                    setStatusMessage(
                        message.payload?.reason === "game_sync_failed"
                            ? "Game result could not be saved right now. Please wait and try again."
                            : "Move could not be saved right now. Please try again."
                    );
                    setPendingPromotion(DEFAULT_PENDING_PROMOTION);
                    break;
                case ACTION_REJECTED:
                    if (message.payload?.reason === "not_in_game" && gameState !== "in_game") {
                        setStatusMessage("No active match found. Returning to dashboard...");
                        if (reconnectRedirectTimerRef.current !== null) {
                            window.clearTimeout(reconnectRedirectTimerRef.current);
                        }
                        reconnectRedirectTimerRef.current = window.setTimeout(() => {
                            navigate("/", { replace: true, state: { reconnectExpired: true } });
                        }, 900);
                        break;
                    }
                    setStatusMessage(getActionRejectedMessage(message.payload?.reason));
                    setPendingPromotion(DEFAULT_PENDING_PROMOTION);
                    setQuitRequested(false);
                    setQuitDialogOpen(false);
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
                        message.payload?.reason === "resigned" ||
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
                    setOpponentConnectionState(DEFAULT_OPPONENT_CONNECTION_STATE);
                    setQuitRequested(false);
                    setQuitDialogOpen(false);
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
                case PLAYER_CONNECTION_STATE: {
                    const state = message.payload?.state;
                    const graceMs = typeof message.payload?.graceMs === "number" ? message.payload.graceMs : 20_000;
                    if (state === "reconnecting") {
                        setOpponentConnectionState({
                            isReconnecting: true,
                            reconnectDeadlineMs: Date.now() + Math.max(1_000, graceMs),
                            isReconnected: false
                        });
                    } else if (state === "reconnected") {
                        setOpponentConnectionState({
                            isReconnecting: false,
                            reconnectDeadlineMs: null,
                            isReconnected: true
                        });
                    }
                    break;
                }
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
        scrollToBottom(mobileHistoryRef.current);
    }, [moveHistory]);

    useEffect(() => {
        if (!opponentConnectionState.isReconnecting) {
            return;
        }
        setConnectionNowMs(Date.now());
        const timer = window.setInterval(() => {
            setConnectionNowMs(Date.now());
        }, 1000);
        return () => {
            window.clearInterval(timer);
        };
    }, [opponentConnectionState.isReconnecting, opponentConnectionState.reconnectDeadlineMs]);

    useEffect(() => {
        if (!quitDialogOpen || quitRequested) {
            return;
        }
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setQuitDialogOpen(false);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [quitDialogOpen, quitRequested]);

    useEffect(() => {
        if (!opponentConnectionState.isReconnected) {
            return;
        }

        const timer = window.setTimeout(() => {
            setOpponentConnectionState((previous) => {
                if (!previous.isReconnected) {
                    return previous;
                }

                return {
                    ...previous,
                    isReconnected: false
                };
            });
        }, RECONNECTED_BANNER_DURATION_MS);

        return () => {
            window.clearTimeout(timer);
        };
    }, [opponentConnectionState.isReconnected]);

    if (roomCode) {
        return (
            <main className="min-h-screen bg-[#262522] flex items-center justify-center p-4">
                <section className="w-full max-w-xl bg-[#2f2e2b] border border-[#45433f] rounded-xl p-8 text-center text-white space-y-4 shadow-lg">
                    <h1 className="text-3xl font-bold">Private Rooms Unavailable</h1>
                    <p className="text-gray-300">
                        Room codes and direct invites are temporarily offline while this feature is being rebuilt.
                    </p>
                    <p className="text-sm text-gray-400">
                        You can still use public matchmaking or play against the bot from the dashboard.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                            onClick={() => navigate("/game", { replace: true })}
                            className="w-full bg-[#b58863] hover:bg-[#a0764b] text-white font-bold text-lg px-6 py-4 rounded-xl shadow transition-colors"
                        >
                            Open Public Match
                        </button>
                        <button
                            onClick={() => navigate("/", { replace: true })}
                            className="w-full bg-[#4a4a48] hover:bg-[#5a5a58] text-white font-bold text-lg px-6 py-4 rounded-xl shadow transition-colors"
                        >
                            Back Home
                        </button>
                    </div>
                </section>
            </main>
        );
    }

    if (!socket) {
        return <div>Connecting...</div>;
    }

    const getConclusionTitle = () => {
        if (matchConclusion.reason === "resigned") {
            return "Resignation";
        }
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
        if (matchConclusion.reason === "resigned") {
            return matchConclusion.isWinner ? "Opponent resigned." : "You resigned.";
        }
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
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-20 py-12">
                    <div className="relative">
                        <svg viewBox="0 0 24 24" className="w-12 h-12 fill-none stroke-[#e9c176] stroke-1" aria-hidden="true">
                            <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="absolute inset-0 blur-xl bg-[#e9c176]/10" />
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">No moves recorded</p>
                </div>
            );
        }
        return (
            <div ref={scrollRef} className={`${maxHeightClass} overflow-y-auto custom-scrollbar pr-1`}>
                <div className="space-y-1">
                    {/* Header Labels */}
                    <div className="grid grid-cols-[36px_1fr_1fr] text-[9px] font-black uppercase tracking-[0.15em] text-[#444748] mb-2 px-1">
                        <div className="text-center">#</div>
                        <div className="text-center">White</div>
                        <div className="text-center">Black</div>
                    </div>

                    {rows.map((row) => (
                        <div
                            key={row.moveNumber}
                            className="grid grid-cols-[44px_1fr_1fr] items-stretch group border-b border-white/[0.02] last:border-0"
                        >
                            {/* Move Number Column - Ticker Style */}
                            <div className="flex items-center justify-center py-2.5 border-r border-white/[0.05] bg-black/20">
                                <span className="font-mono text-[9px] font-black text-[#3f3f46] group-hover:text-[#e9c176]/40 transition-colors">
                                    {row.moveNumber.toString().padStart(2, '0')}
                                </span>
                            </div>

                            {/* White Move */}
                            <div className="relative px-1 py-1 flex items-center justify-center">
                                {row.white && (
                                    <div className="relative w-full h-full flex items-center justify-center">
                                        {row.white.ply === latestPly && (
                                            <motion.div 
                                                layoutId="online-active-pill"
                                                className="absolute inset-0 z-0 bg-[#e9c176]/10 border border-[#e9c176]/20 rounded-lg shadow-[0_0_15px_rgba(233,193,118,0.05)]"
                                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                            />
                                        )}
                                        <span className={`relative z-10 text-[13px] font-bold tracking-tight transition-colors duration-300 ${
                                            row.white.ply === latestPly 
                                                ? "text-[#e9c176]" 
                                                : "text-[#fff6e9]/80 group-hover:text-[#fff6e9]"
                                        }`}>
                                            {row.white.san}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Black Move */}
                            <div className="relative px-1 py-1 flex items-center justify-center border-l border-white/[0.05]">
                                {row.black ? (
                                    <div className="relative w-full h-full flex items-center justify-center">
                                        {row.black.ply === latestPly && (
                                            <motion.div 
                                                layoutId="online-active-pill"
                                                className="absolute inset-0 z-0 bg-[#e9c176]/10 border border-[#e9c176]/20 rounded-lg shadow-[0_0_15px_rgba(233,193,118,0.05)]"
                                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                            />
                                        )}
                                        <span className={`relative z-10 text-[13px] font-bold tracking-tight transition-colors duration-300 ${
                                            row.black.ply === latestPly 
                                                ? "text-[#e9c176]" 
                                                : "text-[#94a3b8]/80 group-hover:text-[#cbd5e1]"
                                        }`}>
                                            {row.black.san}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="w-4 h-0.5 bg-white/5 rounded-full" />
                                )}
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

    const promotionChoices = (["q", "r", "b", "n"] as PromotionPiece[])
        .filter((piece) => pendingPromotion.availablePromotions.includes(piece))
        .map((piece) => ({
            id: piece,
            label: getPromotionLabel(piece),
            imageSrc: `/Pieces/${playerColor === "black" ? piece : `w${piece}`}.png`
        }));

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

    const handleQuitGame = () => {
        if (matchConclusion.isOpen || quitRequested) {
            return;
        }
        setQuitDialogOpen(true);
    };

    const handleConfirmQuit = () => {
        if (socket.readyState !== WebSocket.OPEN) {
            setStatusMessage("Connection issue. Try again.");
            setQuitDialogOpen(false);
            return;
        }
        setQuitRequested(true);
        setQuitDialogOpen(false);
        socket.send(JSON.stringify({
            type: QUIT_GAME
        }));
    };

    const handleCancelQuit = () => {
        if (quitRequested) {
            return;
        }
        setQuitDialogOpen(false);
    };

    const handleGoHome = () => {
        setPendingPromotion(DEFAULT_PENDING_PROMOTION);
        if (socket && socket.readyState === WebSocket.OPEN && !leaveGameViewSentRef.current) {
            leaveGameViewSentRef.current = true;
            socket.send(JSON.stringify({
                type: LEAVE_GAME_VIEW
            }));
        }
        navigate("/", { replace: true });
    };

    if (gameState !== "in_game") {
        return <LoadingState message="Connecting..." subtitle={statusMessage || "Setting up the board"} />;
    }

    const getOpponentSubtitle = () => {
        if (opponentConnectionState.isReconnecting) {
            const deadline = opponentConnectionState.reconnectDeadlineMs ?? connectionNowMs;
            const secondsRemaining = Math.max(0, Math.ceil((deadline - connectionNowMs) / 1000));
            return `Reconnecting... (${secondsRemaining}s)`;
        }
        if (opponentConnectionState.isReconnected) {
            return "Reconnected";
        }
        return playerColor === "white" ? "Black" : "White";
    };

    const getOpponentStatusIndicator = () => {
        if (opponentConnectionState.isReconnecting) {
            return <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-amber-500 animate-pulse" />;
        }
        if (opponentConnectionState.isReconnected) {
            return <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-green-500" />;
        }
        return currentTurn === (playerColor === "white" ? "b" : "w") ? (
            <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-green-500 animate-pulse" />
        ) : null;
    };

    return (
        <main className="h-dvh bg-[#262522] flex flex-col relative overflow-y-auto lg:overflow-hidden pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <div className="w-full flex-1 flex flex-col lg:flex-row gap-2 lg:gap-4 p-2 lg:p-4 min-h-0">
                <section className="flex-1 flex items-start lg:items-center justify-center min-h-0">
                    <div className="w-full max-w-[calc(100dvh-11rem)] sm:max-w-[calc(100dvh-12rem)] lg:max-w-[calc(100dvh-10rem)] flex flex-col gap-1.5 sm:gap-2">
                    <div className="w-full flex justify-end lg:hidden">
                        <button
                            onClick={handleQuitGame}
                            disabled={quitRequested || matchConclusion.isOpen}
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${quitRequested || matchConclusion.isOpen ? "border-[#5b5042] bg-[#40372c] text-[#d5cab8] cursor-not-allowed" : "border-[#8f4a4a] bg-[#5a3030] text-[#f8dedd] hover:bg-[#6a3737]"}`}
                            aria-label="Quit match"
                            title="Quit match"
                        >
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2" aria-hidden="true">
                                <path d="M14 7l5 5-5 5" />
                                <path d="M19 12H9" />
                                <path d="M11 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h6" />
                            </svg>
                        </button>
                    </div>
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
                            <p className={`text-xs truncate ${opponentConnectionState.isReconnecting ? "text-amber-400" : opponentConnectionState.isReconnected ? "text-green-400" : "text-gray-400"}`}>{getOpponentSubtitle()}</p>
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                            {getOpponentStatusIndicator()}
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

                <div className="lg:hidden w-full max-w-[calc(100dvh-11rem)] sm:max-w-[calc(100dvh-12rem)] mx-auto flex flex-col gap-2">
                    {statusMessage && (
                        <div className="rounded-xl border border-[#45433f] bg-[#2f2e2b] text-gray-200 px-4 py-3 text-sm">
                            {statusMessage}
                        </div>
                    )}
                    <section className="rounded-xl border border-[#45433f] bg-[#2f2e2b] text-white p-3">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-base font-bold">Move History</h3>
                            <span className="text-xs px-2 py-1 rounded-full bg-[#3a3936] text-gray-300">
                                {moveHistory.length} moves
                            </span>
                        </div>
                        <div className="grid grid-cols-[36px_minmax(0,1fr)_minmax(0,1fr)] gap-2 px-2 pb-2 text-[11px] uppercase tracking-wide text-gray-400">
                            <div>#</div>
                            <div className="text-center">White</div>
                            <div className="text-center">Black</div>
                        </div>
                        {renderMoveHistoryTable(mobileHistoryRef, "max-h-56")}
                    </section>
                </div>

                <aside className="hidden lg:flex w-[340px] xl:w-[380px] shrink-0 flex-col gap-4 self-stretch">
                    <button
                        onClick={handleQuitGame}
                        disabled={quitRequested || matchConclusion.isOpen}
                        className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${quitRequested || matchConclusion.isOpen ? "border-[#5b5042] bg-[#40372c] text-[#d5cab8] cursor-not-allowed" : "border-[#8f4a4a] bg-[#5a3030] text-[#f8dedd] hover:bg-[#6a3737]"}`}
                    >
                        {quitRequested ? "Quitting..." : "Quit Match"}
                    </button>
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

            <PromotionModal
                isOpen={pendingPromotion.isOpen && !matchConclusion.isOpen}
                choices={promotionChoices}
                onSelect={(choiceId) => handleSelectPromotion(choiceId as PromotionPiece)}
                onCancel={handleCancelPromotion}
            />

            {quitDialogOpen && !matchConclusion.isOpen && (
                <div
                    className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[55]"
                    onClick={() => {
                        if (!quitRequested) {
                            setQuitDialogOpen(false);
                        }
                    }}
                >
                    <section
                        className="w-full max-w-md bg-[#2f2e2b] border border-[#5f5b53] rounded-2xl p-6 text-center text-white shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <h2 className="text-2xl font-extrabold mb-2">Quit Match?</h2>
                        <p className="text-sm text-gray-300 mb-6">
                            If you quit now, this game will be recorded as a resignation.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <button
                                onClick={handleCancelQuit}
                                disabled={quitRequested}
                                className="flex-1 bg-[#3c3b38] hover:bg-[#4a4945] text-white font-bold px-5 py-3 rounded-xl transition-colors"
                            >
                                Keep Playing
                            </button>
                            <button
                                onClick={handleConfirmQuit}
                                disabled={quitRequested}
                                className={`flex-1 font-bold px-5 py-3 rounded-xl transition-colors ${quitRequested ? "bg-[#6e614f] text-gray-200 cursor-not-allowed" : "bg-[#8f4a4a] hover:bg-[#9f5555] text-white"}`}
                            >
                                {quitRequested ? "Quitting..." : "Confirm Quit"}
                            </button>
                        </div>
                    </section>
                </div>
            )}

            <MatchConclusionModal
                isOpen={matchConclusion.isOpen}
                title={getConclusionTitle()}
                subtitle={getConclusionSubtitle()}
                extraContent={matchConclusion.rematchMessage ? <p className="text-sm text-gray-300">{matchConclusion.rematchMessage}</p> : undefined}
                actions={[
                    {
                        label: getRematchButtonLabel(),
                        onClick: handleRematchRequest,
                        disabled: isRematchButtonDisabled,
                        className: `flex-1 font-bold px-5 py-3 rounded-xl transition-colors ${isRematchButtonDisabled ? "bg-[#6e614f] text-gray-200 cursor-not-allowed" : "bg-[#b58863] hover:bg-[#a0764b] text-white"}`
                    },
                    {
                        label: "Home",
                        onClick: handleGoHome,
                        className: "flex-1 bg-[#3c3b38] hover:bg-[#4a4945] text-white font-bold px-5 py-3 rounded-xl transition-colors"
                    }
                ]}
            />
        </main>
    );
}

export default Game;
