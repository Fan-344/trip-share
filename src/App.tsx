// 驗證資料模型與本機儲存用的最簡畫面，不是正式介面。
import { useEffect, useState } from 'preact/hooks'
import type * as Y from 'yjs'
import type { Trip } from './model/trip'
import type { HistoryEntry, ListKind } from './model/types'
import { Registry, acceptInvite, createTrip, inviteLink, openTrip, parseInvite, type OpenTrip } from './store/local'
import { currentPlatform, needsInstall, registerServiceWorker } from './pwa'

/** 打包時間，由 vite.config.ts 帶入；用來確認手機拿到的是不是最新版。 */
declare const __BUILD__: string
import type { TripSync } from './sync/engine'

/** 文件有任何改動（本機或之後同步進來的）就重畫。 */
function useDocs(docs: Y.Doc[]) {
  const [, set] = useState(0)
  useEffect(() => {
    const f = () => set((n) => n + 1)
    docs.forEach((d) => d.on('update', f))
    return () => docs.forEach((d) => d.off('update', f))
  }, docs)
}

function useHash(): string {
  const [hash, set] = useState(location.hash)
  useEffect(() => {
    const f = () => set(location.hash)
    addEventListener('hashchange', f)
    return () => removeEventListener('hashchange', f)
  }, [])
  return hash
}

const value = (e: Event) => (e.target as HTMLInputElement).value

export function App() {
  const [reg, setReg] = useState<Registry | null>(null)
  useEffect(() => void Registry.open().then(setReg), [])
  const hash = useHash()
  const [applyUpdate, setApplyUpdate] = useState<(() => void) | null>(null)
  useEffect(() => registerServiceWorker((apply) => setApplyUpdate(() => apply)), [])
  if (!reg) return <p>載入中…</p>
  return (
    <div>
      {applyUpdate && (
        <div class="banner">
          有新版本
          <button onClick={applyUpdate}>點此更新</button>
        </div>
      )}
      <Loaded reg={reg} hash={hash} />
    </div>
  )
}

/** iPhone／iPad 還沒加到主畫面時顯示。資料要存在主畫面的 App 裡，所以這裡不讓人建立或加入行程。 */
function InstallGuide({ hasInvite }: { hasInvite: boolean }) {
  return (
    <div>
      <h1>先把它加到主畫面</h1>
      <p>
        iPhone 會自動清掉 7 天沒開的網頁資料。加到主畫面之後，行程才會一直留在手機裡，沒網路也打得開。
      </p>
      <ol class="steps">
        {hasInvite && (
          <li>
            先複製邀請，等一下要用：<br />
            <CopyButton text={location.href} label="複製邀請" />
          </li>
        )}
        <li>點 Safari 下方的「分享」按鈕（方框加向上箭頭）。</li>
        <li>往下找到「加入主畫面」，按「加入」。</li>
        <li>回到主畫面，打開「旅遊共編」。</li>
        {hasInvite && <li>在 App 裡按「貼上邀請」。</li>}
      </ol>
      <p class="muted">
        找不到「加入主畫面」？你可能是在 LINE 或其他 App 裡打開的。請點右上角或右下角的選單，選「用 Safari 開啟」再試一次。
      </p>
    </div>
  )
}

