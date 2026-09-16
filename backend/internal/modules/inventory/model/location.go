package model

import "time"

type Location struct {
	ID        int        `db:"id" json:"id"`
	Code      string     `db:"code" json:"code"`
	Building  string     `db:"building" json:"building"`
	Floor     *int       `db:"floor" json:"floor"` // Menggunakan pointer karena 0 berarti lantai dasar, berbeda dengan NULL
	Name      string     `db:"name" json:"name"`
	CreatedAt time.Time  `db:"created_at" json:"created_at"`
	Purpose   string     `db:"purpose" json:"purpose"`
	IsActive  bool       `db:"is_active" json:"is_active"`
	DeletedAt *time.Time `db:"deleted_at" json:"deleted_at"` // Pointer untuk penanganan soft delete NULL
}
