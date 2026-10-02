import { useState, useEffect } from 'react'
import { supplierApi } from '../api/d1Api'
import { SOURCE_TH as SOURCE_LABELS } from '../data/masterData'
import { COMPANY_NAME, COMPANY_NAME_EN } from '../config'
import { Save, CheckCircle2, AlertTriangle, ClipboardList } from 'lucide-react'

const SEV_CLS = {
  Critical: 'bg-red-100 text-red-700 border-red-200',
  Major: 'bg-orange-100 text-orange-700 border-orange-200',
  Minor: 'bg-green-100 text-green-700 border-green-200',
}

const inputCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-full'
const textareaCls = inputCls + ' resize-none'

function ReadField({ label, value, full }) {
  return (
    <div className={`flex flex-col gap-0.5 ${full ? 'sm:col-span-2' : ''}`}>
      <span className="text-[11px] font-medium text-gray-500">{label}</span>
      <span className="text-sm text-gray-800 break-words whitespace-pre-wrap">{value || '-'}</span>
    </div>
  )
}

export default function SupplierReplyPage() {
  // The token after "#" is the supplier's only credential; it opens this one NCR.
  const token = window.location.hash.replace(/^#/, '')
  const [ncr, setNcr] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [form, setForm] = useState({
    root_cause: '',
    corrective_action: '',
    preventive_action: '',
    target_date: '',
    reply_by: '',
  })

  useEffect(() => {
    setLoading(true)
    supplierApi.get(token)
      .then((d) => {
        if (d.type !== 'ncr') throw new Error('ลิงก์นี้ไม่ใช่ลิงก์ NCR')
        setNcr(d)
        setForm({
          root_cause: d.root_cause || '',
          corrective_action: d.corrective_action || '',
          preventive_action: d.preventive_action || '',
          target_date: d.target_date ? d.target_date.slice(0, 10) : '',
          reply_by: d.supplier_reply_by || '',
        })
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async () => {
    if (!form.root_cause.trim() || !form.corrective_action.trim() || !form.reply_by.trim()) {
      setError('กรุณากรอกสาเหตุ การแก้ไข และชื่อผู้ตอบกลับ')
      return
    }
    setSaving(true); setError(null)
    try {
      await supplierApi.reply(token, {
        root_cause: form.root_cause,
        corrective_action: form.corrective_action,
        preventive_action: form.preventive_action,
        target_date: form.target_date,
        replied_by: form.reply_by,
      })
      setDone(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-blue-900 text-white shadow-lg">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="font-bold text-sm sm:text-base leading-tight">{COMPANY_NAME}</div>
          <div className="text-blue-300 text-[11px]">{COMPANY_NAME_EN} · แบบฟอร์มตอบกลับผู้ส่งมอบ (Supplier Reply)</div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-5 pb-28">
        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">กำลังโหลด...</div>
        ) : error && !ncr ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center text-red-700 text-sm">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
            {error}
          </div>
        ) : (
          <>
            {done && (
              <div className="mb-5 bg-green-50 border border-green-200 rounded-xl p-5 text-center">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-600" />
                <div className="font-semibold text-green-800">ส่งคำตอบเรียบร้อยแล้ว ขอบคุณครับ</div>
                <div className="text-sm text-green-600 mt-1">ทีม QA จะตรวจสอบและยืนยันผลต่อไป</div>
              </div>
            )}

            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>
            )}
            {!ncr?.can_reply && (
              <div className="mb-4 bg-gray-100 border border-gray-300 rounded-lg p-3 text-gray-700 text-sm">เอกสารนี้ปิดแล้ว ไม่สามารถแก้ไขคำตอบได้</div>
            )}

            {/* Read-only NC info */}
            <div className="bg-white rounded-xl shadow overflow-hidden mb-5">
              <div className="bg-blue-900 text-white px-4 py-2 text-sm font-semibold flex items-center justify-between">
                <span>รายละเอียดสิ่งที่ไม่เป็นไปตามข้อกำหนด (NC)</span>
                {ncr?.severity && (
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${SEV_CLS[ncr.severity] || 'bg-gray-100 text-gray-600'}`}>
                    {ncr.severity}
                  </span>
                )}
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ReadField label="NC No." value={ncr?.ncr_id} />
                <ReadField label="วันที่พบ" value={(ncr?.found_date || ncr?.issue_date || '').slice(0, 10)} />
                <ReadField label="วัตถุดิบ / สินค้า" value={ncr?.material_name} />
                <ReadField label="แหล่งที่มา" value={SOURCE_LABELS[ncr?.source_type] || ncr?.source_type} />
                <ReadField label="Lot No. สินค้า / วัตถุดิบ" value={ncr?.lot_no || ncr?.product_lot_no} />
                <ReadField label="จำนวนของเสีย" value={ncr?.defect_qty != null ? `${ncr.defect_qty} ${ncr.defect_unit || ''}`.trim() : '-'} />
                <ReadField label="รายละเอียดปัญหา" value={ncr?.nc_description} full />
                <ReadField label="การแก้ไขเบื้องต้น (โดยผู้ผลิต)" value={ncr?.immediate_action} full />
              </div>
            </div>

            {/* Supplier reply */}
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <div className="bg-teal-700 text-white px-4 py-2 text-sm font-semibold flex items-center gap-2">
                <ClipboardList className="w-4 h-4" />
                ส่วนตอบกลับของผู้ส่งมอบ (กรุณากรอก)
              </div>
              <div className="p-4 grid grid-cols-1 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">สาเหตุที่แท้จริง (Root Cause) *</label>
                  <textarea className={textareaCls} rows={3} value={form.root_cause} onChange={set('root_cause')} placeholder="อธิบายสาเหตุของปัญหา..." />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">การแก้ไข (Corrective Action) *</label>
                  <textarea className={textareaCls} rows={3} value={form.corrective_action} onChange={set('corrective_action')} placeholder="มาตรการแก้ไขปัญหาที่เกิดขึ้น..." />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">การป้องกัน (Preventive Action)</label>
                  <textarea className={textareaCls} rows={3} value={form.preventive_action} onChange={set('preventive_action')} placeholder="มาตรการป้องกันไม่ให้เกิดซ้ำ..." />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-600">กำหนดแล้วเสร็จ (Target Date)</label>
                    <input type="date" className={inputCls} value={form.target_date} onChange={set('target_date')} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-600">ผู้ตอบกลับ / ตำแหน่ง *</label>
                    <input type="text" className={inputCls} value={form.reply_by} onChange={set('reply_by')} placeholder="ชื่อผู้ตอบกลับ" />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Sticky submit bar */}
      {!loading && ncr && ncr.can_reply && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 px-4 py-3 z-30 shadow-[0_-2px_12px_rgba(0,0,0,0.08)]">
          <div className="max-w-3xl mx-auto">
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-semibold transition"
            >
              <Save className="w-4 h-4" />
              {saving ? 'กำลังส่ง...' : done ? 'อัปเดตคำตอบอีกครั้ง' : 'ส่งคำตอบกลับ'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
