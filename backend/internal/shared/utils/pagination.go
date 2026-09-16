package utils

// PaginatedResult merepresentasikan struktur data respon generik untuk paginasi.
// Tipe T akan diisi dengan struct model/dto spesifik tanpa menggunakan reflect.
type PaginatedResult[T any] struct {
	Data       []T `json:"data"`
	Total      int `json:"total"`
	Page       int `json:"page"`
	Limit      int `json:"limit"`
	TotalPages int `json:"total_pages"`
}
