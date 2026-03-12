# Backend Architecture

This document provides a complete overview of the backend architecture, including file responsibilities, function descriptions, and data flow.

## High-Level Architecture

The backend is a Node.js/Express application that provides:
- Authentication via Better Auth (email/password + Google OAuth)
- Real-time gameplay via WebSocket
- Game state persistence in PostgreSQL
- In-memory game management for active matches

The server runs on a single port (default 8080) and handles both HTTP and WebSocket connections. Authentication is cookie-based and reused for WebSocket access control.

## Technology Stack

- **Runtime**: Node.js with TypeScript (ESM modules)
- **Web Framework**: Express 5.x
- **WebSocket**: ws library
- **Authentication**: Better Auth 1.5.4
- **Database**: PostgreSQL with pg driver
- **Chess Logic**: chess.js library
- **Session Storage**: PostgreSQL (via Better Auth)

## Server Entry Point

### `src/index.ts`

Main server bootstrap file. Sets up Express, HTTP server, WebSocket server, and handles WebSocket authentication.

**Responsibilities**:
- Initialize Express app with CORS
- Mount auth routes under `/api/auth/*`
- Create HTTP server
- Create WebSocket server on `/ws` path
- Authenticate WebSocket connections using existing session
- Route authenticated sockets to GameManager

**Functions**:
- `rejectUpgrade(socket, statusLine)` - Sends HTTP error response and destroys socket for rejected WebSocket upgrades
- `bootstrap()` - Main async initialization function that:
  - Verifies database connection
  - Creates Express app
  - Configures CORS with credentials support
  - Mounts Better Auth handler
  - Sets up WebSocket server with noServer mode
  - Handles WebSocket upgrade requests with session validation
  - Starts listening on configured port

**WebSocket Authentication Flow** (`src/index.ts:46-76`):
1. Client initiates upgrade to `/ws`
2. Server extracts session from cookies via `auth.api.getSession()`
3. If no valid session → reject with 401
4. If valid session → attach `userId` and `userName` to socket
5. Emit socket to GameManager

---

## Authentication

### `src/auth.ts`

Better Auth configuration. Defines how users authenticate and what providers are available.

**Responsibilities**:
- Configure Better Auth instance
- Define authentication providers (email/password, Google OAuth)
- Set database connection for session storage
- Configure trusted origins for CORS

**Configuration**:
- `baseURL` - Backend URL (default: `http://localhost:8080`)
- `secret` - Secret key for signing sessions (from `BETTER_AUTH_SECRET`)
- `trustedOrigins` - Allowed frontend origins (from `FRONTEND_ORIGIN`)
- `database` - PostgreSQL pool for session/user storage
- `emailAndPassword.enabled` - Enables email/password authentication
- `socialProviders.google` - Google OAuth configuration

**Exports**:
- `auth` - Configured Better Auth instance used by:
  - `index.ts` for route handling and session validation
  - WebSocket upgrade for session extraction

**Required Environment Variables**:
- `BETTER_AUTH_SECRET` - Secret for session signing
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret

---

## Database

### `src/db.ts`

PostgreSQL connection pool and database utilities.

**Responsibilities**:
- Create and export PostgreSQL connection pool
- Verify database connectivity on startup

**Exports**:
- `pool` - PostgreSQL Pool instance used by:
  - `auth.ts` for user/session storage
  - `gameStore.ts` for game/move persistence

**Functions**:
- `verifyDatabaseConnection()` - Async function that:
  - Acquires a client from the pool
  - Runs a simple query to verify connectivity
  - Logs database name, user, and timestamp
  - Releases client back to pool

**Required Environment Variables**:
- `DATABASE_URL` - PostgreSQL connection string

---

## Game Management

### `src/GameManager.ts`

Central coordinator for all active games and connected users. Handles matchmaking and routes WebSocket messages to appropriate handlers.

