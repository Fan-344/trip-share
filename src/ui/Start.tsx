// 進入行程之前的畫面：加到主畫面的引導、暱稱、加入、首頁。
import { useEffect, useState } from 'preact/hooks'
import { canInstall, currentPlatform, needsInstall, registerServiceWorker } from '../pwa'
import { Registry, acceptInvite, createTrip, parseInvite, renameEverywhere, type Invite } from '../store/local'
import { THEMES, type ThemeId } from '../themes'
import type { WxKind } from '../weather'
import { fullDay } from '../time'
import { Art, type Phase } from './Art'
import { BAGS, defaultLook } from '../avatar'
import { Pile } from './Figure'
import { BackupCard, Recover } from './Backup'
import { InstallGuide, MoveCard, MoveIn } from './Move'
import { Fold } from './fold'
import { Icon } from './Icons'
import { Mascot } from './Mascot'
import { DialogHost } from './dialog'
import { Field, PasteInvite, Sheet, useDocs, useHash, value } from './kit'
import { TripPage } from './TripPage'

/** 打包時間，由 vite.config.ts 帶入；用來確認手機拿到的是不是最新版。 */
declare const __BUILD__: string
export const BUILD = __BUILD__

export function App() {
  const [reg, setReg] = useState<Registry | null>(null)
  useEffect(() => void Registry.open().then(setReg), [])
  const hash = useHash()
  const [applyUpdate, setApplyUpdate] = useState<(() => void) | null>(null)
  useEffect(() => registerServiceWorker((apply) => setApplyUpdate(() => apply)), [])
  if (!reg) return <p class="page top muted">載入中…</p>
  return (
    <div>
      <DialogHost />
      {applyUpdate && <UpdateBanner onApply={applyUpdate} />}
      <Routes reg={reg} hash={hash} />
    </div>
  )
}

/**
 * 「有新版本」的提示。固定黏在畫面最上面，捲到哪都看得到。
 * 行程頁的選單本來也黏在最上面，所以把提示的高度記在 --banner-h，讓選單改成黏在提示的下面。
 */
function UpdateBanner({ onApply }: { onApply: () => void }) {
  const [el, setEl] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!el) return
    const root = document.documentElement
    root.style.setProperty('--banner-h', `${el.offsetHeight}px`)
    root.classList.add('has-banner')
    return () => {
      root.style.removeProperty('--banner-h')
      root.classList.remove('has-banner')
    }
  }, [el])
  return (
    <div class="banner" ref={setEl}>
      <span class="grow">有新版本</span>
      <button class="small primary" onClick={onApply}>點此更新</button>
    </div>
  )
}

/** 只在開發版有：#/themes 一次看完所有主題的插畫與配色，改圖時用。 */
function ThemeGallery() {
  // 開發用：可以切換白天、黃昏、夜晚看每張主圖
  const [phase, setPhase] = useState<Phase>('day')
  return (
    <div class="page top">
      <h1>佈景主題一覽</h1>
      <div class="seg" style="position:sticky;top:8px;z-index:5">{(['day', 'dusk', 'night'] as const).map((p) => <button key={p} class={p === phase ? 'on' : ''} onClick={() => setPhase(p)}>{p}</button>)}</div>
      {/* 行李堆：一到五件各一種擺法。上排有人沒收好，下排全部收好 */}
      <h2>行李堆<span class="muted">一到五件</span></h2>
      {[false, true].map((packed) => (
        <div class="card row" key={String(packed)} style="justify-content:space-around;align-items:flex-end">
          {[1, 2, 3, 4, 5].map((n) => (
            <Pile key={n} stage="go" size={48}
              cast={Array.from({ length: n }, (_, i) => ({ look: { ...defaultLook(`m${i}`), bag: BAGS[(i * 3) % BAGS.length] }, packed: packed || i % 2 === 0 }))} />
          ))}
        </div>
      ))}
      {THEMES.map((t) => (
        <div key={t.id} style={`--accent:${t.accent};--accent-l:color-mix(in srgb, ${t.accent} 30%, white)`}>
          <h2><Mascot theme={t.id} size={40} />{t.name}<span class="muted">{t.id}・{t.hint}</span>{t.motifs.map((m) => <Icon key={m} id={m} size={26} />)}</h2>
          <div class="card hero"><Art theme={t.id} phase={phase} /><div class="body"><button class="primary small">按鈕</button></div></div>
        </div>
      ))}
    </div>
  )
}

