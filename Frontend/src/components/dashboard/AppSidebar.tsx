import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router";
import { authClient } from "../../lib/auth-client";
import { 
  Copy,
  LayoutDashboard, 
  Swords, 
  Cpu, 
  LogOut, 
  Menu, 
  X, 
  User,
  Shield,
  ChevronLeft,
  ChevronRight
} from "lucide-react";

type AppSidebarProps = {
  chessUserId?: string | null;
  onCopyChessId?: () => void;
  onStartOnlineMatch?: () => void;
  copyState?: "idle" | "copied" | "error";
};

function AppSidebar({ chessUserId, onCopyChessId, onStartOnlineMatch, copyState = "idle" }: AppSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: session } = authClient.useSession();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", JSON.stringify(isCollapsed));
  }, [isCollapsed]);

  const user = session?.user;

  const handleLogout = async () => {
    await authClient.signOut();
    navigate("/");
  };

  const isActive = (path: string): boolean => {
    return location.pathname === path;
  };

  const navItems = [
    { path: "/", icon: <LayoutDashboard className="w-5 h-5" />, label: "Dashboard" },
    { path: "/bot", icon: <Cpu className="w-5 h-5" />, label: "Vs Computer" },
  ];

  return (
    <>
      {/* Mobile Menu Overlay */}
      <div
        className={`fixed inset-0 z-[60] bg-black/80 backdrop-blur-md transition-opacity md:hidden ${
          isMobileMenuOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setIsMobileMenuOpen(false)}
        aria-hidden="true"
      />

      {/* Mobile Toggle Button */}
      <button
        className="fixed top-4 left-4 z-[70] md:hidden rounded-xl bg-[#201f20]/90 backdrop-blur-md border border-[#e9c176]/20 p-3 shadow-xl hover:border-[#e9c176]/40 transition-all active:scale-95"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
      >
        {isMobileMenuOpen ? <X className="w-5 h-5 text-[#e9c176]" /> : <Menu className="w-5 h-5 text-[#e9c176]" />}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-full z-[65] bg-[#0e0e0f] border-r border-white/5 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 md:sticky md:top-0 h-screen ${
          isCollapsed ? "md:w-[88px]" : "md:w-[280px]"
        }`}
      >
        <div className={`flex flex-col h-full transition-all duration-500 ${isCollapsed ? "w-[88px]" : "w-[280px]"}`}>
          {/* Logo & Toggle Section */}
          <div className={`transition-all duration-500 ${isCollapsed ? "p-4" : "p-8 pb-4"}`}>
            <div className={`flex items-center ${isCollapsed ? "flex-col gap-6" : "justify-between"}`}>
              {/* Toggle for Collapsed */}
              {isCollapsed && (
                <button
                  onClick={() => setIsCollapsed(false)}
                  className="hidden md:flex w-10 h-10 rounded-xl bg-white/5 border border-white/10 items-center justify-center text-[#e9c176] hover:bg-white/10 transition-all"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-gold rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(233,193,118,0.2)] shrink-0">
                  <Shield className="w-6 h-6 text-[#00184a] fill-current" />
                </div>
                {!isCollapsed && (
                  <h2 className="text-xl font-display font-black tracking-tighter text-white">CHESS</h2>
                )}
              </div>

              {/* Toggle for Expanded */}
              {!isCollapsed && (
                <button
                  onClick={() => setIsCollapsed(true)}
                  className="hidden md:flex w-8 h-8 rounded-xl bg-white/5 border border-white/5 items-center justify-center text-[#e9c176] hover:bg-white/10 transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Action Section */}
          <div className={`py-4 transition-all duration-500 ${isCollapsed ? "px-4" : "px-6"}`}>
            <button
              type="button"
              onClick={() => {
                if (onStartOnlineMatch) {
                  onStartOnlineMatch();
                } else {
                  navigate("/", { state: { openMatchmaking: true } });
                }
                setIsMobileMenuOpen(false);
              }}
              className={`w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-gold py-3 text-sm font-bold text-[#00184a] shadow-[0_10px_30px_rgba(233,193,118,0.22)] transition-all hover:scale-[1.01] active:scale-[0.99] ${
                isCollapsed ? "px-0 h-12" : "px-4"
              }`}
            >
              <Swords className="w-5 h-5 shrink-0" />
              {!isCollapsed && <span>New Match</span>}
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto custom-scrollbar">
            {!isCollapsed && (
              <p className="px-4 text-[10px] font-bold text-[#444748] uppercase tracking-[0.2em] mb-4">Main Menu</p>
            )}
            {navItems.map((item) => {
              const active = isActive(item.path);
              return (
                <button
                  key={item.path}
                  onClick={() => {
                    navigate(item.path);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center rounded-2xl py-3.5 transition-all relative group ${
                    isCollapsed ? "justify-center px-0" : "gap-4 px-4"
                  } ${
                    active
                      ? "bg-[#e9c176]/10 text-[#e9c176] font-bold"
                      : "text-[#8e9192] hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {active && (
                    <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 bg-[#e9c176] rounded-r-full transition-all ${
                      isCollapsed ? "h-8" : "h-6"
                    }`} />
                  )}
                  <div className={`${active ? "text-[#e9c176]" : "group-hover:text-white transition-colors"} shrink-0`}>
                    {item.icon}
                  </div>
                  {!isCollapsed && (
                    <span className="text-sm font-medium tracking-wide whitespace-nowrap">
                      {item.label}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* User Footer */}
          <div className={`mt-auto transition-all duration-500 ${isCollapsed ? "p-2" : "p-4"}`}>
            <div className={`glass-obsidian border border-white/5 rounded-2xl py-3 space-y-3 transition-all duration-500 ${
              isCollapsed ? "px-2" : "px-3"
            }`}>
              <div className={`flex items-center ${isCollapsed ? "flex-col gap-4" : "gap-3"}`}>
                <div className="w-10 h-10 rounded-xl bg-gradient-gold flex items-center justify-center shadow-lg shadow-[#e9c176]/10 shrink-0">
                  {user?.name ? (
                    <span className="text-[#00184a] font-black text-base">
                      {user.name.charAt(0).toUpperCase()}
                    </span>
                  ) : (
                    <User className="w-5 h-5 text-[#00184a]" />
                  )}
                </div>
                {!isCollapsed && (
                  <div className="flex-1 min-w-0">
                    {chessUserId && (
                      <div className="mb-0.5 flex items-center gap-1.5">
                        <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#8e9192]">
                          {chessUserId}
                        </span>
                        <button
                          type="button"
                          onClick={onCopyChessId}
                          className="inline-flex h-4.5 w-4.5 items-center justify-center rounded text-[#8e9192] transition-colors hover:bg-white/5 hover:text-[#e9c176]"
                          aria-label={copyState === "copied" ? "Chess ID copied" : "Copy Chess ID"}
                          title={copyState === "copied" ? "Copied" : "Copy Chess ID"}
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    <p className="text-[13px] font-semibold text-white truncate">
                      {user?.name || "Player"}
                    </p>
                  </div>
                )}
              </div>
              
              <button
                onClick={handleLogout}
                className={`flex items-center justify-center rounded-xl bg-white/[0.04] text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all font-semibold text-[10px] uppercase tracking-[0.18em] ${
                  isCollapsed ? "w-10 h-10 p-0" : "w-full py-2.5 gap-2"
                }`}
                title={isCollapsed ? "Sign Out" : undefined}
              >
                <LogOut className="w-3.5 h-3.5" />
                {!isCollapsed && <span>Sign Out</span>}
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}


export default AppSidebar;