function Loaded({ reg, hash }: { reg: Registry; hash: string }) {
  useDocs([reg.ydoc])
  const me = reg.me()
  const wantsJoin = /^#\/?join/i.test(hash)
  if (needsInstall(currentPlatform())) return <InstallGuide hasInvite={wantsJoin} />
  if (!me) return <Nickname invited={wantsJoin} onSave={(n) => reg.setNickname(n)} />
  if (wantsJoin) {
    const invite = parseInvite(hash)
    if (invite) return <Join reg={reg} id={invite.id} tripKey={invite.key} />
    return (
      <div>
        <h1>邀請連結不完整</h1>
        <p>連結可能在傳送時被截斷。請對方按「複製邀請連結」重新傳一次，或把整段連結貼在下面。</p>
        <PasteInvite />
        <p><a href="#">回首頁</a></p>
      </div>
    )
  }
  const tripId = hash.match(/^#\/t\/(.+)$/)?.[1]
  return tripId ? <TripPage key={tripId} reg={reg} tripId={tripId} /> : <Home reg={reg} />
}

/** 貼上邀請連結加入：連結點不開、或被通訊軟體改過時的備用入口。 */
function PasteInvite() {
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
      <p>
        {/* 讀剪貼簿一定要由使用者按按鈕觸發；iPhone 會再跳一次「貼上」讓人確認。 */}
        <button type="button" onClick={async () => {
          try {
            join(await navigator.clipboard.readText(), '剪貼簿裡沒有邀請連結。請先在邀請連結的頁面按「複製邀請」。')
          } catch {
            setError('讀不到剪貼簿。請在下面的格子長按、選「貼上」。')
          }
        }}>貼上邀請</button>
      </p>
      <input value={text} onInput={(e) => setText(value(e))} placeholder="或把邀請連結貼在這裡" style="width:70%" />
      <button disabled={!text.trim()}>加入</button>
      {error && <div class="muted">{error}</div>}
    </form>
  )
}

function Join({ reg, id, tripKey }: { reg: Registry; id: string; tripKey: string }) {
  const [error, setError] = useState('')
  useEffect(() => {
    try {
      acceptInvite(reg, id, tripKey)
      // 用 replace：金鑰不留在瀏覽紀錄裡。
      location.replace(`#/t/${id}`)
    } catch (e) {
      setError(String((e as Error).message))
    }
  }, [id, tripKey])
  return <p>{error || '加入中…'} {error && <a href="#">回首頁</a>}</p>
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

function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle')
  return (
    <button onClick={async () => {
      setState((await copyText(text)) ? 'ok' : 'fail')
      setTimeout(() => setState('idle'), 2000)
    }}>
      {state === 'ok' ? '已複製 ✓' : state === 'fail' ? '複製失敗，請長按下方連結' : label}
    </button>
  )
}

function SyncBadge({ sync }: { sync: TripSync | null }) {
  const [, set] = useState(0)
  useEffect(() => {
    if (!sync) return
    const off = sync.onStatus(() => set((n) => n + 1))
    const t = setInterval(() => set((n) => n + 1), 30_000)
    return () => { off(); clearInterval(t) }
  }, [sync])
  if (!sync) return <span class="muted">未同步</span>
  const s = sync.status()
  const mins = s.lastSyncAt ? Math.floor((Date.now() - s.lastSyncAt) / 60_000) : null
  const text = s.connected === 0 ? '離線中' : s.pending ? '同步中…' : '已同步'
  return (
    <span class="muted">
      {text}・中繼站 {s.connected}/{s.total}
      {mins !== null && `・${mins === 0 ? '剛剛' : `${mins} 分鐘前`}收到更新`}
    </span>
  )
}

function Nickname({ invited, onSave }: { invited: boolean; onSave: (n: string) => void }) {
  const [n, setN] = useState('')
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (n.trim()) onSave(n.trim()) }}>
      <h1>{invited ? '你收到一份行程邀請' : '你的暱稱'}</h1>
      {invited && <p>先取一個暱稱，讓家人知道是誰；按「開始」後就會加入行程。</p>}
      <input value={n} onInput={(e) => setN(value(e))} placeholder="例如：爸爸" />
      <button>開始</button>
    </form>
  )
}

