// 匯入機票：貼上文字，或選 PDF／截圖／登機證照片。讀到的航班列出來，一班一班確認後才存。
import { useRef, useState } from 'preact/hooks'
import { importFile, importText, type ImportResult } from '../import'
import { missingFields } from '../ticket'
import { airportName, fullDay } from '../time'
import { Icon } from './Icons'
import { Field, Sheet, value } from './kit'

/** 一次匯入讀到的結果，以及哪幾班已經加進行程。放在總覽頁，確認完一班回來清單還在。 */
export interface ImportState extends ImportResult {
  added: number[]
}

const VIA: Record<ImportResult['via'], string> = {
  text: '從貼上的文字讀到',
  pdf: '從 PDF 讀到',
  barcode: '從登機證條碼讀到（條碼裡沒有時間，要自己填）',
  ocr: '從圖片辨識出來的，可能有錯字，請仔細核對',
}

export function ImportSheet({ near, state, onState, onPick, onClose }: {
  /** 行程出發日，機票上沒寫年份時用來猜。 */
  near: string
  state: ImportState | null
  onState: (s: ImportState | null) => void
  /** 使用者選了一班要確認：開航班表單。 */
  onPick: (index: number) => void
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const hint = { near }

  const show = (r: ImportResult, emptyMessage: string) => {
    if (r.flights.length === 0) return setError(emptyMessage)
    setError('')
    onState({ ...r, added: [] })
  }

  const pick = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    ;(e.target as HTMLInputElement).value = ''
    if (!file) return
    setError('')
    setBusy('處理中…')
    try {
      const r = await importFile(file, hint, (stage, p) => setBusy(p === undefined ? stage : `${stage}${Math.round(p * 100)}%`))
      show(r, r.via === 'ocr'
        ? '這張圖讀不出航班。試試把確認信的文字複製貼上（iPhone 可以長按照片裡的文字複製）。'
        : '這個檔案裡找不到航班。試試把確認信的文字複製貼上。')
    } catch (e) {
      console.error('匯入機票失敗', e)
      setError(navigator.onLine
        ? '這個檔案處理不了。試試把確認信的文字複製貼上。'
        : '第一次辨識需要網路下載辨識工具（之後離線也能用）。現在可以先用貼上文字的方式。')
    } finally {
      setBusy('')
    }
  }

  if (state) {
    const left = state.flights.filter((_, i) => !state.added.includes(i)).length
    return (
      <Sheet title="匯入機票" onClose={onClose}>
        <p class="muted">{VIA[state.via]}。點一班核對內容，確認後才會加進行程。</p>
        {state.flights.map((f, i) => {
          const done = state.added.includes(i)
          const missing = missingFields(f)
          return (
            <div class="card flat ticket" key={i}>
              <div class="row">
                <h3 class="grow">{f.code}　{f.from || '？'} → {f.to || '？'}</h3>
                {done && <span class="chip green">已加入</span>}
              </div>
              <p>
                {f.depDate ? fullDay(f.depDate) : '日期？'}
                {f.depTime && `　${f.depTime}`}{f.arrTime && ` → ${f.arrTime}`}
                {(airportName(f.from) || airportName(f.to)) && `　${airportName(f.from) || f.from}→${airportName(f.to) || f.to}`}
              </p>
              {!done && missing.length > 0 && <p class="muted">沒讀到：{missing.join('、')}，下一步自己補。</p>}
              {!done && <button class="small primary" onClick={() => onPick(i)}>核對並加入</button>}
            </div>
          )
        })}
        {state.flights.some((f) => f.pnr) && (
          <p class="muted"><Icon id="lock" size={14} /> 訂位代號只會存在這支手機上，不會同步給任何人。</p>
        )}
        <div class="actions">
          <button type="button" onClick={() => onState(null)}>重新匯入</button>
          <button class="primary" onClick={onClose}>{left ? '先這樣' : '完成'}</button>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet title="匯入機票" onClose={onClose}>
      <p class="muted">全部在這支手機上處理，機票不會傳到任何地方。讀到的內容會先給你核對。</p>
      <Field label="把確認信或電子機票的文字貼在這裡（最準）">
        <textarea style="min-height:120px" value={text} onInput={(e) => setText(value(e))} placeholder={'例如：\nJX1751 3月5日 TPE 07:10 → CNX 10:20'} />
      </Field>
      <button class="primary" style="width:100%" disabled={!text.trim() || !!busy}
        onClick={() => show(importText(text, hint), '這段文字裡找不到航班。請確認有貼到航班代號（例如 JX1751）那一段。')}>
        讀取這段文字
      </button>
      <input ref={input} type="file" accept="application/pdf,image/*" onChange={pick} hidden />
      <button type="button" class="add" disabled={!!busy} onClick={() => input.current?.click()}>
        <Icon id="camera" size={22} />{busy || '選 PDF、截圖或登機證照片'}
      </button>
      <p class="muted">截圖只認得英文和數字；登機證請把條碼整個拍進去。第一次用圖片要下載辨識工具（約 7 MB）。</p>
      {error && <div class="notice" style="display:block">{error}</div>}
    </Sheet>
  )
}
