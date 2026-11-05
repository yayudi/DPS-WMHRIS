package domain

// Role represents the roles table.
// keep: roles table has no audit timestamp columns (created_at/updated_at).
type Role struct {
	ID          int    `db:"id" json:"id"`
	Name        string `db:"name" json:"name"`
	Description string `db:"description" json:"description"` // Menggunakan string biasa (tanpa NullString) sesuai keputusan modifikasi DB
}
