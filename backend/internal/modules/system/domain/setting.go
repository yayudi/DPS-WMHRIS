package domain

import "time"

type SystemSetting struct {
	ID          int       `db:"id" json:"id"`
	SettingKey  string    `db:"setting_key" json:"setting_key"`
	SettingName string    `db:"setting_name" json:"setting_name"`
	ValueStr    *string   `db:"value_str" json:"value_str"`
	ValueInt    *int      `db:"value_int" json:"value_int"`
	Description *string   `db:"description" json:"description"`
	UpdatedAt   time.Time `db:"updated_at" json:"updated_at"`
}
