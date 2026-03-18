import { useEffect, useRef, useState } from "react";

function useSocket() {
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
            const ws = new WebSocket(WS_URL);
            socketRef.current = ws;
            // Expose the socket immediately so higher layers can attach handlers
            // before the server sends any first-frame messages after open.
            setSocket(ws);

            ws.onopen = () => {
                if (!isActive || socketRef.current !== ws) {
                    ws.close();
                    return;
                }
                reconnectAttemptRef.current = 0;
                clearReconnectTimer();
                setSocket(ws);
            };

            ws.onerror = () => {
                ws.close();
            };

            ws.onclose = () => {
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

    return socket;
}

export default useSocket;