**Responsibilities**:
- Track all connected users
- Manage single-slot matchmaking queue
- Create new games when two players match
- Route move requests to correct game instances
- Handle rematch requests
- Clean up games on player disconnect

**Properties**:
- `games: Game[]` - Array of all active Game instances
- `pendingUser: AuthenticatedSocket | null` - Single waiting player for matchmaking
- `users: AuthenticatedSocket[]` - All connected authenticated sockets

**Methods**:
- `addUser(socket)` - Registers a new connected user and attaches message handlers
- `removeUser(socket)` - Removes user from tracking, clears pending status, and handles game cleanup on disconnect
- `addHandler(socket)` (private) - Attaches WebSocket message handlers for:
  - `INIT_GAME` - Matchmaking logic (see below)
  - `CANCEL_MATCHMAKING` - Removes user from queue
  - `MOVE` - Routes move to the player's active game
  - `REMATCH_REQUEST` - Routes rematch request to the player's concluded game

**Matchmaking Flow** (`GameManager.ts:37-68`):
1. First player sends `INIT_GAME`
   - If already waiting → send `ALREADY_WAITING`
   - If no one waiting → store as `pendingUser`, send `WAITING_FOR_OPPONENT`
2. Second player sends `INIT_GAME`
   - Retrieve waiting player from `pendingUser`
   - Clear `pendingUser`
   - Persist game to database via `createGame()`
   - Create in-memory `Game` instance
   - Add to `games` array
   - On DB failure → send `MATCHMAKING_CANCELLED` to both

**Architecture Notes**:
- Matchmaking is process-local (single `pendingUser` variable)
- Does not scale across multiple backend instances without additional infrastructure
- First player to queue becomes white, second becomes black
- Game is persisted to DB before in-memory object is created

---

### `src/Game.ts`

Represents a single active chess game. Manages board state, move validation, and player communication.

**Responsibilities**:
- Maintain chess board state using chess.js
- Validate and apply moves
- Detect game over conditions
- Send game state updates to both players
- Handle rematch logic
- Handle player disconnect during game

**Properties**:
- `player1`, `player2` - WebSocket references to both players
- `board` - chess.js Chess instance
- `startTime` - When the game started
- `whitePlayer`, `blackPlayer` - References to player sockets by color
- `isConcluded` - Whether the game has ended
- `rematchRequestedByWhite`, `rematchRequestedByBlack` - Rematch state flags
- `ply` - Current move number (half-moves)
- `gameId` - Database ID of the game

**Methods**:
- `containsPlayer(socket)` - Checks if a socket belongs to this game
- `makeMove(socket, move)` - Validates and applies a move:
  - Validates move structure
  - Checks if it's the player's turn
  - Applies move via chess.js
  - Sends `MOVE_APPLIED` to both players
  - Persists move to database via `saveMove()`
  - Checks for game over conditions
- `requestRematch(socket)` - Handles rematch request:
  - Only works if game is concluded
  - Tracks which color requested
  - If both requested → starts rematch with swapped colors
- `handleDisconnect(socket)` - Handles player disconnect:
  - If game ongoing → opponent wins by forfeit
  - If game concluded → notifies opponent about rematch cancellation

**Private Methods**:
- `startRematchWithSwappedColors()` - Resets board, swaps colors, starts new game
- `sendInitGameMessages()` - Sends `INIT_GAME` to both players with their color assignment
- `getBoardGameOverPayload()` - Determines game result (checkmate, stalemate, draw types)
- `finishGame(payload)` - Marks game concluded, notifies players, persists result
- `sendRematchState(status)` - Broadcasts rematch request status
- `sendMoveRejected(socket, reason)` - Sends rejection message to player
- `getColorForSocket(socket)` - Returns "white", "black", or null for a socket
- `sendToBoth(message)` - Sends message to both players
- `sendToSocket(socket, message)` - Sends message to single player if socket is open
- `getResultForPersistence(winnerColor)` - Converts winner color to DB enum value

