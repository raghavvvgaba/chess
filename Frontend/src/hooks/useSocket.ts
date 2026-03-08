import { useState, useEffect } from 'react'

function useSocket() {
    const [socket, setSocket] = useState<WebSocket | null>(null)
    const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8080/ws"

    useEffect(() => {
        const ws = new WebSocket(WS_URL);
        setSocket(ws)
        ws.onopen = () => {
            setSocket(ws);
        }
        ws.onclose = () => {
            setSocket(null);
        }
        return () => {
            ws.close();
        }
    }, [WS_URL])

    return socket
}

export default useSocket
