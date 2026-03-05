import React, { useState, useEffect, useRef } from 'react'
import ChessBoard from '../components/ChessBoard'
import useSocket from '../hooks/useSocket';
import { Chess } from 'chess.js';

// TODO: Move together, code repitition
export const INIT_GAME = "init_game"
export const MOVE = "move";
export const GAME_OVER = "game_over";

function Game() {
    const socket = useSocket();
    const chessRef = useRef(new Chess());
    const [board, setBoard] = useState(chessRef.current.board());
    const [gameStarted, setGameStarted] = useState(false);

    useEffect(() => {
        if (!socket)
            return;
        socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            console.log(message);
            switch (message.type) {
                case INIT_GAME:
                    setBoard(chessRef.current.board());
                    setGameStarted(true);
                    console.log("Game initialized");
                    break
                case MOVE:
                    const move = message.payload;
                    chessRef.current.move(move);
                    setBoard(chessRef.current.board());
                    console.log("Move made");
                    break;
                case GAME_OVER:
                    console.log("Game over");
                    break;
            }
        }
        return () => {
            socket.onmessage = null;
        };
    }, [socket])

    if (!socket) return <div>Connecting...</div>


    return (
        <main className="min-h-screen bg-[#262522] flex flex-col lg:flex-row items-center justify-center p-4 gap-8">
            {/* Left: Chess Board */}
            <section className="flex-1 flex flex-col items-center w-full max-w-2xl">
                {/* Replace this with your ChessBoard component import later */}
                <div className="w-full aspect-square max-w-xl bg-[#f0d9b5] rounded-lg shadow-lg flex items-center justify-center">
                    <ChessBoard chess={chessRef.current} setBoard={setBoard} socket={socket} board={board} />
                </div>
            </section>
            {/* Right: Controls */}
            <aside className="w-full max-w-xs flex flex-col items-center gap-8 mt-8 lg:mt-0">
                {!gameStarted && <button onClick={() => {
                    socket.send(JSON.stringify({
                        type: "init_game",
                    }))
                }} className="w-full bg-[#b58863] hover:bg-[#a0764b] text-white font-bold text-2xl px-8 py-5 rounded-xl shadow transition-colors">
                    Start Game
                </button>}
            </aside>
        </main>
    )
}

export default Game;