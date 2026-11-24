// 用相機掃 QR Code。主畫面的 App 沒辦法靠手機內建的相機掃邀請（那樣會開到 Safari，不是這個 App），
// 所以在 App 裡自己開相機掃。條碼引擎用到才載入。
import { useEffect, useRef, useState } from 'preact/hooks'
import { Sheet } from './kit'

/** 多久看一次畫面（毫秒）、送去辨識的畫面最長邊縮到多少（像素；太大手機會跟不上）。 */
const EVERY_MS = 220
const MAX_SIDE = 900

/**
 * 掃描面板。掃到東西就交給 onText：它回傳 true 表示是要的內容（面板由呼叫的人關掉），
 * 回傳 false 表示掃到的不是要的，繼續掃並提示。
 * 相機打不開（沒同意、裝置不支援）時改成「拍一張照片來辨識」。
 */
export function ScanSheet({ title, wrong, onText, onClose }: {
  title: string
  /** 掃到了但不是要的內容時顯示的話。 */
  wrong: string
  onText: (text: string) => boolean
  onClose: () => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<'starting' | 'live' | 'denied'>('starting')
  const [note, setNote] = useState('')

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer = 0
    let gone = false
    const canvas = document.createElement('canvas')

    const look = async () => {
      const v = video.current
      if (gone || !v) return
      if (v.videoWidth > 0) {
        const scale = Math.min(1, MAX_SIDE / Math.max(v.videoWidth, v.videoHeight))
        canvas.width = Math.round(v.videoWidth * scale)
        canvas.height = Math.round(v.videoHeight * scale)
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (ctx) {
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
          try {
            const { readQrText } = await import('../import/barcode')
            const text = await readQrText(ctx.getImageData(0, 0, canvas.width, canvas.height))
            if (gone) return
            if (text) {
              if (onText(text)) return
              setNote(wrong)
            }
          } catch {
            // 這一格辨識失敗就看下一格
          }
        }
      }
      timer = window.setTimeout(look, EVERY_MS)
    }

    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera api')
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (gone) return stream.getTracks().forEach((t) => t.stop())
        const v = video.current
        if (!v) return
        v.srcObject = stream
        await v.play().catch(() => {})
        setState('live')
        void look()
      } catch {
        if (!gone) setState('denied')
      }
    })()

    return () => {
      gone = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  /** 相機不能用時：拍一張（或選一張）照片來辨識。 */
  const fromPhoto = async (file: File | undefined) => {
    if (!file) return
    setNote('辨識中…')
    try {
      const { readBarcodeTexts } = await import('../import/barcode')
      const texts = await readBarcodeTexts(file)
      if (texts.some((t) => onText(t))) return
      setNote(texts.length > 0 ? wrong : '照片裡找不到 QR Code，靠近一點再拍一次。')
    } catch {
      setNote('沒辦法辨識這張照片。')
    }
  }

  return (
    <Sheet title={title} onClose={onClose}>
      {state !== 'denied' && (
        <div class="scanbox">
          {/* playsinline：iPhone 上不要自己跳成全螢幕播放 */}
          <video ref={video} playsInline muted autoplay />
          <span class="scanframe" />
          {state === 'starting' && <span class="scanwait">正在開相機…</span>}
        </div>
      )}
      {state === 'live' && <p class="muted center">把 QR Code 放進框裡，會自動辨識。</p>}
      {state === 'denied' && (
        <div class="notice" style="display:block">
          開不了相機。可能是沒有同意使用相機，或這個瀏覽器不支援。可以改用下面的按鈕拍一張照片。
        </div>
      )}
      {note && <p class="center">{note}</p>}
      <label class={`btn block ${state === 'denied' ? 'primary' : ''}`} style="margin-top:10px">
        拍照或選一張照片來辨識
        <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => void fromPhoto((e.target as HTMLInputElement).files?.[0])} />
      </label>
    </Sheet>
  )
}
