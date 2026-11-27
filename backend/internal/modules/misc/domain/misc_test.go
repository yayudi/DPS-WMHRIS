package domain_test

import (
	"encoding/json"
	"errors"
	"testing"

	"github.com/dps-wmhris/backend/internal/modules/misc/domain"
)

func TestNormalizeConfigJSON(t *testing.T) {
	t.Run("nil and whitespace return nil", func(t *testing.T) {
		if got, err := domain.NormalizeConfigJSON(nil); err != nil || got != nil {
			t.Fatalf("expected (nil, nil), got (%v, %v)", got, err)
		}
		if got, err := domain.NormalizeConfigJSON("   "); err != nil || got != nil {
			t.Fatalf("expected (nil, nil), got (%v, %v)", got, err)
		}
	})

	t.Run("valid JSON string is preserved without double-encoding", func(t *testing.T) {
		raw := `{"objects":[{"type":"textbox"}],"paper_size_id":3}`
		got, err := domain.NormalizeConfigJSON(raw)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got == nil || *got != raw {
			t.Fatalf("expected %q, got %v", raw, got)
		}
	})

	t.Run("invalid JSON string returns ErrInvalidConfigJSON", func(t *testing.T) {
		_, err := domain.NormalizeConfigJSON(`{"broken":`)
		if !errors.Is(err, domain.ErrInvalidConfigJSON) {
			t.Fatalf("expected ErrInvalidConfigJSON, got %v", err)
		}
	})

	t.Run("structured map is marshaled to valid JSON string", func(t *testing.T) {
		got, err := domain.NormalizeConfigJSON(map[string]any{"paper_size_id": 2})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got == nil || !json.Valid([]byte(*got)) {
			t.Fatalf("expected valid JSON string, got %v", got)
		}
	})
}
