package dto

type GetHistoryRequest struct {
	StartDate string `form:"startDate" validate:"required,datetime=2006-01-02"`
	EndDate   string `form:"endDate" validate:"required,datetime=2006-01-02"`
	Search    string `form:"search"`
}

type GetRangeDataRequest struct {
	StartDate string `form:"startDate" validate:"required,datetime=2006-01-02"`
	EndDate   string `form:"endDate" validate:"required,datetime=2006-01-02"`
}

type UpdateLogRequest struct {
	Username string  `json:"username" validate:"required"`
	Date     string  `json:"date" validate:"required,datetime=2006-01-02"`
	TimeIn   *string `json:"timeIn"`
	TimeOut           *string `json:"timeOut"`
	Status            string  `json:"status"`
	LatePardonMinutes *int    `json:"latePardonMinutes"`
	Notes             *string `json:"notes"`
}

type AttendanceRangeResponse struct {
	AllUsers   []map[string]interface{} `json:"allUsers"`
	LogRows    []map[string]interface{} `json:"logRows"`
	GlobalInfo map[string]interface{}   `json:"globalInfo"`
}
