import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { authClient } from "../lib/auth-client";

function RequireAuth({ children }: { children: ReactNode }) {
    const { data: session, isPending } = authClient.useSession();

    if (isPending) {
        return (
            <main className="min-h-screen bg-[#262522] text-white flex items-center justify-center">
                Loading...
            </main>
        );
    }

    if (!session?.user?.id) {
        return <Navigate to="/auth" replace />;
    }

    return <>{children}</>;
}

export default RequireAuth;
