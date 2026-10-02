import { useEffect, useState } from 'react'
import { UserPlus } from 'lucide-react'
import Layout from '../components/Layout'
import { userApi } from '../api/d1Api'
import { ROLE_TH, useAuth } from '../auth'

const inputCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-full bg-white'
const ROLES = Object.keys(ROLE_TH)
const EMPTY = { username: '', display_name: '', role: 'QC', password: '' }

export default function UsersPage() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState([])
  const [f, setF] = useState(EMPTY)
  const [error, setError] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  const load = () => userApi.list().then(setUsers).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

  const run = async (fn, okMsg) => {
    setBusy(true); setError(null); setMsg(null)
    try { await fn(); setMsg(okMsg); await load() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const create = (e) => {
    e.preventDefault()
    run(async () => { await userApi.create(f); setF(EMPTY) }, 'เพิ่มผู้ใช้เรียบร้อยแล้ว')
  }
  const resetPassword = (u) => {
    const pw = window.prompt(`รหัสผ่านใหม่ของ ${u.username} (อย่างน้อย 8 ตัวอักษร)`)
    if (pw) run(() => userApi.update(u.username, { password: pw }), `ตั้งรหัสผ่านใหม่ให้ ${u.username} แล้ว`)
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto flex flex-col gap-4">
        {msg && <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-700 text-sm">{msg}</div>}
        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>}

        <form onSubmit={create} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2 font-semibold text-gray-800 flex items-center gap-2"><UserPlus className="w-4 h-4" />เพิ่มผู้ใช้</div>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">ชื่อผู้ใช้
            <input className={inputCls} value={f.username} onChange={set('username')} required autoCapitalize="none" autoCorrect="off" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">ชื่อ-นามสกุลที่แสดง
            <input className={inputCls} value={f.display_name} onChange={set('display_name')} required />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">บทบาท
            <select className={inputCls} value={f.role} onChange={set('role')}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_TH[r]}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">รหัสผ่านเริ่มต้น (อย่างน้อย 8 ตัวอักษร)
            <input type="text" className={inputCls} value={f.password} onChange={set('password')} required minLength={8} autoComplete="off" />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={busy} className="bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition">เพิ่มผู้ใช้</button>
          </div>
        </form>

        <div className="flex flex-col gap-3">
          {users.map((u) => (
            <div key={u.username} className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3 ${u.active ? '' : 'opacity-60'}`}>
              <div>
                <div className="font-semibold text-gray-800">{u.display_name} {!u.active && <span className="text-xs text-red-600">(ปิดใช้งาน)</span>}</div>
                <div className="text-xs text-gray-500">{u.username}</div>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <select className={inputCls + ' !w-auto'} value={u.role} disabled={busy}
                  onChange={(e) => run(() => userApi.update(u.username, { role: e.target.value }), `เปลี่ยนบทบาทของ ${u.username} แล้ว`)}>
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_TH[r]}</option>)}
                </select>
                <button onClick={() => resetPassword(u)} disabled={busy} className="border border-gray-300 px-3 py-2 rounded-lg text-xs font-medium text-gray-700 bg-white">ตั้งรหัสผ่านใหม่</button>
                {u.username !== me?.username && (
                  <button disabled={busy}
                    onClick={() => run(() => userApi.update(u.username, { active: !u.active }), u.active ? `ปิดบัญชี ${u.username} แล้ว` : `เปิดบัญชี ${u.username} แล้ว`)}
                    className="border border-gray-300 px-3 py-2 rounded-lg text-xs font-medium text-gray-700 bg-white">
                    {u.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  )
}