function Home({ reg }: { reg: Registry }) {
  const [f, setF] = useState({ title: '', startDate: '', endDate: '' })
  const ok = f.title.trim() && f.startDate && f.endDate
  return (
    <div>
      <h1>我的行程</h1>
      <p class="muted">{reg.me()!.nickname}</p>
      <ul>
        {reg.trips().map((t) => (
          <li key={t.id}><a href={`#/t/${t.id}`}>{t.title}</a> <span class="muted">{t.startDate} – {t.endDate}</span></li>
        ))}
      </ul>
      <h2>建立行程</h2>
      <form onSubmit={async (e) => {
        e.preventDefault()
        if (!ok) return
        location.hash = `#/t/${await createTrip(reg, { ...f, title: f.title.trim() })}`
      }}>
        <input value={f.title} onInput={(e) => setF({ ...f, title: value(e) })} placeholder="行程名稱" />
        <input type="date" value={f.startDate} onInput={(e) => setF({ ...f, startDate: value(e) })} />
        <input type="date" value={f.endDate} onInput={(e) => setF({ ...f, endDate: value(e) })} />
        <button disabled={!ok}>建立</button>
      </form>
      <h2>加入別人的行程</h2>
      <PasteInvite />
      <p class="muted">版本 {__BUILD__}</p>
    </div>
  )
}

function TripPage({ reg, tripId }: { reg: Registry; tripId: string }) {
  const [opened, setOpened] = useState<OpenTrip | null>(null)
  useEffect(() => {
    let close = () => {}
    let gone = false
    void openTrip(reg, tripId).then((o) => {
      if (gone) return o.close()
      close = o.close
      if (import.meta.env.DEV) (globalThis as Record<string, unknown>).__sync = o.sync
      setOpened(o)
    })
    return () => { gone = true; close() }
  }, [tripId])
  if (!opened) return <p>載入中…</p>
  return <TripView reg={reg} trip={opened.trip} sync={opened.sync} />
}

