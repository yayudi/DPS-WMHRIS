package domain

import (
	"errors"
	"time"
)

var (
	// ErrLocaleNotFoundOrInactive is returned when a requested locale does not exist or is inactive.
	ErrLocaleNotFoundOrInactive = errors.New("kode bahasa tidak ditemukan atau tidak aktif")
	// ErrInvalidTranslationKey is returned when module or translation key contains invalid characters.
	ErrInvalidTranslationKey = errors.New("format modul atau kunci terjemahan tidak valid")
)

// Locale represents a supported language catalog item.
type Locale struct {
	Code      string    `db:"code" json:"code"`
	Name      string    `db:"name" json:"name"`
	IsDefault bool      `db:"is_default" json:"is_default"`
	IsActive  bool      `db:"is_active" json:"is_active"`
	Version   uint      `db:"version" json:"version"`
	UpdatedAt time.Time `db:"updated_at" json:"updated_at"`
}

// TranslationItem represents a single key-value translation entry from the database.
type TranslationItem struct {
	ID         uint64    `db:"id" json:"id"`
	LocaleCode string    `db:"locale_code" json:"locale_code"`
	Module     string    `db:"module" json:"module"`
	Key        string    `db:"translation_key" json:"translation_key"`
	Value      string    `db:"translation_value" json:"translation_value"`
	UpdatedAt  time.Time `db:"updated_at" json:"updated_at"`
}

// LocalizationDictionary represents a compiled, merged translation dictionary sent to clients.
type LocalizationDictionary struct {
	Locale  string            `json:"locale"`
	Version uint              `json:"version"`
	Entries map[string]string `json:"entries"`
}