**Game Over Detection**:
- Checkmate
- Stalemate
- Threefold repetition
- Insufficient material
- Fifty-move rule
- Other draws

**Architecture Notes**:
- Game state lives in memory during play
- Database row is created before Game instance
- Each move is persisted asynchronously (fire-and-forget)
- Game result is persisted on conclusion
- Rematch uses same Game instance with reset state

---

### `src/gameStore.ts`

Database operations for games and moves. All functions are async and return Promises.

**Responsibilities**:
- Create new game records
- Save individual moves
- Update game status and result on completion
- Query game by ID

**Types**:
- `GameStatus` - "waiting" | "active" | "finished" | "aborted"
- `GameResult` - "white" | "black" | "draw" | null
- `CreateGameInput` - { whiteUserId, blackUserId }
- `SaveMoveInput` - { gameId, ply, san, uci, fenAfter, playedByUserId }
- `FinishGameInput` - { gameId, status, result }

**Functions**:
- `createGame(input)` - Inserts new game row:
  - Sets status to 'active'
  - Sets started_at to now()
  - Returns `{ id }` (UUID generated by Postgres)
  - Used by: `GameManager.ts:48`
  
- `saveMove(input)` - Inserts move record:
  - Records ply number, SAN notation, UCI notation
  - Stores FEN after move
  - Links to user who played it
  - Used by: `Game.ts:129`
  
- `finishGame(input)` - Updates game on completion:
  - Sets status to 'finished'
  - Records result (winner or draw)
  - Sets ended_at timestamp
  - Used by: `Game.ts:317`
  
- `getGameById(gameId)` - Retrieves game record:
  - Returns all game fields or null
  - Currently unused but available for future features

---

## Type Definitions

### `src/socketTypes.ts`

TypeScript type definition for authenticated WebSocket connections.

**Types**:
- `AuthenticatedSocket` - Extends WebSocket with:
  - `userId: string` - User's database ID from session
  - `userName: string` - Display name from session (name or email prefix)

**Usage**:
- Created during WebSocket upgrade in `index.ts:64-69`
- Used throughout GameManager and Game for type safety

---

## Message Types

### `src/messages.ts`

String constants for WebSocket message types used between frontend and backend.

**Client → Server Messages**:
- `INIT_GAME` - Request to start/join matchmaking
- `CANCEL_MATCHMAKING` - Leave the matchmaking queue
- `MOVE` - Submit a chess move
- `REMATCH_REQUEST` - Request a rematch after game ends

**Server → Client Messages**:
- `INIT_GAME` - Game has started (includes color, FEN, player names)
- `WAITING_FOR_OPPONENT` - Added to matchmaking queue
- `ALREADY_WAITING` - Already in queue (duplicate request)
- `MATCHMAKING_CANCELLED` - Removed from queue
- `MOVE_APPLIED` - Move was accepted and applied
- `MOVE_REJECTED` - Move was invalid
- `GAME_OVER` - Game has concluded
- `REMATCH_STATE` - Update on rematch request status
- `REMATCH_DECLINED` - Rematch cannot happen

---

## Database Schema

### `schema.sql`

Core application tables for games and moves.

**Tables**:

#### `games`
- `id` - UUID primary key (auto-generated)
- `white_user_id` - TEXT FK to user.id
- `black_user_id` - TEXT FK to user.id
- `status` - TEXT enum: 'waiting' | 'active' | 'finished' | 'aborted'
- `result` - TEXT enum: 'white' | 'black' | 'draw' (nullable)
- `started_at` - TIMESTAMPTZ
- `ended_at` - TIMESTAMPTZ
- `created_at` - TIMESTAMPTZ (default now())

**Constraints**:
- white_user_id ≠ black_user_id
- result can only be set when status = 'finished'

**Indexes**:
- `idx_games_created_at` - For querying recent games

