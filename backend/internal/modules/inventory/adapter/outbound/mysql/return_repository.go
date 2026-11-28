package mysql

import (
	"context"
	"fmt"
	"strings"

	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/jmoiron/sqlx"
)

type returnRepositoryImpl struct {
	db *sqlx.DB
}

// NewReturnRepository creates a MySQL-backed ReturnRepository.
func NewReturnRepository(db *sqlx.DB) inventory_port.ReturnRepository {
	return &returnRepositoryImpl{db: db}
}

// GetPendingReturns returns empty results following legacy fulfilment teardown.
func (r *returnRepositoryImpl) GetPendingReturns(_ context.Context, _ map[string]any) ([]map[string]any, int, error) {
	return []map[string]any{}, 0, nil
}

// GetMarketplaceReturnHistory returns an empty paginated result following legacy fulfilment teardown.
func (r *returnRepositoryImpl) GetMarketplaceReturnHistory(_ context.Context, _, _ int, _ string) (utils.PaginatedResult[domain.MarketplaceReturnItem], error) {
	return utils.PaginatedResult[domain.MarketplaceReturnItem]{Data: []domain.MarketplaceReturnItem{}, Total: 0}, nil
}

// GetManualReturnHistory retrieves paginated manual return entries joined with non-deleted products.
func (r *returnRepositoryImpl) GetManualReturnHistory(ctx context.Context, page, limit int, search string) (utils.PaginatedResult[domain.ManualReturnItem], error) {
	whereClauses := []string{"p.deleted_at IS NULL"}
	var queryParams []any

	if trimmed := strings.TrimSpace(search); trimmed != "" {
		whereClauses = append(whereClauses, "(mr.reference LIKE ? OR p.name LIKE ? OR p.sku LIKE ?)")
		searchVal := "%" + trimmed + "%"
		queryParams = append(queryParams, searchVal, searchVal, searchVal)
	}

	whereClauseStr := strings.Join(whereClauses, " AND ")

	query := fmt.Sprintf(`
		SELECT
			'MANUAL' AS type,
			mr.id,
			mr.reference,
			p.name AS product_name,
			p.sku,
			mr.quantity,
			mr.`+"`condition`"+` AS `+"`condition`"+`,
			mr.notes,
			mr.created_at AS date,
			'MANUAL' AS source
		FROM manual_returns mr
		JOIN products p ON mr.product_id = p.id
		WHERE %s
		ORDER BY mr.created_at DESC
	`, whereClauseStr)

	return database.FetchPaginated[domain.ManualReturnItem](ctx, r.db, query, page, limit, queryParams...)
}

// CreateManualReturn inserts an approved manual_returns row inside the active transaction and sets manualReturn.ID.
func (r *returnRepositoryImpl) CreateManualReturn(ctx context.Context, manualReturn *domain.ManualReturn) error {
	query := `
		INSERT INTO manual_returns
			(user_id, product_id, quantity, ` + "`condition`" + `, reference, notes, status, created_at)
		VALUES (?, ?, ?, ?, ?, ?, 'APPROVED', NOW())
	`
	var ref, notes any
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
