// 驗證資料模型與本機儲存用的最簡畫面，不是正式介面。
import { useEffect, useState } from 'preact/hooks'
import type * as Y from 'yjs'
import type { Trip } from './model/trip'
import type { HistoryEntry, ListKind } from './model/types'
import { Registry, acceptInvite, createTrip, inviteLink, openTrip, type OpenTrip } from './store/local'
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
  if (!reg) return <p>載入中…</p>
  return <Loaded reg={reg} hash={hash} />
}

function Loaded({ reg, hash }: { reg: Registry; hash: string }) {
  useDocs([reg.ydoc])
  const me = reg.me()
  if (!me) return <Nickname onSave={(n) => reg.setNickname(n)} />
  const join = hash.match(/^#\/join\/([^/]+)\/([^/]+)$/)
  if (join) return <Join reg={reg} id={join[1]} tripKey={join[2]} />
  const tripId = hash.match(/^#\/t\/(.+)$/)?.[1]
  return tripId ? <TripPage key={tripId} reg={reg} tripId={tripId} /> : <Home reg={reg} />
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

function Nickname({ onSave }: { onSave: (n: string) => void }) {
  const [n, setN] = useState('')
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (n.trim()) onSave(n.trim()) }}>
      <h1>你的暱稱</h1>
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
