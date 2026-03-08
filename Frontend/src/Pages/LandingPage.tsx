import { useNavigate } from "react-router";
import { authClient } from "../lib/auth-client";

const pillars = [
  {
    title: "Fast Matchmaking",
    description: "Jump into a live board in seconds with smooth move sync."
  },
  {
    title: "Learn While Playing",
    description: "Play blitz or rapid and sharpen your patterns every game."
  },
  {
    title: "Built for Focus",
    description: "A clean board-first interface designed for long sessions."
  }
];

function LandingPage() {
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();

  const isAuthenticated = Boolean(session?.user);
  const primaryCtaLabel = isAuthenticated ? "Enter Arena" : "Sign In to Play";
  const secondaryCtaLabel = isAuthenticated ? "Play Now" : "Create Account";

  const handleSignOut = async () => {
    await authClient.signOut();
  };

  return (
    <main className="landing-page relative min-h-dvh overflow-hidden text-[#f6f2e8]">
      <div className="landing-page__mesh" aria-hidden />
      <div className="landing-page__grain" aria-hidden />

      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-4 pt-5 sm:px-6 lg:px-10">
        <button
          onClick={() => navigate("/")}
          className="group inline-flex items-center gap-3 rounded-full border border-[#f6f2e8]/20 bg-[#1f1d1a]/70 px-4 py-2 backdrop-blur-sm transition hover:border-[#d2a572]/70"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#d2a572] text-lg text-[#1b1814] shadow-[0_6px_22px_rgba(210,165,114,0.5)]">
            ♞
          </span>
          <span className="text-left">
            <span className="block font-display text-sm uppercase tracking-[0.3em] text-[#d7b084]">Chess</span>
            <span className="block text-xs text-[#efe2cf]/80">Play like you mean it</span>
          </span>
        </button>

        {isAuthenticated ? (
          <button
            onClick={handleSignOut}
            className="rounded-full border border-[#f6f2e8]/25 bg-[#27231e]/80 px-4 py-2 text-sm font-semibold text-[#fdf9f2] transition hover:-translate-y-0.5 hover:bg-[#322c25]"
          >
            Sign out
          </button>
        ) : (
          <button
            onClick={() => navigate("/auth")}
            className="rounded-full border border-[#f6f2e8]/25 bg-[#27231e]/80 px-4 py-2 text-sm font-semibold text-[#fdf9f2] transition hover:-translate-y-0.5 hover:bg-[#322c25]"
          >
            Sign in
          </button>
        )}
      </header>

      <section className="relative z-10 mx-auto grid w-full max-w-7xl gap-8 px-4 pb-14 pt-8 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:px-10 lg:pb-20 lg:pt-12">
        <div className="flex flex-col justify-center">
          <p className="mb-4 inline-flex w-fit items-center rounded-full border border-[#d2a572]/50 bg-[#d2a572]/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#f1d0a8]">
            Real-time Multiplayer Chess
          </p>

          <h1 className="font-display text-[clamp(2.2rem,5vw,4.8rem)] leading-[0.98] text-[#fff8eb]">
            Every Move
            <span className="block text-[#d2a572]">Should Feel Sharp.</span>
          </h1>

          <p className="mt-5 max-w-2xl text-base text-[#eee3d3]/85 sm:text-lg">
            A modern chess space for fast games, better focus, and cleaner board play.
            No clutter, no distractions, just sharp tactics and smooth matches.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              onClick={() => navigate(isAuthenticated ? "/game" : "/auth")}
              className="inline-flex items-center justify-center gap-3 rounded-xl bg-[#d2a572] px-7 py-4 text-base font-extrabold uppercase tracking-[0.08em] text-[#1a1612] shadow-[0_14px_36px_rgba(210,165,114,0.45)] transition hover:-translate-y-0.5 hover:bg-[#e2b67f]"
            >
              <span className="text-xl">♟</span>
              {primaryCtaLabel}
            </button>
            <button
              onClick={() => navigate(isAuthenticated ? "/game" : "/auth")}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#f6f2e8]/20 bg-[#221f1a]/80 px-7 py-4 text-sm font-bold uppercase tracking-[0.1em] text-[#f7eddc] transition hover:-translate-y-0.5 hover:border-[#f6f2e8]/45"
            >
              {secondaryCtaLabel}
            </button>
          </div>

        </div>

        <div className="relative flex items-center justify-center">
          <div className="landing-orb absolute -left-6 -top-8 h-20 w-20 rounded-full bg-[#d2a572]/35 blur-2xl sm:h-28 sm:w-28" />
          <div
            className="landing-orb absolute -bottom-6 -right-4 h-24 w-24 rounded-full bg-[#b0d089]/35 blur-2xl sm:h-32 sm:w-32"
            style={{ animationDelay: "0.7s" }}
          />

          <article className="relative w-full max-w-[620px] rounded-[1.6rem] border border-[#f6f2e8]/15 bg-[#1c1915]/75 p-6 shadow-[0_28px_60px_rgba(0,0,0,0.5)] backdrop-blur-sm sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#f3ddbc]/80">What You Get</p>
            <h2 className="mt-3 font-display text-3xl text-[#fff2dc] sm:text-4xl">
              Built For Real Matches
            </h2>
            <p className="mt-4 text-sm text-[#ead8bf]/82 sm:text-base">
              Clean board focus, live turn sync, and a fast flow from sign-in to game.
              Everything is tuned for consistent online play instead of flashy clutter.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-[#f4e4cd] sm:text-base">
              <li className="rounded-xl border border-[#f6f2e8]/10 bg-[#26221d]/70 px-4 py-3">Live multiplayer game room</li>
              <li className="rounded-xl border border-[#f6f2e8]/10 bg-[#26221d]/70 px-4 py-3">Responsive board experience</li>
              <li className="rounded-xl border border-[#f6f2e8]/10 bg-[#26221d]/70 px-4 py-3">Smooth move and promotion flow</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6 lg:px-10">
        <div className="grid gap-4 md:grid-cols-3">
          {pillars.map((pillar, index) => (
            <article
              key={pillar.title}
              className="rounded-2xl border border-[#f6f2e8]/12 bg-[#1b1713]/75 p-5 backdrop-blur-sm transition hover:-translate-y-1 hover:border-[#d2a572]/55"
              style={{ animationDelay: `${index * 120}ms` }}
            >
              <h2 className="font-display text-xl text-[#ffe3bf]">{pillar.title}</h2>
              <p className="mt-2 text-sm text-[#ead8bf]/82">{pillar.description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export default LandingPage;