#### `moves`
- `id` - BIGSERIAL primary key
- `game_id` - UUID FK to games.id (cascade delete)
- `ply` - INTEGER (move number, > 0)
- `san` - TEXT (Standard Algebraic Notation)
- `uci` - TEXT (Universal Chess Interface notation)
- `fen_after` - TEXT (board state after move)
- `played_by_user_id` - TEXT FK to user.id
- `played_at` - TIMESTAMPTZ (default now())

**Constraints**:
- Unique (game_id, ply) - No duplicate move numbers

---

### `sql/better-auth.sql`

Authentication tables managed by Better Auth.

**Tables**:

#### `user`
- `id` - TEXT primary key
- `name` - TEXT
- `email` - TEXT (unique)
- `emailVerified` - BOOLEAN
- `image` - TEXT (nullable)
- `createdAt`, `updatedAt` - TIMESTAMPTZ

#### `session`
- `id` - TEXT primary key
- `expiresAt` - TIMESTAMPTZ
- `token` - TEXT (unique)
- `createdAt`, `updatedAt` - TIMESTAMPTZ
- `ipAddress`, `userAgent` - TEXT (nullable)
- `userId` - TEXT FK to user.id (cascade)

**Indexes**:
- `session_userId_idx` - For user's sessions lookup

#### `account`
- `id` - TEXT primary key
- `accountId` - TEXT
- `providerId` - TEXT (e.g., "google", "credential")
- `userId` - TEXT FK to user.id (cascade)
- `accessToken`, `refreshToken`, `idToken` - TEXT (nullable)
- `accessTokenExpiresAt`, `refreshTokenExpiresAt` - TIMESTAMPTZ (nullable)
- `scope` - TEXT (nullable)
- `password` - TEXT (nullable, hashed)
- `createdAt`, `updatedAt` - TIMESTAMPTZ

**Indexes**:
- `account_userId_idx` - For user's accounts lookup

#### `verification`
- `id` - TEXT primary key
- `identifier` - TEXT (email for verification)
- `value` - TEXT (verification token)
- `expiresAt` - TIMESTAMPTZ
- `createdAt`, `updatedAt` - TIMESTAMPTZ

**Indexes**:
- `verification_identifier_idx` - For verification lookup

---

### `sql/001_chess_user_id_text_and_fks.sql`

Migration file for aligning user ID types between Better Auth and chess schema.

**Purpose**:
- Ensures foreign key compatibility between:
  - Better Auth's `user.id` (TEXT)
  - Chess app's `games.white_user_id`, `games.black_user_id` (TEXT)
  - Chess app's `moves.played_by_user_id` (TEXT)

---

## HTTP Routes

### Authentication Routes (handled by Better Auth)

All routes are mounted under `/api/auth/*` and managed by the Better Auth library.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/sign-up/email` | Create account with email/password |
| POST | `/api/auth/sign-in/email` | Sign in with email/password |
| POST | `/api/auth/sign-in/social` | Initiate OAuth flow (Google) |
| GET | `/api/auth/callback/google` | OAuth callback handler |
| GET | `/api/auth/get-session` | Get current session/user |
| POST | `/api/auth/sign-out` | End session |

**Note**: These routes are library-managed. No custom controllers exist.

### Application Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check endpoint |

---

## WebSocket Protocol

### Connection

- **Path**: `/ws`
- **Authentication**: Required (session cookie validated on upgrade)
- **Protocol**: JSON messages over WebSocket

### Message Flow

```
Frontend                    Backend                      Database
   |                          |                            |
   |-- INIT_GAME ------------>|                            |
   |                          |                            |
   |<-- WAITING_FOR_OPPONENT -|                            |
   |                          |                            |
   |                          |<--- createGame() --------->|
   |                          |                            |
   |<-- INIT_GAME ------------|                            |
   |                          |                            |
   |-- MOVE ----------------->|                            |
   |                          |<--- saveMove() ------------>|
   |<-- MOVE_APPLIED ---------|                            |
   |                          |                            |
   |<-- GAME_OVER ------------|                            |
   |                          |<--- finishGame() --------->|
