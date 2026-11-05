package database

import (
	"context"
	"fmt"
	"strings"

	"github.com/jmoiron/sqlx"
)

// PaginatedResult merepresentasikan struktur data respon generik untuk paginasi.
type PaginatedResult[T any] struct {
	Data       []T `json:"data"`
	Total      int `json:"total"`
	Page       int `json:"page"`
	Limit      int `json:"limit"`
	TotalPages int `json:"total_pages"`
}

// FetchPaginated mengeksekusi baseQuery, menghitung total baris, dan mengambil data sesuai page & limit.
// Secara internal otomatis menggunakan transaksi aktif dari context jika tersedia (via GetExt),
// atau fallback ke koneksi database utama.
// baseQuery tidak boleh mengandung klausa LIMIT/OFFSET di bagian akhir.
func FetchPaginated[T any](ctx context.Context, db *sqlx.DB, baseQuery string, page, limit int, args ...interface{}) (PaginatedResult[T], error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 10
	}

	ext := GetExt(ctx, db)

	// 1. Hitung total data keseluruhan menggunakan subquery
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM (%s) AS sub_q", baseQuery)
	var total int
	err := ext.GetContext(ctx, &total, countQuery, args...)
	if err != nil {
		return PaginatedResult[T]{}, fmt.Errorf("failed to count rows: %w", err)
	}

	// Short-circuit: Jika total 0, kembalikan array kosong, abaikan query data utama
	if total == 0 {
		return PaginatedResult[T]{
			Data:       []T{},
			Total:      0,
			Page:       page,
			Limit:      limit,
			TotalPages: 0,
		}, nil
	}

	// 2. Ambil data dengan LIMIT dan OFFSET
	offset := (page - 1) * limit
	paginatedQuery := fmt.Sprintf("%s LIMIT ? OFFSET ?", strings.TrimSpace(baseQuery))
	fetchArgs := append(args, limit, offset)

	var data []T
	err = ext.SelectContext(ctx, &data, paginatedQuery, fetchArgs...)
	if err != nil {
		return PaginatedResult[T]{}, fmt.Errorf("failed to fetch paginated data: %w", err)
	}

	// 3. Kalkulasi metadata
	totalPages := total / limit
	if total%limit != 0 {
		totalPages++
	}

	return PaginatedResult[T]{
		Data:       data,
		Total:      total,
		Page:       page,
		Limit:      limit,
		TotalPages: totalPages,
	}, nil
}
