import test from "node:test";
import assert from "node:assert/strict";
import {
    ACTIVE_FLUSH_POLL_INTERVAL_MS,
    IDLE_FLUSH_POLL_INTERVAL_MS,
    getNextFlushPollDelayMs
} from "./runtimeGameFlusher.js";

test("selects idle delay when no queued games are present", () => {
    assert.equal(getNextFlushPollDelayMs(false), IDLE_FLUSH_POLL_INTERVAL_MS);
});

test("selects active delay when queued games are present", () => {
    assert.equal(getNextFlushPollDelayMs(true), ACTIVE_FLUSH_POLL_INTERVAL_MS);
});
