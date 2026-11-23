// 總覽：行程日期與倒數、航班、住宿。
import { useState } from 'preact/hooks'
import type { Trip } from '../model/trip'
import type { Flight, Meta, Stay } from '../model/types'
import {
  AIRPORTS, ago, airportName, countdown, daysBetween, fullDay, nightsBetween, placeName, safeUrl,
  toInstant, today, zoneOptions,
} from '../time'
import { THEMES, autoTheme, themeName } from '../themes'
import { Art, RouteArc } from './Art'
import { Empty, Farewell } from './bits'
import { Chevron } from './fold'
import type { TicketFlight } from '../ticket'
import { Icon } from './Icons'
import { ImportSheet, type ImportState } from './Import'
import { EditBar, Field, Sheet, useNow, value } from './kit'
import type { TabProps } from './TripPage'

const DAY = 86_400_000

/** 航班、住宿這類關鍵資料被別人改過時，提示 24 小時（規格書第 6 節）。 */
function EditedNotice({ rec, trip, now }: { rec: Meta; trip: Trip; now: number }) {
  if (rec.revCount <= 1 || rec.updatedBy === trip.actor.pubkey || now - rec.updatedAt > DAY) return null
  return <div class="notice">剛被 {trip.nicknameOf(rec.updatedBy)} 修改・{ago(rec.updatedAt, now)}</div>
}

const hm = (local: string) => local.slice(11, 16)

