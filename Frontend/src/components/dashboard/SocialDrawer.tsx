import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, 
  Search, 
  UserPlus, 
  Check, 
  XCircle, 
  Inbox, 
  Users,
  Clock,
  User,
  SearchCode
} from "lucide-react";

type FriendSearchState =
  | "none"
  | "self"
  | "incoming_pending"
  | "outgoing_pending"
  | "friends"
  | "blocked";

type FriendSearchResult = {
  userId: string;
  name: string;
  chessUserId: string;
  friendshipState: FriendSearchState;
};

type IncomingFriendRequest = {
  id: string;
  sender: {
    userId: string;
    name: string;
    chessUserId: string;
  };
  createdAt: string;
};

type FriendListItem = {
  friendshipId: string;
  user: {
    userId: string;
    name: string;
    chessUserId: string;
  };
  connectedAt: string;
};

type SocialDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  friends: FriendListItem[];
  incomingRequests: IncomingFriendRequest[];
  onAcceptRequest: (id: string) => Promise<void>;
  onRejectRequest: (id: string) => Promise<void>;
  onSearch: (chessId: string) => Promise<FriendSearchResult | null>;
  onSendRequest: (chessId: string) => Promise<string>;
  formatDate: (date: string | null) => string;
};

function normalizeChessIdInput(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8);
}

