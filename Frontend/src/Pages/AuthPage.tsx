import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Mail, Lock, User, Eye, EyeOff } from "lucide-react";
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
        <main className="relative min-h-dvh w-full overflow-hidden bg-black text-white selection:bg-[#d2a572]/30 selection:text-[#d2a572]">
            {/* Background Image for Mobile/Tablet */}
            <div className="absolute inset-0 z-0 lg:hidden">
                <img 
                    src="/ChessAuthImage.jpg" 
                    alt="Background" 
                    className="h-full w-full object-cover grayscale-[20%]"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/70 to-black z-10" />
            </div>

            {/* Back Button */}
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="fixed top-6 left-6 z-50"
            >
                <button
                    onClick={() => navigate("/")}
                    className="group flex items-center gap-2 rounded-full border border-white/10 bg-black/40 backdrop-blur-md px-4 py-2 text-xs font-bold uppercase tracking-widest text-[#f2e4cd] transition-all hover:border-[#d2a572]/50 hover:bg-black/60"
                >
                    <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-1" />
                    Back Home
                </button>
            </motion.div>

            <div className="relative z-10 grid min-h-dvh w-full lg:grid-cols-2">
                {/* Left Side: Cinematic Branding (Desktop Only) */}
                <section className="hidden lg:relative lg:flex lg:flex-col lg:items-center lg:justify-center lg:p-12 overflow-hidden border-r border-white/5">
                    <img 
                        src="/ChessAuthImage.jpg" 
                        alt="Chess Theme" 
                        className="absolute inset-0 h-full w-full object-cover grayscale-[10%]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/40 z-10" />
                    
                    <div className="relative z-20 text-center max-w-lg">
                        <motion.h2 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="font-display text-5xl font-black tracking-tighter text-[#fff4e2] mb-6"
                        >
                            The Strategy <br />
                            <span className="text-[#d2a572]">Continues.</span>
                        </motion.h2>
                        <motion.p 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="text-lg text-[#d2a572]/60 font-light tracking-wide leading-relaxed"
                        >
                            Join the ranks of the elite. Every move is recorded, every victory celebrated in the Grandmaster's Ledger.
                        </motion.p>
                    </div>

                    {/* HUD Decorative Corners */}
                    <div className="absolute top-10 left-10 w-20 h-20 border-l border-t border-[#d2a572]/20 z-20" />
                    <div className="absolute bottom-10 right-10 w-20 h-20 border-r border-b border-[#d2a572]/20 z-20" />
                </section>

                {/* Right Side: Auth Component */}
                <section className="flex flex-col items-center justify-center p-6 sm:p-12 lg:bg-[#0a0a0a]">
                    <div className="w-full max-w-md sm:max-w-xl lg:max-w-md">
                        {/* Mobile Header (Hidden on Desktop) */}
                        <motion.header 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-center mb-10 lg:hidden"
                        >
                            
                        </motion.header>

                        {/* Auth Card */}
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="rounded-3xl border border-white/10 bg-black/40 lg:bg-transparent p-8 sm:p-10 backdrop-blur-xl lg:backdrop-blur-none"
                        >
                            <header className="mb-8 hidden lg:block">
                                <h3 className="font-display text-3xl font-bold text-white mb-2">{isSignUp ? "Create Account" : "Welcome Back"}</h3>
                                
                            </header>

                            {/* Tab Switcher */}
                            <div className="mb-8 grid grid-cols-2 gap-2 rounded-2xl border border-white/5 bg-white/5 p-1.5">
                                <button
                                    onClick={() => switchMode("sign-in")}
                                    className={`relative rounded-xl px-4 py-2.5 text-sm font-bold tracking-wide transition-all ${
                                        !isSignUp ? "text-[#19140f]" : "text-[#d7c6ae] hover:bg-white/5"
                                    }`}
                                >
                                    {!isSignUp && (
                                        <motion.div 
                                            layoutId="active-tab"
                                            className="absolute inset-0 rounded-xl bg-[#d2a572]"
                                            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                        />
                                    )}
                                    <span className="relative z-10">Sign In</span>
                                </button>
                                <button
                                    onClick={() => switchMode("sign-up")}
                                    className={`relative rounded-xl px-4 py-2.5 text-sm font-bold tracking-wide transition-all ${
                                        isSignUp ? "text-[#19140f]" : "text-[#d7c6ae] hover:bg-white/5"
                                    }`}
                                >
                                    {isSignUp && (
                                        <motion.div 
                                            layoutId="active-tab"
                                            className="absolute inset-0 rounded-xl bg-[#d2a572]"
                                            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                        />
                                    )}
                                    <span className="relative z-10">Sign Up</span>
                                </button>
                            </div>

                            <form className="space-y-5" onSubmit={handleSubmit}>
                                <AnimatePresence mode="wait">
                                    {isSignUp && (
                                        <motion.div
                                            key="signup-name"
                                            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                                            animate={{ opacity: 1, height: "auto", marginBottom: 20 }}
                                            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                                            transition={{ duration: 0.3 }}
                                        >
                                            <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.15em] text-[#eadbc4]/80">
                                                Full Name
                                            </label>
                                            <div className="relative group">
                                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#eadbc4]/40 group-focus-within:text-[#d2a572] transition-colors">
                                                    <User className="h-4.5 w-4.5" />
                                                </div>
                                                <input
                                                    type="text"
                                                    value={name}
                                                    onChange={(e) => setName(e.target.value)}
                                                    placeholder="Your name"
                                                    className="w-full rounded-2xl border border-white/10 bg-white/5 pl-12 pr-4 py-4 text-white outline-none transition-all focus:border-[#d2a572]/60 focus:ring-4 focus:ring-[#d2a572]/5"
                                                    required={isSignUp}
                                                />
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <div>
                                    <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.15em] text-[#eadbc4]/80">
                                        Email Address
                                    </label>
                                    <div className="relative group">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#eadbc4]/40 group-focus-within:text-[#d2a572] transition-colors">
                                            <Mail className="h-4.5 w-4.5" />
                                        </div>
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="you@example.com"
                                            className="w-full rounded-2xl border border-white/10 bg-white/5 pl-12 pr-4 py-4 text-white outline-none transition-all focus:border-[#d2a572]/60 focus:ring-4 focus:ring-[#d2a572]/5"
                                            required
                                        />
                                    </div>
                                </div>

                                <div>
                                    <div className="mb-2 flex items-center justify-between">
                                        <label className="block text-[11px] font-bold uppercase tracking-[0.15em] text-[#eadbc4]/80">
                                            Password
                                        </label>
                                    </div>
                                    <div className="relative group">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#eadbc4]/40 group-focus-within:text-[#d2a572] transition-colors">
                                            <Lock className="h-4.5 w-4.5" />
                                        </div>
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder={isSignUp ? "Create a secure password" : "Enter your password"}
                                            className="w-full rounded-2xl border border-white/10 bg-white/5 pl-12 pr-12 py-4 text-white outline-none transition-all focus:border-[#d2a572]/60 focus:ring-4 focus:ring-[#d2a572]/5"
                                            required
                                            minLength={8}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#eadbc4]/40 hover:text-[#d2a572] transition-colors"
                                        >
                                            {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                                        </button>
                                    </div>
                                </div>

                                {errorMessage && (
                                    <motion.p 
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-semibold text-red-400 text-center"
                                    >
                                        {errorMessage}
                                    </motion.p>
                                )}

                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full rounded-2xl bg-[#d2a572] py-4 font-black uppercase tracking-[0.12em] text-[#18130e] shadow-lg shadow-[#d2a572]/10 transition-all hover:bg-[#e1b983] hover:scale-[1.01] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isSubmitting ? "Processing..." : isSignUp ? "Create Account" : "Initialize Session"}
                                </button>
                            </form>

                            <div className="relative my-8">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-white/5" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase tracking-[0.2em]">
                                    <span className="bg-[#0a0a0a] px-4 text-[#dfccb0]/40">or connect with</span>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleGoogleSignIn}
                                className="flex items-center justify-center gap-3 w-full rounded-2xl border border-white/5 bg-white/5 py-4 font-bold text-[#f7edde] transition-all hover:border-[#d2a572]/40 hover:bg-white/10 hover:scale-[1.01] active:scale-[0.98]"
                            >
                                <img src="/google.svg" alt="" className="h-5 w-5" />
                                Continue with Google
                            </button>

                         
                        </motion.div>
                    </div>
                </section>
            </div>
        </main>
    );
}

export default AuthPage;
