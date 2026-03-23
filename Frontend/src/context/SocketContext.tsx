import React, { createContext, useContext, useEffect, useRef, useState } from "react";

type SocketContextType = WebSocket | null;

const SocketContext = createContext<SocketContextType>(null);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [socket, setSocket] = useState<WebSocket | null>(null);
    const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8080/ws";
    const socketRef = useRef<WebSocket | null>(null);
    const reconnectTimerRef = useRef<number | null>(null);
    const reconnectAttemptRef = useRef(0);

    useEffect(() => {
        let isActive = true;

        const clearReconnectTimer = () => {
            if (reconnectTimerRef.current !== null) {
                window.clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }
        };

        const scheduleReconnect = () => {
            if (!isActive) {
                return;
            }
            reconnectAttemptRef.current += 1;
            const delayMs = Math.min(1000 * (2 ** (reconnectAttemptRef.current - 1)), 10000);
            clearReconnectTimer();
            reconnectTimerRef.current = window.setTimeout(() => {
                if (!isActive) {
                    return;
                }
                connect();
            }, delayMs);
        };

        const connect = () => {
            if (!isActive) {
                return;
            }
            console.log("Connecting to WebSocket...");
            const ws = new WebSocket(WS_URL);
            socketRef.current = ws;
            setSocket(ws);

            ws.onopen = () => {
                if (!isActive || socketRef.current !== ws) {
                    ws.close();
                    return;
                }
                console.log("WebSocket connected");
                reconnectAttemptRef.current = 0;
                clearReconnectTimer();
                setSocket(ws);
            };

            ws.onerror = () => {
                ws.close();
            };

            ws.onclose = () => {
                console.log("WebSocket disconnected");
                if (socketRef.current === ws) {
                    socketRef.current = null;
                }
                setSocket((previous) => (previous === ws ? null : previous));
                scheduleReconnect();
            };
        };

        connect();

        return () => {
            isActive = false;
            clearReconnectTimer();
            setSocket(null);
            if (socketRef.current) {
                socketRef.current.close();
                socketRef.current = null;
            }
        };
    }, [WS_URL]);

    return (
        <SocketContext.Provider value={socket}>
            {children}
        </SocketContext.Provider>
    );
};

export const useSocketContext = () => {
    return useContext(SocketContext);
};
