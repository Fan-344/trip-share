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
}

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
