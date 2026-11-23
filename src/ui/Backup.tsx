// 備份與還原的畫面（規格書第 7 節）：首頁的備份區、下載、從備份檔還原、找回我的資料。
import { useEffect, useState } from 'preact/hooks'
import { currentPlatform } from '../pwa'
import { BackupError, createBackup, readBackup, restoreBackup, type BackupData, type RestoreMode, type RestoreResult } from '../store/backup'
import type { Registry } from '../store/local'
import { ago } from '../time'
import { Fold } from './fold'
import { Icon } from './Icons'
import { Field, Seg, Sheet, useNow, value } from './kit'

const DAY = 86_400_000

/** 把檔案交給使用者。iPhone 走分享面板（可以選「儲存到檔案」）；其他走一般下載。取消回傳 false。 */
async function saveFile(name: string, text: string): Promise<boolean> {
  const blob = new Blob([text], { type: 'application/json' })
  if (currentPlatform().ios && typeof navigator.share === 'function') {
    const file = new File([blob], name, { type: 'application/json' })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] })
        return true
      } catch (e) {
        if ((e as Error).name === 'AbortError') return false
        // 分享失敗就退回一般下載
      }
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000)
  return true
}

/** 從歡迎畫面開始、還沒把結果給使用者看過的還原。首頁出現時接手，做完後顯示一次結果。 */
let pendingRestore: Promise<RestoreResult> | null = null

function ResultSheet({ result, onClose }: { result: RestoreResult; onClose: () => void }) {
  const lines = [
    result.added.length > 0 && `還原了 ${result.added.length} 份行程：${result.added.join('、')}`,
    result.merged.length > 0 && `合併回 ${result.merged.length} 份原有的行程：${result.merged.join('、')}`,
    result.copied.length > 0 && `另存了 ${result.copied.length} 份副本：${result.copied.join('、')}`,
    result.identity === 'adopted' && '身分已還原，你還是原本的那個成員。',
    result.identity === 'kept' && '這份備份是另一個身分的；你目前的身分沒有變。',
    result.identity === 'none' && '這是單趟行程的檔案，沒有帶身分；你用的是這支手機上原本的身分。',
  ].filter(Boolean)
  return (
    <Sheet title="還原完成" onClose={onClose}>
      <ul class="plain">{lines.map((l) => <li key={String(l)}>{l}</li>)}</ul>
      <p class="muted">訂位代號不在備份裡，要重新填。</p>
      <div class="actions"><button class="primary" onClick={onClose}>完成</button></div>
    </Sheet>
  )
}

/** 首頁的備份區：上次備份多久以前、下載、還原。 */
export function BackupCard({ reg }: { reg: Registry }) {
  const now = useNow(60_000)
  const [sheet, setSheet] = useState<'download' | 'restore' | null>(null)
  const [justRestored, setJustRestored] = useState<RestoreResult | null>(null)
  useEffect(() => {
    const running = pendingRestore
    pendingRestore = null
    running?.then(setJustRestored).catch(() => {})
  }, [])
  const last = reg.lastBackupAt()
  const stale = reg.trips().length > 0 && (last === null || now - last > 7 * DAY)
  return (
    <div>
      {/* 該備份了（沒備份過或超過 7 天）才預設展開提醒；平常收著，標題列看得到上次備份的時間。 */}
      <Fold key={String(stale)} title="備份" summary={last === null ? '還沒備份過' : `上次：${ago(last, now)}`} open={stale}>
      <div class="card flat" style={stale ? 'background:var(--yellow-l)' : ''}>
        <p class="muted" style="margin-top:0">
          資料只存在這支手機；備份檔可以找回身分、行程和私人清單。
        </p>
        <div class="row wrap">
          <button class={stale ? 'primary' : ''} disabled={reg.trips().length === 0} onClick={() => setSheet('download')}>
            下載備份檔
          </button>
          <button onClick={() => setSheet("restore")}>載入備份檔</button>
        </div>
      </div>
      </Fold>
      {sheet === 'download' && <DownloadSheet reg={reg} onClose={() => setSheet(null)} />}
      {sheet === 'restore' && <RestoreSheet reg={reg} onClose={() => setSheet(null)} />}
      {justRestored && <ResultSheet result={justRestored} onClose={() => setJustRestored(null)} />}
    </div>
  )
}