function TripView({ reg, trip, sync }: { reg: Registry; trip: Trip; sync: TripSync | null }) {
  useDocs([trip.docs.main, trip.docs.priv])
  const [showInvite, setShowInvite] = useState(false)
  const meta = trip.meta
  const ref = meta.id ? reg.trip(meta.id) : undefined
  useEffect(() => {
    if (!meta.id) return
    reg.upsertTrip({ id: meta.id, title: meta.title, startDate: meta.startDate, endDate: meta.endDate })
    // 從邀請連結進來的人：行程內容同步到之後，把自己加進成員。
    trip.join(reg.me()!.nickname)
  }, [meta.id, meta.title, meta.startDate, meta.endDate])
  if (!meta.id) {
    return (
      <div>
        <p><a href="#">← 我的行程</a></p>
        <p>{sync ? '正在從中繼站取得行程內容…' : '這支手機上沒有這份行程。'}</p>
        <p><SyncBadge sync={sync} /></p>
      </div>
    )
  }

  const who = (pubkey: string) => trip.nicknameOf(pubkey)
  const when = (at: number) => new Date(at).toLocaleString('zh-TW', { hour12: false })
  const items = trip.items.all().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

  return (
    <div>
      <p><a href="#">← 我的行程</a>　<SyncBadge sync={sync} /></p>
      <h1>{meta.title}</h1>
      {ref && (
        <p>
          <button onClick={() => setShowInvite(!showInvite)}>邀請</button>
          {showInvite && (
            <span>
              <CopyButton text={inviteLink(ref)} label="複製邀請連結" />
              <input readOnly value={inviteLink(ref)} onFocus={(e) => (e.target as HTMLInputElement).select()} style="width:100%" />
              <span class="muted">拿到這個連結的人就能讀寫這份行程，只用私訊傳。</span>
            </span>
          )}
        </p>
      )}
      <p class="muted">
        {meta.startDate} – {meta.endDate}・成員：
        {trip.members.all().map((m) => `${m.nickname}${m.role === 'admin' ? '（管理員）' : ''}`).join('、')}
      </p>

      <h2>行程</h2>
      <ul>
        {items.map((i) => (
          <li key={i.id}>
            <b>{i.date} {i.time}</b> {i.title}{' '}
            <button onClick={() => {
              const t = prompt('標題', i.title)
              if (t?.trim()) trip.items.update(i.id, { title: t.trim() })
            }}>改</button>
            <button onClick={() => trip.items.remove(i.id)}>刪</button>
            <div class="muted">{who(i.updatedBy)}・{when(i.updatedAt)}</div>
          </li>
        ))}
      </ul>
      <AddItem defaultDate={meta.startDate} onAdd={(date, time, title) =>
        trip.items.create({ date, time, tz, title, note: '', place: '', transport: '', kind: 'normal' })} />

      <h2>清單</h2>
      {trip.allLists().map((l) => {
        const li = trip.listItemsOf(l)
        return (
          <div key={l.id}>
            <h3>{l.title}（{kindName[l.kind]}）{li.filter((x) => x.checked).length}／{li.length}</h3>
            <ul>
              {li.map((x) => (
                <li key={x.id}>
                  <label>
                    <input type="checkbox" checked={x.checked}
                      onChange={(e) => trip.setChecked(l.kind, x.id, (e.target as HTMLInputElement).checked)} />
                    {x.name}
                  </label>
                  {x.checked && <span class="muted"> {x.checkedBy.map(who).join('、')}</span>}{' '}
                  <button onClick={() => trip.removeListItem(l.kind, x.id)}>刪</button>
                </li>
              ))}
            </ul>
            <AddText placeholder="新增項目" onAdd={(name) => trip.addListItem(l, name)} />
          </div>
        )
      })}
      <AddList onAdd={(title, kind) => trip.createList({ title, kind, owners: kind === 'shared' ? [] : [trip.actor.pubkey] })} />

      <h2>修改紀錄</h2>
      <ul>
        {trip.historyEntries().slice(-30).reverse().map((h) => (
          <li key={h.id}>
            <span class="muted">{when(h.at)}・{who(h.by)}</span> {describe(h)}{' '}
            <button onClick={() => trip.revert(h)}>還原</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

const kindName: Record<ListKind, string> = { shared: '共用', personal: '個人', private: '私人' }
const opName = { create: '新增', update: '修改', delete: '刪除', restore: '還原' }

function describe(h: HistoryEntry): string {
  const old = h.old === undefined ? '' : `（原本：${typeof h.old === 'string' ? h.old : JSON.stringify(h.old)}）`
  return `${opName[h.op]} ${h.coll}${h.field ? `.${h.field}` : ''}${old}`
}

function AddItem({ defaultDate, onAdd }: { defaultDate: string; onAdd: (date: string, time: string, title: string) => void }) {
  const [date, setDate] = useState(defaultDate)
  const [time, setTime] = useState('')
  const [title, setTitle] = useState('')
  return (
    <form onSubmit={(e) => {
      e.preventDefault()
      if (!date || !title.trim()) return
      onAdd(date, time, title.trim())
      setTitle('')
    }}>
      <input type="date" value={date} onInput={(e) => setDate(value(e))} />
      <input type="time" value={time} onInput={(e) => setTime(value(e))} />
      <input value={title} onInput={(e) => setTitle(value(e))} placeholder="行程項目" />
      <button>新增</button>
    </form>
  )
}

function AddText({ placeholder, onAdd }: { placeholder: string; onAdd: (text: string) => void }) {
  const [t, setT] = useState('')
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (t.trim()) { onAdd(t.trim()); setT('') } }}>
      <input value={t} onInput={(e) => setT(value(e))} placeholder={placeholder} />
      <button>新增</button>
    </form>
  )
}

function AddList({ onAdd }: { onAdd: (title: string, kind: ListKind) => void }) {
  const [kind, setKind] = useState<ListKind>('shared')
  return (
    <div>
      <select value={kind} onChange={(e) => setKind(value(e) as ListKind)}>
        <option value="shared">共用清單</option>
        <option value="personal">個人清單</option>
        <option value="private">私人清單</option>
      </select>
      <AddText placeholder="清單名稱" onAdd={(t) => onAdd(t, kind)} />
    </div>
  )
}
