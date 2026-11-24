// 行李重量：每個人填自己現在的行李幾公斤，對照航班的託運額度看誰還有空位、誰超重。算法在 src/luggage.ts。
import { useState } from 'preact/hooks'
import { amount } from '../baggage'
import { allowanceOf, ledger, pickLeg } from '../luggage'
import type { Trip } from '../model/trip'
import { fullDay } from '../time'
import { Empty, Farewell } from './bits'
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

/** 去掉多餘的小數：18 就寫 18，18.5 寫 18.5。 */
const kgText = (n: number) => String(Math.round(n * 10) / 10)

/**
 * 行李分頁的主卡片。航班有填託運額度才出現（沒填就沒有東西可以比）。
 * 點一個人的那一列就能填他的重量：誰都可以幫誰填（小孩、長輩的由別人代填）。
 */
export function LuggageCard({ trip }: { trip: Trip }) {
  const now = useNow(60_000)
  const [picked, setPicked] = useState<string | null>(null)
  const leg = pickLeg(trip.flights.all(), now)
  if (!leg) return null
  const members = trip.members.all()
  const l = ledger(members.map((m) => ({ id: m.id, name: m.nickname, kg: m.luggageKg && m.luggageKg > 0 ? m.luggageKg : 0 })), allowanceOf(leg))
  const nameOf = (id: string) => trip.nicknameOf(id)
  const who = members.find((m) => m.id === picked)
  return (
    <div>
      <h2 class="plain"><Icon id="luggage" size={24} />行李重量</h2>
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
        <div class="bar"><i class={l.left < 0 ? 'over' : ''} style={`width:${l.total ? Math.min(100, (l.used / l.total) * 100) : 0}%`} /></div>
        <ul class="plain">
          {l.rows.map((r) => (
            <li class="row tapRow" key={r.id} role="button" onClick={() => setPicked(r.id)}>
              <span class="grow">{r.name}</span>
              {r.filled && <span class="muted">{kgText(r.kg)} 公斤</span>}
              {!r.filled ? <span class="chip">還沒填</span>
                : r.left < 0 ? <span class="chip coral">超過 {kgText(-r.left)}</span>
                : <span class="chip green">還有 {kgText(r.left)}</span>}
            </li>
          ))}
        </ul>
        {l.moves.map((m) => (
          <p class="muted" key={`${m.from}>${m.to}`}>{nameOf(m.from)} 可以分 {kgText(m.kg)} 公斤給 {nameOf(m.to)}。</p>
        ))}
        {l.blank > 0 && l.used > 0 && <p class="muted">還有 {l.blank} 個人沒填，上面的數字先當他們是空的。</p>}
        {l.used === 0 && <p class="muted">點名字填現在的行李重量。</p>}
      </div>
      {who && <WeightSheet trip={trip} id={who.id} name={who.nickname} kg={who.luggageKg ?? 0} onClose={() => setPicked(null)} />}
    </div>
  )
}

function WeightSheet({ trip, id, name, kg, onClose }: { trip: Trip; id: string; name: string; kg: number; onClose: () => void }) {
  const [text, setText] = useState(kg > 0 ? kgText(kg) : '')
  return (
    <Sheet title={`${name}的行李`} onClose={onClose}>
      <form onSubmit={(e) => {
        e.preventDefault()
        // 沒填或填 0 就是清掉
        trip.members.update(id, { luggageKg: amount(text) })
        onClose()
      }}>
        <Field label="現在大約幾公斤（託運的全部加起來）">
          <input inputMode="decimal" value={text} onInput={(e) => setText(value(e))} placeholder="例如 18.5" />
        </Field>
        <p class="muted">空著存就是清掉。</p>
        <div class="actions"><button class="primary">儲存</button></div>
      </form>
    </Sheet>
  )
}
