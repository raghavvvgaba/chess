import { pool } from "./db.js";

export type PublicUserProfile = {
    id: string;
    name: string;
    email: string;
    chessUserId: string;
};

export async function getUserProfileById(userId: string): Promise<PublicUserProfile | null> {
    const result = await pool.query<{
        id: string;
        name: string;
        email: string;
        chess_user_id: string;
    }>(
        `SELECT id, name, email, chess_user_id
         FROM "user"
         WHERE id = $1`,
        [userId]
    );

    const row = result.rows[0];
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        name: row.name,
        email: row.email,
        chessUserId: row.chess_user_id
    };
}
