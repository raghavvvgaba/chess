import { getRedisClient } from "./redis.js";

export type RuntimeGameStatus = "active" | "finished" | "aborted";
export type RuntimeGameResult = "white" | "black" | "draw" | null;

export type RuntimeMoveRecord = {
    ply: number;
    san: string;
    uci: string;
    fenAfter: string;
    playedByUserId: string;
    playedAt: string;
};

export type InitializeRuntimeGameInput = {
    gameId: string;
    whiteUserId: string;
    blackUserId: string;
    whiteUserName: string;
    blackUserName: string;
    currentFen: string;
    turn: "w" | "b";
    startedAt: string;
};

export type AppendMoveToRuntimeGameInput = {
    gameId: string;
    currentFen: string;
    turn: "w" | "b";
    ply: number;
    move: RuntimeMoveRecord;
};

export type CompleteRuntimeGameInput = {
    gameId: string;
    status: RuntimeGameStatus;
    result: RuntimeGameResult;
    currentFen: string;
    turn: "w" | "b" | null;
    endedAt: string;
};

export type RuntimeGameSnapshot = {
    gameId: string;
    whiteUserId: string;
    blackUserId: string;
    whiteUserName: string;
    blackUserName: string;
    status: RuntimeGameStatus;
    currentFen: string;
    turn: "w" | "b" | null;
    ply: number;
    result: RuntimeGameResult;
    startedAt: string;
    endedAt: string | null;
    lastFlushedPly: number;
    flushStatus: "idle" | "pending" | "flushing" | "failed";
    flushAttempts: number;
    lastError: string | null;
    moves: RuntimeMoveRecord[];
};

const ACTIVE_GAMES_KEY = "games:active";
const FLUSH_QUEUE_KEY = "games:flush";

function getMetaKey(gameId: string) {
    return `game:${gameId}:meta`;
}

function getMovesKey(gameId: string) {
    return `game:${gameId}:moves`;
}

function parseRuntimeMoveRecord(serializedMove: string): RuntimeMoveRecord {
    const parsedMove = JSON.parse(serializedMove) as Partial<RuntimeMoveRecord>;
    if (
        typeof parsedMove.ply !== "number" ||
        typeof parsedMove.san !== "string" ||
        typeof parsedMove.uci !== "string" ||
        typeof parsedMove.fenAfter !== "string" ||
        typeof parsedMove.playedByUserId !== "string" ||
        typeof parsedMove.playedAt !== "string"
    ) {
        throw new Error("Invalid runtime move payload in Redis.");
    }

    return {
        ply: parsedMove.ply,
        san: parsedMove.san,
        uci: parsedMove.uci,
        fenAfter: parsedMove.fenAfter,
        playedByUserId: parsedMove.playedByUserId,
        playedAt: parsedMove.playedAt
    };
}

function parseRuntimeGameStatus(value: string | undefined): RuntimeGameStatus {
    if (value === "finished" || value === "aborted") {
        return value;
    }
    return "active";
}

function parseRuntimeGameResult(value: string | undefined): RuntimeGameResult {
    if (value === "white" || value === "black" || value === "draw") {
        return value;
    }
    return null;
}

function parseRuntimeTurn(value: string | undefined): "w" | "b" | null {
    if (value === "w" || value === "b") {
        return value;
    }
    return null;
}

