import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router";
import { authClient } from "../lib/auth-client";

type AuthMode = "sign-in" | "sign-up";

function AuthPage() {
    const navigate = useNavigate();
    const { data: session, isPending } = authClient.useSession();
    const [mode, setMode] = useState<AuthMode>("sign-in");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (session?.user?.id) {
            navigate("/game", { replace: true });
        }
    }, [navigate, session?.user?.id]);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setErrorMessage(null);
        setIsSubmitting(true);

        try {
            if (mode === "sign-up") {
                const result = await authClient.signUp.email({
                    name,
                    email,
                    password,
                    callbackURL: "/game"
                });
                if (result.error) {
                    setErrorMessage(result.error.message ?? "Sign up failed.");
                }
            } else {
                const result = await authClient.signIn.email({
                    email,
                    password,
                    callbackURL: "/game"
                });
                if (result.error) {
                    setErrorMessage(result.error.message ?? "Sign in failed.");
                }
            }
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Authentication failed.");
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleGoogleSignIn() {
        setErrorMessage(null);
        try {
            await authClient.signIn.social({
                provider: "google",
                callbackURL: `${window.location.origin}/game`
            });
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Google sign-in failed.");
        }
    }

    if (isPending) {
        return (
            <main className="min-h-screen bg-[#262522] text-white flex items-center justify-center">
                Checking session...
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-[#262522] text-white flex items-center justify-center p-4">
            <section className="w-full max-w-md rounded-xl border border-[#3a3936] bg-[#1f1e1b] p-6 space-y-5">
                <header className="space-y-2">
                    <h1 className="text-2xl font-bold">Welcome to Chess</h1>
                    <p className="text-sm text-gray-300">Sign in to play online matches.</p>
                </header>

                <div className="grid grid-cols-2 gap-2 rounded-lg bg-[#2a2926] p-1">
                    <button
                        type="button"
                        onClick={() => setMode("sign-in")}
                        className={`rounded-md px-3 py-2 text-sm font-semibold ${mode === "sign-in" ? "bg-[#b58863] text-white" : "text-gray-300"}`}
                    >
                        Sign in
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode("sign-up")}
                        className={`rounded-md px-3 py-2 text-sm font-semibold ${mode === "sign-up" ? "bg-[#b58863] text-white" : "text-gray-300"}`}
                    >
                        Sign up
                    </button>
                </div>

                <form className="space-y-3" onSubmit={handleSubmit}>
                    {mode === "sign-up" && (
                        <input
                            type="text"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="Full name"
                            className="w-full rounded-md border border-[#4a4842] bg-[#2d2c29] px-3 py-2 text-white outline-none focus:border-[#b58863]"
                            required
                        />
                    )}
                    <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="Email"
                        className="w-full rounded-md border border-[#4a4842] bg-[#2d2c29] px-3 py-2 text-white outline-none focus:border-[#b58863]"
                        required
                    />
                    <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Password"
                        className="w-full rounded-md border border-[#4a4842] bg-[#2d2c29] px-3 py-2 text-white outline-none focus:border-[#b58863]"
                        required
                        minLength={8}
                    />
                    {errorMessage && <p className="text-sm text-red-400">{errorMessage}</p>}
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full rounded-md bg-[#b58863] px-3 py-2 font-semibold disabled:opacity-60"
                    >
                        {isSubmitting ? "Please wait..." : mode === "sign-up" ? "Create account" : "Sign in"}
                    </button>
                </form>

                <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    className="w-full rounded-md border border-[#4a4842] px-3 py-2 font-semibold"
                >
                    Continue with Google
                </button>
            </section>
        </main>
    );
}

export default AuthPage;
