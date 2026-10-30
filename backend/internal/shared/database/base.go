package database

import "github.com/dps-wmhris/backend/internal/shared/kernel"

// Type alias agar kode repository dan infrastruktur database tetap kompatibel jika masih merujuk database.*
type (
	// BaseEntity menyimpan field umum yang ada di sebagian besar tabel
	BaseEntity = kernel.BaseEntity

	// ImmutableEntity menyimpan field untuk tabel append-only tanpa updated_at
	ImmutableEntity = kernel.ImmutableEntity

	// SoftDeletable menyimpan timestamp deleted_at untuk tabel dengan fitur soft delete
	SoftDeletable = kernel.SoftDeletable
)
