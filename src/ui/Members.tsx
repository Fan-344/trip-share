// 人員管理（規格書第 7 節）：邀請、成員名單、管理員、移出成員、不用手機的成員。
import { useState } from 'preact/hooks'
import type { Trip } from '../model/trip'
import type { Member, Meta } from '../model/types'
import { INVITE_DAYS, ROTATE_KEY_ON_REMOVE, inviteLink, kickMember, type Registry } from '../store/local'
import type { TripSync } from '../sync/engine'
import { Chevron, Fold } from './fold'
import { Icon } from './Icons'
import { CopyButton, Field, Qr, Sheet, value } from './kit'
import { leaveTrip } from './TripPage'

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
              <span class="grow">{m.nickname}{m.id === me && <span class="muted">（我）</span>}</span>
              {m.managed && <span class="chip mizu">不用手機</span>}
              {m.role === 'admin' && !m.managed && <span class="chip yellow">管理員</span>}
              <Chevron open={false} />
            </li>
          ))}
        </ul>
        {admins < 2 && phones > 1 && iAmAdmin && (
          <p class="muted">建議至少兩位管理員。</p>
        )}
        <button class="add" onClick={() => setSheet('add')}><Icon id="plus" size={18} />新增不用手機的成員</button>
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
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const isAdmin = member.role === 'admin'
  // 唯一的管理員不能退出或被取消，不然就沒有人能管理了
  const lastAdmin = isAdmin && admins <= 1

  const kick = async () => {
    const detail = ROTATE_KEY_ON_REMOVE
      ? '會換一把新的行程金鑰，只交給留下來的人；之後的修改他看不到也改不了。\n他已經下載到手機上的內容收不回來。'
      : '他會從成員名單消失，他的 App 會顯示「你已經不在這份行程裡」。\n之後想讓他回來，再給他一次邀請就可以。'
    if (!confirm(`把「${member.nickname}」移出這份行程？\n\n${detail}`)) return
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

  const leave = async () => {
    if (!confirm(`退出「${trip.meta.title}」？\n\n行程會從這支手機移除（包含你的私人清單和訂位代號）。之後想回來，要請家人再邀請一次。`)) return
    setBusy('正在退出…')
    trip.members.remove(me)
    // 盡量讓其他人知道我退出了；沒網路也照樣退出，只是他們的名單上暫時還看得到我
    await sync?.publishSnapshotNow().catch(() => 0)
    leaveTrip(reg, trip.meta.id)
  }

  return (
    <Sheet title={member.nickname} onClose={onClose}>
      <div class="row wrap">
        {member.managed
          ? <span class="chip mizu">不用手機的成員</span>
          : <span class={`chip ${isAdmin ? 'yellow' : ''}`}>{isAdmin ? '管理員' : '成員'}</span>}
        {isMe && <span class="chip">這是我</span>}
      </div>

      {canRename && (
        <form onSubmit={(e) => {
          e.preventDefault()
          const n = name.trim()
          if (!n) return
          trip.members.update(member.id, { nickname: n })
          if (isMe) reg.rename(n)
          onClose()
        }}>
          <Field label={isMe ? '我的暱稱' : '怎麼稱呼'}><input value={name} onInput={(e) => setName(value(e))} /></Field>
          <button disabled={!name.trim() || name.trim() === member.nickname}>改名</button>
        </form>
      )}

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
            <button class="block danger" onClick={() => {
              if (confirm(`移除「${member.nickname}」？他名下的清單還會留著。`)) { trip.members.remove(member.id); onClose() }
            }}>移除這位成員</button>
          )}

          {/* 自己 */}
          {isMe && (
            <div>
              {isAdmin && phones > 1 && admins > 1 && (
                <button class="block" onClick={() => { trip.members.update(me, { role: 'member' }); onClose() }}>我不當管理員了</button>
              )}
              <button class="block danger" style="margin-top:10px" disabled={lastAdmin && phones > 1} onClick={leave}>退出這份行程</button>
              {lastAdmin && phones > 1 && <p class="muted">你是唯一的管理員。請先把另一位成員設為管理員，再退出。</p>}
            </div>
          )}

          {!iAmAdmin && !isMe && !member.managed && <p class="muted">只有管理員可以調整其他成員。</p>}
        </div>
      )}
    </Sheet>
  )
}
