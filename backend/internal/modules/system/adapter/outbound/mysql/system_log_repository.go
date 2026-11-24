package mysql

import (
	database "github.com/dps-wmhris/backend/internal/shared/database"

	"context"
	"encoding/json"
	"strings"

	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"

	system_domain "github.com/dps-wmhris/backend/internal/modules/system/domain"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/jmoiron/sqlx"
)

type SystemLogRepository interface {
	Create(ctx context.Context, log *system_domain.SystemLog) error
	GetLogs(ctx context.Context, req system_dto.GetSystemLogsRequest) (utils.PaginatedResult[system_dto.SystemLogResponse], error)
}

type systemLogRepositoryImpl struct {
	db *sqlx.DB
}

func NewSystemLogRepository(db *sqlx.DB) SystemLogRepository {
	return &systemLogRepositoryImpl{db: db}
}

func (r *systemLogRepositoryImpl) Create(ctx context.Context, log *system_domain.SystemLog) error {
	query := `
		INSERT INTO system_audit_logs (user_id, action, target_type, target_id, changes, ip_address, user_agent)
		VALUES (?, ?, ?, ?, ?, ?, ?)`

	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query,
		log.UserID, log.Action, log.TargetType, log.TargetID, log.Changes, log.IP, log.UserAgent,
	)

	if err != nil {
		return err
	}

	id, err := res.LastInsertId()
	if err == nil {
		log.ID = int(id)
	}

	return err
}

type triStateFilter struct {
	Include []string `json:"include"`
	Exclude []string `json:"exclude"`
}

func nonEmptyTrimmed(values []string) []string {
	out := make([]string, 0, len(values))
	for _, v := range values {
		if trimmed := strings.TrimSpace(v); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func buildTriStateWhere(column string, filterValue string, conditions *[]string, params *[]interface{}) {
	filterValue = strings.TrimSpace(filterValue)
	if filterValue == "" || filterValue == "all" || filterValue == "All" {
		return
	}

	if strings.HasPrefix(filterValue, "{") {
		var ts triStateFilter
		if err := json.Unmarshal([]byte(filterValue), &ts); err == nil {
			if include := nonEmptyTrimmed(ts.Include); len(include) > 0 {
				*conditions = append(*conditions, column+" IN (?)")
				*params = append(*params, include)
			}
			if exclude := nonEmptyTrimmed(ts.Exclude); len(exclude) > 0 {
				*conditions = append(*conditions, column+" NOT IN (?)")
				*params = append(*params, exclude)
			}
		}
		return
	}

	if strings.Contains(filterValue, ",") {
		if parts := nonEmptyTrimmed(strings.Split(filterValue, ",")); len(parts) > 0 {
			*conditions = append(*conditions, column+" IN (?)")
			*params = append(*params, parts)
		}
	} else {
		*conditions = append(*conditions, column+" = ?")
		*params = append(*params, filterValue)
	}
}

func (r *systemLogRepositoryImpl) GetLogs(ctx context.Context, req system_dto.GetSystemLogsRequest) (utils.PaginatedResult[system_dto.SystemLogResponse], error) {
	conditions := []string{"1=1"}
	var params []interface{}

	if search := strings.TrimSpace(req.Search); search != "" {
		conditions = append(conditions, "(l.target_id LIKE ? OR l.changes LIKE ? OR u.username LIKE ? OR u.nickname LIKE ?)")
		searchStr := "%" + search + "%"
		params = append(params, searchStr, searchStr, searchStr, searchStr)
	}

	buildTriStateWhere("l.action", req.Action, &conditions, &params)
	buildTriStateWhere("l.target_type", req.TargetType, &conditions, &params)

	if req.UserID != "" && req.UserID != "all" {
		conditions = append(conditions, "l.user_id = ?")
		params = append(params, req.UserID)
	}

	if req.StartDate != "" {
		conditions = append(conditions, "l.created_at >= ?")
		params = append(params, req.StartDate+" 00:00:00")
	}

	if req.EndDate != "" {
		conditions = append(conditions, "l.created_at <= ?")
		params = append(params, req.EndDate+" 23:59:59")
	}

	whereSql := strings.Join(conditions, " AND ")

	// Menggunakan generic utility untuk eksekusi query paginasi
	baseQuery := `
		SELECT l.id, l.user_id, l.action, l.target_type, l.target_id, l.changes, l.ip_address, l.user_agent, l.created_at,
			u.username, u.nickname, r.name as role,
			CASE l.target_type
				WHEN 'USER' THEN (SELECT COALESCE(nickname, username) FROM users WHERE id = l.target_id)
				WHEN 'PRODUCT' THEN (SELECT name FROM products WHERE id = l.target_id)
				WHEN 'ROLE' THEN (SELECT name FROM roles WHERE id = l.target_id)
				WHEN 'LOCATION' THEN (SELECT name FROM locations WHERE id = l.target_id)
				WHEN 'CATEGORY' THEN (SELECT name FROM categories WHERE id = l.target_id)
				ELSE NULL
			END as target_name
		FROM system_audit_logs l
		LEFT JOIN users u ON l.user_id = u.id
		LEFT JOIN roles r ON u.role_id = r.id
		WHERE ` + whereSql + `
		ORDER BY l.created_at DESC
	`

	// Tangani IN clause jika ada
	baseQuery, params, err := sqlx.In(baseQuery, params...)
	if err != nil {
		return utils.PaginatedResult[system_dto.SystemLogResponse]{}, err
	}
	baseQuery = r.db.Rebind(baseQuery)

	return database.FetchPaginated[system_dto.SystemLogResponse](ctx, r.db, baseQuery, req.Page, req.Limit, params...)
}
