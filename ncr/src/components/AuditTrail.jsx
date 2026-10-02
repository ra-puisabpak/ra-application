import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { auditApi } from '../api/d1Api'

const ACTION_TH = {
  create: 'สร้าง', update: 'แก้ไข', close: 'ปิด', reopen: 'เปิดใหม่',
  supplier_reply: 'ผู้ส่งมอบตอบกลับ', create_supplier_link: 'สร้างลิงก์ผู้ส่งมอบ',
  revoke_supplier_link: 'ยกเลิกลิงก์ผู้ส่งมอบ',
}
const show = (v) => (v === null || v === undefined || v === '' ? '(ว่าง)' : String(v))

// Change history for one NCR or CAPA. Visible to QA Manager / FSTL only (the server enforces this).
export default function AuditTrail({ entityId, refreshKey }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    auditApi.forEntity(entityId).then(setRows).catch((e) => setError(e.message))
  }, [entityId, refreshKey])

  return (
    <div className="mt-8">
      <h2 className="text-base font-bold text-gray-700 flex items-center gap-2 mb-3">
        <History className="w-5 h-5 text-blue-700" />ประวัติการแก้ไข
      </h2>
      <div className="bg-white rounded-xl shadow divide-y divide-gray-100">
        {error && <div className="p-4 text-sm text-red-600">{error}</div>}
        {rows && rows.length === 0 && <div className="p-4 text-sm text-gray-400">ยังไม่มีประวัติ</div>}
        {(rows || []).map((r) => {
          let changes = {}
          try { changes = JSON.parse(r.changes || '{}') || {} } catch { /* ignore */ }
          const fields = Object.entries(changes).filter(([, v]) => v && typeof v === 'object' && 'to' in v)
          return (
            <div key={r.id} className="p-3 text-sm">
              <div className="flex flex-wrap gap-x-2 text-gray-800">
                <span className="font-semibold">{ACTION_TH[r.action] || r.action}</span>
                <span className="text-gray-500">โดย {r.actor}{r.actor_type === 'supplier' ? ' (ผู้ส่งมอบ)' : ''}</span>
                <span className="text-gray-400 text-xs self-center">
                  {new Date(r.ts).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
              {fields.length > 0 && (
                <ul className="mt-1 text-xs text-gray-600 space-y-0.5">
                  {fields.map(([k, v]) => (
                    <li key={k} className="break-words"><span className="font-mono">{k}</span>: {show(v.from)} → {show(v.to)}</li>
                  ))}
                </ul>
              )}
              {changes.reason && <div className="mt-1 text-xs text-gray-600">เหตุผล: {changes.reason}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
