// 每日行程：上方選日期，接著是當天的標頭（圖示與標題），下方是時間軸。
import { useState } from 'preact/hooks'
import type { Trip } from '../model/trip'
import type { Item, ItemCat, ItemKind } from '../model/types'
import { defaultDayIcon, themeOf } from '../themes'
import { ago, dayLabel, daysBetween, defaultTz, fullDay, placeName, today, zoneOptions } from '../time'
import { Empty, Farewell } from './bits'
import { CATS, DAY_ICONS, Icon, catOf } from './Icons'
import { Field, Seg, Sheet, useNow, value } from './kit'
import type { TabProps } from './TripPage'

const KINDS: [ItemKind, string][] = [['normal', '一般'], ['must', '必去'], ['reminder', '提醒']]

export function Plan({ trip, theme }: TabProps) {
  const now = useNow(60_000)
  const meta = trip.meta
  const items = trip.items.all()
  const flights = trip.flights.all()
  const range = daysBetween(meta.startDate, meta.endDate)
  // 行程起訖日之間的每一天，加上有項目但落在範圍外的日期。
  const days = [...new Set([...range, ...items.map((i) => i.date)])].sort()
  const t = today()
  const [picked, setPicked] = useState('')
  const day = days.includes(picked) ? picked : days.includes(t) ? t : days[0] ?? meta.startDate
  const [sheet, setSheet] = useState<{ kind: 'item'; id?: string } | { kind: 'day' } | null>(null)

  // 沒填時間的排最前面（整天的事），其餘照時間。
  const list = items.filter((i) => i.date === day).sort((a, b) => a.time.localeCompare(b.time) || a.createdAt - b.createdAt)
  const n = range.indexOf(day)
  const info = trip.days.get(day)
  const dayIcon = (!info?.deleted && info?.icon) || defaultDayIcon(theme, n, range.length)
  const dayTitle = (!info?.deleted && info?.title) || ''

  return (
    <div>
      <div class="days">
        {days.map((d) => {
          const { md, wd } = dayLabel(d)
          const i = range.indexOf(d)
          return (
            <button key={d} class={`day ${d === day ? 'on' : ''} ${d === t ? 'today' : ''}`}
              aria-label={fullDay(d)} aria-pressed={d === day} onClick={() => setPicked(d)}>
              <small>{d === t ? '今天' : i >= 0 ? `Day ${i + 1}` : '其他'}</small>
              <b>{md}</b>
              <small>（{wd}）</small>
            </button>
          )
        })}
      </div>

      {/* key 用日期：換一天時整段重新進場 */}
      <div key={day}>
        <div class="dayhead">
          <div class="badge">
            <Icon id={dayIcon} size={40} />
            <svg class="spark" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M8 1l1.800 4.600l4.600 1.800l-4.600 1.800L8 14l-1.800 -4.800L1.600 7.400l4.600 -1.800z" fill="#fff" stroke="var(--ink)" stroke-width="1.6" stroke-linejoin="round" />
            </svg>
          </div>
          <div class="grow">
            <div class="muted">{n >= 0 ? `Day ${n + 1}・` : ''}{fullDay(day)}</div>
            <h3>{dayTitle || <span class="muted">幫這天取個標題</span>}</h3>
          </div>
          <button class="small ghost" aria-label="編輯這天的標題與圖示" onClick={() => setSheet({ kind: 'day' })}>✏️</button>
        </div>

        {list.length === 0 ? (
          <Empty icon={themeOf(theme).motifs[0]}>{fullDay(day)} 還沒有安排。</Empty>
        ) : (
          <div class="timeline">
            {list.map((i) => {
              const cat = catOf(i.cat)
              return (
                <div class={`stop ${i.kind} ${cat ? 'cat' : ''}`} key={i.id}>
                  {cat && <span class="catdot" style={`background:${cat.color}`}><Icon id={cat.icon} size={22} /></span>}
                  <div class={`card tap ${i.kind === 'reminder' ? 'reminder' : ''}`} onClick={() => setSheet({ kind: 'item', id: i.id })}>
                    <div class="row wrap">
                      {i.time && i.approx && <span class="approx">約</span>}
                      {i.time ? <span class="time">{i.time}</span> : <span class="chip">整天</span>}
                      {cat && <span class="chip" style={`background:${cat.color}`}>{cat.name}</span>}
                      {i.kind === 'must' && <span class="chip coral">必去</span>}
                      {i.kind === 'reminder' && <span class="chip yellow">提醒</span>}
                    </div>
                    <div class="title">{i.title}</div>
                    {i.note && <div class="note">{i.note}</div>}
                    {(i.place || i.transport) && (
                      <div class="row wrap" style="margin-top:6px">
                        {i.place && <span class="chip mizu">📍 {i.place}</span>}
                        {i.transport && <span class="chip green">{i.transport}</span>}
                      </div>
                    )}
                    <div class="muted" style="margin-top:6px">
                      {i.time && `${placeName(i.tz, flights)}當地時間・`}{trip.nicknameOf(i.updatedBy)}・{ago(i.updatedAt, now)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <button class="add" onClick={() => setSheet({ kind: 'item' })}>＋ 新增項目</button>
      <Farewell theme={theme} title={meta.title} />

      {sheet?.kind === 'item' && <ItemSheet trip={trip} id={sheet.id} day={day} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'day' && (
        <DaySheet trip={trip} day={day} title={dayTitle} icon={(!info?.deleted && info?.icon) || ''} fallback={dayIcon} onClose={() => setSheet(null)} />
      )}
    </div>
  )
}

function DaySheet({ trip, day, title, icon, fallback, onClose }: {
  trip: Trip
  day: string
  title: string
  icon: string
  fallback: string
  onClose: () => void
}) {
  const [f, setF] = useState({ title, icon })
  return (
    <Sheet title={`${fullDay(day)} 的標題`} onClose={onClose}>
      <form onSubmit={(e) => {
        e.preventDefault()
        trip.setDay(day, { title: f.title.trim(), icon: f.icon })
        onClose()
      }}>
        <Field label="這天的主題"><input value={f.title} onInput={(e) => setF({ ...f, title: value(e) })} placeholder="例如：抵達清邁" /></Field>
        <span class="muted">圖示</span>
        <div class="icons">
          <button type="button" class={f.icon === '' ? 'on' : ''} aria-label="自動" onClick={() => setF({ ...f, icon: '' })}>
            <span class="muted">自動</span>
          </button>
          {DAY_ICONS.map((id) => (
            <button type="button" key={id} class={f.icon === id ? 'on' : ''} aria-label={id} onClick={() => setF({ ...f, icon: id })}>
              <Icon id={id} size={28} />
            </button>
          ))}
        </div>
        {f.icon === '' && <p class="muted">自動：跟著主題走，現在是 <Icon id={fallback} size={20} /></p>}
        <div class="actions"><button class="primary">儲存</button></div>
      </form>
    </Sheet>
  )
}

function ItemSheet({ trip, id, day, onClose }: { trip: Trip; id?: string; day: string; onClose: () => void }) {
  const old = id ? trip.items.get(id) : undefined
  const flights = trip.flights.all()
  const [f, setF] = useState<Item>({
    date: old?.date ?? day, time: old?.time ?? '', tz: old?.tz ?? defaultTz(day, flights),
    title: old?.title ?? '', note: old?.note ?? '', place: old?.place ?? '', transport: old?.transport ?? '',
    kind: old?.kind ?? 'normal', cat: old?.cat ?? '', approx: old?.approx ?? false,
  })
  const set = (patch: Partial<Item>) => setF({ ...f, ...patch })
  const ok = f.title.trim() && f.date
  return (
    <Sheet title={id ? '編輯項目' : '新增項目'} onClose={onClose}>
      <form onSubmit={(e) => {
        e.preventDefault()
        if (!ok) return
        const data = { ...f, title: f.title.trim(), note: f.note.trim(), place: f.place.trim(), transport: f.transport.trim() }
        if (id) trip.items.update(id, data)
        else trip.items.create(data)
        onClose()
      }}>
        <Field label="要做什麼"><input value={f.title} onInput={(e) => set({ title: value(e) })} placeholder="例如：夜間動物園" /></Field>
        <span class="muted">類別</span>
        <div class="cats">
          {CATS.map((c) => (
            <button type="button" key={c.id} class={f.cat === c.id ? 'on' : ''}
              onClick={() => set({ cat: (f.cat === c.id ? '' : c.id) as ItemCat })}>
              <Icon id={c.icon} size={22} />{c.name}
            </button>
          ))}
        </div>
        <Seg value={f.kind} options={KINDS} onChange={(kind) => set({ kind })} />
        <div class="two">
          <Field label="日期">
            {/* 新增時換日期，時區跟著換成那天人在的地方；編輯既有項目時不自動改。 */}
            <input type="date" value={f.date} onInput={(e) => set({ date: value(e), ...(!id && { tz: defaultTz(value(e), flights) }) })} />
          </Field>
          <Field label="時間（可不填）"><input type="time" value={f.time} onInput={(e) => set({ time: value(e) })} /></Field>
        </div>
        {f.time && (
          <div>
            <label class="check">
              <input type="checkbox" checked={!!f.approx} onChange={(e) => set({ approx: (e.target as HTMLInputElement).checked })} />
              <span class="name">時間是大約的（顯示「約」）</span>
            </label>
            <Field label="這是哪裡的時間">
              <select value={f.tz} onChange={(e) => set({ tz: value(e) })}>
                {zoneOptions(flights, f.tz).map((z) => <option key={z} value={z}>{placeName(z, flights)}時間</option>)}
              </select>
            </Field>
          </div>
        )}
        <div class="two">
          <Field label="地點（可不填）"><input value={f.place} onInput={(e) => set({ place: value(e) })} placeholder="尼曼路" /></Field>
          <Field label="交通（可不填）"><input value={f.transport} onInput={(e) => set({ transport: value(e) })} placeholder="飯店接送" /></Field>
        </div>
        <Field label="說明（可不填）"><textarea value={f.note} onInput={(e) => set({ note: value(e) })} /></Field>
        <div class="actions">
          {id && <button type="button" class="danger" onClick={() => { trip.items.remove(id); onClose() }}>刪除</button>}
          <button class="primary" disabled={!ok}>儲存</button>
        </div>
      </form>
    </Sheet>
  )
}