function parseNumber(value: string | undefined, fallback: number) {
    if (typeof value !== "string") {
        return fallback;
    }
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

export async function initializeRuntimeGame(input: InitializeRuntimeGameInput) {
    const redis = getRedisClient();
    const now = Date.now();

    await redis.multi()
        .hset(
            getMetaKey(input.gameId),
            "whiteUserId", input.whiteUserId,
            "blackUserId", input.blackUserId,
            "whiteUserName", input.whiteUserName,
            "blackUserName", input.blackUserName,
            "status", "active",
            "currentFen", input.currentFen,
            "turn", input.turn,
            "ply", 0,
            "result", "",
            "startedAt", input.startedAt,
            "endedAt", "",
            "lastFlushedPly", 0,
            "flushStatus", "idle",
            "flushAttempts", 0,
            "lastError", ""
        )
        .sadd(ACTIVE_GAMES_KEY, input.gameId)
        .zadd(FLUSH_QUEUE_KEY, now, input.gameId)
        .exec();
}

export async function appendMoveToRuntimeGame(input: AppendMoveToRuntimeGameInput) {
    const redis = getRedisClient();
    const now = Date.now();

    await redis.multi()
        .hset(
            getMetaKey(input.gameId),
            "currentFen", input.currentFen,
            "turn", input.turn,
            "ply", input.ply,
            "flushStatus", "pending",
            "lastError", ""
        )
        .rpush(getMovesKey(input.gameId), JSON.stringify(input.move))
        .zadd(FLUSH_QUEUE_KEY, now, input.gameId)
        .exec();
}

export async function completeRuntimeGame(input: CompleteRuntimeGameInput) {
    const redis = getRedisClient();
    const now = Date.now();

    await redis.multi()
        .hset(
            getMetaKey(input.gameId),
            "status", input.status,
            "result", input.result ?? "",
            "currentFen", input.currentFen,
            "turn", input.turn ?? "",
            "endedAt", input.endedAt,
            "flushStatus", "pending",
            "lastError", ""
        )
        .zadd(FLUSH_QUEUE_KEY, now, input.gameId)
        .exec();
}

export async function markRuntimeGameFlushState(
    gameId: string,
    input: {
        lastFlushedPly?: number;
        flushStatus: "idle" | "pending" | "flushing" | "failed";
        flushAttempts?: number;
        lastError?: string | null;
    }
) {
    const redis = getRedisClient();
    const args: Array<string | number> = ["flushStatus", input.flushStatus];

    if (typeof input.lastFlushedPly === "number") {
        args.push("lastFlushedPly", input.lastFlushedPly);
    }
    if (typeof input.flushAttempts === "number") {
        args.push("flushAttempts", input.flushAttempts);
    }
    if (typeof input.lastError !== "undefined") {
        args.push("lastError", input.lastError ?? "");
    }

    await redis.hset(getMetaKey(gameId), ...args);
}

export async function scheduleRuntimeGameFlush(gameId: string, score = Date.now()) {
    const redis = getRedisClient();
    await redis.zadd(FLUSH_QUEUE_KEY, score, gameId);
}

export async function getRuntimeGameSnapshot(gameId: string): Promise<RuntimeGameSnapshot | null> {
    const redis = getRedisClient();
    const [meta, serializedMoves] = await Promise.all([
        redis.hgetall(getMetaKey(gameId)),
        redis.lrange(getMovesKey(gameId), 0, -1)
    ]);

    if (!meta.whiteUserId || !meta.blackUserId || !meta.currentFen || !meta.startedAt) {
        return null;
    }

    return {
        gameId,
        whiteUserId: meta.whiteUserId,
        blackUserId: meta.blackUserId,
        whiteUserName: meta.whiteUserName ?? "",
        blackUserName: meta.blackUserName ?? "",
        status: parseRuntimeGameStatus(meta.status),
        currentFen: meta.currentFen,
        turn: parseRuntimeTurn(meta.turn),
        ply: parseNumber(meta.ply, 0),
        result: parseRuntimeGameResult(meta.result),
        startedAt: meta.startedAt,
        endedAt: meta.endedAt || null,
        lastFlushedPly: parseNumber(meta.lastFlushedPly, 0),
        flushStatus: (meta.flushStatus === "pending" || meta.flushStatus === "flushing" || meta.flushStatus === "failed")
            ? meta.flushStatus
            : "idle",
        flushAttempts: parseNumber(meta.flushAttempts, 0),
        lastError: meta.lastError || null,
        moves: serializedMoves.map(parseRuntimeMoveRecord)
    };
}

export async function getActiveRuntimeGameIds() {
    const redis = getRedisClient();
    return redis.smembers(ACTIVE_GAMES_KEY);
}

export async function getActiveRuntimeGameSnapshotForUserId(userId: string): Promise<RuntimeGameSnapshot | null> {
    const activeGameIds = await getActiveRuntimeGameIds();

    for (const gameId of activeGameIds) {
        const snapshot = await getRuntimeGameSnapshot(gameId);
        if (!snapshot || snapshot.status !== "active") {
            continue;
        }

        if (snapshot.whiteUserId === userId || snapshot.blackUserId === userId) {
            return snapshot;
        }
    }

    return null;
}

export async function getQueuedFlushGameIds(limit = 25) {
    const redis = getRedisClient();
    return redis.zrangebyscore(FLUSH_QUEUE_KEY, "-inf", Date.now(), "LIMIT", 0, limit);
}

export async function cleanupRuntimeGame(gameId: string) {
    const redis = getRedisClient();
    await redis.multi()
        .del(getMetaKey(gameId), getMovesKey(gameId))
        .srem(ACTIVE_GAMES_KEY, gameId)
        .zrem(FLUSH_QUEUE_KEY, gameId)
        .exec();
}

export async function removeRuntimeGameFromFlushQueue(gameId: string) {
    const redis = getRedisClient();
    await redis.zrem(FLUSH_QUEUE_KEY, gameId);
}
