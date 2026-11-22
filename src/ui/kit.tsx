// 各畫面共用的小元件與 hook。
import type { ComponentChildren } from 'preact'
import { createPortal } from 'preact/compat'
import { useEffect, useState } from 'preact/hooks'
import { encode } from 'uqr'
import { Icon } from './Icons'
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

/**
 * 蓋住整個畫面的東西（面板、照片檢視）開著的時候，鎖住底下頁面的捲動。
 * 用計數：同時開兩層時，要兩層都關了才解鎖。
 * （以前是「記住原本的值、關掉時還原」，兩層不照順序關的話，頁面會永遠捲不動。）
 */
let scrollLocks = 0
export function useScrollLock(): void {
  useEffect(() => {
    if (scrollLocks++ === 0) document.body.style.overflow = 'hidden'
    return () => {
      if (--scrollLocks <= 0) {
        scrollLocks = 0
        document.body.style.overflow = ''
      }
    }
  }, [])
}

/**
 * 把內容直接掛到 <body> 底下，不留在原本的卡片裡。
 * 卡片有進場動畫（位移），而位移過的元素會把裡面「固定在螢幕上」的東西關在自己的範圍內：
 * 面板可能只出現在卡片裡、甚至看不到，頁面卻已經被鎖住不能捲——看起來就是卡死。
 */
export function Overlay({ children }: { children: ComponentChildren }) {
  return createPortal(<>{children}</>, document.body)
}

/** 按 Esc 關閉（接了鍵盤的平板、電腦用）。 */
export function useEscape(onClose: () => void): void {
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    addEventListener('keydown', f)
    return () => removeEventListener('keydown', f)
  }, [onClose])
}

/** 從畫面底部滑上來的面板，用來新增與編輯。點背景或右上角的叉叉關閉。 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  useScrollLock()
  return (
    <Overlay>
      <div class="sheet-wrap" onClick={onClose}>
        <div class="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
          <div class="sheet-head">
            <h2>{title}</h2>
            <button class="ghost" aria-label="關閉" onClick={onClose}><Icon id="close" size={20} /></button>
          </div>
          {children}
        </div>
      </div>
    </Overlay>
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
      {state === 'ok' && <Icon id="check" size={18} />}
      {state === 'ok' ? '已複製' : state === 'fail' ? '複製失敗，請長按連結' : label}
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
    location.hash = `#/join/${invite.id}/${invite.key}${invite.expiresAt ? `/${Math.floor(invite.expiresAt / 1000)}` : ""}`
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
