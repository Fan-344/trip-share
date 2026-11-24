// 各畫面共用的小元件與 hook。
import type { ComponentChildren } from 'preact'
import { createPortal } from 'preact/compat'
import { useEffect, useState } from 'preact/hooks'
import { encode } from 'uqr'
import { Icon } from './Icons'
import type * as Y from 'yjs'
import { parseInvite } from '../store/local'
import { dragIntent, swipeDone } from '../swipe'

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

/**
 * 選單下方、靠右的「編輯」開關。平常畫面只給人看和勾，新增、修改、刪除的按鈕都收起來，
 * 按了「編輯」才出現；改完按「完成」。切到別的分頁會自動回到平常的樣子。
 *
 * 各分頁自己管編輯狀態，按鈕卻要放在每一頁的最上面（行程頁的 #editslot），所以這裡把按鈕送過去；
 * 那一格是同一次畫面才出現的，要等畫好才找得到。
 * 那一格自己不佔高度：按鈕往下移 drop（像素），疊在各頁第一列的右邊，跟那一頁的小標同高。
 * 第一列沒有空位的頁面（總覽最上面是主圖、行程最上面是日期那排）給 row，按鈕就自己佔一行。
 * 編輯中「完成」會黏在選單底下，捲到哪都按得到；選單有多高是量出來的（瀏海、字體大小都會影響）。
 */
export function EditBar({ on, onChange, drop = 0, row = false }: { on: boolean; onChange: (on: boolean) => void; drop?: number; row?: boolean }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useEffect(() => setSlot(document.getElementById('editslot')), [])
  useEffect(() => {
    if (!slot) return
    slot.classList.toggle('on', on)
    slot.style.setProperty('--drop', `${drop}px`)
    slot.classList.toggle('row', row)
    slot.style.top = on ? `${(document.querySelector<HTMLElement>('.topbar')?.offsetHeight ?? 0) + 6 - drop}px` : ''
    return () => { slot.classList.remove('on', 'row'); slot.style.top = '' }
  }, [slot, on, drop, row])
  // 長按頁面上任何一處（按鈕、連結、輸入框除外）也能進入編輯模式
  useLongPress(slot?.parentElement ?? null, !on, () => onChange(true))
  if (!slot) return null
  return createPortal(
    <button class={`small editbtn ${on ? 'primary' : ''}`} aria-pressed={on} onClick={() => onChange(!on)}>
      <Icon id={on ? 'check' : 'pencil'} size={16} />{on ? '完成' : '編輯'}
    </button>,
    slot,
  )
}

/** 長按要按多久（毫秒）、手指可以晃動多少（像素）還算長按。 */
const PRESS_MS = 550
const PRESS_SLOP = 10

/**
 * 在 el 裡長按就呼叫 fire。按在按鈕、連結、輸入框上不算（它們有自己的事要做）；
 * 手指移動超過一點點、或畫面開始捲動，就當成是在滑頁面，不算長按。
 * 長按成立後，放開手指那一下不會再被當成點擊（不然長按一張卡片會順便把它展開）。
 * el 會加上 data-pressable，樣式表用它關掉長按選字和系統選單，免得跟長按搶。
 * （用 data 屬性不用 class：el 的 class 是畫面那邊在管的，重畫時會把別人加的 class 洗掉。）
 */
