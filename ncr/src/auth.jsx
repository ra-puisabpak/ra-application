import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { authApi, session } from './api/d1Api'

const AuthContext = createContext(null)

export const ROLE_TH = {
  QA_MANAGER: 'ผู้จัดการ QA',
  FSTL: 'หัวหน้าทีมความปลอดภัยอาหาร',
  QC: 'QC',
  SUPERVISOR: 'หัวหน้าแผนก',
  VIEWER: 'ดูอย่างเดียว',
}
export const isQA = (u) => !!u && (u.role === 'QA_MANAGER' || u.role === 'FSTL')
export const canWrite = (u) => !!u && u.role !== 'VIEWER'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => (session.token() ? session.user() : null))

  useEffect(() => {
    const expired = () => setUser(null)
    window.addEventListener('auth:expired', expired)
    // Confirm the stored session is still valid and pick up role changes.
    if (session.token()) {
      authApi.me().then((u) => { session.save(session.token(), u); setUser(u) }).catch(() => {})
    }
    return () => window.removeEventListener('auth:expired', expired)
  }, [])

  const login = useCallback(async (username, password) => {
    const res = await authApi.login(username, password)
    session.save(res.token, res.user)
    setUser(res.user)
  }, [])

  const logout = useCallback(async () => {
    try { await authApi.logout() } catch { /* session may already be gone */ }
    session.clear()
    setUser(null)
  }, [])

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

export function RequireAuth({ children, role }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (role && user.role !== role) return <Navigate to="/dashboard" replace />
  return children
}
