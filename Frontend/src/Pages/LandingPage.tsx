import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { motion, useScroll, useTransform } from "framer-motion";
import { 
    Users, 
    Cpu, 
    Lock, 
    ArrowRight, 
    Trophy,
    Linkedin,
    Github,
    Twitter
} from "lucide-react";
import { authClient } from "../lib/auth-client";

interface GlowCardProps {
    icon: React.ReactNode;
    title: string;
    description: string;
    delay: number;
    className?: string;
}

const GlowCard = ({ icon, title, description, delay, className = "" }: GlowCardProps) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!cardRef.current) return;
        const rect = cardRef.current.getBoundingClientRect();
        setMousePos({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        });
    };

    return (
        <motion.div
            ref={cardRef}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay, duration: 0.8, ease: "easeOut" }}
            onMouseMove={handleMouseMove}
            className={`group relative flex items-center gap-6 sm:gap-8 p-6 sm:p-8 rounded-3xl border border-white/5 bg-[#1a1816]/40 backdrop-blur-md transition-all hover:border-[#d2a572]/40 w-full max-w-lg shadow-2xl cursor-default overflow-hidden ${className}`}
        >
            {/* Cursor Follow Glow */}
            <div
                className="pointer-events-none absolute -inset-px rounded-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100 z-0"
                style={{
                    background: `radial-gradient(400px circle at ${mousePos.x}px ${mousePos.y}px, rgba(210, 165, 114, 0.12), transparent 40%)`,
                }}
            />

            {/* Icon with Scanning Pulse */}
            <div className="relative flex-shrink-0">
                <div className="relative z-10 w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#d2a572]/10 border border-[#d2a572]/20 flex items-center justify-center text-[#d2a572] group-hover:scale-110 group-hover:bg-[#d2a572]/20 transition-all duration-500">
                    {icon}
                </div>
                <motion.div 
                    animate={{ 
                        top: ["0%", "100%", "0%"],
                        opacity: [0, 1, 0]
                    }}
                    transition={{ 
                        duration: 3, 
                        repeat: Infinity,
                        ease: "linear"
                    }}
                    className="absolute left-0 right-0 h-[2px] bg-[#d2a572]/40 z-20 pointer-events-none"
                />
            </div>

            <div className="relative z-10">
                <h4 className="font-display text-xl sm:text-2xl font-bold text-[#fff6e9] mb-2 group-hover:text-[#d2a572] transition-colors duration-300">
                    {title}
                </h4>
                <p className="text-xs sm:text-sm leading-relaxed text-[#d2a572]/50 group-hover:text-[#fff6e9]/80 transition-colors duration-300">
                    {description}
                </p>
            </div>

            {/* Subtle Border Glow Mask */}
            <div
                className="pointer-events-none absolute -inset-px rounded-3xl border border-[#d2a572]/30 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                style={{
                    maskImage: `radial-gradient(120px circle at ${mousePos.x}px ${mousePos.y}px, black, transparent)`,
                    WebkitMaskImage: `radial-gradient(120px circle at ${mousePos.x}px ${mousePos.y}px, black, transparent)`,
                }}
            />
        </motion.div>
    );
};

