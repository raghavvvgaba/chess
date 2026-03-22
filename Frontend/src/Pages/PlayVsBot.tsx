import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { useNavigate } from "react-router";
import ChessBoard from "../components/ChessBoard";
import MatchConclusionModal from "../components/game/MatchConclusionModal";
import PromotionModal from "../components/game/PromotionModal";
import { authClient } from "../lib/auth-client";
import {
  BOT_DIFFICULTY_PRESETS,
  type BotDifficulty,
  StockfishAdapter,
} from "../lib/stockfish";

type SetupColor = "white" | "black" | "random";
type ActiveColor = "white" | "black";
type Turn = "w" | "b" | null;
type LastMove = { from: Square; to: Square } | null;
type PromotionPiece = "q" | "r" | "b" | "n";
type MoveColor = "white" | "black";
type GamePhase = "setup" | "playing" | "game_over";

type PendingPromotion = {
  isOpen: boolean;
  from: Square | null;
  to: Square | null;
  availablePromotions: PromotionPiece[];
};

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
  title: string;
  subtitle: string;
  detail: string;
};

const DEFAULT_PENDING_PROMOTION: PendingPromotion = {
  isOpen: false,
  from: null,
  to: null,
  availablePromotions: [],
};

const DEFAULT_MATCH_CONCLUSION: MatchConclusion = {
  isOpen: false,
  title: "",
  subtitle: "",
  detail: "",
};

const COLOR_OPTIONS: { value: SetupColor; label: string; description: string }[] = [
  {
    value: "white",
    label: "White",
    description: "You move first and set the tempo.",
  },
  {
    value: "black",
    label: "Black",
    description: "Let the bot open and play the counterpunch.",
  },
  {
    value: "random",
    label: "Random",
    description: "Shuffle sides for a faster start.",
  },
];

const DIFFICULTY_OPTIONS = ["easy", "medium", "hard"] as const satisfies BotDifficulty[];

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

const getPromotionLabel = (piece: PromotionPiece) => {
  if (piece === "q") return "Queen";
  if (piece === "r") return "Rook";
  if (piece === "b") return "Bishop";
  return "Knight";
};

const resolveHumanColor = (selection: SetupColor): ActiveColor => {
  if (selection === "random") {
    return Math.random() < 0.5 ? "white" : "black";
  }
  return selection;
};

const parseUciMove = (uciMove: string) => {
  if (uciMove === "(none)" || uciMove.length < 4) {
    return null;
  }

  const promotion = uciMove[4];
  const normalizedPromotion: PromotionPiece | undefined =
    promotion === "q" || promotion === "r" || promotion === "b" || promotion === "n"
      ? promotion
      : undefined;

  return {
    from: uciMove.slice(0, 2) as Square,
    to: uciMove.slice(2, 4) as Square,
    promotion: normalizedPromotion,
  };
};

const getMatchConclusionFromChess = (chess: Chess, humanColor: ActiveColor): MatchConclusion | null => {
  if (!chess.isGameOver()) {
    return null;
  }

  if (chess.isCheckmate()) {
    const winningColor: ActiveColor = chess.turn() === "w" ? "black" : "white";
    const youWon = winningColor === humanColor;
    return {
      isOpen: true,
      title: "Checkmate",
      subtitle: youWon ? "You beat the bot." : "Stockfish found the finish.",
      detail: youWon
        ? `You converted the attack as ${humanColor === "white" ? "White" : "Black"}.`
        : `You were checkmated playing ${humanColor === "white" ? "White" : "Black"}.`,
    };
  }

  if (chess.isStalemate()) {
    return {
      isOpen: true,
      title: "Draw",
      subtitle: "Stalemate.",
      detail: "No legal moves remain for the side to move.",
    };
  }

  if (chess.isThreefoldRepetition()) {
    return {
      isOpen: true,
      title: "Draw",
      subtitle: "Threefold repetition.",
      detail: "The same position appeared three times.",
    };
  }

  if (chess.isInsufficientMaterial()) {
    return {
      isOpen: true,
      title: "Draw",
      subtitle: "Insufficient material.",
      detail: "Neither side has enough material to force mate.",
    };
  }

  if (chess.isDrawByFiftyMoves()) {
    return {
      isOpen: true,
      title: "Draw",
      subtitle: "Fifty-move rule.",
      detail: "Fifty moves passed without a pawn move or capture.",
    };
  }

  return {
    isOpen: true,
    title: "Draw",
    subtitle: "The game ended in a draw.",
    detail: "No decisive result was reached.",
  };
};

