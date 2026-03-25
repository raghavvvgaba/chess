import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router";
import { authClient } from "../lib/auth-client";
import LoadingState from "../components/LoadingState";

type AuthMode = "sign-in" | "sign-up";

function AuthPage() {
    const navigate = useNavigate();
    const { data: session, isPending } = authClient.useSession();
    const [mode, setMode] = useState<AuthMode>("sign-in");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (session?.user?.id) {
            navigate("/", { replace: true });
        }
    }, [navigate, session?.user?.id]);

    const isSignUp = mode === "sign-up";
    const emailInputId = isSignUp ? "signup-email" : "signin-email";
    const passwordInputId = isSignUp ? "signup-password" : "signin-password";
    const passwordHintId = isSignUp ? "signup-password-hint" : "signin-password-hint";

    const switchMode = (nextMode: AuthMode) => {
        setMode(nextMode);
        setErrorMessage(null);
        setShowPassword(false);
    };

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setErrorMessage(null);
        setIsSubmitting(true);

        try {
            if (isSignUp) {
                const result = await authClient.signUp.email({
                    name,
                    email,
                    password,
                    callbackURL: "/"
                });
                if (result.error) {
                    setErrorMessage(result.error.message ?? "Sign up failed.");
                }
            } else {
                const result = await authClient.signIn.email({
                    email,
                    password,
                    callbackURL: "/"
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
                callbackURL: `${window.location.origin}/`
            });
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Google sign-in failed.");
        }
    }

    if (isPending) {
        return <LoadingState message="Checking Session" subtitle="Verifying authentication..." />;
    }

    return (
        <main className="auth-page relative min-h-dvh overflow-hidden text-white">
            <div className="auth-page__mesh" aria-hidden />

            <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-8 pt-5 sm:px-6 lg:px-10">
                <button
                    type="button"
                    onClick={() => navigate("/")}
                    className="rounded-full border border-[#f6f2e8]/22 bg-[#201d18]/75 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#f2e4cd] transition hover:border-[#d2a572]/60"
                >
                    ← Back Home
                </button>
            </div>

            <section className="relative z-10 mx-auto grid w-full max-w-6xl gap-8 px-4 pb-10 sm:px-6 lg:grid-cols-[1fr_520px] lg:items-start lg:px-10">
                <aside className="hidden lg:block">
                    <p className="inline-flex rounded-full border border-[#d2a572]/45 bg-[#d2a572]/12 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#edc998]">
                        Account Access
                    </p>
                    <h1 className="mt-5 font-display text-5xl leading-[1.04] text-[#fff4e2]">
                        Step In.
                        <span className="block text-[#d2a572]">Set The Board.</span>
                    </h1>
                    <p className="mt-5 max-w-lg text-base text-[#efe3d2]/82">
                        Sign in to resume your matches or create a new account in less than a minute.
                        Your board, history, and sessions stay tied to one secure login.
                    </p>
                    <ul className="mt-7 space-y-3 text-sm text-[#f4e4cc]">
                        <li className="rounded-xl border border-[#f6f2e8]/10 bg-[#1e1a15]/70 px-4 py-3">Email + Google sign-in options</li>
                        <li className="rounded-xl border border-[#f6f2e8]/10 bg-[#1e1a15]/70 px-4 py-3">Optimized for mobile and desktop screens</li>
                        <li className="rounded-xl border border-[#f6f2e8]/10 bg-[#1e1a15]/70 px-4 py-3">Fast redirect into your game room</li>
                    </ul>
                </aside>

                <section className="rounded-2xl border border-[#f6f2e8]/16 bg-[#181511]/86 p-5 shadow-[0_30px_50px_rgba(0,0,0,0.45)] backdrop-blur-sm sm:p-7">
                    <header className="mb-5">
                        <h2 className="font-display text-3xl text-[#fff3e1]">{isSignUp ? "Create your account" : "Welcome back"}</h2>
                        <p className="mt-2 text-sm text-[#e8d8be]/82">
                            {isSignUp ? "Start playing online matches today." : "Sign in to continue to your board."}
                        </p>
                    </header>

                    <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl border border-[#f6f2e8]/10 bg-[#211d18] p-1">
                        <button
                            type="button"
                            onClick={() => switchMode("sign-in")}
                            className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${!isSignUp ? "bg-[#d2a572] text-[#19140f]" : "text-[#d7c6ae] hover:bg-[#2b2620]"}`}
                            aria-pressed={!isSignUp}
                        >
                            Sign in
                        </button>
                        <button
                            type="button"
                            onClick={() => switchMode("sign-up")}
                            className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${isSignUp ? "bg-[#d2a572] text-[#19140f]" : "text-[#d7c6ae] hover:bg-[#2b2620]"}`}
                            aria-pressed={isSignUp}
                        >
                            Sign up
                        </button>
                    </div>

                    <form className="space-y-4" onSubmit={handleSubmit}>
                        {isSignUp && (
                            <div>
                                <label htmlFor="signup-name" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[#eadbc4]">
                                    Full Name
                                </label>
                                <input
                                    id="signup-name"
                                    type="text"
                                    name="name"
                                    autoComplete="name"
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                    placeholder="Your name"
                                    className="w-full rounded-xl border border-[#5d5346] bg-[#241f19] px-3.5 py-3 text-white outline-none transition focus:border-[#d2a572] focus:ring-2 focus:ring-[#d2a572]/30"
                                    required
                                />
                            </div>
                        )}

                        <div>
                            <label htmlFor={emailInputId} className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[#eadbc4]">
                                Email
                            </label>
                            <input
                                id={emailInputId}
                                type="email"
                                name={isSignUp ? "email" : "username"}
                                autoComplete={isSignUp ? "email" : "username"}
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                placeholder="you@example.com"
                                className="w-full rounded-xl border border-[#5d5346] bg-[#241f19] px-3.5 py-3 text-white outline-none transition focus:border-[#d2a572] focus:ring-2 focus:ring-[#d2a572]/30"
                                required
                            />
                        </div>

                        <div>
                            <div className="mb-1.5 flex items-center justify-between">
                                <label htmlFor={passwordInputId} className="block text-xs font-semibold uppercase tracking-[0.12em] text-[#eadbc4]">
                                    Password
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((previous) => !previous)}
                                    className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#f0d6b4] hover:text-[#ffe7c8]"
                                >
                                    {showPassword ? "Hide" : "Show"}
                                </button>
                            </div>
                            <input
                                id={passwordInputId}
                                type={showPassword ? "text" : "password"}
                                name="password"
                                autoComplete={isSignUp ? "new-password" : "current-password"}
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                placeholder={isSignUp ? "Create a secure password" : "Enter your password"}
                                className="w-full rounded-xl border border-[#5d5346] bg-[#241f19] px-3.5 py-3 text-white outline-none transition focus:border-[#d2a572] focus:ring-2 focus:ring-[#d2a572]/30"
                                required
                                minLength={8}
                                aria-describedby={passwordHintId}
                            />
                            <p id={passwordHintId} className="mt-1.5 text-xs text-[#d1bea1]/85">
                                {isSignUp ? "Use at least 8 characters." : "Use your existing account password."}
                            </p>
                        </div>

                        {errorMessage && (
                            <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                                {errorMessage}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full rounded-xl bg-[#d2a572] px-3 py-3 font-extrabold uppercase tracking-[0.08em] text-[#18130e] transition hover:bg-[#e1b983] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isSubmitting ? "Please wait..." : isSignUp ? "Create account" : "Sign in"}
                        </button>
                    </form>

                    <div className="my-5 flex items-center gap-3">
                        <div className="h-px flex-1 bg-[#f6f2e8]/16" />
                        <span className="text-xs uppercase tracking-[0.16em] text-[#dfccb0]/80">or</span>
                        <div className="h-px flex-1 bg-[#f6f2e8]/16" />
                    </div>

                    <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        className="inline-flex w-full items-center justify-center gap-3 rounded-xl border border-[#f6f2e8]/20 bg-[#1f1b16] px-3 py-3 font-semibold text-[#f7edde] transition hover:border-[#d2a572]/45 hover:bg-[#27211a]"
                    >
                        <img src="/google.svg" alt="" className="h-5 w-5" />
                        Continue with Google
                    </button>
                </section>
            </section>
        </main>
    );
}

export default AuthPage;
