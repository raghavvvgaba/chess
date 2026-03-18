import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

type RedisEvent = "error" | "connect" | "ready" | "close";

type RedisMulti = {
    hset(key: string, ...args: Array<string | number>): RedisMulti;
    rpush(key: string, value: string): RedisMulti;
    zadd(key: string, score: number, member: string): RedisMulti;
    zrem(key: string, member: string): RedisMulti;
    sadd(key: string, member: string): RedisMulti;
    srem(key: string, member: string): RedisMulti;
    del(...keys: string[]): RedisMulti;
    exec(): Promise<unknown>;
};

export type RedisClient = {
    on(event: RedisEvent, listener: (...args: unknown[]) => void): void;
    ping(): Promise<string>;
    quit(): Promise<unknown>;
    multi(): RedisMulti;
    hgetall(key: string): Promise<Record<string, string>>;
    lrange(key: string, start: number, stop: number): Promise<string[]>;
    smembers(key: string): Promise<string[]>;
    zrangebyscore(
        key: string,
        min: string | number,
        max: string | number,
        limitKeyword?: "LIMIT",
        offset?: number,
        count?: number
    ): Promise<string[]>;
    zadd(key: string, score: number, member: string): Promise<number>;
    zrem(key: string, member: string): Promise<number>;
    del(...keys: string[]): Promise<number>;
    hset(key: string, ...args: Array<string | number>): Promise<number>;
};

const redisUrl = process.env.REDIS_URL;

let client: RedisClient | null = null;

function createRedisClient() {
    if (!redisUrl) {
        throw new Error("REDIS_URL is missing. Add it in Backend/.env.");
    }

    let RedisCtor: new (url: string, options: Record<string, unknown>) => RedisClient;
    try {
        RedisCtor = require("ioredis") as new (url: string, options: Record<string, unknown>) => RedisClient;
    } catch (error) {
        throw new Error(
            `Redis dependency is not installed. Run 'npm install ioredis' in Backend before starting the server. Original error: ${error instanceof Error ? error.message : String(error)}`
        );
    }

    const redis = new RedisCtor(redisUrl, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        retryStrategy: (attempt: number) => Math.min(attempt * 50, 2_000)
    });

    redis.on("error", (error) => {
        console.error("Redis error:", error);
    });

    redis.on("connect", () => {
        console.log("Redis connected");
    });

    return redis;
}

export function getRedisClient() {
    if (!client) {
        client = createRedisClient();
    }

    return client;
}

export async function verifyRedisConnection() {
    const redis = getRedisClient();
    await redis.ping();
}

export async function closeRedisConnection() {
    if (!client) {
        return;
    }

    await client.quit();
    client = null;
}
