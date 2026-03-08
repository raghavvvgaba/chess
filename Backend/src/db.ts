import "dotenv/config";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing. Add it in Backend/.env.");
}

export const pool = new Pool({
    connectionString: databaseUrl
});

export async function verifyDatabaseConnection() {
    const client = await pool.connect();
    try {
        const result = await client.query<{
            now: string;
            current_database: string;
            current_user: string;
        }>("SELECT NOW(), current_database(), current_user;");
        const row = result.rows[0];
        console.log(
            `Connected to DB '${row.current_database}' as '${row.current_user}' at ${row.now}`
        );
    } finally {
        client.release();
    }
}