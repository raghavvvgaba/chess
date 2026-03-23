import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { authClient } from "../lib/auth-client";
import LoadingState from "./LoadingState";

function RequireAuth({ children }: { children: ReactNode }) {
    const { data: session, isPending } = authClient.useSession();

    if (isPending) {
        return <LoadingState message="Restoring Session" subtitle="Checking authentication..." />;
    }

    if (!session?.user?.id) {
        return <Navigate to="/auth" replace />;
    }

    return <>{children}</>;
}

export default RequireAuth;
