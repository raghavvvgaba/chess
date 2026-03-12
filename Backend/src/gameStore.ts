import { pool } from "./db.js";

type GameStatus = "active" | "finished" | "aborted";
type GameResult = "white" | "black" | "draw" | null;

type CreateGameInput = {
    whiteUserId: string;
    blackUserId: string;
};

type SaveMoveInput = {
    gameId: string;
    ply: number;
    san: string;
    uci: string;
    fenAfter: string;
    playedByUserId: string;
};

type FinishGameInput = {
    gameId: string;
    status: GameStatus;
    result: GameResult;
};

export async function createGame(input: CreateGameInput) {
    const result = await pool.query<{ id: string }>(
        `INSERT INTO games (white_user_id, black_user_id, status, started_at)
         VALUES ($1, $2, 'active', now())
         RETURNING id`,
        [input.whiteUserId, input.blackUserId]
    );
    return result.rows[0];
}

export async function saveMove(input: SaveMoveInput) {
    await pool.query(
        `INSERT INTO moves (game_id, ply, san, uci, fen_after, played_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [input.gameId, input.ply, input.san, input.uci, input.fenAfter, input.playedByUserId]
    );
}

export async function finishGame(input: FinishGameInput) {
    await pool.query(
        `UPDATE games
         SET status = $2,
             result = $3,
             ended_at = now()
         WHERE id = $1`,
        [input.gameId, input.status, input.result]
    );
}

export async function getGameById(gameId: string) {
    const result = await pool.query<{
        id: string;
        white_user_id: string;
        black_user_id: string;
        status: GameStatus;
        result: GameResult;
        started_at: string | null;
        ended_at: string | null;
        created_at: string;
    }>(
        `SELECT id, white_user_id, black_user_id, status, result, started_at, ended_at, created_at
         FROM games
         WHERE id = $1`,
        [gameId]
    );

    return result.rows[0] ?? null;
}
