package utils

import (
	"context"
	"fmt"
	"strings"
)

// DBExt mendefinisikan interface yang dimiliki oleh *sqlx.DB dan *sqlx.Tx
// agar fungsi utilitas generik dapat digunakan secara mulus di dalam maupun di luar transaksi.
type DBExt interface {
	SelectContext(ctx context.Context, dest interface{}, query string, args ...interface{}) error
	GetContext(ctx context.Context, dest interface{}, query string, args ...interface{}) error
}

// FetchPaginated mengeksekusi baseQuery, menghitung total baris, dan mengambil data sesuai page & limit.
// baseQuery tidak boleh mengandung klausa LIMIT/OFFSET di bagian akhir.
func FetchPaginated[T any](ctx context.Context, db DBExt, baseQuery string, page, limit int, args ...interface{}) (PaginatedResult[T], error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 10
	}

	// 1. Hitung total data keseluruhan menggunakan subquery
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM (%s) AS sub_q", baseQuery)
	var total int
	err := db.GetContext(ctx, &total, countQuery, args...)
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
	err = db.SelectContext(ctx, &data, paginatedQuery, fetchArgs...)
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
