// 一份行程的外框：頂端的名稱、同步狀態與分頁。
import { useCallback, useEffect, useState } from 'preact/hooks'
import { followChain, type ChainResult } from '../model/rekey'
import type { Trip } from '../model/trip'
import { hex } from '../sync/crypto'
import { openTrip, removeTrip, type OpenTrip, type Registry } from '../store/local'
import type { PhotoStore } from '../store/photos'
import type { TripSync } from '../sync/engine'
import { resolveTheme, type ThemeId } from '../themes'
import { Icon } from './Icons'
import { confirmBox } from './dialog'
import { ago } from '../time'
import { useDocs, useSwipe } from './kit'
import { swipeTarget } from '../swipe'
import { Lists } from './Lists'
import { More } from './More'
import { Overview } from './Overview'
import { Plan } from './Plan'
import { Shop } from './Shop'
import { LuggagePage } from './Luggage'

export interface TabProps {
  trip: Trip
  reg: Registry
  sync: TripSync | null
  /** 這份行程現在用的佈景主題。 */
  theme: ThemeId
  /** 這份行程的照片。 */
  photos: PhotoStore
}

const TABS: [string, string, string][] = [['home', '總覽', 'house'], ['plan', '行程', 'calendar'], ['lists', '準備', 'checklist'], ['bags', '行李', 'luggage'], ['shop', '購物', 'bag'], ['more', '更多', 'more']]
const TAB_KEYS = TABS.map(([key]) => key)

export function TripPage({ reg, tripId, tab }: { reg: Registry; tripId: string; tab: string }) {
  const [opened, setOpened] = useState<OpenTrip | null>(null)
  // 行程金鑰換了（有人被移出，或用新的邀請重新加入）就整個重開：新金鑰對應中繼站上新的位置。
  const key = reg.trip(tripId)?.key
  useEffect(() => {
    let close = () => {}
    let gone = false
    setOpened(null)
    void openTrip(reg, tripId).then((o) => {
      if (gone) return o.close()
      close = o.close
      if (import.meta.env.DEV) (globalThis as Record<string, unknown>).__sync = o.sync
      setOpened(o)
    })
    return () => { gone = true; close() }
  }, [tripId, key])
  if (!opened) return <p class="page top muted">載入中…</p>
  return <TripView reg={reg} trip={opened.trip} sync={opened.sync} photos={opened.photos} tab={tab} />
}

