package hris

import (
	"github.com/dps-wmhris/backend/internal/modules/hris/adapter/inbound/http"
	"github.com/dps-wmhris/backend/internal/modules/hris/adapter/outbound/mysql"
	"github.com/dps-wmhris/backend/internal/modules/hris/application/usecase"
	"github.com/google/wire"
)

var ProviderSet = wire.NewSet(
	mysql.NewAttendanceRepository,
	mysql.NewScheduleRepository,
	mysql.NewShiftRepository,
	http.NewAttendanceHandler,
	http.NewScheduleHandler,
	http.NewShiftHandler,
	usecase.NewAttendanceUseCase,
	usecase.NewScheduleUseCase,
	usecase.NewShiftUseCase,
)
