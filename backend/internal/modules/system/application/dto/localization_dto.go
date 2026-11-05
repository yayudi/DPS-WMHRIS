package system_dto

// LocaleDTO represents the public information of a supported language.
type LocaleDTO struct {
	Code      string `json:"code"`
	Name      string `json:"name"`
	IsDefault bool   `json:"is_default"`
	Version   uint   `json:"version"`
}

// DictionaryResponse represents the dictionary payload returned to the client.
type DictionaryResponse struct {
	Locale  string            `json:"locale"`
	Version uint              `json:"version"`
	Entries map[string]string `json:"entries"`
}

// TranslationInputItem represents an individual item in a batch upsert request.
type TranslationInputItem struct {
	Module string `json:"module" binding:"required,min=1,max=50"`
	Key    string `json:"translation_key" binding:"required,min=1,max=150"`
	Value  string `json:"translation_value" binding:"required,max=5000"`
}

// SaveTranslationsRequest defines the admin batch translation update payload.
type SaveTranslationsRequest struct {
	LocaleCode   string                 `json:"locale_code" binding:"required,min=2,max=10"`
	Translations []TranslationInputItem `json:"translations" binding:"required,min=1,max=1000,dive"`
}

// TranslationMatrixRow represents a single key definition across all supported locales with raw values.
type TranslationMatrixRow struct {
	Module     string            `json:"module"`
	Key        string            `json:"translation_key"`
	Values     map[string]string `json:"values"`      // locale_code -> raw_value
	IsComplete bool              `json:"is_complete"` // true if all active locales have non-empty translations
}

// LocaleCompletenessStat stores translated vs missing key statistics per locale.
type LocaleCompletenessStat struct {
	LocaleCode      string  `json:"locale_code"`
	TranslatedCount int     `json:"translated_count"`
	MissingCount    int     `json:"missing_count"`
	Percentage      float64 `json:"percentage"`
}

// TranslationMatrixFilter represents query parameters for the admin matrix endpoint.
type TranslationMatrixFilter struct {
	Module      string `form:"module"`
	Search      string `form:"search"`
	MissingOnly bool   `form:"missing_only"`
}

// TranslationMatrixResponse is the composite response payload for the admin localization manager.
type TranslationMatrixResponse struct {
	Locales   []LocaleDTO              `json:"locales"`
	Modules   []string                 `json:"modules"`
	TotalKeys int                      `json:"total_keys"`
	Stats     []LocaleCompletenessStat `json:"stats"`
	Rows      []TranslationMatrixRow   `json:"rows"`
}

// AuditMetadata carries actor context for publishing system audit logs.
type AuditMetadata struct {
	UserID    int    `json:"-"`
	IP        string `json:"-"`
	UserAgent string `json:"-"`
}