export function Overview({ trip, theme }: TabProps) {
  const now = useNow(1000)
  const [sheet, setSheet] = useState<
    { kind: 'trip' } | { kind: 'flight'; id?: string; ticket?: number } | { kind: 'stay'; id?: string } | { kind: 'import' } | null
  >(null)
  // 匯入機票讀到的航班；放在這裡，確認完一班回到清單時還在。
  const [ticket, setTicket] = useState<ImportState | null>(null)
  const meta = trip.meta
  const flights = trip.flights.all().sort((a, b) => toInstant(a.dep) - toInstant(b.dep))
  const stays = trip.stays.all().sort((a, b) => a.checkIn.localeCompare(b.checkIn))
  const days = daysBetween(meta.startDate, meta.endDate)

  const next = flights.find((f) => toInstant(f.dep) > now)
  // 預設展開的那一班：接下來要搭的；都飛完了就是最後一班。
  const focus = next ?? flights[flights.length - 1]
  const [openFlight, setOpenFlight] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState(false)
  const t = today()
  const dayIndex = days.indexOf(t)

  return (
    <div>
      <div class="card hero">
        <Art theme={theme} />
        <div class="body">
        <div class="row">
          <span class="muted grow">
            {meta.startDate.slice(0, 4)}　{fullDay(meta.startDate)} ～ {fullDay(meta.endDate)}
          </span>
          {editing && <button class="small" onClick={() => setSheet({ kind: 'trip' })}><Icon id="pencil" size={16} />修改</button>}
        </div>
        <h1>{meta.title}</h1>
        {meta.desc && <p class="desc">{meta.desc}</p>}
        <div class="row wrap">
          {days.length > 0 && <span class="chip yellow">{days.length} 天 {days.length - 1} 夜</span>}
          {trip.members.all().map((m) => <span class="chip" key={m.id}>{m.nickname}</span>)}
        </div>
        {dayIndex >= 0 ? (
          <p><b>旅行第 {dayIndex + 1} 天</b></p>
        ) : next ? (
          <Countdown ms={toInstant(next.dep) - now}
            label={`距離起飛（${fullDay(next.dep.local.slice(0, 10))} ${hm(next.dep.local)} ${placeName(next.dep.tz, flights)}時間）`} />
        ) : meta.startDate > t ? (
          <Countdown ms={new Date(`${meta.startDate}T00:00`).getTime() - now} label="距離出發" />
        ) : null}
        </div>
      </div>

      <h2 class="plain"><Icon id="ticket" size={24} />航班</h2>
      {flights.map((f) => {
        const mins = Math.round((toInstant(f.arr) - toInstant(f.dep)) / 60_000)
        const pnr = trip.getPnr(f.id)
        // 只展開接下來要搭的那一班，其他縮成一行；點一下可以展開或收起。
        const open = openFlight[f.id] ?? (focus ? f.id === focus.id : false)
        const toggle = () => setOpenFlight({ ...openFlight, [f.id]: !open })
        if (!open) {
          return (
            <div class="card tap mini" key={f.id} role="button" aria-expanded="false" onClick={toggle}>
              <span class="chip yellow">{f.code}</span>
              <span class="grow">
                {fullDay(f.dep.local.slice(0, 10))}　{f.from} {hm(f.dep.local)} ～ {f.to} {hm(f.arr.local)}
              </span>
              <Chevron open={false} />
            </div>
          )
        }
        return (
          <div class="card" key={f.id}>
            <EditedNotice rec={f} trip={trip} now={now} />
            <div class="row wrap cardhead" role="button" aria-expanded="true" onClick={toggle}>
              <span class="chip yellow">{f.code}</span>
              <span class="muted">{fullDay(f.dep.local.slice(0, 10))}</span>
              {f.cabin && <span class="chip">{f.cabin}</span>}
              <span class="muted grow" style="text-align:right">
                {mins > 0 && `${Math.floor(mins / 60)} 小時 ${mins % 60} 分`}
              </span>
              <Chevron open />
            </div>
            <div class="route">
              <div>
                <div class="code">{f.from}</div>
                <div class="muted">{airportName(f.from)}</div>
                <div class="time">{hm(f.dep.local)}</div>
                <div class="muted">{placeName(f.dep.tz, flights)}當地時間</div>
              </div>
              {/* 航線：飛機從出發地飛向目的地 */}
              <div class="mid"><RouteArc /></div>
              <div class="to">
                <div class="code">{f.to}</div>
                <div class="muted">{airportName(f.to)}</div>
                <div class="time">
                  {hm(f.arr.local)}
                  {f.arr.local.slice(0, 10) !== f.dep.local.slice(0, 10) && <small>（{fullDay(f.arr.local.slice(0, 10))}）</small>}
                </div>
                <div class="muted">{placeName(f.arr.tz, flights)}當地時間</div>
              </div>
            </div>
            <div class="row">
              <span class="muted grow">
                {f.aircraft}{f.aircraft && pnr && '・'}{pnr && `訂位代號 ${pnr.code}（只存在這支手機）`}
              </span>
              {editing && <button class="small" onClick={() => setSheet({ kind: 'flight', id: f.id })}><Icon id="pencil" size={16} />修改</button>}
            </div>
          </div>
        )
      })}
      {flights.length === 0 && <Empty icon="plane">還沒有航班。</Empty>}
      {editing && <div class="two">
        <button class="add" onClick={() => setSheet({ kind: 'flight' })}><Icon id="plus" size={18} />新增航班</button>
        <button class="add" onClick={() => { setTicket(null); setSheet({ kind: 'import' }) }}><Icon id="camera" size={18} />匯入機票</button>
      </div>}

      <h2 class="plain"><Icon id="bed" size={24} />住宿</h2>
      {stays.map((s) => {
        const map = safeUrl(s.mapUrl)
        const nights = nightsBetween(s.checkIn, s.checkOut)
        return (
          <div class={`card ${editing ? 'tap' : ''}`} key={s.id} onClick={() => { if (editing) setSheet({ kind: 'stay', id: s.id }) }}>
            <EditedNotice rec={s} trip={trip} now={now} />
            <div class="row">
              <h3 class="grow">{s.name}</h3>
              <span class={`chip ${s.confirmed ? 'green' : 'coral'}`}>{s.confirmed ? '已確認' : '未確認'}</span>
              {editing && <Icon id="pencil" size={18} />}
            </div>
            <p>
              {fullDay(s.checkIn)} 入住 ～ {fullDay(s.checkOut)} 退房{nights > 0 && `・${nights} 晚`}
            </p>
            {map && <a class="btn small" href={map} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>開地圖</a>}
          </div>
        )
      })}
      {stays.length === 0 && <Empty icon="house">還沒有住宿。</Empty>}
      {editing && <button class="add" onClick={() => setSheet({ kind: 'stay' })}><Icon id="plus" size={18} />新增住宿</button>}

      <Farewell theme={theme} title={meta.title} />
      <EditBar on={editing} onChange={setEditing} />

      {sheet?.kind === 'trip' && <TripSheet trip={trip} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'flight' && (
        <FlightSheet
          trip={trip} id={sheet.id}
          initial={sheet.ticket === undefined ? undefined : ticket?.flights[sheet.ticket]}
          onSaved={() => { if (ticket && sheet.ticket !== undefined) setTicket({ ...ticket, added: [...ticket.added, sheet.ticket] }) }}
          // 從匯入清單點進來的：關掉後回到清單，還有別班可以繼續確認
          onClose={() => setSheet(sheet.ticket === undefined ? null : { kind: 'import' })}
        />
      )}
      {sheet?.kind === 'import' && (
        <ImportSheet
          near={meta.startDate} state={ticket} onState={setTicket}
          onPick={(i) => setSheet({ kind: 'flight', ticket: i })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'stay' && <StaySheet trip={trip} id={sheet.id} onClose={() => setSheet(null)} />}
    </div>
  )
}

function Countdown({ ms, label }: { ms: number; label: string }) {
  const c = countdown(ms)
  return (
    <div>
      <div class="count">
        <div><b>{c.d}</b><span>天</span></div>
        <div><b>{c.h}</b><span>時</span></div>
        <div><b>{c.m}</b><span>分</span></div>
        <div><b>{c.s}</b><span>秒</span></div>
      </div>
      <div class="muted center">{label}</div>
    </div>
  )
}

function TripSheet({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const [f, setF] = useState({
    title: trip.meta.title, startDate: trip.meta.startDate, endDate: trip.meta.endDate, theme: trip.meta.theme ?? '',
    desc: trip.meta.desc ?? '',
  })
  const ok = f.title.trim() && f.startDate && f.endDate && f.startDate <= f.endDate
  const auto = autoTheme(trip.flights.all())
  return (
    <Sheet title="編輯行程" onClose={onClose}>
      <form onSubmit={(e) => {
        e.preventDefault()
        if (!ok) return
        trip.updateMeta({ ...f, title: f.title.trim(), desc: f.desc.trim() })
        onClose()
      }}>
        <Field label="行程名稱"><input value={f.title} onInput={(e) => setF({ ...f, title: value(e) })} /></Field>
        <Field label="一句話簡介（可不填）">
          <input value={f.desc} onInput={(e) => setF({ ...f, desc: value(e) })} placeholder="例如：大象、夜間動物園，還有泳池時光" />
        </Field>
        <div class="two">
          <Field label="出發日"><input type="date" value={f.startDate} onInput={(e) => setF({ ...f, startDate: value(e) })} /></Field>
          <Field label="回程日"><input type="date" value={f.endDate} min={f.startDate} onInput={(e) => setF({ ...f, endDate: value(e) })} /></Field>
        </div>
        <span class="muted">佈景主題</span>
        <div class="swatches">
          <button type="button" class={f.theme === '' ? 'on' : ''} onClick={() => setF({ ...f, theme: '' })}>
            <i style={`background:${THEMES.find((t) => t.id === auto)!.accent}`} />
            <span>自動<br /><small class="muted">依目的地：{themeName(auto)}</small></span>
          </button>
          {THEMES.map((t) => (
            <button type="button" key={t.id} class={f.theme === t.id ? 'on' : ''} onClick={() => setF({ ...f, theme: t.id })}>
              <i style={`background:${t.accent}`} />
              <span>{t.name}<br /><small class="muted">{t.hint}</small></span>
            </button>
          ))}
        </div>
        <div class="actions"><button class="primary" disabled={!ok}>儲存</button></div>
      </form>
    </Sheet>
  )
}

function FlightSheet({ trip, id, initial, onSaved, onClose }: {
  trip: Trip
  id?: string
  /** 從機票讀到的內容：先填進表單，使用者核對後才存。 */
  initial?: TicketFlight
  onSaved?: () => void
  onClose: () => void
}) {
  const old = id ? trip.flights.get(id) : undefined
  const flights = trip.flights.all()
  const start = trip.meta.startDate
  const [f, setF] = useState(initial ? {
    code: initial.code, from: initial.from, to: initial.to,
    depDate: initial.depDate || start, depTime: initial.depTime, depTz: AIRPORTS[initial.from]?.tz ?? '',
    arrDate: initial.arrDate || initial.depDate || start, arrTime: initial.arrTime, arrTz: AIRPORTS[initial.to]?.tz ?? '',
    cabin: initial.cabin, aircraft: '', pnr: initial.pnr,
  } : {
    code: old?.code ?? '', from: old?.from ?? '', to: old?.to ?? '',
    depDate: old?.dep.local.slice(0, 10) ?? start, depTime: old ? hm(old.dep.local) : '', depTz: old?.dep.tz ?? '',
    arrDate: old?.arr.local.slice(0, 10) ?? start, arrTime: old ? hm(old.arr.local) : '', arrTz: old?.arr.tz ?? '',
    cabin: old?.cabin ?? '', aircraft: old?.aircraft ?? '',
    pnr: (id && trip.getPnr(id)?.code) || '',
  })
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch })
  // 輸入機場代碼就帶出時區；不認得的機場要自己選。
  const airport = (key: 'from' | 'to', raw: string) => {
    const code = raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3)
    const tz = AIRPORTS[code]?.tz
    set(key === 'from' ? { from: code, ...(tz && { depTz: tz }) } : { to: code, ...(tz && { arrTz: tz }) })
  }
  const ok = f.code.trim() && f.from.length === 3 && f.to.length === 3 &&
    f.depDate && f.depTime && f.depTz && f.arrDate && f.arrTime && f.arrTz

  const save = () => {
    const data: Flight = {
      code: f.code.trim().toUpperCase().replace(/\s+/g, ''), from: f.from, to: f.to,
      dep: { local: `${f.depDate}T${f.depTime}`, tz: f.depTz },
      arr: { local: `${f.arrDate}T${f.arrTime}`, tz: f.arrTz },
      cabin: f.cabin.trim(), aircraft: f.aircraft.trim(),
    }
    let fid = id
    if (fid) trip.flights.update(fid, data)
    else fid = trip.flights.create(data)
    const pnr = f.pnr.trim().toUpperCase()
    trip.setPnr(fid, pnr ? { airline: data.code.slice(0, 2), code: pnr } : null)
    onSaved?.()
    onClose()
  }

  // 選單裡的地名把正在填的這班也算進去，填了 CNX 就顯示「清邁時間」而不是「泰國時間」。
  const naming: Flight[] = [
    { code: '', from: f.from, to: f.to, dep: { local: '', tz: f.depTz }, arr: { local: '', tz: f.arrTz }, cabin: '', aircraft: '' },
    ...flights,
  ]
  const zones = zoneOptions(flights, f.depTz || f.arrTz)
  const tzSelect = (key: 'depTz' | 'arrTz') => (
    <select value={f[key]} onChange={(e) => set({ [key]: value(e) })}>
      <option value="">選擇時區</option>
      {zones.map((z) => <option key={z} value={z}>{placeName(z, naming)}時間</option>)}
    </select>
  )

  return (
    <Sheet title={id ? '編輯航班' : initial ? '核對航班' : '新增航班'} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (ok) save() }}>
        {initial && <div class="notice" style="display:block">請對照機票核對，空的自己補。</div>}
        <div class="two">
          <Field label="航班代號"><input value={f.code} onInput={(e) => set({ code: value(e) })} placeholder="JX1751" autocapitalize="characters" /></Field>
          <Field label="艙等"><input value={f.cabin} onInput={(e) => set({ cabin: value(e) })} placeholder="經濟艙" /></Field>
        </div>
        <div class="two">
          <Field label={`出發機場${airportName(f.from) && `（${airportName(f.from)}）`}`}>
            <input value={f.from} onInput={(e) => airport('from', value(e))} placeholder="TPE" autocapitalize="characters" />
          </Field>
          <Field label={`抵達機場${airportName(f.to) && `（${airportName(f.to)}）`}`}>
            <input value={f.to} onInput={(e) => airport('to', value(e))} placeholder="CNX" autocapitalize="characters" />
          </Field>
        </div>
        <div class="two">
          <Field label="起飛日期"><input type="date" value={f.depDate} onInput={(e) => set({ depDate: value(e), arrDate: f.arrDate < value(e) ? value(e) : f.arrDate })} /></Field>
          <Field label="起飛時間（當地）"><input type="time" value={f.depTime} onInput={(e) => set({ depTime: value(e) })} /></Field>
        </div>
        <Field label="起飛時間是哪裡的時間">{tzSelect('depTz')}</Field>
        <div class="two">
          <Field label="抵達日期"><input type="date" value={f.arrDate} onInput={(e) => set({ arrDate: value(e) })} /></Field>
          <Field label="抵達時間（當地）"><input type="time" value={f.arrTime} onInput={(e) => set({ arrTime: value(e) })} /></Field>
        </div>
        <Field label="抵達時間是哪裡的時間">{tzSelect('arrTz')}</Field>
        <Field label="機型（可不填）"><input value={f.aircraft} onInput={(e) => set({ aircraft: value(e) })} placeholder="A330-900neo" /></Field>
        <Field label="訂位代號（只存在這支手機）">
          <input value={f.pnr} onInput={(e) => set({ pnr: value(e) })} autocapitalize="characters" autocomplete="off" />
        </Field>
        <div class="actions">
          {id && <button type="button" class="danger" onClick={() => { trip.flights.remove(id); onClose() }}>刪除</button>}
          <button class="primary" disabled={!ok}>儲存</button>
        </div>
      </form>
    </Sheet>
  )
}

