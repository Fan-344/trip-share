// 各畫面共用的小元件與 hook。
import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { encode } from 'uqr'
import type * as Y from 'yjs'
import { parseInvite } from '../store/local'

/** 文件有任何改動（本機或同步進來的）就重畫。 */
export function useDocs(docs: Y.Doc[]): void {
  const [, set] = useState(0)
  useEffect(() => {
    const f = () => set((n) => n + 1)
    docs.forEach((d) => d.on('update', f))
    return () => docs.forEach((d) => d.off('update', f))
  }, docs)
}

export function useHash(): string {
  const [hash, set] = useState(location.hash)
  useEffect(() => {
    const f = () => set(location.hash)
    addEventListener('hashchange', f)
    return () => removeEventListener('hashchange', f)
  }, [])
  return hash
}

/** 每隔一段時間重畫（倒數、「幾分鐘前」）。回傳現在的時間。 */
export function useNow(ms: number): number {
  const [now, set] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => set(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

export const value = (e: Event): string => (e.target as HTMLInputElement).value

/** 從畫面底部滑上來的面板，用來新增與編輯。點背景或 ✕ 關閉。 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  return (
    <div class="sheet-wrap" onClick={onClose}>
      <div class="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div class="sheet-head">
          <h2>{title}</h2>
          <button class="ghost" aria-label="關閉" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <label class="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

/** 幾選一的按鈕列。 */
export function Seg<T extends string>({ value: v, options, onChange }: {
  value: T
  options: [T, string][]
  onChange: (v: T) => void
}) {
  return (
    <div class="seg">
      {options.map(([key, label]) => (
        <button type="button" key={key} class={key === v ? 'on' : ''} onClick={() => onChange(key)}>{label}</button>
      ))}
    </div>
  )
}

/** QR Code。直接畫成 SVG，不用圖片也不連外。 */
export function Qr({ text, label }: { text: string; label: string }) {
  const { size, data } = encode(text, { ecc: 'M', border: 3 })
  let d = ''
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) if (data[y][x]) d += `M${x} ${y}h1v1h-1z`
  }
  return (
    <svg class="qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shape-rendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  )
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // 舊瀏覽器或沒有剪貼簿權限時的備用做法。
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

export function CopyButton({ text, label, cls = 'primary' }: { text: string; label: string; cls?: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle')
  return (
    <button type="button" class={cls} onClick={async () => {
      setState((await copyText(text)) ? 'ok' : 'fail')
      setTimeout(() => setState('idle'), 2000)
    }}>
      {state === 'ok' ? '已複製 ✓' : state === 'fail' ? '複製失敗，請長按連結' : label}
    </button>
  )
}

/** 貼上邀請連結加入：從主畫面 App 加入行程的入口，也是連結點不開時的備用做法。 */
export function PasteInvite() {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const join = (raw: string, notFound: string) => {
    const invite = parseInvite(raw)
    if (!invite) return setError(notFound)
    setError('')
    setText('')
    location.hash = `#/join/${invite.id}/${invite.key}`
  }
  return (
    <form onSubmit={(e) => {
      e.preventDefault()
      join(text, '找不到邀請內容，請確認貼上的是完整連結。')
    }}>
      {/* 讀剪貼簿一定要由使用者按按鈕觸發；iPhone 會再跳一次「貼上」讓人確認。 */}
      <button type="button" class="primary block" onClick={async () => {
        try {
          join(await navigator.clipboard.readText(), '剪貼簿裡沒有邀請連結。請先在邀請連結的頁面按「複製邀請」。')
        } catch {
          setError('讀不到剪貼簿。請在下面的格子長按、選「貼上」。')
        }
      }}>貼上邀請</button>
      <div class="row" style="margin-top:10px">
        <input class="grow" value={text} onInput={(e) => setText(value(e))} placeholder="或把邀請連結貼在這裡" />
        <button disabled={!text.trim()}>加入</button>
      </div>
      {error && <p class="muted">{error}</p>}
    </form>
  )
}
