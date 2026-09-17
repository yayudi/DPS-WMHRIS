package misc

import (
	"github.com/dps-wmhris/backend/internal/modules/misc/adapter/inbound/http"
	"github.com/dps-wmhris/backend/internal/modules/misc/adapter/outbound/mysql"
	"github.com/dps-wmhris/backend/internal/modules/misc/application/usecase"
	"github.com/google/wire"
)

var ProviderSet = wire.NewSet(
	mysql.NewPaperSizeRepository,
	mysql.NewStickerTemplateRepository,
	usecase.NewPaperSizeService,
	usecase.NewStickerTemplateService,
	http.NewPaperSizeHandler,
	http.NewStickerTemplateHandler,
)
