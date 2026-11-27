package mysql

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	sq "github.com/Masterminds/squirrel"
	catalog_dto "github.com/dps-wmhris/backend/internal/modules/catalog/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/catalog/domain"
	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

type productRepositoryImpl struct {
	database.BaseRepository[domain.Product]
	db *sqlx.DB
}

// NewProductRepository creates a MySQL-backed ProductRepository.
func NewProductRepository(db *sqlx.DB) catalog_port.ProductRepository {
	base := database.NewBaseRepository[domain.Product](db, "products")
	return &productRepositoryImpl{
		BaseRepository: base,
		db:             db,
	}
}

func (r *productRepositoryImpl) ensureExists(ctx context.Context, ext database.ExtContext, id int) error {
	var count int
	if err := ext.GetContext(ctx, &count, "SELECT COUNT(*) FROM products WHERE id = ?", id); err != nil {
		return err
	}
	if count == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *productRepositoryImpl) Create(ctx context.Context, product *domain.Product) error {
	query := `
		INSERT INTO products (
			sku, name, category_id, price, is_active, is_package,
			weight, length, width, height
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query,
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

func (r *productRepositoryImpl) CreateProductTx(ctx context.Context, product *domain.Product) (int, error) {
	err := r.Create(ctx, product)
	return product.ID, err
}

func (r *productRepositoryImpl) GetProductIDBySKUTx(ctx context.Context, sku string) (int, error) {
	query := `SELECT id FROM products WHERE sku = ? LIMIT 1`
	ext := database.GetExt(ctx, r.db)

	var id int
	err := ext.QueryRowxContext(ctx, query, sku).Scan(&id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, nil
		}
		return 0, err
	}
	return id, nil
}

func (r *productRepositoryImpl) Update(ctx context.Context, product *domain.Product) error {
	query := `
		UPDATE products
		SET sku = ?, name = ?, category_id = ?, price = ?, is_active = ?, is_package = ?, weight = ?, length = ?, width = ?, height = ?
		WHERE id = ?`

	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query,
		product.SKU, product.Name, product.CategoryID, product.Price,
		product.IsActive, product.IsPackage, product.Weight,
		product.Length, product.Width, product.Height,
		product.ID,
	)
	if err != nil {
		return err
	}
	if affected, err := res.RowsAffected(); err == nil && affected == 0 {
		return r.ensureExists(ctx, ext, product.ID)
	}
	return nil
}

// ReplacePackageComponents replaces all package_components rows for a package product inside the active transaction.
func (r *productRepositoryImpl) ReplacePackageComponents(ctx context.Context, packageProductID int, components []domain.PackageComponent) error {
	ext := database.GetExt(ctx, r.db)
	if _, err := ext.ExecContext(ctx, `DELETE FROM package_components WHERE package_product_id = ?`, packageProductID); err != nil {
		return err
	}
	if len(components) == 0 {
		return nil
	}

	placeholders := make([]string, 0, len(components))
	args := make([]any, 0, len(components)*3)
	for _, comp := range components {
		placeholders = append(placeholders, "(?, ?, ?)")
		args = append(args, packageProductID, comp.ComponentProductID, comp.QuantityPerPackage)
	}

	insertQuery := fmt.Sprintf(
		"INSERT INTO package_components (package_product_id, component_product_id, quantity_per_package) VALUES %s",
		strings.Join(placeholders, ", "),
	)
	_, err := ext.ExecContext(ctx, insertQuery, args...)
	return err
}

func (r *productRepositoryImpl) GetBySKUs(ctx context.Context, skus []string) ([]domain.Product, error) {
	if len(skus) == 0 {
		return []domain.Product{}, nil
	}
	products := make([]domain.Product, 0)
	query, args, err := sqlx.In("SELECT id, sku, name, category_id, price, is_active, is_package, weight, length, width, height, created_at, updated_at FROM products WHERE sku IN (?)", skus)
	if err != nil {
		return nil, err
	}
	ext := database.GetExt(ctx, r.db)
	query = ext.Rebind(query)
	if err := ext.SelectContext(ctx, &products, query, args...); err != nil {
		return nil, err
	}
	if products == nil {
		return []domain.Product{}, nil
	}
	return products, nil
}

// ============================================================================
// READ OPERATIONS (Complex Queries)
// ============================================================================

func (r *productRepositoryImpl) attachProductDetails(ctx context.Context, products []catalog_dto.ProductDetailResponse) error {
	if len(products) == 0 {
		return nil
	}
	productIDs := make([]int, len(products))
	productMap := make(map[int]*catalog_dto.ProductDetailResponse, len(products))
	for i := range products {
		productIDs[i] = products[i].ID
		products[i].StockLocations = []catalog_dto.ProductStockLocation{}
		products[i].Components = []catalog_dto.ProductComponent{}
		products[i].Images = []catalog_dto.ProductImage{}
		productMap[products[i].ID] = &products[i]
	}

	ext := database.GetExt(ctx, r.db)

	// 1. Fetch stock locations
	locQuery, locArgs, err := sqlx.In(`
		SELECT sl.product_id, l.id AS location_id, l.code AS location_code,
		       COALESCE(l.purpose, '') AS purpose, COALESCE(l.building, '') AS building,
		       COALESCE(l.floor, '') AS floor, sl.quantity
		FROM stock_locations sl
		JOIN locations l ON sl.location_id = l.id
		WHERE sl.product_id IN (?)
	`, productIDs)
	if err != nil {
		return err
	}
	locRows, err := ext.QueryContext(ctx, ext.Rebind(locQuery), locArgs...)
	if err != nil {
		return err
	}
	defer locRows.Close()
	for locRows.Next() {
		var pid int
		var loc catalog_dto.ProductStockLocation
		if err := locRows.Scan(&pid, &loc.LocationID, &loc.LocationCode, &loc.Purpose, &loc.Building, &loc.Floor, &loc.Quantity); err != nil {
			return err
		}
		loc.Slots = []catalog_dto.ProductSlotSummary{}
		if p, ok := productMap[pid]; ok {
			p.StockLocations = append(p.StockLocations, loc)
		}
	}
	if err := locRows.Err(); err != nil {
		return err
	}

	// 2. Fetch product location slots (rack coordinates)
	type prodLocKey struct {
		productID  int
		locationID int
	}
	slotsMap := make(map[prodLocKey][]catalog_dto.ProductSlotSummary)
	slotQuery, slotArgs, err := sqlx.In(`
		SELECT id, product_id, location_id, room, rack, COALESCE(tier, '') AS tier, formatted_coordinate, is_primary
		FROM product_location_slots
		WHERE product_id IN (?)
		ORDER BY is_primary DESC, id ASC
	`, productIDs)
	if err != nil {
		return err
	}
	slotRows, err := ext.QueryContext(ctx, ext.Rebind(slotQuery), slotArgs...)
	if err != nil {
		return err
	}
	defer slotRows.Close()
	for slotRows.Next() {
		var s struct {
			catalog_dto.ProductSlotSummary
			ProductID  int `db:"product_id"`
			LocationID int `db:"location_id"`
		}
		if err := slotRows.Scan(&s.ID, &s.ProductID, &s.LocationID, &s.Room, &s.Rack, &s.Tier, &s.FormattedCoordinate, &s.IsPrimary); err != nil {
			return err
		}
		k := prodLocKey{productID: s.ProductID, locationID: s.LocationID}
		slotsMap[k] = append(slotsMap[k], s.ProductSlotSummary)
	}
	if err := slotRows.Err(); err != nil {
		return err
	}

	for pid, p := range productMap {
		for i := range p.StockLocations {
			k := prodLocKey{productID: pid, locationID: p.StockLocations[i].LocationID}
			if sList, ok := slotsMap[k]; ok {
				p.StockLocations[i].Slots = sList
			}
		}
	}

	// 3. Fetch product images
	imgQuery, imgArgs, err := sqlx.In(`
		SELECT pi.id, pi.product_id, pi.media_id, pi.is_primary, pi.sort_order, m.main_path, m.thumbnail_path, m.title
		FROM product_images pi
		JOIN media_assets m ON pi.media_id = m.id
		WHERE pi.product_id IN (?)
		ORDER BY pi.is_primary DESC, pi.sort_order ASC, pi.id ASC
	`, productIDs)
	if err != nil {
		return err
	}
	imgRows, err := ext.QueryContext(ctx, ext.Rebind(imgQuery), imgArgs...)
	if err != nil {
		return err
	}
	defer imgRows.Close()
	for imgRows.Next() {
		var img catalog_dto.ProductImage
		if err := imgRows.Scan(&img.ID, &img.ProductID, &img.MediaID, &img.IsPrimary, &img.SortOrder, &img.MainPath, &img.ThumbnailPath, &img.Title); err != nil {
			return err
		}
		if p, ok := productMap[img.ProductID]; ok {
			p.Images = append(p.Images, img)
			if img.IsPrimary || (p.ThumbnailPath == nil && p.ImagePath == nil) {
				p.ThumbnailPath = img.ThumbnailPath
				p.ImagePath = img.MainPath
			}
		}
	}
	if err := imgRows.Err(); err != nil {
		return err
	}

	// 4. Fetch package components
	compQuery, compArgs, err := sqlx.In(`
		SELECT pp.package_product_id, pp.component_product_id, c.name, c.sku, pp.quantity_per_package,
		       COALESCE((SELECT SUM(sl.quantity) FROM stock_locations sl WHERE sl.product_id = c.id), 0) AS stock_available
		FROM package_components pp
		JOIN products c ON pp.component_product_id = c.id
		WHERE pp.package_product_id IN (?)
	`, productIDs)
	if err != nil {
		return err
	}
	compRows, err := ext.QueryContext(ctx, ext.Rebind(compQuery), compArgs...)
	if err != nil {
		return err
	}
	defer compRows.Close()
	for compRows.Next() {
		var pid int
		var comp catalog_dto.ProductComponent
		if err := compRows.Scan(&pid, &comp.ComponentProductID, &comp.Name, &comp.SKU, &comp.Quantity, &comp.StockAvailable); err != nil {
			return err
		}
		if p, ok := productMap[pid]; ok {
			p.Components = append(p.Components, comp)
		}
	}
	return compRows.Err()
}

// stockStatusOperator maps a stockStatus filter value to its SQL comparison operator.
// It returns ok=false for "all" or unknown values, meaning no stock condition is applied.
func stockStatusOperator(status string) (op string, ok bool) {
	switch status {
	case "nonzero":
		return "<>", true
	case "positive":
		return ">", true
	case "zero":
		return "=", true
	case "negative", "minus":
		return "<", true
	default:
		return "", false
	}
}

// applyLocationScope narrows a stock_locations/locations subquery based on purpose and building/floor filters.
func applyLocationScope(subq sq.SelectBuilder, purpose string, f catalog_dto.ProductFilterRequest) sq.SelectBuilder {
	if purpose != "" {
		subq = subq.Where(sq.Eq{"l.purpose": purpose})
	}
	if len(f.BuildingInclude) > 0 {
		subq = subq.Where(sq.Eq{"l.building": f.BuildingInclude})
	} else if f.Building != "" && f.Building != "all" {
		subq = subq.Where(sq.Eq{"l.building": f.Building})
	}
	if len(f.BuildingExclude) > 0 {
		subq = subq.Where(sq.NotEq{"l.building": f.BuildingExclude})
	}

	if len(f.FloorInclude) > 0 {
		subq = subq.Where(sq.Eq{"l.floor": f.FloorInclude})
	} else if f.Floor != "" && f.Floor != "all" {
		subq = subq.Where(sq.Eq{"l.floor": f.Floor})
	}
	if len(f.FloorExclude) > 0 {
		subq = subq.Where(sq.NotEq{"l.floor": f.FloorExclude})
	}

	return subq
}

// applySlottingStatusFilter appends conditions to filter products by their slotting status.
// unslotted: products having at least 1 in-scope location with quantity > 0 missing a slot.
// slotted: products having in-scope location with quantity > 0 and 0 locations missing a slot.
func applySlottingStatusFilter(builder sq.SelectBuilder, purpose string, f catalog_dto.ProductFilterRequest) sq.SelectBuilder {
	switch f.SlottingStatus {
	case "unslotted":
		subq := sq.Select("1").
			From("stock_locations sl").
			Join("locations l ON sl.location_id = l.id").
			Where("sl.product_id = p.id AND sl.quantity > 0").
			Where("NOT EXISTS (SELECT 1 FROM product_location_slots pls WHERE pls.product_id = p.id AND pls.location_id = sl.location_id)")
		subq = applyLocationScope(subq, purpose, f)
		subSQL, subArgs, err := subq.ToSql()
		if err != nil {
			return builder
		}
		return builder.Where(fmt.Sprintf("EXISTS (%s)", subSQL), subArgs...)

	case "slotted":
		hasStockSubq := sq.Select("1").
			From("stock_locations sl").
			Join("locations l ON sl.location_id = l.id").
			Where("sl.product_id = p.id AND sl.quantity > 0")
		hasStockSubq = applyLocationScope(hasStockSubq, purpose, f)
		hasStockSQL, hasStockArgs, err := hasStockSubq.ToSql()
		if err != nil {
			return builder
		}
		builder = builder.Where(fmt.Sprintf("EXISTS (%s)", hasStockSQL), hasStockArgs...)

		missingSlotSubq := sq.Select("1").
			From("stock_locations sl").
			Join("locations l ON sl.location_id = l.id").
			Where("sl.product_id = p.id AND sl.quantity > 0").
			Where("NOT EXISTS (SELECT 1 FROM product_location_slots pls WHERE pls.product_id = p.id AND pls.location_id = sl.location_id)")
		missingSlotSubq = applyLocationScope(missingSlotSubq, purpose, f)
		missingSQL, missingArgs, err := missingSlotSubq.ToSql()
		if err != nil {
			return builder
		}
		return builder.Where(fmt.Sprintf("NOT EXISTS (%s)", missingSQL), missingArgs...)

	default:
		return builder
	}
}

func cleanFilterSlice(s []string) []string {
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

func applyProductFilters(builder sq.SelectBuilder, filters catalog_dto.ProductFilterRequest) (sq.SelectBuilder, error) {
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
	switch filters.Location {
	case "gudang":
		purpose = "WAREHOUSE"
	case "pajangan":
		purpose = "DISPLAY"
	case "ltc":
		purpose = "BRANCH"
	}

	if filters.Location != "" && filters.Location != "all" {
		subq := sq.Select("1").
			From("stock_locations sl").
			Join("locations l ON sl.location_id = l.id").
			Where("sl.product_id = p.id")
		subq = applyLocationScope(subq, purpose, filters)
		subSQL, subArgs, err := subq.ToSql()
		if err != nil {
			return builder, err
		}
		builder = builder.Where(fmt.Sprintf("EXISTS (%s)", subSQL), subArgs...)
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
	if op, ok := stockStatusOperator(filters.StockStatus); ok {
		subq := sq.Select("COALESCE(SUM(sl.quantity), 0)").
			From("stock_locations sl").
			Join("locations l ON sl.location_id = l.id").
			Where("sl.product_id = p.id")
		if filters.Location != "" && filters.Location != "all" {
			subq = applyLocationScope(subq, purpose, filters)
		}
		subSQL, subArgs, err := subq.ToSql()
		if err != nil {
			return builder, err
		}
		builder = builder.Where(fmt.Sprintf("(%s) %s 0", subSQL, op), subArgs...)
	}

	// Slotting Status logic
	builder = applySlottingStatusFilter(builder, purpose, filters)
	return builder, nil
}

func (r *productRepositoryImpl) GetProductsWithFilters(ctx context.Context, filters catalog_dto.ProductFilterRequest) ([]catalog_dto.ProductDetailResponse, int, error) {
	filters.CategoryInclude = cleanFilterSlice(filters.CategoryInclude)
	filters.CategoryExclude = cleanFilterSlice(filters.CategoryExclude)
	filters.BuildingInclude = cleanFilterSlice(filters.BuildingInclude)
	filters.BuildingExclude = cleanFilterSlice(filters.BuildingExclude)
	filters.FloorInclude = cleanFilterSlice(filters.FloorInclude)
	filters.FloorExclude = cleanFilterSlice(filters.FloorExclude)

	countBuilder, err := applyProductFilters(
		sq.Select("COUNT(DISTINCT p.id)").
			From("products p").
			LeftJoin("categories c ON p.category_id = c.id"),
		filters,
	)
	if err != nil {
		return nil, 0, err
	}
	countSQL, countArgs, err := countBuilder.ToSql()
	if err != nil {
		return nil, 0, err
	}

	var total int
	ext := database.GetExt(ctx, r.db)
	if err := ext.GetContext(ctx, &total, countSQL, countArgs...); err != nil {
		return nil, 0, err
	}

	dataBuilder, err := applyProductFilters(
		sq.Select(
			"p.id", "p.sku", "p.name", "p.price", "p.is_package", "p.is_active",
			"p.category_id", "c.name AS category_name", "p.weight",
			"(SELECT COALESCE(SUM(quantity), 0) FROM stock_locations WHERE product_id = p.id) AS total_stock",
		).
			From("products p").
			LeftJoin("categories c ON p.category_id = c.id"),
		filters,
	)
	if err != nil {
		return nil, 0, err
	}

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
		dataBuilder = dataBuilder.OrderByClause(
			fmt.Sprintf("CASE WHEN %s = ? THEN 1 WHEN %s LIKE ? THEN 2 ELSE 3 END ASC", searchField, searchField),
			filters.Search, filters.Search+"%",
		)
	}
	dataBuilder = dataBuilder.OrderBy(sortCol + " " + sortOrder)

	safePage := max(1, filters.Page)
	safeLimit := max(0, filters.Limit)
	offset := uint64((safePage - 1) * safeLimit) // #nosec G115
	dataBuilder = dataBuilder.Limit(uint64(safeLimit)).Offset(offset)

	finalSQL, finalArgs, err := dataBuilder.ToSql()
	if err != nil {
		return nil, 0, err
	}

	results := make([]catalog_dto.ProductDetailResponse, 0)
	if err := ext.SelectContext(ctx, &results, finalSQL, finalArgs...); err != nil {
		return nil, 0, err
	}
	if len(results) > 0 {
		if err := r.attachProductDetails(ctx, results); err != nil {
			return nil, 0, err
		}
	}
	return results, total, nil
}

func buildSearchProductsQuery(keyword string, locationID string, inStockOnly bool, page int, limit int) (string, []any, error) {
	builder := sq.Select("p.id", "p.sku", "p.name", "p.price", "p.is_package", "p.is_active", "p.category_id", "c.name AS category_name", "p.weight").
		From("products p").
		LeftJoin("categories c ON p.category_id = c.id").
		Where("(p.is_active = 1 AND p.deleted_at IS NULL)")

	if keyword != "" {
		keywords := strings.Fields(keyword)
		if len(keywords) > 0 {
			var andConditions sq.And
			for _, k := range keywords {
				andConditions = append(andConditions, sq.Or{
					sq.Like{"p.sku": "%" + k + "%"},
					sq.Like{"p.name": "%" + k + "%"},
				})
			}
			builder = builder.Where(andConditions)
		}
	}

	if locationID != "" && locationID != "0" {
		builder = builder.LeftJoin("stock_locations sl ON p.id = sl.product_id AND sl.location_id = ?", locationID)
		builder = builder.Column("COALESCE(sl.quantity, 0) AS current_stock")
		if inStockOnly {
			builder = builder.Where("COALESCE(sl.quantity, 0) > 0")
		}
		builder = builder.OrderBy("(COALESCE(sl.quantity, 0) > 0) DESC")
	} else if inStockOnly {
		builder = builder.Where("EXISTS (SELECT 1 FROM stock_locations sl WHERE sl.product_id = p.id AND sl.quantity > 0)")
	}

	builder = builder.Column("(SELECT COALESCE(SUM(quantity), 0) FROM stock_locations WHERE product_id = p.id) AS total_stock")
	safePage := max(1, page)
	safeLimit := max(0, limit)
	offset := uint64((safePage - 1) * safeLimit) // #nosec G115
	builder = builder.OrderBy("p.name ASC").Limit(uint64(safeLimit)).Offset(offset)

	return builder.ToSql()
}

func (r *productRepositoryImpl) SearchProducts(ctx context.Context, keyword string, locationID string, inStockOnly bool, page int, limit int) ([]catalog_dto.ProductDetailResponse, error) {
	querySQL, args, err := buildSearchProductsQuery(keyword, locationID, inStockOnly, page, limit)
	if err != nil {
		return nil, err
	}

	results := make([]catalog_dto.ProductDetailResponse, 0)
	ext := database.GetExt(ctx, r.db)
	if err := ext.SelectContext(ctx, &results, querySQL, args...); err != nil {
		return nil, err
	}
	if len(results) > 0 {
		if err := r.attachProductDetails(ctx, results); err != nil {
			return nil, err
		}
	}
	return results, nil
}

func (r *productRepositoryImpl) GetAllActiveProducts(ctx context.Context) ([]catalog_dto.ProductDetailResponse, error) {
	query := `
		SELECT p.id, p.sku, p.name, p.price, p.is_package, p.is_active, p.category_id, c.name AS category_name, p.weight
		FROM products p
		LEFT JOIN categories c ON p.category_id = c.id
		WHERE p.is_active = 1 AND p.deleted_at IS NULL
		ORDER BY p.name ASC
	`
	results := make([]catalog_dto.ProductDetailResponse, 0)
	ext := database.GetExt(ctx, r.db)
	if err := ext.SelectContext(ctx, &results, query); err != nil {
		return nil, err
	}
	if len(results) > 0 {
		if err := r.attachProductDetails(ctx, results); err != nil {
			return nil, err
		}
	}
	return results, nil
}

func (r *productRepositoryImpl) GetProductDetailWithStock(ctx context.Context, id int) (*catalog_dto.ProductDetailResponse, error) {
	query := `
		SELECT
			p.id, p.sku, p.name, p.price, p.is_package, p.is_active, p.category_id, c.name AS category_name, p.weight,
			p.length, p.width, p.height,
			(SELECT COALESCE(SUM(quantity), 0) FROM stock_locations WHERE product_id = p.id) AS total_stock
		FROM products p
		LEFT JOIN categories c ON p.category_id = c.id
		WHERE p.id = ?
	`
	var result catalog_dto.ProductDetailResponse
	ext := database.GetExt(ctx, r.db)
	if err := ext.GetContext(ctx, &result, query, id); err != nil {
		return nil, err
	}
	temp := []catalog_dto.ProductDetailResponse{result}
	if err := r.attachProductDetails(ctx, temp); err != nil {
		return nil, err
	}
	return &temp[0], nil
}

func (r *productRepositoryImpl) GetProductStockDetails(ctx context.Context, id int) ([]catalog_dto.ProductStockDetailResponse, error) {
	query := `
		SELECT
			sl.location_id, l.code AS location_code, COALESCE(l.name, '') AS location_name,
			COALESCE(l.purpose, '') AS purpose, COALESCE(l.building, '') AS building,
			COALESCE(l.floor, '') AS floor, sl.quantity
		FROM stock_locations sl
		JOIN locations l ON sl.location_id = l.id
		WHERE sl.product_id = ?
		ORDER BY l.purpose ASC, l.building ASC
	`
	results := make([]catalog_dto.ProductStockDetailResponse, 0)
	ext := database.GetExt(ctx, r.db)
	if err := ext.SelectContext(ctx, &results, query, id); err != nil {
		return nil, err
	}

	for i := range results {
		results[i].Slots = []catalog_dto.ProductSlotSummary{}
	}

	slotQuery := `
		SELECT id, product_id, location_id, room, rack, COALESCE(tier, '') AS tier, formatted_coordinate, is_primary
		FROM product_location_slots
		WHERE product_id = ?
		ORDER BY is_primary DESC, id ASC
	`
	type slotRow struct {
		catalog_dto.ProductSlotSummary
		ProductID  int `db:"product_id"`
		LocationID int `db:"location_id"`
	}
	var slotRows []slotRow
	if err := ext.SelectContext(ctx, &slotRows, slotQuery, id); err != nil {
		return nil, err
	}
	slotsByLoc := make(map[int][]catalog_dto.ProductSlotSummary, len(slotRows))
	for _, s := range slotRows {
		slotsByLoc[s.LocationID] = append(slotsByLoc[s.LocationID], s.ProductSlotSummary)
	}
	for i := range results {
		if sList, ok := slotsByLoc[results[i].LocationID]; ok {
			results[i].Slots = sList
		}
	}

	return results, nil
}

func (r *productRepositoryImpl) GetProductHistory(ctx context.Context, id int) ([]catalog_dto.ProductHistoryResponse, error) {
	query := `
		SELECT
			a.id, a.action, u.nickname AS user_name, a.created_at
		FROM product_audit_logs a
		LEFT JOIN users u ON a.user_id = u.id
		WHERE a.product_id = ?
		ORDER BY a.created_at DESC
	`
	results := make([]catalog_dto.ProductHistoryResponse, 0)
	ext := database.GetExt(ctx, r.db)
	if err := ext.SelectContext(ctx, &results, query, id); err != nil {
		return nil, err
	}
	if results == nil {
		return []catalog_dto.ProductHistoryResponse{}, nil
	}
	return results, nil
}

func (r *productRepositoryImpl) GetProductLastPriceUpdate(ctx context.Context, id int) (*time.Time, error) {
	query := `
		SELECT created_at
		FROM product_audit_logs
		WHERE product_id = ? AND field = 'price' AND action = 'UPDATE'
		ORDER BY created_at DESC
		LIMIT 1
	`
	var updatedAt time.Time
	ext := database.GetExt(ctx, r.db)
	err := ext.GetContext(ctx, &updatedAt, query, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &updatedAt, nil
}

func (r *productRepositoryImpl) GetProductMapWithComponents(ctx context.Context, skus []string) (map[string]catalog_dto.ProductDetailResponse, error) {
	if len(skus) == 0 {
		return map[string]catalog_dto.ProductDetailResponse{}, nil
	}

	query, args, err := sqlx.In(`
		SELECT p.id, p.sku, p.name, p.price, p.is_package, p.is_active, p.category_id, c.name AS category_name, p.weight
		FROM products p
		LEFT JOIN categories c ON p.category_id = c.id
		WHERE p.sku IN (?) AND p.deleted_at IS NULL
	`, skus)
	if err != nil {
		return nil, err
	}

	ext := database.GetExt(ctx, r.db)
	query = ext.Rebind(query)
	var products []catalog_dto.ProductDetailResponse
	if err := ext.SelectContext(ctx, &products, query, args...); err != nil {
		return nil, err
	}

	if len(products) > 0 {
		if err := r.attachProductDetails(ctx, products); err != nil {
			return nil, err
		}
	}

	resultMap := make(map[string]catalog_dto.ProductDetailResponse, len(products))
	for _, p := range products {
		resultMap[strings.ToUpper(p.SKU)] = p
	}

	return resultMap, nil
}

// ============================================================================
// IMAGE OPERATIONS
// ============================================================================

func (r *productRepositoryImpl) LinkMediaToProduct(ctx context.Context, productID int, mediaID int, isPrimary int) error {
	query := `INSERT INTO product_images (product_id, media_id, is_primary) VALUES (?, ?, ?)`
	ext := database.GetExt(ctx, r.db)
	_, err := ext.ExecContext(ctx, query, productID, mediaID, isPrimary)
	return err
}

func (r *productRepositoryImpl) IsMediaLinkedToProduct(ctx context.Context, productID int, mediaID int) (bool, error) {
	var count int
	ext := database.GetExt(ctx, r.db)
	err := ext.GetContext(ctx, &count, "SELECT COUNT(*) FROM product_images WHERE product_id = ? AND media_id = ?", productID, mediaID)
	return count > 0, err
}

func (r *productRepositoryImpl) DeleteProductImage(ctx context.Context, imageID int) error {
	query := `DELETE FROM product_images WHERE id = ?`
	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query, imageID)
	if err != nil {
		return err
	}
	if affected, err := res.RowsAffected(); err == nil && affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *productRepositoryImpl) SetPrimaryImage(ctx context.Context, productID int, imageID int) error {
	ext := database.GetExt(ctx, r.db)

	// Verify target image belongs to this product before clearing existing primary flag.
	var count int
	if err := ext.GetContext(ctx, &count, `SELECT COUNT(*) FROM product_images WHERE id = ? AND product_id = ?`, imageID, productID); err != nil {
		return err
	}
	if count == 0 {
		return sql.ErrNoRows
	}

	if _, err := ext.ExecContext(ctx, `UPDATE product_images SET is_primary = 0 WHERE product_id = ?`, productID); err != nil {
		return err
	}
	_, err := ext.ExecContext(ctx, `UPDATE product_images SET is_primary = 1 WHERE id = ? AND product_id = ?`, imageID, productID)
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
	ext := database.GetExt(ctx, r.db)
	if err := ext.GetContext(ctx, &total, sqlStr, args...); err != nil {
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
	ext := database.GetExt(ctx, r.db)
	err = ext.GetContext(ctx, &count, sqlStr, args...)
	return count, err
}

func (r *productRepositoryImpl) GetSumOfNewerStockMovements(ctx context.Context, productID int, offset int, buildings []string) (int, error) {
	if offset <= 0 {
		return 0, nil
	}

	hasBuildingFilter := len(buildings) > 0

	netChangeSQL := `
		CASE
			WHEN sm.from_location_id IS NULL AND sm.to_location_id IS NOT NULL THEN sm.quantity
			WHEN sm.from_location_id IS NOT NULL AND sm.to_location_id IS NULL THEN -sm.quantity
			ELSE 0
		END
	`

	if hasBuildingFilter {
		bList := strings.TrimSuffix(strings.Repeat("?,", len(buildings)), ",")
		netChangeSQL = fmt.Sprintf(`
			CASE
				WHEN l_to.building IN (%s) AND (l_from.building NOT IN (%s) OR l_from.building IS NULL) THEN sm.quantity
				WHEN l_from.building IN (%s) AND (l_to.building NOT IN (%s) OR l_to.building IS NULL) THEN -sm.quantity
				ELSE 0
			END
		`, bList, bList, bList, bList)
	}

	subQuery := sq.Select("sm.quantity", "sm.from_location_id", "sm.to_location_id", "l_from.building AS from_building", "l_to.building AS to_building").
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

	safeOffset := max(0, offset)
	subQuery = subQuery.OrderBy("sm.created_at DESC").Limit(uint64(safeOffset))

	subSQL, subArgs, err := subQuery.ToSql()
	if err != nil {
		return 0, err
	}

	finalQuery := fmt.Sprintf("SELECT COALESCE(SUM(%s), 0) AS total_net_change FROM (%s) AS recent_movements", netChangeSQL, subSQL)

	var finalArgs []any
	if hasBuildingFilter {
		for i := 0; i < 4; i++ {
			for _, b := range buildings {
				finalArgs = append(finalArgs, b)
			}
		}
	}
	finalArgs = append(finalArgs, subArgs...)

	var totalNetChange int
	ext := database.GetExt(ctx, r.db)
	if err := ext.GetContext(ctx, &totalNetChange, finalQuery, finalArgs...); err != nil {
		return 0, err
	}
	return totalNetChange, nil
}

func (r *productRepositoryImpl) GetProductStockMovementsPaginated(ctx context.Context, productID int, limit int, offset int, buildings []string) ([]catalog_port.RawStockMovement, error) {
	builder := sq.Select(
		"sm.id", "sm.quantity", "sm.from_location_id", "sm.to_location_id",
		"sm.movement_type", "sm.notes", "sm.created_at",
		"u.nickname AS user_name", "l_from.building AS from_building", "l_to.building AS to_building",
	).
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

	safeLimit := max(0, limit)
	safeOffset := max(0, offset)
	builder = builder.OrderBy("sm.created_at DESC").Limit(uint64(safeLimit)).Offset(uint64(safeOffset))

	sqlStr, args, err := builder.ToSql()
	if err != nil {
		return nil, err
	}

	rows := make([]catalog_port.RawStockMovement, 0)
	ext := database.GetExt(ctx, r.db)
	if err := ext.SelectContext(ctx, &rows, sqlStr, args...); err != nil {
		return nil, err
	}
	if rows == nil {
		return []catalog_port.RawStockMovement{}, nil
	}
	return rows, nil
}
