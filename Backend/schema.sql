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
CREATE INDEX IF NOT EXISTS idx_moves_game_id ON moves (game_id);
CREATE INDEX IF NOT EXISTS idx_games_white_user_id ON games (white_user_id);
CREATE INDEX IF NOT EXISTS idx_games_black_user_id ON games (black_user_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON games (status);

CREATE TABLE IF NOT EXISTS friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  addressee_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (requester_user_id <> addressee_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS friendships_requester_addressee_unique
ON friendships (requester_user_id, addressee_user_id);

CREATE INDEX IF NOT EXISTS friendships_requester_idx
ON friendships (requester_user_id);

CREATE INDEX IF NOT EXISTS friendships_addressee_idx
ON friendships (addressee_user_id);

CREATE INDEX IF NOT EXISTS friendships_status_idx
ON friendships (status);

CREATE OR REPLACE FUNCTION set_friendships_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS friendships_set_updated_at ON friendships;

CREATE TRIGGER friendships_set_updated_at
BEFORE UPDATE ON friendships
FOR EACH ROW
EXECUTE FUNCTION set_friendships_updated_at();
