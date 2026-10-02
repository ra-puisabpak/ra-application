import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LogOut, Users, KeyRound } from 'lucide-react'
import Layout from '../components/Layout'
import { useAuth, ROLE_TH } from '../auth'
import { authApi } from '../api/d1Api'

const inputCls = 'border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 w-full'

export default function AccountPage() {
  const { user, logout } = useAuth()
  const [f, setF] = useState({ current: '', next: '', confirm: '' })
  const [msg, setMsg] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setMsg(null); setError(null)
    if (f.next !== f.confirm) { setError('รหัสผ่านใหม่สองช่องไม่ตรงกัน'); return }
    setBusy(true)
    try {
      await authApi.changePassword(f.current, f.next)
      setMsg('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว')
      setF({ current: '', next: '', confirm: '' })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Layout>
      <div className="max-w-md mx-auto flex flex-col gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="font-semibold text-gray-800">{user?.display_name}</div>
          <div className="text-sm text-gray-500">{user?.username} · {ROLE_TH[user?.role] || user?.role}</div>
          <div className="flex gap-2 mt-4">
            {user?.role === 'QA_MANAGER' && (
              <Link to="/users" className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-medium transition">
                <Users className="w-4 h-4" />จัดการผู้ใช้
              </Link>
            )}
            <button onClick={logout} className="flex-1 flex items-center justify-center gap-1.5 border border-gray-300 text-gray-700 py-2.5 rounded-xl text-sm font-medium bg-white">
              <LogOut className="w-4 h-4" />ออกจากระบบ
            </button>
          </div>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col gap-3">
          <div className="font-semibold text-gray-800 flex items-center gap-2"><KeyRound className="w-4 h-4" />เปลี่ยนรหัสผ่าน</div>
          {msg && <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-700 text-sm">{msg}</div>}
          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>}
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">รหัสผ่านปัจจุบัน
            <input type="password" className={inputCls} value={f.current} onChange={set('current')} required autoComplete="current-password" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)
            <input type="password" className={inputCls} value={f.next} onChange={set('next')} required minLength={8} autoComplete="new-password" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">ยืนยันรหัสผ่านใหม่
            <input type="password" className={inputCls} value={f.confirm} onChange={set('confirm')} required minLength={8} autoComplete="new-password" />
          </label>
          <button type="submit" disabled={busy} className="bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition">
            {busy ? 'กำลังบันทึก...' : 'เปลี่ยนรหัสผ่าน'}
          </button>
        </form>
      </div>
    </Layout>
  )
}
