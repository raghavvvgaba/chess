import { createAuthClient } from "better-auth/react";

const backendUrl = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8080";

export const authClient = createAuthClient({
    baseURL: backendUrl,
    fetchOptions: {
        credentials: "include"
    }
});
