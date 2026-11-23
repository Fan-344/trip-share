// 成員的小人：在團裡擔任什麼角色、髮型、髮色、膚色、衣服顏色。
// 存在行程的成員資料裡，跟著行程同步，全團看到的每個人都一樣。

/** 在團裡的角色：決定小人手上拿什麼、做什麼動作。空字串是沒選。 */
export type Job = '' | 'guide' | 'shopper' | 'photo' | 'cheer' | 'lazy'
export type Hair = 'short' | 'bob' | 'long' | 'bun' | 'pony'

export interface Look {
  job: Job
  /** 自己打的稱號；空白就顯示角色的名字。 */
  title: string
  hair: Hair
  hairColor: string
  skin: string
  coat: string
  /** 行李箱的顏色。 */
  bag: string
}

/** 出發前後的四個階段：決定小人身邊的行李是什麼樣子。 */
export type Stage = 'plan' | 'pack' | 'go' | 'trip'

export const JOBS: { id: Job; name: string; hint: string }[] = [
  { id: '', name: '旅伴', hint: '什麼都不拿' },
  { id: 'guide', name: '導遊', hint: '舉著小旗' },
  { id: 'shopper', name: '採買', hint: '提著購物袋' },
  { id: 'photo', name: '攝影', hint: '拿著相機' },
  { id: 'cheer', name: '氣氛擔當', hint: '舉手跳' },
  { id: 'lazy', name: '廢人', hint: '坐著滑手機' },
]

export const HAIRS: { id: Hair; name: string }[] = [
  { id: 'short', name: '短髮' }, { id: 'bob', name: '鮑伯' }, { id: 'long', name: '長髮' },
  { id: 'bun', name: '丸子頭' }, { id: 'pony', name: '馬尾' },
]

export const HAIR_COLORS = ['#3b2a22', '#6b4a3a', '#a8703f', '#d9a65a', '#c9584a', '#a892bd', '#9aa3a8']
export const SKINS = ['#f7dcc4', '#f1c9a8', '#d9a47e', '#b07a55']
export const COATS = ['#e9755c', '#f5c561', '#58b09a', '#6fa9bf', '#f4a8b8', '#a98bb0', '#8a5a4a']
export const BAGS = ['#f5c561', '#e9755c', '#58b09a', '#6fa9bf', '#f4a8b8', '#a98bb0', '#c48a66', '#9aa3a8']

const pick = <T>(list: readonly T[], n: number): T => list[n % list.length]

/** 還沒自己選之前的樣子：照成員代號算出來，每個人不一樣、但每次打開都相同。 */
export function defaultLook(id: string): Look {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return {
    job: '',
    title: '',
    hair: pick(HAIRS, h).id,
    hairColor: pick(HAIR_COLORS.slice(0, 4), h >>> 3),
    skin: pick(SKINS.slice(0, 3), h >>> 6),
    coat: pick(COATS, h >>> 9),
    bag: pick(BAGS, h >>> 12),
  }
}

const isJob = (v: unknown): v is Job => JOBS.some((j) => j.id === v)
const isHair = (v: unknown): v is Hair => HAIRS.some((x) => x.id === v)
const isColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)

/** 成員存的樣子（可能缺欄位，或是新版才有的值）補成完整的。 */
export function lookOf(member: { id: string; look?: Partial<Look> }): Look {
  const d = defaultLook(member.id)
  const s = member.look ?? {}
  return {
    job: isJob(s.job) ? s.job : d.job,
    title: typeof s.title === 'string' ? s.title.slice(0, 12) : '',
    hair: isHair(s.hair) ? s.hair : d.hair,
    hairColor: isColor(s.hairColor) ? s.hairColor : d.hairColor,
    skin: isColor(s.skin) ? s.skin : d.skin,
    coat: isColor(s.coat) ? s.coat : d.coat,
    bag: isColor(s.bag) ? s.bag : d.bag,
  }
}

/** 顯示在名字旁邊的稱號：自己打的優先，其次是角色名；「旅伴」不顯示。 */
export function titleOf(look: Look): string {
  return look.title.trim() || (look.job ? JOBS.find((j) => j.id === look.job)!.name : '')
}

const DAY = 86_400_000

/** 現在是哪個階段。msToGo 是離出發還有多久；onTrip 是已經在旅行中（或回來了）。 */
export function stageOf(msToGo: number, onTrip: boolean): Stage {
  if (onTrip) return 'trip'
  if (msToGo > 7 * DAY) return 'plan'
  if (msToGo > DAY) return 'pack'
  return 'go'
}
