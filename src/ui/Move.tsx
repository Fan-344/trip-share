// 搬家：把身分和行程從 Safari 帶到主畫面的 App（或另一個瀏覽器），還是同一個人。見 store/move.ts。
import { useEffect, useState } from 'preact/hooks'
import type { Registry } from '../store/local'
import { applyMove, createMove, moveReplaces, parseMove, type MoveResult } from '../store/move'
import { confirmBox } from './dialog'
import { Fold } from './fold'
import { Icon } from './Icons'
import { CopyButton, value } from './kit'

/**
 * 複製搬家碼。搬家碼要先讀過每份行程才做得出來，所以畫面一出現就先準備好；
 * iPhone 只准在按下按鈕的當下寫剪貼簿，等不了。
 */
export function MoveOut({ reg }: { reg: Registry }) {
  const [code, setCode] = useState('')
  useEffect(() => {
    let gone = false
    void createMove(reg).then((c) => { if (!gone) setCode(c) }).catch(() => {})
    return () => { gone = true }
  }, [])
  if (!code) return <button class="primary" disabled>準備中…</button>
  return <CopyButton text={code} label="複製搬家碼" />
}

/** 貼上搬家碼。這裡已經有別的身分時先問過才換。 */
export function MoveIn({ reg, primary = false }: { reg: Registry; primary?: boolean }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<MoveResult | null>(null)

  const use = async (raw: string, notFound: string) => {
    const data = parseMove(raw)
    if (!data) return setError(notFound)
    setError('')
    if (moveReplaces(reg, data)) {
      const ok = await confirmBox({
        title: `換回「${data.me.nickname}」原本的身分？`,
        body: '這裡現在的身分會換掉；它在同一份行程裡的那個成員會從名單拿掉，它的私人清單勾選和訂位代號不會留下。',
        ok: '換回原本的身分',
      })
      if (!ok) return
    }
    setBusy(true)
    try {
      setDone(await applyMove(reg, data))
      setText('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '沒有成功，請再試一次。')
    }
    setBusy(false)
  }

  if (done) {
    return (
      <p class="row">
        <Icon id="check" size={20} />
        <span>
          {done.identity === 'same' ? '這裡本來就是同一個身分。' : '搬好了，還是原本的你。'}
          {done.trips > 0 && `帶來 ${done.trips} 份行程，打開後會同步內容。`}
          {done.cleaned > 0 && '多出來的那個成員已經從名單拿掉。'}
        </span>
      </p>
    )
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); void use(text, '這不是搬家碼，請確認貼上的是完整的一段。') }}>
      {/* 讀剪貼簿一定要由使用者按按鈕觸發；iPhone 會再跳一次「貼上」讓人確認。 */}
      <button type="button" class={primary ? 'primary block' : 'block'} disabled={busy} onClick={async () => {
        try {
          await use(await navigator.clipboard.readText(), '剪貼簿裡沒有搬家碼。請先在原本的地方按「複製搬家碼」。')
        } catch {
          setError('讀不到剪貼簿。請在下面的格子長按、選「貼上」。')
        }
      }}>{busy ? '搬家中…' : '貼上搬家碼'}</button>
      <div class="row" style="margin-top:10px">
        <input class="grow" value={text} onInput={(e) => setText(value(e))} placeholder="或把搬家碼貼在這裡" />
        <button disabled={!text.trim() || busy}>搬家</button>
      </div>
      {error && <p class="muted">{error}</p>}
    </form>
  )
}

/** 首頁的搬家區：這裡複製、那裡貼上。 */
export function MoveCard({ reg }: { reg: Registry }) {
  return (
    <Fold title="搬家" summary="換到主畫面 App">
      <div class="card flat">
        <b>從這裡搬出去</b>
        <p class="muted">
          複製搬家碼，到主畫面的 App（或另一個瀏覽器）貼上，就還是同一個人，行程也會跟過去。
          <b>搬家碼等於你的身分，不要傳給別人。</b>
        </p>
        <MoveOut reg={reg} />
      </div>
      <div class="card flat">
        <b>搬到這裡</b>
        <p class="muted">在原本的地方複製搬家碼之後，到這裡貼上。</p>
        <MoveIn reg={reg} />
      </div>
    </Fold>
  )
}
