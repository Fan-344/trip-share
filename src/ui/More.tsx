// 更多：邀請、成員、修改紀錄、同步狀況。
import { useState } from 'preact/hooks'
import type { Trip } from '../model/trip'
import type { HistoryEntry } from '../model/types'
import { inviteLink } from '../store/local'
import { themeName } from '../themes'
import { ago } from '../time'
import { Fold } from './fold'
import { CopyButton, Qr, useNow } from './kit'
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
  const [showRelays, setShowRelays] = useState(false)
  const me = trip.actor.pubkey
  const ref = reg.trip(trip.meta.id)
  const members = trip.members.all()
  const iAmAdmin = trip.members.get(me)?.role === 'admin'
  const admins = members.filter((m) => m.role === 'admin').length
  const history = trip.historyEntries()

  return (
    <div>
      {/* 各區塊都可以收合。只有自己一個人時邀請預設展開，其他時候預設只開成員。 */}
      <Fold title="邀請家人" summary="QR Code" open={members.length <= 1}>
      {ref && (
        <div class="card center">
          <p>請家人用手機相機掃這個 QR Code，打開後就會加入。</p>
          <Qr text={inviteLink(ref)} label="邀請 QR Code" />
          <p class="muted"><b>掃到或拿到連結的人就能看、也能改這份行程</b>，不要截圖貼到公開的地方。</p>
          <CopyButton text={inviteLink(ref)} label="人不在旁邊？複製連結用私訊傳" cls="small" />
        </div>
      )}
      </Fold>

      <Fold title="成員" summary={`${members.length} 人`} open>
      <div class="card">
        <ul class="plain">
          {members.map((m) => (
            <li class="row" key={m.id}>
              <span class="grow">{m.nickname}{m.id === me && <span class="muted">（我）</span>}</span>
              {m.role === 'admin'
                ? <span class="chip yellow">管理員</span>
                : iAmAdmin && <button class="small" onClick={() => trip.members.update(m.id, { role: 'admin' })}>設為管理員</button>}
            </li>
          ))}
        </ul>
        {admins < 2 && members.length > 1 && iAmAdmin && (
          <p class="muted">建議至少兩位管理員，其中一人換手機或遺失資料時，另一人還能管理行程。</p>
        )}
      </div>
      </Fold>

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
