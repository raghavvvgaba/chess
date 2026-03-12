CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE game_status AS ENUM ('active', 'finished', 'aborted');
CREATE TYPE game_result AS ENUM ('white', 'black', 'draw');

CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  white_user_id TEXT NOT NULL REFERENCES "user"(id),
  black_user_id TEXT NOT NULL REFERENCES "user"(id),
  status game_status NOT NULL DEFAULT 'active',
  result game_result,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (white_user_id <> black_user_id),
  CHECK (status = 'finished' OR result IS NULL)
);

CREATE TABLE IF NOT EXISTS moves (
  id BIGSERIAL PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  ply INTEGER NOT NULL CHECK (ply > 0),
  san TEXT NOT NULL,
  uci TEXT NOT NULL,
  fen_after TEXT NOT NULL,
  played_by_user_id TEXT NOT NULL REFERENCES "user"(id),
  played_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (game_id, ply)
);

CREATE INDEX IF NOT EXISTS idx_games_created_at ON games (created_at DESC);
