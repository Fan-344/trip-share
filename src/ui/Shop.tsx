// 購物。兩種情境：
// 1. 事先計畫（代購）：想買或想請人代買的東西，依預計購買的日子排列。
// 2. 現場詢問：在店裡看到東西，拍張照問大家要不要；每個人回覆要幾個或不用。
import { useEffect, useState } from 'preact/hooks'
import type { Trip } from '../model/trip'
import type { ShopItem, ShopItemView } from '../model/types'
import { ago, daysBetween, fullDay, today } from '../time'
import { Empty, Farewell } from './bits'
import { Fold } from './fold'
import { Icon } from './Icons'
import { Field, Sheet, useNow, value } from './kit'
import { CURRENCIES, detectCurrency, formatPrice, parsePrice } from '../money'
import type { PhotoStore } from '../store/photos'
import { Lightbox, PhotoField, usePhoto } from './photo'
import { Stepper } from './Stepper'
import type { TabProps } from './TripPage'

type SheetState = { id?: string; ask: boolean } | null

export function Shop({ trip, theme, photos }: TabProps) {
  const me = trip.actor.pubkey
  const [sheet, setSheet] = useState<SheetState>(null)
  const items = trip.shopItems()
  const range = daysBetween(trip.meta.startDate, trip.meta.endDate)
  const bought = items.filter((i) => i.bought).length

  const asking = items.filter((i) => i.ask && !i.bought).sort((a, b) => b.createdAt - a.createdAt)
  const asked = items.filter((i) => i.ask && i.bought)
  const planned = items.filter((i) => !i.ask)
  // 有日期的照日期排，還沒決定哪天買的放最後。
  const dates = [...new Set(planned.map((i) => i.date))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))

  return (
    <div>
      <div class="card">
        <div class="row">
          <b class="grow">已買到</b>
          <span class="muted">{bought}／{items.length}</span>
        </div>
        <div class="bar"><i style={`width:${items.length ? (bought / items.length) * 100 : 0}%`} /></div>
        {items.length > 0 && bought === items.length && <div class="stamp"><Icon id="star" size={18} />都買齊了！</div>}
        <div class="two" style="margin-top:12px">
          <button class="primary" onClick={() => setSheet({ ask: true })}><Icon id="camera" size={20} />現場問大家</button>
          <button onClick={() => setSheet({ ask: false })}><Icon id="plus" size={18} />事先要買的</button>
        </div>
      </div>

      {items.length === 0 && <Empty icon="bag">還沒有要買的東西。</Empty>}

      {asking.length > 0 && <h2 class="plain"><Icon id="bell" size={24} />正在問大家</h2>}
      {asking.map((i) => <AskCard key={i.id} trip={trip} photos={photos} item={i} me={me} onEdit={() => setSheet({ id: i.id, ask: true })} />)}

      {dates.map((date) => {
        const n = range.indexOf(date)
        const info = date ? trip.days.get(date) : undefined
        return (
          <div key={date || 'none'}>
            <div class="shopday">
              <Icon id={date ? 'bag' : 'compass'} size={26} />
              <span>
                <b>{date ? `${n >= 0 ? `Day ${n + 1}・` : ''}${fullDay(date)}` : '還沒決定哪天買'}</b>
                {info && !info.deleted && info.title && <small>{info.title}</small>}
              </span>
            </div>
            {planned.filter((i) => i.date === date).map((i) => (
              <PlanCard key={i.id} trip={trip} photos={photos} item={i} me={me} onEdit={() => setSheet({ id: i.id, ask: false })} />
            ))}
          </div>
        )
      })}

      {asked.length > 0 && (
        <Fold title="問過、已經買了的" summary={`${asked.length} 樣`}>
          {asked.map((i) => <AskCard key={i.id} trip={trip} photos={photos} item={i} me={me} onEdit={() => setSheet({ id: i.id, ask: true })} />)}
        </Fold>
      )}

      <Farewell theme={theme} title={trip.meta.title} />
      {sheet && <ShopSheet trip={trip} photos={photos} id={sheet.id} ask={sheet.ask} days={range} onClose={() => setSheet(null)} />}
    </div>
  )
}

