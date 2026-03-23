import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { authClient } from "../lib/auth-client";
import AppSidebar from "../components/dashboard/AppSidebar";
import useSocket from "../hooks/useSocket";
import MatchmakingModal from "../components/dashboard/MatchmakingModal";
import SocialDrawer from "../components/dashboard/SocialDrawer";
import {
  INIT_GAME,
  WAITING_FOR_OPPONENT,
  MATCHMAKING_CANCELLED,
  ALREADY_WAITING,
  ALREADY_IN_GAME,
  CANCEL_MATCHMAKING,
  ACTION_REJECTED,
} from "./Game";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  History,
  MinusCircle,
  Play,
  Swords,
  Target,
  Trophy,
  Users,
  XCircle,
} from "lucide-react";

const backendUrl = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8080";

type MatchHistoryItem = {
  id: string;
  opponentName: string;
  playerColor: "white" | "black";
  status: "active" | "finished" | "aborted";
  outcome: "win" | "loss" | "draw" | "aborted" | "in_progress";
  result: "white" | "black" | "draw" | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
};

type MatchHistoryApiItem = {
  id: string;
  opponent_name: string;
  player_color: "white" | "black";
  status: "active" | "finished" | "aborted";
  outcome: "win" | "loss" | "draw" | "aborted" | "in_progress";
  result: "white" | "black" | "draw" | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
};

type MatchHistoryResponse = {
  matches: MatchHistoryApiItem[];
};

type Profile = {
  id: string;
  name: string;
  email: string;
  chessUserId: string;
};

type ProfileResponse = {
  profile: Profile;
};

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

