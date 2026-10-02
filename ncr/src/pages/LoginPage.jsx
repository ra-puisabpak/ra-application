import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import { useAuth } from '../auth'
import { COMPANY_NAME } from '../config'

const inputCls = 'border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 w-full'

export default function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const dest = location.state?.from || '/dashboard'

  if (user) return <Navigate to={dest} replace />

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      await login(username.trim(), password)
      navigate(dest, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl shadow p-6 flex flex-col gap-4">
        <div>
          <div className="font-bold text-blue-900 text-lg leading-tight">{COMPANY_NAME}</div>
          <div className="text-sm text-gray-500">ระบบ NCR / CAPA · เข้าสู่ระบบ</div>
        </div>
        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>}
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          ชื่อผู้ใช้
          <input className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)}
            autoComplete="username" autoCapitalize="none" autoCorrect="off" required />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          รหัสผ่าน
          <input type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password" required />
        </label>
        <button type="submit" disabled={busy}
          className="flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-semibold transition">
          <LogIn className="w-4 h-4" />{busy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </button>
        <p className="text-xs text-gray-400 text-center">ลืมรหัสผ่าน กรุณาติดต่อผู้จัดการ QA</p>
      </form>
    </div>
  )
}