/** 卡片上的照片：點一下看大圖。照片是看到才抓的，還沒抓到時先顯示一個框。 */
function Photo({ trip, photos, id, name }: { trip: Trip; photos: PhotoStore; id: string; name: string }) {
  const { state, url } = usePhoto(photos, id, trip.photoRecord(id)?.id)
  const [big, setBig] = useState(false)
  if (state === "none") return null
  if (!url) {
    return (
      <div class="photo wait">
        <Icon id="camera" size={28} />
        <span>{state === "missing" ? "照片還沒同步到，稍後會再試" : "照片載入中…"}</span>
      </div>
    )
  }
  return (
    <div>
      <img class="photo tap" src={url} alt={name} onClick={() => setBig(true)} />
      {big && <Lightbox url={url} name={name} onClose={() => setBig(false)} />}
    </div>
  )
}

/**
 * 買到了、縮起來的樣子：正方形的照片縮圖、名稱、數量，右邊蓋一個「買到了」的章。點一下展開。
 * 沒有照片的東西用一個袋子的圖示佔住縮圖的位置，每一列才會對齊。
 */
function BoughtRow({ trip, photos, item, onOpen }: { trip: Trip; photos: PhotoStore; item: ShopItemView; onOpen: () => void }) {
  const { url } = usePhoto(photos, item.id, trip.photoRecord(item.id)?.id)
  return (
    <div class="card tap mini bought" role="button" aria-expanded="false" onClick={onOpen}>
      {url ? <img class="thumb" src={url} alt="" /> : <span class="thumb none"><Icon id="bag" size={24} /></span>}
      <span class="grow boughtname">
        <b>{item.name}</b>
        <small class="muted">{item.total} 個</small>
      </span>
      <span class="seal">買到了</span>
    </div>
  )
}

/** 名字 ×數量 的小標籤列：要的人、說不用的人、還沒回的人。 */
function Answers({ trip, item, pending }: { trip: Trip; item: ShopItemView; pending: string[] }) {
  const wants = Object.entries(item.wants)
  return (
    <div class="row wrap" style="margin-top:6px">
      {wants.map(([who, n]) => <span class="chip green" key={who}>{trip.nicknameOf(who)} ×{n}</span>)}
      {item.declined.map((who) => <span class="chip" key={who}>{trip.nicknameOf(who)} 不用</span>)}
      {pending.length > 0 && <span class="chip yellow">還沒回：{pending.map((p) => trip.nicknameOf(p)).join('、')}</span>}
    </div>
  )
}

