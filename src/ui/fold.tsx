// 折疊：把次要的內容收起來，手機上不用一直往下捲。
import type { ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'
import { Icon } from './Icons'

/**
 * 會記住的開關狀態（存在這支手機的瀏覽器裡，不同步）。
 * key 給空字串就只在這次開啟期間記得。
 */
export function useStored(key: string, initial: boolean): [boolean, (v: boolean) => void] {
  const [open, setOpen] = useState(() => {
    if (!key) return initial
    try {
      const v = localStorage.getItem(`fold:${key}`)
      return v === null ? initial : v === '1'
    } catch {
      return initial
    }
  })
  return [open, (v) => {
    setOpen(v)
    if (!key) return
    try {
      localStorage.setItem(`fold:${key}`, v ? '1' : '0')
    } catch {
      // 存不了就只在這次記得
    }
  }]
}

/** 向下的箭頭；展開時轉成向上。 */
export function Chevron({ open }: { open: boolean }) {
  return <Icon id="chevron" size={18} cls={`chev ${open ? 'open' : ''}`} />
}

/**
 * 一個可以收合的區塊：標題列永遠看得到，點一下展開或收起內容。
 * summary 是收起來時顯示在標題旁邊的摘要（例如「12 筆」）。
 */
export function Fold({ title, summary, open: initial = false, storeKey = '', children }: {
  title: string
  summary?: ComponentChildren
  open?: boolean
  storeKey?: string
  children: ComponentChildren
}) {
  const [open, setOpen] = useStored(storeKey, initial)
  return (
    <section class="fold">
      <button type="button" class="foldhead" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span class="dot" />
        <b class="grow">{title}</b>
        {summary !== undefined && <span class="muted">{summary}</span>}
        <Chevron open={open} />
      </button>
      {open && <div class="foldbody">{children}</div>}
    </section>
  )
}
