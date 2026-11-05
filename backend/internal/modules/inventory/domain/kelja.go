package domain

// KeljaFulfillmentItem represents a line item in a Kelja fulfillment order.
type KeljaFulfillmentItem struct {
	ProductCode string `json:"product_code"`
	Quantity    int    `json:"quantity"`
}

// KeljaFulfillmentSummary represents high-level order metadata returned by the Kelja fulfillment list API.
type KeljaFulfillmentSummary struct {
	ID            int    `json:"id"`
	Code          string `json:"code"`
	Status        string `json:"status"`
	WarehouseCode string `json:"warehouse_code"`
}

// KeljaFulfillmentDetail represents detailed order information including line items.
type KeljaFulfillmentDetail struct {
	ID    int                    `json:"id"`
	Code  string                 `json:"code"`
	Items []KeljaFulfillmentItem `json:"items"`
}
