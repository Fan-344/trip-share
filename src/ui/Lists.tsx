// 行前準備：清單（共用、個人、私人三種，規格書第 8 節）與重點說明。
// 清單裡的項目可以分類、帶補充說明；別人的個人清單預設鎖定。
import { useState } from 'preact/hooks'
import type { ListItemView, Trip } from '../model/trip'
import type { List, ListKind, Meta } from '../model/types'
import { Empty, Farewell } from './bits'
import { Chevron, useStored } from './fold'
import { Icon } from './Icons'
import { Field, Seg, Sheet, value } from './kit'
import type { TabProps } from './TripPage'

const KIND_NAME: Record<ListKind, string> = { shared: '共用', personal: '個人', private: '私人' }
const KIND_HINT: Record<ListKind, string> = {
  shared: '大家都看得到、都能勾。',
  personal: '大家都看得到，只有擁有者改；爸媽可以一起管小孩的清單。',
  private: '只存在這支手機，其他人看不到。',
}
const NEW_GROUP = '\u0000new'

/** 清單裡出現過的分類，照第一次出現的順序。 */
const groupsOf = (items: ListItemView[]): string[] => [...new Set(items.map((i) => i.group ?? '').filter(Boolean))]

export function Lists({ trip, theme }: TabProps) {
  const me = trip.actor.pubkey
  const lists = trip.allLists()
  const notes = trip.notes.all()
  // 鎖定只是畫面上的保護，避免手滑改到別人的清單；這裡記的是「這次開啟時手動切換過」的清單。
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const [creating, setCreating] = useState(false)
  const [noteSheet, setNoteSheet] = useState<{ id?: string } | null>(null)
  const [openNote, setOpenNote] = useState<string | null>(null)
  const lockedByDefault = (l: List) => l.kind === 'personal' && !l.owners.includes(me)
  const isLocked = (l: List & Meta) => toggled[l.id] ?? lockedByDefault(l)

  const groups: [ListKind, (List & Meta)[]][] = (['shared', 'personal', 'private'] as const).map((k) => [
    k, lists.filter((l) => l.kind === k),
  ])
  const unlocked = lists.filter((l) => !isLocked(l))
  const checkedInUnlocked = unlocked.flatMap((l) => trip.listItemsOf(l).filter((i) => i.checked).map((i) => [l.kind, i.id] as const))

  return (
    <div>
      {lists.length === 0 && notes.length === 0 && (
        <Empty icon="luggage">還沒有清單。先建一份「行李清單」或「出發前要辦的事」吧。</Empty>
      )}
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

      <h2>重點說明</h2>
      {/* 預設只顯示標題，點開才看內容 */}
      {notes.map((n) => {
        const open = openNote === n.id
        return (
          <div class={`card ${open ? '' : 'shut'}`} key={n.id}>
            <div class="cardhead" role="button" aria-expanded={open} onClick={() => setOpenNote(open ? null : n.id)}>
              <h3 class="grow">{n.title}</h3>
              <Chevron open={open} />
            </div>
            {open && (
              <div>
                <ul class="points">
                  {n.body.split('\n').map((line) => line.trim()).filter(Boolean).map((line, i) => <li key={i}>{line}</li>)}
                </ul>
                <button class="small" style="margin-top:8px" onClick={() => setNoteSheet({ id: n.id })}><Icon id="pencil" size={16} />修改</button>
              </div>
            )}
          </div>
        )
      })}
      {notes.length === 0 && <p class="muted">簽證、入境規定、集合地點這類不用打勾、只是要記得的事，可以寫在這裡。</p>}
      <button class="add" onClick={() => setNoteSheet({})}><Icon id="plus" size={18} />新增重點說明</button>

      {checkedInUnlocked.length > 0 && (
        <p class="center" style="margin-top:28px">
          <button class="small" onClick={() => {
            if (confirm(`清除 ${checkedInUnlocked.length} 個勾選？\n\n只會清除目前已解鎖的清單。`)) {
              checkedInUnlocked.forEach(([kind, id]) => trip.setChecked(kind, id, false))
            }
          }}>清除所有勾選</button>
          <br /><span class="muted">只會清除目前已解鎖的清單</span>
        </p>
      )}

      <Farewell theme={theme} title={trip.meta.title} />
      {creating && <CreateList trip={trip} onClose={() => setCreating(false)} />}
      {noteSheet && <NoteSheet trip={trip} id={noteSheet.id} onClose={() => setNoteSheet(null)} />}
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
  const [group, setGroup] = useState('')
  const [newGroup, setNewGroup] = useState('')
  const [menu, setMenu] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const items = trip.listItemsOf(list)
  const done = items.filter((i) => i.checked).length
  const owners = list.owners.map((o) => trip.nicknameOf(o)).join('、')
  const table = list.kind === 'private' ? trip.privLists : trip.lists
  const groupNames = groupsOf(items)
  // 沒分類的排最前面，其餘照分類第一次出現的順序。
  const sections: [string, ListItemView[]][] = ['', ...groupNames]
    .map((g): [string, ListItemView[]] => [g, items.filter((i) => (i.group ?? '') === g)])
    .filter(([, its]) => its.length > 0)

  // 整份清單可以收起來，只留標題和進度；四項以內的預設展開。會記住上次的狀態。
  const [open, setOpen] = useStored(`list:${list.id}`, items.length <= 4)
  // 分類也可以收起來。一開始把已經全部勾完的分類收起來；之後只有手動點才會變，
  // 才不會勾到最後一項時整個分類突然不見。
  const [shutGroups, setShutGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(sections.filter(([g, its]) => g && its.every((i) => i.checked)).map(([g]) => [g, true])),
  )

  return (
    <div class={`card ${open ? '' : 'shut'}`}>
      <div class="cardhead" role="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <h3 class="grow">{list.title}</h3>
        <span class="muted">{done}／{items.length}</span>
        <Chevron open={open} />
      </div>
      {list.kind === 'personal' && owners && <div class="muted">{owners} 的清單</div>}
      <div class="bar"><i style={`width:${items.length ? (done / items.length) * 100 : 0}%`} /></div>
      {/* 全部勾完蓋一個章 */}
      {items.length > 0 && done === items.length && <div class="stamp"><Icon id="star" size={18} />都準備好了！</div>}
      {open && <div>
      <div class="row" style="margin-top:8px">
        <span class="grow" />
        {canLock && (
          <button class="small" onClick={onToggleLock} aria-label={locked ? '解鎖' : '鎖定'}>
            <Icon id={locked ? 'lock' : 'unlock'} size={18} />{locked ? '解鎖' : '鎖定'}
          </button>
        )}
        {!locked && <button class="small ghost" aria-label="更多" onClick={() => setMenu(!menu)}><Icon id="more" size={20} /></button>}
      </div>

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

      {sections.map(([g, its]) => (
        <div key={g}>
          {g && (
            <button type="button" class="group" aria-expanded={!shutGroups[g]}
              onClick={() => setShutGroups({ ...shutGroups, [g]: !shutGroups[g] })}>
              {g}
              <span class="muted">{its.filter((i) => i.checked).length}／{its.length}</span>
              <Chevron open={!shutGroups[g]} />
            </button>
          )}
          {!(g && shutGroups[g]) && its.map((i) => (
            <div class={`check ${i.checked ? 'done' : ''}`} key={i.id}>
              <input type="checkbox" checked={i.checked} disabled={locked} aria-label={i.name}
                onChange={(e) => trip.setChecked(list.kind, i.id, (e.target as HTMLInputElement).checked)} />
              {/* 解鎖時點文字可以改名稱、說明、分類 */}
              <span class="name" onClick={() => { if (!locked) setEditing(i.id) }}>
                {i.name}
                {i.note && <small>{i.note}</small>}
              </span>
              {i.checked && list.kind === 'shared' && <span class="muted">{i.checkedBy.map((p) => trip.nicknameOf(p)).join('、')}</span>}
            </div>
          ))}
        </div>
      ))}

      {!locked && (
        <form style="margin-top:10px" onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          const g = group === NEW_GROUP ? newGroup.trim() : group
          trip.addListItem(list, name.trim(), { group: g })
          setName('')
          // 連續加同一類的東西時，不用每次重選分類
          if (group === NEW_GROUP && g) { setGroup(g); setNewGroup('') }
        }}>
          <div class="row">
            <input class="grow" value={name} onInput={(e) => setName(value(e))} placeholder="新增項目" />
            <button disabled={!name.trim()}>加入</button>
          </div>
          <div class="row" style="margin-top:6px">
            <select value={group} onChange={(e) => setGroup(value(e))} aria-label="分類" style="flex:1">
              <option value="">不分類</option>
              {groupNames.map((g) => <option key={g} value={g}>分類：{g}</option>)}
              <option value={NEW_GROUP}>新的分類…</option>
            </select>
            {group === NEW_GROUP && (
              <input style="flex:1" value={newGroup} onInput={(e) => setNewGroup(value(e))} placeholder="分類名稱，例如：證件" />
            )}
          </div>
        </form>
      )}
      </div>}
      {editing && (
        <ItemSheet trip={trip} kind={list.kind} item={items.find((i) => i.id === editing)} groups={groupNames} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}

function ItemSheet({ trip, kind, item, groups, onClose }: {
  trip: Trip
  kind: ListKind
  item: ListItemView | undefined
  groups: string[]
  onClose: () => void
}) {
  const [f, setF] = useState({ name: item?.name ?? '', note: item?.note ?? '', group: item?.group ?? '' })
  if (!item) return null
  return (
    <Sheet title="編輯項目" onClose={onClose}>
      <form onSubmit={(e) => {
        e.preventDefault()
        if (!f.name.trim()) return
        trip.updateListItem(kind, item.id, { name: f.name.trim(), note: f.note.trim(), group: f.group.trim() })
        onClose()
      }}>
        <Field label="名稱"><input value={f.name} onInput={(e) => setF({ ...f, name: value(e) })} /></Field>
        <Field label="補充說明（可不填）">
          <input value={f.note} onInput={(e) => setF({ ...f, note: value(e) })} placeholder="例如：需至少到 2027/5/25 之後" />
        </Field>
        <Field label="分類（可不填）">
          <input value={f.group} onInput={(e) => setF({ ...f, group: value(e) })} list="list-groups" placeholder="例如：證件" />
          <datalist id="list-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
        </Field>
        <div class="actions">
          <button type="button" class="danger" onClick={() => { trip.removeListItem(kind, item.id); onClose() }}>刪除</button>
          <button class="primary" disabled={!f.name.trim()}>儲存</button>
        </div>
      </form>
    </Sheet>
  )
}

function NoteSheet({ trip, id, onClose }: { trip: Trip; id?: string; onClose: () => void }) {
  const old = id ? trip.notes.get(id) : undefined
  const [f, setF] = useState({ title: old?.title ?? '', body: old?.body ?? '' })
  const ok = f.title.trim() !== ''
  return (
    <Sheet title={id ? '編輯重點說明' : '新增重點說明'} onClose={onClose}>
      <form onSubmit={(e) => {
        e.preventDefault()
        if (!ok) return
        const data = { title: f.title.trim(), body: f.body.trim() }
        if (id) trip.notes.update(id, data)
        else trip.notes.create(data)
        onClose()
      }}>
        <Field label="標題"><input value={f.title} onInput={(e) => setF({ ...f, title: value(e) })} placeholder="例如：簽證與入境重點" /></Field>
        <Field label="內容（一行一個重點）">
          <textarea style="min-height:160px" value={f.body} onInput={(e) => setF({ ...f, body: value(e) })} />
        </Field>
        <div class="actions">
          {id && <button type="button" class="danger" onClick={() => { trip.notes.remove(id); onClose() }}>刪除</button>}
          <button class="primary" disabled={!ok}>儲存</button>
        </div>
      </form>
    </Sheet>
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
            placeholder={kind === 'shared' ? '例如：行李清單、出發前要辦的事' : kind === 'personal' ? '例如：大女兒的行李' : '例如：我的私人清單'} />
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
