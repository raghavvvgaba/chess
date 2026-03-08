import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js'
import React, { useEffect, useMemo, useState } from 'react';

type PlayerColor = "white" | "black" | null;
type Turn = "w" | "b" | null;
type LastMove = { from: Square; to: Square } | null;
type PromotionPiece = "q" | "r" | "b" | "n";

function ChessBoard({
    board,
    isInteractive = true,
    playerColor,
    currentTurn,
    orientation = "white",
    setStatusMessage,
    fen,
    lastMove,
    checkedKingSquare,
    onMoveRequest,
    onPromotionRequired
}: {
    board: ({
        square: Square;
        type: PieceSymbol;
        color: Color;
    } | null)[][];
    isInteractive?: boolean;
    playerColor: PlayerColor;
    currentTurn: Turn;
    orientation?: "white" | "black";
    setStatusMessage: (message: string) => void;
    fen: string;
    lastMove: LastMove;
    checkedKingSquare: Square | null;
    onMoveRequest: (move: { from: Square; to: Square; promotion?: PromotionPiece }) => void;
    onPromotionRequired: (payload: {
        from: Square;
        to: Square;
        availablePromotions: PromotionPiece[];
    }) => void;
}) {
    const [from, setFrom] = useState<Square | null>(null);
    const [hoveredSquare, setHoveredSquare] = useState<Square | null>(null);

    useEffect(() => {
        setFrom(null);
    }, [board, currentTurn, orientation]);

    const myColorSymbol = playerColor === "white" ? "w" : playerColor === "black" ? "b" : null;
    const isPlayersTurn = myColorSymbol ? currentTurn === myColorSymbol : false;

    const legalMoves = useMemo<Move[]>(() => {
        if (!from) {
            return [];
        }
        try {
            const chess = new Chess(fen);
            return chess.moves({ square: from, verbose: true });
        } catch (e) {
            console.log(e);
            return [];
        }
    }, [fen, from]);

    const legalTargetSquares = useMemo(() => {
        return new Set(legalMoves.map((move) => move.to));
    }, [legalMoves]);

    const captureTargetSquares = useMemo(() => {
        return new Set(
            legalMoves
                .filter((move) => typeof move.captured !== "undefined")
                .map((move) => move.to)
        );
    }, [legalMoves]);

    const getBoardCoordinates = (displayRow: number, displayCol: number) => {
        if (orientation === "black") {
            return {
                boardRow: 7 - displayRow,
                boardCol: 7 - displayCol
            };
        }
        return {
            boardRow: displayRow,
            boardCol: displayCol
        };
    };

    return (
        <div className='w-full aspect-square border-2 border-[#8b6542] rounded-sm overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,0.06)] grid grid-cols-8 grid-rows-8'>
            {Array.from({ length: 8 }, (_, displayRow) => (
                <React.Fragment key={displayRow}>
                    {Array.from({ length: 8 }, (_, displayCol) => {
                        const { boardRow, boardCol } = getBoardCoordinates(displayRow, displayCol);
                        const square = board[boardRow][boardCol];
                        const squareRepresentation = `${String.fromCharCode(97 + boardCol)}${8 - boardRow}` as Square;
                        const isSelected = from === squareRepresentation;
                        const fileLabel = String.fromCharCode(65 + boardCol);
                        const rankLabel = 8 - boardRow;
                        const isLightSquare = (displayRow + displayCol) % 2 === 0;
                        const labelClassName = isLightSquare ? "text-[#7a5a3a]" : "text-[#f3e7d3]";
                        return <div
                            onClick={() => {
                                if (!isInteractive) {
                                    return;
                                }
                                if (!myColorSymbol) {
                                    return;
                                }
                                if (!from) {
                                    if (!isPlayersTurn) {
                                        setStatusMessage("Not your turn.");
                                        return;
                                    }
                                    if (!square || square.color !== myColorSymbol) {
                                        return;
                                    }
                                    setFrom(squareRepresentation);
                                    setStatusMessage("");
                                } else {
                                    if (squareRepresentation === from) {
                                        setFrom(null);
                                        return;
                                    }
                                    if (square && square.color === myColorSymbol) {
                                        setFrom(squareRepresentation);
                                        return;
                                    }
                                    if (!legalTargetSquares.has(squareRepresentation)) {
                                        setStatusMessage("Illegal move.");
                                        return;
                                    }
                                    const legalMovesToTarget = legalMoves.filter((move) => move.to === squareRepresentation);
                                    const promotionOptions = Array.from(
                                        new Set(
                                            legalMovesToTarget
                                                .map((move) => move.promotion)
                                                .filter((promotion): promotion is PromotionPiece =>
                                                    promotion === "q" || promotion === "r" || promotion === "b" || promotion === "n"
                                                )
                                        )
                                    );

                                    if (promotionOptions.length > 0) {
                                        onPromotionRequired({
                                            from,
                                            to: squareRepresentation,
                                            availablePromotions: promotionOptions
                                        });
                                        setFrom(null);
                                        setStatusMessage("");
                                        return;
                                    }

                                    onMoveRequest({
                                        from,
                                        to: squareRepresentation,
                                    });
                                    setFrom(null);
                                    setStatusMessage("");
                                }
                            }}
                            onMouseEnter={() => setHoveredSquare(squareRepresentation)}
                            onMouseLeave={() => setHoveredSquare((previous) => (previous === squareRepresentation ? null : previous))}
                            key={`${boardRow}-${boardCol}`}
                            className={`w-full h-full relative ${isLightSquare ? 'bg-[#f0d9b5]' : 'bg-[#b58863]'} ${isSelected ? "ring-2 ring-yellow-300 z-10" : ""} ${lastMove?.from === squareRepresentation || lastMove?.to === squareRepresentation ? "shadow-[inset_0_0_0_999px_rgba(245,158,11,0.18)]" : ""} ${checkedKingSquare === squareRepresentation ? "ring-2 ring-red-500 z-10" : ""} ${hoveredSquare === squareRepresentation ? "brightness-105" : ""}`}
                        >
                            {displayCol === 0 && (
                                <span className={`absolute top-[2%] left-[4%] text-[clamp(8px,1.5vw,12px)] font-semibold ${labelClassName}`}>
                                    {rankLabel}
                                </span>
                            )}
                            {displayRow === 7 && (
                                <span className={`absolute bottom-[2%] right-[4%] text-[clamp(8px,1.5vw,12px)] font-semibold ${labelClassName}`}>
                                    {fileLabel}
                                </span>
                            )}
                            {from && legalTargetSquares.has(squareRepresentation) && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    {captureTargetSquares.has(squareRepresentation) ? (
                                        <div className="w-[85%] h-[85%] rounded-full border-[3px] sm:border-4 border-black/35" />
                                    ) : (
                                        <div className="w-[25%] h-[25%] rounded-full bg-black/30" />
                                    )}
                                </div>
                            )}
                            <div className='w-full justify-center flex h-full'>
                                <div className='h-full justify-center flex flex-col'>
                                    {square ? (
                                        <img
                                            className="w-full h-full object-contain"
                                            src={`/Pieces/${square.color === 'w' ? `w${square.type}` : square.type}.png`}
                                            alt={`${square.color}${square.type}`}
                                        />
                                    ) : ""}
                                </div>
                            </div>
                        </div>
                    })}
                </React.Fragment>
            ))}
        </div>
    );
}

export default ChessBoard