const iconClassName = "h-[18px] w-[18px]";

const NewGameIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={iconClassName} aria-hidden="true">
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v6h-6" />
  </svg>
);

const ResignIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={iconClassName} aria-hidden="true">
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    <polyline points="10 17 15 12 10 7" />
    <line x1="15" x2="3" y1="12" y2="12" />
  </svg>
);

const UndoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={iconClassName} aria-hidden="true">
    <path d="M3 7v6h6" />
    <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
  </svg>
);

const RedoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={iconClassName} aria-hidden="true">
    <path d="M21 7v6h-6" />
    <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
  </svg>
);

function PlayVsBot() {
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const chessRef = useRef(new Chess());
  const engineRef = useRef<StockfishAdapter | null>(null);
  const activeGameTokenRef = useRef(0);
  const activeThinkTokenRef = useRef(0);
  const humanColorRef = useRef<ActiveColor>("white");
  const difficultyRef = useRef<BotDifficulty>("medium");
  const desktopHistoryRef = useRef<HTMLDivElement | null>(null);
  const mobileHistoryRef = useRef<HTMLDivElement | null>(null);

  const [setupColor, setSetupColor] = useState<SetupColor>("random");
  const [difficulty, setDifficulty] = useState<BotDifficulty>("medium");
  const [humanColor, setHumanColor] = useState<ActiveColor>("white");
  const [phase, setPhase] = useState<GamePhase>("setup");
  const [board, setBoard] = useState(chessRef.current.board());
  const [currentTurn, setCurrentTurn] = useState<Turn>(chessRef.current.turn());
  const [currentFen, setCurrentFen] = useState(chessRef.current.fen());
  const [lastMove, setLastMove] = useState<LastMove>(null);
  const [checkedKingSquare, setCheckedKingSquare] = useState<Square | null>(null);
  const [, setStatusMessage] = useState("Choose your side and start when ready.");
  const [botThinking, setBotThinking] = useState(false);
  const [engineBooting, setEngineBooting] = useState(true);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion>(DEFAULT_PENDING_PROMOTION);
  const [moveHistory, setMoveHistory] = useState<MoveHistoryEntry[]>([]);
  const [matchConclusion, setMatchConclusion] = useState<MatchConclusion>(DEFAULT_MATCH_CONCLUSION);

  const difficultyPreset = BOT_DIFFICULTY_PRESETS[difficulty];
  const latestMovePly = moveHistory.at(-1)?.ply ?? null;
  const isHumanTurn = currentTurn === (humanColor === "white" ? "w" : "b");
  const botColor: ActiveColor = humanColor === "white" ? "black" : "white";
  const playerName = session?.user?.name?.trim() || session?.user?.email?.trim() || "You";
  const promotionChoices = (["q", "r", "b", "n"] as PromotionPiece[])
    .filter((piece) => pendingPromotion.availablePromotions.includes(piece))
    .map((piece) => ({
      id: piece,
      label: getPromotionLabel(piece),
      imageSrc: `/Pieces/${humanColor === "black" ? piece : `w${piece}`}.png`,
    }));

  const syncBoardStateFromChess = () => {
    setBoard(chessRef.current.board());
    setCurrentTurn(chessRef.current.turn());
    setCurrentFen(chessRef.current.fen());
    setCheckedKingSquare(getCheckedKingSquare(chessRef.current));
  };

  const resetVisualState = () => {
    setLastMove(null);
    setMoveHistory([]);
    setPendingPromotion(DEFAULT_PENDING_PROMOTION);
    setMatchConclusion(DEFAULT_MATCH_CONCLUSION);
    setCheckedKingSquare(null);
  };

  const finalizeMatch = (conclusion: MatchConclusion, fallbackStatus = "Game over.") => {
    setPhase("game_over");
    setMatchConclusion(conclusion);
    setBotThinking(false);
    setCurrentTurn(null);
    setStatusMessage(conclusion.subtitle || fallbackStatus);
    activeThinkTokenRef.current = 0;
  };

  const applyMove = (
    move: { from: Square; to: Square; promotion?: PromotionPiece },
    actor: "human" | "bot",
  ) => {
    const appliedMove = chessRef.current.move(move);
    if (!appliedMove) {
      return null;
    }

    syncBoardStateFromChess();
    setLastMove({ from: appliedMove.from as Square, to: appliedMove.to as Square });
    setMoveHistory((previous) => {
      const ply = previous.length + 1;
      return [
        ...previous,
        {
          ply,
          san: appliedMove.san,
          color: appliedMove.color === "w" ? "white" : "black",
          moveNumber: Math.ceil(ply / 2),
        },
      ];
    });
    setPendingPromotion(DEFAULT_PENDING_PROMOTION);

    const conclusion = getMatchConclusionFromChess(chessRef.current, humanColorRef.current);
    if (conclusion) {
      finalizeMatch(conclusion);
      return { move: appliedMove, isGameOver: true };
    }

    if (actor === "human") {
      setStatusMessage(`Stockfish is thinking on ${BOT_DIFFICULTY_PRESETS[difficultyRef.current].label}.`);
    } else {
      setBotThinking(false);
      setStatusMessage("Your move.");
    }

    return { move: appliedMove, isGameOver: false };
  };

  const requestBotMove = async (gameToken: number) => {
    if (!engineRef.current) {
      return;
    }

    const thinkToken = activeThinkTokenRef.current + 1;
    activeThinkTokenRef.current = thinkToken;
    const requestFen = chessRef.current.fen();
    const preset = BOT_DIFFICULTY_PRESETS[difficultyRef.current];
    const visibleThinkDelayMs =
      preset.visibleThinkMinMs + Math.floor(Math.random() * (preset.visibleThinkJitterMs + 1));

    setBotThinking(true);
    setStatusMessage(`Stockfish is thinking on ${preset.label}.`);

    try {
      const [bestMove] = await Promise.all([
        engineRef.current.getBestMove({
          fen: requestFen,
          movetimeMs: preset.movetimeMs,
          skillLevel: preset.skillLevel,
          minimumThinkingTimeMs: preset.minimumThinkingTimeMs,
          moveOverheadMs: preset.moveOverheadMs,
          timeoutMs: preset.movetimeMs + preset.visibleThinkMinMs + 3500,
        }),
        new Promise((resolve) => {
          window.setTimeout(resolve, visibleThinkDelayMs);
        }),
      ]);

      if (gameToken !== activeGameTokenRef.current || thinkToken !== activeThinkTokenRef.current) {
        return;
      }

      if (bestMove === "(none)") {
        const conclusion = getMatchConclusionFromChess(chessRef.current, humanColorRef.current);
        if (conclusion) {
          finalizeMatch(conclusion);
          return;
        }

        throw new Error("Stockfish returned no move for the current position.");
      }

      const parsedMove = parseUciMove(bestMove);
      if (!parsedMove) {
        throw new Error("Stockfish returned an unreadable move.");
      }

      const result = applyMove(parsedMove, "bot");
      if (!result) {
        throw new Error("Stockfish returned an illegal move.");
      }
    } catch (error) {
      if (gameToken !== activeGameTokenRef.current || thinkToken !== activeThinkTokenRef.current) {
        return;
      }

      finalizeMatch(
        {
          isOpen: true,
          title: "Engine Error",
          subtitle: "The bot could not finish its move.",
          detail: error instanceof Error ? error.message : "Please start a new game.",
        },
        "Bot move failed.",
      );
    }
  };

  const returnToSetup = async () => {
    activeGameTokenRef.current += 1;
    activeThinkTokenRef.current = 0;
    setPhase("setup");
    setBotThinking(false);
    setStatusMessage("Choose your side and start when ready.");
    chessRef.current = new Chess();
    resetVisualState();
    syncBoardStateFromChess();
    await engineRef.current?.stopThinking();
  };

  useEffect(() => {
    difficultyRef.current = difficulty;
  }, [difficulty]);

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
    const adapter = new StockfishAdapter();
    engineRef.current = adapter;

    let isMounted = true;
    adapter
      .init()
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        setStatusMessage(error instanceof Error ? error.message : "Bot engine failed to load.");
      })
      .finally(() => {
        if (isMounted) {
          setEngineBooting(false);
        }
      });

    return () => {
      isMounted = false;
      activeGameTokenRef.current += 1;
      activeThinkTokenRef.current = 0;
      adapter.terminate();
      engineRef.current = null;
    };
  }, []);

  const handleStartGame = async () => {
    const nextHumanColor = resolveHumanColor(setupColor);
    humanColorRef.current = nextHumanColor;
    difficultyRef.current = difficulty;

    activeGameTokenRef.current += 1;
    activeThinkTokenRef.current = 0;

    setHumanColor(nextHumanColor);
    setPhase("playing");
    setBotThinking(false);
    setStatusMessage(nextHumanColor === "white" ? "Your move." : "Stockfish opens the game.");

    chessRef.current = new Chess();
    resetVisualState();
    syncBoardStateFromChess();

    try {
      await engineRef.current?.prepareNewGame();
    } catch (error) {
      finalizeMatch({
        isOpen: true,
        title: "Engine Error",
        subtitle: "The bot could not start a new game.",
        detail: error instanceof Error ? error.message : "Please try again.",
      });
      return;
    }

    if (nextHumanColor === "black") {
      void requestBotMove(activeGameTokenRef.current);
    }
  };

  const handleMoveRequest = (move: { from: Square; to: Square; promotion?: PromotionPiece }) => {
    if (phase !== "playing" || botThinking || !isHumanTurn) {
      setStatusMessage(botThinking ? "Wait for the bot to finish thinking." : "It is not your turn.");
      return;
    }

    const result = applyMove(move, "human");
    if (!result) {
      setStatusMessage("Illegal move.");
      return;
    }

    if (!result.isGameOver) {
      void requestBotMove(activeGameTokenRef.current);
    }
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
      availablePromotions: payload.availablePromotions,
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
      promotion,
    });
  };

  const handleResign = async () => {
    if (phase !== "playing") {
      return;
    }

    await engineRef.current?.stopThinking();
    finalizeMatch({
      isOpen: true,
      title: "Resignation",
      subtitle: "You resigned the game.",
      detail: "Return to setup when you are ready for a new run.",
    });
  };

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

  const renderMoveHistoryTable = (
    scrollRef: { current: HTMLDivElement | null },
    maxHeightClass = "max-h-80",
  ) => {
    if (getMoveHistoryRows.length === 0) {
      return <div className="py-8 text-center text-sm text-gray-400">No moves yet</div>;
    }

    return (
      <div ref={scrollRef} className={`${maxHeightClass} overflow-y-auto pr-1`}>
        <div className="space-y-1">
          {getMoveHistoryRows.map((row) => (
            <div
              key={row.moveNumber}
              className="grid grid-cols-[36px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[#3a3936]"
            >
              <div className="text-xs font-semibold text-gray-400">{row.moveNumber}.</div>
              <div
                className={`text-sm px-2 py-1 rounded-md text-center ${
                  row.white?.ply === latestMovePly
                    ? "bg-[#b58863] text-white font-semibold"
                    : "bg-[#3a3936] text-gray-100"
                }`}
              >
                {row.white?.san ?? "—"}
              </div>
              <div
                className={`text-sm px-2 py-1 rounded-md text-center ${
                  row.black?.ply === latestMovePly
                    ? "bg-[#b58863] text-white font-semibold"
                    : "bg-[#3a3936] text-gray-100"
                }`}
              >
                {row.black?.san ?? "—"}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <main className="bot-page min-h-dvh overflow-x-hidden px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] text-[#f8f2e7]">
      <div className="bot-page__mesh" aria-hidden />
      <div className="bot-page__grain" aria-hidden />

      <section className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-4 lg:gap-6">
        {phase === "setup" ? (
          <section className="mx-auto w-full max-w-5xl">
            <article className="rounded-[2.5rem] border border-[#f6f1e7]/10 bg-[#17120e]/85 p-6 shadow-[0_32px_96px_rgba(0,0,0,0.52)] backdrop-blur-md sm:p-8 md:p-10">
              {/* Intro Block */}
              <header className="mb-8 flex items-start gap-4 md:gap-6">
                {/* Home Navigation Button */}
                <button
                  onClick={() => navigate("/", { replace: true })}
                  className="group flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#f6f1e7]/12 bg-[#221912]/80 px-3.5 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-[#f6ecdb] transition-all duration-250 hover:border-[#f6f1e7]/25 hover:bg-[#2d221a] hover:-translate-x-0.5 active:translate-x-0"
                  aria-label="Return to home page"
                >
                  <svg className="h-4 w-4 transition-transform duration-250" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                  <span className="hidden sm:inline">Home</span>
                </button>

                {/* Title Section */}
                <div className="flex-1 text-center md:text-left">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d4bb9a] md:text-[12px]">Pre-game Setup</p>
                  <h2 className="font-display text-[26px] font-semibold leading-tight text-[#fff3df] md:text-3xl lg:text-4xl">
                    Choose your seat, then let the board breathe.
                  </h2>
                  <p className="mt-3 text-sm text-[#d8c4a8]/80 md:text-base">
                    Select your preferred color and difficulty to begin a new game against Stockfish.
                  </p>
                </div>
              </header>

              <div className="space-y-8">
                {/* Color Selection Section */}
                <section>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d2a572]/30 bg-[#d2a572]/10">
                        <svg className="h-4 w-4 text-[#d2a572]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                        </svg>
                      </div>
                      <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-[#f4dcc0]">Choose Color</h3>
                    </div>
                    <span className="text-xs font-medium text-[#bda88b]">Default: Random</span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {COLOR_OPTIONS.map((option) => {
                      const active = setupColor === option.value;
                      return (
                        <button
                          key={option.value}
                          onClick={() => setSetupColor(option.value)}
                          className={`bot-setup-card group relative flex min-h-[88px] flex-col justify-between rounded-[1.5rem] border px-5 py-4 text-left transition-all duration-250 ${
                            active
                              ? "bot-setup-card--active border-[#d2a572] bg-[#d2a572]/16"
                              : "border-[#f6f1e7]/8 bg-[#1c1612]/80 hover:border-[#d2a572]/35 hover:bg-[#221912]/90"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span className="text-base font-bold text-[#fff2dd] sm:text-lg">{option.label}</span>
                            {active && (
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#d2a572]">
                                <svg className="h-3 w-3 text-[#1a1612]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </span>
                            )}
                          </div>
                          <span className="mt-2 text-sm text-[#d8c4a8]/75 leading-relaxed">{option.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* Section Separator */}
                <div className="relative my-8">
                  <div className="absolute inset-0 flex items-center">
                    <div className="h-px w-full bg-gradient-to-r from-transparent via-[#f6f1e7]/10 to-transparent" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-[#17120e]/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#d8c4a8]/60 backdrop-blur-md">Bot Settings</span>
                  </div>
                </div>

                {/* Difficulty Selection Section */}
                <section>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#90b678]/30 bg-[#90b678]/10">
                        <svg className="h-4 w-4 text-[#90b678]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </div>
                      <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-[#f4dcc0]">Choose Difficulty</h3>
                    </div>
                    <span className="text-xs font-medium text-[#bda88b]">Default: Medium</span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {DIFFICULTY_OPTIONS.map((option) => {
                      const preset = BOT_DIFFICULTY_PRESETS[option];
                      const active = difficulty === option;
                      return (
                        <button
                          key={option}
                          onClick={() => setDifficulty(option)}
                          className={`bot-setup-card group relative flex min-h-[88px] flex-col justify-between rounded-[1.5rem] border px-5 py-4 text-left transition-all duration-250 ${
                            active
                              ? "bot-setup-card--active border-[#90b678] bg-[#90b678]/14"
                              : "border-[#f6f1e7]/8 bg-[#1c1612]/80 hover:border-[#90b678]/35 hover:bg-[#221912]/90"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span className="text-base font-bold text-[#fff2dd] sm:text-lg">{preset.label}</span>
                            {active && (
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#90b678]">
                                <svg className="h-3 w-3 text-[#1a1612]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </span>
                            )}
                          </div>
                          <span className="mt-2 text-sm text-[#d8c4a8]/75 leading-relaxed">{preset.summary}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* Action Buttons */}
                <div className="pt-4">
                  <button
                    onClick={() => void handleStartGame()}
                    disabled={engineBooting}
                    className={`bot-setup-btn--primary group relative flex w-full min-h-[52px] items-center justify-center gap-2.5 rounded-2xl px-6 text-base font-extrabold uppercase tracking-[0.1em] transition-all duration-250 sm:min-h-[56px] sm:text-lg ${
                      engineBooting
                        ? "cursor-wait bg-[#6f604b] text-[#f3e6d4] opacity-80"
                        : "bg-gradient-to-r from-[#d2a572] to-[#e9c176] text-[#1a1612] shadow-[0_20px_44px_rgba(210,165,114,0.28)] hover:shadow-[0_24px_52px_rgba(210,165,114,0.36)] hover:-translate-y-0.5 active:translate-y-0"
                    }`}
                    aria-label={engineBooting ? "Loading engine, please wait" : "Start game with current settings"}
                  >
                    {engineBooting ? (
                      <>
                        <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        Loading Engine...
                      </>
                    ) : (
                      <>
                        <svg className="h-5 w-5 transition-transform duration-250 group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                        Start Game
                      </>
                    )}
                  </button>
                </div>
              </div>
            </article>
          </section>
        ) : (
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="grid gap-4">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <div className="rounded-[1.2rem] border border-[#f6f1e7]/10 bg-[#17120e]/82 px-3.5 py-2.5 backdrop-blur-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-sm font-semibold uppercase tracking-[0.08em] text-[#fff2dd]">Bot</h2>
                        <div className="mt-1 inline-flex items-center rounded-full border border-[#f6f1e7]/10 bg-[#231a14]/72 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#d8c4a8]">
                          {difficultyPreset.label}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 rounded-full border border-[#f6f1e7]/10 bg-[#221912]/80 px-2.5 py-1">
                        <span className={`h-2.5 w-2.5 rounded-full ${botThinking ? "animate-pulse bg-[#d2a572]" : "bg-[#90b678]"}`} />
                        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#f2dfc5]">
                          {botThinking ? "Thinking" : currentTurn === (botColor === "white" ? "w" : "b") ? "Turn" : "Waiting"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mx-auto w-full max-w-[min(100%,44rem)]">
                    <ChessBoard
                      board={board}
                      isInteractive={phase === "playing" && !botThinking && !matchConclusion.isOpen && !pendingPromotion.isOpen}
                      playerColor={humanColor}
                      currentTurn={currentTurn}
                      orientation={humanColor}
                      setStatusMessage={setStatusMessage}
                      fen={currentFen}
                      lastMove={lastMove}
                      checkedKingSquare={checkedKingSquare}
                      onMoveRequest={handleMoveRequest}
                      onPromotionRequired={handlePromotionRequired}
                    />
                  </div>

                  <div className="rounded-[1.2rem] border border-[#f6f1e7]/10 bg-[#17120e]/82 px-3.5 py-2.5 backdrop-blur-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-sm font-semibold text-[#fff2dd]">{playerName}</h2>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 rounded-full border border-[#f6f1e7]/10 bg-[#221912]/80 px-2.5 py-1">
                        <span className={`h-2.5 w-2.5 rounded-full ${isHumanTurn && phase === "playing" ? "animate-pulse bg-[#90b678]" : "bg-[#6d6254]"}`} />
                        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#f2dfc5]">
                          {phase === "game_over" ? "Finished" : isHumanTurn ? "Your turn" : "Hold"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="hidden md:flex items-center justify-center gap-2 px-1">
                    <button
                      disabled
                      aria-label="Undo (coming soon)"
                      title="Undo (coming soon)"
                      className="cursor-not-allowed inline-flex h-9 items-center justify-center rounded-lg border border-[#5b5042]/50 bg-[#5b5042]/10 px-3 text-[#d5cab8]/60 transition"
                    >
                      <UndoIcon />
                    </button>
                    <button
                      disabled
                      aria-label="Redo (coming soon)"
                      title="Redo (coming soon)"
                      className="cursor-not-allowed inline-flex h-9 items-center justify-center rounded-lg border border-[#5b5042]/50 bg-[#5b5042]/10 px-3 text-[#d5cab8]/60 transition"
                    >
                      <RedoIcon />
                    </button>
                    <button
                      onClick={() => void returnToSetup()}
                      aria-label="New game"
                      title="New game"
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-[#d2a572]/30 bg-[#d2a572]/8 px-3 text-[#f2dfc5] transition hover:bg-[#d2a572]/20"
                    >
                      <NewGameIcon />
                    </button>
                    <button
                      onClick={() => void handleResign()}
                      disabled={phase !== "playing"}
                      aria-label="Resign"
                      title="Resign"
                      className={`inline-flex h-9 items-center justify-center rounded-lg border px-3 transition ${
                        phase !== "playing"
                          ? "cursor-not-allowed border-[#5b5042]/50 bg-[#5b5042]/10 text-[#d5cab8]/60"
                          : "border-[#8f4a4a]/50 bg-[#8f4a4a]/12 text-[#f8dedd] hover:bg-[#8f4a4a]/20"
                      }`}
                    >
                      <ResignIcon />
                    </button>
                  </div>
                </div>

              </div>

              <div className="mx-auto flex w-full max-w-[min(100%,44rem)] flex-col gap-2 lg:hidden">
                <section className="rounded-xl border border-[#45433f] bg-[#2f2e2b] p-3 text-white">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-base font-bold">Move History</h3>
                    <span className="rounded-full bg-[#3a3936] px-2 py-1 text-xs text-gray-300">
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

              <div className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-[#f6f1e7]/10 bg-[#17120e]/80 px-3 py-2 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.3)] md:hidden">
                <button
                  disabled
                  aria-label="Undo (coming soon)"
                  title="Undo (coming soon)"
                  className="cursor-not-allowed inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#5b5042] bg-[#40372c] text-[#d5cab8]"
                >
                  <UndoIcon />
                </button>
                <button
                  disabled
                  aria-label="Redo (coming soon)"
                  title="Redo (coming soon)"
                  className="cursor-not-allowed inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#5b5042] bg-[#40372c] text-[#d5cab8]"
                >
                  <RedoIcon />
                </button>
                <button
                  onClick={() => void returnToSetup()}
                  aria-label="New game"
                  title="New game"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#d2a572] text-[#1a1612] transition hover:bg-[#dfb17b]"
                >
                  <NewGameIcon />
                </button>
                <button
                  onClick={() => void handleResign()}
                  disabled={phase !== "playing"}
                  aria-label="Resign"
                  title="Resign"
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition ${
                    phase !== "playing"
                      ? "cursor-not-allowed border border-[#5b5042] bg-[#40372c] text-[#d5cab8]"
                      : "border border-[#8f4a4a] bg-[#5a3030] text-[#f8dedd] hover:bg-[#6a3737]"
                  }`}
                >
                  <ResignIcon />
                </button>
              </div>
            </div>

            <aside className="hidden shrink-0 self-stretch lg:flex lg:w-[340px] xl:w-[380px]">
              <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-[#45433f] bg-[#2f2e2b] p-4 text-white">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-lg font-bold">Move History</h3>
                  <span className="rounded-full bg-[#3a3936] px-2 py-1 text-xs text-gray-300">
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
          </section>
        )}
      </section>

      <PromotionModal
        isOpen={pendingPromotion.isOpen && !matchConclusion.isOpen}
        choices={promotionChoices}
        onSelect={(choiceId) => handleSelectPromotion(choiceId as PromotionPiece)}
        onCancel={handleCancelPromotion}
      />

      <MatchConclusionModal
        isOpen={matchConclusion.isOpen}
        title={matchConclusion.title}
        subtitle={matchConclusion.subtitle}
        detail={matchConclusion.detail}
        actions={[
          {
            label: "New Game",
            onClick: () => {
              void returnToSetup();
            },
            className:
              "flex-1 rounded-2xl bg-[#d2a572] px-5 py-3 font-bold text-[#1a1612] transition hover:bg-[#dfb17b]",
          },
          {
            label: "Home",
            onClick: () => navigate("/", { replace: true }),
            className:
              "flex-1 rounded-2xl bg-[#3c3b38] px-5 py-3 font-bold text-white transition hover:bg-[#4a4945]",
          },
        ]}
      />
    </main>
  );
}

export default PlayVsBot;
