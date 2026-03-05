import { useState, useEffect } from 'react'

function useSocket() {
    const [socket, setSocket] = useState<WebSocket | null>(null)
    const WS_URL = "ws://localhost:8080"

    useEffect(() => {
        const ws = new WebSocket(WS_URL);
        console.log("WebSocket created");
        setSocket(ws)
        ws.onopen = () => {
            console.log("WebSocket open");
            setSocket(ws);
        }
        ws.onclose = () => {
            console.log("WebSocket closed");
            setSocket(null);
        }
        return () => {
            console.log("WebSocket cleanup/close");
            ws.close();
        }
    }, [])

    return socket
}

export default useSocket