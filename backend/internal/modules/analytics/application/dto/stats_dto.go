package analytics_dto

type KpiSummaryResponse struct {
	ListsCompletedToday int     `json:"listsCompletedToday"`
	ItemsPickedToday    int     `json:"itemsPickedToday"`
	UsersActiveToday    int     `json:"usersActiveToday"`
	TotalInventoryValue float64 `json:"totalInventoryValue"`
}
