import type { WebSocket } from "ws";

export type AuthenticatedSocket = WebSocket & {
    isAlive: boolean;
    userId: string;
    userName: string;
};
