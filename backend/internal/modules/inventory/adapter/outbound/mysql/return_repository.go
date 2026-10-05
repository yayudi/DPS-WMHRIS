package mysql

import (
	database "github.com/dps-wmhris/backend/internal/shared/database"

	"context"
	"fmt"
	"strings"

	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"

	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/jmoiron/sqlx"
)

type returnRepositoryImpl struct {
	db *sqlx.DB
}

func NewReturnRepository(db *sqlx.DB) inventory_port.ReturnRepository {
	return &returnRepositoryImpl{db: db}
}

func (r *returnRepositoryImpl) GetPendingReturns(ctx context.Context, params map[string]interface{}) ([]map[string]interface{}, int, error) {
	return []map[string]interface{}{}, 0, nil
}

func (r *returnRepositoryImpl) GetMarketplaceReturnHistory(ctx context.Context, page, limit int, search string) (utils.PaginatedResult[domain.MarketplaceReturnItem], error) {
	return utils.PaginatedResult[domain.MarketplaceReturnItem]{Data: []domain.MarketplaceReturnItem{}, Total: 0}, nil
}

func (r *returnRepositoryImpl) GetManualReturnHistory(ctx context.Context, page, limit int, search string) (utils.PaginatedResult[domain.ManualReturnItem], error) {
	whereClauses := []string{"1=1"}
	queryParams := []interface{}{}

	if search != "" {
		whereClauses = append(whereClauses, "(mr.reference LIKE ? OR p.name LIKE ? OR p.sku LIKE ?)")
		searchVal := "%" + search + "%"
		queryParams = append(queryParams, searchVal, searchVal, searchVal)
	}

	whereClauseStr := strings.Join(whereClauses, " AND ")

	query := fmt.Sprintf(`
		SELECT
			'MANUAL' as type,
			mr.id,
			mr.reference,
			p.name as product_name,
			p.sku,
			mr.quantity,
			mr.`+"`condition`"+` as `+"`condition`"+`,
			mr.notes,
			mr.created_at as date,
			'MANUAL' as source
		FROM manual_returns mr
		JOIN products p ON mr.product_id = p.id
		WHERE %s
		ORDER BY mr.created_at DESC
	`, whereClauseStr)

	return utils.FetchPaginated[domain.ManualReturnItem](ctx, r.db, query, page, limit, queryParams...)
}


func (r *returnRepositoryImpl) CreateManualReturn(ctx context.Context, manualReturn *domain.ManualReturn) error {
	query := `
		INSERT INTO manual_returns
			(user_id, product_id, quantity, ` + "`condition`" + `, reference, notes, status, created_at)
		VALUES (?, ?, ?, ?, ?, ?, 'APPROVED', NOW())
	`
	// Fallbacks for nullables
	var ref, notes interface{}
	if manualReturn.Reference != nil {
		ref = *manualReturn.Reference
	}
	if manualReturn.Notes != nil {
		notes = *manualReturn.Notes
	}

	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query,
		manualReturn.UserID,
		manualReturn.ProductID,
		manualReturn.Quantity,
		manualReturn.Condition,
		ref,
		notes,
	)
	if err != nil {
		return err
	}

	id, err := res.LastInsertId()
	if err == nil {
		manualReturn.ID = int(id)
	}
	return err
}