function TripView({ reg, trip, sync, photos, tab }: Omit<TabProps, 'theme'> & { tab: string }) {
  useDocs([trip.docs.main, trip.docs.comments, trip.docs.priv, trip.docs.device])
  const meta = trip.meta
  // 佈景主題設在 <html> 上，整頁（含底色）一起換；離開行程時拿掉，首頁用預設配色。
  const theme = resolveTheme(meta.theme, trip.flights.all())

  // 金鑰有沒有換過？換過而且有給我的那一份，就換成新的（上面會重開行程）；沒有我的份，代表我被移出了。
  const [chain, setChain] = useState<ChainResult | null>(null)
  const myKey = reg.trip(meta.id)?.key
  const rekeys = trip.rekeyEntries().length
  useEffect(() => {
    const me = reg.me()
    if (!meta.id || !myKey || !me) return
    let stale = false
    void followChain(trip.rekeyEntries(), myKey, { pubkey: me.pubkey, sk: hex.dec(me.sk) }).then((r) => {
      if (stale) return
      if (r.status === 'rotated') reg.setTripKey(meta.id, r.key)
      else setChain(r)
    })
    return () => { stale = true }
  }, [meta.id, myKey, rekeys])
  const current = chain?.status === 'current'

  // 我的名字是不是已經被從成員名單拿掉了（被管理員移出，或自己退出）。
  // invited：剛接受了新的邀請——只有這時候才把自己加回去，不然被移出的人一開 App 又回到名單上。
  const gone = trip.removalOf(trip.actor.pubkey)
  const invited = !!reg.trip(meta.id)?.invited
  const isGone = !!gone
  useEffect(() => {
    if (!meta.id) return
    reg.upsertTrip({ id: meta.id, title: meta.title, startDate: meta.startDate, endDate: meta.endDate, theme })
    // 要先確定手上是最新的金鑰（current）才動成員名單。
    if (!current) return
    // 第一次加入：直接加。名字被拿掉過的：有新的邀請才加回去。
    if (!isGone || invited) trip.join(reg.me()!.nickname)
    if (invited) reg.setInvited(meta.id, false)
  }, [meta.id, meta.title, meta.startDate, meta.endDate, theme, current, isGone, invited])
  // 被別人移出、而且沒有新的邀請：顯示「你已經不在這份行程裡」。金鑰換過且沒有我的份也是。
  const removed =
    chain?.status === 'removed' ? { by: chain.by, at: chain.at } :
    gone && gone.by !== trip.actor.pubkey && !invited ? gone : null
  useEffect(() => window.scrollTo(0, 0), [tab])

  // 左右滑切換分頁：整頁跟著手指走，手指往左看下一個分頁，往右看上一個；到頭就拖不太動
  const [pageEl, setPageEl] = useState<HTMLElement | null>(null)
  const onSwipe = useCallback((dir: -1 | 1) => {
    const to = swipeTarget(TAB_KEYS, tab, dir)
    if (to && meta.id) location.hash = `#/t/${meta.id}/${to}`
  }, [tab, meta.id])
  const canGo = useCallback((dir: -1 | 1) => swipeTarget(TAB_KEYS, tab, dir) !== null, [tab])
  useSwipe(pageEl, canGo, onSwipe)

  // 換分頁時新的那一頁從哪邊滑進來：往後面的分頁就從右邊進來，往前面的從左邊。第一次打開不滑。
  // （在畫的時候就比對，新的一頁第一次出現就帶著方向；見 React 的「依前一次的值調整 state」寫法）
  const [shown, setShown] = useState({ tab, from: '' })
  if (shown.tab !== tab) setShown({ tab, from: TAB_KEYS.indexOf(tab) > TAB_KEYS.indexOf(shown.tab) ? 'from-right' : 'from-left' })
  // 滑完就把方向拿掉，頁面裡的卡片之後才會照平常的方式浮上來（例如行程頁換一天）。
  // 等久一點再拿：太早拿掉，剛被壓成瞬間完成的卡片動畫會從中間接著播，閃一下。
  useEffect(() => {
    if (!shown.from) return
    const timer = setTimeout(() => setShown((s) => (s.from ? { ...s, from: '' } : s)), 500)
    return () => clearTimeout(timer)
  }, [shown.tab, shown.from])

  // 舊版的清單資料（分類記在別的欄位、或被拆成好幾份清單）：整理成「清單底下有欄位」的樣子。同步進來舊資料時再整理一次。
  const untidy = trip.listsNeedTidy()
  useEffect(() => {
    if (current && !removed && !meta.deleted && untidy) trip.tidyLists()
  }, [current, untidy, !removed, !meta.deleted])

  useEffect(() => {
    if (!meta.id) return
    const root = document.documentElement
    root.dataset.theme = theme
    const bar = document.querySelector('meta[name="theme-color"]')
    const before = bar?.getAttribute('content')
    bar?.setAttribute('content', getComputedStyle(root).getPropertyValue('--paper').trim())
    return () => {
      delete root.dataset.theme
      if (before) bar?.setAttribute('content', before)
    }
  }, [meta.id, theme])

  if (!meta.id) {
    return (
      <div class="page top">
        <p><a class="row" href="#" style="text-decoration:none"><Icon id="back" size={20} />我的行程</a></p>
        <div class="card center">
          <p>{sync ? '正在取得行程內容…' : '這支手機上沒有這份行程。'}</p>
          <SyncBadge sync={sync} />
          {sync && <p class="muted">第一次加入需要網路。如果等很久，請確認邀請你的人有開著 App。</p>}
        </div>
      </div>
    )
  }

  // 我被移出了：不再顯示行程內容。
  if (removed) {
    return (
      <div class="page top">
        <p><a class="row" href="#" style="text-decoration:none"><Icon id="back" size={20} />我的行程</a></p>
        <div class="card">
          <h1>你已經不在這份行程裡</h1>
          <p>{trip.nicknameOf(removed.by)} 在 {ago(removed.at)}把你移出了「{meta.title}」。</p>
          <p>如果是誤會，請對方再給你一次邀請（掃 QR Code 或點連結），就能重新加入。</p>
          <div class="notice" style="display:block">
            之後可能會再被邀請的話，先不要按下面的按鈕。你的私人清單和訂位代號只存在這支手機上，移除之後就找不回來。
          </div>
          <button onClick={async () => {
            if (await confirmBox({ title: `從這支手機移除「${meta.title}」？`, body: '私人清單和訂位代號會一起清掉，無法復原。', ok: '移除', danger: true })) leaveTrip(reg, meta.id)
          }}>從這支手機移除</button>
        </div>
      </div>
    )
  }

  // 管理員把行程刪除了：不再顯示內容，請每個人把它從手機移除。管理員可以取消。
  if (meta.deleted) {
    const iAmAdmin = trip.members.get(trip.actor.pubkey)?.role === 'admin'
    return (
      <div class="page top">
        <p><a class="row" href="#" style="text-decoration:none"><Icon id="back" size={20} />我的行程</a></p>
        <div class="card">
          <h1>這份行程已經刪除</h1>
          <p>
            「{meta.title}」在 {ago(meta.deleted.at)}被 {trip.nicknameOf(meta.deleted.by)} 刪除。
            內容還留在這支手機上，按下面的按鈕可以清掉。
          </p>
          <div class="row wrap">
            <button class="primary" onClick={() => leaveTrip(reg, meta.id)}>從這支手機移除</button>
            {iAmAdmin && <button onClick={() => trip.setDeleted(false)}>取消刪除</button>}
          </div>
          <p class="muted"><SyncBadge sync={sync} /></p>
        </div>
      </div>
    )
  }

  const props = { trip, reg, sync, theme, photos }
  return (
    <div>
      <div class="topbar">
        <div class="row">
          <a href="#" aria-label="回我的行程" style="display:flex"><Icon id="back" size={22} /></a>
          {/* 行程名稱後面接日期；名稱太長時縮短名稱，日期一定完整 */}
          <span class="grow titlebar"><span class="title">{meta.title}</span>{meta.startDate && meta.endDate && <span class="dates">{md(meta.startDate)}–{md(meta.endDate)}</span>}</span>
          <SyncBadge sync={sync} />
        </div>
        <nav class="tabs">
          {TABS.map(([key, label, icon]) => (
            <a key={key} class={tab === key ? 'on' : ''} href={`#/t/${meta.id}/${key}`}><Icon id={icon} size={20} />{label}</a>
          ))}
        </nav>
      </div>
      {/* key 用分頁：每換一頁就是新的一塊，滑進來的動畫才會重播，拖到一半的位移也不會留到下一頁 */}
      <div class={`page ${shown.tab === tab ? shown.from : ''}`} key={tab} ref={setPageEl}>
        {/* 各分頁的「編輯」開關放這裡：選單下方、靠右（kit.tsx 的 EditBar 送過來）；沒有編輯功能的分頁就是空的 */}
        <div id="editslot" class="editslot" />
        {tab === 'plan' ? <Plan {...props} /> : tab === 'lists' ? <Lists {...props} /> : tab === 'bags' ? <LuggagePage {...props} /> : tab === 'shop' ? <Shop {...props} /> : tab === 'more' ? <More {...props} /> : <Overview {...props} />}
      </div>
    </div>
  )
}

/**
 * 離開並把行程從這支手機移除。先回首頁讓行程的畫面關掉（文件跟著關閉），再清資料；
 * 還開著的話瀏覽器不會真的刪。
 */
export function leaveTrip(reg: Registry, tripId: string): void {
  location.hash = '#'
  setTimeout(() => void removeTrip(reg, tripId), 400)
}

/** 右上角的「已同步／同步中／離線中」。 */
export function SyncBadge({ sync }: { sync: TripSync | null }) {
  const [, set] = useState(0)
  useEffect(() => {
    if (!sync) return
    const off = sync.onStatus(() => set((n) => n + 1))
    const t = setInterval(() => set((n) => n + 1), 30_000)
    return () => { off(); clearInterval(t) }
  }, [sync])
  if (!sync) return <span class="sync off"><i />未同步</span>
  const s = sync.status()
  if (s.connected === 0) return <span class="sync off"><i />離線中</span>
  if (s.pending) return <span class="sync busy"><i />同步中</span>
  return <span class="sync"><i />已同步{s.lastSyncAt ? `・${ago(s.lastSyncAt)}` : ''}</span>
}

/** 「2027-03-05」→「3/5」。 */
const md = (date: string): string => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`
