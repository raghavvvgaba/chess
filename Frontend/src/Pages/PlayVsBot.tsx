import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { motion, AnimatePresence } from "framer-motion";
import ChessBoard from "../components/ChessBoard";
import MatchConclusionModal from "../components/game/MatchConclusionModal";
import PromotionModal from "../components/game/PromotionModal";
import AppSidebar from "../components/dashboard/AppSidebar";
import { authClient } from "../lib/auth-client";
import {
  BOT_DIFFICULTY_PRESETS,
  type BotDifficulty,
  StockfishAdapter,
} from "../lib/stockfish";
import { 
  Cpu, 
  Settings2, 
  Swords, 
  RotateCcw, 
  Flag, 
  Undo2, 
  Redo2, 
  ChevronRight,
  ChevronLeft,
  Zap,
  Play,
  Clock,
  Target,
  History,
  Dices
} from "lucide-react";

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

const COLOR_OPTIONS: { value: SetupColor; label: string; description: string; image: string }[] = [
  {
    value: "white",
    label: "White",
    description: "Move first and set the tempo.",
    image: "/Pieces/wk.png"
  },
  {
    value: "black",
    label: "Black",
    description: "Counter the bot's opening.",
    image: "/Pieces/k.png"
  },
  {
    value: "random",
    label: "Random",
    description: "Let fate decide your side.",
    image: "/Pieces/wk.png" // We'll overlay something or use an icon for random
  },
];

const DIFFICULTY_OPTIONS = ["easy", "medium", "hard"] as const satisfies BotDifficulty[];

const getSquareFromCoordinates = (row: number, col: number): Square => {
  return `${String.fromCharCode(97 + col)}${8 - row}` as Square;
};

const getCheckedKingSquare = (chess: Chess): Square | null => {
  if (!chess.inCheck()) return null;

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
  if (uciMove === "(none)" || uciMove.length < 4) return null;

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
  if (!chess.isGameOver()) return null;

  if (chess.isCheckmate()) {
    const winningColor: ActiveColor = chess.turn() === "w" ? "black" : "white";
    const youWon = winningColor === humanColor;
    return {
      isOpen: true,
      title: "Checkmate",
      subtitle: youWon ? "Victory is yours!" : "The bot has triumphed.",
      detail: youWon
        ? `Magnificent play as ${humanColor}.`
        : `Defeated by the machine as ${humanColor}.`,
    };
  }

  let subtitle = "The game is a draw.";
  if (chess.isStalemate()) subtitle = "Stalemate - No legal moves remain.";
  else if (chess.isThreefoldRepetition()) subtitle = "Draw by Threefold Repetition.";
  else if (chess.isInsufficientMaterial()) subtitle = "Draw by Insufficient Material.";
  else if (chess.isDrawByFiftyMoves()) subtitle = "Draw by Fifty-Move Rule.";

  return {
    isOpen: true,
    title: "Draw",
    subtitle,
    detail: "A balanced battle with no decisive end.",
  };
};

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);

    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
    media.addEventListener('change', listener);
    
    return () => media.removeEventListener('change', listener);
  }, [query]);

  return matches;
}

