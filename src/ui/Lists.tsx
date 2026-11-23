// 行前準備：清單（共用、個人、私人三種，規格書第 8 節）與重點說明。
// 平常只能看和勾；每份清單各有一把鎖，鎖著就不能勾（防誤觸）。新增、改名、刪除要先按右上角的「編輯」。
import { useState } from 'preact/hooks'
import type { ListItemView, Trip } from '../model/trip'
import type { List, ListKind, Meta } from '../model/types'
import { Empty, Farewell } from './bits'
import { Chevron, useStored } from './fold'
import { Icon } from './Icons'
import { EditBar, Field, Seg, Sheet, value } from './kit'
import type { TabProps } from './TripPage'

const KIND_NAME: Record<ListKind, string> = { shared: '共用', personal: '個人', private: '私人' }
const KIND_HINT: Record<ListKind, string> = {
  shared: '大家都看得到、都能勾。',
  personal: '大家都看得到，只有擁有者改；爸媽可以一起管小孩的清單。',
  private: '只存在這支手機，其他人看不到。',
}

export function Lists({ trip, theme }: TabProps) {
  const lists = trip.allLists()
  const notes = trip.notes.all()
  const [editing, setEditing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [noteSheet, setNoteSheet] = useState<{ id?: string } | null>(null)
  const [openNote, setOpenNote] = useState<string | null>(null)

  const groups: [ListKind, (List & Meta)[]][] = (['shared', 'personal', 'private'] as const).map((k) => [
    k, lists.filter((l) => l.kind === k),
  ])

  return (
    <div>
      <EditBar on={editing} onChange={setEditing} hint="編輯中：點項目可以改，改完按完成" />
      {lists.length === 0 && notes.length === 0 && (
        <Empty icon="luggage">還沒有清單。按右上角的「編輯」，先建一份「行李清單」或「出發前要辦的事」吧。</Empty>
      )}
      {groups.map(([kind, ls]) => ls.length > 0 && (
        <div key={kind}>
          <h2>{KIND_NAME[kind]}清單</h2>
          {ls.map((l) => <ListCard key={l.id} trip={trip} list={l} editing={editing} />)}
        </div>
      ))}
      {editing && <button class="add" onClick={() => setCreating(true)}><Icon id="plus" size={18} />新增清單</button>}

      {(notes.length > 0 || editing) && <h2>重點說明</h2>}
      {/* 預設只顯示標題，點開才看內容 */}
      {notes.map((n) => {
        const open = openNote === n.id
        return (
          <div class={`card ${open ? '' : 'shut'}`} key={n.id}>
            <div class="cardhead" role="button" aria-expanded={open} onClick={() => setOpenNote(open ? null : n.id)}>
              <h3 class="grow">{n.title}</h3>
              {editing && (
                <button class="small" onClick={(e) => { e.stopPropagation(); setNoteSheet({ id: n.id }) }}><Icon id="pencil" size={16} />修改</button>
              )}
              <Chevron open={open} />
            </div>
            {open && (
              <ul class="points">
                {n.body.split('\n').map((line) => line.trim()).filter(Boolean).map((line, i) => <li key={i}>{line}</li>)}
              </ul>
            )}
          </div>
        )
      })}
      {editing && notes.length === 0 && <p class="muted">簽證、入境規定、集合地點這類不用打勾、只是要記得的事，可以寫在這裡。</p>}
      {editing && <button class="add" onClick={() => setNoteSheet({})}><Icon id="plus" size={18} />新增重點說明</button>}

      <Farewell theme={theme} title={trip.meta.title} />
      {creating && <CreateList trip={trip} onClose={() => setCreating(false)} />}
      {noteSheet && <NoteSheet trip={trip} id={noteSheet.id} onClose={() => setNoteSheet(null)} />}
    </div>
  )
}

function ListCard({ trip, list, editing }: { trip: Trip; list: List & Meta; editing: boolean }) {
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const items = trip.listItemsOf(list)
  const done = items.filter((i) => i.checked).length
  const owners = list.owners.map((o) => trip.nicknameOf(o)).join('、')
  const table = list.kind === 'private' ? trip.privLists : trip.lists

  // 整份清單可以收起來，只留標題和進度；四項以內的預設展開。會記住上次的狀態。
  const [open, setOpen] = useStored(`list:${list.id}`, items.length <= 4)
  // 每份清單各自上鎖，預設鎖著；鎖著不能勾，避免滑手機時誤觸。這支手機會記住哪幾份解開了。
  const [locked, setLocked] = useStored(`lock:${list.id}`, true)

  const rename = () => {
    const title = prompt('清單名稱', list.title)?.trim()
    if (title && title !== list.title) trip.renameList(list, title)
  }

  return (
    <div class={`card ${open ? '' : 'shut'}`}>
      <div class="cardhead" role="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <h3 class="grow">{list.title}</h3>
        <span class="muted">{done}／{items.length}</span>
        <button class={`small ghost lockbtn ${locked ? 'locked' : ''}`} aria-pressed={locked}
          aria-label={locked ? `「${list.title}」鎖定中，點一下解鎖` : `「${list.title}」可以勾，點一下鎖定`}
          onClick={(e) => { e.stopPropagation(); setLocked(!locked); if (locked) setOpen(true) }}>
          <Icon id={locked ? 'lock' : 'unlock'} size={20} />
        </button>
        <Chevron open={open} />
      </div>
      {list.kind === 'personal' && owners && <div class="muted">{owners} 的清單</div>}
      <div class="bar"><i style={`width:${items.length ? (done / items.length) * 100 : 0}%`} /></div>
      {/* 全部勾完蓋一個章 */}
      {items.length > 0 && done === items.length && <div class="stamp"><Icon id="star" size={18} />都準備好了！</div>}
      {open && (
        <div>
          {editing && (
            <div class="row wrap" style="margin:8px 0">
              <button class="small" onClick={rename}><Icon id="pencil" size={16} />改名</button>
              <button class="small" disabled={done === 0}
                onClick={() => { if (confirm(`取消「${list.title}」的 ${done} 個勾選？`)) items.forEach((i) => i.checked && trip.setChecked(list.kind, i.id, false)) }}>
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
              {/* 編輯模式下點文字可以改名稱、說明 */}
              <span class="name" role={editing ? 'button' : undefined} onClick={() => { if (editing) setPicked(i.id) }}>
                {i.name}
                {i.note && <small>{i.note}</small>}
              </span>
              {editing && <Icon id="pencil" size={16} />}
              {!editing && i.checked && list.kind === 'shared' && <span class="muted">{i.checkedBy.map((p) => trip.nicknameOf(p)).join('、')}</span>}
            </div>
          ))}
          {items.length === 0 && !editing && <p class="muted">這份清單還是空的。按右上角的「編輯」加項目。</p>}
          {editing && (
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
      )}
      {picked && <ItemSheet trip={trip} kind={list.kind} item={items.find((i) => i.id === picked)} onClose={() => setPicked(null)} />}
    </div>
  )
}

function ItemSheet({ trip, kind, item, onClose }: {
  trip: Trip
  kind: ListKind
  item: ListItemView | undefined
  onClose: () => void
}) {
  const [f, setF] = useState({ name: item?.name ?? '', note: item?.note ?? '' })
  if (!item) return null
  return (
    <Sheet title="編輯項目" onClose={onClose}>
      <form onSubmit={(e) => {
        e.preventDefault()
        if (!f.name.trim()) return
        trip.updateListItem(kind, item.id, { name: f.name.trim(), note: f.note.trim() })
        onClose()
      }}>
        <Field label="名稱"><input value={f.name} onInput={(e) => setF({ ...f, name: value(e) })} /></Field>
        <Field label="補充說明（可不填）">
          <input value={f.note} onInput={(e) => setF({ ...f, note: value(e) })} placeholder="例如：需至少到 2027/5/25 之後" />
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
