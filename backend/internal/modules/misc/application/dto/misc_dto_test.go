package misc_dto_test

import (
	"encoding/json"
	"strings"
	"testing"

	misc_dto "github.com/dps-wmhris/backend/internal/modules/misc/application/dto"
)

func TestPaperSizeRequest_UnmarshalCamelAndSnakeCase(t *testing.T) {
	t.Run("accepts camelCase payload from Vue frontend", func(t *testing.T) {
		body := `{"name":"Thermal 80x40","topMargin":1.5,"sideMargin":2,"verticalPitch":42,"horizontalPitch":82,"labelWidth":80,"labelHeight":40,"numberAcross":1,"numberDown":1,"pageWidth":84,"pageHeight":44}`
		var req misc_dto.CreatePaperSizeRequest
		if err := json.Unmarshal([]byte(body), &req); err != nil {
			t.Fatalf("unmarshal failed: %v", err)
		}
		if req.Name != "Thermal 80x40" || req.LabelWidth != 80 || req.LabelHeight != 40 || req.PageWidth != 84 || req.PageHeight != 44 || req.TopMargin != 1.5 {
			t.Fatalf("unexpected decoded request: %+v", req)
		}
	})

	t.Run("accepts snake_case payload for backward compatibility", func(t *testing.T) {
		body := `{"name":"A4 Grid","top_margin":5,"side_margin":4,"vertical_pitch":30,"horizontal_pitch":50,"label_width":48,"label_height":28,"number_across":4,"number_down":9,"page_width":210,"page_height":297}`
		var req misc_dto.UpdatePaperSizeRequest
		if err := json.Unmarshal([]byte(body), &req); err != nil {
			t.Fatalf("unmarshal failed: %v", err)
		}
		if req.Name != "A4 Grid" || req.LabelWidth != 48 || req.NumberAcross != 4 || req.PageHeight != 297 {
			t.Fatalf("unexpected decoded request: %+v", req)
		}
	})

	t.Run("PaperSizeResponse serializes camelCase dimensions", func(t *testing.T) {
		resp := misc_dto.PaperSizeResponse{
			ID:           1,
			Name:         "Thermal",
			LabelWidth:   80,
			LabelHeight:  40,
			PageWidth:    80,
			PageHeight:   40,
			NumberAcross: 1,
			NumberDown:   1,
			IsActive:     true,
		}
		raw, err := json.Marshal(resp)
		if err != nil {
			t.Fatalf("marshal failed: %v", err)
		}
		s := string(raw)
		for _, want := range []string{`"labelWidth":80`, `"pageWidth":80`, `"numberAcross":1`} {
			if !strings.Contains(s, want) {
				t.Errorf("expected response JSON to contain %s, got %s", want, s)
			}
		}
	})
}
