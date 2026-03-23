import { useSocketContext } from "../context/SocketContext";

function useSocket() {
    return useSocketContext();
}

export default useSocket;
