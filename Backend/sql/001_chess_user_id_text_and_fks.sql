-- Run this after Better Auth tables are created.
-- It aligns chess tables with Better Auth user.id (text).

ALTER TABLE games
    ALTER COLUMN white_user_id TYPE text USING white_user_id::text,
    ALTER COLUMN black_user_id TYPE text USING black_user_id::text;

ALTER TABLE moves
    ALTER COLUMN played_by_user_id TYPE text USING played_by_user_id::text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'games_white_user_id_fkey'
    ) THEN
        ALTER TABLE games
            ADD CONSTRAINT games_white_user_id_fkey
            FOREIGN KEY (white_user_id) REFERENCES "user"(id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'games_black_user_id_fkey'
    ) THEN
        ALTER TABLE games
            ADD CONSTRAINT games_black_user_id_fkey
            FOREIGN KEY (black_user_id) REFERENCES "user"(id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'moves_played_by_user_id_fkey'
    ) THEN
        ALTER TABLE moves
            ADD CONSTRAINT moves_played_by_user_id_fkey
            FOREIGN KEY (played_by_user_id) REFERENCES "user"(id);
    END IF;
END $$;
