// 一份行程的外框：頂端的名稱、同步狀態與分頁。
import { useEffect, useState } from 'preact/hooks'
import type { Trip } from '../model/trip'
import { openTrip, removeTrip, type OpenTrip, type Registry } from '../store/local'
import type { TripSync } from '../sync/engine'
import { resolveTheme, type ThemeId } from '../themes'
import { Icon } from './Icons'
import { ago } from '../time'
import { useDocs } from './kit'
import { Lists } from './Lists'
import { More } from './More'
import { Overview } from './Overview'
import { Plan } from './Plan'

export interface TabProps {
  trip: Trip
  reg: Registry
  sync: TripSync | null
  /** 這份行程現在用的佈景主題。 */
  theme: ThemeId
}

const TABS: [string, string][] = [['home', '總覽'], ['plan', '行程'], ['lists', '清單'], ['more', '更多']]

export function TripPage({ reg, tripId, tab }: { reg: Registry; tripId: string; tab: string }) {
  const [opened, setOpened] = useState<OpenTrip | null>(null)
  useEffect(() => {
    let close = () => {}
    let gone = false
    void openTrip(reg, tripId).then((o) => {
      if (gone) return o.close()
      close = o.close
      if (import.meta.env.DEV) (globalThis as Record<string, unknown>).__sync = o.sync
      setOpened(o)
    })
    return () => { gone = true; close() }
  }, [tripId])
  if (!opened) return <p class="page top muted">載入中…</p>
  return <TripView reg={reg} trip={opened.trip} sync={opened.sync} tab={tab} />
}

function TripView({ reg, trip, sync, tab }: Omit<TabProps, 'theme'> & { tab: string }) {
  useDocs([trip.docs.main, trip.docs.priv, trip.docs.device])
  const meta = trip.meta
  // 佈景主題設在 <html> 上，整頁（含底色）一起換；離開行程時拿掉，首頁用預設配色。
  const theme = resolveTheme(meta.theme, trip.flights.all())
  useEffect(() => {
    if (!meta.id) return
    reg.upsertTrip({ id: meta.id, title: meta.title, startDate: meta.startDate, endDate: meta.endDate, theme })
    // 從邀請連結進來的人：行程內容同步到之後，把自己加進成員。
    trip.join(reg.me()!.nickname)
  }, [meta.id, meta.title, meta.startDate, meta.endDate, theme])
  useEffect(() => window.scrollTo(0, 0), [tab])

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

  const props = { trip, reg, sync, theme }
  return (
    <div>
      <div class="topbar">
        <div class="row">
          <a href="#" aria-label="回我的行程" style="display:flex"><Icon id="back" size={22} /></a>
          <span class="title grow">{meta.title}</span>
          <SyncBadge sync={sync} />
        </div>
        <nav class="tabs">
          {TABS.map(([key, label]) => (
            <a key={key} class={tab === key ? 'on' : ''} href={`#/t/${meta.id}/${key}`}>{label}</a>
          ))}
        </nav>
      </div>
      <div class="page">
        {tab === 'plan' ? <Plan {...props} /> : tab === 'lists' ? <Lists {...props} /> : tab === 'more' ? <More {...props} /> : <Overview {...props} />}
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
