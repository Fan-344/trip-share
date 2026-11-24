// 行李重量：每個人填自己現在的行李幾公斤，對照航班的託運額度看誰還有空位、誰超重。算法在 src/luggage.ts。
import { useState } from 'preact/hooks'
import { amount } from '../baggage'
import { lookOf, titleOf } from '../avatar'
import { allowanceOf, barParts, ledger, pickLeg, type LuggageState, type Row } from '../luggage'
import type { Trip } from '../model/trip'
import { fullDay } from '../time'
import { Empty, Farewell } from './bits'
import { Figure } from './Figure'
import { Icon } from './Icons'
import { Field, Sheet, useNow, value } from './kit'
import type { TabProps } from './TripPage'

/** 「行李」分頁：全團的行李重量。航班還沒填託運額度的話，先說明要去哪裡填。 */
export function LuggagePage({ trip, theme }: TabProps) {
  const hasLeg = !!pickLeg(trip.flights.all(), Date.now())
  return (
    <div>
      {hasLeg ? <LuggageCard trip={trip} /> : (
        <Empty icon="luggage">
          {trip.flights.all().length === 0 ? '還沒有航班。' : '航班還沒填行李額度。'}
          <span class="muted">到「總覽」按編輯，在航班裡填託運幾件、每件幾公斤，這裡就會出現全團的行李重量。</span>
        </Empty>
      )}
      <Farewell theme={theme} title={trip.meta.title} />
    </div>
  )
}

/**
 * 重量的進度條。底下那條軌道比整列短一截，長度固定，代表額度；沒超過時用掉多少就填多少。
 * 超過額度時，超出的公斤數畫成紅色線段，從軌道的尾端突破出去，伸進右邊預留的空白。
 * （超過得比預留的還多時，軌道會縮短一點，讓紅色那段裝得下。）
 */
function Gauge({ kg, each, cls = '' }: { kg: number; each: number; cls?: string }) {
  const p = barParts(kg, each)
  const pct = each > 0 ? Math.round((kg / each) * 100) : 0
  return (
    <div class={`gauge ${cls}`} role="img" aria-label={`用了額度的 ${pct}%`}>
      <span class="track" style={`width:${p.limit}%`} />
      {p.ok > 0 && <i class={p.over > 0 ? 'full' : ''} style={`width:${p.ok}%`} />}
      {p.over > 0 && <i class="over" style={`left:${p.limit}%;width:${p.over}%`} />}
    </div>
  )
}

/** 存在成員資料裡的狀態（可能是舊資料沒有、或別的版本寫的值）整理成認得的三種。 */
const stateOf = (v: unknown): LuggageState => (v === 'full' || v === 'help' ? v : '')

/**
 * 兩顆狀態按鈕：「我的行李滿了」和「救救我」。按了只會在自己那一列貼上一張貼紙給大家看，不影響任何計算。
 * 再按一次同一顆就取消；兩個不會同時成立。全團都看得到。
 */
function StateButtons({ state, onPick }: { state: LuggageState; onPick: (s: LuggageState) => void }) {
  const pick = (s: LuggageState) => onPick(state === s ? '' : s)
  return (
    <div class="two lug-state">
      <button type="button" class={`small ${state === 'full' ? 'on' : ''}`} aria-pressed={state === 'full'} onClick={() => pick('full')}>
        {state === 'full' && <Icon id="check" size={16} />}我的行李滿了
      </button>
      <button type="button" class={`small help ${state === 'help' ? 'on' : ''}`} aria-pressed={state === 'help'} onClick={() => pick('help')}>
        {state === 'help' && <Icon id="check" size={16} />}救救我
      </button>
    </div>
  )
}

/** 去掉多餘的小數：18 就寫 18，18.5 寫 18.5。 */
const kgText = (n: number) => String(Math.round(n * 10) / 10)

/**
 * 行李分頁的內容。航班有填託運額度才出現（沒填就沒有東西可以比）。
 * 最上面是自己的行李，直接在大格子裡填；下面是全團每個人的狀況。
 * 每個人只能改自己的公斤數；不用手機的成員（小孩、長輩）自己填不了，所以誰都可以幫他們填。
 */
