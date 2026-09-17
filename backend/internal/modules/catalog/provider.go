package catalog

import (
	"github.com/dps-wmhris/backend/internal/modules/catalog/adapter/inbound/http"
	"github.com/dps-wmhris/backend/internal/modules/catalog/adapter/outbound/mysql"
	"github.com/dps-wmhris/backend/internal/modules/catalog/application/usecase"
	"github.com/google/wire"
)

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
