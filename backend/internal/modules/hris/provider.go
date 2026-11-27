// Package hris wires dependency injection providers for attendance, shift, and schedule features.
package hris

import (
	"github.com/dps-wmhris/backend/internal/modules/hris/adapter/inbound/http"
	"github.com/dps-wmhris/backend/internal/modules/hris/adapter/outbound/mysql"
	"github.com/dps-wmhris/backend/internal/modules/hris/application/usecase"
	"github.com/google/wire"
)

// ProviderSet supplies all repositories, use cases, and HTTP handlers for the HRIS module.
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
