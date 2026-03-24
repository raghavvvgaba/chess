import { Swords, X, Loader2 } from "lucide-react";

type MatchmakingModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onStart: () => void;
  onCancel: () => void;
  onReconnect: () => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onRoomCodeInputChange: (value: string) => void;
  onCopyRoomCode: () => void;
  onCopyInviteLink: () => void;
  gameState: "idle" | "waiting";
  statusMessage?: string;
  cancelRequested: boolean;
  showReconnectAction: boolean;
  roomCodeInput: string;
  createdRoomCode: string;
  roomActionPending: boolean;
  roomInviteLink: string;
  roomExpiresInLabel?: string;
};

function MatchmakingModal({
  isOpen,
  onClose,
  onStart,
  onCancel,
  onReconnect,
  onCreateRoom,
  onJoinRoom,
  onRoomCodeInputChange,
  onCopyRoomCode,
  onCopyInviteLink,
  gameState,
  statusMessage,
  cancelRequested,
  showReconnectAction,
  roomCodeInput,
  createdRoomCode,
  roomActionPending,
  roomInviteLink,
  roomExpiresInLabel,
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

          {gameState === "idle" && !showReconnectAction ? (
            <div className="space-y-4">
              <button
                onClick={onStart}
                className="w-full py-4 bg-gradient-gold rounded-2xl text-[#00184a] font-bold text-lg hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-[#e9c176]/10 btn-glow-hover"
              >
                Start Finding Match
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center" aria-hidden>
                  <div className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-[#171613] px-3 text-[11px] uppercase tracking-[0.18em] text-[#8e9192]">Private Room</span>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left">
                {!createdRoomCode ? (
                  <button
                    onClick={onCreateRoom}
                    disabled={roomActionPending}
                    className="w-full py-3 rounded-xl bg-[#b58863] hover:bg-[#a0764b] text-white font-bold transition-colors disabled:opacity-60"
                  >
                    {roomActionPending ? "Working..." : "Create Private Room"}
                  </button>
                ) : null}

                {createdRoomCode ? (
                  <div className="space-y-2 rounded-xl border border-[#e9c176]/25 bg-[#201d18] p-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-[#e9c176]/80">Share this room code</p>
                    <p className="font-mono text-xl font-bold tracking-[0.2em] text-[#e9c176]">{createdRoomCode}</p>
                    {roomExpiresInLabel ? (
                      <p className="text-xs text-[#c4c7c7]">Waiting for opponent to join. Expires in {roomExpiresInLabel}.</p>
                    ) : (
                      <p className="text-xs text-[#c4c7c7]">Waiting for opponent to join...</p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={onCopyRoomCode}
                        className="rounded-lg border border-white/15 py-2 text-xs font-semibold hover:bg-white/5"
                      >
                        Copy Code
                      </button>
                      <button
                        type="button"
                        onClick={onCopyInviteLink}
                        className="rounded-lg border border-white/15 py-2 text-xs font-semibold hover:bg-white/5"
                      >
                        Copy Link
                      </button>
                    </div>
                    <p className="break-all text-xs text-[#c4c7c7]">{roomInviteLink}</p>
                  </div>
                ) : null}

                {!createdRoomCode ? (
                  <div className="space-y-2">
                    <label className="text-[11px] uppercase tracking-[0.16em] text-[#8e9192]">Join Room</label>
                    <div className="flex gap-2">
                      <input
                        value={roomCodeInput}
                        onChange={(event) => onRoomCodeInputChange(event.target.value)}
                        maxLength={6}
                        placeholder="Enter room code"
                        className="flex-1 rounded-lg border border-white/10 bg-[#1f1e1b] px-3 py-2 font-mono text-sm tracking-[0.16em] uppercase focus:outline-none focus:ring-2 focus:ring-[#e9c176]/30"
                      />
                      <button
                        onClick={onJoinRoom}
                        disabled={roomActionPending}
                        className="rounded-lg bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-60"
                      >
                        Join
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : gameState === "idle" && showReconnectAction ? (
            <div className="space-y-3">
              <button
                onClick={onReconnect}
                className="w-full py-4 bg-gradient-gold rounded-2xl text-[#00184a] font-bold text-lg hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-[#e9c176]/10 btn-glow-hover"
              >
                Reconnect to Active Match
              </button>
              <button
                onClick={onClose}
                className="w-full py-4 rounded-2xl border border-white/10 hover:bg-white/5 text-white font-bold transition-all"
              >
                Close
              </button>
            </div>
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