function SocialDrawer({
  isOpen,
  onClose,
  friends,
  incomingRequests,
  onAcceptRequest,
  onRejectRequest,
  onSearch,
  onSendRequest,
  formatDate,
}: SocialDrawerProps) {
  const [activeTab, setActiveTab] = useState<"friends" | "requests" | "search">("friends");
  const [searchValue, setSearchValue] = useState("");
  const [searchResult, setSearchResult] = useState<FriendSearchResult | null>(null);
  const [searchMessage, setSearchMessage] = useState<{ text: string; tone: "neutral" | "success" | "warning" | "error" } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      // Reset search state when closing
      setSearchValue("");
      setSearchResult(null);
      setSearchMessage(null);
    }
  }, [isOpen]);

  const handleSearch = async () => {
    const normalized = normalizeChessIdInput(searchValue);
    if (normalized.length !== 8) {
      setSearchMessage({ text: "Enter a full 8-character Chess ID.", tone: "warning" });
      return;
    }

    setIsSearching(true);
    setSearchMessage(null);
    try {
      const result = await onSearch(normalized);
      setSearchResult(result);
      if (!result) {
        setSearchMessage({ text: "No player found with that ID.", tone: "warning" });
      }
    } catch (error) {
      setSearchMessage({ text: error instanceof Error ? error.message : "Search failed", tone: "error" });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendRequest = async () => {
    if (!searchResult) return;
    setIsSending(true);
    try {
      const outcome = await onSendRequest(searchResult.chessUserId);
      setSearchMessage({ text: outcome, tone: "success" });
      // Update result state locally to disable button
      if (outcome.includes("sent") || outcome.includes("pending")) {
        setSearchResult({ ...searchResult, friendshipState: "outgoing_pending" });
      } else if (outcome.includes("accepted") || outcome.includes("friends")) {
        setSearchResult({ ...searchResult, friendshipState: "friends" });
      }
    } catch (error) {
      setSearchMessage({ text: error instanceof Error ? error.message : "Failed to send request", tone: "error" });
    } finally {
      setIsSending(false);
    }
  };

  const toneClasses = {
    success: "text-emerald-400",
    warning: "text-amber-400",
    error: "text-rose-400",
    neutral: "text-[#8e9192]",
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-full sm:w-[400px] bg-[#0e0e0f] border-l border-white/5 z-[101] flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <div>
                <h2 className="text-xl font-display font-bold text-white tracking-tight">Social Hub</h2>
                <p className="text-[10px] text-[#8e9192] uppercase tracking-[0.2em] mt-1 font-bold">Connect with players</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-white/5 text-[#8e9192] hover:text-white transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="px-6 py-4 flex gap-2 border-b border-white/5 overflow-x-auto no-scrollbar">
              {[
                { id: "friends", label: "Friends", icon: <Users className="w-3.5 h-3.5" />, count: friends.length },
                { id: "requests", label: "Requests", icon: <Inbox className="w-3.5 h-3.5" />, count: incomingRequests.length },
                { id: "search", label: "Add Friend", icon: <UserPlus className="w-3.5 h-3.5" /> },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    activeTab === tab.id
                      ? "bg-[#e9c176]/10 text-[#e9c176] ring-1 ring-[#e9c176]/20"
                      : "text-[#8e9192] hover:text-white hover:bg-white/5"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className={`ml-1 px-1.5 py-0.5 rounded-md text-[9px] ${activeTab === tab.id ? "bg-[#e9c176]/20" : "bg-white/10"}`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
              {activeTab === "friends" && (
                <div className="space-y-3">
                  {friends.length === 0 ? (
                    <div className="text-center py-12 space-y-4">
                      <div className="w-16 h-16 bg-white/[0.03] rounded-3xl flex items-center justify-center mx-auto">
                        <Users className="w-8 h-8 text-[#444748]" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-white">No friends yet</p>
                        <p className="text-xs text-[#8e9192]">Start adding players to build your circle.</p>
                      </div>
                      <button
                        onClick={() => setActiveTab("search")}
                        className="text-[#e9c176] text-xs font-bold hover:underline"
                      >
                        Find someone
                      </button>
                    </div>
                  ) : (
                    friends.map((friend) => (
                      <div key={friend.friendshipId} className="glass-obsidian border border-white/5 rounded-2xl p-4 group hover:bg-white/5 transition-all">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-gold flex items-center justify-center shadow-lg shadow-[#e9c176]/10">
                            <span className="text-[#00184a] font-black text-xs">{friend.user.name.charAt(0).toUpperCase()}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white truncate">{friend.user.name}</p>
                            <p className="text-[10px] text-[#8e9192] uppercase tracking-widest">{friend.user.chessUserId}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-[9px] text-[#444748] font-bold uppercase tracking-tighter flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" /> {formatDate(friend.connectedAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === "requests" && (
                <div className="space-y-3">
                  {incomingRequests.length === 0 ? (
                    <div className="text-center py-12 space-y-4">
                      <div className="w-16 h-16 bg-white/[0.03] rounded-3xl flex items-center justify-center mx-auto">
                        <Inbox className="w-8 h-8 text-[#444748]" />
                      </div>
                      <p className="text-sm font-bold text-white">Inbox is clear</p>
                      <p className="text-xs text-[#8e9192]">No pending requests at the moment.</p>
                    </div>
                  ) : (
                    incomingRequests.map((request) => (
                      <div key={request.id} className="glass-obsidian border border-white/5 rounded-2xl p-4 space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                            <User className="w-5 h-5 text-emerald-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white truncate">{request.sender.name}</p>
                            <p className="text-[10px] text-[#8e9192] uppercase tracking-widest">{request.sender.chessUserId}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setActionId(request.id); onAcceptRequest(request.id).finally(() => setActionId(null)); }}
                            disabled={!!actionId}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold transition-all"
                          >
                            {actionId === request.id ? <div className="w-3.5 h-3.5 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            Accept
                          </button>
                          <button
                            onClick={() => { setActionId(request.id); onRejectRequest(request.id).finally(() => setActionId(null)); }}
                            disabled={!!actionId}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 text-[#8e9192] hover:bg-white/10 text-xs font-bold transition-all"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Reject
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === "search" && (
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="relative group">
                      <SearchCode className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#444748] group-focus-within:text-[#e9c176] transition-colors" />
                      <input
                        type="text"
                        placeholder="CHESS ID (8 CHARS)"
                        value={searchValue}
                        onChange={(e) => setSearchValue(normalizeChessIdInput(e.target.value))}
                        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                        className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold tracking-[0.2em] text-white placeholder:text-[#444748] focus:outline-none focus:ring-2 focus:ring-[#e9c176]/10 focus:border-[#e9c176]/20 transition-all uppercase"
                      />
                    </div>
                    <button
                      onClick={handleSearch}
                      disabled={isSearching || searchValue.length !== 8}
                      className="w-full py-4 bg-gradient-gold rounded-2xl text-[#00184a] font-bold text-sm shadow-xl shadow-[#e9c176]/5 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 disabled:scale-100"
                    >
                      {isSearching ? "Searching..." : "Search Player"}
                    </button>
                  </div>

                  {searchMessage && (
                    <motion.p
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`text-center text-[11px] font-bold uppercase tracking-wider ${toneClasses[searchMessage.tone]}`}
                    >
                      {searchMessage.text}
                    </motion.p>
                  )}

                  {searchResult && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="glass-obsidian border border-white/5 rounded-[2rem] p-6 space-y-6"
                    >
                      <div className="flex flex-col items-center text-center space-y-3">
                        <div className="w-16 h-16 bg-gradient-gold rounded-3xl flex items-center justify-center shadow-xl shadow-[#e9c176]/10">
                          <span className="text-[#00184a] font-black text-2xl">{searchResult.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-white">{searchResult.name}</p>
                          <p className="text-[10px] text-[#8e9192] uppercase tracking-[0.3em] font-bold">{searchResult.chessUserId}</p>
                        </div>
                      </div>

                      <button
                        onClick={handleSendRequest}
                        disabled={isSending || searchResult.friendshipState !== "none"}
                        className={`w-full py-3.5 rounded-xl font-bold text-xs transition-all ${
                          searchResult.friendshipState === "none"
                            ? "bg-white/10 text-white hover:bg-white/15"
                            : "bg-white/[0.03] text-[#444748] cursor-default"
                        }`}
                      >
                        {isSending ? "Sending..." : 
                         searchResult.friendshipState === "friends" ? "Already Friends" :
                         searchResult.friendshipState === "outgoing_pending" ? "Request Pending" :
                         searchResult.friendshipState === "incoming_pending" ? "Accept Incoming Request" :
                         searchResult.friendshipState === "self" ? "This is You" :
                         "Send Friend Request"}
                      </button>
                    </motion.div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default SocialDrawer;
