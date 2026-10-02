import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { capaApi } from '../api/d1Api'
import { Save, ArrowLeft, Printer, Lock } from 'lucide-react'
import { FORM_CODE_CAPA } from '../config'
import { useAuth, isQA, canWrite } from '../auth'
import SupplierLinkBox from '../components/SupplierLinkBox'
import AuditTrail from '../components/AuditTrail'

const SEVERITY_OPTS = ['Minor', 'Major', 'Critical']
const STATUS_OPTS = [
  'Open',
  'Root Cause Analysis',
  'Action Planning',
  'Implementation',
  'Verification',
  'Closed Effective',
  'Closed Not Effective',
]
const EFFECTIVENESS_OPTS = ['-', 'Pending', 'Effective', 'Partially Effective', 'Not Effective']

function SectionTitle({ children }) {
  return (
    <div className="bg-blue-900 text-white px-4 py-2 text-sm font-semibold rounded-t-lg mt-6 first:mt-0">
      {children}
    </div>
  )
}

function FieldRow({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-full disabled:bg-gray-100 disabled:text-gray-500'
const textareaCls = inputCls + ' resize-none'
const selectCls = inputCls + ' bg-white'
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '-')

const EMPTY_FORM = {
  source_ref: '',
  source: 'NCR',
  severity_label: 'Major',
  description: '',
  detail: '',
  responsible_person: '',
  target_date: '',
  status: 'Open',
  why1: '',
  why2: '',
  why3: '',
  why4: '',
  why5: '',
  root_cause_summary: '',
  fishbone_man: '',
  fishbone_machine: '',
  fishbone_material: '',
  fishbone_method: '',
  fishbone_environment: '',
  fishbone_measurement: '',
  containment_action: '',
  corrective_action: '',
  preventive_action: '',
  effectiveness_criteria: '',
  effectiveness_result: '',
  effectiveness_check_date: '',
}

const toForm = (d) => {
  const f = {}
  for (const k of Object.keys(EMPTY_FORM)) f[k] = d[k] === null || d[k] === undefined ? '' : String(d[k])
  f.target_date = f.target_date.slice(0, 10)
  f.effectiveness_check_date = f.effectiveness_check_date.slice(0, 10)
  return f
}

export default function CAPADetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isNew = !id || id === 'new'
  const prefillNcrId = searchParams.get('ncr_id') || ''

  const [form, setForm] = useState({ ...EMPTY_FORM, source_ref: prefillNcrId })
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saveMsg, setSaveMsg] = useState(null)
  const { user } = useAuth()
  const [record, setRecord] = useState(null)
  const [version, setVersion] = useState(0)
  const qa = isQA(user)
  const writer = canWrite(user)
  const locked = !!record && (String(record.status).startsWith('Closed') || record.status === 'Cancelled')
  const readOnly = !writer || locked
  const qaOnly = readOnly || !qa

  const load = useCallback(async () => {
    const d = await capaApi.get(id)
    setRecord(d)
    setForm(toForm(d))
    setVersion((v) => v + 1)
  }, [id])

  useEffect(() => {
    if (isNew) return
    setLoading(true)
    load().catch((e) => setError(e.message)).finally(() => setLoading(false))
  }, [isNew, load])

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }))

  const handleSave = async () => {
    if (!form.description.trim()) { setError('กรุณาระบุหัวข้อ CAPA'); return }
    setSaving(true); setError(null); setSaveMsg(null)
    try {
      if (isNew) {
        const { status, effectiveness_result, ...payload } = form
        const res = await capaApi.create(payload)
        navigate(`/capa/${res.capa_id}`, { replace: true })
        return
      }
      // Send only what changed, so each user touches just the fields their role may edit.
      const before = toForm(record)
      const payload = {}
      for (const k of Object.keys(form)) if (form[k] !== before[k] && k !== 'source' && k !== 'source_ref') payload[k] = form[k]
      if (!Object.keys(payload).length) { setSaveMsg('ไม่มีข้อมูลที่เปลี่ยนแปลง'); return }
      await capaApi.update(id, payload)
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

  const statusOpts = STATUS_OPTS.filter((o) => !o.startsWith('Closed') || user?.role === 'QA_MANAGER' || form.status === o)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-blue-900 text-white sticky top-0 z-40 shadow-lg">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => navigate('/capa')} className="p-2 hover:bg-white/20 rounded-lg transition shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm sm:text-base truncate">
              {isNew ? 'สร้าง CAPA ใหม่' : `CAPA: ${id}`}
            </div>
            <div className="text-blue-300 text-xs hidden sm:block">Corrective & Preventive Action · {FORM_CODE_CAPA}</div>
          </div>
          {!isNew && (
            <button
              onClick={() => navigate(`/capa/${id}/print`)}
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
                <div className="flex-1">CAPA นี้ปิดแล้ว จึงแก้ไขไม่ได้ · ปิดโดย {record.closed_by || '-'} เมื่อ {fmtDate(record.closed_date)}</div>
              </div>
            )}

            {!isNew && !locked && writer && (
              <SupplierLinkBox
                label="ลิงก์ตอบกลับสำหรับผู้ส่งมอบ (CAPA)"
                path="/capa-reply"
                create={() => capaApi.supplierLink(id)}
              />
            )}

            <div className="bg-white rounded-xl shadow overflow-hidden">
              <SectionTitle>ส่วน A — ข้อมูลทั่วไป</SectionTitle>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRow label="NCR อ้างอิง (Source Ref)">
                  <input
                    type="text"
                    className={inputCls}
                    value={form.source_ref}
                    onChange={set('source_ref')}
                    disabled={!isNew}
                    readOnly={!!prefillNcrId}
                    placeholder="เช่น NCR-2025-001"
                  />
                </FieldRow>
                <FieldRow label="แหล่งที่มา (Source)">
                  <input type="text" className={inputCls} value={form.source} onChange={set('source')} disabled={!isNew} placeholder="เช่น Internal Audit, QC" />
                </FieldRow>
                <FieldRow label="ความรุนแรง (Severity)">
                  <select className={selectCls} value={form.severity_label} disabled={readOnly} onChange={set('severity_label')}>
                    <option value="">-- เลือก --</option>
                    {SEVERITY_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </FieldRow>
                <FieldRow label="ผู้รับผิดชอบ (Responsible Person)">
                  <input type="text" className={inputCls} value={form.responsible_person} disabled={readOnly} onChange={set('responsible_person')} placeholder="ชื่อผู้รับผิดชอบ" />
                </FieldRow>
                <div className="sm:col-span-2">
                  <FieldRow label="หัวข้อ CAPA (Description)">
                    <input type="text" className={inputCls} value={form.description} disabled={readOnly} onChange={set('description')} placeholder="สรุปหัวข้อ CAPA" />
                  </FieldRow>
                </div>
                <div className="sm:col-span-2">
                  <FieldRow label="รายละเอียด NC (Detail)">
                    <textarea className={textareaCls} rows={3} value={form.detail} disabled={readOnly} onChange={set('detail')} placeholder="อธิบายรายละเอียดปัญหา..." />
                  </FieldRow>
                </div>
                <FieldRow label="กำหนดแล้วเสร็จ (Target Date)">
                  <input type="date" className={inputCls} value={form.target_date} disabled={readOnly} onChange={set('target_date')} />
                </FieldRow>
                <FieldRow label="สถานะ (Status)">
                  <select className={selectCls} value={form.status} onChange={set('status')} disabled={readOnly || isNew}>
                    {statusOpts.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </FieldRow>
              </div>

              <SectionTitle>ส่วน B — 5-Why Analysis</SectionTitle>
              <div className="p-4 grid grid-cols-1 gap-3">
                {[1, 2, 3, 4, 5].map(n => (
                  <FieldRow key={n} label={`Why ${n}`}>
                    <textarea className={textareaCls} rows={1} value={form[`why${n}`]} disabled={readOnly} onChange={set(`why${n}`)} placeholder={`เหตุผลที่ ${n}...`} />
                  </FieldRow>
                ))}
                <FieldRow label="สรุปสาเหตุหลัก (Root Cause Summary)">
                  <textarea className={textareaCls} rows={2} value={form.root_cause_summary} disabled={readOnly} onChange={set('root_cause_summary')} placeholder="สรุปสาเหตุที่แท้จริง..." />
                </FieldRow>
              </div>

              <SectionTitle>ส่วน C — Fishbone Analysis</SectionTitle>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldRow label="คน (Man)">
                  <input type="text" className={inputCls} value={form.fishbone_man} disabled={readOnly} onChange={set('fishbone_man')} placeholder="ปัจจัยด้านคน" />
                </FieldRow>
                <FieldRow label="เครื่องจักร (Machine)">
                  <input type="text" className={inputCls} value={form.fishbone_machine} disabled={readOnly} onChange={set('fishbone_machine')} placeholder="ปัจจัยด้านเครื่องจักร" />
                </FieldRow>
                <FieldRow label="วัตถุดิบ (Material)">
                  <input type="text" className={inputCls} value={form.fishbone_material} disabled={readOnly} onChange={set('fishbone_material')} placeholder="ปัจจัยด้านวัตถุดิบ" />
                </FieldRow>
                <FieldRow label="วิธีการ (Method)">
                  <input type="text" className={inputCls} value={form.fishbone_method} disabled={readOnly} onChange={set('fishbone_method')} placeholder="ปัจจัยด้านวิธีการ" />
                </FieldRow>
                <FieldRow label="สภาพแวดล้อม (Environment)">
                  <input type="text" className={inputCls} value={form.fishbone_environment} disabled={readOnly} onChange={set('fishbone_environment')} placeholder="ปัจจัยด้านสภาพแวดล้อม" />
                </FieldRow>
                <FieldRow label="การวัด (Measurement)">
                  <input type="text" className={inputCls} value={form.fishbone_measurement} disabled={readOnly} onChange={set('fishbone_measurement')} placeholder="ปัจจัยด้านการวัด" />
                </FieldRow>
              </div>

              <SectionTitle>ส่วน D — Actions</SectionTitle>
              <div className="p-4 grid grid-cols-1 gap-4">
                <FieldRow label="การควบคุมเบื้องต้น (Containment Action)">
                  <textarea className={textareaCls} rows={3} value={form.containment_action} disabled={readOnly} onChange={set('containment_action')} />
                </FieldRow>
                <FieldRow label="มาตรการแก้ไข (Corrective Action)">
                  <textarea className={textareaCls} rows={3} value={form.corrective_action} disabled={readOnly} onChange={set('corrective_action')} />
                </FieldRow>
                <FieldRow label="มาตรการป้องกัน (Preventive Action)">
                  <textarea className={textareaCls} rows={3} value={form.preventive_action} disabled={readOnly} onChange={set('preventive_action')} />
                </FieldRow>
              </div>

              <SectionTitle>ส่วน E — Verification & Approval</SectionTitle>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <FieldRow label="เกณฑ์ประสิทธิผล (Effectiveness Criteria)">
                    <textarea className={textareaCls} rows={2} value={form.effectiveness_criteria} disabled={readOnly} onChange={set('effectiveness_criteria')} />
                  </FieldRow>
                </div>
                <FieldRow label="ผลการประเมินประสิทธิผล (Effectiveness Result)">
                  <select className={selectCls} value={form.effectiveness_result} onChange={set('effectiveness_result')} disabled={qaOnly || isNew}>
                    {EFFECTIVENESS_OPTS.map(o => <option key={o} value={o === '-' ? '' : o}>{o}</option>)}
                  </select>
                </FieldRow>
                <FieldRow label="วันที่ตรวจสอบประสิทธิผล">
                  <input type="date" className={inputCls} value={form.effectiveness_check_date} disabled={readOnly} onChange={set('effectiveness_check_date')} />
                </FieldRow>
                <FieldRow label="ผู้ตรวจสอบ (ระบบบันทึกให้)">
                  <input type="text" className={inputCls} disabled value={record?.verified_by ? `${record.verified_by} · ${fmtDate(record.verified_date)}` : '-'} />
                </FieldRow>
                <FieldRow label="ผู้อนุมัติปิด (ระบบบันทึกให้)">
                  <input type="text" className={inputCls} disabled value={record?.approved_by ? `${record.approved_by} · ${fmtDate(record.approved_date)}` : '-'} />
                </FieldRow>
              </div>

              <div className={`px-4 pb-5 pt-2 hidden ${readOnly ? '' : 'sm:flex'} justify-end`}>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </div>

            {!isNew && qa && <AuditTrail entityId={id} refreshKey={version} />}
          </>
        )}
      </div>

      {/* Sticky save bar — mobile only */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-3 z-30 shadow-[0_-2px_12px_rgba(0,0,0,0.08)]">
        {!isNew && (
          <button
            onClick={() => navigate(`/capa/${id}/print`)}
            className="flex items-center gap-1.5 border border-gray-300 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 bg-white"
          >
            <Printer className="w-4 h-4" />A4
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving || readOnly}
          className="flex-1 flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition"
        >
          <Save className="w-4 h-4" />
          {saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </div>
    </div>
  )
}
