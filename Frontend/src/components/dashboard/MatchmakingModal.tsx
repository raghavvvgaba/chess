import { Swords, X, Loader2 } from "lucide-react";

type MatchmakingModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onStart: () => void;
  onCancel: () => void;
  gameState: "idle" | "waiting";
  statusMessage?: string;
  cancelRequested: boolean;
};

function MatchmakingModal({
  isOpen,
  onClose,
  onStart,
  onCancel,
  gameState,
  statusMessage,
  cancelRequested,
}: MatchmakingModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" 
        onClick={gameState === "idle" ? onClose : undefined}
      />
      
      <div className="relative w-full max-w-md glass-obsidian border border-white/10 rounded-[32px] p-8 shadow-2xl animate-in zoom-in-95 duration-300">
        {gameState === "idle" && (
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 p-2 rounded-full hover:bg-white/5 text-[#8e9192] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="text-center space-y-6">
          <div className="w-20 h-20 bg-gradient-gold rounded-3xl flex items-center justify-center mx-auto shadow-lg shadow-[#e9c176]/20 relative overflow-hidden group">
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
            <Swords className="w-10 h-10 text-[#00184a] relative z-10" />
          </div>

          <div className="space-y-2">
            <h2 className="text-3xl font-display font-bold text-white">
              {gameState === "idle" ? "Quick Matchmaking" : "Searching..."}
            </h2>
            <p className="text-[#c4c7c7] text-sm">
              {gameState === "idle" 
                ? "Join the public queue and find an opponent instantly." 
                : "Looking for a worthy opponent. This usually takes a few seconds."}
            </p>
          </div>

          {gameState === "idle" ? (
            <button
              onClick={onStart}
              className="w-full py-4 bg-gradient-gold rounded-2xl text-[#00184a] font-bold text-lg hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-[#e9c176]/10 btn-glow-hover"
            >
              Start Finding Match
            </button>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-center gap-3 py-4 text-[#e9c176]">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="font-bold tracking-wide uppercase text-xs">Waiting for opponent</span>
              </div>
              
              <button
                onClick={onCancel}
                disabled={cancelRequested}
                className="w-full py-4 rounded-2xl border border-white/10 hover:bg-white/5 text-white font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cancelRequested ? "Cancelling..." : "Cancel Search"}
              </button>
            </div>
          )}

          {statusMessage && (
            <p className="text-xs text-[#8e9192] animate-pulse">{statusMessage}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default MatchmakingModal;
