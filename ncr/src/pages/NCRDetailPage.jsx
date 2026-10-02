import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ncrApi, capaApi } from '../api/d1Api'
import {
  PROCESSES, PARAMETERS, SUPPLIERS, MATERIALS, ALLERGENS, SOURCE_OPTIONS, DISPOSITION_OPTIONS, codeOf,
} from '../data/masterData'
import { FORM_CODE_NCR } from '../config'
import { useAuth, isQA, canWrite } from '../auth'
import SupplierLinkBox from '../components/SupplierLinkBox'
import AuditTrail from '../components/AuditTrail'
import { Save, ArrowLeft, Printer, Plus, ClipboardList, Lock, RotateCcw } from 'lucide-react'

const SEVERITY_OPTIONS = ['Critical', 'Major', 'Minor']
const STATUS_TH = {
  Open: 'เปิด', 'In Investigation': 'สอบสวน', 'Pending Verification': 'รอทวนสอบ', Closed: 'ปิดแล้ว', Cancelled: 'ยกเลิก',
}
const VERIFICATION_OPTIONS = ['Pending', 'Effective', 'Not Effective']

const CAPA_STATUS_CLS = {
  Open: 'bg-red-100 text-red-700',
  'Root Cause Analysis': 'bg-orange-100 text-orange-700',
  'Action Planning': 'bg-yellow-100 text-yellow-700',
  Implementation: 'bg-blue-100 text-blue-700',
  Verification: 'bg-purple-100 text-purple-700',
  'Closed Effective': 'bg-green-100 text-green-700',
  'Closed Not Effective': 'bg-red-200 text-red-800',
}

// Editable fields. Anything not listed here (NCR number, issue date, who verified/closed) is set by the server.
const EMPTY_FORM = {
  source_type: 'IN_PROCESS', found_date: '', lot_no: '', product_lot_no: '', process_ref: '',
  material_name: '', supplier_name: '', parameter_name: '', critical_limit: '', actual_result: '',
  visual_check: '', defect_qty: '', defect_unit: '', hold_location: '', severity: 'Major',
  allergen: '', shipped_status: 'NOT_SHIPPED', shipped_qty: '', shipped_customer: '',
  nc_description: '', immediate_action: '', reported_by: '', assignee: '', target_date: '', photo_urls: '',
  root_cause: '', corrective_action: '', preventive_action: '',
  disposition: '', disposition_reason: '', recall_required: '',
  verification_result: 'Pending', verification_note: '', status: 'Open', status_reason: '',
}
const QA_FIELDS = ['severity', 'disposition', 'disposition_reason', 'recall_required',
  'verification_result', 'verification_note', 'status', 'status_reason']

const toForm = (d) => {
  const f = {}
  for (const k of Object.keys(EMPTY_FORM)) f[k] = d[k] === null || d[k] === undefined ? '' : String(d[k])
  f.found_date = f.found_date.slice(0, 10)
  f.target_date = f.target_date.slice(0, 10)
  return f
}

function SectionTitle({ children }) {
  return (
    <div className="bg-blue-900 text-white px-4 py-2 text-sm font-semibold rounded-t-lg mt-6 first:mt-0">
      {children}
    </div>
  )
}

