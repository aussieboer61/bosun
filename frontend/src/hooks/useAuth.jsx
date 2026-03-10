import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { post, get } from '../lib/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState(null)
  const [firstRun, setFirstRun] = useState(false)

  useEffect(() => {
    checkAuth()
  }, [])

  async function checkAuth() {
    setLoading(true)
    try {
      const status = await get('/api/auth/status')
      setFirstRun(status.firstRun)

      // If Authentik sent a user header (relayed by our /api/auth/status)
      if (status.authentikUser) {
        setAuthenticated(true)
        setUsername(status.authentikUser)
        setLoading(false)
        return
      }

      // Check if we have a stored JWT
      const token = localStorage.getItem('bosun_token')
      if (token) {
        try {
          const me = await get('/api/auth/me')
          setAuthenticated(true)
          setUsername(me.username)
        } catch {
          localStorage.removeItem('bosun_token')
          setAuthenticated(false)
        }
      }
    } catch (err) {
      console.error('Auth check failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const login = useCallback(async (usernameInput, password) => {
    const data = await post('/api/auth/login', { username: usernameInput, password })
    localStorage.setItem('bosun_token', data.token)
    setAuthenticated(true)
    setUsername(data.username)
    return data
  }, [])

  const setup = useCallback(async (usernameInput, password) => {
    const data = await post('/api/auth/setup', { username: usernameInput, password })
    localStorage.setItem('bosun_token', data.token)
    setAuthenticated(true)
    setUsername(data.username)
    setFirstRun(false)
    return data
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('bosun_token')
    setAuthenticated(false)
    setUsername(null)
    window.location.href = '/login'
  }, [])

  return (
    <AuthContext.Provider value={{ authenticated, loading, username, firstRun, login, setup, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
