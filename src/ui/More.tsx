// 更多：邀請、成員、修改紀錄、同步狀況。
import { useState } from 'preact/hooks'
import type { Trip } from '../model/trip'
import type { HistoryEntry } from '../model/types'
import { DownloadSheet } from './Backup'
import { InviteSection, MembersSection } from './Members'
import { themeName } from '../themes'
import { ago } from '../time'
import { Fold } from './fold'
import { useNow } from './kit'
import { BUILD } from './Start'
import { leaveTrip, type TabProps } from './TripPage'

const COLL: Record<string, string> = {
  trip: '行程', members: '成員', flights: '航班', stays: '住宿', items: '行程項目', days: '每日標題', lists: '清單', listItems: '清單項目', notes: '重點說明', shop: '購物',
}
const FIELD: Record<string, string> = {
  title: '名稱', startDate: '出發日', endDate: '回程日', theme: '佈景主題', desc: '簡介', nickname: '暱稱', role: '角色',
  cat: '類別', approx: '大約時間', icon: '圖示', group: '分類', body: '內容', itemId: '搭配的行程',
  owner: '負責人', qty: '數量', bought: '是否買到', wants: '要的數量', ask: '現場詢問', price: '價錢',
  mapSearch: '用地點找地圖',
  code: '航班代號', from: '出發機場', to: '抵達機場', dep: '起飛時間', arr: '抵達時間', cabin: '艙等', aircraft: '機型',
  name: '名稱', checkIn: '入住', checkOut: '退房', mapUrl: '地圖連結', confirmed: '確認狀態',
  date: '日期', time: '時間', tz: '時區', note: '說明', place: '地點', transport: '交通', kind: '類型',
  checked: '勾選', owners: '擁有者',
}
const OP = { create: '新增了', update: '修改了', delete: '刪除了', restore: '還原了' }
const VALUE: Record<string, string> = { normal: '一般', must: '必去', reminder: '提醒', admin: '管理員', member: '成員' }

/** 修改紀錄裡這筆資料叫什麼（用現在的名稱）。 */
function recordName(trip: Trip, e: HistoryEntry): string {
  switch (e.coll) {
    case 'trip': return ''
    case 'members': return trip.members.get(e.recId)?.nickname ?? ''
    case 'flights': return trip.flights.get(e.recId)?.code ?? ''
    case 'stays': return trip.stays.get(e.recId)?.name ?? ''
    case 'items': return trip.items.get(e.recId)?.title ?? ''
    case 'days': return e.recId.slice(5).replace('-', '/')
    case 'lists': return trip.lists.get(e.recId)?.title ?? ''
    case 'listItems': return trip.listItems.get(e.recId)?.name ?? ''
    case 'notes': return trip.notes.get(e.recId)?.title ?? ''
    case 'shop': return trip.shop.get(e.recId)?.name ?? ''
    default: return ''
  }
}

function showValue(v: unknown): string {
  if (v === undefined || v === null || v === '') return '（空白）'
  if (typeof v === 'boolean') return v ? '是' : '否'
  if (typeof v === 'string') return VALUE[v] ?? v
  if (Array.isArray(v)) return `${v.length} 人`
  if (typeof v === 'object' && 'local' in v) return String((v as { local: string }).local).replace('T', ' ')
  return JSON.stringify(v)
}

function describe(trip: Trip, e: HistoryEntry): string {
  if (e.coll === 'members' && e.op === 'create') return '加入了行程'
  const name = recordName(trip, e)
  const what = `${COLL[e.coll] ?? e.coll}${name ? `「${name}」` : ''}`
  if (e.op !== 'update') return `${OP[e.op]}${what}`
  if (e.field === 'checked') return `${e.old ? '取消勾選' : '勾選了'}${what}`
  if (e.field === 'theme') return `${OP.update}佈景主題（原本：${themeName(e.old)}）`
  return `${OP.update}${what}的${FIELD[e.field ?? ''] ?? e.field}（原本：${showValue(e.old)}）`
}

