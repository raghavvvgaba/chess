import { useState } from "react";
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
  Search,
  User,
  Settings,
  Shield
} from "lucide-react";

type AppSidebarProps = {
  chessUserId?: string | null;
  onCopyChessId?: () => void;
  copyState?: "idle" | "copied" | "error";
};

function AppSidebar({ chessUserId, onCopyChessId, copyState = "idle" }: AppSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: session } = authClient.useSession();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
    { path: "/game", icon: <Swords className="w-5 h-5" />, label: "Play Online" },
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
        className="fixed top-6 left-6 z-[70] md:hidden rounded-2xl bg-[#201f20] border border-[#e9c176]/30 p-4 shadow-2xl hover:border-[#e9c176]/60 transition-all active:scale-95"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
      >
        {isMobileMenuOpen ? <X className="w-6 h-6 text-[#e9c176]" /> : <Menu className="w-6 h-6 text-[#e9c176]" />}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-full z-[65] bg-[#0e0e0f] border-r border-white/5 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 md:sticky md:top-0 h-screen`}
      >
        <div className="flex flex-col h-full w-[280px] md:w-[280px]">
          {/* Logo Section */}
          <div className="p-8 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-gold rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(233,193,118,0.2)]">
                <Shield className="w-6 h-6 text-[#00184a] fill-current" />
              </div>
              <div>
                <h2 className="text-xl font-display font-black tracking-tighter text-white">CHESS</h2>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="px-6 py-4">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8e9192] group-focus-within:text-[#e9c176] transition-colors" />
              <input
                type="text"
                placeholder="Find a player..."
                className="w-full bg-white/5 border border-white/5 rounded-2xl py-3 pl-11 pr-4 text-sm text-[#c4c7c7] placeholder:text-[#8e9192]/60 focus:outline-none focus:ring-2 focus:ring-[#e9c176]/20 focus:border-[#e9c176]/40 transition-all"
              />
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto custom-scrollbar">
            <p className="px-4 text-[10px] font-bold text-[#444748] uppercase tracking-[0.2em] mb-4">Main Menu</p>
            {navItems.map((item) => {
              const active = isActive(item.path);
              return (
                <button
                  key={item.path}
                  onClick={() => {
                    navigate(item.path);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-4 rounded-2xl px-4 py-3.5 transition-all relative group ${
                    active
                      ? "bg-[#e9c176]/10 text-[#e9c176] font-bold"
                      : "text-[#8e9192] hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#e9c176] rounded-r-full" />}
                  <div className={`${active ? "text-[#e9c176]" : "group-hover:text-white transition-colors"}`}>
                    {item.icon}
                  </div>
                  <span className="text-sm font-medium tracking-wide">
                    {item.label}
                  </span>
                </button>
              );
            })}

            <div className="pt-8 opacity-50">
               <p className="px-4 text-[10px] font-bold text-[#444748] uppercase tracking-[0.2em] mb-4">Account</p>
               <button className="w-full flex items-center gap-4 rounded-2xl px-4 py-3.5 text-[#8e9192] hover:bg-white/5 hover:text-white transition-all">
                 <Settings className="w-5 h-5" />
                 <span className="text-sm font-medium tracking-wide">Settings</span>
               </button>
            </div>
          </nav>

          {/* User Footer */}
          <div className="p-4 mt-auto">
            <div className="glass-obsidian border border-white/5 rounded-2xl px-3 py-3 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-gold flex items-center justify-center shadow-lg shadow-[#e9c176]/10">
                  {user?.name ? (
                    <span className="text-[#00184a] font-black text-base">
                      {user.name.charAt(0).toUpperCase()}
                    </span>
                  ) : (
                    <User className="w-5 h-5 text-[#00184a]" />
                  )}
                </div>
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
              </div>
              
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/[0.04] text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all font-semibold text-[10px] uppercase tracking-[0.18em]"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

export default AppSidebar;