/** 天氣的名稱（範本檢視用）。 */
const WX_NAMES: [WxKind, string][] = [
  ['clear', '晴'], ['partly', '晴時多雲'], ['cloudy', '陰'], ['fog', '霧'],
  ['rain', '雨'], ['storm', '雷雨'], ['snow', '雪'], ['mix', '雨夾雪'],
]

/** 只在開發版有：#/weather 一個主題的所有天氣並排，可以切主題和白天黃昏夜晚。 */
function WeatherGallery() {
  const [phase, setPhase] = useState<Phase>('day')
  const [theme, setTheme] = useState<ThemeId>(THEMES[0].id)
  return (
    <div class="page top">
      <h1>天氣範本</h1>
      <div style="position:sticky;top:8px;z-index:5;display:grid;gap:6px">
        <select value={theme} onChange={(e) => setTheme((e.target as HTMLSelectElement).value as ThemeId)}>
          {THEMES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <div class="seg">{(['day', 'dusk', 'night'] as const).map((p) => <button key={p} class={p === phase ? 'on' : ''} onClick={() => setPhase(p)}>{p}</button>)}</div>
      </div>
      {WX_NAMES.map(([k, name]) => (
        <div key={k}>
          <h2>{name}<span class="muted">{k}</span></h2>
          <div class="card hero"><Art theme={theme} phase={phase} weather={k} /></div>
        </div>
      ))}
    </div>
  )
}

function Routes({ reg, hash }: { reg: Registry; hash: string }) {
  useDocs([reg.ydoc])
  if (import.meta.env.DEV && hash === '#/themes') return <ThemeGallery />
  if (import.meta.env.DEV && hash === '#/weather') return <WeatherGallery />
  const me = reg.me()
  const wantsJoin = /^#\/?join/i.test(hash)
  if (!me) return <div><Nickname invited={wantsJoin} onSave={(n) => reg.setNickname(n)} /><div class="page" style="padding-top:0"><FirstRunHelp reg={reg} /><Recover reg={reg} /></div></div>
  if (wantsJoin) {
    const invite = parseInvite(hash)
    if (invite) return <Join reg={reg} invite={invite} />
    return (
      <div class="page top">
        <h1>邀請連結不完整</h1>
        <p>連結不完整。請對方重新複製，或把整段貼在下面。</p>
        <PasteInvite />
        <p><a href="#">回首頁</a></p>
      </div>
    )
  }
  const m = hash.match(/^#\/t\/([^/]+)(?:\/(\w+))?$/)
  return m ? <TripPage key={m[1]} reg={reg} tripId={m[1]} tab={m[2] ?? 'home'} /> : <Home reg={reg} />
}

const cardTheme = (id: string | undefined) => THEMES.find((t) => t.id === id) ?? THEMES[0]

/**
 * 開發用的範例行程。檔案放在 src/dev/*.local.ts，不進版本庫（裡面可以是真實行程），
 * 正式打包時沒有這些檔案，按鈕就不會出現。
 */
const seeds: [string, () => Promise<{ seed: (reg: Registry) => Promise<string> }>][] = import.meta.env.DEV
  ? Object.entries(import.meta.glob<{ seed: (reg: Registry) => Promise<string> }>('../dev/*.local.ts'))
      .map(([path, load]) => [path.replace(/^.*\/|\.local\.ts$/g, ''), load])
  : []

const HINT_KEY = 'installHintDismissed'

/**
 * 手機上用瀏覽器開啟時，在首頁建議加到主畫面。只是建議，可以關掉、不擋任何功能；
 * 關掉之後，同一份指引在下面的「搬家」裡還找得到。
 */
function InstallHint({ reg }: { reg: Registry }) {
  const [open, setOpen] = useState(false)
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HINT_KEY) === '1'
    } catch {
      return false
    }
  })
  const p = currentPlatform()
  if (hidden || !canInstall(p)) return null
  const dismiss = () => {
    try {
      localStorage.setItem(HINT_KEY, '1')
    } catch {
      // 存不了就只在這次關掉。
    }
    setHidden(true)
  }
  return (
    <div class="card flat" style="background:var(--mizu-l)">
      <div class="row">
        <b class="grow">建議加到主畫面</b>
        <button class="small ghost" aria-label="不再顯示" onClick={dismiss}><Icon id="close" size={16} /></button>
      </div>
      <p class="muted">
        {needsInstall(p) ? '瀏覽器 7 天沒開會把資料清掉；加到主畫面才會一直留著。' : '加到主畫面比較好找，沒網路也開得起來。'}
      </p>
      {open ? <InstallGuide reg={reg} withMove /> : <button class="small" onClick={() => setOpen(true)}>怎麼加</button>}
    </div>
  )
}