function FieldRow({ label, children, full }) {
  return (
    <div className={`flex flex-col gap-1 ${full ? 'sm:col-span-2' : ''}`}>
      <label className="text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-full disabled:bg-gray-100 disabled:text-gray-500'
const textareaCls = inputCls + ' resize-none'
const selectCls = inputCls + ' bg-white'
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '-')

export default function NCRDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isNew = !id || id === 'new'
  const qa = isQA(user)
  const writer = canWrite(user)

  const [record, setRecord] = useState(null) // as stored on the server
  const [form, setForm] = useState({ ...EMPTY_FORM, reported_by: user?.display_name || '' })
  const [capas, setCapas] = useState([])
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saveMsg, setSaveMsg] = useState(null)
  const [version, setVersion] = useState(0)

  const load = useCallback(async () => {
    const [ncr, capaList] = await Promise.all([ncrApi.get(id), capaApi.listByNcr(id)])
    setRecord(ncr)
    setForm(toForm(ncr))
    setCapas(Array.isArray(capaList) ? capaList : [])
    setVersion((v) => v + 1)
  }, [id])

  useEffect(() => {
    if (isNew) return
    setLoading(true)
    load().catch((e) => setError(e.message)).finally(() => setLoading(false))
  }, [isNew, load])

  const locked = !!record && (record.status === 'Closed' || record.status === 'Cancelled')
  const readOnly = !writer || locked
  const qaOnly = readOnly || (!isNew && !qa) // severity can be proposed by anyone when creating
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const allergens = form.allergen ? form.allergen.split(',').map((s) => s.trim()).filter(Boolean) : []
  const toggleAllergen = (a) => setForm((f) => {
    const cur = f.allergen ? f.allergen.split(',').map((s) => s.trim()).filter(Boolean) : []
    const next = cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]
    return { ...f, allergen: next.join(', ') }
  })

  const handleSave = async () => {
    if (!form.nc_description.trim()) { setError('กรุณาระบุรายละเอียดปัญหา'); return }
    setSaving(true); setError(null); setSaveMsg(null)
    try {
      if (isNew) {
        const payload = { ...form }
        for (const k of QA_FIELDS) if (k !== 'severity') delete payload[k]
        payload.material_code = codeOf(MATERIALS, form.material_name)
        payload.supplier_id = codeOf(SUPPLIERS, form.supplier_name)
        payload.parameter_id = codeOf(PARAMETERS, form.parameter_name)
        const res = await ncrApi.create(payload)
        navigate(`/ncr/${res.ncr_id}`, { replace: true })
        return
      }
      // Send only what changed, so each user touches just the fields their role may edit.
      const before = toForm(record)
      const payload = {}
      for (const k of Object.keys(form)) if (form[k] !== before[k]) payload[k] = form[k]
      if ('material_name' in payload) payload.material_code = codeOf(MATERIALS, form.material_name)
      if ('supplier_name' in payload) payload.supplier_id = codeOf(SUPPLIERS, form.supplier_name)
      if ('parameter_name' in payload) payload.parameter_id = codeOf(PARAMETERS, form.parameter_name)
      if ('recall_required' in payload) payload.recall_required = form.recall_required === '' ? null : form.recall_required === '1'
      if (!Object.keys(payload).length) { setSaveMsg('ไม่มีข้อมูลที่เปลี่ยนแปลง'); return }
      await ncrApi.update(id, payload)
      await load()
      setSaveMsg('บันทึกสำเร็จ')
      setTimeout(() => setSaveMsg(null), 3000)
    } catch (e) {
      setError(e.message)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setSaving(false)
    }
  }

  const reopen = async () => {
    const reason = window.prompt('เหตุผลที่เปิด NCR นี้ใหม่')
    if (!reason || !reason.trim()) return
    setSaving(true); setError(null)
    try {
      await ncrApi.update(id, { status: 'Open', status_reason: reason.trim() })
      await load()
      setSaveMsg('เปิด NCR ใหม่แล้ว')
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const statusOptions = ['Open', 'In Investigation', 'Pending Verification', 'Closed', 'Cancelled']
    .filter((s) => s !== 'Closed' || user?.role === 'QA_MANAGER' || form.status === 'Closed')

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-blue-900 text-white sticky top-0 z-40 shadow-lg">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => navigate('/ncr')} className="p-2 hover:bg-white/20 rounded-lg transition shrink-0" aria-label="กลับ">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm sm:text-base truncate">
              {isNew ? 'สร้าง NCR ใหม่' : `NCR: ${id}`}
            </div>
            <div className="text-blue-300 text-xs hidden sm:block">Non-Conformance Report · {FORM_CODE_NCR}</div>
          </div>
          {!isNew && (
            <button
              onClick={() => navigate(`/ncr/${id}/print`)}
              className="hidden sm:flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-sm transition"
            >
              <Printer className="w-4 h-4" />พิมพ์ A4
            </button>
          )}
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-4 pb-24 sm:pb-6">
        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">กำลังโหลด...</div>
        ) : (
          <>
            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
                <strong>เกิดข้อผิดพลาด:</strong> {error}
              </div>
            )}
            {saveMsg && (
              <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-4 text-green-700 text-sm">
                {saveMsg}
              </div>
            )}

            {locked && (
              <div className="mb-4 bg-gray-100 border border-gray-300 rounded-xl p-3 flex items-center gap-3 text-sm text-gray-700">
                <Lock className="w-5 h-5 shrink-0" />
                <div className="flex-1">
                  NCR นี้{record.status === 'Closed' ? 'ปิดแล้ว' : 'ถูกยกเลิก'} จึงแก้ไขไม่ได้
                  {record.status === 'Closed' && <> · ปิดโดย {record.closed_by} เมื่อ {fmtDate(record.closed_date)}</>}
                </div>
                {user?.role === 'QA_MANAGER' && (
                  <button onClick={reopen} disabled={saving}
                    className="flex items-center gap-1.5 bg-white border border-gray-300 px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0">
                    <RotateCcw className="w-3.5 h-3.5" />เปิดใหม่
                  </button>
                )}
              </div>
            )}

            {!isNew && !locked && writer && (
              <SupplierLinkBox
                label="ลิงก์ตอบกลับสำหรับผู้ส่งมอบ"
                path="/reply"
                create={() => ncrApi.supplierLink(id)}
              />
            )}

            <div className="bg-white rounded-xl shadow overflow-hidden">
              <SectionTitle>ส่วน A — รายละเอียด NC</SectionTitle>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRow label="NC No.">
                  <input type="text" className={inputCls + ' font-mono font-semibold'} disabled
                    value={isNew ? 'ระบบออกเลขให้เมื่อบันทึก' : id} />
                </FieldRow>
                <FieldRow label="วันที่ออก NCR">
                  <input type="text" className={inputCls} disabled value={isNew ? 'วันนี้' : fmtDate(record?.issue_date)} />
                </FieldRow>
                <FieldRow label="แหล่งที่มา (Source Type) *">
                  <select className={selectCls} value={form.source_type} onChange={set('source_type')} disabled={readOnly}>
                    {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </FieldRow>
                <FieldRow label="วันที่พบ (Found Date)">
                  <input type="date" className={inputCls} value={form.found_date} onChange={set('found_date')} disabled={readOnly} />
                </FieldRow>
                <FieldRow label="Lot No. สินค้า">
                  <input type="text" className={inputCls} value={form.product_lot_no} onChange={set('product_lot_no')} disabled={readOnly} />
                </FieldRow>
                <FieldRow label="Lot No. วัตถุดิบ">
                  <input type="text" className={inputCls} value={form.lot_no} onChange={set('lot_no')} disabled={readOnly} />
                </FieldRow>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <FieldRow label="จำนวนที่พบ (Qty)">
                      <input type="number" inputMode="decimal" className={inputCls} value={form.defect_qty} onChange={set('defect_qty')} min={0} disabled={readOnly} />
                    </FieldRow>
                  </div>
                  <div className="w-32">
                    <FieldRow label="หน่วย">
                      <input type="text" className={inputCls} value={form.defect_unit} onChange={set('defect_unit')} placeholder="กก., ขวด" disabled={readOnly} />
                    </FieldRow>
                  </div>
                </div>
                <FieldRow label="พื้นที่กัก (Hold Location)">
                  <input type="text" className={inputCls} value={form.hold_location} onChange={set('hold_location')} disabled={readOnly} />
                </FieldRow>
                <FieldRow label={`ระดับความรุนแรง (Severity)${!isNew && !qa ? ' · QA กำหนด' : ''}`}>
                  <select className={selectCls} value={form.severity} onChange={set('severity')} disabled={qaOnly}>
                    {SEVERITY_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </FieldRow>
                <FieldRow label="กำหนดแล้วเสร็จ (Target Date)">
                  <input type="date" className={inputCls} value={form.target_date} onChange={set('target_date')} disabled={readOnly} />
                </FieldRow>
                <FieldRow label="รายละเอียดปัญหา (NC Description) *" full>
                  <textarea className={textareaCls} rows={3} value={form.nc_description} onChange={set('nc_description')} disabled={readOnly} />
                </FieldRow>
                <FieldRow label="การแก้ไขเบื้องต้น (Immediate Action)" full>
                  <textarea className={textareaCls} rows={2} value={form.immediate_action} onChange={set('immediate_action')} disabled={readOnly} />
                </FieldRow>
                <FieldRow label="สารก่อภูมิแพ้ที่เกี่ยวข้อง" full>
                  <div className="flex flex-wrap gap-2">
                    {ALLERGENS.map((a) => (
                      <button key={a} type="button" disabled={readOnly} onClick={() => toggleAllergen(a)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${allergens.includes(a) ? 'bg-amber-100 border-amber-400 text-amber-800' : 'bg-white border-gray-300 text-gray-600'} disabled:opacity-60`}>
                        {a}
                      </button>
                    ))}
                  </div>
                </FieldRow>
                <FieldRow label="ผู้รายงาน (Reported By)">
                  <input type="text" className={inputCls} value={form.reported_by} onChange={set('reported_by')} disabled={readOnly} />
                </FieldRow>
                <FieldRow label="ผู้รับผิดชอบ (Assignee)">
                  <input type="text" className={inputCls} value={form.assignee} onChange={set('assignee')} disabled={readOnly} />
                </FieldRow>
                <FieldRow label="ลิงก์ภาพถ่าย (ถ้ามี คั่นด้วยเว้นวรรค)" full>
                  <input type="text" className={inputCls} value={form.photo_urls} onChange={set('photo_urls')} placeholder="https://..." disabled={readOnly} />
                </FieldRow>
              </div>

              <SectionTitle>ส่วน A2 — กระบวนการ ผลิตภัณฑ์ และพารามิเตอร์</SectionTitle>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRow label="กระบวนการ (Process)">
                  <select className={selectCls} value={form.process_ref} onChange={set('process_ref')} disabled={readOnly}>
                    <option value="">-- เลือก --</option>
                    {PROCESSES.map((o) => <option key={o.code} value={o.code}>{o.code} - {o.label}</option>)}
                  </select>
                </FieldRow>
                <FieldRow label="วัตถุดิบ / ผลิตภัณฑ์">
                  <input type="text" list="dl-materials" className={inputCls} value={form.material_name} onChange={set('material_name')} disabled={readOnly} />
                  <datalist id="dl-materials">{MATERIALS.map((o) => <option key={o.code} value={o.label} />)}</datalist>
                </FieldRow>
                <FieldRow label="ผู้ส่งมอบ (Supplier)">
                  <input type="text" list="dl-suppliers" className={inputCls} value={form.supplier_name} onChange={set('supplier_name')} disabled={readOnly} />
                  <datalist id="dl-suppliers">{SUPPLIERS.map((o) => <option key={o.code} value={o.label} />)}</datalist>
                </FieldRow>
                <FieldRow label="พารามิเตอร์ / CCP">
                  <input type="text" list="dl-parameters" className={inputCls} value={form.parameter_name} onChange={set('parameter_name')} disabled={readOnly} />
                  <datalist id="dl-parameters">{PARAMETERS.map((o) => <option key={o.code} value={o.label} />)}</datalist>
                </FieldRow>
                <FieldRow label={`ค่ามาตรฐาน / ค่าวิกฤต${form.source_type === 'CCP' ? ' *' : ''}`}>
                  <input type="text" className={inputCls} value={form.critical_limit} onChange={set('critical_limit')} disabled={readOnly} />
                </FieldRow>
                <FieldRow label={`ค่าที่วัดได้จริง${form.source_type === 'CCP' ? ' *' : ''}`}>
                  <input type="text" className={inputCls} value={form.actual_result} onChange={set('actual_result')} disabled={readOnly} />
                </FieldRow>
                <FieldRow label="Visual Check" full>
                  <input type="text" className={inputCls} value={form.visual_check} onChange={set('visual_check')} disabled={readOnly} />
                </FieldRow>
              </div>

              <SectionTitle>ส่วน A3 — การส่งมอบและการเรียกคืน</SectionTitle>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRow label="สินค้าส่งมอบแล้วหรือไม่">
                  <select className={selectCls} value={form.shipped_status} onChange={set('shipped_status')} disabled={readOnly}>
                    <option value="NOT_SHIPPED">ยังไม่ส่งมอบ</option>
                    <option value="SHIPPED">ส่งมอบแล้ว</option>
                  </select>
                </FieldRow>
                {form.shipped_status === 'SHIPPED' && (
                  <>
                    <FieldRow label="จำนวนที่ส่งมอบแล้ว">
                      <input type="number" inputMode="decimal" className={inputCls} value={form.shipped_qty} onChange={set('shipped_qty')} min={0} disabled={readOnly} />
                    </FieldRow>
                    <FieldRow label="ลูกค้าที่ได้รับ">
                      <input type="text" className={inputCls} value={form.shipped_customer} onChange={set('shipped_customer')} disabled={readOnly} />
                    </FieldRow>
                    <FieldRow label="ผลการพิจารณาเรียกคืน · QA กำหนด *">
                      <select className={selectCls} value={form.recall_required} onChange={set('recall_required')} disabled={qaOnly || isNew}>
                        <option value="">-- ยังไม่พิจารณา --</option>
                        <option value="1">ต้องเรียกคืน</option>
                        <option value="0">ไม่ต้องเรียกคืน</option>
                      </select>
                    </FieldRow>
                  </>
                )}
              </div>

              <SectionTitle>ส่วน B — สาเหตุและการแก้ไข</SectionTitle>
              <div className="p-4 grid grid-cols-1 gap-4">
                {record?.supplier_reply_at && (
                  <div className="text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded-lg p-2">
                    ผู้ส่งมอบตอบกลับโดย {record.supplier_reply_by} เมื่อ {fmtDate(record.supplier_reply_at)}
                  </div>
                )}
                <FieldRow label="สาเหตุที่แท้จริง (Root Cause) — บังคับสำหรับ Critical และ Major ก่อนปิด">
                  <textarea className={textareaCls} rows={3} value={form.root_cause} onChange={set('root_cause')} disabled={readOnly} />
                </FieldRow>
                <FieldRow label="การปฏิบัติการแก้ไข (Corrective Action)">
                  <textarea className={textareaCls} rows={3} value={form.corrective_action} onChange={set('corrective_action')} disabled={readOnly} />
                </FieldRow>
                <FieldRow label="การป้องกันการเกิดซ้ำ (Preventive Action)">
                  <textarea className={textareaCls} rows={3} value={form.preventive_action} onChange={set('preventive_action')} disabled={readOnly} />
                </FieldRow>
              </div>

              {!isNew && (
                <>
                  <SectionTitle>ส่วน C — การตัดสินใจ ทวนสอบ และปิด (เฉพาะ QA)</SectionTitle>
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FieldRow label="การตัดสินใจจัดการสินค้า (Disposition)">
                      <select className={selectCls} value={form.disposition} onChange={set('disposition')} disabled={qaOnly}>
                        <option value="">-- ยังไม่ตัดสินใจ --</option>
                        {DISPOSITION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </FieldRow>
                    <FieldRow label="ผู้ตัดสินใจ">
                      <input type="text" className={inputCls} disabled
                        value={record?.dispositioned_by ? `${record.dispositioned_by} · ${fmtDate(record.dispositioned_at)}` : '-'} />
                    </FieldRow>
                    <FieldRow label="เหตุผลและหลักฐานประกอบการตัดสินใจ" full>
                      <textarea className={textareaCls} rows={2} value={form.disposition_reason} onChange={set('disposition_reason')} disabled={qaOnly} />
                    </FieldRow>
                    <FieldRow label="ผลการทวนสอบประสิทธิผล">
                      <select className={selectCls} value={form.verification_result} onChange={set('verification_result')} disabled={qaOnly}>
                        {VERIFICATION_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </FieldRow>
                    <FieldRow label="ผู้ทวนสอบ">
                      <input type="text" className={inputCls} disabled
                        value={record?.verified_by ? `${record.verified_by} · ${fmtDate(record.verified_at)}` : '-'} />
                    </FieldRow>
                    <FieldRow label="หมายเหตุการทวนสอบ" full>
                      <textarea className={textareaCls} rows={2} value={form.verification_note} onChange={set('verification_note')} disabled={qaOnly} />
                    </FieldRow>
                    <FieldRow label="สถานะ (Status)">
                      <select className={selectCls} value={form.status} onChange={set('status')} disabled={qaOnly}>
                        {statusOptions.map((s) => <option key={s} value={s}>{STATUS_TH[s]} ({s})</option>)}
                      </select>
                    </FieldRow>
                    <FieldRow label={`เหตุผลการเปลี่ยนสถานะ${form.status === 'Cancelled' ? ' *' : ''}`}>
                      <input type="text" className={inputCls} value={form.status_reason} onChange={set('status_reason')} disabled={qaOnly} />
                    </FieldRow>
                    {form.status === 'Closed' && !locked && (
                      <div className="sm:col-span-2 text-xs text-gray-500">
                        ระบบจะปิด NCR ได้เมื่อมีการแก้ไขเบื้องต้น การตัดสินใจพร้อมเหตุผล และผลทวนสอบเป็น Effective
                        ระดับ Critical และ Major ต้องมีสาเหตุและการแก้ไข กรณี CCP ต้องมีค่าวิกฤตและค่าจริง กรณีส่งมอบแล้วต้องมีผลพิจารณาเรียกคืน
                      </div>
                    )}
                  </div>
                </>
              )}

              {!readOnly && (
                <div className="px-4 pb-5 pt-2 hidden sm:flex justify-end">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                  </button>
                </div>
              )}
            </div>

            {!isNew && (
              <div className="mt-8">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold text-gray-700 flex items-center gap-2">
                    <ClipboardList className="w-5 h-5 text-teal-600" />
                    CAPA ที่เกี่ยวข้อง
                  </h2>
                </div>

                {capas.length === 0 ? (
                  <div className="bg-white rounded-xl shadow p-6 text-center text-gray-400 text-sm">
                    <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    ยังไม่มี CAPA ที่เชื่อมโยง
                    {writer && (
                      <div className="mt-4">
                        <button
                          onClick={() => navigate(`/capa/new?ncr_id=${id}`)}
                          className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition"
                        >
                          <Plus className="w-4 h-4" />สร้าง CAPA ใหม่
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {capas.map((capa) => (
                      <div key={capa.capa_id} className="bg-white rounded-xl shadow px-4 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-blue-800 font-semibold text-sm">{capa.capa_id}</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${CAPA_STATUS_CLS[capa.status] || 'bg-gray-100 text-gray-600'}`}>
                              {capa.status || '-'}
                            </span>
                          </div>
                          <div className="text-sm text-gray-700 truncate">{capa.description || '-'}</div>
                          <div className="text-xs text-gray-400 mt-0.5">ผู้รับผิดชอบ: {capa.responsible_person || '-'}</div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => navigate(`/capa/${capa.capa_id}`)}
                            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition"
                          >
                            ดู/แก้ไข CAPA
                          </button>
                          <button
                            onClick={() => navigate(`/capa/${capa.capa_id}/print`)}
                            className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium transition"
                          >
                            <Printer className="w-3.5 h-3.5" />พิมพ์ CAPA
                          </button>
                        </div>
                      </div>
                    ))}
                    {writer && (
                      <div className="mt-2 flex justify-end">
                        <button
                          onClick={() => navigate(`/capa/new?ncr_id=${id}`)}
                          className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                        >
                          <Plus className="w-4 h-4" />สร้าง CAPA ใหม่
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {!isNew && qa && <AuditTrail entityId={id} refreshKey={version} />}
          </>
        )}
      </div>

      {/* Sticky save bar — mobile only */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-3 z-30 shadow-[0_-2px_12px_rgba(0,0,0,0.08)]">
        {!isNew && (
          <button
            onClick={() => navigate(`/ncr/${id}/print`)}
            className="flex items-center gap-1.5 border border-gray-300 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 bg-white"
          >
            <Printer className="w-4 h-4" />A4
          </button>
        )}
        {!readOnly && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition"
          >
            <Save className="w-4 h-4" />
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        )}
      </div>
    </div>
  )
}
