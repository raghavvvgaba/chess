type WrapperCommand =
  | { type: "boot" }
  | { type: "prepare_new_game" }
  | {
      type: "search";
      requestId: number;
      fen: string;
      movetimeMs: number;
      skillLevel?: number;
      minimumThinkingTimeMs?: number;
      moveOverheadMs?: number;
    }
  | { type: "stop" }
  | { type: "dispose" };

type WrapperEvent =
  | { type: "boot_started" }
  | { type: "boot_ready" }
  | { type: "boot_failed"; message: string }
  | { type: "engine_line"; line: string; level: "info" | "error" }
  | { type: "game_ready" }
  | { type: "bestmove"; requestId: number; move: string }
  | { type: "stopped" }
  | { type: "error"; message: string; requestId?: number };

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

type PendingSearch = {
  deferred: Deferred<string>;
  timeoutId: number;
};

export type BotDifficulty = "easy" | "medium" | "hard";

export type BestMoveOptions = {
  fen: string;
  movetimeMs: number;
  skillLevel?: number;
  minimumThinkingTimeMs?: number;
  moveOverheadMs?: number;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_BUFFER_MS = 2500;
const ENGINE_INIT_TIMEOUT_MS = 12000;

const createDeferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

export const BOT_DIFFICULTY_PRESETS: Record<
  BotDifficulty,
  {
    label: string;
    movetimeMs: number;
    skillLevel: number;
    minimumThinkingTimeMs: number;
    moveOverheadMs: number;
    visibleThinkMinMs: number;
    visibleThinkJitterMs: number;
    summary: string;
  }
> = {
  easy: {
    label: "Easy",
    movetimeMs: 180,
    skillLevel: 4,
    minimumThinkingTimeMs: 120,
    moveOverheadMs: 80,
    visibleThinkMinMs: 650,
    visibleThinkJitterMs: 220,
    summary: "Fast replies, forgiving tactics, good for warm-ups.",
  },
  medium: {
    label: "Medium",
    movetimeMs: 450,
    skillLevel: 10,
    minimumThinkingTimeMs: 280,
    moveOverheadMs: 120,
    visibleThinkMinMs: 950,
    visibleThinkJitterMs: 260,
    summary: "Balanced speed and accuracy for a solid everyday game.",
  },
  hard: {
    label: "Hard",
    movetimeMs: 900,
    skillLevel: 16,
    minimumThinkingTimeMs: 550,
    moveOverheadMs: 180,
    visibleThinkMinMs: 1350,
    visibleThinkJitterMs: 320,
    summary: "Longer thinks, sharper punishments, stronger endgames.",
  },
};

const appendDiagnosticMessage = (baseMessage: string, diagnostic: string | null) => {
  if (!diagnostic || diagnostic.trim().length === 0) {
    return baseMessage;
  }

  if (baseMessage.includes(diagnostic)) {
    return baseMessage;
  }

  return `${baseMessage} Diagnostic: ${diagnostic}`;
};

export class StockfishAdapter {
  private worker: Worker | null = null;
  private initialized = false;
  private bootDeferred: Deferred<void> | null = null;
  private gameReadyDeferred: Deferred<void> | null = null;
  private stopDeferred: Deferred<void> | null = null;
  private pendingSearches = new Map<number, PendingSearch>();
  private nextRequestId = 1;
  private operationChain: Promise<void> = Promise.resolve();
  private lastEngineDiagnostic: string | null = null;

  private ensureWorker() {
    if (this.worker) {
      return this.worker;
    }

    const worker = new Worker(new URL("../workers/stockfish.wrapper.ts", import.meta.url), {
      type: "module",
    });

    worker.onmessage = (event: MessageEvent<WrapperEvent>) => {
      const message = event.data;

      if (message.type === "boot_started") {
        this.lastEngineDiagnostic = null;
        return;
      }

      if (message.type === "engine_line") {
        this.lastEngineDiagnostic = message.line;
        if (message.level === "error") {
          console.error("[stockfish]", message.line);
        } else {
          console.info("[stockfish]", message.line);
        }
        return;
      }

      if (message.type === "boot_ready") {
        this.initialized = true;
        this.bootDeferred?.resolve();
        this.bootDeferred = null;
        return;
      }

      if (message.type === "boot_failed") {
        const error = new Error(appendDiagnosticMessage(message.message, this.lastEngineDiagnostic));
        this.initialized = false;
        this.bootDeferred?.reject(error);
        this.bootDeferred = null;
        this.gameReadyDeferred?.reject(error);
        this.gameReadyDeferred = null;
        this.stopDeferred?.reject(error);
        this.stopDeferred = null;
        return;
      }

      if (message.type === "game_ready") {
        this.gameReadyDeferred?.resolve();
        this.gameReadyDeferred = null;
        return;
      }

      if (message.type === "stopped") {
        this.stopDeferred?.resolve();
        this.stopDeferred = null;
        return;
      }

      if (message.type === "bestmove") {
        const pendingSearch = this.pendingSearches.get(message.requestId);
        if (!pendingSearch) {
          return;
        }

        window.clearTimeout(pendingSearch.timeoutId);
        this.pendingSearches.delete(message.requestId);
        pendingSearch.deferred.resolve(message.move);
        return;
      }

      const error = new Error(appendDiagnosticMessage(message.message, this.lastEngineDiagnostic));
      if (typeof message.requestId === "number") {
        const pendingSearch = this.pendingSearches.get(message.requestId);
        if (pendingSearch) {
          window.clearTimeout(pendingSearch.timeoutId);
          this.pendingSearches.delete(message.requestId);
          pendingSearch.deferred.reject(error);
        }
      }

      this.bootDeferred?.reject(error);
      this.bootDeferred = null;
      this.gameReadyDeferred?.reject(error);
      this.gameReadyDeferred = null;
      this.stopDeferred?.reject(error);
      this.stopDeferred = null;
    };

    worker.onerror = (event) => {
      const error = new Error(
        appendDiagnosticMessage(
          event.message || "Stockfish wrapper worker failed.",
          this.lastEngineDiagnostic,
        ),
      );
      this.rejectAllPending(error);
      this.worker?.terminate();
      this.worker = null;
      this.initialized = false;
    };

    this.worker = worker;
    return worker;
  }

  private rejectAllPending(error: Error) {
    for (const [, pendingSearch] of this.pendingSearches) {
      window.clearTimeout(pendingSearch.timeoutId);
      pendingSearch.deferred.reject(error);
    }
    this.pendingSearches.clear();
    this.bootDeferred?.reject(error);
    this.bootDeferred = null;
    this.gameReadyDeferred?.reject(error);
    this.gameReadyDeferred = null;
    this.stopDeferred?.reject(error);
    this.stopDeferred = null;
  }

  private enqueue<T>(run: () => Promise<T>) {
    const task = this.operationChain.then(run);
    this.operationChain = task.then(() => undefined, () => undefined);
    return task;
  }

  async init() {
    if (this.initialized) {
      return;
    }

    if (this.bootDeferred) {
      return this.bootDeferred.promise;
    }

    const worker = this.ensureWorker();
    this.bootDeferred = createDeferred<void>();
    this.lastEngineDiagnostic = null;
    worker.postMessage({ type: "boot" } satisfies WrapperCommand);

    const timeoutId = window.setTimeout(() => {
      const timeoutError = new Error(
        appendDiagnosticMessage(
          "Bot engine initialization timed out. This usually means the Stockfish worker did not finish booting.",
          this.lastEngineDiagnostic,
        ),
      );
      this.initialized = false;
      this.bootDeferred?.reject(timeoutError);
      this.bootDeferred = null;
    }, ENGINE_INIT_TIMEOUT_MS);

    try {
      await this.bootDeferred.promise;
    } catch (error) {
      const initError =
        error instanceof Error ? error : new Error("Bot engine initialization failed.");
      this.rejectAllPending(initError);
      this.worker?.terminate();
      this.worker = null;
      this.initialized = false;
      throw initError;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async prepareNewGame() {
    await this.init();

    return this.enqueue(async () => {
      const worker = this.ensureWorker();
      this.gameReadyDeferred = createDeferred<void>();
      worker.postMessage({ type: "prepare_new_game" } satisfies WrapperCommand);
      await this.gameReadyDeferred.promise;
    });
  }

  async getBestMove(options: BestMoveOptions) {
    await this.init();

    return this.enqueue(async () => {
      const worker = this.ensureWorker();
      const requestId = this.nextRequestId;
      this.nextRequestId += 1;

      const deferred = createDeferred<string>();
      const timeoutMs = options.timeoutMs ?? options.movetimeMs + DEFAULT_TIMEOUT_BUFFER_MS;
      const timeoutId = window.setTimeout(() => {
        const pendingSearch = this.pendingSearches.get(requestId);
        if (!pendingSearch) {
          return;
        }

        this.pendingSearches.delete(requestId);
        pendingSearch.deferred.reject(
          new Error(
            appendDiagnosticMessage(
              "Bot took too long to respond.",
              this.lastEngineDiagnostic,
            ),
          ),
        );
        void this.stopThinking();
      }, timeoutMs);

      this.pendingSearches.set(requestId, { deferred, timeoutId });
      worker.postMessage({
        type: "search",
        requestId,
        fen: options.fen,
        movetimeMs: options.movetimeMs,
        skillLevel: options.skillLevel,
        minimumThinkingTimeMs: options.minimumThinkingTimeMs,
        moveOverheadMs: options.moveOverheadMs,
      } satisfies WrapperCommand);

      return deferred.promise;
    });
  }

  async stopThinking() {
    if (!this.worker) {
      return;
    }

    for (const [requestId, pendingSearch] of this.pendingSearches) {
      window.clearTimeout(pendingSearch.timeoutId);
      pendingSearch.deferred.reject(new Error("Bot thinking cancelled."));
      this.pendingSearches.delete(requestId);
    }

    if (!this.stopDeferred) {
      this.stopDeferred = createDeferred<void>();
      this.worker.postMessage({ type: "stop" } satisfies WrapperCommand);
    }

    await this.stopDeferred.promise.catch(() => undefined);
  }

  terminate() {
    this.rejectAllPending(new Error("Stockfish adapter terminated."));
    this.worker?.postMessage({ type: "dispose" } satisfies WrapperCommand);
    this.worker?.terminate();
    this.worker = null;
    this.initialized = false;
    this.operationChain = Promise.resolve();
  }
}
