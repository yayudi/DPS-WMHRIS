package utils

import (
	"github.com/dps-wmhris/backend/internal/shared/database"
)

// PaginatedResult merepresentasikan struktur data respon generik untuk paginasi.
// Di-alias ke database.PaginatedResult untuk menjaga kompatibilitas seluruh port dan handler.
type PaginatedResult[T any] = database.PaginatedResult[T]