export function useLongPress(el: HTMLElement | null, enabled: boolean, fire: () => void): void {
  useEffect(() => {
    if (!el || !enabled) return
    el.dataset.pressable = ''
    let timer = 0
    let x = 0
    let y = 0
    let firedAt = 0
    const cancel = () => { clearTimeout(timer); timer = 0 }
    const down = (e: PointerEvent) => {
      cancel()
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
      if ((e.target as Element).closest('button, a, input, select, textarea')) return
      x = e.clientX
      y = e.clientY
      timer = window.setTimeout(() => {
        timer = 0
        firedAt = Date.now()
        fire()
      }, PRESS_MS)
    }
    const move = (e: PointerEvent) => {
      if (timer && Math.hypot(e.clientX - x, e.clientY - y) > PRESS_SLOP) cancel()
    }
    // 長按剛成立：吃掉緊接著的那一下點擊和系統的長按選單
    const swallow = (e: Event) => {
      if (Date.now() - firedAt > 800) return
      e.preventDefault()
      e.stopPropagation()
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', cancel)
    el.addEventListener('pointercancel', cancel)
    el.addEventListener('pointerleave', cancel)
    el.addEventListener('click', swallow, true)
    el.addEventListener('contextmenu', swallow)
    addEventListener('scroll', cancel, true)
    return () => {
      cancel()
      delete el.dataset.pressable
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', cancel)
      el.removeEventListener('pointercancel', cancel)
      el.removeEventListener('pointerleave', cancel)
      // 進入編輯模式的那一刻這裡就會被拆掉，但放開手指的點擊還沒來：多留一下再拆
      setTimeout(() => {
        el.removeEventListener('click', swallow, true)
        el.removeEventListener('contextmenu', swallow)
      }, 900)
      removeEventListener('scroll', cancel, true)
    }
  }, [el, enabled])
}

/**
 * 在 el 裡左右滑：整個 el 跟著手指移動，放開時滑得夠遠（或夠快）就滑出去並呼叫 onSwipe，不夠就彈回原位。
 * dir 是 -1（手指往左）或 1（往右）；canGo 說那個方向有沒有地方可以去，沒有的話拖起來會很重、放開就彈回。
 * 從自己會左右捲的東西（日期那排、成員那排）或輸入框開始滑的不算；兩根手指的也不算；
 * 一開始是上下動的就當成在捲頁面，這一次都不再管它。
 * 使用者要求減少動態效果時不跟手、不滑出，只在放開時判斷。
 */
export function useSwipe(el: HTMLElement | null, canGo: (dir: -1 | 1) => boolean, onSwipe: (dir: -1 | 1) => void): void {
  useEffect(() => {
    if (!el) return
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    let x = 0
    let y = 0
    let at = 0
    let live = false
    let locked = false
    let leaving = 0
    const scrollsSideways = (from: Element): boolean => {
      for (let e: Element | null = from; e && e !== el; e = e.parentElement) {
        if (e.matches('input, textarea, select')) return true
        // 設成可以左右捲的就算，不管現在內容有沒有超出（寬一點的手機上日期那排剛好放得下）
        if (/auto|scroll/.test(getComputedStyle(e).overflowX)) return true
      }
      return false
    }
    let shifted = false
    const place = (dx: number, ms: number) => {
      el.style.transition = ms ? `transform ${ms}ms ease-out` : 'none'
      el.style.transform = dx ? `translateX(${dx}px)` : ''
      shifted = dx !== 0
    }
    // 手指移動和放開的事件，掛在「手指一開始碰到的那個東西」上，不掛在 el 上：
    // 拖到一半畫面重畫（同步進來新資料、時鐘跳一秒）把那個東西換掉的話，事件只會送給它、不會再傳到 el，
    // 掛在 el 上就收不到放開，整頁會卡在拖到一半的位置。
    let held: EventTarget | null = null
    const release = () => {
      held?.removeEventListener('touchmove', move as EventListener)
      held?.removeEventListener('touchend', end as EventListener)
      held?.removeEventListener('touchcancel', stop)
      held = null
    }
    const start = (e: TouchEvent) => {
      release()
      // 上一次沒收乾淨（例如第二根手指放上來）：先回到原位
      if (shifted && !leaving) place(0, 200)
      live = !leaving && e.touches.length === 1 && !scrollsSideways(e.target as Element)
      locked = false
      if (!live) return
      x = e.touches[0].clientX
      y = e.touches[0].clientY
      at = Date.now()
      held = e.target
      held?.addEventListener('touchmove', move as EventListener, { passive: false })
      held?.addEventListener('touchend', end as EventListener)
      held?.addEventListener('touchcancel', stop)
    }
    const move = (e: TouchEvent) => {
      if (!live) return
      // 多了一根手指（縮放）：這次不算，回到原位
      if (e.touches.length !== 1) return stop()
      const dx = e.touches[0].clientX - x
      const dy = e.touches[0].clientY - y
      if (!locked) {
        const intent = dragIntent(dx, dy)
        if (intent === 'y') { live = false; release() }
        if (intent !== 'x') return
        locked = true
      }
      // 已經認定是左右滑：不要同時上下捲
      if (e.cancelable) e.preventDefault()
      if (!still) place(canGo(dx < 0 ? -1 : 1) ? dx : dx * 0.2, 0)
    }
    const end = (e: TouchEvent) => {
      release()
      if (!live) return
      live = false
      const t = e.changedTouches[0]
      const dir = locked || still ? swipeDone(t.clientX - x, t.clientY - y, Date.now() - at, el.clientWidth) : 0
      if (!dir || !canGo(dir)) return place(0, shifted ? 200 : 0)
      if (still) return onSwipe(dir)
      // 先整頁滑出去，再換分頁（新的那一頁會從另一邊滑進來）
      place(dir * el.clientWidth, 150)
      leaving = window.setTimeout(() => { leaving = 0; onSwipe(dir) }, 150)
    }
    const stop = () => {
      release()
      live = false
      if (shifted && !leaving) place(0, 200)
    }
    el.addEventListener('touchstart', start, { passive: true })
    return () => {
      release()
      // 滑出去到一半就被拆掉（換頁的計時還沒到）：直接換過去，不要把頁面留在畫面外
      if (leaving) { clearTimeout(leaving); leaving = 0; place(0, 0) }
      else if (shifted) place(0, 0)
      el.removeEventListener('touchstart', start)
    }
  }, [el, canGo, onSwipe])
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