type FriendSearchResponse = {
  result: FriendSearchResult | null;
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

type IncomingFriendRequestsResponse = {
  requests: IncomingFriendRequest[];
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

type FriendsListResponse = {
  friends: FriendListItem[];
};

type FetchState = "idle" | "loading" | "success" | "error";

function DashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const socket = useSocket();
  const { data: session } = authClient.useSession();
  const user = session?.user;

  const [matches, setMatches] = useState<MatchHistoryItem[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [incomingRequests, setIncomingRequests] = useState<IncomingFriendRequest[]>([]);
  const [friends, setFriends] = useState<FriendListItem[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isNewMatchDropdownOpen, setIsNewMatchDropdownOpen] = useState(false);
  const [isSocialDrawerOpen, setIsSocialDrawerOpen] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Matchmaking State
  const [isMatchmakingModalOpen, setIsMatchmakingModalOpen] = useState(false);
  const [matchmakingState, setMatchmakingState] = useState<"idle" | "waiting">("idle");
  const [matchmakingStatus, setMatchmakingStatus] = useState<string>("");
  const [matchmakingCancelRequested, setMatchmakingCancelRequested] = useState(false);

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event: MessageEvent) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case WAITING_FOR_OPPONENT:
          setMatchmakingState("waiting");
          setMatchmakingStatus("");
          setMatchmakingCancelRequested(false);
          setIsMatchmakingModalOpen(true);
          break;
        case INIT_GAME:
          if (message.payload) {
            setIsMatchmakingModalOpen(false);
            setMatchmakingState("idle");
            navigate("/game", { state: { initialGameData: message.payload } });
          }
          break;
        case MATCHMAKING_CANCELLED:
          setMatchmakingState("idle");
          setMatchmakingStatus("Matchmaking cancelled.");
          setMatchmakingCancelRequested(false);
          break;
        case ALREADY_WAITING:
          setMatchmakingState("waiting");
          setMatchmakingStatus("Matchmaking already active.");
          break;
        case ALREADY_IN_GAME:
          setMatchmakingStatus("You are already in a game.");
          break;
        case ACTION_REJECTED:
          setMatchmakingStatus(message.payload?.reason || "Action rejected.");
          setMatchmakingCancelRequested(false);
          break;
      }
    };

    socket.addEventListener("message", handleMessage);
    return () => socket.removeEventListener("message", handleMessage);
  }, [socket, navigate]);

  const handleStartMatchmaking = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setMatchmakingStatus("Connecting to server...");
      return;
    }
    socket.send(JSON.stringify({ type: INIT_GAME }));
    setMatchmakingStatus("Requesting match...");
  };

  useEffect(() => {
    if (!location.state || typeof location.state !== "object") {
      return;
    }

    if ((location.state as { openMatchmaking?: boolean }).openMatchmaking) {
      setIsMatchmakingModalOpen(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate]);

  const handleCancelMatchmaking = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    setMatchmakingCancelRequested(true);
    socket.send(JSON.stringify({ type: CANCEL_MATCHMAKING }));
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsNewMatchDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!session?.user?.id) {
      navigate("/auth", { replace: true });
      return;
    }

    let isActive = true;

    async function loadDashboard(showLoading = false) {
      if (showLoading) {
        setFetchState("loading");
      }

      try {
        const [profileResponse, historyResponse, incomingRequestsResponse, friendsResponse] = await Promise.all([
          fetch(`${backendUrl}/api/me`, {
            method: "GET",
            credentials: "include",
          }),
          fetch(`${backendUrl}/api/matches/history`, {
            method: "GET",
            credentials: "include",
          }),
          fetch(`${backendUrl}/api/friends/requests/incoming`, {
            method: "GET",
            credentials: "include",
          }),
          fetch(`${backendUrl}/api/friends`, {
            method: "GET",
            credentials: "include",
          }),
        ]);

        if (!profileResponse.ok) {
          const errorData = await profileResponse.json().catch(() => ({}));
          throw new Error(errorData.message || `Failed to fetch profile: ${profileResponse.status}`);
        }

        if (!historyResponse.ok) {
          const errorData = await historyResponse.json().catch(() => ({}));
          throw new Error(errorData.message || `Failed to fetch match history: ${historyResponse.status}`);
        }

        if (!incomingRequestsResponse.ok) {
          const errorData = await incomingRequestsResponse.json().catch(() => ({}));
          throw new Error(errorData.message || `Failed to fetch incoming requests: ${incomingRequestsResponse.status}`);
        }

        if (!friendsResponse.ok) {
          const errorData = await friendsResponse.json().catch(() => ({}));
          throw new Error(errorData.message || `Failed to fetch friends: ${friendsResponse.status}`);
        }

        const [profileData, historyData, incomingData, friendsData]: [ProfileResponse, MatchHistoryResponse, IncomingFriendRequestsResponse, FriendsListResponse] = await Promise.all([
          profileResponse.json(),
          historyResponse.json(),
          incomingRequestsResponse.json(),
          friendsResponse.json(),
        ]);

        if (!isActive) {
          return;
        }

        setProfile(profileData.profile);
        setIncomingRequests(incomingData.requests ?? []);
        setFriends(friendsData.friends ?? []);
        setMatches(
          (historyData.matches ?? []).map((match) => ({
            id: match.id,
            opponentName: match.opponent_name,
            playerColor: match.player_color,
            status: match.status,
            outcome: match.outcome,
            result: match.result,
            startedAt: match.started_at,
            endedAt: match.ended_at,
            createdAt: match.created_at,
          }))
        );
        setFetchState("success");
        setErrorMessage(null);
      } catch (error) {
        if (!isActive) {
          return;
        }
        setFetchState("error");
        setErrorMessage(error instanceof Error ? error.message : "Failed to load dashboard");
      }
    }

    void loadDashboard(true);
    const refreshTimer = window.setInterval(() => {
      void loadDashboard(false);
    }, 15000);

    return () => {
      isActive = false;
      window.clearInterval(refreshTimer);
    };
  }, [navigate, session?.user?.id]);

  useEffect(() => {
    if (copyState !== "copied") {
      return;
    }

    const timer = window.setTimeout(() => {
      setCopyState("idle");
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [copyState]);

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return "Unknown";
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  };

  const getOutcomeDetails = (outcome: MatchHistoryItem["outcome"]) => {
    switch (outcome) {
      case "win":
        return { label: "Victory", color: "text-emerald-400", bg: "bg-emerald-400/10", icon: <CheckCircle2 className="w-4 h-4" /> };
      case "loss":
        return { label: "Defeat", color: "text-rose-400", bg: "bg-rose-400/10", icon: <XCircle className="w-4 h-4" /> };
      case "draw":
        return { label: "Draw", color: "text-amber-400", bg: "bg-amber-400/10", icon: <MinusCircle className="w-4 h-4" /> };
      case "in_progress":
        return { label: "In Progress", color: "text-blue-400", bg: "bg-blue-400/10", icon: <Clock className="w-4 h-4" /> };
      default:
        return { label: "Aborted", color: "text-slate-400", bg: "bg-slate-400/10", icon: <Clock className="w-4 h-4" /> };
    }
  };

  const stats = [
    { label: "Total Games", value: matches.length, icon: <Swords className="w-4 h-4" />, color: "text-blue-400" },
    { label: "Wins", value: matches.filter((match) => match.outcome === "win").length, icon: <Trophy className="w-4 h-4" />, color: "text-emerald-400" },
    { label: "Live Games", value: matches.filter((match) => match.outcome === "in_progress").length, icon: <Clock className="w-4 h-4" />, color: "text-amber-400" },
    { label: "Draws", value: matches.filter((match) => match.outcome === "draw").length, icon: <Target className="w-4 h-4" />, color: "text-[#e9c176]" },
  ];

  async function handleCopyChessId() {
    if (!profile?.chessUserId) {
      setCopyState("error");
      return;
    }

    try {
      await navigator.clipboard.writeText(profile.chessUserId);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  async function refreshIncomingRequests() {
    const response = await fetch(`${backendUrl}/api/friends/requests/incoming`, {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Failed to refresh incoming requests");
    }

    const data: IncomingFriendRequestsResponse = await response.json();
    setIncomingRequests(data.requests ?? []);
  }

  async function refreshFriends() {
    const response = await fetch(`${backendUrl}/api/friends`, {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Failed to refresh friends");
    }

    const data: FriendsListResponse = await response.json();
    setFriends(data.friends ?? []);
  }

  async function handleSearchFriend(chessId: string): Promise<FriendSearchResult | null> {
    const response = await fetch(`${backendUrl}/api/friends/search?chessUserId=${encodeURIComponent(chessId)}`, {
      method: "GET",
      credentials: "include",
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || "Failed to search for player");
    }

    const resultData = data as FriendSearchResponse;
    return resultData.result;
  }

  async function handleSendFriendRequest(chessId: string): Promise<string> {
    const response = await fetch(`${backendUrl}/api/friends/request`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chessUserId: chessId }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || "Failed to send friend request");
    }

    const outcome = data.outcome as string;
    switch (outcome) {
      case "already_pending":
        return "Friend request already pending.";
      case "already_friends":
        return "You are already friends.";
      case "auto_accepted":
        await refreshIncomingRequests();
        await refreshFriends();
        return "Request matched and accepted automatically!";
      default:
        return "Friend request sent.";
    }
  }

  async function handleIncomingRequestAction(requestId: string, action: "accept" | "reject") {
    const response = await fetch(`${backendUrl}/api/friends/requests/${requestId}/${action}`, {
      method: "POST",
      credentials: "include",
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || `Failed to ${action} request`);
    }

    setIncomingRequests((current) => current.filter((request) => request.id !== requestId));
    if (action === "accept") {
      await refreshFriends();
    }
  }

  return (
    <div className="min-h-screen dashboard-page flex flex-col md:flex-row text-[#e5e2e3]">
      <AppSidebar
        chessUserId={profile?.chessUserId ?? null}
        onCopyChessId={() => {
          void handleCopyChessId();
        }}
        onStartOnlineMatch={() => {
          setIsMatchmakingModalOpen(true);
        }}
        copyState={copyState}
      />

      <main className="flex-1 relative z-10 px-4 pt-20 pb-4 md:p-8 lg:p-12 overflow-y-auto max-h-screen custom-scrollbar">
        <div className="dashboard-page__mesh" />

        <div className="max-w-7xl mx-auto space-y-10">
          <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h1 className="text-4xl md:text-6xl font-display font-extrabold tracking-tight">
                Welcome back, <span className="text-[#e9c176]">{user?.name?.split(" ")[0] || "Player"}</span>
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setIsNewMatchDropdownOpen(!isNewMatchDropdownOpen)}
                  className="group relative px-5 py-2 bg-gradient-gold rounded-xl overflow-hidden shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] btn-glow-hover flex items-center gap-1.5 text-[#00184a] font-bold text-sm h-[52px]"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>New Match</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${isNewMatchDropdownOpen ? "rotate-180" : ""}`} />
                </button>

                {isNewMatchDropdownOpen && (
                  <div className="absolute left-0 mt-3 w-64 glass-obsidian border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200">
                    <button
                      onClick={() => { setIsMatchmakingModalOpen(true); setIsNewMatchDropdownOpen(false); }}
                      className="w-full flex items-center gap-4 p-4 hover:bg-white/5 transition-colors group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                        <Swords className="w-5 h-5 text-blue-400" />
                      </div>
                      <div className="text-left">
                        <p className="font-bold text-sm">Quick Matchmaking</p>
                        <p className="text-[10px] text-[#8e9192]">Public queue for live players</p>
                      </div>
                      <ChevronRight className="w-4 h-4 ml-auto text-[#444748] group-hover:text-[#e9c176] transition-colors" />
                    </button>
                    <div className="h-[1px] bg-white/5 mx-4" />
                    <button
                      onClick={() => { navigate("/bot"); setIsNewMatchDropdownOpen(false); }}
                      className="w-full flex items-center gap-4 p-4 hover:bg-white/5 transition-colors group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                        <Cpu className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div className="text-left">
                        <p className="font-bold text-sm">Vs Computer</p>
                        <p className="text-[10px] text-[#8e9192]">Practice with Stockfish</p>
                      </div>
                      <ChevronRight className="w-4 h-4 ml-auto text-[#444748] group-hover:text-[#e9c176] transition-colors" />
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setIsSocialDrawerOpen(true)}
                className="relative group inline-flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-white/8 bg-white/[0.04] text-[#8e9192] transition-all hover:bg-white/[0.08] hover:text-white"
              >
                <Users className="h-5 w-5" />
                {incomingRequests.length > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-lg bg-rose-500 text-[10px] font-bold text-white shadow-lg ring-2 ring-[#0e0e0f]">
                    {incomingRequests.length}
                  </span>
                )}
              </button>
            </div>
          </header>

          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {stats.map((stat) => (
              <div key={stat.label} className="glass-obsidian border border-white/5 p-4 rounded-xl relative overflow-hidden group">
                <div className="absolute top-3 right-3 opacity-[0.1] group-hover:opacity-[0.2] transition-opacity">
                  {stat.icon}
                </div>
                <p className="text-[10px] md:text-xs font-label text-[#7f8283] uppercase tracking-[0.16em]">{stat.label}</p>
                <p className={`text-3xl md:text-4xl leading-none font-display font-bold mt-2 ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </section>

          {fetchState === "loading" && (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((value) => (
                <div key={value} className="h-24 glass-obsidian rounded-2xl animate-pulse" />
              ))}
            </div>
          )}

          {fetchState === "error" && (
            <div className="glass-obsidian border border-rose-500/20 rounded-3xl p-12 text-center space-y-6">
              <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto">
                <XCircle className="w-10 h-10 text-rose-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-display font-bold">Failed to Load Dashboard</h3>
                <p className="text-[#c4c7c7] max-w-sm mx-auto">{errorMessage || "The board is currently offline. Please try again later."}</p>
              </div>
              <button
                onClick={() => window.location.reload()}
                className="px-8 py-3 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 rounded-xl transition-all text-rose-300 font-bold"
              >
                Try Again
              </button>
            </div>
          )}

          {fetchState === "success" && (
            <div className="space-y-8">
                <section className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-display font-bold flex items-center gap-3">
                      <History className="text-[#e9c176] w-6 h-6" />
                      Recent Battles
                    </h2>
                    <span className="text-xs font-bold uppercase tracking-[0.18em] text-[#767a7b]">
                      {matches.length} recorded
                    </span>
                  </div>

                  {matches.length === 0 ? (
                    <div className="glass-obsidian border border-white/5 rounded-3xl p-12 text-center space-y-6">
                      <div className="w-20 h-20 bg-[#e9c176]/10 rounded-full flex items-center justify-center mx-auto">
                        <Swords className="w-10 h-10 text-[#e9c176]" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-2xl font-display font-bold">No Games Recorded</h3>
                        <p className="text-[#c4c7c7]">Your new dashboard is ready. The first result lands here after your next match.</p>
                      </div>
                      <button
                        onClick={() => setIsNewMatchDropdownOpen(true)}
                        className="px-6 py-3 border border-[#e9c176]/30 rounded-xl hover:bg-[#e9c176]/10 transition-colors text-[#e9c176] font-bold"
                      >
                        Start First Match
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {matches.slice(0, 6).map((match) => {
                        const outcome = getOutcomeDetails(match.outcome);
                        return (
                          <div
                            key={match.id}
                            className="glass-obsidian border border-white/5 rounded-2xl p-4 md:p-5 flex items-center justify-between group hover:bg-white/5 transition-all"
                          >
                            <div className="flex items-center gap-4 md:gap-6">
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold ${match.playerColor === "white" ? "bg-white text-black" : "bg-slate-800 text-white border border-white/10"}`}>
                                {match.playerColor === "white" ? "W" : "B"}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-[#8e9192]">vs</span>
                                  <span className="font-bold text-lg">{match.opponentName}</span>
                                </div>
                                <div className="flex items-center gap-3 mt-1 flex-wrap">
                                  <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${outcome.bg} ${outcome.color}`}>
                                    {outcome.icon}
                                    <span>{outcome.label}</span>
                                  </div>
                                  <span className="text-xs text-[#8e9192] flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatDate(match.endedAt ?? match.startedAt ?? match.createdAt)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 text-xs font-bold text-[#e9c176] transition-all opacity-0 group-hover:opacity-100">
                              <span>Tracked</span>
                              <ArrowRight className="w-3 h-3" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
            </div>
          )}
        </div>
      </main>

      <MatchmakingModal
        isOpen={isMatchmakingModalOpen}
        onClose={() => setIsMatchmakingModalOpen(false)}
        onStart={handleStartMatchmaking}
        onCancel={handleCancelMatchmaking}
        gameState={matchmakingState}
        statusMessage={matchmakingStatus}
        cancelRequested={matchmakingCancelRequested}
      />

      <SocialDrawer
        isOpen={isSocialDrawerOpen}
        onClose={() => setIsSocialDrawerOpen(false)}
        friends={friends}
        incomingRequests={incomingRequests}
        onAcceptRequest={(id) => handleIncomingRequestAction(id, "accept")}
        onRejectRequest={(id) => handleIncomingRequestAction(id, "reject")}
        onSearch={handleSearchFriend}
        onSendRequest={handleSendFriendRequest}
        formatDate={formatDate}
      />
    </div>
  );
}

export default DashboardPage;
