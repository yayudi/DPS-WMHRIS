package domain

import (
	"errors"
	"time"

	"github.com/dps-wmhris/backend/internal/shared/i18n"
)

const (
	// DefaultPreferenceLocale is the system-wide baseline locale for new users.
	DefaultPreferenceLocale = i18n.DefaultLocale // "id-ID"
	// DefaultPreferenceTheme is the system-wide default UI theme.
	DefaultPreferenceTheme = "light"
	// DefaultPreferenceTimezone is the system-wide default IANA timezone.
	DefaultPreferenceTimezone = "Asia/Jakarta"
	// DefaultPreferenceDateFormat is the system-wide default regional date display pattern.
	DefaultPreferenceDateFormat = "YYYY-MM-DD"
)

var (
	// ErrInvalidPreferenceLocale is returned when an unsupported locale code is provided.
	ErrInvalidPreferenceLocale = errors.New("kode bahasa tidak didukung")
	// ErrInvalidPreferenceTimezone is returned when an invalid IANA timezone identifier is provided.
	ErrInvalidPreferenceTimezone = errors.New("zona waktu tidak valid")
	// ErrInvalidPreferenceDateFormat is returned when an unsupported date format is provided.
	ErrInvalidPreferenceDateFormat = errors.New("format tanggal tidak didukung")
)

var validDateFormats = map[string]bool{
	"YYYY-MM-DD":  true,
	"DD/MM/YYYY":  true,
	"DD MMM YYYY": true,
	"MM/DD/YYYY":  true,
}

// IsValidDateFormat checks whether a date format string is supported by the application.
func IsValidDateFormat(df string) bool {
	return validDateFormats[df]
}

// UserPreference represents regional and UI configuration for an individual user.
type UserPreference struct {
	UserID     int       `db:"user_id" json:"user_id"`
	Locale     string    `db:"locale" json:"locale"`
	Theme      string    `db:"theme" json:"theme"`
	Timezone   string    `db:"timezone" json:"timezone"`
	DateFormat string    `db:"date_format" json:"date_format"`
	CreatedAt  time.Time `db:"created_at" json:"created_at"`
	UpdatedAt  time.Time `db:"updated_at" json:"updated_at"`
}

// NewDefaultUserPreference creates a fully populated UserPreference struct with SSoT defaults.
func NewDefaultUserPreference(userID int) *UserPreference {
	now := time.Now()
	return &UserPreference{
		UserID:     userID,
		Locale:     DefaultPreferenceLocale,
		Theme:      DefaultPreferenceTheme,
		Timezone:   DefaultPreferenceTimezone,
		DateFormat: DefaultPreferenceDateFormat,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
}

