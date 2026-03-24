import { pool } from "./db.js";
import type { RuntimeMoveRecord } from "./runtimeGameStore.js";

type GameStatus = "active" | "finished" | "aborted";
type GameResult = "white" | "black" | "draw" | null;
type MatchOutcome = "win" | "loss" | "draw" | "aborted" | "in_progress";

type CreateGameInput = {
    whiteUserId: string;
    blackUserId: string;
    roomCode: string;
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
        `INSERT INTO games (white_user_id, black_user_id, room_code, status, started_at)
         VALUES ($1, $2, $3, 'active', now())
         RETURNING id`,
        [input.whiteUserId, input.blackUserId, input.roomCode]
    );
    return result.rows[0];
}

export async function isRoomCodeTaken(roomCode: string) {
    const result = await pool.query<{ exists: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM games WHERE room_code = $1) AS exists`,
        [roomCode]
    );
    return !!result.rows[0]?.exists;
}

export async function saveMove(input: SaveMoveInput) {
    await pool.query(
        `INSERT INTO moves (game_id, ply, san, uci, fen_after, played_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (game_id, ply) DO NOTHING`,
        [input.gameId, input.ply, input.san, input.uci, input.fenAfter, input.playedByUserId]
    );
}

export async function saveMovesBatch(input: { gameId: string; moves: RuntimeMoveRecord[] }) {
    for (const move of input.moves) {
        await saveMove({
            gameId: input.gameId,
            ply: move.ply,
            san: move.san,
            uci: move.uci,
            fenAfter: move.fenAfter,
            playedByUserId: move.playedByUserId
        });
    }
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

export async function getMatchHistoryByUserId(userId: string, limit = 50) {
    const cappedLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 100) : 50;

    const result = await pool.query<{
        id: string;
        status: GameStatus;
        result: GameResult;
        started_at: string | null;
        ended_at: string | null;
        created_at: string;
        player_color: "white" | "black";
        opponent_user_id: string;
        opponent_name: string;
        outcome: MatchOutcome;
    }>(
        `SELECT
            g.id,
            g.status,
            g.result,
            g.started_at,
            g.ended_at,
            g.created_at,
            CASE
                WHEN g.white_user_id = $1 THEN 'white'
                ELSE 'black'
            END AS player_color,
            CASE
                WHEN g.white_user_id = $1 THEN g.black_user_id
                ELSE g.white_user_id
            END AS opponent_user_id,
            COALESCE(
                CASE
                    WHEN g.white_user_id = $1 THEN NULLIF(TRIM(black_user.name), '')
                    ELSE NULLIF(TRIM(white_user.name), '')
                END,
                CASE
                    WHEN g.white_user_id = $1 THEN NULLIF(SPLIT_PART(black_user.email, '@', 1), '')
                    ELSE NULLIF(SPLIT_PART(white_user.email, '@', 1), '')
                END,
                'Unknown Player'
            ) AS opponent_name,
            CASE
                WHEN g.status = 'active' THEN 'in_progress'
                WHEN g.status = 'aborted' THEN 'aborted'
                WHEN g.result = 'draw' THEN 'draw'
                WHEN (g.result = 'white' AND g.white_user_id = $1)
                    OR (g.result = 'black' AND g.black_user_id = $1) THEN 'win'
                ELSE 'loss'
            END AS outcome
        FROM games g
        LEFT JOIN "user" white_user ON white_user.id = g.white_user_id
        LEFT JOIN "user" black_user ON black_user.id = g.black_user_id
        WHERE g.white_user_id = $1 OR g.black_user_id = $1
        ORDER BY COALESCE(g.ended_at, g.started_at, g.created_at) DESC
        LIMIT $2`,
        [userId, cappedLimit]
    );

    return result.rows;
}
