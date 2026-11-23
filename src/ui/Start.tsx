// 進入行程之前的畫面：加到主畫面的引導、暱稱、加入、首頁。
import { useEffect, useState } from 'preact/hooks'
import { currentPlatform, needsInstall, registerServiceWorker } from '../pwa'
import { Registry, acceptInvite, createTrip, parseInvite, renameEverywhere, type Invite } from '../store/local'
import { THEMES } from '../themes'
import { fullDay } from '../time'
import { Art } from './Art'
import { BAGS, defaultLook } from '../avatar'
import { Pile } from './Figure'
import { BackupCard, Recover } from './Backup'
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
      {applyUpdate && (
        <div class="banner">
          <span class="grow">有新版本</span>
          <button class="small primary" onClick={applyUpdate}>點此更新</button>
        </div>
      )}
      <Routes reg={reg} hash={hash} />
    </div>
  )
}

/** 只在開發版有：#/themes 一次看完所有主題的插畫與配色，改圖時用。 */
function ThemeGallery() {
  return (
    <div class="page top">
      <h1>佈景主題一覽</h1>
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
          <h2>{t.name}<span class="muted">{t.id}・{t.hint}</span></h2>
          <div class="card hero"><Art theme={t.id} /><div class="body"><button class="primary small">按鈕</button></div></div>
        </div>
      ))}
    </div>
  )
}

function Routes({ reg, hash }: { reg: Registry; hash: string }) {
  useDocs([reg.ydoc])
  if (import.meta.env.DEV && hash === '#/themes') return <ThemeGallery />
  const me = reg.me()
  const wantsJoin = /^#\/?join/i.test(hash)
  if (!me) return <div><Nickname invited={wantsJoin} onSave={(n) => reg.setNickname(n)} /><div class="page" style="padding-top:0"><Recover reg={reg} /></div></div>
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
 * iPhone／iPad 用 Safari 開啟時，在首頁建議加到主畫面。只是建議，可以關掉、不擋任何功能。
 * 主畫面 App 的資料和 Safari 是分開的，所以一併說明加了之後要怎麼把行程帶過去。
 */
function InstallHint() {
  const [open, setOpen] = useState(false)
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HINT_KEY) === '1'
    } catch {
      return false
    }
  })
  if (hidden || !needsInstall(currentPlatform())) return null
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
        Safari 會清掉 7 天沒開的資料；加到主畫面才會一直留著。
      </p>
      {open ? (
        <ol class="steps">
          <li>點 Safari 的「分享」。</li>
          <li>選「加入主畫面」。</li>
          <li>從主畫面打開，重新取暱稱。</li>
          <li>到行程「更多」複製邀請連結，在主畫面的 App 按「貼上邀請」。</li>
        </ol>
      ) : (
        <button class="small" onClick={() => setOpen(true)}>怎麼加</button>
      )}
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
      <InstallHint />
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
