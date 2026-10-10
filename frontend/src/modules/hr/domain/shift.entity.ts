export interface Shift {
  id?: number | string
  name: string
  startTime: string
  endTime: string
  description?: string
}

export interface Schedule {
  id?: number | string
  userId: number | string
  shiftId: number | string
  date: string
  shift?: Shift
}
