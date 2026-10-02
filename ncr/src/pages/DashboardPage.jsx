import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { ncrApi, capaApi } from '../api/d1Api'
import { PROCESSES, byCode } from '../data/masterData'

const PROCESS_LABEL = byCode(PROCESSES)
import {
  FileText, AlertTriangle, Clock, CheckCircle2, Search, ShieldAlert,
  TrendingUp, RefreshCw, ClipboardList,
} from 'lucide-react'

const SOURCE_LABELS = {
  RM_RECEIVING: 'รับวัตถุดิบ',
  IN_PROCESS: 'ระหว่างผลิต',
  CCP: 'CCP',
  FINAL_QC: 'ตรวจขั้นสุดท้าย',
  COMPLAINT: 'ข้อร้องเรียน',
  AUDIT: 'Audit',
  MAINTENANCE: 'ซ่อมบำรุง',
  OTHER: 'อื่นๆ',
}

const SEV_COLOR = { Critical: 'bg-red-500', Major: 'bg-orange-500', Minor: 'bg-green-500' }
const SEV_TEXT = { Critical: 'text-red-600', Major: 'text-orange-600', Minor: 'text-green-600' }
const SEV_HEX = { Critical: '#ef4444', Major: '#f97316', Minor: '#22c55e' }
const STATUS_HEX = {
  Open: '#ef4444',
  'In Investigation': '#f97316',
  'Pending Verification': '#f59e0b',
  Closed: '#22c55e',
  Cancelled: '#94a3b8',
}

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

const OPEN_STATUSES = ['Open', 'In Investigation', 'Pending Verification']

