// 實測公共 Nostr 中繼站：能不能寫入、讀回本專案用的事件（kind 30078、用 #t 過濾）、可接受多大的內容。
// 用一次性的隨機金鑰與隨機內容，不含任何行程資料。
// 用法：node scripts/relay-probe.mjs [wss://relay1 wss://relay2 ...]
import { finalizeEvent, generateSecretKey } from 'nostr-tools/pure'

const CANDIDATES = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://nostr.mom',
  'wss://relay.snort.social',
  'wss://offchain.pub',
  'wss://relay.nostr.band',
  'wss://nostr-pub.wellorder.net',
  'wss://relay.nostr.net',
  'wss://nostr.oxtr.dev',
]
const urls = process.argv.slice(2).length ? process.argv.slice(2) : CANDIDATES
const SIZES = [1_000, 40_000, 100_000]
const sk = generateSecretKey()
const rand = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('')

function probe(url) {
  return new Promise((resolve) => {
    const r = { url, connectMs: null, sizes: {}, readBack: false, note: '' }
    const room = rand(16)
    const t0 = Date.now()
    let ws
    const done = () => { clearTimeout(timer); try { ws.close() } catch {} ; resolve(r) }
    const timer = setTimeout(() => { r.note ||= '逾時'; done() }, 20_000)
    try { ws = new WebSocket(url) } catch (e) { r.note = String(e); return done() }
    const events = SIZES.map((size, i) => finalizeEvent({
      kind: 30078,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['d', `${room}:probe:${i}`], ['t', room], ['expiration', String(Math.floor(Date.now() / 1000) + 600)]],
      content: rand(size / 2),
    }, sk))
    let next = 0
    const send = () => {
      if (next < events.length) ws.send(JSON.stringify(['EVENT', events[next]]))
      else ws.send(JSON.stringify(['REQ', 'q', { kinds: [30078], '#t': [room] }]))
    }
    let got = 0
    ws.onopen = () => { r.connectMs = Date.now() - t0; send() }
    ws.onerror = () => { r.note ||= '連線失敗'; done() }
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data)
      if (msg[0] === 'OK') {
        r.sizes[SIZES[next]] = msg[2] ? 'ok' : `拒絕：${msg[3]}`
        next++
        send()
      } else if (msg[0] === 'EVENT') got++
      else if (msg[0] === 'EOSE') {
        const accepted = Object.values(r.sizes).filter((v) => v === 'ok').length
        r.readBack = accepted > 0 && got === accepted
        if (!r.readBack) r.note = `寫入 ${accepted} 筆、讀回 ${got} 筆`
        done()
      } else if (msg[0] === 'NOTICE' || msg[0] === 'CLOSED') r.note = String(msg[msg.length - 1])
    }
  })
}

const results = await Promise.all(urls.map(probe))
for (const r of results) {
  const sizes = SIZES.map((s) => `${s / 1000}KB=${r.sizes[s] ?? '-'}`).join('  ')
  console.log(`${r.readBack ? '✓' : '✗'} ${r.url.padEnd(34)} 連線 ${String(r.connectMs ?? '-').padStart(5)}ms  ${sizes}  ${r.note}`)
}
process.exit(0)
