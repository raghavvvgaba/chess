import ChessBoardImg from '../assets/ChessBoard.jpeg'
import { useNavigate } from 'react-router'
import { authClient } from '../lib/auth-client';

function LandingPage() {
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();

  const handleSignOut = async () => {
    await authClient.signOut();
  };

  return (
    <main className="min-h-screen bg-[#262522] flex flex-col items-center justify-center p-4">
      <section className="flex flex-col lg:flex-row items-center justify-center w-full max-w-6xl gap-12">
        {/* Chessboard Image */}
        <div className="bg-[#f0d9b5] rounded-lg shadow-lg p-2 w-full max-w-md aspect-square flex items-center justify-center">
          <img
            src={ChessBoardImg}
            alt="Chess board"
            className="w-full h-full object-cover rounded"
          />
        </div>
        {/* Right Side Content */}
        <div className="flex flex-col items-center lg:items-start text-center lg:text-left gap-8">
          <header>
            <h1 className="text-white text-4xl md:text-5xl font-bold leading-tight mb-2">
              Play Chess Online<br />on the <span className="text-[#b58863]">#1 Site!</span>
            </h1>
            <div className="flex gap-8 justify-center lg:justify-start text-gray-200 text-lg font-medium mt-4">
              <span>
                <span className="text-white font-bold">17,869,153</span> Games Today
              </span>
              <span>
                <span className="text-white font-bold">159,960</span> Playing Now
              </span>
            </div>
          </header>
          <div className="flex flex-col gap-4 w-full max-w-xs">
            <button onClick={() => navigate('/game')} className="flex items-center gap-3 bg-[#b58863] hover:bg-[#a0764b] text-white font-bold text-2xl px-8 py-5 rounded-xl shadow transition-colors">
              <span className="text-3xl">♙</span>
              Play Online
            </button>
            {session?.user ? (
              <button onClick={handleSignOut} className="flex items-center justify-center gap-3 bg-[#393836] hover:bg-[#44423e] text-white font-bold text-xl px-6 py-4 rounded-xl shadow transition-colors">
                Sign out ({session.user.email})
              </button>
            ) : (
              <button onClick={() => navigate('/auth')} className="flex items-center justify-center gap-3 bg-[#393836] hover:bg-[#44423e] text-white font-bold text-2xl px-8 py-5 rounded-xl shadow transition-colors">
                Sign in / Sign up
              </button>
            )}
            <button className="flex items-center gap-3 bg-[#393836] hover:bg-[#44423e] text-white font-bold text-2xl px-8 py-5 rounded-xl shadow transition-colors">
              <span className="text-3xl">🖥️</span>
              Play Computer
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}

export default LandingPage
