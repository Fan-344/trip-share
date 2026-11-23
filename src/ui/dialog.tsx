// 自己畫的彈跳視窗：確認（是／否）與輸入一行字。取代瀏覽器內建的 confirm、prompt——
// 內建的樣子跟整個 App 不搭，而且加到主畫面後在某些手機上會直接不顯示。
//
// 用法：if (await confirmBox({ title: '刪除？', danger: true })) …
//       const name = await promptBox({ title: '欄位名稱' })   // 取消是 null
import { useEffect, useState } from 'preact/hooks'
import { Icon } from './Icons'
import { Overlay, useScrollLock } from './kit'

interface ConfirmOptions {
  title: string
  /** 補充說明，一兩句。 */
  body?: string
  /** 確定鈕上的字，預設「確定」。 */
  ok?: string
  /** 刪除、移出這類收不回來的動作：確定鈕用紅色，並配垃圾桶圖。 */
  danger?: boolean
}

interface PromptOptions {
  title: string
  value?: string
  placeholder?: string
  ok?: string
}

type Open =
  | ({ kind: 'confirm'; done: (v: boolean) => void } & ConfirmOptions)
  | ({ kind: 'prompt'; done: (v: string | null) => void } & PromptOptions)

let show: (d: Open | null) => void = () => {}

export const confirmBox = (o: ConfirmOptions): Promise<boolean> =>
  new Promise((resolve) => show({ kind: 'confirm', ...o, done: resolve }))

export const promptBox = (o: PromptOptions): Promise<string | null> =>
  new Promise((resolve) => show({ kind: 'prompt', ...o, done: resolve }))

/** 放在 App 最外層一次就好；平常不畫任何東西。 */
export function DialogHost() {
  const [open, setOpen] = useState<Open | null>(null)
  useEffect(() => {
    show = setOpen
    return () => { show = () => {} }
  }, [])
  if (!open) return null
  return <Box key={open.title} open={open} close={() => setOpen(null)} />
}

function Box({ open, close }: { open: Open; close: () => void }) {
  const [text, setText] = useState(open.kind === 'prompt' ? open.value ?? '' : '')
  useScrollLock()
  const cancel = () => {
    if (open.kind === 'confirm') open.done(false)
    else open.done(null)
    close()
  }
  const accept = () => {
    if (open.kind === 'confirm') open.done(true)
    else if (!text.trim()) return
    else open.done(text.trim())
    close()
  }
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      // 只接 Esc。Enter 交給有焦點的按鈕：確認視窗一開焦點在「取消」，手滑按到 Enter 不會誤刪。
      if (e.key === 'Escape') cancel()
    }
    addEventListener('keydown', f)
    return () => removeEventListener('keydown', f)
  })
  const danger = open.kind === 'confirm' && open.danger
  return (
    <Overlay>
      <div class="dialog-wrap" role="alertdialog" aria-modal="true" aria-label={open.title} onClick={cancel}>
        <form class="dialog" aria-label={open.title} onClick={(e) => e.stopPropagation()}
          onSubmit={(e) => { e.preventDefault(); accept() }}>
          <div class={`dialog-icon ${danger ? 'danger' : ''}`}><Icon id={danger ? 'trash' : open.kind === 'prompt' ? 'pencil' : 'bell'} size={34} /></div>
          <h3>{open.title}</h3>
          {open.kind === 'confirm' && open.body && <p class="muted">{open.body}</p>}
          {open.kind === 'prompt' && (
            <input ref={(el) => el?.focus()} value={text} placeholder={open.placeholder}
              onInput={(e) => setText((e.target as HTMLInputElement).value)} />
          )}
          <div class="dialog-actions">
            <button type="button" ref={(el) => { if (open.kind === 'confirm') el?.focus() }} onClick={cancel}>取消</button>
            <button class={danger ? 'danger' : 'primary'} disabled={open.kind === 'prompt' && !text.trim()}>{open.ok ?? '確定'}</button>
          </div>
        </form>
      </div>
    </Overlay>
  )
}
