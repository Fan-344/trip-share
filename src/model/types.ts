// 資料模型型別（規格書第 5 節）
import type { Look } from '../avatar'

/** 做出改動的人與裝置。pubkey 之後會是 Nostr 公鑰；device 是每次安裝產生的隨機 ID。 */
export interface Actor {
  pubkey: string
  device: string
}

/** 每筆資料都帶的欄位。 */
export interface Meta {
  id: string
  createdAt: number
  createdBy: string
  updatedAt: number
  updatedBy: string
  /** 已標記刪除（且之後沒有人再改過）。 */
  deleted: boolean
  /** 修改次數（所有裝置加總）。 */
  revCount: number
}

/** 當地時間＋時區，例如 { local: '2027-03-05T13:05', tz: 'Asia/Taipei' }。兩者一起改，所以存成一個值。 */
export interface LocalTime {
  local: string
  tz: string
}

export type Role = 'admin' | 'member'

export interface TripMeta {
  id: string
  title: string
  startDate: string
  endDate: string
  /** 資料結構版本，之後改結構時用來升級。 */
  schema: number
  /** 佈景主題；沒選（空白或沒有這個欄位）就依目的地自動決定。見 src/themes.ts。 */
  theme?: string
  /** 一兩句話的行程簡介，顯示在總覽。 */
  desc?: string
  /** 管理員把整份行程刪除時寫入；null 或沒有這個欄位代表行程還在。內容不會真的清掉，可以取消刪除。 */
  deleted?: { by: string; at: number } | null
}

/** 某一天的標題與圖示（例如「抵達清邁」）。以日期當 ID。 */
export interface DayInfo {
  title: string
  /** 圖示代號，見 src/ui/Icons.tsx；空白就用主題預設的。 */
  icon: string
}

export interface Member {
  nickname: string
  role: Role
  joinedAt: number
  /** 小人的樣子和在團裡的角色（見 src/avatar.ts）；沒選過的欄位照成員代號給預設。 */
  look?: Partial<Look>
  /** 不用手機的成員（小孩、長輩）：沒有金鑰，由其他人代管。 */
  managed?: boolean
}

export interface Flight {
  code: string
  from: string
  to: string
  dep: LocalTime
  arr: LocalTime
  cabin: string
  aircraft: string
}

/** 訂位代號：只存本機，永不同步、不進備份。 */
export interface Pnr {
  airline: string
  code: string
}

export interface Stay {
  name: string
  checkIn: string
  checkOut: string
  mapUrl: string
  confirmed: boolean
}

export type ItemKind = 'normal' | 'must' | 'reminder'

export interface Item {
  date: string
  /** 'HH:mm'，沒有時間就留空字串。 */
  time: string
  tz: string
  title: string
  note: string
  place: string
  transport: string
  kind: ItemKind
  /** 類別（交通、用餐、景點…），決定時間軸上的圖示；舊資料沒有這個欄位。 */
  cat?: ItemCat
  /** 時間是大約的（顯示「約」）。 */
  approx?: boolean
  /** 地圖連結（從地圖 App 複製的分享連結）。 */
  mapUrl?: string
  /**
   * 沒貼地圖連結時，要不要用地點名稱到地圖搜尋。編輯畫面的勾選項。
   * 沒有這個欄位（舊資料）時看類別：用餐、景點、體驗、購物預設要，其他預設不要。
   */
  mapSearch?: boolean
}

export type ItemCat = '' | 'flight' | 'transport' | 'food' | 'sight' | 'activity' | 'rest' | 'shop' | 'stay'

export type ListKind = 'shared' | 'personal' | 'private'

export interface List {
  kind: ListKind
  title: string
  /** 擁有者公鑰（個人清單可多人共管）。 */
  owners: string[]
  /** 圖示代號，見 src/ui/Icons.tsx；空白就依名稱自動配。 */
  icon?: string
}

export interface ListItem {
  listId: string
  name: string
  /** 在清單的哪一個欄位（子清單，例如「證件」「衣物」）；空白是不屬於任何欄位。 */
  section?: string
  /** 舊版的欄位名，讀到會搬到 section（見 Trip.tidyLists）。 */
  group?: string
  /** 補充說明（例如「需至少到 2027/5/25 之後」）。 */
  note?: string
}

/** 行前準備頁的重點說明（例如「簽證與入境重點」）：只有文字，不用勾。 */
export interface Note {
  title: string
  /** 一行一個重點。 */
  body: string
}

/** 購物清單的一項。代買的需求另外存（每個成員各自一格，見 Trip.setWant）。 */
export interface ShopItem {
  name: string
  note: string
  /** 預計哪一天買；空白是還沒決定。 */
  date: string
  /** 搭配哪個行程項目去買（行程項目的 ID）；空白是沒有指定。 */
  itemId: string
  place: string
  /** 負責去買的人（公鑰）；空白是還沒有人負責。 */
  owner: string
  /** 負責的人自己要買幾個。 */
  qty: number
  bought: boolean
  /**
   * 現場詢問：我在店裡看到東西，問大家要不要。跟事先計畫的代購差在——
   * 每個人都要回覆（要幾個，或不用），畫面會列出誰還沒回。
   */
  ask?: boolean
  /** 價錢，隨手寫（例如「350 泰銖」）。 */
  price?: string
}

export type ShopItemView = ShopItem & Meta & {
  /** 誰要幾個（公鑰 → 數量，只列大於 0 的）。 */
  wants: Record<string, number>
  /** 明確回覆「不用」的人。 */
  declined: string[]
  /** 合計要買幾個（自己的加上別人要的）。 */
  total: number
}

/**
 * 一張照片的索引。ref 是它屬於哪一筆（例如購物項目的 ID）。
 *
 * 文件裡只記照片的雜湊與大小；照片本身（縮小過的 JPEG）另外存、另外傳（store/blobs.ts、sync/blobs.ts）。
 * data 是舊版的做法——把整張照片塞在同步文件裡。舊資料還讀得到，拍的人下次打開行程時會自動搬成新的存法。
 */
export interface Photo {
  ref: string
  /** 照片內容的 SHA-256（十六進位），也是它的檔名。 */
  hash?: string
  /** 位元組數。 */
  size?: number
  /** 舊版：照片直接放在這裡。 */
  data?: Uint8Array | null
}

export interface CheckState {
  checked: boolean
  checkedBy: string[]
}

export interface Comment {
  itemId: string
  text: string
  /** 長邊 800 px 的縮圖；原圖不進資料模型。 */
  thumb: Uint8Array | null
}

export type HistoryOp = 'create' | 'update' | 'delete' | 'restore'

export interface HistoryEntry {
  id: string
  at: number
  by: string
  /** 哪個集合（items、flights…；行程本身是 'trip'）。 */
  coll: string
  recId: string
  op: HistoryOp
  field?: string
  old?: unknown
}