export function More({ trip, reg, sync }: TabProps) {
  const now = useNow(60_000)
  const [shown, setShown] = useState(10)
  const [exporting, setExporting] = useState(false)
  const [showRelays, setShowRelays] = useState(false)
  const me = trip.actor.pubkey
  const iAmAdmin = trip.members.get(me)?.role === 'admin'
  const history = trip.historyEntries()

  return (
    <div>
      {/* 各區塊都可以收合。只有自己一個人時邀請預設展開，其他時候預設只開成員。 */}
      <InviteSection trip={trip} reg={reg} sync={sync} />
      <MembersSection trip={trip} reg={reg} sync={sync} />


      <Fold title="修改紀錄" summary={`${history.length} 筆`}>
      <div class="card">
        {history.length === 0 && <p class="empty">還沒有紀錄。</p>}
        <ul class="plain">
          {history.slice(-shown).reverse().map((h) => (
            <li class="row" key={h.id}>
              <span class="grow">
                {trip.nicknameOf(h.by)} {describe(trip, h)}
                <div class="muted">{ago(h.at, now)}</div>
              </span>
              {/* 「加入行程」不給還原：那等於把人移出成員名單，不是這個按鈕該做的事。 */}
              {!(h.coll === 'members' && h.op === 'create') && h.field !== 'wants' && (
                <button class="small" onClick={() => trip.revert(h)}>還原</button>
              )}
            </li>
          ))}
        </ul>
        {history.length > shown && <button class="add" onClick={() => setShown(shown + 50)}>顯示更早的紀錄</button>}
      </div>
      </Fold>

      <Fold title="同步" summary={sync ? `連上 ${sync.status().connected}／${sync.status().total} 台` : '未同步'}>
      <div class="card">
        {sync ? (
          <div>
            <p>
              行程內容加密後存放在 {sync.status().total} 台公共中繼站，目前連上 {sync.status().connected} 台。
              中繼站看不到內容。
            </p>
            <button class="small" onClick={() => setShowRelays(!showRelays)}>{showRelays ? '收起' : '看各中繼站狀況'}</button>
            {showRelays && (
              <ul class="plain" style="margin-top:8px">
                {sync.relayStatus().map((r) => (
                  <li class="row" key={r.url}>
                    <span class="grow muted">{r.url.replace('wss://', '')}</span>
                    <span class={`chip ${!r.connected ? 'coral' : r.behind.length || r.sending.length ? 'yellow' : 'green'}`}>
                      {!r.connected ? '連不上' : r.behind.length || r.sending.length ? '補送中' : '正常'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : <p>這份行程沒有金鑰，無法同步。</p>}
      </div>
      </Fold>

      <Fold title="備份這趟行程">
        <div class="card flat">
          <p class="muted" style="margin-top:0">
            把這一趟存成一個檔案：留著當紀錄，或拿到另一支手機上載入。檔案裡有行程內容、行程金鑰和你在這趟的私人清單，沒有你的身分。
          </p>
          <button onClick={() => setExporting(true)}>下載這趟行程的檔案</button>
          <p class="muted" style="margin-bottom:0">要載入檔案，請回首頁的「備份」按「載入備份檔」。</p>
        </div>
      </Fold>
      {exporting && <DownloadSheet reg={reg} only={{ id: trip.meta.id, title: trip.meta.title }} onClose={() => setExporting(false)} />}


      <Fold title="移除與刪除">
      <div class="card flat">
        <b>從這支手機移除</b>
        <p class="muted">
          只清掉這支手機上的這份行程（包含你的私人清單和訂位代號），其他成員不受影響。之後想再看，要請家人重新邀請。
        </p>
        <button onClick={() => {
          if (confirm(`把「${trip.meta.title}」從這支手機移除？\n\n其他成員不受影響。你的私人清單和訂位代號會一起清掉，無法復原。`)) {
            leaveTrip(reg, trip.meta.id)
          }
        }}>從這支手機移除</button>
      </div>
      {iAmAdmin && (
        <div class="card flat" style="background:var(--coral-l)">
          <b>刪除整份行程</b>
          <p class="muted">
            所有成員都會看到「這份行程已經刪除」，內容不再顯示。管理員之後還可以取消刪除。
          </p>
          <button class="danger" style="background:#fff" onClick={() => {
            if (confirm(`刪除「${trip.meta.title}」？\n\n所有成員都會看不到這份行程的內容。`)) trip.setDeleted(true)
          }}>刪除整份行程</button>
        </div>
      )}
      </Fold>

      <p class="muted center" style="margin-top:28px">版本 {BUILD}</p>
    </div>
  )
}
