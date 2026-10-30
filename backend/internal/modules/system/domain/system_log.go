package domain

import (
	"github.com/dps-wmhris/backend/internal/shared/kernel"
)

type SystemLog struct {
	kernel.ImmutableEntity
	UserID     int     `db:"user_id" json:"user_id"`
	Action     string  `db:"action" json:"action"`
	TargetType string  `db:"target_type" json:"target_type"`
	TargetID   string  `db:"target_id" json:"target_id"`
	Changes    *string `db:"changes" json:"changes"` // Disimpan sebagai JSON string
	IP         *string `db:"ip" json:"ip"`
	UserAgent  *string `db:"user_agent" json:"user_agent"`
}
