package http

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"

	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/system/domain"
	"github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/dps-wmhris/backend/internal/shared/middleware"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

type LocalizationHandler struct {
	useCase port.LocalizationUseCase
}

// NewLocalizationHandler constructs a new HTTP inbound adapter for localization.
func NewLocalizationHandler(useCase port.LocalizationUseCase) *LocalizationHandler {
	return &LocalizationHandler{useCase: useCase}
}

// matchesETag checks if client's If-None-Match header satisfies RFC 7232 entity tag matching.
func matchesETag(ifNoneMatchHeader, currentETag string) bool {
	header := strings.TrimSpace(ifNoneMatchHeader)
	if header == "" {
		return false
	}
	if header == "*" {
		return true
	}
	for _, tag := range strings.Split(header, ",") {
		if strings.TrimSpace(tag) == currentETag {
			return true
		}
	}
	return false
}

// GetLocales returns the list of active supported locales.
func (h *LocalizationHandler) GetLocales(c *gin.Context) {
	locales, err := h.useCase.GetAvailableLocales(c.Request.Context())
	if err != nil {
		log.Printf("[LOCALIZATION] GetLocales failed: %v", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal mengambil daftar bahasa.", "INTERNAL_SERVER_ERROR")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Daftar bahasa berhasil diambil.", locales)
}

// GetDictionary returns the compiled translation dictionary for the requested locale with ETag support.
func (h *LocalizationHandler) GetDictionary(c *gin.Context) {
	locale := c.Param("locale")

	dict, err := h.useCase.GetMergedDictionary(c.Request.Context(), locale)
	if err != nil {
		log.Printf("[LOCALIZATION] GetDictionary failed for locale '%s': %v", locale, err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal memuat kamus lokalisasi.", "INTERNAL_SERVER_ERROR")
		return
	}

	// HTTP ETag handling for 304 Not Modified caching (RFC 7232)
	eTag := fmt.Sprintf(`W/"v%d-%s"`, dict.Version, dict.Locale)
	c.Header("ETag", eTag)
	c.Header("Cache-Control", "no-cache, must-revalidate")
	c.Header("Vary", "Accept-Encoding, If-None-Match")

	if matchesETag(c.GetHeader("If-None-Match"), eTag) {
		c.Status(http.StatusNotModified)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Kamus lokalisasi berhasil diambil.", dict)
}

// GetTranslationMatrix returns unmasked raw translations for all active locales formatted as an editable matrix.
func (h *LocalizationHandler) GetTranslationMatrix(c *gin.Context) {
	var filter system_dto.TranslationMatrixFilter
	_ = c.ShouldBindQuery(&filter)

	matrix, err := h.useCase.GetTranslationMatrix(c.Request.Context(), filter)
	if err != nil {
		log.Printf("[LOCALIZATION] GetTranslationMatrix failed: %v", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal memuat matriks lokalisasi.", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Matriks lokalisasi berhasil diambil.", matrix)
}

// SaveTranslations allows admins to batch upsert translations and increment cache version.
func (h *LocalizationHandler) SaveTranslations(c *gin.Context) {
	reqPtr, ok := utils.BindAndValidate[system_dto.SaveTranslationsRequest](c)
	if !ok {
		return
	}

	userID := middleware.GetUserID(c)
	audit := system_dto.AuditMetadata{
		UserID:    userID,
		IP:        c.ClientIP(),
		UserAgent: c.Request.UserAgent(),
	}

	newVersion, err := h.useCase.SaveTranslations(c.Request.Context(), *reqPtr, audit)
	if err != nil {
		if errors.Is(err, domain.ErrLocaleNotFoundOrInactive) || errors.Is(err, domain.ErrInvalidTranslationKey) {
			utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), "VALIDATION_ERROR")
			return
		}
		// Mask internal database/infrastructure errors to avoid CWE-209 information disclosure
		log.Printf("[LOCALIZATION] SaveTranslations failed for locale '%s': %v", reqPtr.LocaleCode, err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal menyimpan perubahan.", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Terjemahan berhasil disimpan dan cache diperbarui.", gin.H{
		"locale":  reqPtr.LocaleCode,
		"version": newVersion,
	})
}

