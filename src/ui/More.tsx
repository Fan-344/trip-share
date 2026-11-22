// 更多：邀請、成員、修改紀錄、同步狀況。
import { useState } from 'preact/hooks'
import type { Trip } from '../model/trip'
import type { HistoryEntry } from '../model/types'
import { inviteLink } from '../store/local'
import { ago } from '../time'
import { CopyButton, Qr, useNow } from './kit'
import { BUILD } from './Start'
import type { TabProps } from './TripPage'

const COLL: Record<string, string> = {
  trip: '行程', members: '成員', flights: '航班', stays: '住宿', items: '行程項目', lists: '清單', listItems: '清單項目',
}
const FIELD: Record<string, string> = {
  title: '名稱', startDate: '出發日', endDate: '回程日', nickname: '暱稱', role: '角色',
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
    case 'lists': return trip.lists.get(e.recId)?.title ?? ''
    case 'listItems': return trip.listItems.get(e.recId)?.name ?? ''
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
  return `${OP.update}${what}的${FIELD[e.field ?? ''] ?? e.field}（原本：${showValue(e.old)}）`
}

export function More({ trip, reg, sync }: TabProps) {
  const now = useNow(60_000)
  const [shown, setShown] = useState(20)
  const [showRelays, setShowRelays] = useState(false)
  const me = trip.actor.pubkey
  const ref = reg.trip(trip.meta.id)
  const members = trip.members.all()
  const iAmAdmin = trip.members.get(me)?.role === 'admin'
  const admins = members.filter((m) => m.role === 'admin').length
  const history = trip.historyEntries()

  return (
    <div>
      <h2>邀請家人</h2>
      {ref && (
        <div class="card center">
          <p>請家人用手機相機掃這個 QR Code，打開後就會加入。</p>
          <Qr text={inviteLink(ref)} label="邀請 QR Code" />
          <p class="muted"><b>掃到或拿到連結的人就能看、也能改這份行程</b>，不要截圖貼到公開的地方。</p>
          <CopyButton text={inviteLink(ref)} label="人不在旁邊？複製連結用私訊傳" cls="small" />
        </div>
      )}

      <h2>成員</h2>
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

      <h2>修改紀錄</h2>
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
              {!(h.coll === 'members' && h.op === 'create') && (
                <button class="small" onClick={() => trip.revert(h)}>還原</button>
              )}
            </li>
          ))}
        </ul>
        {history.length > shown && <button class="add" onClick={() => setShown(shown + 50)}>顯示更早的紀錄</button>}
      </div>

      <h2>同步</h2>
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

      <p class="muted center" style="margin-top:28px">版本 {BUILD}</p>
    </div>
  )
}
