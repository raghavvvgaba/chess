-- ============================================
-- Migration: 002_enums_and_indexes.sql
-- Description: Convert TEXT+CHECK to ENUMs, add indexes
-- Date: 2026-03-12
-- ============================================

-- 1. Create ENUM types
CREATE TYPE game_status AS ENUM ('active', 'finished', 'aborted');
CREATE TYPE game_result AS ENUM ('white', 'black', 'draw');

-- 2. Drop ALL constraints referencing status/result
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_status_check;
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_result_check;
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_check1;

-- 3. Drop default, alter status column, restore default
ALTER TABLE games ALTER COLUMN status DROP DEFAULT;

ALTER TABLE games 
  ALTER COLUMN status TYPE game_status 
  USING status::game_status;

ALTER TABLE games 
  ALTER COLUMN status SET DEFAULT 'active'::game_status;

-- 4. Alter result column
ALTER TABLE games 
  ALTER COLUMN result TYPE game_result 
  USING result::game_result;

-- 5. Re-add the business constraint (finished → result not null)
ALTER TABLE games 
  ADD CONSTRAINT games_finished_has_result 
  CHECK (status = 'finished' OR result IS NULL);

-- 6. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_moves_game_id ON moves(game_id);
CREATE INDEX IF NOT EXISTS idx_games_white_user_id ON games(white_user_id);
CREATE INDEX IF NOT EXISTS idx_games_black_user_id ON games(black_user_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
