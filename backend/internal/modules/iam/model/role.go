package model

type Role struct {
	ID          int    `db:"id" json:"id"`
	Name        string `db:"name" json:"name"`
	Description string `db:"description" json:"description"` // Menggunakan string biasa (tanpa NullString) sesuai keputusan modifikasi DB
}
