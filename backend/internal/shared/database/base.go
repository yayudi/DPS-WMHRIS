package database

import "time"

// BaseEntity menyimpan field umum yang ada di sebagian besar tabel
type BaseEntity struct {
	ID        int       `db:"id" json:"id"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
	UpdatedAt time.Time `db:"updated_at" json:"updated_at"`
}
