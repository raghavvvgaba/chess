import { createRoot } from 'react-dom/client'
import './index.css'
import { BrowserRouter, Routes, Route } from 'react-router'
import LandingPage from './Pages/LandingPage.tsx'
import Game from './Pages/Game.tsx'
import AuthPage from './Pages/AuthPage.tsx'
import RequireAuth from './components/RequireAuth.tsx'

// Replace the root render with router-based rendering
createRoot(document.getElementById('root')!).render(
  // <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/game" element={<RequireAuth><Game /></RequireAuth>} />
      </Routes>
    </BrowserRouter>
  // </StrictMode>,
)
