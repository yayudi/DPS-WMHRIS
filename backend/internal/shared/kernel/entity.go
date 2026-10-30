package kernel

import "time"

// BaseEntity mendefinisikan field standar identitas dan audit timestamp untuk entitas yang dapat dimodifikasi.
type BaseEntity struct {
	ID        int       `db:"id" json:"id"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
	UpdatedAt time.Time `db:"updated_at" json:"updated_at"`
}

// ImmutableEntity mendefinisikan field standar untuk entitas append-only tanpa timestamp pembaruan (misal: log, audit, event).
type ImmutableEntity struct {
	ID        int       `db:"id" json:"id"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
}

// SoftDeletable menyertakan timestamp soft delete untuk entitas yang mendukung penandaan nonaktif/terhapus logis.
type SoftDeletable struct {
	DeletedAt *time.Time `db:"deleted_at" json:"deleted_at"`
}

