// Package apperror defines structured domain and application errors with localization keys and HTTP status mapping.
package apperror

import (
	"fmt"
	"net/http"
)

// AppError represents a structured, domain/application level error with localization support.
type AppError struct {
	Code       string         // E.g., "NOT_FOUND", "CONFLICT", "VALIDATION_ERROR"
	I18nKey    string         // E.g., "errors.not_found", "wms.slot.err_room_required"
	Params     map[string]any // Optional dynamic interpolation params
	FallbackID string         // Default Indonesian message for backward compatibility & logs
	HTTPStatus int            // Optional HTTP status code (400, 401, 403, 404, 409, 422, 500)
	Cause      error          // Wrapped underlying error if any
}

// Error implements the standard error interface.
func (e *AppError) Error() string {
	if e.FallbackID != "" {
		return e.FallbackID
	}
	if e.Cause != nil {
		return e.Cause.Error()
	}
	return fmt.Sprintf("[%s] %s", e.Code, e.I18nKey)
}

// Unwrap implements error unwrapping for errors.Is and errors.As.
func (e *AppError) Unwrap() error {
	return e.Cause
}

// New creates a new structured AppError.
func New(code, i18nKey, fallbackID string, httpStatus int, params ...map[string]any) *AppError {
	var p map[string]any
	if len(params) > 0 {
		p = params[0]
	}
	return &AppError{
		Code:       code,
		I18nKey:    i18nKey,
		FallbackID: fallbackID,
		HTTPStatus: httpStatus,
		Params:     p,
	}
}

// Wrap creates an AppError that wraps an underlying root error.
func Wrap(err error, code, i18nKey, fallbackID string, httpStatus int, params ...map[string]any) *AppError {
	appErr := New(code, i18nKey, fallbackID, httpStatus, params...)
	appErr.Cause = err
	return appErr
}

// NotFound helper creates a 404 AppError.
func NotFound(i18nKey, fallbackID string, params ...map[string]any) *AppError {
	return New("NOT_FOUND", i18nKey, fallbackID, http.StatusNotFound, params...)
}

// Conflict helper creates a 409 AppError.
func Conflict(i18nKey, fallbackID string, params ...map[string]any) *AppError {
	return New("CONFLICT", i18nKey, fallbackID, http.StatusConflict, params...)
}

// Validation helper creates a 400 AppError.
func Validation(i18nKey, fallbackID string, params ...map[string]any) *AppError {
	return New("VALIDATION_ERROR", i18nKey, fallbackID, http.StatusBadRequest, params...)
}

// Forbidden helper creates a 403 AppError.
func Forbidden(i18nKey, fallbackID string, params ...map[string]any) *AppError {
	return New("FORBIDDEN", i18nKey, fallbackID, http.StatusForbidden, params...)
}

// Unauthorized helper creates a 401 AppError.
func Unauthorized(i18nKey, fallbackID string, params ...map[string]any) *AppError {
	return New("UNAUTHORIZED", i18nKey, fallbackID, http.StatusUnauthorized, params...)
}

// Internal helper creates a 500 AppError.
func Internal(i18nKey, fallbackID string, cause error, params ...map[string]any) *AppError {
	appErr := New("INTERNAL_ERROR", i18nKey, fallbackID, http.StatusInternalServerError, params...)
	appErr.Cause = cause
	return appErr
}

