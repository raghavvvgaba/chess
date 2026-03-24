import { useEffect } from "react";
import { useNavigate } from "react-router";
import { authClient } from "../lib/auth-client";
import { Linkedin, Github, Twitter } from "lucide-react";

function LandingPage() {
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();

  const isAuthenticated = Boolean(session?.user);

  // Load Google Fonts and Material Symbols
  useEffect(() => {
    // Load Noto Serif
    const notoLink = document.createElement("link");
    notoLink.href = "https://fonts.googleapis.com/css2?family=Noto+Serif:wght@400;700;800&family=Manrope:wght@300;400;500;600;700&display=swap";
    notoLink.rel = "stylesheet";
    document.head.appendChild(notoLink);

    // Load Material Symbols
    const materialLink = document.createElement("link");
    materialLink.href = "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap";
    materialLink.rel = "stylesheet";
    document.head.appendChild(materialLink);
  }, []);

  const features = [
    {
      icon: "people",
      title: "Quick Matchmaking",
      description: "Join the public queue and find an online opponent."
    },
    {
      icon: "smart_toy",
      title: "Play Against AI",
      description: "Practice against the computer with selectable difficulty."
    },
    {
      icon: "lock",
      title: "Private Rooms",
      description: "Create a room code and invite someone to join."
    }
  ];

  const handleSignOut = async () => {
    await authClient.signOut();
  };

  return (
    <div className="min-h-screen bg-[#131314] text-[#e5e2e3] font-body selection:bg-[#e9c176]/30 selection:text-[#e9c176]">
      {/* Fixed Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-obsidian border-b border-[#444748]/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/")}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                <span className="font-headline font-bold text-xl text-[#e9c176]">Chess</span>
              </button>
            </div>
            <div className="hidden md:flex items-center gap-6">
              {isAuthenticated && (
                <button
                  onClick={() => navigate("/")}
                  className="text-sm font-label text-[#e5e2e3]/80 hover:text-[#e5e2e3] transition-colors"
                >
                  Dashboard
                </button>
              )}
            </div>
            <div className="flex items-center gap-4">
              {isAuthenticated ? (
                <>
                  <button
                    onClick={() => navigate("/")}
                    className="px-4 py-2 rounded-full border border-[#e5e2e3]/20 text-sm font-label hover:bg-[#353436] transition-colors flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm">dashboard</span>
                    <span className="hidden sm:inline">Dashboard</span>
                  </button>
                  <button
                    onClick={handleSignOut}
                    className="px-4 py-2 rounded-full border border-[#e5e2e3]/20 text-sm font-label hover:bg-[#353436] transition-colors"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => navigate("/auth")}
                    className="px-5 py-2 rounded-full bg-gradient-gold text-[#00184a] text-sm font-label font-semibold hover:opacity-90 transition-opacity"
                  >
                    Join Now
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-gold opacity-5" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#e9c176]/10 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-[#9f7e3a]/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }} />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#201f20] border border-[#e9c176]/30">
                <span className="material-symbols-outlined text-[#e9c176] text-sm">auto_awesome</span>
                <span className="text-sm font-label text-[#e9c176]">The Pinnacle of Strategy</span>
              </div>

              <h1 className="font-headline text-5xl sm:text-6xl lg:text-7xl font-bold leading-tight">
                The Art of Strategic <span className="text-[#e9c176]">Silence.</span>
              </h1>

              <p className="text-xl text-[#c4c7c7] font-body max-w-xl">
                Where precision meets intellect in a realm of refined gameplay.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => navigate(isAuthenticated ? "/game" : "/auth")}
                  className="px-8 py-4 rounded-full bg-gradient-gold text-[#00184a] font-label font-semibold text-lg btn-glow-hover hover:-translate-y-0.5 transition-all"
                >
                  Start Playing
                </button>
              </div>
            </div>

            {/* Floating Image Card */}
            <div className="relative flex justify-center">
              <div className="absolute -inset-4 bg-gradient-gold opacity-20 blur-2xl rounded-2xl animate-glow" />
              <div className="relative w-full max-w-md glass-obsidian rounded-2xl border border-[#e5e2e3]/10 p-6 animate-float">
                <div className="aspect-video rounded-xl bg-[#1c1b1c] overflow-hidden">
                  <img
                    src="https://commons.wikimedia.org/wiki/Special:FilePath/Chess_board_(top_view).jpg"
                    alt="Chess board"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="relative py-20 tonal-shift">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="font-headline text-4xl sm:text-5xl font-bold mb-4">
              Refined <span className="text-[#e9c176]">Performance</span>
            </h2>
            <p className="text-lg text-[#c4c7c7] max-w-2xl mx-auto">
              Experience chess as it was meant to be played—with dignity, precision, and unwavering focus.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div
                key={feature.title}
                className="glass-obsidian rounded-2xl border border-[#e5e2e3]/10 p-8 hover:border-[#e9c176]/30 transition-all hover:-translate-y-1"
                style={{ animationDelay: `${index * 150}ms` }}
              >
                <div className="w-14 h-14 rounded-xl bg-[#251800] flex items-center justify-center mb-6">
                  <span className="material-symbols-outlined text-[#e9c176] text-3xl">{feature.icon}</span>
                </div>
                <h3 className="font-headline text-2xl font-bold mb-3 text-[#e5e2e3]">{feature.title}</h3>
                <p className="text-[#c4c7c7] leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-gold opacity-5" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#e9c176]/10 rounded-full blur-3xl" />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-headline text-4xl sm:text-5xl lg:text-6xl font-bold mb-6">
            Your legacy <span className="text-[#e9c176]">awaits.</span>
          </h2>
          <p className="text-xl text-[#c4c7c7] mb-10 max-w-2xl mx-auto">
            Join the ranks of strategic minds who refuse to settle for mediocrity. Every move, every game, every triumph—recorded for eternity.
          </p>
          <button
            onClick={() => navigate(isAuthenticated ? "/game" : "/auth")}
            className="px-10 py-5 rounded-full bg-gradient-gold text-[#00184a] font-label font-bold text-xl btn-glow-hover hover:-translate-y-1 transition-all"
          >
            Create Your Account
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative py-12 border-t border-[#444748]/30 glass-obsidian">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <span className="font-headline font-bold text-lg text-[#e9c176]">Chess</span>
              </div>
              <p className="text-[#c4c7c7] max-w-sm">
                Where precision meets intellect. A refined chess experience for the modern classicist.
              </p>
            </div>
            <div>
              <h4 className="font-label font-semibold mb-4 text-[#e5e2e3]">Legal</h4>
              <ul className="space-y-2 text-[#c4c7c7]">
                <li><a href="#" className="hover:text-[#e9c176] transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-[#e9c176] transition-colors">Terms of Service</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-label font-semibold mb-4 text-[#e5e2e3]">Support</h4>
              <ul className="space-y-2 text-[#c4c7c7]">
                <li><a href="#" className="hover:text-[#e9c176] transition-colors">Contact Us</a></li>
                <li><a href="#" className="hover:text-[#e9c176] transition-colors">Support</a></li>
                <li><a href="#" className="hover:text-[#e9c176] transition-colors">Careers</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-[#444748]/30 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-6">
              <a href="https://www.linkedin.com/in/raghavvvgaba/" target="_blank" rel="noopener noreferrer" className="text-[#c4c7c7] hover:text-[#e9c176] transition-colors">
                <Linkedin className="w-5 h-5" />
              </a>
              <a href="https://github.com/raghavvvgaba" target="_blank" rel="noopener noreferrer" className="text-[#c4c7c7] hover:text-[#e9c176] transition-colors">
                <Github className="w-5 h-5" />
              </a>
              <a href="https://x.com/raghavvvgaba" target="_blank" rel="noopener noreferrer" className="text-[#c4c7c7] hover:text-[#e9c176] transition-colors">
                <Twitter className="w-5 h-5" />
              </a>
            </div>
            <p className="text-sm text-[#8e9192]">
              © 2026 Chess. All rights reserved.
            </p>
          </div>
          <div className="flex justify-end mt-2">
            <p className="text-sm text-[#8e9192]">
              Made by Raghav Gaba
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
