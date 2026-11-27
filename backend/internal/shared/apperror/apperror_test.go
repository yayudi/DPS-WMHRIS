package apperror

import (
	"errors"
	"net/http"
	"testing"
)

func TestAppError_ConstructorsAndUnwrap(t *testing.T) {
	rootErr := errors.New("underlying mysql timeout")

	t.Run("Wrap and Unwrap preserve cause and FallbackID", func(t *testing.T) {
		err := Wrap(rootErr, "CUSTOM_ERR", "wms.err_custom", "Gagal memproses data", http.StatusUnprocessableEntity, map[string]any{"id": 10})
		if err.Error() != "Gagal memproses data" {
			t.Errorf("expected FallbackID from Error(), got %q", err.Error())
		}
		if !errors.Is(err, rootErr) {
			t.Error("expected errors.Is to match wrapped rootErr")
		}
		if err.HTTPStatus != http.StatusUnprocessableEntity || err.Params["id"] != 10 {
			t.Errorf("unexpected status or params: %+v", err)
		}
	})

	t.Run("Error falls back to Cause or Code+Key when FallbackID is empty", func(t *testing.T) {
		errWithCause := Internal("errors.internal", "", rootErr)
		if errWithCause.Error() != rootErr.Error() {
			t.Errorf("expected cause message %q, got %q", rootErr.Error(), errWithCause.Error())
		}

		errNoCause := New("NOT_FOUND", "wms.item_not_found", "", http.StatusNotFound)
		if errNoCause.Error() != "[NOT_FOUND] wms.item_not_found" {
			t.Errorf("unexpected formatted error string: %q", errNoCause.Error())
		}
	})

	t.Run("Standard helper constructors assign expected codes and statuses", func(t *testing.T) {
		cases := []struct {
			err        *AppError
			wantCode   string
			wantStatus int
		}{
			{NotFound("k", "f"), "NOT_FOUND", http.StatusNotFound},
			{Conflict("k", "f"), "CONFLICT", http.StatusConflict},
			{Validation("k", "f"), "VALIDATION_ERROR", http.StatusBadRequest},
			{Forbidden("k", "f"), "FORBIDDEN", http.StatusForbidden},
			{Unauthorized("k", "f"), "UNAUTHORIZED", http.StatusUnauthorized},
			{Internal("k", "f", rootErr), "INTERNAL_ERROR", http.StatusInternalServerError},
		}

		for _, tc := range cases {
			if tc.err.Code != tc.wantCode || tc.err.HTTPStatus != tc.wantStatus {
				t.Errorf("got (%s, %d), want (%s, %d)", tc.err.Code, tc.err.HTTPStatus, tc.wantCode, tc.wantStatus)
			}
		}
	})
}
