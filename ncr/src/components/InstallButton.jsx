import { useState, useEffect } from 'react'
import { Download } from 'lucide-react'

// Shows an "ติดตั้งแอป" button when the browser fires beforeinstallprompt.
// Hidden once installed or on browsers that don't support install (e.g. iOS Safari).
export default function InstallButton() {
  const [prompt, setPrompt] = useState(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault()
      setPrompt(e)
    }
    const onInstalled = () => { setHidden(true); setPrompt(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    // Already running as installed app → no button needed.
    if (window.matchMedia('(display-mode: standalone)').matches) setHidden(true)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (hidden || !prompt) return null

  const handleClick = async () => {
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') setHidden(true)
    setPrompt(null)
  }

  return (
    <button
      onClick={handleClick}
      title="ติดตั้งแอปลงเครื่อง"
      className="flex items-center gap-1.5 bg-green-500 hover:bg-green-400 px-3 py-1.5 rounded-lg text-sm font-semibold transition text-white shadow-sm"
    >
      <Download className="w-4 h-4" />
      <span className="hidden sm:inline">ติดตั้งแอป</span>
    </button>
  )
}
