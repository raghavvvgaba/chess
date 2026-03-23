import { createRoot } from 'react-dom/client'
import './index.css'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import LandingPage from './Pages/LandingPage.tsx'
import Game from './Pages/Game.tsx'
import AuthPage from './Pages/AuthPage.tsx'
import RequireAuth from './components/RequireAuth.tsx'
import PlayVsBot from './Pages/PlayVsBot.tsx'
import DashboardPage from './Pages/DashboardPage.tsx'
import { authClient } from './lib/auth-client.ts'
import { SocketProvider } from './context/SocketContext.tsx'

function RootPage() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending) {
    return (
      <main className="min-h-screen bg-[#262522] text-white flex items-center justify-center">
        Loading...
      </main>
    )
  }

  if (session?.user?.id) {
    return <DashboardPage />
  }

  return <LandingPage />
}

// Replace the root render with router-based rendering
createRoot(document.getElementById('root')!).render(
  // <StrictMode>
    <SocketProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/dashboard" element={<Navigate to="/" replace />} />
          <Route path="/game" element={<RequireAuth><Game /></RequireAuth>} />
          <Route path="/bot" element={<RequireAuth><PlayVsBot /></RequireAuth>} />
        </Routes>
      </BrowserRouter>
    </SocketProvider>
  // </StrictMode>,
)