/**
 * 第一次打開（還沒有身分）時的兩張說明：
 * - iPhone 上用瀏覽器開的：建議先加到主畫面再開始。現在還沒有資料，先加就不用之後再搬家。
 * - 已經在別的地方用過的人：貼上搬家碼就不用重新取暱稱、重新加入。主畫面的 App 第一次打開就是這個情況。
 */
function FirstRunHelp({ reg }: { reg: Registry }) {
  const p = currentPlatform()
  return (
    <div>
      {needsInstall(p) && (
        <div class="card flat" style="margin-top:24px;background:var(--mizu-l)">
          <b>建議先加到主畫面再開始</b>
          <p class="muted">瀏覽器 7 天沒開會把資料清掉。現在先加到主畫面，之後就不用搬家。</p>
          <InstallGuide reg={reg} withMove={false} />
        </div>
      )}
      <div class="card flat" style="margin-top:24px">
        <b>{p.standalone ? '之前在瀏覽器用過？' : '之前在別的地方用過？'}</b>
        {p.standalone ? (
          <ol class="steps">
            <li>先不要取暱稱。回到原本用的瀏覽器（Safari 或 Chrome），打開 All Aboard 的首頁。</li>
            <li>打開「搬家」，按「複製搬家碼」。</li>
            <li>回到這裡，按下面的按鈕，就還是原本的你。</li>
          </ol>
        ) : (
          <p class="muted">先不要取暱稱。在原本的地方打開「搬家」、按「複製搬家碼」，再回來貼上，就還是原本的你。</p>
        )}
        <MoveIn reg={reg} />
      </div>
    </div>
  )
}

function Nickname({ invited, onSave }: { invited: boolean; onSave: (n: string) => void }) {
  const [n, setN] = useState('')
  return (
    <form class="page top" onSubmit={(e) => { e.preventDefault(); if (n.trim()) onSave(n.trim()) }}>
      <h1>{invited ? '你收到一份行程邀請' : '歡迎'}</h1>
      <p>{invited ? '取個暱稱就能加入。' : '先取個暱稱。'}</p>
      <Field label="你的暱稱">
        <input value={n} onInput={(e) => setN(value(e))} placeholder="例如：爸爸" />
      </Field>
      <button class="primary block" disabled={!n.trim()}>開始</button>
      <p class="muted">不用註冊；資料加密後只同步給你邀請的人。</p>
    </form>
  )
}

function Join({ reg, invite }: { reg: Registry; invite: Invite }) {
  const [error, setError] = useState('')
  useEffect(() => {
    try {
      acceptInvite(reg, invite)
      // 用 replace：金鑰不留在瀏覽紀錄裡。
      location.replace(`#/t/${invite.id}`)
    } catch (e) {
      setError(String((e as Error).message))
    }
  }, [invite.id, invite.key])
  return (
    <div class="page top">
      {error ? <div class="card"><h1>沒辦法加入</h1><p>{error}</p><p><a href="#">回首頁</a></p></div> : <p>加入中…</p>}
    </div>
  )
}

