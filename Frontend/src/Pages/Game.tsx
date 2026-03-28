import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { useNavigate, useSearchParams, useLocation } from "react-router";
import { motion } from "framer-motion";
import ChessBoard from "../components/ChessBoard";
import MatchConclusionModal from "../components/game/MatchConclusionModal";
import PromotionModal from "../components/game/PromotionModal";
import useSocket from "../hooks/useSocket";
import LoadingState from "../components/LoadingState";
import AppSidebar from "../components/dashboard/AppSidebar";
import { 
  History, 
  Swords, 
  User,
  LogOut
} from "lucide-react";

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
export const CREATE_ROOM = "create_room";
export const JOIN_ROOM = "join_room";
export const CANCEL_ROOM = "cancel_room";
export const ROOM_CREATED = "room_created";
export const ROOM_JOIN_FAILED = "room_join_failed";

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
    const { socket, connectionState, connectionVersion } = useSocket();
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
    const reconnectRequestSentRef = useRef(false);
    const reconnectRedirectTimerRef = useRef<number | null>(null);
    const reconnectRequestSocketRef = useRef<WebSocket | null>(null);
    const reconnectRequestConnectionVersionRef = useRef(0);
    const leaveGameViewSentRef = useRef(false);
    const latestGameStateRef = useRef<GameState>("idle");
    const latestSocketRef = useRef<WebSocket | null>(null);
    const attachedSocketRef = useRef<WebSocket | null>(null);
    const attachedConnectionVersionRef = useRef(0);

    const initializeGameFromPayload = (payload: any) => {
        attachedSocketRef.current = socket;
        attachedConnectionVersionRef.current = connectionVersion;
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
            leaveGameViewSentRef.current = false;
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
        if (!roomCode) {
            return;
        }
        navigate("/", {
            replace: true,
            state: {
                openMatchmaking: true,
                prefillRoomCode: roomCode,
                autoJoinRoom: true,
            },
        });
    }, [roomCode, navigate]);

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
                try {
                    activeSocket.send(JSON.stringify({
                        type: LEAVE_GAME_VIEW
                    }));
                } catch {
                    // socket may close during teardown
                }
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

        const handleMessage = (event: MessageEvent) => {
            const message = JSON.parse(event.data);
            console.log(message);

            switch (message.type) {
                case INIT_GAME:
                    if (message.payload) {
                        initializeGameFromPayload(message.payload);
                    }
                    break;
                case WAITING_FOR_OPPONENT:
                    navigate("/", { replace: true });
                    break;
                case ALREADY_WAITING:
                    navigate("/", { replace: true });
                    break;
                case ALREADY_IN_GAME:
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
                    if (message.payload?.reason === "already_in_game") {
                        setStatusMessage("You are already in a game.");
                        break;
                    }
                    if (message.payload?.reason === "already_waiting") {
                        setStatusMessage("Finish or cancel your current queue first.");
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

        socket.addEventListener("message", handleMessage);

        return () => {
            socket.removeEventListener("message", handleMessage);
        };
    }, [socket, navigate, playerColor, gameState, connectionVersion]);

    useEffect(() => {
        if (!socket) {
            reconnectRequestSocketRef.current = null;
            reconnectRequestConnectionVersionRef.current = 0;
            reconnectRequestSentRef.current = false;
            return;
        }

        if (
            reconnectRequestSocketRef.current !== socket ||
            reconnectRequestConnectionVersionRef.current !== connectionVersion
        ) {
            reconnectRequestSocketRef.current = socket;
            reconnectRequestConnectionVersionRef.current = connectionVersion;
            reconnectRequestSentRef.current = false;
        }
    }, [socket, connectionVersion]);

    useEffect(() => {
        if (!socket || connectionState !== "open" || socket.readyState !== WebSocket.OPEN) {
            return;
        }
        if (roomCode) {
            return;
        }
        if (initialGameData) {
            return;
        }

        const isCurrentConnectionAttached =
            attachedSocketRef.current === socket &&
            attachedConnectionVersionRef.current === connectionVersion;

        if (gameState === "in_game" && isCurrentConnectionAttached) {
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
    }, [socket, connectionState, connectionVersion, gameState, initialGameData, roomCode]);

    useEffect(() => {
        const scrollToBottom = (element: HTMLDivElement | null) => {
            if (!element) {
                return;
            }
            element.scrollTop = element.scrollHeight;
        };
        scrollToBottom(desktopHistoryRef.current);
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

    const getOpponentSubtitle = () => {
        if (opponentConnectionState.isReconnecting) {
            const deadline = opponentConnectionState.reconnectDeadlineMs ?? connectionNowMs;
            const secondsRemaining = Math.max(0, Math.ceil((deadline - connectionNowMs) / 1000));
            return `Reconnecting... (${secondsRemaining}s)`;
        }
        if (opponentConnectionState.isReconnected) {
            return "Reconnected";
        }
        return playerColor === "white" ? "Playing as black" : "Playing as white";
    };

    const handleMoveRequest = (move: { from: Square; to: Square; promotion?: PromotionPiece }) => {
        if (!socket || connectionState !== "open" || socket.readyState !== WebSocket.OPEN) {
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
        if (socket && connectionState === "open" && socket.readyState === WebSocket.OPEN) {
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
        if (!socket || connectionState !== "open" || socket.readyState !== WebSocket.OPEN) {
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
        if (socket && connectionState === "open" && socket.readyState === WebSocket.OPEN && !leaveGameViewSentRef.current) {
            leaveGameViewSentRef.current = true;
            try {
                socket.send(JSON.stringify({
                    type: LEAVE_GAME_VIEW
                }));
            } catch {
                // socket may close during navigation
            }
        }
        navigate("/", { replace: true });
    };

    const isRematchButtonDisabled = matchConclusion.rematchState === "requested";
    const latestPly = moveHistory.length ? moveHistory[moveHistory.length - 1].ply : null;

    const getMoveHistoryRows = useMemo(() => {
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
    }, [moveHistory]);

    if (roomCode) {
        return <LoadingState message="Opening room..." subtitle="Redirecting to dashboard" />;
    }

    if (!socket) {
        return <div>Connecting...</div>;
    }

    if (gameState !== "in_game") {
        return <LoadingState message="Connecting..." subtitle={statusMessage || "Setting up the board"} />;
    }

    const isOpponentTurn = currentTurn === (playerColor === "white" ? "b" : "w");
    const isMyTurn = currentTurn === (playerColor === "white" ? "w" : "b");

    return (
        <div className="min-h-screen bot-page flex flex-col md:flex-row text-[#e5e2e3]">
            <AppSidebar />
            <div className="bot-page__mesh" aria-hidden />

            <main className="flex-1 relative z-10 h-screen overflow-y-auto px-3 pt-16 pb-4 sm:px-4 md:px-8 md:py-6 lg:px-12 lg:py-8 xl:overflow-hidden flex flex-col">
                <div className="max-w-7xl mx-auto w-full xl:flex-1 flex flex-col xl:min-h-0">
                    <div className="relative xl:flex-1 xl:min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-4 lg:gap-6 xl:gap-8 items-start xl:items-stretch py-2 animate-in fade-in duration-500">
                        {/* Left Column: Board */}
                        <div className="xl:col-span-8 w-full max-w-2xl xl:max-w-none mx-auto flex flex-col gap-3 sm:gap-4 xl:min-h-0">
                            {/* Opponent Profile Card */}
                            <div className="glass-obsidian border border-white/5 rounded-xl p-2 flex items-center justify-between gap-2 shrink-0">
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0 border border-white/10">
                                        <User className={`w-4 h-4 ${playerColor === "white" ? "text-gray-400" : "text-white"}`} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-bold text-sm truncate">{opponentPlayerName}</p>
                                        <p className={`text-[9px] ${opponentConnectionState.isReconnecting ? "text-amber-400" : opponentConnectionState.isReconnected ? "text-green-400" : "text-[#8e9192]"}`}>
                                            {getOpponentSubtitle()}
                                        </p>
                                    </div>
                                </div>
                                <div className={`flex items-center gap-2 px-2 py-0.5 rounded-full border ${isOpponentTurn ? 'bg-[#e9c176]/10 border-[#e9c176]/20 text-[#e9c176]' : 'bg-white/5 border-white/10 text-[#8e9192]'}`}>
                                    <div className={`w-1.5 h-1.5 rounded-full ${isOpponentTurn ? 'bg-[#e9c176] animate-pulse' : 'bg-slate-600'}`} />
                                    <span className="text-[8px] font-bold uppercase tracking-[0.18em] whitespace-nowrap">{isOpponentTurn ? 'Their Turn' : 'Waiting'}</span>
                                </div>
                            </div>

                            {/* Board Container */}
                            <div className="flex-none xl:flex-1 xl:min-h-0 flex items-center justify-center">
                                <div className="w-full aspect-square max-w-[min(100%,calc(100svh-12rem))] sm:max-w-[min(100%,calc(100svh-24rem))] md:max-w-[min(100%,calc(100svh-22rem))] xl:max-w-[min(100%,calc(100svh-18rem))] glass-obsidian border border-white/10 p-1 sm:p-1.5 md:p-2 rounded-2xl shadow-2xl relative">
                                    <div className="absolute inset-0 bg-gradient-to-br from-[#e9c176]/5 to-transparent pointer-events-none rounded-2xl" />
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
                            </div>

                            {/* Player Profile Card */}
                            <div className="glass-obsidian border border-white/5 rounded-xl p-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-gradient-gold flex items-center justify-center shrink-0">
                                        <span className="text-[#00184a] font-black text-sm">{myPlayerName.charAt(0)}</span>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-bold text-sm truncate">{myPlayerName}</p>
                                        <p className="text-[9px] text-[#8e9192]">Playing as {playerColor}</p>
                                    </div>
                                </div>
                                <div className={`ml-auto flex items-center gap-2 px-2 py-0.5 rounded-full border ${isMyTurn ? 'bg-[#e9c176]/10 border-[#e9c176]/20 text-[#e9c176]' : 'bg-white/5 border-white/10 text-[#8e9192]'}`}>
                                    <div className={`w-1.5 h-1.5 rounded-full ${isMyTurn ? 'bg-[#e9c176] animate-pulse' : 'bg-slate-600'}`} />
                                    <span className="text-[8px] font-bold uppercase tracking-[0.18em] whitespace-nowrap">{isMyTurn ? 'Your Turn' : 'Waiting'}</span>
                                </div>
                            </div>
                        </div>

                        {/* Right Column: History */}
                        <div className="xl:col-span-4 w-full max-w-2xl xl:max-w-none mx-auto xl:min-h-0 flex flex-col gap-3 sm:gap-4">
                            {/* Game Action Controls */}
                            <div className="fixed sm:absolute xl:static top-4 right-4 sm:top-0 sm:right-0 z-[40] xl:z-auto flex xl:justify-end">
                                <div className="glass-obsidian border border-white/10 rounded-2xl p-1.5 flex items-center gap-1.5 shadow-2xl shadow-black/40 backdrop-blur-xl">
                                    <button
                                        onClick={handleQuitGame}
                                        disabled={quitRequested || matchConclusion.isOpen}
                                        className={`inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border transition-all hover:scale-105 active:scale-95 ${
                                            quitRequested || matchConclusion.isOpen
                                                ? "border-[#5b5042]/50 bg-[#40372c]/80 text-[#d5cab8] cursor-not-allowed opacity-50"
                                                : "border-[#8f4a4a]/50 bg-[#5a3030]/80 text-[#f8dedd] hover:bg-[#6a3737]"
                                        }`}
                                        aria-label="Quit match"
                                        title="Quit match"
                                    >
                                        <LogOut className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 flex-1 xl:min-h-0">
                                <div className="glass-obsidian border border-white/5 rounded-2xl p-3 sm:p-4 flex flex-col min-h-[14rem] sm:min-h-[18rem] xl:min-h-0 xl:h-full overflow-visible xl:overflow-hidden">
                                    <div className="flex items-center justify-between mb-3 sm:mb-4 shrink-0 gap-2">
                                        <h3 className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.18em] sm:tracking-[0.2em] text-[#444748] flex items-center gap-2 min-w-0">
                                            <History className="w-3.5 h-3.5" />
                                            <span className="truncate">Move History</span>
                                        </h3>
                                        <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/5 text-[9px] font-bold text-[#8e9192] whitespace-nowrap">
                                            {moveHistory.length} PLY
                                        </span>
                                    </div>

                                    <div className="overflow-visible xl:flex-1 xl:overflow-y-auto xl:custom-scrollbar xl:pr-1" ref={desktopHistoryRef}>
                                        {getMoveHistoryRows.length === 0 ? (
                                            <div className="min-h-[10rem] xl:h-full flex flex-col items-center justify-center text-center space-y-4 opacity-20 py-10 sm:py-12">
                                                <div className="relative">
                                                    <Swords className="w-10 h-10 sm:w-12 sm:h-12" />
                                                    <div className="absolute inset-0 blur-xl bg-[#e9c176]/20" />
                                                </div>
                                                <p className="text-[10px] font-bold uppercase tracking-widest">No moves recorded</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-1">
                                                {/* Header Labels */}
                                                <div className="grid grid-cols-[40px_1fr_1fr] text-[9px] font-black uppercase tracking-[0.15em] text-[#444748] mb-2 px-1">
                                                    <div className="text-center">#</div>
                                                    <div className="text-center">White</div>
                                                    <div className="text-center">Black</div>
                                                </div>

                                                {getMoveHistoryRows.map((row) => (
                                                    <div 
                                                        key={row.moveNumber} 
                                                        className="grid grid-cols-[44px_1fr_1fr] items-stretch group border-b border-white/[0.02] last:border-0"
                                                    >
                                                        {/* Move Number Column */}
                                                        <div className="flex items-center justify-center py-3 border-r border-white/[0.05] bg-black/20">
                                                            <span className="font-mono text-[9px] font-black text-[#3f3f46] group-hover:text-[#e9c176]/40 transition-colors">
                                                                {row.moveNumber.toString().padStart(2, '0')}
                                                            </span>
                                                        </div>

                                                        {/* White Move */}
                                                        <div className="relative px-1 py-1.5 flex items-center justify-center">
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
                                                        <div className="relative px-1 py-1.5 flex items-center justify-center border-l border-white/[0.05]">
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
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

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
                        className="w-full max-w-md glass-obsidian border border-[#e9c176]/20 rounded-2xl p-6 text-center text-white shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <h2 className="text-2xl font-extrabold mb-2 text-[#e9c176]">Quit Match?</h2>
                        <p className="text-sm text-[#8e9192] mb-6">
                            If you quit now, this game will be recorded as a resignation.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <button
                                onClick={handleCancelQuit}
                                disabled={quitRequested}
                                className="flex-1 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-bold px-5 py-3 rounded-xl transition-colors"
                            >
                                Keep Playing
                            </button>
                            <button
                                onClick={handleConfirmQuit}
                                disabled={quitRequested}
                                className={`flex-1 font-bold px-5 py-3 rounded-xl transition-all active:scale-95 ${
                                    quitRequested 
                                        ? "bg-red-500/20 text-red-300/50 cursor-not-allowed" 
                                        : "bg-red-500/80 hover:bg-red-600 text-white shadow-lg shadow-red-500/20"
                                }`}
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
                extraContent={matchConclusion.rematchMessage ? <p className="text-sm text-[#e9c176] font-medium">{matchConclusion.rematchMessage}</p> : undefined}
                actions={[
                    {
                        label: getRematchButtonLabel(),
                        onClick: handleRematchRequest,
                        disabled: isRematchButtonDisabled,
                        className: `flex-1 font-bold px-5 py-3 rounded-xl transition-all active:scale-95 ${
                            isRematchButtonDisabled 
                                ? "bg-[#e9c176]/20 text-[#e9c176]/50 cursor-not-allowed" 
                                : "bg-gradient-gold text-[#00184a] hover:scale-[1.02] shadow-lg shadow-[#e9c176]/10"
                        }`
                    },
                    {
                        label: "Home",
                        onClick: handleGoHome,
                        className: "flex-1 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-bold px-5 py-3 rounded-xl transition-all active:scale-95"
                    }
                ]}
            />
        </div>
    );
}

export default Game;
