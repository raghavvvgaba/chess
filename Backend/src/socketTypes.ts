import type { WebSocket } from "ws";

export type AuthenticatedSocket = WebSocket & {
    userId: string;
};