function StaySheet({ trip, id, onClose }: { trip: Trip; id?: string; onClose: () => void }) {
  const old = id ? trip.stays.get(id) : undefined
  const [f, setF] = useState<Stay>({
    name: old?.name ?? '', checkIn: old?.checkIn ?? trip.meta.startDate, checkOut: old?.checkOut ?? trip.meta.endDate,
    mapUrl: old?.mapUrl ?? '', confirmed: old?.confirmed ?? false,
  })
  const badUrl = f.mapUrl.trim() !== '' && !safeUrl(f.mapUrl)
  const ok = f.name.trim() && f.checkIn && f.checkOut && f.checkIn <= f.checkOut && !badUrl
  return (
    <Sheet title={id ? '編輯住宿' : '新增住宿'} onClose={onClose}>
      <form onSubmit={(e) => {
        e.preventDefault()
        if (!ok) return
        const data = { ...f, name: f.name.trim(), mapUrl: f.mapUrl.trim() }
        if (id) trip.stays.update(id, data)
        else trip.stays.create(data)
        onClose()
      }}>
        <Field label="名稱"><input value={f.name} onInput={(e) => setF({ ...f, name: value(e) })} placeholder="飯店或民宿名稱" /></Field>
        <div class="two">
          <Field label="入住"><input type="date" value={f.checkIn} onInput={(e) => setF({ ...f, checkIn: value(e) })} /></Field>
          <Field label="退房"><input type="date" value={f.checkOut} min={f.checkIn} onInput={(e) => setF({ ...f, checkOut: value(e) })} /></Field>
        </div>
        <Field label={badUrl ? '地圖連結（要以 https:// 開頭）' : '地圖連結（可不填）'}>
          <input type="url" value={f.mapUrl} onInput={(e) => setF({ ...f, mapUrl: value(e) })} placeholder="https://maps.app.goo.gl/…" />
        </Field>
        <label class="check">
          <input type="checkbox" checked={f.confirmed} onChange={(e) => setF({ ...f, confirmed: (e.target as HTMLInputElement).checked })} />
          <span class="name">已收到訂房確認</span>
        </label>
        <div class="actions">
          {id && <button type="button" class="danger" onClick={() => { trip.stays.remove(id); onClose() }}>刪除</button>}
          <button class="primary" disabled={!ok}>儲存</button>
        </div>
      </form>
    </Sheet>
  )
}
