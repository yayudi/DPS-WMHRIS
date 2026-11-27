// Package catalog wires dependency injection providers for categories, products, packages, and catalog audit logs.
package catalog

import (
	"github.com/dps-wmhris/backend/internal/modules/catalog/adapter/inbound/http"
	"github.com/dps-wmhris/backend/internal/modules/catalog/adapter/outbound/mysql"
	"github.com/dps-wmhris/backend/internal/modules/catalog/application/usecase"
	"github.com/google/wire"
)

// ProviderSet supplies all repositories, use cases, and HTTP handlers for the catalog module.
var ProviderSet = wire.NewSet(
	http.NewPackageHandler,
	mysql.NewCategoryRepository,
	mysql.NewProductAuditRepository,
	mysql.NewProductRepository,
	http.NewCategoryHandler,
	http.NewProductHandler,
	usecase.NewCategoryUseCase,
	usecase.NewProductUseCase,
)
