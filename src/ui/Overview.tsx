// 總覽：行程日期與倒數、航班、住宿。
import { useEffect, useState } from 'preact/hooks'
import { WX_NAME, cachedWeather, forecastOpens, hasWeather, isWet, loadWeather, pickDays, roundChance, type Weather, type WxKind } from '../weather'
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
import { lookOf, stageOf, titleOf, type Job, type Look, type Stage } from '../avatar'
import { amount, bagText } from '../baggage'
import { Figure, FigureBody } from './Figure'
import { between, nextSpot, rng, seedOf } from '../random'
import { Mascot } from './Mascot'
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
  // 出發那天、第一班飛機還沒起飛：還不算旅行中，繼續倒數到起飛。
  const waitingFirst = dayIndex === 0 && !!flights[0] && flights[0].dep.local.slice(0, 10) === t && toInstant(flights[0].dep) > now
  const onTrip = dayIndex >= 0 && !waitingFirst
  // 現在正在飛的那一班（起飛了、還沒降落）：這段時間改顯示飛行中的動畫，倒數到抵達。
  const flying = flights.find((f) => toInstant(f.dep) <= now && now < toInstant(f.arr))

  // 小人：現在是哪個階段（查攻略、收行李、出發、旅行中），以及每個成員的行李收好了沒。
  const startMs = next ? toInstant(next.dep) : meta.startDate ? new Date(`${meta.startDate}T00:00`).getTime() : now
  const stage = stageOf(startMs - now, onTrip || (!!meta.endDate && t > meta.endDate))
  const me = trip.actor.pubkey
  // 自己排第一個。進度條上全團都站上去，人越多小人越小（crewSize）；機艙裡坐得下的都坐。
  const everyone = [...trip.members.all()].sort((a, b) => Number(b.id === me) - Number(a.id === me))
    .map((m) => ({ id: m.id, look: lookOf(m), packed: trip.packedOf(m.id) }))
  const cast = everyone
  const who: Who = { cast, stage }
  // 倒數結束了沒：已經在旅行中，或沒有要等的航班、出發日也過了。結束後小人搬到主圖下緣。
  const ended = onTrip || (!next && !(meta.startDate > t))

  return (
    <div>
      <div class="card hero">
        <div class="heroart">
          <Art theme={theme} />
          {/* 倒數結束後（旅行中、或已經沒有要等的航班）：整組小人從進度條搬到主圖下緣，照樣各走各的；正在飛的時候人都在機艙裡，主圖上不站人 */}
          {ended && !flying && (
            <div class="herocrew">
              {cast.map((m, i) => (
                <Roamer key={m.id} id={m.id} look={m.look} packed={m.packed} stage={stage} habit={habitOf(m.look.job, 50, i, lazyBefore(cast, i))} size={crewSize(cast.length) + 6} />
              ))}
            </div>
          )}
        </div>
        {/* 倒數：主圖正下方。旅行中只寫第幾天，沒有進度條 */}
        {flying ? (
          <Flying f={flying} now={now} place={placeName(flying.arr.tz, flights)} cast={everyone} back={flights.length > 1 && flights.indexOf(flying) >= flights.length / 2} />
        ) : onTrip ? (
          <div class="depart">
            <div class="depart-main"><div class="depart-days"><span>旅行第</span><b>{dayIndex + 1}</b><span>天</span></div></div>
          </div>
        ) : next ? (
          <Countdown who={who} ms={toInstant(next.dep) - now} />
        ) : meta.startDate > t ? (
          <Countdown who={who} ms={new Date(`${meta.startDate}T00:00`).getTime() - now} />
        ) : null}
        <div class="body">
        {/* 角色列表：全團每個人的小人、名字和稱號，全部列出來；一列排不下就換行 */}
        <div class="crew" style={`--cols:${crewCols(trip.members.all().length)}`}>
          {trip.members.all().map((m) => {
            const look = lookOf(m)
            return (
              <div class="crewman" key={m.id}>
                <Figure look={look} size={38} />
                <b>{m.nickname}</b>
                {titleOf(look) && <small>{titleOf(look)}</small>}
              </div>
            )
          })}
        </div>
        {editing && <div class="center"><button class="small" onClick={() => setSheet({ kind: 'trip' })}><Icon id="pencil" size={16} />修改行程</button></div>}
        </div>
      </div>

      {/* 目的地的天氣：看去程那班飛到哪裡 */}
      {flights[0] && hasWeather(flights[0].to) && (
        <WeatherCard airport={flights[0].to} start={meta.startDate} end={meta.endDate} />
      )}

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
            <div class="row wrap">
              {/* 託運行李額度：有填才顯示 */}
              {bagText(f) && <span class="chip mizu">{bagText(f)}</span>}
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

      {/* 成員與設定（邀請、修改紀錄、同步、備份）：不佔上面選單的位置，入口放在這裡 */}
      <a class="card tap morelink" href={`#/t/${meta.id}/more`} onClick={(e) => { e.preventDefault(); location.replace(`#/t/${meta.id}/more`) }}>
        <Icon id="people" size={26} />
        <span class="grow"><b>成員與設定</b><small class="muted">邀請、修改紀錄、同步、備份</small></span>
        <span class="go"><Chevron open={false} /></span>
      </a>

      <Farewell theme={theme} title={meta.title} />
      <EditBar on={editing} onChange={setEditing} row />

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
            <Mascot theme={auto} size={34} />
            <span>自動<br /><small class="muted">依目的地：{themeName(auto)}</small></span>
          </button>
          {THEMES.map((t) => (
            <button type="button" key={t.id} class={f.theme === t.id ? 'on' : ''} onClick={() => setF({ ...f, theme: t.id })}>
              <Mascot theme={t.id} size={34} />
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
    cabin: initial.cabin, aircraft: '', bags: '', bagKg: '', pnr: initial.pnr,
  } : {
    code: old?.code ?? '', from: old?.from ?? '', to: old?.to ?? '',
    depDate: old?.dep.local.slice(0, 10) ?? start, depTime: old ? hm(old.dep.local) : '', depTz: old?.dep.tz ?? '',
    arrDate: old?.arr.local.slice(0, 10) ?? start, arrTime: old ? hm(old.arr.local) : '', arrTz: old?.arr.tz ?? '',
    cabin: old?.cabin ?? '', aircraft: old?.aircraft ?? '',
    bags: old?.bags ? String(old.bags) : '', bagKg: old?.bagKg ? String(old.bagKg) : '',
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
      // 沒填就存 0（清掉原本填的）
      bags: amount(f.bags), bagKg: amount(f.bagKg),
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
        <div class="two">
          <Field label="託運行李幾件（可不填）"><input inputMode="numeric" value={f.bags} onInput={(e) => set({ bags: value(e) })} placeholder="1" /></Field>
          <Field label="每件幾公斤（可不填）"><input inputMode="decimal" value={f.bagKg} onInput={(e) => set({ bagKg: value(e) })} placeholder="23" /></Field>
        </div>
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


const two = (n: number): string => String(n).padStart(2, '0')



/**
 * 出發倒數：左邊是很大的天數，右邊是一秒一秒跳的時分秒，下面一條航線。
 * 進度條代表出發前的最後 14 天，越接近出發，拖行李的小人越靠近終點的圖釘。
 */
function Countdown({ ms, who }: { ms: number; who: Who }) {
  const c = countdown(ms)
  return (
    <div class="depart">
      <div class="depart-main">
        <div class="depart-days"><span>還有</span><b>{c.d}</b><span>天</span></div>
        <div class="depart-clock">
          <div><b>{two(c.h)}</b><span>時</span></div><i>:</i>
          <div><b>{two(c.m)}</b><span>分</span></div><i>:</i>
          {/* key 每秒換一次，數字會重新跳一下 */}
          <div><b key={c.s} class="tick">{two(c.s)}</b><span>秒</span></div>
        </div>
      </div>
      <Track p={1 - ms / (14 * 86_400_000)} who={who} />
    </div>
  )
}



/** 進度條上的小人：這趟的成員（自己排第一個）和現在的階段。 */
/** 機艙裡畫幾排座位、一排多寬；人比座位少時，多的座位空著。 */
/** 機艙平常畫幾排座位；人比這個多就加排（最多到一份行程的人數上限），機艙變長、整個畫面等比例縮小。 */
const CABIN_SEATS = 8
const CABIN_MAX = 12
const CABIN_PITCH = 38

/**
 * 飛行中：取代倒數和進度條。上面倒數到抵達，下面是從走道看過去的機艙側面：
 * 靠窗那排座位朝右，全團的人坐在中間幾排，其他座位空著；前面是走道。
 * back 是回程（後半的航班）：整個畫面左右相反。
 */
function Flying({ f, now, place, cast, back }: { f: Flight; now: number; place: string; cast: Who['cast']; back: boolean }) {
  const c = countdown(toInstant(f.arr) - now)
  const cloud = 'M0 14a8 8 0 0 1 8-8a12 12 0 0 1 22-2a9 9 0 0 1 12 10z'
  const seats = Math.max(CABIN_SEATS, Math.min(cast.length, CABIN_MAX))
  // 機艙多長（SVG 單位）：八排是 320，每多一排加一個排距
  const W = 16 + seats * CABIN_PITCH
  const rows = Array.from({ length: seats }, (_, i) => 12 + i * CABIN_PITCH)
  const people = cast.slice(0, seats)
  // 全團坐在一起，排在中間
  const first = Math.floor((seats - people.length) / 2)
  // 偶爾有一個人起身，沿走道走到機艙的一頭，停一下再走回來坐下（睡著的廢人不起來）。
  // x 是他現在要去的位置；ms 是走過去要多久；still 是到了、站著不動。
  const [walk, setWalk] = useState<{ id: string; x: number; ms: number; still: boolean } | null>(null)
  const ids = people.map((m) => m.id).join(',')
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const timers: number[] = []
    const later = (ms: number, fn: () => void) => { timers.push(window.setTimeout(fn, ms)) }
    const go = () => {
      const able = people.filter((m) => m.look.job !== 'lazy')
      const m = able[Math.floor(Math.random() * able.length)]
      if (!m) return
      const home = rows[first + people.indexOf(m)] + 14
      const to = Math.random() < 0.5 ? 10 + Math.random() * 16 : W - 26 + Math.random() * 16
      const ms = Math.round(Math.abs(to - home) * 38)
      const pause = 1600 + Math.random() * 1800
      setWalk({ id: m.id, x: home, ms: 0, still: true })
      later(80, () => setWalk({ id: m.id, x: to, ms, still: false }))
      later(80 + ms, () => setWalk({ id: m.id, x: to, ms, still: true }))
      later(80 + ms + pause, () => setWalk({ id: m.id, x: home, ms, still: false }))
      later(80 + ms * 2 + pause + 120, () => { setWalk(null); later(7000 + Math.random() * 9000, go) })
    }
    later(3500 + Math.random() * 4000, go)
    return () => { timers.forEach((t) => clearTimeout(t)); setWalk(null) }
  }, [ids])
  const walker = walk ? people.find((m) => m.id === walk.id) : undefined
  // 雲排兩輪，第二輪接在第一輪後面，往後飄一輪的距離剛好接回原位
  const clouds = [[10, 16, 0.45], [120, 22, 0.35], [215, 15, 0.4], [300, 23, 0.45]]
  const win = (x: number, extra: Record<string, string>) => <rect key={x} x={x + 9} y="14" width="15" height="20" rx="7" {...extra} />
  return (
    <div class="depart">
      <div class="depart-main">
        <div class="fly-label"><span>飛行中</span><b>{place || f.to}</b><span>還有多久抵達</span></div>
        <div class="depart-clock">
          <div><b>{two(c.d * 24 + c.h)}</b><span>時</span></div><i>:</i>
          <div><b>{two(c.m)}</b><span>分</span></div><i>:</i>
          <div><b key={c.s} class="tick">{two(c.s)}</b><span>秒</span></div>
        </div>
      </div>
      <svg class="cabin" viewBox={`0 0 ${W} 106`} aria-hidden="true">
        <defs>
          <clipPath id="cabwin">{rows.map((x) => win(x, {}))}</clipPath>
          {/* 坐著的人只留腰以上，腿另外畫成坐姿 */}
          <clipPath id="cabsit"><rect x="-30" y="-60" width="60" height="52.600" /></clipPath>
        </defs>
        {/* 回程整個機艙左右相反（座位朝左、雲往另一邊飄）；人再翻回來，才不會連臉和手上的東西都反了 */}
        <g transform={back ? `translate(${W} 0) scale(-1 1)` : undefined}>
        {/* 行李櫃 */}
        <rect x="0" y="0" width={W} height="7" fill="#fff" opacity="0.5" />
        {/* 窗戶：外面的天空和往後飄的雲 */}
        {rows.map((x) => win(x, { fill: '#dcebef' }))}
        <g clip-path="url(#cabwin)">
          <g class="cab-clouds" fill="#fff">
            {[0, 380, 760].map((off) => clouds.map(([x, y, s]) => (
              <path key={`${off}-${x}`} transform={`translate(${off + x} ${y}) scale(${s})`} d={cloud} />
            )))}
          </g>
        </g>
        {rows.map((x) => win(x, { fill: 'none', stroke: '#fff', 'stroke-width': '2.4' }))}
        {/* 走道 */}
        <rect x="0" y="92" width={W} height="28" fill="#fff" opacity="0.55" />
        {/* 靠窗那排座位（朝右）：椅背、頭枕、椅墊、椅腳；有人的座位上坐著人 */}
        {rows.map((x, i) => {
          const m = people[i - first]
          const lazy = m?.look.job === 'lazy'
          return (
            <g key={x}>
              <g transform={`rotate(-7 ${x + 4} 88)`}>
                <rect x={x} y="46" width="9" height="42" rx="4.500" fill="var(--accent)" />
                <rect x={x + 5} y="48" width="5" height="11" rx="2.500" fill="#fff" opacity="0.8" />
              </g>
              <rect x={x + 12} y="87" width="3" height="5" fill="var(--accent)" />
              <rect x={x + 3} y="80" width="24" height="8" rx="4" fill="var(--accent)" />
              {m && m.id !== walk?.id && (
                <g transform={`translate(${x + 14} 90.500) scale(${back ? -1.5 : 1.5} 1.5)`}>
                  <g class="cab-bob" style={`animation-delay:${-0.37 * i}s`}>
                    <path fill="none" stroke="#8a5a4a" stroke-width="2.600" stroke-linecap="round" stroke-linejoin="round" transform={back ? 'scale(-1 1)' : undefined} d="M-0.500 -6.500H6V-0.800" />
                    <g clip-path="url(#cabsit)">
                      {/* 廢人在飛機上是坐著睡：頭歪一邊，冒出 z */}
                      <g class={lazy ? 'cab-sleep' : undefined} transform={lazy ? 'rotate(-9 0 -10)' : undefined}>
                        <FigureBody look={lazy ? { ...m.look, job: '' } : m.look} stage="plan" packed={false} luggage={false} />
                      </g>
                    </g>
                    {lazy && <path class="a-blink" fill="none" stroke="var(--muted)" stroke-width="0.900" stroke-linecap="round" stroke-linejoin="round" d="M3 -27h2.600l-2.600 2.600h2.600M7.500 -31.500h2l-2 2h2" />}
                  </g>
                </g>
              )}
            </g>
          )
        })}
        {/* 起身的那個人：在走道上走 */}
        {walk && walker && (
          <g class="cab-walker" style={`transform:translateX(${walk.x.toFixed(1)}px);transition-duration:${walk.ms}ms`}>
            <g transform={`translate(0 103) scale(${back ? -1.5 : 1.5} 1.5)`}>
              <g class={walk.still ? undefined : 'traveler'}>
                <FigureBody look={walker.look} stage="plan" packed={false} luggage={false} walk={!walk.still} />
              </g>
            </g>
          </g>
        )}
        </g>
      </svg>
    </div>
  )
}

interface Who { cast: { id: string; look: Look; packed: boolean }[]; stage: Stage }


const WX_ICON: Record<WxKind, string> = { clear: 'sun', partly: 'partly', cloudy: 'cloud', fog: 'fog', rain: 'rain', snow: 'snow', mix: 'sleet', storm: 'storm' }

/**
 * 當地天氣：現在的氣溫，和行程每一天的預報（一天一格，多了左右滑；預報還沒到的那幾天是佔位的格子）。
 * 還太早、整趟都還沒有預報時，不列格子，改寫哪一天起會有。
 * 先顯示上次查到的，同時去查新的；完全查不到就不顯示這張卡片。
 */
function WeatherCard({ airport, start, end }: { airport: string; start: string; end: string }) {
  const [wx, setWx] = useState<Weather | null>(() => cachedWeather(airport))
  useEffect(() => {
    let gone = false
    void loadWeather(airport).then((w) => { if (!gone && w) setWx(w) })
    return () => { gone = true }
  }, [airport])
  if (!wx) return null
  const days = pickDays(wx, start, end)
  const inTrip = (date: string) => date >= start && date <= end
  const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`
  return (
    <div class="card weather">
      <div class="row">
        <Icon id={WX_ICON[wx.now.kind]} size={48} cls="a-float slow" />
        <div class="grow">
          <div class="wx-now"><b>{wx.now.temp}°</b><span>{WX_NAME[wx.now.kind]}</span></div>
          <div class="muted">{airportName(airport) || airport}現在・{ago(wx.at)}更新</div>
        </div>
      </div>
      {days.length === 0 ? (
        <p class="muted wx-wait">{md(forecastOpens(wx, start))} 起會有行程那幾天的預報。</p>
      ) : (
        <div class={`wx-days ${days.length > 5 ? 'scroll' : ''}`}>
          {days.map((d) => d.none ? (
            <div key={d.date} class="none">
              <small>{md(d.date)}</small>
              <i aria-hidden="true" />
              <span class="muted">還沒有</span>
            </div>
          ) : (
            <div key={d.date} class={inTrip(d.date) ? 'on' : ''}>
              <small>{md(d.date)}</small>
              <Icon id={WX_ICON[d.kind]} size={26} />
              <b>{d.hi}°</b><span class="muted">{d.lo}°</span>
              {/* 降水機率只在會下的日子顯示（雨、雪、雨夾雪、雷雨），取到 5%，只寫數字——是雨是雪看上面的圖示。
                  不下的日子留一行空白，每一格才會一樣高。 */}
              <small class="wx-rain">{isWet(d.kind) ? `${roundChance(d.rain)}%` : '\u00a0'}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


/** 每個角色在進度條上的習性。 */
interface Habit {
  /** 活動範圍：整條線的百分比，[最左, 最右]。 */
  range: [number, number]
  /** 走路的速度：每秒走整條線的百分之幾。 */
  speed: number
  /** 停下來做動作的時間，[最短, 最長] 秒；每次停多久是隨機的。 */
  pause: [number, number]
  /** 走一步（左右腳各一次）要幾秒：腿擺、身體搖晃、甩手的快慢。 */
  step: number
}

/**
 * at 是現在的進度（條紋的前端），i 是第幾個人（同角色的人步調再各差一點）。
 * 會走的角色都可以在整條線上走（不限在已經走過的那一段）；差別在速度、步調和停多久。廢人不走，躺在條紋前端的後面一點。
 */
/**
 * 角色列一列排幾個：一列最多五個，要換行時每列人數盡量平均
 * （6 人排 3、3；7 人 4、3；11 人 4、4、3；12 人 4、4、4，而不是 5、5、2）。
 */
export function crewCols(n: number): number {
  const rows = Math.max(1, Math.ceil(n / 5))
  return Math.max(1, Math.ceil(n / rows))
}

/** 這個人前面還有幾個廢人（排位置用）。 */
const lazyBefore = (cast: { look: Look }[], i: number): number => cast.slice(0, i).filter((m) => m.look.job === 'lazy').length

/** 進度條上的小人多大：三個人以內最大，人越多越小，全團才站得下、不會擠成一團。 */
function crewSize(n: number): number {
  return n <= 3 ? 58 : n <= 5 ? 50 : n <= 8 ? 42 : n <= 12 ? 34 : 28
}

function habitOf(job: Job, at: number, i: number, nth = 0): Habit {
  const jitter = (i % 3) * 0.04
  switch (job) {
    case 'guide': return { range: ALL, speed: 8, pause: [1.5, 3.5], step: 0.46 + jitter }
    case 'shopper': return { range: ALL, speed: 3.5, pause: [1, 2.5], step: 0.68 + jitter }
    case 'photo': return { range: ALL, speed: 2.4, pause: [2, 4.5], step: 0.82 + jitter }
    case 'cheer': return { range: ALL, speed: 15, pause: [0.8, 2], step: 0.3 + jitter }
    case 'lazy': {
      // 廢人不走，躺在進度的後面一點。nth 是他前面還有幾個廢人：不只一個時照順序往右錯開，才不會疊在一起
      const spot = Math.min(Math.max(at - 10, 4) + nth * 9, 92)
      return { range: [spot, spot], speed: 0, pause: [1, 1], step: 1 }
    }
    default: return { range: ALL, speed: 5.5, pause: [1.5, 4], step: 0.56 + jitter }
  }
}

/** 會走的角色的活動範圍：整條線，兩端各留一點，小人才不會走出卡片。 */
const ALL: [number, number] = [5, 95]

/** 使用者是否要求減少動態效果：是的話小人站著不走。 */
const stillMode = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * 進度條上的一個小人：隨機挑一個位置走過去，到了停下來做自己角色的動作（導遊揮旗、攝影拍照、氣氛擔當跳…），
 * 停一段隨機的時間後再挑下一個位置。走到哪、停多久都由隨機數決定，每個人不一樣，每次打開也不一樣。
 */
function Roamer({ id, look, packed, stage, habit, size }: {
  id: string; look: Look; packed: boolean; stage: Stage; habit: Habit; size: number
}) {
  const [lo, hi] = habit.range
  const fixed = hi - lo <= 2
  // 種子用成員代號加上現在的時間：同一個人每次打開走的路線都不同
  const [r] = useState(() => rng(seedOf(id) ^ Date.now()))
  const [pos, setPos] = useState(() => (fixed ? lo : between(r, lo, hi)))
  const [secs, setSecs] = useState(0)
  const [face, setFace] = useState(1)
  const [walking, setWalking] = useState(false)

  useEffect(() => {
    if (fixed || stillMode()) return
    let timer = 0
    let here = Math.min(hi, Math.max(lo, pos))
    const walk = () => {
      const to = nextSpot(r, here, lo, hi, 8)
      const t = Math.abs(to - here) / habit.speed
      setFace(to > here ? 1 : -1)
      setSecs(t)
      setPos(to)
      setWalking(true)
      here = to
      timer = window.setTimeout(act, t * 1000)
    }
    const act = () => {
      setWalking(false)
      timer = window.setTimeout(walk, between(r, habit.pause[0], habit.pause[1]) * 1000)
    }
    // 一開始先停一下再出發，每個人起步的時間錯開
    timer = window.setTimeout(walk, between(r, 0.3, 2.5) * 1000)
    return () => clearTimeout(timer)
    // 範圍（跟著進度的整數百分比）或速度變了才重來；pos 是它自己在改，不能列進來
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lo, hi, habit.speed, fixed])

  return (
    <span class={`roamer ${walking ? '' : 'acting'}`} style={`left:${pos}%;transition:left ${walking ? secs : 0}s linear;--step:${habit.step}s`}>
      <span class="face" style={`transform:scaleX(${face})`}>
        {/* 出發前最後 24 小時（go）：每個人拖著自己的行李箱走；其他時候不帶行李 */}
        <Figure look={look} stage={stage === 'trip' || stage === 'go' ? stage : 'plan'} packed={packed} luggage={stage === 'go'} walk={walking} size={size} cls={walking ? 'traveler' : ''} />
      </span>
    </span>
  )
}

/**
 * 進度條：走過的那段是往前滑的斜條紋；全團的小人在線上各走各的，出發前最後 24 小時每個人拖著行李箱。p 是 0 到 1。
 */
function Track({ p, who }: { p: number; who: Who }) {
  // 取整數百分比：進度每秒都在變一點點，小人的活動範圍不用跟著每秒重算
  const at = Math.round(Math.max(0.14, Math.min(0.9, p)) * 100)
  return (
    <div class="depart-track">
      <i style={`width:${at}%`} />
      {who.cast.map((m, i) => (
        <Roamer key={m.id} id={m.id} look={m.look} packed={m.packed} stage={who.stage} habit={habitOf(m.look.job, at, i, lazyBefore(who.cast, i))} size={crewSize(who.cast.length)} />
      ))}
    </div>
  )
}
