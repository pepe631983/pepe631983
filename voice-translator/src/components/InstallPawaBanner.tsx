import { useEffect, useState } from 'react'
import './InstallPawaBanner.css'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function InstallPawaBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [hidden, setHidden] = useState(false)
  const [installed, setInstalled] = useState(isStandalone())

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }

    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed || hidden || !deferred) return null

  const install = async () => {
    await deferred.prompt()
    const choice = await deferred.userChoice
    setDeferred(null)
    if (choice.outcome === 'dismissed') setHidden(true)
  }

  return (
    <div className="install-banner" role="region" aria-label="Instalar PAWA">
      <div>
        <strong>Instala PAWA</strong>
        <p>Acceso directo en tu móvil o escritorio, pantalla completa.</p>
      </div>
      <div className="install-actions">
        <button type="button" className="install-primary" onClick={() => void install()}>
          Instalar
        </button>
        <button type="button" className="install-dismiss" onClick={() => setHidden(true)}>
          Ahora no
        </button>
      </div>
    </div>
  )
}
