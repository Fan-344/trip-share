// 每日行程：上方選日期，下方是那一天的時間軸。
import { useState } from 'preact/hooks'
import type { Trip } from '../model/trip'
import type { Item, ItemKind } from '../model/types'
import { ago, dayLabel, daysBetween, defaultTz, fullDay, placeName, today, zoneOptions } from '../time'
import { Field, Seg, Sheet, useNow, value } from './kit'
import type { TabProps } from './TripPage'

const KINDS: [ItemKind, string][] = [['normal', '一般'], ['must', '必去'], ['reminder', '提醒']]

export function Plan({ trip }: TabProps) {
  const now = useNow(60_000)
  const meta = trip.meta
  const items = trip.items.all()
  const flights = trip.flights.all()
  // 行程起訖日之間的每一天，加上有項目但落在範圍外的日期。
  const days = [...new Set([...daysBetween(meta.startDate, meta.endDate), ...items.map((i) => i.date)])].sort()
  const t = today()
  const [picked, setPicked] = useState('')
  const day = days.includes(picked) ? picked : days.includes(t) ? t : days[0] ?? meta.startDate
  const [sheet, setSheet] = useState<{ id?: string } | null>(null)

  // 沒填時間的排最前面（整天的事），其餘照時間。
  const list = items.filter((i) => i.date === day).sort((a, b) => a.time.localeCompare(b.time) || a.createdAt - b.createdAt)
  const range = daysBetween(meta.startDate, meta.endDate)

  return (
    <div>
      <div class="days">
        {days.map((d) => {
          const { md, wd } = dayLabel(d)
          const n = range.indexOf(d)
          return (
            <button key={d} class={`day ${d === day ? 'on' : ''} ${d === t ? 'today' : ''}`}
              aria-label={fullDay(d)} aria-pressed={d === day} onClick={() => setPicked(d)}>
              <small>{d === t ? '今天' : n >= 0 ? `Day ${n + 1}` : '其他'}</small>
              <b>{md}</b>
              <small>（{wd}）</small>
            </button>
          )
        })}
      </div>

      {list.length === 0 ? (
        <p class="empty">{fullDay(day)} 還沒有安排。</p>
      ) : (
        <div class="timeline">
          {list.map((i) => (
            <div class={`stop ${i.kind}`} key={i.id}>
              <div class={`card tap ${i.kind === 'reminder' ? 'reminder' : ''}`} onClick={() => setSheet({ id: i.id })}>
                <div class="row wrap">
                  {i.time
                    ? <span class="time">{i.time}</span>
                    : <span class="chip">整天</span>}
                  {i.time && <span class="muted">{placeName(i.tz, flights)}當地時間</span>}
                  {i.kind === 'must' && <span class="chip coral">必去</span>}
                  {i.kind === 'reminder' && <span class="chip yellow">提醒</span>}
                </div>
                <div class="title">{i.title}</div>
                {i.note && <div class="note">{i.note}</div>}
                {(i.place || i.transport) && (
                  <div class="row wrap" style="margin-top:6px">
                    {i.place && <span class="chip mizu">📍 {i.place}</span>}
                    {i.transport && <span class="chip green">🚗 {i.transport}</span>}
                  </div>
                )}
                <div class="muted" style="margin-top:6px">{trip.nicknameOf(i.updatedBy)}・{ago(i.updatedAt, now)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <button class="add" onClick={() => setSheet({})}>＋ 新增項目</button>

      {sheet && <ItemSheet trip={trip} id={sheet.id} day={day} onClose={() => setSheet(null)} />}
    </div>
  )
}

function ItemSheet({ trip, id, day, onClose }: { trip: Trip; id?: string; day: string; onClose: () => void }) {
  const old = id ? trip.items.get(id) : undefined
  const flights = trip.flights.all()
  const [f, setF] = useState<Item>({
    date: old?.date ?? day, time: old?.time ?? '', tz: old?.tz ?? defaultTz(day, flights),
    title: old?.title ?? '', note: old?.note ?? '', place: old?.place ?? '', transport: old?.transport ?? '',
    kind: old?.kind ?? 'normal',
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
        <Seg value={f.kind} options={KINDS} onChange={(kind) => set({ kind })} />
        <div class="two">
          <Field label="日期">
            {/* 新增時換日期，時區跟著換成那天人在的地方；編輯既有項目時不自動改。 */}
            <input type="date" value={f.date} onInput={(e) => set({ date: value(e), ...(!id && { tz: defaultTz(value(e), flights) }) })} />
          </Field>
          <Field label="時間（可不填）"><input type="time" value={f.time} onInput={(e) => set({ time: value(e) })} /></Field>
        </div>
        {f.time && (
          <Field label="這是哪裡的時間">
            <select value={f.tz} onChange={(e) => set({ tz: value(e) })}>
              {zoneOptions(flights, f.tz).map((z) => <option key={z} value={z}>{placeName(z, flights)}時間</option>)}
            </select>
          </Field>
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
