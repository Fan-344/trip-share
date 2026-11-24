// 搬家：把身分和行程從 Safari 帶到主畫面的 App（或另一個瀏覽器），還是同一個人。見 store/move.ts。
import { useEffect, useState } from 'preact/hooks'
import type { Registry } from '../store/local'
import { applyMove, createMove, moveReplaces, parseMove, type MoveResult } from '../store/move'
import { canInstall, currentPlatform, installSteps } from '../pwa'
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
      }}>{busy ? '搬家中…' : '從剪貼簿貼上'}</button>
      <div class="row" style="margin-top:10px">
        <input class="grow" value={text} onInput={(e) => setText(value(e))} placeholder="或把搬家碼貼在這裡" />
        <button disabled={!text.trim() || busy}>搬家</button>
      </div>
      {error && <p class="muted">{error}</p>}
    </form>
  )
}

/**
 * 加到主畫面的指引：一步一步，照這支手機和這個瀏覽器給。
 * iPhone 上瀏覽器和主畫面 App 的資料是分開的，所以這裡已經有資料時（withMove），
 * 第一步先複製搬家碼，最後一步是到主畫面的 App 貼上；沒有資料就只教怎麼加。
 * Android 裝起來的 App 和瀏覽器共用資料，不用搬。
 */
export function InstallGuide({ reg, withMove }: { reg: Registry; withMove: boolean }) {
  const p = currentPlatform()
  const steps = installSteps(p)
  if (steps.length === 0) return null
  const move = withMove && p.ios
  return (
    <ol class="steps">
      {move && <li>先把資料帶著走：<MoveOut reg={reg} /></li>}
      {steps.map((s) => <li key={s}>{s}</li>)}
      {p.ios && (
        <li>
          回主畫面打開 All Aboard。
          {move ? '不要取新的暱稱，直接按「從剪貼簿貼上」，就還是原本的你。' : '取個暱稱就能開始用。'}
        </li>
      )}
      {p.android && <li>從主畫面打開，資料都還在，不用搬。</li>}
    </ol>
  )
}

/**
 * 首頁的搬家區。照現在是在哪裡開的，只講這裡該做的事：
 * - 用瀏覽器開的（手機）：主要是「搬到主畫面的 App」，一步一步帶；另外可以從別處搬進來。
 * - 從主畫面開的：主要是「從瀏覽器搬過來」（貼上）；另外可以搬去別的地方。
 * - 電腦：沒有主畫面，就是搬出去和搬進來兩件事。
 */
export function MoveCard({ reg }: { reg: Registry }) {
  const p = currentPlatform()
  const warn = <b>搬家碼等於你的身分，不要傳給別人。</b>
  if (p.standalone) {
    return (
      <Fold title="搬家" summary="從瀏覽器搬過來">
        <div class="card flat">
          <b>從瀏覽器搬過來</b>
          <ol class="steps">
            <li>回到原本用的瀏覽器（Safari 或 Chrome），打開 All Aboard 的首頁。</li>
            <li>打開「搬家」，按「複製搬家碼」。</li>
            <li>回到這裡，按下面的按鈕。</li>
          </ol>
          <MoveIn reg={reg} primary />
        </div>
        <div class="card flat">
          <b>搬到別的地方</b>
          <p class="muted">換手機或想在另一個瀏覽器用：在這裡複製，到那邊的「搬家」貼上。{warn}</p>
          <MoveOut reg={reg} />
        </div>
      </Fold>
    )
  }
  const phone = canInstall(p)
  return (
    <Fold title="搬家" summary={phone ? '搬到主畫面 App' : undefined}>
      {phone && (
        <div class="card flat">
          <b>搬到主畫面的 App</b>
          <p class="muted">
            {p.ios ? '瀏覽器 7 天沒開會把資料清掉，加到主畫面才會一直留著。主畫面的 App 和瀏覽器的資料是分開的，照下面做，身分和行程會一起過去。' : '加到主畫面比較好找，沒網路也開得起來。'}
            {p.ios && warn}
          </p>
          <InstallGuide reg={reg} withMove />
        </div>
      )}
      {!phone && (
        <div class="card flat">
          <b>搬到別的地方</b>
          <p class="muted">換裝置或換瀏覽器：在這裡複製，到那邊的「搬家」貼上，就還是同一個人，行程也會跟過去。{warn}</p>
          <MoveOut reg={reg} />
        </div>
      )}
      <div class="card flat">
        <b>從別的地方搬到這裡</b>
        <p class="muted">在原本的地方按「複製搬家碼」，再到這裡貼上。</p>
        <MoveIn reg={reg} />
      </div>
    </Fold>
  )
}