function StatCard({ icon: Icon, label, value, tone = 'blue', onClick }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    orange: 'bg-orange-50 text-orange-700 border-orange-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    green: 'bg-green-50 text-green-700 border-green-100',
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
  }
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`border rounded-xl p-4 text-left transition ${tones[tone]} ${onClick ? 'hover:shadow-md cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex items-center justify-between">
        <Icon className="w-5 h-5 opacity-70" />
        <span className="text-2xl font-bold tabular-nums">{value}</span>
      </div>
      <div className="text-xs font-medium mt-1 opacity-80">{label}</div>
    </button>
  )
}

function BarList({ title, data, colorFn }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="bg-white rounded-xl shadow p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
      {data.length === 0 ? (
        <div className="text-xs text-gray-400 py-4 text-center">ไม่มีข้อมูล</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {data.map((d) => (
            <div key={d.label} className="flex items-center gap-2">
              <div className="w-28 sm:w-32 text-xs text-gray-600 truncate shrink-0">{d.label}</div>
              <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                <div
                  className={`h-full rounded-full ${colorFn ? colorFn(d) : 'bg-blue-500'} transition-all`}
                  style={{ width: `${(d.value / max) * 100}%` }}
                />
              </div>
              <div className="w-8 text-right text-xs font-semibold text-gray-700 tabular-nums">{d.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PieChart({ title, data }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const R = 60, STROKE = 26, C = 2 * Math.PI * R
  let acc = 0

  return (
    <div className="bg-white rounded-xl shadow p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
      {total === 0 ? (
        <div className="text-xs text-gray-400 py-4 text-center">ไม่มีข้อมูล</div>
      ) : (
        <div className="flex items-center gap-4">
          <svg viewBox="0 0 160 160" className="w-36 h-36 shrink-0 -rotate-90">
            <circle cx="80" cy="80" r={R} fill="none" stroke="#f1f5f9" strokeWidth={STROKE} />
            {data.map((d) => {
              const frac = d.value / total
              const seg = frac * C
              const el = (
                <circle
                  key={d.label}
                  cx="80" cy="80" r={R} fill="none"
                  stroke={d.color} strokeWidth={STROKE}
                  strokeDasharray={`${seg} ${C - seg}`}
                  strokeDashoffset={-acc}
                />
              )
              acc += seg
              return el
            })}
            <text x="80" y="80" transform="rotate(90 80 80)" textAnchor="middle" dominantBaseline="central"
              className="fill-gray-800" style={{ fontSize: '26px', fontWeight: 700 }}>
              {total}
            </text>
          </svg>
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            {data.map((d) => (
              <div key={d.label} className="flex items-center gap-2 text-xs">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: d.color }} />
                <span className="text-gray-600 truncate flex-1">{d.label}</span>
                <span className="font-semibold text-gray-800 tabular-nums">{d.value}</span>
                <span className="text-gray-400 tabular-nums w-9 text-right">{Math.round((d.value / total) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MonthlyTrend({ data }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="bg-white rounded-xl shadow p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
        <TrendingUp className="w-4 h-4 text-blue-600" />แนวโน้มรายเดือน
      </h3>
      {data.length === 0 ? (
        <div className="text-xs text-gray-400 py-4 text-center">ไม่มีข้อมูล</div>
      ) : (
        <div className="flex items-end gap-2 h-40 pt-2">
          {data.map((d) => (
            <div key={d.key} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div className="text-[11px] font-semibold text-gray-600 tabular-nums">{d.value}</div>
              <div className="w-full bg-blue-100 rounded-t-md flex items-end" style={{ height: '100%' }}>
                <div
                  className="w-full bg-blue-500 rounded-t-md transition-all"
                  style={{ height: `${(d.value / max) * 100}%` }}
                />
              </div>
              <div className="text-[10px] text-gray-500 truncate w-full text-center">{d.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [ncrs, setNcrs] = useState([])
  const [capaCount, setCapaCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = () => {
    setLoading(true); setError(null)
    Promise.all([ncrApi.list(), capaApi.list()])
      .then(([n, c]) => {
        setNcrs(Array.isArray(n) ? n : [])
        setCapaCount(Array.isArray(c) ? c.length : 0)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const byStatus = {}, bySeverity = {}, bySource = {}, byMonth = {}, byProcess = {}
    let overdue = 0, closedDaysSum = 0, closedCount = 0
    const overdueList = []

    for (const r of ncrs) {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1
      if (r.severity) bySeverity[r.severity] = (bySeverity[r.severity] || 0) + 1
      const src = r.source_type || 'OTHER'
      bySource[src] = (bySource[src] || 0) + 1
      if (r.process_ref) {
        // normalize to the leading process code (data may store "PC0001" or "PC0001 - ชื่อ")
        const pcode = (String(r.process_ref).match(/^PC\d{4}/) || [r.process_ref])[0]
        byProcess[pcode] = (byProcess[pcode] || 0) + 1
      }

      const d = (r.issue_date || '').slice(0, 7) // YYYY-MM
      if (d) byMonth[d] = (byMonth[d] || 0) + 1

      const isOpen = !['Closed', 'Cancelled'].includes(r.status)
      if (isOpen && r.target_date && r.target_date.slice(0, 10) < today) {
        overdue++
        overdueList.push(r)
      }
      if (r.status === 'Closed') {
        closedCount++
        if (r.days_open != null) closedDaysSum += Number(r.days_open) || 0
      }
    }

    const monthly = Object.keys(byMonth).sort().slice(-6).map((k) => {
      const [y, m] = k.split('-')
      return { key: k, label: TH_MONTHS[Number(m) - 1] || k, value: byMonth[k] }
    })

    const severityOrder = ['Critical', 'Major', 'Minor']
    const severity = severityOrder
      .filter((s) => bySeverity[s])
      .map((s) => ({ label: s, value: bySeverity[s], color: SEV_HEX[s] }))

    const statusOrder = ['Open', 'In Investigation', 'Pending Verification', 'Closed', 'Cancelled']
    const statusDist = statusOrder
      .filter((s) => byStatus[s])
      .map((s) => ({ label: s, value: byStatus[s], color: STATUS_HEX[s] || '#94a3b8' }))

    const source = Object.entries(bySource)
      .map(([k, v]) => ({ label: SOURCE_LABELS[k] || k, value: v }))
      .sort((a, b) => b.value - a.value)

    const process = Object.entries(byProcess)
      .map(([k, v]) => ({ label: PROCESS_LABEL[k] ? `${k} ${PROCESS_LABEL[k]}` : k, value: v }))
      .sort((a, b) => b.value - a.value)

    return {
      total: ncrs.length,
      open: byStatus['Open'] || 0,
      investigation: byStatus['In Investigation'] || 0,
      pending: byStatus['Pending Verification'] || 0,
      closed: byStatus['Closed'] || 0,
      overdue,
      overdueList: overdueList.sort((a, b) => (a.target_date || '').localeCompare(b.target_date || '')),
      avgDays: closedCount ? Math.round(closedDaysSum / closedCount) : null,
      monthly, severity, statusDist, source, process,
    }
  }, [ncrs])

  const refreshBtn = (
    <button onClick={load} title="รีเฟรช" className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg text-sm transition">
      <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
      <span className="hidden sm:inline">รีเฟรช</span>
    </button>
  )

  return (
    <Layout pageActions={refreshBtn}>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-800">แดชบอร์ด NCR</h1>
        <p className="text-sm text-gray-500">ภาพรวมรายงานสิ่งที่ไม่เป็นไปตามข้อกำหนด</p>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          เกิดข้อผิดพลาด: {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-gray-400 text-sm">กำลังโหลดข้อมูล...</div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard icon={FileText} label="NCR ทั้งหมด" value={stats.total} tone="blue" onClick={() => navigate('/ncr')} />
            <StatCard icon={AlertTriangle} label="Open" value={stats.open} tone="red" />
            <StatCard icon={Search} label="In Investigation" value={stats.investigation} tone="orange" />
            <StatCard icon={Clock} label="Pending Verification" value={stats.pending} tone="amber" />
            <StatCard icon={CheckCircle2} label="Closed" value={stats.closed} tone="green" />
            <StatCard icon={ShieldAlert} label="เกินกำหนด" value={stats.overdue} tone="red" />
          </div>

          {/* secondary metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={ClipboardList} label="CAPA ทั้งหมด" value={capaCount} tone="slate" onClick={() => navigate('/capa')} />
            <StatCard icon={Clock} label="เฉลี่ยวันปิดงาน" value={stats.avgDays != null ? `${stats.avgDays} วัน` : '-'} tone="slate" />
            <StatCard icon={AlertTriangle} label="ยังไม่ปิด" value={stats.open + stats.investigation + stats.pending} tone="slate" />
            <StatCard icon={TrendingUp} label="เดือนล่าสุด" value={stats.monthly.length ? stats.monthly[stats.monthly.length - 1].value : 0} tone="slate" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <PieChart title="แยกตามความรุนแรง (Severity)" data={stats.severity} />
            <PieChart title="แยกตามสถานะ (Status)" data={stats.statusDist} />
          </div>

          <MonthlyTrend data={stats.monthly} />

          <BarList title="แยกตามแหล่งที่มา (Source)" data={stats.source} />

          <BarList title="NCR แยกตามกระบวนการ (Process)" data={stats.process} />

          {/* Overdue list */}
          <div className="bg-white rounded-xl shadow p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-red-600" />รายการเกินกำหนด (Overdue)
            </h3>
            {stats.overdueList.length === 0 ? (
              <div className="text-xs text-gray-400 py-4 text-center">ไม่มีรายการเกินกำหนด 🎉</div>
            ) : (
              <div className="flex flex-col divide-y divide-gray-100">
                {stats.overdueList.map((r) => (
                  <button
                    key={r.ncr_id}
                    onClick={() => navigate(`/ncr/${r.ncr_id}`)}
                    className="flex items-center gap-3 py-2.5 text-left hover:bg-gray-50 -mx-2 px-2 rounded-lg transition"
                  >
                    <span className="font-mono text-xs font-semibold text-blue-800 shrink-0">{r.ncr_id}</span>
                    {r.severity && (
                      <span className={`text-[11px] font-semibold ${SEV_TEXT[r.severity] || ''} shrink-0`}>{r.severity}</span>
                    )}
                    <span className="text-sm text-gray-700 truncate flex-1">{r.nc_description || '-'}</span>
                    <span className="text-xs text-red-600 font-medium shrink-0">ครบกำหนด {(r.target_date || '').slice(0, 10)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  )
}