/**
 * 下載備份檔。不給 only 是完整備份（身分＋所有行程）；給了就是只備份那一趟（不含身分）。
 */
export function DownloadSheet({ reg, only, onClose }: { reg: Registry; only?: { id: string; title: string }; onClose: () => void }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const mismatch = pw !== '' && pw !== pw2
  const save = async () => {
    setBusy(true)
    try {
      const text = await createBackup(reg, pw, only?.id ?? '')
      const d = new Date()
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      // 檔名裡的行程名稱只留安全的字，避免奇怪的符號讓檔案存不了
      const safe = (only?.title ?? '').replace(/[\\/:*?"<>|\s]+/g, '').slice(0, 20)
      const name = only ? `旅遊共編-${safe || '行程'}-${day}.json` : `旅遊共編備份-${day}.json`
      if (await saveFile(name, text)) {
        // 只有完整備份才算「備份過了」：單趟的檔案救不回身分和其他行程
        if (!only) reg.setLastBackup(Date.now())
        setDone(true)
      }
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet title={only ? '備份這趟行程' : '下載備份檔'} onClose={onClose}>
      {done ? (
        <div>
          <p class="row"><Icon id="check" size={22} />備份檔已經存出去了。</p>
          <p class="muted">請存到手機以外的地方。</p>
          <div class="actions"><button class="primary" onClick={onClose}>完成</button></div>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (!mismatch && !busy) void save() }}>
          {only ? (
            <p>
              只包含「{only.title}」和你在這趟的私人清單。
              <b>不包含你的身分，也不包含訂位代號。</b>
            </p>
          ) : (
            <p>備份檔包含你的身分、{reg.trips().length} 份行程的完整內容和私人清單。<b>不包含訂位代號。</b></p>
          )}
          <Field label="密碼（可不設）">
            <input type="password" value={pw} onInput={(e) => setPw(value(e))} autocomplete="new-password" />
          </Field>
          {pw !== '' && (
            <Field label={mismatch ? '再輸入一次密碼（兩次不一樣）' : '再輸入一次密碼'}>
              <input type="password" value={pw2} onInput={(e) => setPw2(value(e))} autocomplete="new-password" />
            </Field>
          )}
          <div class="notice" style="display:block">
            {pw !== ''
              ? '忘記密碼就打不開，無法復原。'
              : only
                ? '沒有設密碼：拿到這個檔案的人可以看、也可以改這趟行程（跟拿到邀請連結一樣），而且看得到你在這趟的私人清單。'
                : '沒有設密碼：拿到這個檔案的人可以看到所有行程，並以你的身分修改。請自己收好，不要傳給別人。'}
          </div>
          <div class="actions">
            <button class="primary" disabled={mismatch || busy}>{busy ? '準備中…' : '下載'}</button>
          </div>
        </form>
      )}
    </Sheet>
  )
}

/** 從備份檔還原。firstRun：手機上還沒有身分時（找回我的資料），還原後直接變成備份裡的那個人。 */
export function RestoreSheet({ reg, onClose }: { reg: Registry; onClose: () => void }) {
  const [text, setText] = useState('')
  const [data, setData] = useState<BackupData | null>(null)
  const [needPw, setNeedPw] = useState(false)
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [mode, setMode] = useState<RestoreMode>('merge')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<RestoreResult | null>(null)

  const open = async (raw: string, password: string) => {
    setError('')
    try {
      setData(await readBackup(raw, password))
      setNeedPw(false)
    } catch (e) {
      if (e instanceof BackupError && e.code === 'need-password') setNeedPw(true)
      else setError(e instanceof Error ? e.message : '讀不了這個檔案。')
    }
  }
  const pick = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    const raw = await file.text()
    setText(raw)
    setData(null)
    await open(raw, '')
  }

  if (result) return <ResultSheet result={result} onClose={onClose} />

  const existing = data ? data.trips.filter((t) => reg.trip(t.id)).length : 0
  return (
    <Sheet title="載入備份檔" onClose={onClose}>
      <Field label="選擇檔案：完整備份，或單趟行程的檔案">
        <input type="file" accept=".json,application/json" onChange={pick} style="padding:8px" />
      </Field>
      {needPw && (
        <form onSubmit={(e) => { e.preventDefault(); void open(text, pw) }}>
          <Field label="這份備份有密碼">
            <input type="password" value={pw} onInput={(e) => setPw(value(e))} autocomplete="current-password" />
          </Field>
          <button disabled={!pw}>打開</button>
        </form>
      )}
      {error && <div class="notice" style="display:block">{error}</div>}

      {data && (
        <div>
          <p>
            {data.me ? <span><b>{data.me.nickname}</b> 在 {new Date(data.createdAt).toLocaleString("zh-TW", { hour12: false })} 的完整備份，</span> : <span>{new Date(data.createdAt).toLocaleString("zh-TW", { hour12: false })} 存的單趟行程檔，</span>}
            共 {data.trips.length} 份行程：
          </p>
          <ul class="plain">
            {data.trips.map((t) => (
              <li class="row" key={t.id}>
                <span class="grow">{t.title}</span>
                <span class={`chip ${reg.trip(t.id) ? 'yellow' : 'green'}`}>{reg.trip(t.id) ? '手機上已有' : '手機上沒有'}</span>
              </li>
            ))}
          </ul>
          {existing > 0 && (
            <div style="margin-top:10px">
              <span class="muted">手機上已有的 {existing} 份要怎麼處理</span>
              <Seg value={mode} options={[['merge', '合併回原行程'], ['copy', '另存成舊版副本']]} onChange={setMode} />
              <p class="muted">
                {mode === 'merge'
                  ? '和現在的內容合併，之後的修改會保留。'
                  : '另存一份當時的樣子，不會同步。'}
              </p>
            </div>
          )}
          <div class="actions">
            <button class="primary" disabled={busy} onClick={async () => {
              setBusy(true)
              try {
                // 從歡迎畫面還原時，身分一寫回去畫面就會換成首頁、這個面板跟著消失（那時行程還在還原中），
                // 所以把「還在進行的還原」交給首頁，等它做完由首頁顯示結果。
                const firstRun = !reg.me()
                const running = restoreBackup(reg, data, mode)
                if (firstRun) pendingRestore = running
                setResult(await running)
              } catch (e) {
                setError(e instanceof Error && e.message ? e.message : '還原時發生錯誤，沒有完成。')
              } finally {
                setBusy(false)
              }
            }}>{busy ? '還原中…' : '還原'}</button>
          </div>
        </div>
      )}
    </Sheet>
  )
}

/** 「找回我的資料」：手機上什麼都沒有時，在歡迎畫面提供的入口。 */
export function Recover({ reg }: { reg: Registry }) {
  const [open, setOpen] = useState(false)
  const [restoring, setRestoring] = useState(false)
  return (
    <div style="margin-top:28px">
      <button class="small" type="button" onClick={() => setOpen(true)}>找回我的資料</button>
      {open && !restoring && (
        <Sheet title="找回我的資料" onClose={() => setOpen(false)}>
          <div class="card flat">
            <b>我有備份檔</b>
            
            <button class="primary" onClick={() => setRestoring(true)}>上傳備份檔</button>
          </div>
          <div class="card flat">
            <b>我沒有備份檔</b>
            <p class="muted">
              請家人給你邀請 QR Code，用新身分加入。
              私人清單和訂位代號找不回來。
            </p>
          </div>
        </Sheet>
      )}
      {restoring && <RestoreSheet reg={reg} onClose={() => { setRestoring(false); setOpen(false) }} />}
    </div>
  )
}
