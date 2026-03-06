import type { Color, PieceSymbol, Square } from 'chess.js'
import { useEffect, useState } from 'react';
import { MOVE } from '../Pages/Game';

type PlayerColor = "white" | "black" | null;
type Turn = "w" | "b" | null;

function ChessBoard({
    board,
    socket,
    isInteractive = true,
    playerColor,
    currentTurn,
    orientation = "white",
    setStatusMessage
}: {
    board: ({
        square: Square;
        type: PieceSymbol;
        color: Color;
    } | null)[][];
    socket: WebSocket;
    isInteractive?: boolean;
    playerColor: PlayerColor;
    currentTurn: Turn;
    orientation?: "white" | "black";
    setStatusMessage: (message: string) => void;
}) {
    const [from, setFrom] = useState<Square | null>(null);

    useEffect(() => {
        setFrom(null);
    }, [board, currentTurn, orientation]);

    const myColorSymbol = playerColor === "white" ? "w" : playerColor === "black" ? "b" : null;
    const isPlayersTurn = myColorSymbol ? currentTurn === myColorSymbol : false;

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
        <div className='text-white-200'>
            {Array.from({ length: 8 }, (_, displayRow) => (
                <div key={displayRow} className='flex'>
                    {Array.from({ length: 8 }, (_, displayCol) => {
                        const { boardRow, boardCol } = getBoardCoordinates(displayRow, displayCol);
                        const square = board[boardRow][boardCol];
                        const squareRepresentation = `${String.fromCharCode(97 + boardCol)}${8 - boardRow}` as Square;
                        const isSelected = from === squareRepresentation;
                        const fileLabel = String.fromCharCode(65 + boardCol);
                        const rankLabel = 8 - boardRow;
                        const isLightSquare = (displayRow + displayCol) % 2 !== 0;
                        const labelClassName = isLightSquare ? "text-slate-700" : "text-slate-100";
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
                                    if (square && square.color === myColorSymbol) {
                                        setFrom(squareRepresentation);
                                        return;
                                    }
                                    socket.send(JSON.stringify({
                                        type: MOVE,
                                        payload: {
                                            move: {
                                                from,
                                                to: squareRepresentation,
                                            }
                                        }
                                    }));
                                    setFrom(null);
                                    setStatusMessage("");
                                }
                            }}
                            key={`${boardRow}-${boardCol}`}
                            className={`w-16 h-16 relative ${(displayRow + displayCol) % 2 === 0 ? 'bg-green-500' : 'bg-white'} ${isSelected ? "ring-2 ring-yellow-300" : ""}`}
                        >
                            {displayCol === 0 && (
                                <span className={`absolute top-1 left-1 text-[10px] font-semibold ${labelClassName}`}>
                                    {rankLabel}
                                </span>
                            )}
                            {displayRow === 7 && (
                                <span className={`absolute bottom-1 right-1 text-[10px] font-semibold ${labelClassName}`}>
                                    {fileLabel}
                                </span>
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
                </div>
            ))}
        </div>
    );
}

export default ChessBoard
