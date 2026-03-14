import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Settings from './pages/Settings.jsx'
import Login from './pages/Login.jsx'
import LogsPage from './pages/LogsPage.jsx'
import ConsolePage from './pages/ConsolePage.jsx'
import ImagesPage from './pages/ImagesPage.jsx'
import VolumesPage from './pages/VolumesPage.jsx'
import NetworksPage from './pages/NetworksPage.jsx'
import EventsPage from './pages/EventsPage.jsx'
import MarketplacePage from './pages/MarketplacePage.jsx'

function ProtectedRoute({ children }) {
  const { authenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400 text-sm">Loading...</div>
      </div>
    )
  }

  if (!authenticated) {
    return <Navigate to="/login" replace />
  }

  return children
}

function AppRoutes() {
  return (
    <div className="dark bg-slate-950 min-h-screen text-slate-100">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/images" element={<ProtectedRoute><ImagesPage /></ProtectedRoute>} />
        <Route path="/volumes" element={<ProtectedRoute><VolumesPage /></ProtectedRoute>} />
        <Route path="/networks" element={<ProtectedRoute><NetworksPage /></ProtectedRoute>} />
        <Route path="/events" element={<ProtectedRoute><EventsPage /></ProtectedRoute>} />
        <Route path="/marketplace" element={<ProtectedRoute><MarketplacePage /></ProtectedRoute>} />
        <Route path="/logs/:containerId" element={<ProtectedRoute><LogsPage /></ProtectedRoute>} />
        <Route path="/console/:containerId" element={<ProtectedRoute><ConsolePage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
