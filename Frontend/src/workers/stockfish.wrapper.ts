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

type BootState = "idle" | "booting" | "ready";

const BOOT_FAILURE_PATTERN = /(abort(?:ed)?\(|error(?::|\s)|exception|failed|runtimeerror|uncaught)/i;

const createDeferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const postEvent = (message: WrapperEvent) => {
  self.postMessage(message);
};

const buildEngineWorkerUrl = () => {
  const wasmUrl = new URL(
    "/stockfish/stockfish-18-lite-single.wasm",
    self.location.origin,
  ).toString();

  return `/stockfish/stockfish-18-lite-single.js#${encodeURIComponent(wasmUrl)}`;
};

let engineWorker: Worker | null = null;
let bootState: BootState = "idle";
let bootPromise: Promise<void> | null = null;
let commandChain: Promise<void> = Promise.resolve();
let uciDeferred: Deferred<void> | null = null;
let readyDeferreds: Deferred<void>[] = [];
let searchDeferred: Deferred<string> | null = null;
let currentSearchRequestId: number | null = null;
let lastDiagnostic: string | null = null;

const resetBootDeferrals = (error?: Error) => {
  if (error) {
    uciDeferred?.reject(error);
    readyDeferreds.forEach((deferred) => deferred.reject(error));
    searchDeferred?.reject(error);
  }

  uciDeferred = null;
  readyDeferreds = [];
  searchDeferred = null;
  currentSearchRequestId = null;
};

const cleanupEngineWorker = () => {
  engineWorker?.terminate();
  engineWorker = null;
  bootPromise = null;
  bootState = "idle";
};

const classifyLevel = (line: string): "info" | "error" => {
  return BOOT_FAILURE_PATTERN.test(line) ? "error" : "info";
};

const waitForReadySignal = () => {
  const deferred = createDeferred<void>();
  readyDeferreds.push(deferred);
  engineWorker?.postMessage("isready");
  return deferred.promise;
};

const failBoot = (message: string) => {
  const error = new Error(message);
  postEvent({ type: "boot_failed", message });
  resetBootDeferrals(error);
  cleanupEngineWorker();
};

const handleEngineMessage = (event: MessageEvent<string>) => {
  const line = typeof event.data === "string" ? event.data.trim() : "";
  if (!line) {
    return;
  }

  lastDiagnostic = line;
  postEvent({
    type: "engine_line",
    line,
    level: classifyLevel(line),
  });

  if (line === "uciok") {
    uciDeferred?.resolve();
    uciDeferred = null;
    return;
  }

  if (line === "readyok") {
    const deferreds = readyDeferreds;
    readyDeferreds = [];
    deferreds.forEach((deferred) => deferred.resolve());
    return;
  }

  if (line.startsWith("bestmove")) {
    const move = line.split(/\s+/)[1] ?? "(none)";
    if (searchDeferred) {
      searchDeferred.resolve(move);
      searchDeferred = null;
    }
    if (currentSearchRequestId !== null) {
      postEvent({
        type: "bestmove",
        requestId: currentSearchRequestId,
        move,
      });
      currentSearchRequestId = null;
    }
    return;
  }

  if (bootState === "booting" && BOOT_FAILURE_PATTERN.test(line)) {
    failBoot(line);
  }
};

const ensureEngineWorker = () => {
  if (engineWorker) {
    return engineWorker;
  }

  const worker = new Worker(buildEngineWorkerUrl());
  worker.onmessage = handleEngineMessage;
  worker.onerror = (event) => {
    const message =
      event.message ||
      lastDiagnostic ||
      "Stockfish engine worker failed before initialization completed.";
    if (bootState === "booting") {
      failBoot(message);
      return;
    }

    postEvent({ type: "error", message });
    resetBootDeferrals(new Error(message));
    cleanupEngineWorker();
  };

  engineWorker = worker;
  return worker;
};

const bootEngine = async () => {
  if (bootState === "ready") {
    return;
  }

  if (bootPromise) {
    return bootPromise;
  }

  bootPromise = (async () => {
    bootState = "booting";
    lastDiagnostic = null;
    postEvent({ type: "boot_started" });

    const worker = ensureEngineWorker();
    uciDeferred = createDeferred<void>();
    worker.postMessage("uci");
    await uciDeferred.promise;
    await waitForReadySignal();
    bootState = "ready";
    postEvent({ type: "boot_ready" });
  })();

  try {
    await bootPromise;
  } finally {
    if (bootState !== "booting") {
      bootPromise = null;
    }
  }
};

const stopThinking = async () => {
  if (!engineWorker || currentSearchRequestId === null || !searchDeferred) {
    return;
  }

  const activeSearch = searchDeferred.promise.catch(() => undefined);
  engineWorker.postMessage("stop");
  await activeSearch;
  await waitForReadySignal();
};

const executeCommand = async (command: Exclude<WrapperCommand, { type: "boot" | "dispose" | "stop" }>) => {
  await bootEngine();

  if (!engineWorker) {
    throw new Error("Stockfish engine worker is unavailable.");
  }

  if (command.type === "prepare_new_game") {
    await stopThinking();
    engineWorker.postMessage("ucinewgame");
    await waitForReadySignal();
    postEvent({ type: "game_ready" });
    return;
  }

  if (currentSearchRequestId !== null) {
    throw new Error("Stockfish is already processing a move.");
  }

  currentSearchRequestId = command.requestId;
  searchDeferred = createDeferred<string>();

  if (typeof command.skillLevel === "number") {
    engineWorker.postMessage(`setoption name Skill Level value ${command.skillLevel}`);
  }
  if (typeof command.minimumThinkingTimeMs === "number") {
    engineWorker.postMessage(
      `setoption name Minimum Thinking Time value ${Math.max(0, Math.round(command.minimumThinkingTimeMs))}`,
    );
  }
  if (typeof command.moveOverheadMs === "number") {
    engineWorker.postMessage(
      `setoption name Move Overhead value ${Math.max(0, Math.round(command.moveOverheadMs))}`,
    );
  }

  engineWorker.postMessage(`position fen ${command.fen}`);
  engineWorker.postMessage(`go movetime ${command.movetimeMs}`);

  try {
    await searchDeferred.promise;
    await waitForReadySignal();
  } finally {
    searchDeferred = null;
  }
};

const enqueueCommand = (command: Exclude<WrapperCommand, { type: "dispose" | "stop" }>) => {
  commandChain = commandChain.then(async () => {
    if (command.type === "boot") {
      await bootEngine();
      return;
    }

    await executeCommand(command);
  }).catch((error) => {
    const message =
      error instanceof Error
        ? error.message
        : lastDiagnostic || "Stockfish wrapper command failed.";
    postEvent({
      type: "error",
      message,
      requestId: command.type === "search" ? command.requestId : undefined,
    });
  });
};

self.onmessage = (event: MessageEvent<WrapperCommand>) => {
  const command = event.data;

  if (command.type === "dispose") {
    engineWorker?.postMessage("quit");
    resetBootDeferrals(new Error("Stockfish wrapper disposed."));
    cleanupEngineWorker();
    commandChain = Promise.resolve();
    return;
  }

  if (command.type === "stop") {
    void stopThinking()
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "Failed to stop Stockfish search.";
        postEvent({ type: "error", message });
      })
      .finally(() => {
        postEvent({ type: "stopped" });
      });
    return;
  }

  enqueueCommand(command);
};
