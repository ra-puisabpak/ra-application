import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '../api/d1Api'
import { COMPANY_NAME } from '../config'

const inputCls = 'border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 w-full'

// One-time page: creates the first QA Manager account. The server refuses it once any user exists.
export default function SetupPage() {
  const [f, setF] = useState({ key: '', username: '', display_name: '', password: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (f.password !== f.confirm) { setError('รหัสผ่านสองช่องไม่ตรงกัน'); return }
    setBusy(true); setError(null)
    try {
      await authApi.setup(f.key, { username: f.username, display_name: f.display_name, password: f.password })
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-8">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl shadow p-6 flex flex-col gap-4">
        <div>
          <div className="font-bold text-blue-900 text-lg leading-tight">{COMPANY_NAME}</div>
          <div className="text-sm text-gray-500">ตั้งค่าครั้งแรก · สร้างบัญชีผู้จัดการ QA</div>
        </div>
        {done ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800 text-sm">
            สร้างบัญชีเรียบร้อยแล้ว <Link to="/login" className="underline font-semibold">ไปหน้าเข้าสู่ระบบ</Link>
          </div>
        ) : (
          <>
            {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>}
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
              Setup key (ค่าที่ตั้งไว้ใน GitHub secret ชื่อ SETUP_KEY)
              <input type="password" className={inputCls} value={f.key} onChange={set('key')} required autoComplete="off" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
              ชื่อผู้ใช้ (a-z 0-9 . _ - ยาว 3–32 ตัว)
              <input className={inputCls} value={f.username} onChange={set('username')} required autoCapitalize="none" autoCorrect="off" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
              ชื่อ-นามสกุลที่แสดง
              <input className={inputCls} value={f.display_name} onChange={set('display_name')} required />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
              รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)
              <input type="password" className={inputCls} value={f.password} onChange={set('password')} required minLength={8} autoComplete="new-password" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
              ยืนยันรหัสผ่าน
              <input type="password" className={inputCls} value={f.confirm} onChange={set('confirm')} required minLength={8} autoComplete="new-password" />
            </label>
            <button type="submit" disabled={busy}
              className="bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-semibold transition">
              {busy ? 'กำลังสร้าง...' : 'สร้างบัญชีผู้จัดการ QA'}
            </button>
          </>
        )}
      </form>
    </div>
  )
}
