import { useState } from 'react'
import { Link2, Check } from 'lucide-react'

// Creates a one-document reply link for a supplier and copies it.
// The link is shown only once: the server keeps a hash of it, not the link itself.
export default function SupplierLinkBox({ create, path, label, disabled }) {
  const [link, setLink] = useState('')
  const [expires, setExpires] = useState('')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const t = document.createElement('textarea')
      t.value = text; document.body.appendChild(t); t.select()
      document.execCommand('copy'); document.body.removeChild(t)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const make = async () => {
    setBusy(true); setError(null)
    try {
      const res = await create()
      const url = `${window.location.origin}${path}#${res.token}`
      setLink(url)
      setExpires(new Date(res.expires_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }))
      await copy(url)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-4 bg-teal-50 border border-teal-200 rounded-xl p-3">
      <div className="flex items-center gap-3">
        <Link2 className="w-5 h-5 text-teal-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-teal-800">{label}</div>
          <div className="text-xs text-teal-700 break-all">
            {link || 'กดสร้างลิงก์เพื่อคัดลอกและส่งให้ผู้ส่งมอบ'}
          </div>
        </div>
        {link ? (
          <button onClick={() => copy(link)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 text-white ${copied ? 'bg-green-600' : 'bg-teal-600 hover:bg-teal-700'}`}>
            {copied ? <><Check className="w-3.5 h-3.5" />คัดลอกแล้ว</> : <><Link2 className="w-3.5 h-3.5" />คัดลอกลิงก์</>}
          </button>
        ) : (
          <button onClick={make} disabled={busy || disabled}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50">
            <Link2 className="w-3.5 h-3.5" />{busy ? 'กำลังสร้าง...' : 'สร้างลิงก์'}
          </button>
        )}
      </div>
      {link && (
        <div className="text-[11px] text-teal-700 mt-2">
          ลิงก์นี้เปิดได้เฉพาะเอกสารฉบับนี้ ใช้ได้ถึง {expires} และแสดงครั้งเดียว หากสร้างลิงก์ใหม่ ลิงก์เดิมจะใช้ไม่ได้
        </div>
      )}
      {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
    </div>
  )
}
