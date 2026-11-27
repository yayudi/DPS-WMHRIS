// Package misc wires dependency injection providers for paper size and sticker template features.
package misc

import (
	"github.com/dps-wmhris/backend/internal/modules/misc/adapter/inbound/http"
	"github.com/dps-wmhris/backend/internal/modules/misc/adapter/outbound/mysql"
	"github.com/dps-wmhris/backend/internal/modules/misc/application/usecase"
	"github.com/google/wire"
)

// ProviderSet supplies all repositories, use cases, and HTTP handlers for the misc module.
var ProviderSet = wire.NewSet(
	mysql.NewPaperSizeRepository,
	mysql.NewStickerTemplateRepository,
	usecase.NewPaperSizeService,
	usecase.NewStickerTemplateService,
	http.NewPaperSizeHandler,
	http.NewStickerTemplateHandler,
)
