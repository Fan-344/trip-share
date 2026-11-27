// 行程項目底下的留言：大家都能留言、附一張照片。留言和照片索引在留言文件裡，照片本身走照片同步。
import { useRef, useState } from 'preact/hooks'
import type { Trip } from '../model/trip'
import type { PhotoStore } from '../store/photos'
import { ago } from '../time'
import { confirmBox } from './dialog'
import { Icon } from './Icons'
import { useNow, value } from './kit'
import { shrinkImage, usePhotoUrl } from './photo'
import { Photo } from './Shop'

/** 展開的行程卡片下面：留言一則一則往下排，最下面是輸入列（照相機、文字、送出）。不用進編輯模式也能留言。 */
export function Comments({ trip, photos, itemId }: { trip: Trip; photos: PhotoStore; itemId: string }) {
  const now = useNow(60_000)
  const list = trip.commentsOf(itemId)
  const me = trip.actor.pubkey
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState<Uint8Array | null>(null)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const preview = usePhotoUrl(photo)
  const pick = async (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0]
    ;(e.target as HTMLInputElement).value = ''
    if (!f) return
    setBusy(true)
    try {
      setPhoto(await shrinkImage(f))
    } catch {
      setPhoto(null)
    } finally {
      setBusy(false)
    }
  }
  const ok = !busy && (text.trim() !== '' || !!photo)
  return (
    // 點留言區不要順便把卡片收起來
    <div class="comments" onClick={(e) => e.stopPropagation()}>
      {list.map((c) => (
        <div key={c.id} class="said">
          <div class="row">
            <b>{trip.nicknameOf(c.createdBy)}</b>
            <span class="muted">{ago(c.createdAt, now)}</span>
            <span class="grow" />
            {c.createdBy === me && (
              <button class="ghost small" aria-label="刪掉這則留言" onClick={async () => {
                if (await confirmBox({ title: '刪掉這則留言？', ok: '刪掉', danger: true })) trip.removeComment(c.id)
              }}><Icon id="trash" size={16} /></button>
            )}
          </div>
          {c.text && <div class="note">{c.text}</div>}
          <Photo trip={trip} photos={photos} id={c.id} name="留言的照片" />
        </div>
      ))}
      {preview && (
        <div class="say-photo">
          <img src={preview} alt="要附上的照片" />
          <button class="ghost small" aria-label="拿掉照片" onClick={() => setPhoto(null)}><Icon id="close" size={16} /></button>
        </div>
      )}
      <form class="say" onSubmit={(e) => {
        e.preventDefault()
        if (!ok) return
        const id = trip.addComment(itemId, text)
        if (photo) void photos.add(id, photo)
        setText('')
        setPhoto(null)
      }}>
        <input ref={file} type="file" accept="image/*" hidden onChange={pick} />
        <button type="button" class="ghost" aria-label="附照片" disabled={busy} onClick={() => file.current?.click()}>
          <Icon id="camera" size={22} />
        </button>
        <input class="grow" value={text} onInput={(e) => setText(value(e))} placeholder="留言" enterkeyhint="send" />
        <button class="primary small" disabled={!ok}>送出</button>
      </form>
    </div>
  )
}
