// 一份行程的外框：頂端的名稱、同步狀態與分頁。
import { useEffect, useState } from 'preact/hooks'
import type { Trip } from '../model/trip'
import { openTrip, type OpenTrip, type Registry } from '../store/local'
import type { TripSync } from '../sync/engine'
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

function TripView({ reg, trip, sync, tab }: TabProps & { tab: string }) {
  useDocs([trip.docs.main, trip.docs.priv, trip.docs.device])
  const meta = trip.meta
  useEffect(() => {
    if (!meta.id) return
    reg.upsertTrip({ id: meta.id, title: meta.title, startDate: meta.startDate, endDate: meta.endDate })
    // 從邀請連結進來的人：行程內容同步到之後，把自己加進成員。
    trip.join(reg.me()!.nickname)
  }, [meta.id, meta.title, meta.startDate, meta.endDate])
  useEffect(() => window.scrollTo(0, 0), [tab])

  if (!meta.id) {
    return (
      <div class="page top">
        <p><a href="#">← 我的行程</a></p>
        <div class="card center">
          <p>{sync ? '正在取得行程內容…' : '這支手機上沒有這份行程。'}</p>
          <SyncBadge sync={sync} />
          {sync && <p class="muted">第一次加入需要網路。如果等很久，請確認邀請你的人有開著 App。</p>}
        </div>
      </div>
    )
  }

  const props = { trip, reg, sync }
  return (
    <div>
      <div class="topbar">
        <div class="row">
          <a href="#" aria-label="回我的行程" style="text-decoration:none">←</a>
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
