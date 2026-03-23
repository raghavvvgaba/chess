import { motion } from "framer-motion";
import { Shield } from "lucide-react";

type LoadingStateProps = {
  message?: string;
  subtitle?: string;
};

function LoadingState({ message = "Connecting...", subtitle = "Setting up the board" }: LoadingStateProps) {
  return (
    <main className="min-h-screen bg-[#0e0e0f] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#e9c176]/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[300px] h-[300px] bg-[#9f7e3a]/5 rounded-full blur-[80px] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center text-center space-y-10">
        {/* Animated Icon Container */}
        <div className="relative group">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
              opacity: 1,
              scale: [1, 1.05, 1],
              rotate: [0, 5, -5, 0],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="w-24 h-24 bg-gradient-gold rounded-[2rem] flex items-center justify-center shadow-2xl shadow-[#e9c176]/20 relative z-10"
          >
            <Shield className="w-12 h-12 text-[#00184a] fill-current" />
          </motion.div>
          
          {/* Subtle Ring Animation */}
          <motion.div
            animate={{
              scale: [1, 1.4, 1.6],
              opacity: [0.3, 0.1, 0],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeOut",
            }}
            className="absolute inset-0 bg-[#e9c176]/30 rounded-[2rem] z-0"
          />
        </div>

        {/* Text Section */}
        <div className="space-y-4 max-w-xs mx-auto">
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl font-display font-extrabold text-white tracking-tight"
          >
            {message}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-[#8e9192] text-xs font-bold tracking-[0.2em] uppercase"
          >
            {subtitle}
          </motion.p>
        </div>

        {/* Minimal Progress Bar */}
        <div className="w-48 h-1 bg-white/[0.03] border border-white/5 rounded-full overflow-hidden relative">
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: "100%" }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="absolute inset-0 w-full h-full bg-gradient-gold shadow-[0_0_15px_rgba(233,193,118,0.3)]"
          />
        </div>
      </div>
    </main>
  );
}

export default LoadingState;