export function LuggageCard({ trip }: { trip: Trip }) {
  const now = useNow(60_000)
  const [picked, setPicked] = useState<string | null>(null)
  const leg = pickLeg(trip.flights.all(), now)
  if (!leg) return null
  const me = trip.actor.pubkey
  const members = trip.members.all()
  const l = ledger(members.map((m) => ({ id: m.id, name: m.nickname, kg: m.luggageKg && m.luggageKg > 0 ? m.luggageKg : 0 })), allowanceOf(leg))
  const nameOf = (id: string) => trip.nicknameOf(id)
  const memberOf = (id: string) => members.find((m) => m.id === id)!
  const who = members.find((m) => m.id === picked && m.managed)
  const mine = l.rows.find((r) => r.id === me)
  const bar = (r: Row) => <Gauge kg={r.kg} each={l.each} cls="lug-bar" />
  // 自己按的狀態：只是貼在那一列名字旁邊的貼紙，不影響上面的數字和下面的建議
  const sticker = (id: string) => {
    const s = stateOf(memberOf(id).luggageState)
    return s ? <span class={`lug-sticker ${s}`}>{s === 'full' ? '滿了' : '救救我'}</span> : null
  }
  const status = (r: Row) => !r.filled ? <span class="chip">還沒填</span>
    : r.left < 0 ? <span class="chip coral">超過 {kgText(-r.left)}</span>
    : <span class="chip green">還有 {kgText(r.left)}</span>
  return (
    <div>
      <h2 class="plain"><Icon id="luggage" size={24} />行李重量</h2>
      {mine && (
        <div class="card lug-mine">
          <Figure look={lookOf(memberOf(me))} stage="go" size={84} sos={stateOf(memberOf(me).luggageState) === 'help'} />
          <div class="grow">
            <div class="row"><b>我的行李</b>{sticker(me)}<span class="grow" />{status(mine)}</div>
            <MyWeight kg={mine.kg} onSave={(kg) => trip.members.update(me, { luggageKg: kg })} />
            {bar(mine)}
            <StateButtons state={stateOf(memberOf(me).luggageState)} onPick={(s) => trip.members.update(me, { luggageState: s })} />
          </div>
        </div>
      )}
      <div class="card">
        <div class="row wrap">
          <span class="chip yellow">{leg.code}</span>
          <span class="muted grow">
            {fullDay(leg.dep.local.slice(0, 10))}・每人 {kgText(l.each)} 公斤
            {leg.bags && leg.bags > 1 ? `（${leg.bags} 件 × ${kgText(leg.bagKg ?? 0)}）` : ''}
          </span>
        </div>
        <p class="lug-total">
          {l.used === 0 ? <span>全團一共可以帶 <b>{kgText(l.total)}</b> 公斤</span>
            : l.left >= 0 ? <span>全團還能裝 <b>{kgText(l.left)}</b> 公斤</span>
            : <span>全團超重 <b class="over">{kgText(-l.left)}</b> 公斤</span>}
        </p>
        <Gauge kg={l.used} each={l.total} />
        <ul class="plain">
          {l.rows.map((r) => {
            const m = memberOf(r.id)
            const look = lookOf(m)
            // 只有不用手機的成員可以由別人代填；自己的在上面那一格填
            const canFill = !!m.managed
            return (
              <li class={`row wrap lug-row ${canFill ? 'tapRow' : ''}`} key={r.id} role={canFill ? 'button' : undefined} onClick={canFill ? () => setPicked(r.id) : undefined}>
                <Figure look={look} size={40} sos={stateOf(m.luggageState) === 'help'} />
                <span class="grow lug-name">
                  <span>{r.name}{r.id === me && <span class="muted">（我）</span>}{sticker(r.id)}</span>
                  {titleOf(look) && <small class="muted">{titleOf(look)}</small>}
                </span>
                {r.filled && <span class="muted">{kgText(r.kg)} 公斤</span>}
                {status(r)}
                {canFill && <Icon id="pencil" size={16} />}
                {/* 這個人的行李佔了自己額度的幾成；超過就整條變紅 */}
                {bar(r)}
              </li>
            )
          })}
        </ul>
        {l.moves.map((m) => (
          <p class="muted" key={`${m.from}>${m.to}`}>{nameOf(m.from)} 可以分 {kgText(m.kg)} 公斤給 {nameOf(m.to)}。</p>
        ))}
      </div>
      {who && <WeightSheet trip={trip} id={who.id} name={who.nickname} kg={who.luggageKg ?? 0} state={stateOf(who.luggageState)} onClose={() => setPicked(null)} />}
    </div>
  )
}

/**
 * 自己的行李重量：一個大格子，直接打數字。離開格子或按鍵盤的完成就存；空著就是清掉。
 * 別的手機同步進來新的數字時，沒有正在打字才跟著換。
 */
function MyWeight({ kg, onSave }: { kg: number; onSave: (kg: number) => void }) {
  const shown = kg > 0 ? kgText(kg) : ''
  const [text, setText] = useState(shown)
  const [typing, setTyping] = useState(false)
  if (!typing && text !== shown) setText(shown)
  const save = () => {
    setTyping(false)
    const next = amount(text)
    if (next !== kg) onSave(next)
    setText(next > 0 ? kgText(next) : '')
  }
  return (
    <form class="lug-input" onSubmit={(e) => { e.preventDefault(); (e.currentTarget.querySelector('input') as HTMLInputElement).blur() }}>
      <input inputMode="decimal" aria-label="我的行李幾公斤" value={text} placeholder="0"
        onFocus={() => setTyping(true)} onInput={(e) => setText(value(e))} onBlur={save} />
      <span>公斤</span>
    </form>
  )
}

function WeightSheet({ trip, id, name, kg, state, onClose }: { trip: Trip; id: string; name: string; kg: number; state: LuggageState; onClose: () => void }) {
  const [text, setText] = useState(kg > 0 ? kgText(kg) : '')
  const [st, setSt] = useState<LuggageState>(state)
  return (
    <Sheet title={`${name}的行李`} onClose={onClose}>
      <form onSubmit={(e) => {
        e.preventDefault()
        // 沒填或填 0 就是清掉
        trip.members.update(id, { luggageKg: amount(text), luggageState: st })
        onClose()
      }}>
        <Field label="現在大約幾公斤（託運的全部加起來）">
          <input inputMode="decimal" value={text} onInput={(e) => setText(value(e))} placeholder="例如 18.5" />
        </Field>
        <p class="muted">空著存就是清掉。</p>
        <StateButtons state={st} onPick={setSt} />
        <div class="actions"><button class="primary">儲存</button></div>
      </form>
    </Sheet>
  )
}
