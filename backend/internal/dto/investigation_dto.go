package dto

type GetDuplicateTransactionsRequest struct {
	StartDate           string   `form:"startDate"`
	EndDate             string   `form:"endDate"`
	IncludeNotes        string   `form:"includeNotes"`
	ExcludeNotes        string   `form:"excludeNotes"`
	MovementType        *string  `form:"movementType"`
	ProductName         string   `form:"productName"`
	Username            string   `form:"username"`
	Location            string   `form:"location"`
	ExactQuantity       string   `form:"exactQuantity"`
	RevertStatus        string   `form:"revertStatus"`
	PlSource            *string  `form:"plSource"`
	PlStatus            *string  `form:"plStatus"`
	PlMarketplaceStatus string   `form:"plMarketplaceStatus"`
	PlCustomer          string   `form:"plCustomer"`
	MinOccurrences      *int     `form:"minOccurrences"`
	MaxOccurrences      *int     `form:"maxOccurrences"`
	MinSku              *int     `form:"minSku"`
	MaxSku              *int     `form:"maxSku"`
	MaxTimeGap          *int     `form:"maxTimeGap"`
	SortBy              string   `form:"sortBy"`
	SortDirection       string   `form:"sortDirection"`
	Page                int      `form:"page,default=1"`
	Limit               int      `form:"limit,default=10"`
}

type RevertTransactionRequest struct {
	// Usually empty because ID is in params, but just in case we need a body later
}
