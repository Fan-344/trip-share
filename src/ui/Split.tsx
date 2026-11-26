// 分帳：記一筆花費（金額、誰分擔），算出誰該給誰多少。計算在 src/split.ts。
// 付錢的人就是記這筆的人；分擔者預設是有手機的成員（小孩、長輩通常不出錢），平分。
import { useEffect, useState } from 'preact/hooks'
import { lookOf } from '../avatar'
import type { Trip } from '../model/trip'
import type { Expense, Member, Meta } from '../model/types'
import type { PhotoStore } from '../store/photos'
import { currencyChoices, detectCurrency, startCurrency } from '../money'
import { fetchRates } from '../rates'
import { draftOf, isProxy, type ProxyDraft } from '../proxy'
import { HOME, convert, leftOf, money, parseAmount, portions, settle, tallies, tallyIn, type Tally, type Transfer } from '../split'
import { dayLabel, daysBetween, fullDay, today } from '../time'
import { Empty, Farewell } from './bits'
import { Figure } from './Figure'
import { Chevron, Fold } from './fold'
import { Icon } from './Icons'
import { Field, Sheet, value } from './kit'
import { Photo } from './Shop'
import { Stepper } from './Stepper'
import type { TabProps } from './TripPage'

type Row = Expense & Meta
type Who = Member & Meta
type View = 'proxy' | 'log' | 'result'

/** 清單上最多列出幾個人名；再多就只寫幾個人（列出來會佔三四行），人名在展開或修改時看。 */
const MAX_NAMES = 5

