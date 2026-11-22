// 驗證資料模型與本機儲存用的最簡畫面，不是正式介面。
import { useEffect, useState } from 'preact/hooks'
import type * as Y from 'yjs'
import type { Trip } from './model/trip'
import type { HistoryEntry, ListKind } from './model/types'
import { Registry, createTrip, openTrip } from './store/local'

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
  const tripId = hash.match(/^#\/t\/(.+)$/)?.[1]
  return tripId ? <TripPage key={tripId} reg={reg} tripId={tripId} /> : <Home reg={reg} />
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
  const [trip, setTrip] = useState<Trip | null>(null)
  useEffect(() => {
    let close = () => {}
    let gone = false
    void openTrip(tripId, reg.me()!).then((o) => {
      if (gone) return o.close()
      close = o.close
      setTrip(o.trip)
    })
    return () => { gone = true; close() }
  }, [tripId])
  if (!trip) return <p>載入中…</p>
  return <TripView reg={reg} trip={trip} />
}

function TripView({ reg, trip }: { reg: Registry; trip: Trip }) {
  useDocs([trip.docs.main, trip.docs.priv])
  const meta = trip.meta
  useEffect(() => {
    if (meta.id) reg.upsertTrip({ id: meta.id, title: meta.title, startDate: meta.startDate, endDate: meta.endDate })
  }, [meta.title, meta.startDate, meta.endDate])
  if (!meta.id) return <p>這支手機上沒有這份行程。<a href="#">回首頁</a></p>

  const who = (pubkey: string) => trip.nicknameOf(pubkey)
  const when = (at: number) => new Date(at).toLocaleString('zh-TW', { hour12: false })
  const items = trip.items.all().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

  return (
    <div>
      <p><a href="#">← 我的行程</a></p>
      <h1>{meta.title}</h1>
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
