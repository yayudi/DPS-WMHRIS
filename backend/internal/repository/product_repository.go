package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	sq "github.com/Masterminds/squirrel"
	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/model"
	"github.com/jmoiron/sqlx"
)

type ProductRepository interface {
	BaseRepository[model.Product]
	Create(ctx context.Context, db sqlx.ExtContext, product *model.Product) error
	Update(ctx context.Context, db sqlx.ExtContext, product *model.Product) error
	GetBySKUs(ctx context.Context, skus []string) ([]model.Product, error)

	// New methods
	GetProductsWithFilters(ctx context.Context, filters dto.ProductFilterRequest) ([]dto.ProductDetailResponse, int, error)
	SearchProducts(ctx context.Context, keyword string, locationID string, inStockOnly bool, page int, limit int) ([]dto.ProductDetailResponse, error)
	GetProductMapWithComponents(ctx context.Context, skus []string) (map[string]dto.ProductDetailResponse, error)
	GetAllActiveProducts(ctx context.Context) ([]dto.ProductDetailResponse, error)
	GetProductDetailWithStock(ctx context.Context, id int) (*dto.ProductDetailResponse, error)
	GetProductStockDetails(ctx context.Context, id int) ([]dto.ProductStockDetailResponse, error)
	GetProductHistory(ctx context.Context, id int) ([]dto.ProductHistoryResponse, error)

	// Images
	LinkMediaToProduct(ctx context.Context, db sqlx.ExtContext, productID int, mediaID int, isPrimary int) error
	DeleteProductImage(ctx context.Context, db sqlx.ExtContext, imageID int) error
	SetPrimaryImage(ctx context.Context, db sqlx.ExtContext, productID int, imageID int) error

	// Timeline
	GetProductTotalStock(ctx context.Context, productID int, buildings []string) (int, error)
	GetProductStockMovementsCount(ctx context.Context, productID int, buildings []string) (int, error)
	GetSumOfNewerStockMovements(ctx context.Context, productID int, offset int, buildings []string) (int, error)
	GetProductStockMovementsPaginated(ctx context.Context, productID int, limit int, offset int, buildings []string) ([]RawStockMovement, error)
}

type RawStockMovement struct {
	ID             int     `db:"id"`
	Quantity       int     `db:"quantity"`
	FromLocationID *int    `db:"from_location_id"`
	ToLocationID   *int    `db:"to_location_id"`
	MovementType   string  `db:"movement_type"`
	Notes          *string `db:"notes"`
	CreatedAt      string  `db:"created_at"`
	UserName       *string `db:"user_name"`
	FromBuilding   *string `db:"from_building"`
	ToBuilding     *string `db:"to_building"`
}

type productRepositoryImpl struct {
	BaseRepository[model.Product]
	db *sqlx.DB
}

func NewProductRepository(db *sqlx.DB) ProductRepository {
	base := NewBaseRepository[model.Product](db, "products")
	return &productRepositoryImpl{
		BaseRepository: base,
		db:             db,
	}
}