function Home({ reg }: { reg: Registry }) {
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const trips = reg.trips()
  return (
    <div class="page top">
      <div class="row">
        <h1 class="grow">我的行程</h1>
        {/* 點自己的名字可以改顯示名稱 */}
        <button class="small" aria-label="更改顯示名稱" onClick={() => setRenaming(true)}>{reg.me()!.nickname}<Icon id="pencil" size={14} /></button>
      </div>
      <InstallHint reg={reg} />
      {trips.length === 0 && <p class="empty">還沒有行程。</p>}
      {trips.map((t) => (
        <a class="card tap tripcard" key={t.id} href={`#/t/${t.id}`}>
          {/* 行程卡用它上次開啟時的主題上色 */}
          <Mascot theme={cardTheme(t.theme).id} size={50} />
          <span class="grow">
            <b style="display:block;font-size:1.05rem">{t.title}</b>
            <span class="muted">
              {t.startDate && t.endDate ? `${t.startDate.slice(0, 4)}　${fullDay(t.startDate)} ～ ${fullDay(t.endDate)}` : '同步中…'}
            </span>
          </span>
        </a>
      ))}
      <button class="primary block" onClick={() => setCreating(true)}><Icon id="plus" size={18} />建立行程</button>
      {seeds.map(([name, load]) => (
        <button class="add" key={name} onClick={async () => { location.hash = `#/t/${await (await load()).seed(reg)}` }}>
          開發用：載入範例（{name}）
        </button>
      ))}

      <Fold key={String(trips.length === 0)} title="加入別人的行程" open={trips.length === 0}>
      <PasteInvite />
      </Fold>

      <MoveCard reg={reg} />

      <BackupCard reg={reg} />

      <p class="muted center" style="margin-top:32px">版本 {BUILD}</p>
      {creating && <CreateTrip reg={reg} onClose={() => setCreating(false)} />}
      {renaming && <RenameSheet reg={reg} onClose={() => setRenaming(false)} />}
    </div>
  )
}

function CreateTrip({ reg, onClose }: { reg: Registry; onClose: () => void }) {
  const [f, setF] = useState({ title: '', startDate: '', endDate: '' })
  const ok = f.title.trim() && f.startDate && f.endDate && f.startDate <= f.endDate
  return (
    <Sheet title="建立行程" onClose={onClose}>
      <form onSubmit={async (e) => {
        e.preventDefault()
        if (!ok) return
        location.hash = `#/t/${await createTrip(reg, { ...f, title: f.title.trim() })}`
      }}>
        <Field label="行程名稱">
          <input value={f.title} onInput={(e) => setF({ ...f, title: value(e) })} placeholder="例如：清邁親子旅行" />
        </Field>
        <div class="two">
          <Field label="出發日">
            <input type="date" value={f.startDate} onInput={(e) => setF({ ...f, startDate: value(e), endDate: f.endDate || value(e) })} />
          </Field>
          <Field label="回程日">
            <input type="date" value={f.endDate} min={f.startDate} onInput={(e) => setF({ ...f, endDate: value(e) })} />
          </Field>
        </div>
        <div class="actions">
          <button class="primary" disabled={!ok}>建立</button>
        </div>
      </form>
    </Sheet>
  )
}

/** 更改顯示名稱：改完會套用到這支手機上的每一份行程。 */
function RenameSheet({ reg, onClose }: { reg: Registry; onClose: () => void }) {
  const old = reg.me()!.nickname
  const [name, setName] = useState(old)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<number | null>(null)
  const trips = reg.trips().length
  return (
    <Sheet title="更改顯示名稱" onClose={onClose}>
      {done !== null ? (
        <div>
          <p class="row"><Icon id="check" size={22} />已經改成「{name.trim()}」。</p>
          <p class="muted">
            {done > 0
              ? `${done} 份行程裡你的名字也改了。其他人會在你下次打開那份行程、同步之後看到新名字。`
              : '之後建立或加入的行程都會用這個名字。'}
          </p>
          <div class="actions"><button class="primary" onClick={onClose}>完成</button></div>
        </div>
      ) : (
        <form onSubmit={async (e) => {
          e.preventDefault()
          const n = name.trim()
          if (!n || n === old || busy) return
          setBusy(true)
          setDone(await renameEverywhere(reg, n))
        }}>
          <Field label="顯示名稱"><input value={name} onInput={(e) => setName(value(e))} /></Field>
          <p class="muted">
            其他成員看到的名字。
            {trips > 0 && `會一起改掉這支手機上 ${trips} 份行程裡的名字。`}
          </p>
          <div class="actions">
            <button class="primary" disabled={!name.trim() || name.trim() === old || busy}>{busy ? '修改中…' : '儲存'}</button>
          </div>
        </form>
      )}
    </Sheet>
  )
}
