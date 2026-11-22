// 清單（規格書第 8 節）：共用、個人、私人三種；別人的個人清單預設鎖定。
import { useState } from 'preact/hooks'
import type { Trip } from '../model/trip'
import type { List, ListKind, Meta } from '../model/types'
import { Empty, Farewell } from './bits'
import { Icon } from './Icons'
import { Field, Seg, Sheet, value } from './kit'
import type { TabProps } from './TripPage'

const KIND_NAME: Record<ListKind, string> = { shared: '共用', personal: '個人', private: '私人' }
const KIND_HINT: Record<ListKind, string> = {
  shared: '大家都看得到、都能勾。',
  personal: '大家都看得到，只有擁有者改；爸媽可以一起管小孩的清單。',
  private: '只存在這支手機，其他人看不到。',
}

export function Lists({ trip, theme }: TabProps) {
  const me = trip.actor.pubkey
  const lists = trip.allLists()
  // 鎖定只是畫面上的保護，避免手滑改到別人的清單；這裡記的是「這次開啟時手動切換過」的清單。
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const [creating, setCreating] = useState(false)
  const lockedByDefault = (l: List) => l.kind === 'personal' && !l.owners.includes(me)
  const isLocked = (l: List & Meta) => toggled[l.id] ?? lockedByDefault(l)

  const groups: [ListKind, (List & Meta)[]][] = (['shared', 'personal', 'private'] as const).map((k) => [
    k, lists.filter((l) => l.kind === k),
  ])

  return (
    <div>
      {lists.length === 0 && <Empty icon="luggage">還沒有清單。先建一份「共用行李」吧。</Empty>}
      {groups.map(([kind, ls]) => ls.length > 0 && (
        <div key={kind}>
          <h2>{KIND_NAME[kind]}清單</h2>
          {ls.map((l) => (
            <ListCard key={l.id} trip={trip} list={l} locked={isLocked(l)}
              canLock={l.kind === 'personal'}
              onToggleLock={() => setToggled({ ...toggled, [l.id]: !isLocked(l) })} />
          ))}
        </div>
      ))}
      <button class="add" onClick={() => setCreating(true)}><Icon id="plus" size={18} />新增清單</button>
      <Farewell theme={theme} title={trip.meta.title} />
      {creating && <CreateList trip={trip} onClose={() => setCreating(false)} />}
    </div>
  )
}

function ListCard({ trip, list, locked, canLock, onToggleLock }: {
  trip: Trip
  list: List & Meta
  locked: boolean
  canLock: boolean
  onToggleLock: () => void
}) {
  const [name, setName] = useState('')
  const [menu, setMenu] = useState(false)
  const items = trip.listItemsOf(list)
  const done = items.filter((i) => i.checked).length
  const owners = list.owners.map((o) => trip.nicknameOf(o)).join('、')
  const table = list.kind === 'private' ? trip.privLists : trip.lists

  return (
    <div class="card">
      <div class="row">
        <h3 class="grow">{list.title}</h3>
        <span class="muted">{done}／{items.length}</span>
        {canLock && (
          <button class="small" onClick={onToggleLock} aria-label={locked ? '解鎖' : '鎖定'}>
            <Icon id={locked ? 'lock' : 'unlock'} size={18} />{locked ? '解鎖' : '鎖定'}
          </button>
        )}
        {!locked && <button class="small ghost" aria-label="更多" onClick={() => setMenu(!menu)}><Icon id="more" size={20} /></button>}
      </div>
      {list.kind === 'personal' && owners && <div class="muted">{owners} 的清單</div>}
      <div class="bar"><i style={`width:${items.length ? (done / items.length) * 100 : 0}%`} /></div>
      {/* 全部勾完蓋一個章 */}
      {items.length > 0 && done === items.length && <div class="stamp"><Icon id="star" size={18} />都準備好了！</div>}

      {menu && !locked && (
        <div class="row wrap" style="margin:8px 0">
          <button class="small" disabled={done === 0}
            onClick={() => { items.forEach((i) => i.checked && trip.setChecked(list.kind, i.id, false)); setMenu(false) }}>
            全部取消勾選
          </button>
          <button class="small danger" onClick={() => { if (confirm(`刪除「${list.title}」這份清單？`)) table.remove(list.id) }}>
            刪除清單
          </button>
        </div>
      )}

      {items.map((i) => (
        <div class={`check ${i.checked ? 'done' : ''}`} key={i.id}>
          <input type="checkbox" checked={i.checked} disabled={locked} aria-label={i.name}
            onChange={(e) => trip.setChecked(list.kind, i.id, (e.target as HTMLInputElement).checked)} />
          <span class="name">{i.name}</span>
          {i.checked && list.kind === 'shared' && <span class="muted">{i.checkedBy.map((p) => trip.nicknameOf(p)).join('、')}</span>}
          {menu && !locked && (
            <button class="small ghost" aria-label={`刪除 ${i.name}`} onClick={() => trip.removeListItem(list.kind, i.id)}><Icon id="close" size={16} /></button>
          )}
        </div>
      ))}

      {!locked && (
        <form class="row" style="margin-top:10px" onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          trip.addListItem(list, name.trim())
          setName('')
        }}>
          <input class="grow" value={name} onInput={(e) => setName(value(e))} placeholder="新增項目" />
          <button disabled={!name.trim()}>加入</button>
        </form>
      )}
    </div>
  )
}

function CreateList({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const me = trip.actor.pubkey
  const members = trip.members.all()
  const [kind, setKind] = useState<ListKind>('shared')
  const [title, setTitle] = useState('')
  const [owners, setOwners] = useState<string[]>([me])
  const ok = title.trim() && (kind !== 'personal' || owners.length > 0)
  return (
    <Sheet title="新增清單" onClose={onClose}>
      <form onSubmit={(e) => {
        e.preventDefault()
        if (!ok) return
        trip.createList({ kind, title: title.trim(), owners: kind === 'shared' ? [] : kind === 'private' ? [me] : owners })
        onClose()
      }}>
        <Seg value={kind} options={[['shared', '共用'], ['personal', '個人'], ['private', '私人']]} onChange={setKind} />
        <p class="muted">{KIND_HINT[kind]}</p>
        <Field label="清單名稱">
          <input value={title} onInput={(e) => setTitle(value(e))}
            placeholder={kind === 'shared' ? '例如：共用行李' : kind === 'personal' ? '例如：大女兒的行李' : '例如：我的私人清單'} />
        </Field>
        {kind === 'personal' && (
          <div>
            <span class="muted">誰可以改（可以選多人）</span>
            {members.map((m) => (
              <label class="check" key={m.id}>
                <input type="checkbox" checked={owners.includes(m.id)}
                  onChange={(e) => setOwners((e.target as HTMLInputElement).checked ? [...owners, m.id] : owners.filter((o) => o !== m.id))} />
                <span class="name">{m.nickname}{m.id === me && '（我）'}</span>
              </label>
            ))}
          </div>
        )}
        <div class="actions"><button class="primary" disabled={!ok}>建立</button></div>
      </form>
    </Sheet>
  )
}