func (r *productRepositoryImpl) Create(ctx context.Context, db sqlx.ExtContext, product *model.Product) error {
	query := `
		INSERT INTO products (
			sku, name, category_id, price, is_active, is_package, 
			weight, length, width, height
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

	res, err := db.ExecContext(ctx, query,
		product.SKU, product.Name, product.CategoryID, product.Price,
		product.IsActive, product.IsPackage, product.Weight,
		product.Length, product.Width, product.Height,
	)

	if err != nil {
		return err
	}

	id, err := res.LastInsertId()
	if err == nil {
		product.ID = int(id)
	}

	return err
}

func (r *productRepositoryImpl) Update(ctx context.Context, db sqlx.ExtContext, product *model.Product) error {
	query := `
		UPDATE products 
		SET sku = ?, name = ?, category_id = ?, price = ?, is_active = ?, is_package = ?, weight = ?, length = ?, width = ?, height = ?
		WHERE id = ?`

	_, err := db.ExecContext(ctx, query,
		product.SKU, product.Name, product.CategoryID, product.Price,
		product.IsActive, product.IsPackage, product.Weight,
		product.Length, product.Width, product.Height,
		product.ID,
	)
	return err
}

func (r *productRepositoryImpl) GetBySKUs(ctx context.Context, skus []string) ([]model.Product, error) {
	if len(skus) == 0 {
		return []model.Product{}, nil
	}
	var products []model.Product
	query, args, err := sqlx.In("SELECT id, sku, name, category_id, price, is_active, is_package, weight, length, width, height, created_at, updated_at FROM products WHERE sku IN (?)", skus)
	if err != nil {
		return nil, err
	}
	query = r.db.Rebind(query)
	err = r.db.SelectContext(ctx, &products, query, args...)
	return products, err
}

// ============================================================================
// READ OPERATIONS (Complex Queries)
// ============================================================================
func (r *productRepositoryImpl) attachProductDetails(ctx context.Context, products []dto.ProductDetailResponse) error {
	if len(products) == 0 {
		return nil
	}
	productIDs := make([]int, len(products))
	productMap := make(map[int]*dto.ProductDetailResponse)
	for i := range products {
		productIDs[i] = products[i].ID
		productMap[products[i].ID] = &products[i]
	}

	// Fetch stock locations
	query, args, err := sqlx.In(`
		SELECT sl.product_id, l.id as location_id, l.code as location_code, l.purpose, l.building, COALESCE(l.floor, '') as floor, sl.quantity
		FROM stock_locations sl
		JOIN locations l ON sl.location_id = l.id
		WHERE sl.product_id IN (?)
	`, productIDs)
	if err != nil { return err }
	query = r.db.Rebind(query)
	
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var pid int
			var loc dto.ProductStockLocation
			if err := rows.Scan(&pid, &loc.LocationID, &loc.LocationCode, &loc.Purpose, &loc.Building, &loc.Floor, &loc.Quantity); err == nil {
				if p, ok := productMap[pid]; ok {
					if p.StockLocations == nil {
						p.StockLocations = []dto.ProductStockLocation{}
					}
					p.StockLocations = append(p.StockLocations, loc)
				}
			}
		}
	}

	// Fetch components
	query, args, err = sqlx.In(`
		SELECT pp.package_product_id, pp.component_product_id, c.name, c.sku, pp.quantity,
			COALESCE((SELECT SUM(sl.quantity) FROM stock_locations sl WHERE sl.product_id = c.id), 0) as stock_available
		FROM package_products pp
		JOIN products c ON pp.component_product_id = c.id
		WHERE pp.package_product_id IN (?)
	`, productIDs)
	if err != nil { return err }
	query = r.db.Rebind(query)
	
	rows, err = r.db.QueryContext(ctx, query, args...)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var pid int
			var comp dto.ProductComponent
			if err := rows.Scan(&pid, &comp.ComponentProductID, &comp.Name, &comp.SKU, &comp.Quantity, &comp.StockAvailable); err == nil {
				if p, ok := productMap[pid]; ok {
					if p.Components == nil {
						p.Components = []dto.ProductComponent{}
					}
					p.Components = append(p.Components, comp)
				}
			}
		}
	}
	
	// Default to empty slices instead of nil
	for _, p := range productMap {
		if p.StockLocations == nil {
			p.StockLocations = []dto.ProductStockLocation{}
		}
		if p.Components == nil {
			p.Components = []dto.ProductComponent{}
		}
	}
	return nil
}

func (r *productRepositoryImpl) GetProductsWithFilters(ctx context.Context, filters dto.ProductFilterRequest) ([]dto.ProductDetailResponse, int, error) {
	builder := sq.Select("p.id", "p.sku", "p.name", "p.price", "p.is_package", "p.is_active", "p.category_id", "c.name as category_name", "p.weight").
		From("products p").
		LeftJoin("categories c ON p.category_id = c.id")

	cleanSlice := func(s []string) []string {
		if len(s) == 0 {
			return []string{}
		}
		if len(s) == 1 && len(s[0]) >= 2 && s[0][0] == '[' && s[0][len(s[0])-1] == ']' {
			if s[0] == "[]" {
				return []string{}
			}
			var parsed []string
			if err := json.Unmarshal([]byte(s[0]), &parsed); err == nil {
				return parsed
			}
		}
		if len(s) == 1 && s[0] == "" {
			return []string{}
		}
		return s
	}

	filters.CategoryInclude = cleanSlice(filters.CategoryInclude)
	filters.CategoryExclude = cleanSlice(filters.CategoryExclude)
	filters.BuildingInclude = cleanSlice(filters.BuildingInclude)
	filters.BuildingExclude = cleanSlice(filters.BuildingExclude)
	filters.FloorInclude = cleanSlice(filters.FloorInclude)
	filters.FloorExclude = cleanSlice(filters.FloorExclude)

	// Helper func to add EXISTS for location filter
	addLocationExists := func(b sq.SelectBuilder, purpose string, bInclude, bExclude, fInclude, fExclude []string, building, floor string) sq.SelectBuilder {
		subq := sq.Select("1").From("stock_locations sl").Join("locations l ON sl.location_id = l.id").
			Where("sl.product_id = p.id").Where(sq.Eq{"l.purpose": purpose})

		if len(bInclude) > 0 {
			subq = subq.Where(sq.Eq{"l.building": bInclude})
		} else if building != "all" {
			subq = subq.Where(sq.Eq{"l.building": building})
		}
		if len(bExclude) > 0 {
			subq = subq.Where(sq.NotEq{"l.building": bExclude})
		}

		if len(fInclude) > 0 {
			subq = subq.Where(sq.Eq{"l.floor": fInclude})
		} else if floor != "all" {
			subq = subq.Where(sq.Eq{"l.floor": floor})
		}
		if len(fExclude) > 0 {
			subq = subq.Where(sq.NotEq{"l.floor": fExclude})
		}

		sql, args, _ := subq.ToSql()
		return b.Where(fmt.Sprintf("EXISTS (%s)", sql), args...)
	}

	// Filter Status
	if filters.Status == "archived" {
		builder = builder.Where("(p.is_active = 0 OR p.deleted_at IS NOT NULL)")
	} else if filters.Status != "all" {
		builder = builder.Where("(p.is_active = 1 AND p.deleted_at IS NULL)")
	}

	// Package Filter
	if filters.IsPackage != nil {
		val := 0
		if *filters.IsPackage {
			val = 1
		}
		builder = builder.Where(sq.Eq{"p.is_package": val})
	} else if filters.PackageOnly != nil && *filters.PackageOnly {
		builder = builder.Where(sq.Eq{"p.is_package": 1})
	}

	// Category Include/Exclude
	if len(filters.CategoryInclude) > 0 {
		builder = builder.Where(sq.Eq{"p.category_id": filters.CategoryInclude})
	} else if filters.CategoryID != "" && filters.CategoryID != "all" {
		builder = builder.Where(sq.Eq{"p.category_id": filters.CategoryID})
	}

	if len(filters.CategoryExclude) > 0 {
		builder = builder.Where(sq.NotEq{"p.category_id": filters.CategoryExclude})
	}

	// Location logic
	purpose := ""
	if filters.Location == "gudang" {
		purpose = "WAREHOUSE"
	} else if filters.Location == "pajangan" {
		purpose = "DISPLAY"
	} else if filters.Location == "ltc" {
		purpose = "BRANCH"
	}

	if filters.Location != "all" {
		builder = addLocationExists(builder, purpose, filters.BuildingInclude, filters.BuildingExclude, filters.FloorInclude, filters.FloorExclude, filters.Building, filters.Floor)
	}

	// Search
	if filters.Search != "" {
		keywords := strings.Fields(filters.Search)
		if len(keywords) > 0 {
			var andConditions sq.And
			for _, k := range keywords {
				if filters.SearchBy == "sku" {
					andConditions = append(andConditions, sq.Like{"p.sku": "%" + k + "%"})
				} else {
					andConditions = append(andConditions, sq.Like{"p.name": "%" + k + "%"})
				}
			}
			builder = builder.Where(andConditions)
		}
	}

	// Stock Status logic
	if filters.StockStatus != "all" {
		subq := sq.Select("COALESCE(SUM(sl.quantity), 0)").From("stock_locations sl").Join("locations l ON sl.location_id = l.id").Where("sl.product_id = p.id")
		
		if filters.Location != "all" {
			subq = subq.Where(sq.Eq{"l.purpose": purpose})
		}
		if filters.Location == "gudang" {
			if len(filters.BuildingInclude) > 0 {
				subq = subq.Where(sq.Eq{"l.building": filters.BuildingInclude})
			} else if filters.Building != "all" {
				subq = subq.Where(sq.Eq{"l.building": filters.Building})
			}
			if len(filters.BuildingExclude) > 0 {
				subq = subq.Where(sq.NotEq{"l.building": filters.BuildingExclude})
			}
			if len(filters.FloorInclude) > 0 {
				subq = subq.Where(sq.Eq{"l.floor": filters.FloorInclude})
			} else if filters.Floor != "all" {
				subq = subq.Where(sq.Eq{"l.floor": filters.Floor})
			}
			if len(filters.FloorExclude) > 0 {
				subq = subq.Where(sq.NotEq{"l.floor": filters.FloorExclude})
			}
		}
		subSql, subArgs, _ := subq.ToSql()

		operator := ">="
		if filters.StockStatus == "minus" {
			operator = "<"
		}
		builder = builder.Where(fmt.Sprintf("(%s) %s 0", subSql, operator), subArgs...)
	}

	// We can't easily clear columns in Squirrel, so we just use the raw string replacement for count
	querySql, args, _ := builder.ToSql()
	countSqlClean := "SELECT COUNT(DISTINCT p.id) " + querySql[strings.Index(querySql, "FROM"):]
	
	var total int
	err := r.db.GetContext(ctx, &total, countSqlClean, args...)
	if err != nil {
		return nil, 0, err
	}

	// Subquery for total stock
	builder = builder.Column("(SELECT COALESCE(SUM(quantity), 0) FROM stock_locations WHERE product_id = p.id) as total_stock")
	
	// Sorting
	sortByMap := map[string]string{
		"name": "p.name", "sku": "p.sku", "price": "p.price", "updated_at": "p.updated_at", "weight": "p.weight",
	}
	sortCol := "p.name"
	if col, ok := sortByMap[filters.SortBy]; ok {
		sortCol = col
	}
	sortOrder := "ASC"
	if strings.ToUpper(filters.SortOrder) == "DESC" {
		sortOrder = "DESC"
	}

	if filters.Search != "" {
		searchField := "p.name"
		if filters.SearchBy == "sku" {
			searchField = "p.sku"
		}
		// Exact Match (1) -> Prefix Match (2) -> Like Match (3)
		builder = builder.OrderByClause(fmt.Sprintf("CASE WHEN %s = ? THEN 1 WHEN %s LIKE ? THEN 2 ELSE 3 END ASC", searchField, searchField), filters.Search, filters.Search+"%")
	}
	
	builder = builder.OrderBy(sortCol + " " + sortOrder)

	// Pagination
	offset := uint64((filters.Page - 1) * filters.Limit)
	builder = builder.Limit(uint64(filters.Limit)).Offset(offset)

	finalSql, finalArgs, err := builder.ToSql()
	if err != nil {
		return nil, 0, err
	}

	var results []dto.ProductDetailResponse
	err = r.db.SelectContext(ctx, &results, finalSql, finalArgs...)
	if results == nil {
		results = []dto.ProductDetailResponse{}
	} else {
		_ = r.attachProductDetails(ctx, results)
	}
	return results, total, err
}

func (r *productRepositoryImpl) SearchProducts(ctx context.Context, keyword string, locationID string, inStockOnly bool, page int, limit int) ([]dto.ProductDetailResponse, error) {
	builder := sq.Select("p.id", "p.sku", "p.name", "p.price", "p.is_package", "p.is_active", "p.category_id", "c.name as category_name", "p.weight").
		From("products p").
		LeftJoin("categories c ON p.category_id = c.id").
		Where("(p.is_active = 1 AND p.deleted_at IS NULL)")

	if keyword != "" {
		builder = builder.Where(sq.Or{
			sq.Like{"p.sku": "%" + keyword + "%"},
			sq.Like{"p.name": "%" + keyword + "%"},
		})
	}

	if locationID != "" && locationID != "0" {
		builder = builder.LeftJoin("stock_locations sl ON p.id = sl.product_id AND sl.location_id = ?", locationID)
		builder = builder.Column("COALESCE(sl.quantity, 0) as current_stock")
		
		if inStockOnly {
			builder = builder.Where("COALESCE(sl.quantity, 0) > 0")
		}
		
		builder = builder.OrderBy("(COALESCE(sl.quantity, 0) > 0) DESC")
	} else {
		if inStockOnly {
			builder = builder.Where("EXISTS (SELECT 1 FROM stock_locations sl WHERE sl.product_id = p.id AND sl.quantity > 0)")
		}
	}

	builder = builder.Column("(SELECT COALESCE(SUM(quantity), 0) FROM stock_locations WHERE product_id = p.id) as total_stock")
	builder = builder.OrderBy("p.name ASC").Limit(uint64(limit)).Offset(uint64((page - 1) * limit))

	sql, args, _ := builder.ToSql()
	var results []dto.ProductDetailResponse
	err := r.db.SelectContext(ctx, &results, sql, args...)
	if results == nil {
		results = []dto.ProductDetailResponse{}
	} else {
		_ = r.attachProductDetails(ctx, results)
	}
	return results, err
}

func (r *productRepositoryImpl) GetAllActiveProducts(ctx context.Context) ([]dto.ProductDetailResponse, error) {
	query := `
		SELECT p.id, p.sku, p.name, p.price, p.is_package, p.is_active, p.category_id, c.name as category_name, p.weight 
		FROM products p
		LEFT JOIN categories c ON p.category_id = c.id
		WHERE p.is_active = 1 AND p.deleted_at IS NULL
		ORDER BY p.name ASC
	`
	var results []dto.ProductDetailResponse
	err := r.db.SelectContext(ctx, &results, query)
	if results == nil {
		results = []dto.ProductDetailResponse{}
	} else {
		_ = r.attachProductDetails(ctx, results)
	}
	return results, err
}

func (r *productRepositoryImpl) GetProductDetailWithStock(ctx context.Context, id int) (*dto.ProductDetailResponse, error) {
	query := `
		SELECT 
			p.id, p.sku, p.name, p.price, p.is_package, p.is_active, p.category_id, c.name as category_name, p.weight,
			(SELECT COALESCE(SUM(quantity), 0) FROM stock_locations WHERE product_id = p.id) as total_stock
		FROM products p
		LEFT JOIN categories c ON p.category_id = c.id
		WHERE p.id = ?
	`
	var result dto.ProductDetailResponse
	err := r.db.GetContext(ctx, &result, query, id)
	if err == nil {
		temp := []dto.ProductDetailResponse{result}
		_ = r.attachProductDetails(ctx, temp)
		result = temp[0]
	}
	return &result, err
}

func (r *productRepositoryImpl) GetProductStockDetails(ctx context.Context, id int) ([]dto.ProductStockDetailResponse, error) {
	query := `
		SELECT 
			sl.location_id, l.code as location_code, l.name as location_name, l.purpose, l.building, COALESCE(l.floor, '') as floor, sl.quantity
		FROM stock_locations sl
		JOIN locations l ON sl.location_id = l.id
		WHERE sl.product_id = ?
		ORDER BY l.purpose ASC, l.building ASC
	`
	var results []dto.ProductStockDetailResponse
	err := r.db.SelectContext(ctx, &results, query, id)
	return results, err
}

func (r *productRepositoryImpl) GetProductHistory(ctx context.Context, id int) ([]dto.ProductHistoryResponse, error) {
	query := `
		SELECT 
			a.id, a.action, u.nickname as user_name, a.created_at
		FROM product_audit_logs a
		LEFT JOIN users u ON a.user_id = u.id
		WHERE a.product_id = ?
		ORDER BY a.created_at DESC
	`
	var results []dto.ProductHistoryResponse
	err := r.db.SelectContext(ctx, &results, query, id)
	return results, err
}

func (r *productRepositoryImpl) GetProductMapWithComponents(ctx context.Context, skus []string) (map[string]dto.ProductDetailResponse, error) {
	if len(skus) == 0 {
		return map[string]dto.ProductDetailResponse{}, nil
	}

	query, args, err := sqlx.In(`
		SELECT p.id, p.sku, p.name, p.price, p.is_package, p.is_active, p.category_id, c.name as category_name, p.weight 
		FROM products p
		LEFT JOIN categories c ON p.category_id = c.id
		WHERE p.sku IN (?) AND p.deleted_at IS NULL
	`, skus)
	if err != nil {
		return nil, err
	}

	query = r.db.Rebind(query)
	var products []dto.ProductDetailResponse
	if err := r.db.SelectContext(ctx, &products, query, args...); err != nil {
		return nil, err
	}

	if len(products) > 0 {
		if err := r.attachProductDetails(ctx, products); err != nil {
			return nil, err
		}
	}

	resultMap := make(map[string]dto.ProductDetailResponse)
	for _, p := range products {
		resultMap[strings.ToUpper(p.SKU)] = p
	}

	return resultMap, nil
}

// ============================================================================
// IMAGE OPERATIONS
// ============================================================================

func (r *productRepositoryImpl) LinkMediaToProduct(ctx context.Context, db sqlx.ExtContext, productID int, mediaID int, isPrimary int) error {
	query := `INSERT INTO product_images (product_id, media_id, is_primary) VALUES (?, ?, ?)`
	_, err := db.ExecContext(ctx, query, productID, mediaID, isPrimary)
	return err
}

func (r *productRepositoryImpl) DeleteProductImage(ctx context.Context, db sqlx.ExtContext, imageID int) error {
	query := `DELETE FROM product_images WHERE id = ?`
	_, err := db.ExecContext(ctx, query, imageID)
	return err
}

func (r *productRepositoryImpl) SetPrimaryImage(ctx context.Context, db sqlx.ExtContext, productID int, imageID int) error {
	query1 := `UPDATE product_images SET is_primary = 0 WHERE product_id = ?`
	if _, err := db.ExecContext(ctx, query1, productID); err != nil {
		return err
	}
	query2 := `UPDATE product_images SET is_primary = 1 WHERE id = ? AND product_id = ?`
	_, err := db.ExecContext(ctx, query2, imageID, productID)
	return err
}

// ============================================================================
// TIMELINE OPERATIONS
// ============================================================================

func (r *productRepositoryImpl) GetProductTotalStock(ctx context.Context, productID int, buildings []string) (int, error) {
	builder := sq.Select("COALESCE(SUM(sl.quantity), 0)").
		From("stock_locations sl").
		LeftJoin("locations l ON sl.location_id = l.id").
		Where(sq.Eq{"sl.product_id": productID})

	if len(buildings) > 0 {
		builder = builder.Where(sq.Eq{"l.building": buildings})
	}

	sqlStr, args, err := builder.ToSql()
	if err != nil {
		return 0, err
	}
	
	var total int
	err = r.db.GetContext(ctx, &total, sqlStr, args...)
	if err != nil {
		return 0, err
	}
	return total, nil
}

func (r *productRepositoryImpl) GetProductStockMovementsCount(ctx context.Context, productID int, buildings []string) (int, error) {
	builder := sq.Select("COUNT(*)").
		From("stock_movements sm").
		LeftJoin("locations l_from ON sm.from_location_id = l_from.id").
		LeftJoin("locations l_to ON sm.to_location_id = l_to.id").
		Where(sq.Eq{"sm.product_id": productID})

	if len(buildings) > 0 {
		builder = builder.Where(sq.Or{
			sq.Eq{"l_from.building": buildings},
			sq.Eq{"l_to.building": buildings},
		})
	}

	sqlStr, args, err := builder.ToSql()
	if err != nil {
		return 0, err
	}

	var count int
	err = r.db.GetContext(ctx, &count, sqlStr, args...)
	return count, err
}

func (r *productRepositoryImpl) GetSumOfNewerStockMovements(ctx context.Context, productID int, offset int, buildings []string) (int, error) {
	if offset == 0 {
		return 0, nil
	}

	hasBuildingFilter := len(buildings) > 0

	netChangeSql := `
		CASE
			WHEN sm.from_location_id IS NULL AND sm.to_location_id IS NOT NULL THEN sm.quantity
			WHEN sm.from_location_id IS NOT NULL AND sm.to_location_id IS NULL THEN -sm.quantity
			ELSE 0
		END
	`

	if hasBuildingFilter {
		bList := strings.Repeat("?,", len(buildings))
		bList = strings.TrimSuffix(bList, ",")
		
		// If to is in filter and from is not -> positive
		// If from is in filter and to is not -> negative
		netChangeSql = fmt.Sprintf(`
			CASE
				WHEN l_to.building IN (%s) AND (l_from.building NOT IN (%s) OR l_from.building IS NULL) THEN sm.quantity
				WHEN l_from.building IN (%s) AND (l_to.building NOT IN (%s) OR l_to.building IS NULL) THEN -sm.quantity
				ELSE 0
			END
		`, bList, bList, bList, bList)
	}

	subQuery := sq.Select("sm.quantity", "sm.from_location_id", "sm.to_location_id", "l_from.building as from_building", "l_to.building as to_building").
		From("stock_movements sm").
		LeftJoin("locations l_from ON sm.from_location_id = l_from.id").
		LeftJoin("locations l_to ON sm.to_location_id = l_to.id").
		Where(sq.Eq{"sm.product_id": productID})

	if hasBuildingFilter {
		subQuery = subQuery.Where(sq.Or{
			sq.Eq{"l_from.building": buildings},
			sq.Eq{"l_to.building": buildings},
		})
	}

	subQuery = subQuery.OrderBy("sm.created_at DESC").Limit(uint64(offset))
	
	subSql, subArgs, err := subQuery.ToSql()
	if err != nil {
		return 0, err
	}

	finalQuery := fmt.Sprintf("SELECT COALESCE(SUM(%s), 0) as total_net_change FROM (%s) as recent_movements", netChangeSql, subSql)

	var finalArgs []interface{}
	if hasBuildingFilter {
		for i := 0; i < 4; i++ {
			for _, b := range buildings {
				finalArgs = append(finalArgs, b)
			}
		}
	}
	finalArgs = append(finalArgs, subArgs...)

	var totalNetChange int
	err = r.db.GetContext(ctx, &totalNetChange, finalQuery, finalArgs...)
	if err != nil {
		return 0, err
	}
	return totalNetChange, nil
}

func (r *productRepositoryImpl) GetProductStockMovementsPaginated(ctx context.Context, productID int, limit int, offset int, buildings []string) ([]RawStockMovement, error) {
	builder := sq.Select("sm.id", "sm.quantity", "sm.from_location_id", "sm.to_location_id", "sm.movement_type", "sm.notes", "sm.created_at", "u.nickname as user_name", "l_from.building as from_building", "l_to.building as to_building").
		From("stock_movements sm").
		LeftJoin("users u ON sm.user_id = u.id").
		LeftJoin("locations l_from ON sm.from_location_id = l_from.id").
		LeftJoin("locations l_to ON sm.to_location_id = l_to.id").
		Where(sq.Eq{"sm.product_id": productID})

	if len(buildings) > 0 {
		builder = builder.Where(sq.Or{
			sq.Eq{"l_from.building": buildings},
			sq.Eq{"l_to.building": buildings},
		})
	}

	builder = builder.OrderBy("sm.created_at DESC").Limit(uint64(limit)).Offset(uint64(offset))

	sqlStr, args, err := builder.ToSql()
	if err != nil {
		return nil, err
	}

	var rows []RawStockMovement
	err = r.db.SelectContext(ctx, &rows, sqlStr, args...)
	if rows == nil {
		rows = []RawStockMovement{}
	}
	return rows, err
}
