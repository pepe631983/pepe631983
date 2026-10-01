import { useRegisterSW } from 'virtual:pwa-register/react'
import './PwaUpdateToast.css'

export function PwaUpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div className="pwa-toast" role="status">
      <span>Hay una nueva versión de PAWA.</span>
      <button
        type="button"
        onClick={() => void updateServiceWorker(true)}
      >
        Actualizar
      </button>
      <button type="button" className="ghost" onClick={() => setNeedRefresh(false)}>
        Luego
      </button>
    </div>
  )
}