function LandingPage() {
    const navigate = useNavigate();
    const { data: session } = authClient.useSession();
    const isAuthenticated = Boolean(session?.user);
    const containerRef = useRef<HTMLDivElement>(null);

    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start start", "end end"]
    });

    const heroScale = useTransform(scrollYProgress, [0, 0.2], [1, 1.1]);
    const heroOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);

    useEffect(() => {
        const notoLink = document.createElement("link");
        notoLink.href = "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Manrope:wght@200;300;400;500;600;700;800&family=JetBrains+Mono:wght@300;400;700&display=swap";
        notoLink.rel = "stylesheet";
        document.head.appendChild(notoLink);
    }, []);

    const features = [
        {
            icon: <Users className="w-7 h-7" />,
            title: "Global Arena",
            description: "Instant matchmaking with worthy opponents globally. High-frequency updates ensure zero latency.",
            delay: 0.1,
            className: "lg:ml-0"
        },
        {
            icon: <Cpu className="w-7 h-7" />,
            title: "Stockfish AI",
            description: "Elite engines for tactical perfection. Train against the strongest neural networks.",
            delay: 0.2,
            className: "lg:ml-20"
        },
        {
            icon: <Lock className="w-7 h-7" />,
            title: "Private Sanctum",
            description: "Create private rooms to play with friends using a simple invite code.",
            delay: 0.3,
            className: "lg:ml-20"
        },
        {
            icon: <Trophy className="w-7 h-7" />,
            title: "The Ledger",
            description: "Access your complete match history and monitor your ELO rating progress.",
            delay: 0.4,
            className: "lg:ml-0"
        }
    ];

    return (
        <div ref={containerRef} className="landing-page relative min-h-screen overflow-x-hidden text-[#fff6e9] font-body selection:bg-[#d2a572]/30 selection:text-[#d2a572]">
            <div className="landing-page__mesh" aria-hidden />
            
            {/* Hero Section */}
            <section className="relative h-screen min-h-[600px] sm:min-h-[700px] w-full overflow-hidden flex flex-col items-center justify-center">
                <motion.div 
                    style={{ scale: heroScale }}
                    className="absolute inset-0 z-0"
                >
                    <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-black z-10" />
                    <img 
                        src="/HeroImage.png" 
                        alt="Background" 
                        className="w-full h-full object-cover grayscale-[30%]"
                    />
                </motion.div>

                <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden">
                    <div className="absolute top-6 left-6 sm:top-10 sm:left-10 w-20 h-20 sm:w-32 sm:h-32 border-l border-t border-[#d2a572]/20" />
                    <div className="absolute bottom-6 right-6 sm:bottom-10 sm:right-10 w-20 h-20 sm:w-32 sm:h-32 border-r border-b border-[#d2a572]/20" />
                    
                    <div className="absolute left-10 top-1/2 -translate-y-1/2 hidden lg:flex flex-col gap-8 text-[10px] font-mono tracking-[0.3em] text-[#d2a572]/40 uppercase vertical-text">
                        <span className="flex items-center gap-2"><div className="w-1 h-6 bg-[#d2a572]" /> 01 / MATCH</span>
                        <span>02 / ENGINE</span>
                        <span>03 / LEDGER</span>
                    </div>

                    <div className="absolute top-10 right-10 text-right hidden lg:block">
                        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#d2a572]/60">SERVER_STATUS // ONLINE</p>
                        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#d2a572]/60">VERSION // 0.35.3_RC</p>
                    </div>

                    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
                        <div className="w-[1px] h-8 sm:h-12 bg-gradient-to-b from-transparent to-[#d2a572]/40" />
                        <span className="font-mono text-[8px] sm:text-[9px] uppercase tracking-[0.4em] text-[#d2a572]/40">Scroll Down</span>
                    </div>
                </div>

                <motion.div 
                    style={{ opacity: heroOpacity }}
                    className="relative z-20 text-center max-w-5xl px-6"
                >
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="mb-4 sm:mb-6 flex justify-center"
                    >
                        <span className="font-mono text-[10px] sm:text-xs tracking-[0.3em] sm:tracking-[0.5em] text-[#d2a572] uppercase bg-[#d2a572]/5 px-3 py-1 border-l border-[#d2a572]">The Grandmaster's Ledger</span>
                    </motion.div>

                    <motion.h1 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="font-display text-5xl md:text-7xl lg:text-9xl font-black leading-tight sm:leading-none tracking-tighter mb-6 sm:mb-8 relative"
                    >
                        MASTER THE<br />
                        <span className="relative inline-block">
                            UNSPOKEN.
                            <div className="absolute -left-12 -right-12 top-1/2 h-[1px] bg-[#d2a572]/30 -translate-y-1/2 hidden md:block" />
                        </span>
                    </motion.h1>

                    <motion.p 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="text-base sm:text-lg md:text-xl text-[#fff6e9]/70 font-light tracking-wide max-w-2xl mx-auto mb-10 sm:mb-12 leading-relaxed"
                    >
                        A high-fidelity chess ecosystem designed for the relentless mind. <br className="hidden md:block" />
                        Zero friction, pure strategy, and the prestige of the Grandmaster's Ledger.
                    </motion.p>

                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="flex flex-col sm:flex-row gap-4 sm:gap-6 justify-center items-center"
                    >
                        <button
                            onClick={() => navigate(isAuthenticated ? "/" : "/auth")}
                            className="relative group overflow-hidden w-full sm:w-auto"
                        >
                            <div className="absolute inset-0 bg-[#d2a572] skew-x-[-20deg] transition-transform group-hover:scale-105" />
                            <div className="relative px-8 sm:px-10 py-4 sm:py-5 flex items-center justify-center gap-3">
                                <span className="text-sm font-black uppercase tracking-[0.2em] text-[#141210]">Step Into Arena</span>
                                <ArrowRight className="h-4 w-4 text-[#141210] group-hover:translate-x-1 transition-transform" />
                            </div>
                        </button>
                    </motion.div>
                </motion.div>
            </section>

            {/* Content Below Hero */}
            <div className="relative z-30 bg-black">
                {/* Features Section - Arc Layout */}
                <section id="features" className="relative py-24 sm:py-32 lg:py-52 px-6 lg:px-10 overflow-visible">
                    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                        <div className="absolute inset-0 bg-black/70 z-10" />
                        <img 
                            src="/FeatureBackground.png" 
                            alt="" 
                            className="w-full h-full object-cover grayscale"
                        />
                    </div>

                    <div className="relative z-10 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 sm:gap-24 lg:gap-32 items-center">
                        {/* Left: Feature Image */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            whileInView={{ 
                                opacity: 1, 
                                rotate: -3, 
                                scale: 1.05,
                                transition: { duration: 0.8 } 
                            }}
                            whileHover={{ 
                                scale: 1.1, 
                                transition: { duration: 0.2 }
                            }}
                            viewport={{ once: true }}
                            className="relative z-10 lg:scale-[1.3] lg:whileInView={{ scale: 1.3 }} mx-auto lg:mx-0 max-w-sm sm:max-w-md lg:max-w-none"
                        >
                            <img 
                                src="/FeatureImage.png" 
                                alt="The Strategy" 
                                className="w-full h-auto"
                            />
                        </motion.div>

                        {/* Right: Features - Arc on Desktop, Stacked on Mobile */}
                        <div className="flex flex-col gap-8 sm:gap-10 lg:gap-12 items-center lg:items-start lg:pl-10">
                            {features.map((feature, i) => (
                                <GlowCard 
                                    key={i}
                                    icon={feature.icon}
                                    title={feature.title}
                                    description={feature.description}
                                    delay={feature.delay}
                                    className={feature.className}
                                />
                            ))}
                        </div>
                    </div>
                </section>

                {/* CTA Section */}
                <section className="relative py-32 sm:py-44 px-6 overflow-hidden">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] sm:w-[800px] h-[400px] bg-[#d2a572]/5 blur-[80px] sm:blur-[120px] rounded-full" />
                    
                    <div className="relative z-10 max-w-4xl mx-auto text-center">
                        <h2 className="font-display text-4xl sm:text-5xl md:text-7xl font-black mb-6 sm:mb-8 leading-tight">
                            Your Board <br />
                            <span className="text-[#d2a572]">Awaits.</span>
                        </h2>
                        <p className="text-base sm:text-lg text-[#d2a572]/60 mb-10 sm:mb-12 max-w-xl mx-auto">
                            Join the ledger of those who play with purpose. Secure, anonymous, and elite.
                        </p>
                        <button
                            onClick={() => navigate(isAuthenticated ? "/" : "/auth")}
                            className="rounded-2xl bg-[#d2a572] px-8 sm:px-12 py-5 sm:py-6 text-sm font-black uppercase tracking-[0.2em] text-[#141210] transition-all hover:bg-[#e1b983] hover:scale-105"
                        >
                            Initialize Game
                        </button>
                    </div>
                </section>

                {/* Footer */}
                <footer className="relative py-16 sm:py-20 px-6 lg:px-10 border-t border-white/5 bg-[#141210]">
                    <div className="max-w-7xl mx-auto">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 sm:gap-12 mb-16 sm:mb-20">
                            <div className="md:col-span-2">
                                <h2 className="font-display font-black text-2xl sm:text-3xl tracking-tighter text-[#d2a572] mb-6">CHESS.</h2>
                                <p className="text-sm text-[#d2a572]/40 max-w-sm leading-relaxed">
                                    The ultimate destination for modern strategic minds. 
                                    Built for performance, designed for the aesthetic minimalist.
                                </p>
                            </div>
                            
                            <div>
                                <h5 className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#d2a572] mb-4 sm:mb-6">Explore</h5>
                                <ul className="space-y-3 sm:space-y-4 text-sm text-[#d2a572]/60">
                                    <li><a href="#" className="hover:text-white transition-colors">Privacy</a></li>
                                    <li><a href="#" className="hover:text-white transition-colors">Terms</a></li>
                                    <li><a href="#" className="hover:text-white transition-colors">Support</a></li>
                                </ul>
                            </div>
                            
                            <div>
                                <h5 className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#d2a572] mb-4 sm:mb-6">Social</h5>
                                <div className="flex gap-4">
                                    <a href="https://github.com/raghavvvgaba" target="_blank" rel="noreferrer" className="h-10 w-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-[#d2a572]/20 transition-colors">
                                        <Github className="h-4 w-4" />
                                    </a>
                                    <a href="https://x.com/raghavvvgaba" target="_blank" rel="noreferrer" className="h-10 w-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-[#d2a572]/20 transition-colors">
                                        <Twitter className="h-4 w-4" />
                                    </a>
                                    <a href="https://linkedin.com/in/raghavvvgaba" target="_blank" rel="noreferrer" className="h-10 w-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-[#d2a572]/20 transition-colors">
                                        <Linkedin className="h-4 w-4" />
                                    </a>
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex flex-col md:flex-row justify-between items-center pt-10 sm:pt-12 border-t border-white/5 gap-6">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[#d2a572]/30 text-center md:text-left">
                                © 2026 The Grandmaster's Ledger.
                            </p>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[#d2a572]/30 text-center md:text-left">
                                Made by Raghav Gaba
                            </p>
                        </div>
                    </div>
                </footer>
            </div>

            <style>{`
                .vertical-text {
                    writing-mode: vertical-rl;
                    transform: rotate(180deg);
                }
            `}</style>
        </div>
    );
}

export default LandingPage;
