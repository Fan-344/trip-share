// 人員管理（規格書第 7 節）：邀請、成員名單、管理員、移出成員、不用手機的成員。
import { useState } from 'preact/hooks'
import { MAX_MEMBERS, type Trip } from '../model/trip'
import type { Member, Meta } from '../model/types'
import { INVITE_DAYS, ROTATE_KEY_ON_REMOVE, inviteLink, kickMember, type Registry } from '../store/local'
import type { TripSync } from '../sync/engine'
import { Chevron, Fold } from './fold'
import { Icon } from './Icons'
import { confirmBox } from './dialog'
import { CopyButton, Field, Qr, Sheet, value } from './kit'
import { BAGS, COATS, HAIRS, HAIR_COLORS, JOBS, SKINS, lookOf, titleOf, type Look } from '../avatar'
import { Figure } from './Figure'

interface Props {
  trip: Trip
  reg: Registry
  sync: TripSync | null
}

export function InviteSection({ trip, reg }: Props) {
  const ref = reg.trip(trip.meta.id)
  // 打開這一區的當下算出連結與到期日；之後重畫不會一直變
  const [made] = useState(() => Date.now())
  if (!ref) return null
  const link = inviteLink(ref, made)
  const until = new Date(made + INVITE_DAYS * 86_400_000)
  // 人數到上限就不再給邀請（給了對方也加不進來）
  if (trip.isFull()) {
    return (
      <Fold title="邀請家人" summary="人數已滿">
        <p class="muted" style="margin-top:0">一份行程最多 {MAX_MEMBERS} 個人。要再邀請，先把不去的人移出。</p>
      </Fold>
    )
  }
  return (
    <Fold title="邀請家人" summary="QR Code" open={trip.phoneMembers().length <= 1}>
      <div class="card center">
        <p>用手機相機掃描加入</p>
        <Qr text={link} label="邀請 QR Code" />
        <p class="muted">
          {until.getMonth() + 1}/{until.getDate()} 前有效。
          <b>拿到的人就能看和改</b>，不要公開。
        </p>
        <CopyButton text={link} label="複製邀請連結" cls="small" />
      </div>
    </Fold>
  )
}

export function MembersSection({ trip, reg, sync }: Props) {
  const me = trip.actor.pubkey
  const members = trip.members.all()
  const iAmAdmin = trip.members.get(me)?.role === 'admin'
  const admins = members.filter((m) => m.role === 'admin' && !m.managed).length
  const phones = members.filter((m) => !m.managed).length
  const [sheet, setSheet] = useState<{ id: string } | 'add' | null>(null)
  const picked = sheet && sheet !== 'add' ? members.find((m) => m.id === sheet.id) : undefined

  return (
    <Fold title="成員" summary={`${members.length} 人`} open>
      <div class="card">
        <ul class="plain">
          {members.map((m) => (
            <li class="row tapRow" key={m.id} role="button" onClick={() => setSheet({ id: m.id })}>
              <Figure look={lookOf(m)} size={46} />
              <span class="grow">{m.nickname}{m.id === me && <span class="muted">（我）</span>}</span>
              {titleOf(lookOf(m)) && <span class="chip">{titleOf(lookOf(m))}</span>}
              {m.managed && <span class="chip mizu">不用手機</span>}
              {m.role === 'admin' && !m.managed && <span class="chip yellow">管理員</span>}
              <Chevron open={false} />
            </li>
          ))}
        </ul>
        {admins < 2 && phones > 1 && iAmAdmin && (
          <p class="muted">建議至少兩位管理員。</p>
        )}
        {trip.isFull()
          ? <p class="muted">人數已滿（最多 {MAX_MEMBERS} 人）。</p>
          : <button class="add" onClick={() => setSheet('add')}><Icon id="plus" size={18} />新增不用手機的成員</button>}
      </div>
      {sheet === 'add' && <AddManaged trip={trip} onClose={() => setSheet(null)} />}
      {picked && (
        <MemberSheet trip={trip} reg={reg} sync={sync} member={picked} iAmAdmin={iAmAdmin} admins={admins} phones={phones}
          onClose={() => setSheet(null)} />
      )}
    </Fold>
  )
}

function AddManaged({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const [name, setName] = useState('')
  return (
    <Sheet title="新增不用手機的成員" onClose={onClose}>
      <form onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return
        trip.addManaged(name.trim())
        onClose()
      }}>
        <Field label="怎麼稱呼"><input value={name} onInput={(e) => setName(value(e))} placeholder="例如：大女兒、阿嬤" /></Field>
        <div class="actions"><button class="primary" disabled={!name.trim()}>新增</button></div>
      </form>
    </Sheet>
  )
}

