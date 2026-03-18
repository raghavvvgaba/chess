import { cleanupRuntimeGame, getQueuedFlushGameIds, getRuntimeGameSnapshot, markRuntimeGameFlushState, removeRuntimeGameFromFlushQueue, scheduleRuntimeGameFlush } from "./runtimeGameStore.js";
import { finishGame, saveMovesBatch } from "./gameStore.js";

const FLUSH_POLL_INTERVAL_MS = 1_000;
const MAX_FLUSH_RETRY_DELAY_MS = 30_000;

function getRetryDelay(attempts: number) {
    return Math.min(2 ** Math.max(attempts, 0) * 1_000, MAX_FLUSH_RETRY_DELAY_MS);
}

export function startRuntimeGameFlusher() {
    let isRunning = true;

    const run = async () => {
        while (isRunning) {
            try {
                const gameIds = await getQueuedFlushGameIds();

                if (gameIds.length === 0) {
                    await new Promise((resolve) => setTimeout(resolve, FLUSH_POLL_INTERVAL_MS));
                    continue;
                }

                for (const gameId of gameIds) {
                    await flushRuntimeGame(gameId);
                }
            } catch (error) {
                console.error("Runtime game flusher error:", error);
                await new Promise((resolve) => setTimeout(resolve, FLUSH_POLL_INTERVAL_MS));
            }
        }
    };

    void run();

    return {
        stop() {
            isRunning = false;
        }
    };
}

async function flushRuntimeGame(gameId: string) {
    const snapshot = await getRuntimeGameSnapshot(gameId);
    if (!snapshot) {
        await removeRuntimeGameFromFlushQueue(gameId);
        return;
    }

    const flushAttempts = snapshot.flushAttempts + 1;
    await markRuntimeGameFlushState(gameId, {
        flushStatus: "flushing",
        flushAttempts,
        lastError: null
    });

    try {
        const pendingMoves = snapshot.moves.filter((move) => move.ply > snapshot.lastFlushedPly);

        if (pendingMoves.length > 0) {
            await saveMovesBatch({
                gameId,
                moves: pendingMoves
            });
        }

        const latestFlushedPly = pendingMoves.length > 0 ? pendingMoves[pendingMoves.length - 1].ply : snapshot.lastFlushedPly;

        if (snapshot.status !== "active") {
            await finishGame({
                gameId,
                status: snapshot.status,
                result: snapshot.result
            });
            await cleanupRuntimeGame(gameId);
            return;
        }

        await markRuntimeGameFlushState(gameId, {
            lastFlushedPly: latestFlushedPly,
            flushStatus: "idle",
            flushAttempts: 0,
            lastError: null
        });
        await removeRuntimeGameFromFlushQueue(gameId);
    } catch (error) {
        const retryDelay = getRetryDelay(flushAttempts);
        await markRuntimeGameFlushState(gameId, {
            flushStatus: "failed",
            flushAttempts,
            lastError: error instanceof Error ? error.message : String(error)
        });
        await scheduleRuntimeGameFlush(gameId, Date.now() + retryDelay);
    }
}