export function Split({ trip, theme, photos }: TabProps) {
  const me = trip.actor.pubkey
  const [sheet, setSheet] = useState<{ id?: string; draft?: ProxyDraft } | null>(null)
  const [open, setOpen] = useState('')
  const all = trip.expenses.all()
  const members = trip.members.all()
  const rates = trip.rates()
  // 兩種預設幣別（成員與設定頁可以改）：結帳用的沒指定就是台幣，當地用的沒指定就照目的地判斷
  const setup = trip.currencySetup()
  const home = setup.home || HOME
  const s = settle(all, rates, home)
  const spent = all.filter((e) => !e.settle)
  // 清單照日期分組；Day 1 以前的（出發前先付的機票、訂金）合成一組，用空字串當代號，排序時自然在最前面
  const groupOf = (date: string) => (trip.meta.startDate && date < trip.meta.startDate ? '' : date)
  const dates = [...new Set(all.map((e) => groupOf(e.date)))].sort()
  const range = daysBetween(trip.meta.startDate, trip.meta.endDate)
  // 購物清單裡買到了、有幫別人買的：每一項三種狀態——還沒處理（todo）、登錄了（done，有一筆分帳是從它來的）、不用分（skip）。
  // 三種都一直列著，按錯可以改回來；處理過的（登錄了、不用分）排到下面，還沒處理的留在上面。
  const fallbackCur = setup.local || detectCurrency(trip.flights.all(), trip.items.all().map((i) => i.tz), trip.meta.theme ?? '').currency
  const proxyAll = trip.shopItems().filter(isProxy).map((i) => {
    const d = draftOf(i, fallbackCur, today())
    const e = all.find((x) => x.shopId === i.id)
    return { d, e, state: e ? 'done' as const : d.skipped ? 'skip' as const : 'todo' as const }
  })
  const proxy = [...proxyAll.filter((p) => p.state === 'todo'), ...proxyAll.filter((p) => p.state !== 'todo')]
  const todo = proxyAll.filter((p) => p.state === 'todo').length
  /** 登錄：照草稿直接記一筆；還沒有金額就先開面板填。已經登錄的再按一次是取消登錄。 */
  const register = (d: ProxyDraft, e: Row | undefined) => {
    if (e) return trip.expenses.remove(e.id)
    if (d.amount <= 0) return setSheet({ draft: d })
    if (d.skipped) trip.shop.update(d.shopId, { noSplit: false })
    trip.expenses.create({ title: d.title, amount: d.amount, cur: d.cur, date: d.date, payer: d.payer, sharers: d.sharers, shares: d.shares, shopId: d.shopId })
  }
  /** 不用分：登錄過的先把那筆拿掉。再按一次改回還沒處理。 */
  const skip = (d: ProxyDraft, e: Row | undefined) => {
    if (e) trip.expenses.remove(e.id)
    trip.shop.update(d.shopId, { noSplit: e ? true : !d.skipped })
  }

  /**
   * 這筆轉帳付了：記成一筆還款，欠的就抵掉。
   * 有外幣的話順便把匯率固定在現在（等於打開「自己填」）：還款是照現在的匯率算的，
   * 匯率要是隔天又變，還清的帳會再冒出幾塊錢零頭。之後新記的帳還是會算進來。
   */
  const paid = (t: Transfer) => {
    if (s.foreign.length > 0 && !trip.rateInfo().manual) trip.setRateManual(true)
    trip.expenses.create({ title: '', amount: t.amount, cur: t.cur, date: today(), payer: t.from, sharers: [t.to], settle: true })
  }

  // 分帳結果只講跟我有關的轉帳；每個人的明細收在最下面
  const give = s.transfers.filter((t) => t.from === me)
  const take = s.transfers.filter((t) => t.to === me)
  const detail = tallies(all)
  // 匯率：沒有改成自己填時，每天自動抓一次（今天還沒抓過，或有外幣還沒有匯率）。同一個狀況只試一次，抓不到就等人按。
  // 放在這裡而不是匯率那一塊裡，因為那一塊收在明細裡、沒打開時不會畫出來。
  const info = trip.rateInfo()
  const [rateState, setRateState] = useState<'' | 'loading' | 'failed'>('')
  const stale = !info.manual && s.foreign.length > 0 && (info.day !== today() || s.foreign.some((c) => !(rates[c] > 0)))
  const loadRates = async () => {
    setRateState('loading')
    try {
      const got = await fetchRates(s.foreign, home)
      trip.setFetchedRates(got, today())
      setRateState(s.foreign.every((c) => got[c] > 0) ? '' : 'failed')
    } catch {
      setRateState('failed')
    }
  }
  useEffect(() => {
    if (stale) void loadRates()
  }, [stale, s.foreign.join(), today()])

  // 明細用哪種幣別看：預設台幣，在匯率卡片裡的開關切換
  // 明細用哪種幣別看：沒選就是結帳幣別
  const [pickedCur, setShowCur] = useState('')
  const showCur = pickedCur || home
  // 「你要給／你要收」的金額也跟著開關換算；缺匯率換不了就照原本的幣別。按「我付了／收到了」記下的仍是原本那筆。
  const shown = (t: Transfer) => {
    const n = convert(t.amount, t.cur, showCur, rates, home)
    return n === null ? { n: t.amount, cur: t.cur } : { n, cur: showCur }
  }
  // 三頁：代買登錄、記帳、分帳結果。上面那排長得跟行程的日期一樣，每一格下面一行小字是現況。
  const [picked, setPicked] = useState<View>('log')
  const views: [View, string][] = [['proxy', '代買登錄'], ['log', '記帳'], ['result', '分帳結果']]

  return (
    <div>
      <div class="days split-views">
        {views.map(([key, label]) => (
          <button key={key} class={`day ${key === picked ? 'on' : ''}`} aria-pressed={key === picked} onClick={() => setPicked(key)}>
            <b>{label}</b>
          </button>
        ))}
      </div>

      {/* key 用頁名：換一頁時整段重新進場 */}
      <div key={picked}>
        {picked === 'proxy' && (
          <div>
            {proxy.length === 0 && <Empty icon="bag">還沒有代買的東西。</Empty>}
            {proxy.map(({ d, e, state }) => {
              // 登錄過的顯示實際記下的那一筆（金額、每人幾份可能改過）
              const amount = e ? e.amount : d.amount
              const cur = e ? e.cur : d.cur
              const each = e ? e.shares ?? null : d.shares
              const who = e ? e.sharers : d.sharers
              return (
                <div class={`card split-proxy ${state}`} key={d.shopId}>
                  <div class="row">
                    <span class="grow">
                      <b class="title">{d.title}</b>
                      <small class="muted split-who-line">
                        <span>{trip.nicknameOf(e ? e.payer : d.payer)} 買的・</span>
                        {who.length > MAX_NAMES
                          ? <span>{who.length} 人{each ? `共 ${who.reduce((sum, id) => sum + (each[id] ?? 0), 0)} 個` : '平分'}</span>
                          : who.map((id, i) => <span key={id}>{trip.nicknameOf(id)}{each ? ` ×${each[id] ?? 0}` : ''}{i < who.length - 1 ? '、' : each ? '' : '（平分）'}</span>)}
                      </small>
                    </span>
                    {amount > 0
                      ? <b>{money(amount)}<small>{cur}</small></b>
                      : <span class="chip coral">還沒填價錢</span>}
                  </div>
                  {state === 'todo' && d.unit > 0 && <small class="muted">單價 {money(d.unit)} × {d.count} 個</small>}
                  <div class="split-acts">
                    <button class={`small ${state === 'done' ? 'on' : ''}`} aria-pressed={state === 'done'} onClick={() => register(d, e)}>
                      {state === 'done' ? '已登錄' : '登錄'}
                    </button>
                    <button class="small" onClick={() => setSheet(e ? { id: e.id } : { draft: d })}>修改</button>
                    <button class={`small ${state === 'skip' ? 'on' : ''}`} aria-pressed={state === 'skip'} onClick={() => skip(d, e)}>不用分</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {picked === 'log' && (
          <div>
            <button class="primary block" onClick={() => setSheet({})}><Icon id="plus" size={18} />記一筆</button>
            {all.length === 0 && <Empty icon="coin">還沒有人記帳。</Empty>}
            {dates.map((date) => {
              const n = range.indexOf(date)
              return (
                <div key={date || 'before'}>
                  <div class="shopday">
                    <Icon id="calendar" size={26} />
                    <span><b>{date === '' ? '出發前' : `${n >= 0 ? `Day ${n + 1}・` : ''}${fullDay(date)}`}</b></span>
                  </div>
                  {all.filter((e) => groupOf(e.date) === date).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt).map((e) => (
                    <Entry key={e.id} trip={trip} photos={photos} e={e} me={me} open={open === e.id}
                      onToggle={() => setOpen(open === e.id ? '' : e.id)} onEdit={() => setSheet({ id: e.id })} />
                  ))}
                </div>
              )
            })}
          </div>
        )}

        {picked === 'result' && (
          <div>
            {/* 這一頁只講跟我有關的：要給誰多少、要跟誰收多少。其他人之間的、怎麼算出來的，收在最下面的「全部明細」。 */}
            {spent.length === 0 ? (
              <div class="card"><p class="muted" style="margin:0">還沒有帳可以算。</p></div>
            ) : give.length + take.length === 0 ? (
              <div class="card center"><span class="stamp" style="margin:0"><Icon id="star" size={18} />你都結清了</span></div>
            ) : null}

            {give.length > 0 && <h2 class="plain"><Icon id="coin" size={24} />你要給</h2>}
            {give.map((t) => (
              <div class="card split-due give" key={`${t.to}>${t.cur}`}>
                <Person m={members.find((m) => m.id === t.to)} name={trip.nicknameOf(t.to)} />
                <b class="grow">{money(shown(t).n)}<small>{shown(t).cur}</small></b>
                <button class="small" onClick={() => paid(t)}>我付了</button>
              </div>
            ))}

            {take.length > 0 && <h2 class="plain"><Icon id="coin" size={24} />你要收</h2>}
            {take.map((t) => (
              <div class="card split-due" key={`${t.from}>${t.cur}`}>
                <Person m={members.find((m) => m.id === t.from)} name={trip.nicknameOf(t.from)} />
                <b class="grow">{money(shown(t).n)}<small>{shown(t).cur}</small></b>
                <button class="small" onClick={() => paid(t)}>收到了</button>
              </div>
            ))}
            {todo > 0 && <p class="muted center">還有 {todo} 筆代買沒登錄</p>}

            {spent.length > 0 && (
              <Fold title="全部明細">
                <Detail trip={trip} transfers={s.transfers} foreign={s.foreign} detail={detail} rates={rates} cur={showCur} home={home} />
                {/* 匯率卡片放在明細最下面：切換幣別、修改匯率都在裡面 */}
                {s.foreign.length > 0 && <Rates trip={trip} foreign={s.foreign} rates={rates} info={info} state={rateState} load={loadRates} cur={showCur} home={home} onCur={setShowCur} />}
              </Fold>
            )}
          </div>
        )}
      </div>

      <Farewell theme={theme} title={trip.meta.title} />
      {sheet && <ExpenseSheet trip={trip} members={members} id={sheet.id} draft={sheet.draft} days={range} onClose={() => setSheet(null)} />}
    </div>
  )
}

function Person({ m, name }: { m: Who | undefined; name: string }) {
  return (
    <span class="split-person">
      {m && <Figure look={lookOf(m)} size={34} luggage={false} />}
      <small>{name}</small>
    </span>
  )
}
/**
 * 全部明細：所有人的轉帳、每個人先付多少／該出多少／還差多少。
 * 一次只看一種幣別——有外幣時上面一排切換，各幣別的帳照匯率換成選的那一種再加起來。
 */
function Detail({ trip, transfers, foreign, detail, rates, cur, home }: {
  trip: Trip; transfers: Transfer[]; foreign: string[]; detail: Record<string, Record<string, Tally>>; rates: Record<string, number>; cur: string; home: string
}) {
  const show = cur === home || foreign.includes(cur) ? cur : home
  const merged = tallyIn(detail, rates, show, home)
  // 缺匯率換不了的時候，只能看用這個幣別付的帳
  const rows = merged ?? detail[show] ?? {}
  return (
    <div>
      {foreign.length > 0 && !merged && <p class="muted" style="margin:8px 0 0">還沒有匯率，只列{show}的帳。</p>}

      <b style="display:block;margin-top:12px">所有人的轉帳</b>
      {transfers.length === 0 && <p class="muted" style="margin:4px 0 0">大家都結清了。</p>}
      {transfers.map((t) => {
        const n = convert(t.amount, t.cur, show, rates, home)
        return (
          <div class="row split-line" key={`${t.from}>${t.to}>${t.cur}`}>
            <span class="grow">{trip.nicknameOf(t.from)} 給 {trip.nicknameOf(t.to)}</span>
            <span>{n === null ? `${money(t.amount)} ${t.cur}` : `${money(n)} ${show}`}</span>
          </div>
        )
      })}

      <b style="display:block;margin-top:14px">每個人的帳（{show}）</b>
      <div class="split-table" role="table">
        <div role="row" class="muted"><span role="columnheader" /><span role="columnheader">先付</span><span role="columnheader">該出</span><span role="columnheader">還差</span></div>
        {Object.entries(rows).map(([id, row]) => {
          const left = leftOf(row)
          return (
            <div role="row" key={id}>
              <span role="cell">{trip.nicknameOf(id)}</span>
              <span role="cell">{money(row.paid)}</span>
              <span role="cell">{money(row.owed)}</span>
              <span role="cell" class={left < 0 ? 'owe' : ''}>{left > 0 ? `收 ${money(left)}` : left < 0 ? `給 ${money(-left)}` : '0'}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * 匯率：平常每天自動抓一次；打開「自己填」就不再自動抓，照填的算（例如實際換到的匯率）。
 * 抓的動作在上面（Split）做，這裡只管顯示和開關。
 */
function Rates({ trip, foreign, rates, info, state, load, cur: showing, home, onCur }: {
  trip: Trip; foreign: string[]; rates: Record<string, number>; info: { day: string; manual: boolean }; state: '' | 'loading' | 'failed'; load: () => void; home: string
  /** 明細現在用哪種幣別看、換一種。 */
  cur: string; onCur: (cur: string) => void
}) {
  return (
    <div class="card flat split-rates">
      <b>匯率</b>
      {foreign.map((cur, i) => (
        <div class="row split-raterow" key={cur}>
          {info.manual
            ? <RateRow key={`${cur}:${rates[cur] ?? 0}`} cur={cur} rate={rates[cur] ?? 0} home={home} onSet={(n) => trip.setRate(cur, n)} />
            : <div class="split-rate grow">1 {cur} ＝ <b>{rates[cur] > 0 ? rates[cur] : '還沒抓到'}</b> {home}</div>}
          {/* 重抓是一次抓全部外幣，按鈕只放在第一列後面 */}
          {!info.manual && i === 0 && (
            <button class="small" disabled={state === 'loading'} onClick={load}>{state === 'loading' ? '抓匯率中…' : state === 'failed' ? '抓不到，再試' : '現在重抓'}</button>
          )}
        </div>
      ))}
      {/* 明細預設用台幣看；打開哪個外幣的開關，下面就換成那個幣別（一次只開一個） */}
      {foreign.map((cur) => (
        <Switch key={cur} on={showing === cur} label={foreign.length > 1 ? `切換幣別：${cur}` : '切換幣別'} onChange={(on) => onCur(on ? cur : home)} />
      ))}
      <Switch on={info.manual} label="修改匯率" onChange={(on) => trip.setRateManual(on)} />
    </div>
  )
}

/** 開關：一顆會左右滑的鈕，旁邊是說明文字。 */
function Switch({ on, label, note = '', onChange }: { on: boolean; label: string; note?: string; onChange: (on: boolean) => void }) {
  return (
    <button type="button" class={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span class="grow">{label}{note && <small class="muted">{note}</small>}</span>
      <i aria-hidden="true" />
    </button>
  )
}

/** 匯率那一列：1 外幣等於多少本國幣。離開輸入框才存，免得打到一半就換算。 */
function RateRow({ cur, rate, home, onSet }: { cur: string; rate: number; home: string; onSet: (n: number) => void }) {
  const [text, setText] = useState(rate > 0 ? String(rate) : '')
  return (
    <label class="row split-rate">
      <span>1 {cur} ＝</span>
      <input inputMode="decimal" value={text} placeholder="還沒填" aria-label={`1 ${cur}等於多少${home}`}
        onInput={(e) => setText(value(e))} onBlur={() => onSet(Number(text) > 0 ? Number(text) : 0)} />
      <span>{home}</span>
    </label>
  )
}

/** 清單上的一筆。點一下展開看每個人出多少；自己記的（或自己付的）可以改。 */
function Entry({ trip, photos, e, me, open, onToggle, onEdit }: { trip: Trip; photos: PhotoStore; e: Row; me: string; open: boolean; onToggle: () => void; onEdit: () => void }) {
  // 只有付錢的本人和管理員可以改。管理員能改全部，付錢的人沒有手機（代管的小孩、長輩）或記錯人時才有人能修。
  const mine = e.payer === me || trip.members.get(me)?.role === 'admin'
  if (e.settle) {
    const to = e.sharers[0] ?? ''
    return (
      <div class="card split-entry settle">
        <div class="row">
          <span class="grow">{trip.nicknameOf(e.payer)} 還給 {trip.nicknameOf(to)}</span>
          <b>{money(e.amount)}<small>{e.cur}</small></b>
        </div>
        {(mine || to === me) && <button class="small ghost" onClick={() => trip.expenses.remove(e.id)}>記錯了，取消這筆還款</button>}
      </div>
    )
  }
  const parts = portions(e)
  const ids = Object.keys(parts)
  return (
    <div class="card tap split-entry" role="button" aria-expanded={open} onClick={onToggle}>
      <div class="row">
        <span class="grow">
          <span class="split-head"><b class="title">{e.title || '花費'}</b><small class="muted">{trip.nicknameOf(e.payer)} 代墊</small></span>
          {/* 每一段（人名 ×N、N 人平分）自己不斷行，換行只會斷在段跟段之間 */}
          <small class="muted split-who-line">
            {ids.length > MAX_NAMES
              ? <span>{ids.length} 人{e.shares ? '・自訂比例' : '平分'}</span>
              : ids.map((id, i) => <span key={id}>{trip.nicknameOf(id)}{e.shares ? ` ×${e.shares[id] ?? 0}` : ''}{i < ids.length - 1 ? '、' : e.shares ? '' : ' '}</span>)}
            {!e.shares && ids.length <= MAX_NAMES && <span>{ids.length} 人平分</span>}
          </small>
        </span>
        <b>{money(e.amount)}<small>{e.cur}</small></b>
        <Chevron open={open} />
      </div>
      {open && (
        <div class="split-parts">
          {/* 從代買登錄來的：把購物項目的照片放上來（點了看大圖，不要順便把卡片收起來） */}
          {e.shopId && <div class="split-thumb" onClick={(ev) => ev.stopPropagation()}><Photo trip={trip} photos={photos} id={e.shopId} name={e.title} /></div>}
          {ids.map((id) => (
            <div class="row" key={id}>
              <span class="grow">{trip.nicknameOf(id)}</span>
              <span>{money(parts[id])}</span>
            </div>
          ))}
          {mine && <button class="small" style="margin-top:8px" onClick={(ev) => { ev.stopPropagation(); onEdit() }}><Icon id="pencil" size={16} />修改</button>}
        </div>
      )}
    </div>
  )
}

function ExpenseSheet({ trip, members, id, draft, days, onClose }: { trip: Trip; members: Who[]; id?: string; draft?: ProxyDraft; days: string[]; onClose: () => void }) {
  const me = trip.actor.pubkey
  const saved = id ? trip.expenses.get(id) : undefined
  // 從代買來的（還沒登錄的草稿，或已經登錄、現在回來修改的）：要知道每個人買幾個，才能用單價算總價
  const bought = saved?.shopId ? trip.shopItems().find((i) => i.id === saved.shopId) : undefined
  const ref = draft ?? (bought ? draftOf(bought, saved!.cur, today()) : undefined)
  // 從代買來的草稿跟修改舊的一樣，先把欄位帶好
  const old: Pick<Expense, 'title' | 'amount' | 'cur' | 'date' | 'payer' | 'sharers' | 'shares'> | undefined = saved ?? draft
  // 幣別選單：台幣、目的地的貨幣、設定裡另外加的。預設值照設定；沒設定就用這支手機上次選的（跟購物共用同一個記憶），再沒有就是目的地的。
  const curKey = `cur:${trip.meta.id}`
  const setup = trip.currencySetup()
  const dest = setup.local || detectCurrency(trip.flights.all(), trip.items.all().map((i) => i.tz), trip.meta.theme ?? '').currency
  const choices = currencyChoices(dest, old?.cur, setup.extra, setup.home || HOME)
  const [cur, setCur] = useState(() => {
    if (old) return old.cur
    try {
      const v = localStorage.getItem(curKey)
      return startCurrency(choices, dest, '', v)
    } catch {
      // 讀不到就用猜的
    }
    return startCurrency(choices, dest, '', null)
  })
  const [amount, setAmount] = useState(draft && draft.unit > 0 ? String(draft.unit) : old && old.amount > 0 ? String(old.amount) : '')
  // 代買登錄可以填單價（乘上總共幾個）或直接填總價；購物清單有填單價就先用單價
  const [byUnit, setByUnit] = useState(!!draft && draft.unit > 0)
  const [title, setTitle] = useState(old?.title ?? '')
  const [date, setDate] = useState(old?.date ?? today())
  const [payer, setPayer] = useState(old?.payer ?? me)
  const [other, setOther] = useState(!!old && old.payer !== me)
  // 預設分給有手機的成員：小孩、長輩通常不出錢，要算他們再自己勾。
  const [sharers, setSharers] = useState<string[]>(() => old?.sharers ?? members.filter((m) => !m.managed).map((m) => m.id))
  const [uneven, setUneven] = useState(!!old?.shares)
  const [shares, setShares] = useState<Record<string, number>>(old?.shares ?? {})

  const picked = members.filter((m) => sharers.includes(m.id)).map((m) => m.id)
  const weights = uneven ? Object.fromEntries(picked.map((p) => [p, shares[p] ?? 1])) : undefined
  // 總共幾個：自訂比例時是每個人的數量加起來；平分時每個人拿的一樣多
  const count = !ref ? 0 : weights ? picked.reduce((sum, p) => sum + weights[p], 0) : picked.length * (ref.count / Math.max(1, ref.sharers.length))
  const n = byUnit ? Math.round(parseAmount(amount) * count * 100) / 100 : parseAmount(amount)
  const parts = portions({ amount: n, cur, payer, sharers: picked, shares: weights })
  const ok = n > 0 && Object.values(parts).some((v) => v > 0)
  const dateOptions = [...new Set([...days, date, today()])].sort()
  const toggle = (who: string) => setSharers(sharers.includes(who) ? sharers.filter((x) => x !== who) : [...sharers, who])

  return (
    <Sheet title={saved ? `修改 ${dayLabel(saved.date).md} ${saved.title || '花費'}` : draft ? '登錄代買' : '記一筆'} onClose={onClose}>
      <form onSubmit={(e) => {
        e.preventDefault()
        if (!ok) return
        const data: Expense = { title: title.trim(), amount: n, cur, date, payer, sharers: picked, shares: weights ?? null, ...((draft?.shopId ?? saved?.shopId) && { shopId: draft?.shopId ?? saved?.shopId }) }
        if (id) trip.expenses.update(id, data)
        else trip.expenses.create(data)
        try {
          localStorage.setItem(curKey, cur)
        } catch {
          // 記不住就下次再選
        }
        onClose()
      }}>
        {ref && (
          <div class="seg" style="margin-bottom:8px">
            <button type="button" class={byUnit ? 'on' : ''} aria-pressed={byUnit} onClick={() => { if (!byUnit && n > 0 && count > 0) setAmount(String(Math.round((n / count) * 100) / 100)); setByUnit(true) }}>填單價</button>
            <button type="button" class={byUnit ? '' : 'on'} aria-pressed={!byUnit} onClick={() => { if (byUnit && n > 0) setAmount(String(n)); setByUnit(false) }}>填總價</button>
          </div>
        )}
        <Field label={byUnit ? `單價（共 ${count} 個${n > 0 ? `，總共 ${money(n)}` : ''}）` : '金額'}>
          <div class="row">
            <input class="grow" inputMode="decimal" value={amount} onInput={(e) => setAmount(value(e))} placeholder={byUnit ? '350' : '1200'} />
            <select style="flex:none;width:auto" aria-label="幣別" value={cur} onChange={(e) => setCur(value(e))}>
              {choices.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </Field>
        <Field label="買了什麼（可不填）">
          <input value={title} onInput={(e) => setTitle(value(e))} placeholder="例如：晚餐、包車" />
        </Field>

        <div class="field">
          <span>誰分擔{picked.length > 0 && !uneven && n > 0 ? `（每人 ${money(Object.values(parts)[0] ?? 0)}）` : ''}</span>
          <div class="split-who">
            {members.map((m) => {
              const on = sharers.includes(m.id)
              return (
                <button type="button" key={m.id} class={on ? 'on' : ''} aria-pressed={on} onClick={() => toggle(m.id)}>
                  <Figure look={lookOf(m)} size={38} luggage={false} />
                  <small>{m.nickname}</small>
                </button>
              )
            })}
          </div>
        </div>

        {uneven && picked.map((p) => (
          <div class="row" style="margin:2px 0" key={p}>
            <span class="grow">{trip.nicknameOf(p)}<small class="muted">　{money(parts[p] ?? 0)}</small></span>
            <Stepper label={`${trip.nicknameOf(p)}幾份`} value={shares[p] ?? 1} onChange={(v) => setShares({ ...shares, [p]: v })} />
          </div>
        ))}
        <div class="two split-opts" style="margin-top:10px">
          <button type="button" class={uneven ? 'on' : ''} aria-pressed={uneven} onClick={() => setUneven(!uneven)}>{uneven ? '改回平分' : '自訂比例'}</button>
          <button type="button" class={other ? 'on' : ''} aria-pressed={other} onClick={() => { if (other) setPayer(me); setOther(!other) }}>{other ? '改回我付的' : '不是我付的'}</button>
        </div>

        {other && (
          <Field label="誰付的">
            <select value={payer} onChange={(e) => setPayer(value(e))}>
              {members.map((m) => <option key={m.id} value={m.id}>{m.id === me ? `${m.nickname}（我）` : m.nickname}</option>)}
            </select>
          </Field>
        )}
        <Field label="哪一天">
          <select value={date} onChange={(e) => setDate(value(e))}>
            {dateOptions.map((d) => {
              const i = days.indexOf(d)
              return <option key={d} value={d}>{i >= 0 ? `Day ${i + 1}・` : ''}{fullDay(d)}{d === today() ? '（今天）' : ''}</option>
            })}
          </select>
        </Field>

        <div class="actions">
          {id && <button type="button" class="danger" onClick={() => { trip.expenses.remove(id); onClose() }}>刪除</button>}
          <button class="primary" disabled={!ok}>{draft ? '登錄' : '儲存'}</button>
        </div>
      </form>
    </Sheet>
  )
}
