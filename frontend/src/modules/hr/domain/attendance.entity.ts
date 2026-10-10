export interface AttendanceSummary {
  totalUsers: number
  totalLate: number
  totalAlpha: number
  holidayMap?: Record<string, any>
}

export interface AttendanceUser {
  id: number | string
  name: string
  logs: AttendanceLog[]
}

export interface AttendanceLog {
  date: string
  clockIn?: string
  clockOut?: string
  status?: string
}

export interface AttendanceData {
  summary: AttendanceSummary
  users: AttendanceUser[]
}