function MemberSheet({ trip, reg, sync, member, iAmAdmin, admins, phones, onClose }: Props & {
  member: Member & Meta
  iAmAdmin: boolean
  admins: number
  phones: number
  onClose: () => void
}) {
  const me = trip.actor.pubkey
  const isMe = member.id === me
  const canRename = isMe || !!member.managed
  const [name, setName] = useState(member.nickname)
  const [look, setLook] = useState(() => lookOf(member))
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const isAdmin = member.role === 'admin'
  // 唯一的管理員不能退出或被取消，不然就沒有人能管理了
  const lastAdmin = isAdmin && admins <= 1

  const kick = async () => {
    const detail = ROTATE_KEY_ON_REMOVE
      ? '會換新的行程金鑰。他已經下載的內容收不回來。'
      : '之後可以再邀請回來。'
    if (!(await confirmBox({ title: `把「${member.nickname}」移出行程？`, body: detail, ok: '移出', danger: true }))) return
    setBusy(ROTATE_KEY_ON_REMOVE ? '正在換金鑰並通知其他成員…' : '正在移出…')
    setError('')
    try {
      await kickMember(reg, trip, sync, member.id)
      // 換金鑰的模式：成功後整個行程畫面會重開，這個面板跟著關掉。不換金鑰的模式要自己關。
      if (!ROTATE_KEY_ON_REMOVE) onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '沒有成功，請再試一次。')
      setBusy('')
    }
  }


  return (
    <Sheet title={member.nickname} onClose={onClose}>
      <div class="row wrap">
        {member.managed
          ? <span class="chip mizu">不用手機的成員</span>
          : <span class={`chip ${isAdmin ? 'yellow' : ''}`}>{isAdmin ? '管理員' : '成員'}</span>}
        {isMe && <span class="chip">這是我</span>}
      </div>

      {/* 自己的（或代管的成員的）暱稱和小人：先在這裡改，按最下面的「儲存」才存、才同步給全團 */}
      {canRename && <Field label={isMe ? '我的暱稱' : '怎麼稱呼'}><input value={name} onInput={(e) => setName(value(e))} /></Field>}
      {canRename && <LookEditor look={look} onChange={setLook} />}

      {busy && <div class="notice" style="display:block;margin-top:14px">{busy}</div>}
      {error && <div class="notice" style="display:block;margin-top:14px;background:var(--coral-l)">{error}</div>}

      {!busy && (
        <div style="margin-top:18px">
          {/* 管理員對其他有手機的成員 */}
          {iAmAdmin && !isMe && !member.managed && (
            <div>
              {isAdmin ? (
                <button class="block" disabled={lastAdmin} onClick={() => { trip.members.update(member.id, { role: 'member' }); onClose() }}>
                  取消管理員
                </button>
              ) : (
                <button class="block" onClick={() => { trip.members.update(member.id, { role: 'admin' }); onClose() }}>
                  設為管理員
                </button>
              )}
              <button class="block danger" onClick={kick}>移出行程</button>
              <p class="muted">
                {ROTATE_KEY_ON_REMOVE
                  ? '會換一把新的行程金鑰，只交給留下來的人。需要網路。'
                  : '之後可以再邀請回來。'}
              </p>
            </div>
          )}

          {/* 不用手機的成員：誰都可以移除（他沒有金鑰，不用換） */}
          {member.managed && (
            <button class="block danger" onClick={async () => {
              if (await confirmBox({ title: `移除「${member.nickname}」？`, body: '他名下的清單會留著。', ok: '移除', danger: true })) { trip.members.remove(member.id); onClose() }
            }}>移除這位成員</button>
          )}

          {/* 自己 */}
          {isMe && (
            <div>
              {isAdmin && phones > 1 && admins > 1 && (
                <button class="block" onClick={() => { trip.members.update(me, { role: 'member' }); onClose() }}>我不當管理員了</button>
              )}
            </div>
          )}

          {!iAmAdmin && !isMe && !member.managed && <p class="muted">只有管理員可以調整其他成員。</p>}
        </div>
      )}

      {canRename && !busy && (
        <div class="actions">
          <button class="primary" disabled={!name.trim()} onClick={() => {
            const n = name.trim()
            trip.members.update(member.id, { nickname: n, look })
            if (isMe && n !== member.nickname) reg.rename(n)
            onClose()
          }}>儲存</button>
        </div>
      )}
    </Sheet>
  )
}

/** 一排可以點的顏色圓點。 */
function Dots({ label, colors, value: v, onPick }: { label: string; colors: string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div>
      <span class="muted">{label}</span>
      <div class="dots">
        {colors.map((c) => (
          <button type="button" key={c} class={c === v ? 'on' : ''} style={`background:${c}`} aria-label={`${label} ${c}`} aria-pressed={c === v} onClick={() => onPick(c)} />
        ))}
      </div>
    </div>
  )
}

/** 選小人的樣子：角色、稱號、髮型、髮色、膚色、衣服。上面是即時預覽。 */
function LookEditor({ look, onChange }: { look: Look; onChange: (look: Look) => void }) {
  const set = (patch: Partial<Look>) => onChange({ ...look, ...patch })
  return (
    <div class="lookedit">
      <div class="lookpreview">
        <Figure look={look} stage="go" size={110} />
      </div>
      <span class="muted">在團裡的角色</span>
      <div class="cats">
        {JOBS.map((j) => (
          <button type="button" key={j.id} class={look.job === j.id ? 'on' : ''} aria-pressed={look.job === j.id} onClick={() => set({ job: j.id })}>{j.name}</button>
        ))}
      </div>
      <Field label="稱號（可以自己打，空白就用角色名）">
        <input value={look.title} maxLength={12} placeholder="例如：情緒價值提供者" onInput={(e) => set({ title: value(e) })} />
      </Field>
      <span class="muted">髮型</span>
      <div class="cats">
        {HAIRS.map((h) => (
          <button type="button" key={h.id} class={look.hair === h.id ? 'on' : ''} aria-pressed={look.hair === h.id} onClick={() => set({ hair: h.id })}>{h.name}</button>
        ))}
      </div>
      <Dots label="髮色" colors={HAIR_COLORS} value={look.hairColor} onPick={(c) => set({ hairColor: c })} />
      <Dots label="膚色" colors={SKINS} value={look.skin} onPick={(c) => set({ skin: c })} />
      <Dots label="衣服" colors={COATS} value={look.coat} onPick={(c) => set({ coat: c })} />
      <Dots label="行李箱" colors={BAGS} value={look.bag} onPick={(c) => set({ bag: c })} />
    </div>
  )
}
