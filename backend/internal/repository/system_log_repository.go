package repository

import (
	"context"
	"strings"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/model"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/jmoiron/sqlx"
)

type SystemLogRepository interface {
	Create(ctx context.Context, db sqlx.ExtContext, log *model.SystemLog) error
	GetLogs(ctx context.Context, req dto.GetSystemLogsRequest) (utils.PaginatedResult[dto.SystemLogResponse], error)
}

type systemLogRepositoryImpl struct {
	db *sqlx.DB
}

func NewSystemLogRepository(db *sqlx.DB) SystemLogRepository {
	return &systemLogRepositoryImpl{db: db}
}

func (r *systemLogRepositoryImpl) Create(ctx context.Context, db sqlx.ExtContext, log *model.SystemLog) error {
	query := `
		INSERT INTO system_audit_logs (user_id, action, target_type, target_id, changes, ip_address, user_agent)
		VALUES (?, ?, ?, ?, ?, ?, ?)`
		
	res, err := db.ExecContext(ctx, query,
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

func buildTriStateWhere(column string, filterValue string, conditions *[]string, params *[]interface{}) {
	if filterValue == "" || filterValue == "all" || filterValue == "All" {
		return
	}
	// For simplicity, we just handle comma separated values as IN clauses if needed
	// The node.js code handled JSON format for include/exclude. We will assume simple string match for now,
	// or IN clause if comma separated.
	if strings.Contains(filterValue, "{") {
		// Fallback for JSON strings if sent by frontend
		return
	}
	
	if strings.Contains(filterValue, ",") {
		parts := strings.Split(filterValue, ",")
		*conditions = append(*conditions, column+" IN (?)")
		*params = append(*params, parts)
	} else {
		*conditions = append(*conditions, column+" = ?")
		*params = append(*params, filterValue)
	}
}

func (r *systemLogRepositoryImpl) GetLogs(ctx context.Context, req dto.GetSystemLogsRequest) (utils.PaginatedResult[dto.SystemLogResponse], error) {
	conditions := []string{"1=1"}
	var params []interface{}

	if req.Search != "" {
		conditions = append(conditions, "(l.target_id LIKE ? OR l.changes LIKE ?)")
		searchStr := "%" + req.Search + "%"
		params = append(params, searchStr, searchStr)
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
		return utils.PaginatedResult[dto.SystemLogResponse]{}, err
	}
	baseQuery = r.db.Rebind(baseQuery)

	return utils.FetchPaginated[dto.SystemLogResponse](ctx, r.db, baseQuery, req.Page, req.Limit, params...)
}