/** 現場詢問的卡片。問的人看到的是統計與「買到了」；其他人看到的是回覆按鈕。 */
function AskCard({ trip, photos, item, me, onEdit }: { trip: Trip; photos: PhotoStore; item: ShopItemView; me: string; onEdit?: () => void }) {
  const now = useNow(60_000)
  const mine = item.wants[me]
  const iDeclined = item.declined.includes(me)
  const iAsked = item.owner === me
  const answered = new Set([...Object.keys(item.wants), ...item.declined])
  // 不用手機的成員沒辦法自己回覆，不列入「還沒回」
  const pending = trip.members.all().filter((m) => !m.managed).map((m) => m.id).filter((id) => id !== item.owner && !answered.has(id))
  const others = item.total - item.qty
  const [open, setOpen] = useState(false)

  // 買完的縮成一行
  if (item.bought && !open) {
    return (
      <BoughtRow trip={trip} photos={photos} item={item} onOpen={() => setOpen(true)} />
    )
  }

  const notify = async () => {
    const link = `${location.origin}${location.pathname}#/t/${trip.meta.id}/shop`
    const text = `我${item.place ? `在${item.place}` : ''}看到「${item.name}」${item.price ? `（${item.price}）` : ''}，要不要幫你買？打開行程回覆：`
    try {
      if (typeof navigator.share === 'function') await navigator.share({ text: `${text}${link}` })
      else await navigator.clipboard.writeText(`${text}${link}`)
    } catch {
      // 使用者取消分享
    }
  }

  return (
    <div class={`card ${item.bought ? 'bought' : 'asking'}`}>
      <Photo trip={trip} photos={photos} id={item.id} name={item.name} />
      <div class="row">
        <h3 class="grow">{item.name}</h3>
        {item.price && <span class="chip yellow">{item.price}</span>}
      </div>
      <div class="muted">
        {trip.nicknameOf(item.owner)}{item.place && ` 在${item.place}`}問大家・{ago(item.createdAt, now)}
      </div>
      {item.note && <p style="white-space:pre-wrap;margin-bottom:0">{item.note}</p>}
      <Answers trip={trip} item={item} pending={item.bought ? [] : pending} />

      {iAsked || item.bought ? (
        <div>
          <p>
            <b>合計要買 {item.total} 個</b>
            <span class="muted">（{trip.nicknameOf(item.owner)}自己 {item.qty}{others > 0 && `、幫大家帶 ${others}`}）</span>
          </p>
          <div class="row wrap">
            <button class={`small ${item.bought ? '' : 'primary'}`} onClick={() => trip.shop.update(item.id, { bought: !item.bought })}>
              {item.bought ? '改回還沒買' : '買到了'}
            </button>
            {iAsked && !item.bought && <button class="small" onClick={notify}>通知大家</button>}
            {iAsked && onEdit && <button class="small" onClick={onEdit}><Icon id="pencil" size={16} />修改</button>}
          </div>
        </div>
      ) : (
        <div style="margin-top:10px">
          {mine === undefined && !iDeclined && (
            <div class="two">
              <button class="primary" onClick={() => trip.setWant(item.id, 1)}>要，幫我買</button>
              <button onClick={() => trip.setWant(item.id, 0)}>不用</button>
            </div>
          )}
          {mine !== undefined && (
            <div class="row">
              <span class="grow"><b>你要 {mine} 個</b></span>
              {/* 減到 0 就是回覆「不用」 */}
              <Stepper label="我要幾個" value={mine} onChange={(n) => trip.setWant(item.id, n)} />
            </div>
          )}
          {iDeclined && (
            <div class="row">
              <span class="grow muted">你回了「不用」</span>
              <button class="small" onClick={() => trip.setWant(item.id, 1)}>改成要一個</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** 事先計畫的東西。 */
function PlanCard({ trip, photos, item, me, onEdit }: { trip: Trip; photos: PhotoStore; item: ShopItemView; me: string; onEdit?: () => void }) {
  const linked = item.itemId ? trip.items.get(item.itemId) : undefined
  const wants = Object.entries(item.wants)
  const proxy = item.total - item.qty
  const mine = item.wants[me] ?? 0
  // 已經買到的縮成一行，點一下才展開。
  const [open, setOpen] = useState(false)
  if (item.bought && !open) {
    return (
      <BoughtRow trip={trip} photos={photos} item={item} onOpen={() => setOpen(true)} />
    )
  }
  return (
    <div class={`card ${item.bought ? 'bought' : ''}`}>
      <Photo trip={trip} photos={photos} id={item.id} name={item.name} />
      <div class="row">
        <h3 class="grow">{item.name}</h3>
        {item.price && <span class="chip yellow">{item.price}</span>}
        <span class={`chip ${item.bought ? 'green' : 'coral'}`}>{item.bought ? '已買到' : '還沒買'}</span>
      </div>
      {item.note && <p class="muted" style="white-space:pre-wrap">{item.note}</p>}
      {linked && !linked.deleted && (
        <div class="muted">行程：{linked.time && `${linked.approx ? '約 ' : ''}${linked.time}　`}{linked.title}</div>
      )}
      <div class="row wrap" style="margin-top:6px">
        {item.place && <span class="chip mizu"><Icon id="pin" size={14} />{item.place}</span>}
        <span class="chip yellow">負責：{item.owner ? trip.nicknameOf(item.owner) : '還沒有人'}</span>
        {wants.map(([who, n]) => <span class="chip" key={who}>代買・{trip.nicknameOf(who)} ×{n}</span>)}
      </div>
      <p>
        <b>合計要買 {item.total} 個</b>
        {proxy > 0 && <span class="muted">（{item.owner ? '自己' : '原本'} {item.qty}、代買 {proxy}）</span>}
      </p>
      <div class="row wrap">
        {/* 負責的人自己的數量在編輯裡改；其他人用這兩顆按鈕加減代買數量 */}
        {item.owner !== me && !item.bought && (
          <button class="small" aria-label="幫我代買，多一個" onClick={() => trip.setWant(item.id, mine + 1)}>+1</button>
        )}
        {mine > 0 && !item.bought && (
          // 減到零就是收回代買，不是回覆「不用」
          <button class="small" aria-label="幫我代買，少一個" onClick={() => trip.setWant(item.id, mine > 1 ? mine - 1 : null)}>-1</button>
        )}
        <button class={`small ${item.bought ? '' : 'primary'}`} onClick={() => trip.shop.update(item.id, { bought: !item.bought })}>
          {item.bought ? '改回還沒買' : '買到了'}
        </button>
        {onEdit && <button class="small" onClick={onEdit}><Icon id="pencil" size={16} />修改</button>}
      </div>
    </div>
  )
}

function ShopSheet({ trip, photos, id, ask, days, onClose }: { trip: Trip; photos: PhotoStore; id?: string; ask: boolean; days: string[]; onClose: () => void }) {
  const old = id ? trip.shop.get(id) : undefined
  const t = today()
  const [f, setF] = useState<ShopItem>({
    name: old?.name ?? '', note: old?.note ?? '',
    // 現場詢問就是今天的事；事先計畫的預設還沒決定
    date: old?.date ?? (ask && days.includes(t) ? t : ''),
    itemId: old?.itemId ?? '', place: old?.place ?? '', owner: old?.owner ?? trip.actor.pubkey,
    qty: old?.qty ?? 1, bought: old?.bought ?? false, ask: old?.ask ?? ask, price: old?.price ?? '',
  })
  const [photo, setPhoto] = useState<Uint8Array | null>(null)
  // 修改既有的東西：把原本的照片讀進來（要去資料庫或中繼站拿，所以是之後才到）
  useEffect(() => {
    if (!id) return
    let gone = false
    void photos.get(id).then((r) => { if (!gone && r.state === "ready") setPhoto((cur) => cur ?? r.data) })
    return () => { gone = true }
  }, [id])
  const [photoChanged, setPhotoChanged] = useState(false)
  const set = (patch: Partial<ShopItem>) => setF({ ...f, ...patch })
  const dateOptions = [...new Set([...days, ...(f.date ? [f.date] : [])])].sort()
  const dayItems = f.date
    ? trip.items.all().filter((i) => i.date === f.date).sort((a, b) => a.time.localeCompare(b.time))
    : []
  const ok = f.name.trim() !== '' && f.qty >= 0
  const qtyInput = (label: string) => <Stepper label={label} value={f.qty} onChange={(qty) => set({ qty })} />

  // 價錢分成金額與幣別。幣別預設是目的地的貨幣；改過之後，這份行程下次就用你改的那個。
  const curKey = `cur:${trip.meta.id}`
  const guess = detectCurrency(trip.flights.all(), trip.items.all().map((i) => i.tz), trip.meta.theme ?? '')
  const [remembered] = useState(() => {
    try {
      const v = localStorage.getItem(curKey)
      return v && CURRENCIES.includes(v) ? v : null
    } catch {
      return null
    }
  })
  const [price, setPrice] = useState(() => parsePrice(old?.price, remembered ?? guess.currency))
  // 說明這個幣別是怎麼來的，免得看到預設值不知道為什麼
  const curHint =
    old?.price ? '' :
    remembered && price.currency === remembered ? `沿用你上次在這份行程選的${remembered}` :
    price.currency !== guess.currency ? '' :
    guess.why === 'flight' ? `依目的地自動帶入（${guess.detail}）` :
    guess.why === 'items' ? '依行程項目的當地時間自動帶入' :
    guess.why === 'theme' ? '依佈景主題自動帶入' :
    '還沒有航班，判斷不出目的地，先用台幣'
  const priceField = (
    <Field label="價錢（可不填）">
      <div class="row">
        <input class="grow" inputMode="decimal" value={price.amount} onInput={(e) => setPrice({ ...price, amount: value(e) })} placeholder="350" />
        <select style="flex:none;width:auto" aria-label="幣別" value={price.currency} onChange={(e) => setPrice({ ...price, currency: value(e) })}>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {curHint && <span class="muted" style="margin:4px 0 0">幣別：{curHint}</span>}
    </Field>
  )
  return (
    <Sheet title={id ? '修改' : ask ? '現場問大家' : '事先要買的東西'} onClose={onClose}>
      <form onSubmit={(e) => {
        e.preventDefault()
        if (!ok) return
        const data = { ...f, name: f.name.trim(), note: f.note.trim(), place: f.place.trim(), price: formatPrice(price.amount, price.currency) }
        if (price.amount.trim()) {
          try {
            localStorage.setItem(curKey, price.currency)
          } catch {
            // 記不住就下次再選
          }
        }
        const itemId = id ?? trip.shop.create(data)
        if (id) trip.shop.update(id, data)
        if (photoChanged) {
          if (photo) void photos.add(itemId, photo)
          else photos.remove(itemId)
        }
        onClose()
      }}>
        <PhotoField value={photo} onChange={(v) => { setPhoto(v); setPhotoChanged(true) }} />
        <Field label={ask ? '看到什麼' : '要買什麼'}>
          <input value={f.name} onInput={(e) => set({ name: value(e) })} placeholder="例如：手工皂、包包" />
        </Field>
        {ask ? (
          <div>
            {priceField}
            <div class="row" style="margin:10px 0">
              <span class="grow">我自己要幾個</span>
              {qtyInput('我自己要幾個')}
            </div>
            <Field label="在哪裡（可不填）"><input value={f.place} onInput={(e) => set({ place: value(e) })} placeholder="例如：尼曼路的選物店" /></Field>
            <Field label="想跟大家說的（可不填）">
              <textarea value={f.note} onInput={(e) => set({ note: value(e) })} placeholder="有三種顏色、我再待 10 分鐘…" />
            </Field>
          </div>
        ) : (
          <div>
            <Field label="誰負責去買">
              <select value={f.owner} onChange={(e) => set({ owner: value(e) })}>
                <option value="">還沒決定</option>
                {trip.members.all().map((m) => <option key={m.id} value={m.id}>{m.nickname}</option>)}
              </select>
            </Field>
            <div class="row" style="margin:10px 0">
              <span class="grow">{f.owner === trip.actor.pubkey ? '我自己要幾個' : '負責的人自己要幾個'}</span>
              {qtyInput('自己要幾個')}
            </div>
            <Field label="預計哪一天買">
              <select value={f.date} onChange={(e) => set({ date: value(e), itemId: '' })}>
                <option value="">還沒決定</option>
                {dateOptions.map((d) => {
                  const n = days.indexOf(d)
                  return <option key={d} value={d}>{n >= 0 ? `Day ${n + 1}・` : ''}{fullDay(d)}</option>
                })}
              </select>
            </Field>
            {dayItems.length > 0 && (
              <Field label="搭配哪個行程去買（可不選）">
                <select value={f.itemId} onChange={(e) => {
                  const picked = dayItems.find((i) => i.id === value(e))
                  // 選了行程就順便帶入它的地點（原本沒填地點的話）
                  set({ itemId: value(e), ...(picked?.place && !f.place && { place: picked.place }) })
                }}>
                  <option value="">不指定</option>
                  {dayItems.map((i) => <option key={i.id} value={i.id}>{i.time ? `${i.time}　` : ''}{i.title}</option>)}
                </select>
              </Field>
            )}
            <Field label="在哪裡買（可不填）"><input value={f.place} onInput={(e) => set({ place: value(e) })} placeholder="例如：尼曼路" /></Field>
            {priceField}
            <Field label="備註（可不填）"><textarea value={f.note} onInput={(e) => set({ note: value(e) })} placeholder="顏色、尺寸、預算…" /></Field>
          </div>
        )}
        <div class="actions">
          {id && (
            <button type="button" class="danger" onClick={() => { photos.remove(id); trip.shop.remove(id); onClose() }}>
              {ask ? '不買了，刪掉' : '刪除'}
            </button>
          )}
          <button class="primary" disabled={!ok}>{id ? '儲存' : ask ? '問大家' : '儲存'}</button>
        </div>
      </form>
    </Sheet>
  )
}
