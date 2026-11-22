// 資料模型型別（規格書第 5 節）

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
}

export type ItemCat = '' | 'flight' | 'transport' | 'food' | 'sight' | 'activity' | 'rest' | 'shop' | 'stay'

export type ListKind = 'shared' | 'personal' | 'private'

export interface List {
  kind: ListKind
  title: string
  /** 擁有者公鑰（個人清單可多人共管）。 */
  owners: string[]
}

export interface ListItem {
  listId: string
  name: string
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