function PlayVsBot() {
  const { data: session } = authClient.useSession();
  const isMobile = useMediaQuery('(max-width: 768px)');
  
  // Card dimensions: width + horizontal margins (mx-4 = 16px*2)
  const cardWidth = isMobile ? 260 : 320;
  const cardGap = 32; // mx-4 on each side is 16+16=32
  const totalCardSpace = cardWidth + cardGap;
  const centerOffset = totalCardSpace / 2;

  const chessRef = useRef(new Chess());
  const engineRef = useRef<StockfishAdapter | null>(null);
  const activeGameTokenRef = useRef(0);
  const activeThinkTokenRef = useRef(0);
  const humanColorRef = useRef<ActiveColor>("white");
  const difficultyRef = useRef<BotDifficulty>("medium");
  const desktopHistoryRef = useRef<HTMLDivElement | null>(null);

  const [setupColor, setSetupColor] = useState<SetupColor>("random");
  const [difficulty, setDifficulty] = useState<BotDifficulty>("medium");
  const [setupStep, setSetupStep] = useState<"color" | "difficulty">("color");
  const [humanColor, setHumanColor] = useState<ActiveColor>("white");
  const [phase, setPhase] = useState<GamePhase>("setup");
  const [board, setBoard] = useState(chessRef.current.board());
  const [currentTurn, setCurrentTurn] = useState<Turn>(chessRef.current.turn());
  const [currentFen, setCurrentFen] = useState(chessRef.current.fen());
  const [lastMove, setLastMove] = useState<LastMove>(null);
  const [checkedKingSquare, setCheckedKingSquare] = useState<Square | null>(null);
  const [, setStatusMessage] = useState("Ready to play?");
  const [botThinking, setBotThinking] = useState(false);
  const [engineBooting, setEngineBooting] = useState(true);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion>(DEFAULT_PENDING_PROMOTION);
  const [moveHistory, setMoveHistory] = useState<MoveHistoryEntry[]>([]);
  const [matchConclusion, setMatchConclusion] = useState<MatchConclusion>(DEFAULT_MATCH_CONCLUSION);

  const difficultyPreset = BOT_DIFFICULTY_PRESETS[difficulty];
  const latestMovePly = moveHistory.at(-1)?.ply ?? null;
  const isHumanTurn = currentTurn === (humanColor === "white" ? "w" : "b");
  const playerName = session?.user?.name?.split(' ')[0] || "Player";
  
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

  const finalizeMatch = (conclusion: MatchConclusion) => {
    setPhase("game_over");
    setMatchConclusion(conclusion);
    setBotThinking(false);
    setCurrentTurn(null);
    activeThinkTokenRef.current = 0;
  };

  const applyMove = (
    move: { from: Square; to: Square; promotion?: PromotionPiece },
    actor: "human" | "bot",
  ) => {
    const appliedMove = chessRef.current.move(move);
    if (!appliedMove) return null;

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

    if (actor === "bot") setBotThinking(false);

    return { move: appliedMove, isGameOver: false };
  };

  const requestBotMove = async (gameToken: number) => {
    if (!engineRef.current) return;

    const thinkToken = activeThinkTokenRef.current + 1;
    activeThinkTokenRef.current = thinkToken;
    const requestFen = chessRef.current.fen();
    const preset = BOT_DIFFICULTY_PRESETS[difficultyRef.current];
    const visibleThinkDelayMs =
      preset.visibleThinkMinMs + Math.floor(Math.random() * (preset.visibleThinkJitterMs + 1));

    setBotThinking(true);

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
        new Promise((resolve) => window.setTimeout(resolve, visibleThinkDelayMs)),
      ]);

      if (gameToken !== activeGameTokenRef.current || thinkToken !== activeThinkTokenRef.current) return;

      if (bestMove === "(none)") {
        const conclusion = getMatchConclusionFromChess(chessRef.current, humanColorRef.current);
        if (conclusion) finalizeMatch(conclusion);
        return;
      }

      const parsedMove = parseUciMove(bestMove);
      if (!parsedMove) throw new Error("Stockfish returned an unreadable move.");

      const result = applyMove(parsedMove, "bot");
      if (!result) throw new Error("Stockfish returned an illegal move.");
    } catch (error) {
      if (gameToken !== activeGameTokenRef.current || thinkToken !== activeThinkTokenRef.current) return;

      finalizeMatch({
        isOpen: true,
        title: "Engine Error",
        subtitle: "The bot could not finish its move.",
        detail: error instanceof Error ? error.message : "Please start a new game.",
      });
    }
  };

  const returnToSetup = async () => {
    activeGameTokenRef.current += 1;
    activeThinkTokenRef.current = 0;
    setPhase("setup");
    setSetupStep("color");
    setBotThinking(false);
    chessRef.current = new Chess();
    resetVisualState();
    syncBoardStateFromChess();
    await engineRef.current?.stopThinking();
  };

  useEffect(() => {
    difficultyRef.current = difficulty;
  }, [difficulty]);

  useEffect(() => {
    if (desktopHistoryRef.current) {
      desktopHistoryRef.current.scrollTop = desktopHistoryRef.current.scrollHeight;
    }
  }, [moveHistory]);

  useEffect(() => {
    const adapter = new StockfishAdapter();
    engineRef.current = adapter;

    let isMounted = true;
    adapter
      .init()
      .catch((error) => {
        if (!isMounted) return;
        setStatusMessage(error instanceof Error ? error.message : "Bot engine failed to load.");
      })
      .finally(() => {
        if (isMounted) setEngineBooting(false);
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
    if (phase !== "playing" || botThinking || !isHumanTurn) return;

    const result = applyMove(move, "human");
    if (!result) return;

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
    if (!pendingPromotion.isOpen || !pendingPromotion.from || !pendingPromotion.to) return;
    handleMoveRequest({ from: pendingPromotion.from, to: pendingPromotion.to, promotion });
  };

  const handleResign = async () => {
    if (phase !== "playing") return;
    await engineRef.current?.stopThinking();
    finalizeMatch({
      isOpen: true,
      title: "Resignation",
      subtitle: "You resigned the match.",
      detail: "Sometimes the wisest move is to reset and try again.",
    });
  };

  const getMoveHistoryRows = useMemo(() => {
    const rowMap = new Map<number, MoveHistoryRow>();
    for (const entry of moveHistory) {
      const existing = rowMap.get(entry.moveNumber) ?? { moveNumber: entry.moveNumber };
      if (entry.color === "white") existing.white = entry;
      else existing.black = entry;
      rowMap.set(entry.moveNumber, existing);
    }
    return Array.from(rowMap.values()).sort((a, b) => a.moveNumber - b.moveNumber);
  }, [moveHistory]);

  return (
    <div className="min-h-screen bot-page flex flex-col md:flex-row text-[#e5e2e3]">
      <AppSidebar />
      <div className="bot-page__mesh" aria-hidden />
      
      <main className="flex-1 relative z-10 p-4 md:p-8 lg:p-12 overflow-y-auto max-h-screen custom-scrollbar">
        <div className="max-w-7xl mx-auto">
          {phase === "setup" ? (
            <div className="max-w-4xl mx-auto space-y-12 h-[calc(100vh-10rem)] flex flex-col justify-center">
              <AnimatePresence mode="wait">
                {setupStep === "color" ? (
                  <motion.div 
                    key="step-color"
                    initial={{ opacity: 0, x: -50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 50 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="space-y-12"
                  >
                    <div className="text-center space-y-4">
                      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#e9c176]/10 border border-[#e9c176]/20 text-[#e9c176] text-xs font-bold uppercase tracking-widest">
                        <span>Step 1 of 2</span>
                      </div>
                      <h1 className="text-4xl md:text-6xl font-display font-extrabold tracking-tight">
                        Choose Your <span className="text-[#e9c176]">Side</span>
                      </h1>
                    </div>

                    <div className="relative flex flex-col items-center gap-12 w-full max-w-5xl mx-auto">
                      <div className="relative w-full flex items-center justify-center">
                        {/* Navigation Arrows */}
                        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 flex justify-between px-4 md:px-12 z-30 pointer-events-none">
                          <button
                            onClick={() => {
                              const currentIndex = COLOR_OPTIONS.findIndex(o => o.value === setupColor);
                              const nextIndex = (currentIndex - 1 + COLOR_OPTIONS.length) % COLOR_OPTIONS.length;
                              setSetupColor(COLOR_OPTIONS[nextIndex].value);
                            }}
                            className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 hover:border-[#e9c176]/50 transition-all pointer-events-auto group backdrop-blur-md"
                            aria-label="Previous side"
                          >
                            <ChevronLeft className="w-6 h-6 group-hover:-translate-x-0.5 transition-transform" />
                          </button>
                          <button
                            onClick={() => {
                              const currentIndex = COLOR_OPTIONS.findIndex(o => o.value === setupColor);
                              const nextIndex = (currentIndex + 1) % COLOR_OPTIONS.length;
                              setSetupColor(COLOR_OPTIONS[nextIndex].value);
                            }}
                            className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 hover:border-[#e9c176]/50 transition-all pointer-events-auto group backdrop-blur-md"
                            aria-label="Next side"
                          >
                            <ChevronRight className="w-6 h-6 group-hover:translate-x-0.5 transition-transform" />
                          </button>
                        </div>

                        {/* Carousel Viewport */}
                        <div className="w-full overflow-hidden py-12 px-4 mask-fade-edges-horizontal">
                          <motion.div 
                            className="flex items-center"
                            animate={{ 
                              x: `calc(50% - ${(COLOR_OPTIONS.findIndex(o => o.value === setupColor) * totalCardSpace) + centerOffset}px)` 
                            }}
                            transition={{ type: "spring", stiffness: 260, damping: 26 }}
                          >
                            {COLOR_OPTIONS.map((option) => {
                              const active = setupColor === option.value;
                              return (
                                <motion.div
                                  key={option.value}
                                  animate={{ 
                                    scale: active ? 1.1 : 0.85,
                                    opacity: active ? 1 : 0.4,
                                    z: active ? 50 : 0
                                  }}
                                  transition={{ type: "spring", stiffness: 260, damping: 26 }}
                                  style={{ width: cardWidth }}
                                  className={`flex-shrink-0 aspect-[3/4] rounded-[2.5rem] border transition-all duration-500 relative overflow-hidden group mx-4 ${
                                    active 
                                      ? "bg-gradient-to-b from-[#e9c176]/20 to-[#e9c176]/5 border-[#e9c176] shadow-[0_0_60px_rgba(233,193,118,0.2)]" 
                                      : "bg-white/5 border-white/5"
                                  }`}
                                >
                                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/80 z-10" />
                                  <div className="absolute inset-0 flex items-center justify-center p-8 transition-transform duration-700 group-hover:scale-110">
                                    {option.value === "random" ? (
                                      <div className="relative">
                                        <img src="/Pieces/wk.png" alt="" className="w-32 h-32 absolute -translate-x-12 -rotate-12 blur-[1px] opacity-40" />
                                        <img src="/Pieces/k.png" alt="" className="w-32 h-32 absolute translate-x-12 rotate-12 blur-[1px] opacity-40" />
                                        <Dices className="w-24 h-24 text-[#e9c176] relative z-20 drop-shadow-[0_0_15px_rgba(233,193,118,0.5)]" />
                                      </div>
                                    ) : (
                                      <img 
                                        src={option.image} 
                                        alt={option.label}
                                        className={`w-44 h-44 object-contain drop-shadow-[0_10px_40px_rgba(0,0,0,0.6)] ${active ? "animate-float" : ""}`}
                                      />
                                    )}
                                  </div>
                                  <div className="absolute bottom-10 left-0 right-0 z-20 text-center space-y-3 px-6">
                                    <h3 className={`text-3xl font-display font-bold ${active ? "text-[#e9c176]" : "text-white"}`}>{option.label}</h3>
                                    <p className={`text-sm text-[#c4c7c7] transition-all duration-500 ${active ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
                                      {option.description}
                                    </p>
                                  </div>
                                  {active && (
                                    <motion.div 
                                      layoutId="active-glow"
                                      className="absolute inset-0 border-2 border-[#e9c176] rounded-[2.5rem] pointer-events-none"
                                    />
                                  )}
                                </motion.div>
                              );
                            })}
                          </motion.div>
                        </div>
                      </div>

                      <button
                        onClick={() => setSetupStep("difficulty")}
                        className="group flex items-center gap-3 px-12 py-5 bg-[#e9c176] text-[#00184a] rounded-2xl font-bold text-lg hover:scale-105 transition-all shadow-xl shadow-[#e9c176]/20 active:scale-95"
                      >
                        <span>Confirm Side</span>
                        <ChevronRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="step-difficulty"
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -50 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="space-y-12"
                  >
                    <div className="text-center space-y-4">
                      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#e9c176]/10 border border-[#e9c176]/20 text-[#e9c176] text-xs font-bold uppercase tracking-widest">
                        <span>Step 2 of 2</span>
                      </div>
                      <h1 className="text-4xl md:text-6xl font-display font-extrabold tracking-tight">
                        Choose Your <span className="text-[#e9c176]">Challenge</span>
                      </h1>
                    </div>

                    <div className="relative flex flex-col items-center gap-12 w-full max-w-5xl mx-auto">
                      <div className="relative w-full flex items-center justify-center">
                        {/* Navigation Arrows */}
                        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 flex justify-between px-4 md:px-12 z-30 pointer-events-none">
                          <button
                            onClick={() => {
                              const currentIndex = DIFFICULTY_OPTIONS.indexOf(difficulty);
                              const nextIndex = (currentIndex - 1 + DIFFICULTY_OPTIONS.length) % DIFFICULTY_OPTIONS.length;
                              setDifficulty(DIFFICULTY_OPTIONS[nextIndex]);
                            }}
                            className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 hover:border-[#e9c176]/50 transition-all pointer-events-auto group backdrop-blur-md"
                            aria-label="Previous difficulty"
                          >
                            <ChevronLeft className="w-6 h-6 group-hover:-translate-x-0.5 transition-transform" />
                          </button>
                          <button
                            onClick={() => {
                              const currentIndex = DIFFICULTY_OPTIONS.indexOf(difficulty);
                              const nextIndex = (currentIndex + 1) % DIFFICULTY_OPTIONS.length;
                              setDifficulty(DIFFICULTY_OPTIONS[nextIndex]);
                            }}
                            className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 hover:border-[#e9c176]/50 transition-all pointer-events-auto group backdrop-blur-md"
                            aria-label="Next difficulty"
                          >
                            <ChevronRight className="w-6 h-6 group-hover:translate-x-0.5 transition-transform" />
                          </button>
                        </div>

                        {/* Carousel Viewport */}
                        <div className="w-full overflow-hidden py-12 px-4 mask-fade-edges-horizontal">
                          <motion.div 
                            className="flex items-center"
                            animate={{ 
                              x: `calc(50% - ${(DIFFICULTY_OPTIONS.indexOf(difficulty) * totalCardSpace) + centerOffset}px)` 
                            }}
                            transition={{ type: "spring", stiffness: 260, damping: 26 }}
                          >
                            {DIFFICULTY_OPTIONS.map((option) => {
                              const preset = BOT_DIFFICULTY_PRESETS[option];
                              const active = difficulty === option;
                              return (
                                <motion.div
                                  key={option}
                                  animate={{ 
                                    scale: active ? 1.1 : 0.85,
                                    opacity: active ? 1 : 0.4,
                                    z: active ? 50 : 0
                                  }}
                                  transition={{ type: "spring", stiffness: 260, damping: 26 }}
                                  style={{ width: cardWidth }}
                                  className={`flex-shrink-0 aspect-[3/4] rounded-[2.5rem] border transition-all duration-500 relative overflow-hidden group mx-4 ${
                                    active 
                                      ? "bg-gradient-to-b from-[#e9c176]/20 to-[#e9c176]/5 border-[#e9c176] shadow-[0_0_60px_rgba(233,193,118,0.2)]" 
                                      : "bg-white/5 border-white/5"
                                  }`}
                                >
                                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/80 z-10" />
                                  <div className="absolute inset-0 flex items-center justify-center p-8">
                                    <div className={`relative transition-transform duration-700 group-hover:scale-110 ${active ? "animate-pulse" : ""}`}>
                                      {option === "easy" && <Target className="w-24 h-24 text-blue-400 drop-shadow-[0_0_15px_rgba(96,165,250,0.4)]" />}
                                      {option === "medium" && <Zap className="w-24 h-24 text-[#e9c176] drop-shadow-[0_0_15px_rgba(233,193,118,0.4)]" />}
                                      {option === "hard" && <Swords className="w-24 h-24 text-rose-400 drop-shadow-[0_0_15px_rgba(251,113,133,0.4)]" />}
                                    </div>
                                  </div>
                                  <div className="absolute bottom-10 left-0 right-0 z-20 text-center space-y-3 px-6">
                                    <h3 className={`text-3xl font-display font-bold ${active ? "text-[#e9c176]" : "text-white"}`}>{preset.label}</h3>
                                    <p className={`text-sm text-[#c4c7c7] transition-all duration-500 ${active ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
                                      {preset.summary}
                                    </p>
                                  </div>
                                  {active && (
                                    <motion.div 
                                      layoutId="active-glow-diff"
                                      className="absolute inset-0 border-2 border-[#e9c176] rounded-[2.5rem] pointer-events-none"
                                    />
                                  )}
                                </motion.div>
                              );
                            })}
                          </motion.div>
                        </div>
                      </div>

                      <div className="flex gap-4">
                        <button
                          onClick={() => setSetupStep("color")}
                          className="group flex items-center gap-3 px-8 py-5 bg-white/5 border border-white/10 text-white rounded-2xl font-bold text-lg hover:bg-white/10 transition-all active:scale-95"
                        >
                          <ChevronLeft className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
                          <span>Back</span>
                        </button>
                        <button
                          onClick={() => void handleStartGame()}
                          disabled={engineBooting}
                          className="group flex items-center gap-3 px-12 py-5 bg-gradient-gold text-[#00184a] rounded-2xl font-bold text-lg hover:scale-105 transition-all shadow-xl shadow-[#e9c176]/20 disabled:opacity-50 disabled:cursor-wait active:scale-95"
                        >
                          {engineBooting ? (
                             <Clock className="w-5 h-5 animate-pulse" />
                          ) : (
                             <Play className="w-5 h-5 fill-current" />
                          )}
                          <span>{engineBooting ? "Initializing..." : "Start Match"}</span>
                          {!engineBooting && <ChevronRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in duration-500">
              {/* Left Column: Board */}
              <div className="lg:col-span-8 space-y-6">
                {/* Bot Profile Card */}
                <div className="glass-obsidian border border-white/5 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <Cpu className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                      <p className="font-bold text-lg flex items-center gap-2">
                        Stockfish AI
                        <span className="px-2 py-0.5 rounded bg-white/5 text-[10px] font-bold uppercase tracking-wider text-blue-400 border border-blue-400/20">
                          {difficultyPreset.label}
                        </span>
                      </p>
                      <p className="text-xs text-[#8e9192]">Thinking time: {difficultyPreset.movetimeMs}ms</p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${botThinking ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-white/5 border-white/10 text-[#8e9192]'}`}>
                    <div className={`w-2 h-2 rounded-full ${botThinking ? 'bg-blue-400 animate-pulse' : 'bg-slate-600'}`} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">{botThinking ? 'Bot Thinking' : 'Bot Waiting'}</span>
                  </div>
                </div>

                {/* Board Container */}
                <div className="glass-obsidian border border-white/10 p-2 md:p-6 rounded-[2rem] shadow-2xl relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#e9c176]/5 to-transparent pointer-events-none rounded-[2rem]" />
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

                {/* Player Profile Card */}
                <div className="glass-obsidian border border-white/5 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-gold flex items-center justify-center">
                      <span className="text-[#00184a] font-black text-xl">{playerName.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="font-bold text-lg">{playerName}</p>
                      <p className="text-xs text-[#8e9192]">Playing as {humanColor}</p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${isHumanTurn ? 'bg-[#e9c176]/10 border-[#e9c176]/20 text-[#e9c176]' : 'bg-white/5 border-white/10 text-[#8e9192]'}`}>
                    <div className={`w-2 h-2 rounded-full ${isHumanTurn ? 'bg-[#e9c176] animate-pulse' : 'bg-slate-600'}`} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">{isHumanTurn ? 'Your Turn' : 'Waiting'}</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Controls & History */}
              <div className="lg:col-span-4 space-y-6 flex flex-col h-full">
                {/* Action Controls */}
                <div className="glass-obsidian border border-white/5 rounded-3xl p-6 space-y-4">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-[#444748] flex items-center gap-2">
                    <Settings2 className="w-4 h-4" />
                    Controls
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => void returnToSetup()}
                      className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all group"
                    >
                      <RotateCcw className="w-5 h-5 text-[#e9c176] group-hover:rotate-[-30deg] transition-transform" />
                      <span className="text-xs font-bold uppercase tracking-tighter">New Match</span>
                    </button>
                    <button
                      onClick={() => void handleResign()}
                      disabled={phase !== "playing"}
                      className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/10 transition-all group disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Flag className="w-5 h-5 text-rose-400 group-hover:translate-y-[-2px] transition-transform" />
                      <span className="text-xs font-bold uppercase tracking-tighter">Resign</span>
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button className="flex-1 flex items-center justify-center p-3 rounded-xl bg-white/5 opacity-50 cursor-not-allowed" title="Coming soon">
                      <Undo2 className="w-4 h-4" />
                    </button>
                    <button className="flex-1 flex items-center justify-center p-3 rounded-xl bg-white/5 opacity-50 cursor-not-allowed" title="Coming soon">
                      <Redo2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Move History */}
                <div className="glass-obsidian border border-white/5 rounded-3xl p-6 flex-1 flex flex-col min-h-[400px]">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-display font-bold flex items-center gap-2">
                      <History className="w-5 h-5 text-[#e9c176]" />
                      Move History
                    </h3>
                    <span className="px-2 py-1 rounded bg-white/5 text-[10px] font-bold text-[#8e9192]">
                      {moveHistory.length} PLY
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-2" ref={desktopHistoryRef}>
                    {getMoveHistoryRows.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-30">
                        <Swords className="w-12 h-12" />
                        <p className="text-sm font-medium">No moves recorded yet</p>
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-[#0e0e0f]/90 backdrop-blur-sm z-10">
                          <tr className="text-left border-b border-white/5">
                            <th className="py-2 font-bold text-[#444748] uppercase text-[10px] tracking-widest w-12">#</th>
                            <th className="py-2 font-bold text-[#444748] uppercase text-[10px] tracking-widest">White</th>
                            <th className="py-2 font-bold text-[#444748] uppercase text-[10px] tracking-widest">Black</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.02]">
                          {getMoveHistoryRows.map((row) => (
                            <tr key={row.moveNumber} className="group hover:bg-white/[0.02] transition-colors">
                              <td className="py-3 font-mono text-[10px] text-[#444748]">{row.moveNumber}</td>
                              <td className={`py-3 font-bold transition-colors ${row.white?.ply === latestMovePly ? 'text-[#e9c176]' : 'text-[#c4c7c7]'}`}>
                                {row.white?.san ?? "—"}
                              </td>
                              <td className={`py-3 font-bold transition-colors ${row.black?.ply === latestMovePly ? 'text-[#e9c176]' : 'text-[#c4c7c7]'}`}>
                                {row.black?.san ?? "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

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
            label: "Review Match",
            onClick: () => setMatchConclusion(prev => ({ ...prev, isOpen: false })),
            className: "flex-1 rounded-xl border border-[#e9c176]/20 bg-[#e9c176]/10 py-3 font-bold text-[#e9c176] transition hover:bg-[#e9c176]/20",
          },
          {
            label: "New Run",
            onClick: () => { void returnToSetup(); },
            className: "flex-1 rounded-xl bg-gradient-gold py-3 font-bold text-[#00184a] transition hover:scale-[1.02]",
          },
        ]}
      />
    </div>
  );
}

export default PlayVsBot;