```

---

## Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host/db?sslmode=require` |
| `BETTER_AUTH_SECRET` | Secret for session signing | Random 32+ character string |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | From Google Cloud Console |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8080` |
| `BETTER_AUTH_URL` | Backend base URL | `http://localhost:8080` |
| `FRONTEND_ORIGIN` | Allowed frontend origin | `http://localhost:5173` |

---

## Data Flow Examples

### User Authentication Flow

1. Frontend calls `authClient.signIn.email()` from `better-auth/react`
2. Request POSTs to `/api/auth/sign-in/email`
3. Better Auth validates credentials against `account` table
4. Better Auth creates session in `session` table
5. Session cookie is set in response
6. Frontend can now connect to WebSocket with session cookie

### Game Creation Flow

1. User clicks "Start Game" on frontend
2. Frontend sends `{ type: "init_game" }` over WebSocket
3. `GameManager.addHandler()` receives message
4. If no waiting player:
   - Store socket as `pendingUser`
   - Send `WAITING_FOR_OPPONENT` back
5. If waiting player exists:
   - Call `createGame()` to insert into `games` table
   - Create `Game` instance with returned ID
   - `Game` constructor sends `INIT_GAME` to both players
   - Both frontends receive color assignment and start playing

### Move Flow

1. User makes move on frontend
2. Frontend sends `{ type: "move", payload: { move: { from, to, promotion? } } }`
3. `GameManager` routes to appropriate `Game` instance
4. `Game.makeMove()` validates:
   - It's the player's turn
   - Move is legal per chess.js
5. If valid:
   - Apply to chess.js board
   - Send `MOVE_APPLIED` to both players
   - Call `saveMove()` asynchronously
   - Check for game over
6. If invalid:
   - Send `MOVE_REJECTED` with reason

### Game Conclusion Flow

1. chess.js detects game over (checkmate, draw, etc.)
2. `Game.getBoardGameOverPayload()` determines result
3. `Game.finishGame()`:
   - Sets `isConcluded = true`
   - Sends `GAME_OVER` to both players
   - Calls `finishGameInStore()` to update database
4. Frontend shows result modal
5. Players can request rematch or leave

---

## Architecture Constraints & Considerations

### Scalability

- **Matchmaking is process-local**: The `pendingUser` variable only works within a single Node.js process
- **Games are in-memory**: Active game state is not shared across processes
- **To scale horizontally** would require:
  - Distributed matchmaking (Redis pub/sub, message queue)
  - Shared game state store
  - Sticky sessions or state migration

### State Management

- **Source of truth**: Database is the durable record
- **In-memory state**: Active games exist only in `GameManager.games` array
- **Recovery**: If server restarts, in-progress games are lost (database records remain)

### Authentication

- **Cookie-based**: Session stored in HTTP-only cookie
- **WebSocket reuse**: Same session cookie used for WebSocket authentication
- **Stateless handlers**: Auth middleware doesn't need to query DB for every HTTP request

### Error Handling

- **DB failures**: Logged to console, game creation fails gracefully
- **WebSocket disconnects**: Handled by `removeUser()` and `handleDisconnect()`
- **Invalid moves**: Rejected with specific reason codes

---

## Future Enhancement Opportunities

Based on the current architecture:

1. **Persistent matchmaking queue** - Move `pendingUser` to Redis for multi-instance support
2. **Game recovery** - Load active games from DB on server restart
3. **Spectator mode** - Add WebSocket subscription to existing games
4. **Game history API** - HTTP endpoints for viewing past games
5. **ELO/rating system** - Calculate and store ratings after games
6. **Time controls** - Add chess clocks with server-side enforcement
7. **Tournament support** - Extend GameManager for structured tournaments
