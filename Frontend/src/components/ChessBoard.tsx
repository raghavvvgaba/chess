import type { Color, PieceSymbol, Square } from 'chess.js'
import { useState } from 'react';
import { MOVE } from '../Pages/Game';

function ChessBoard({ board, socket, setBoard, chess }: {
    chess: any;
    setBoard: any;
    board: ({
        square: Square;
        type: PieceSymbol;
        color: Color;
    } | null)[][];
    socket: WebSocket;
}) {
    const [from, setFrom] = useState<Square | null>(null);
    return (
        <div className='text-white-200'>
            {board.map((row, i) => (
                <div key={i} className='flex'>
                    {row.map((square, j) => {
                        const sqaureRepresentation = String.fromCharCode(97 + (j % 8)) + "" + (8 - i) as Square;
                        return <div
                            onClick={() => {
                                if (!from) {
                                    setFrom(sqaureRepresentation);
                                } else {
                                    socket.send(JSON.stringify({
                                        type: MOVE,
                                        payload: {
                                            move: {
                                                from,
                                                to: sqaureRepresentation,
                                            }
                                        }
                                    }));
                                    setFrom(null);
                                    chess.move({
                                        from,
                                        to: sqaureRepresentation
                                    });
                                    setBoard(chess.board());
                                    console.log({ from, to: sqaureRepresentation });
                                }
                            }}
                            key={j}
                            className={`w-16 h-16 ${(i + j) % 2 === 0 ? 'bg-green-500' : 'bg-white'}`}
                        >
                            <div className='w-full justify-center flex h-full'>
                                <div className='h-full justify-center flex flex-col'>
                                    {square ? (
                                        <img
                                            className="w-full h-full object-contain"
                                            src={`/Pieces/${square.color === 'w' ? square.type.toUpperCase() : square.type.toLowerCase()}.png`}
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