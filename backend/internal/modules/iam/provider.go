package iam

import (
	"github.com/dps-wmhris/backend/internal/modules/iam/adapter/inbound/http"
	"github.com/dps-wmhris/backend/internal/modules/iam/adapter/outbound/mysql"
	"github.com/dps-wmhris/backend/internal/modules/iam/application/usecase"
	"github.com/google/wire"
)

var ProviderSet = wire.NewSet(
	mysql.NewAdminUserRepository,
	mysql.NewRoleRepository,
	mysql.NewUserRepository,
	http.NewAdminUserHandler,
	http.NewRoleHandler,
	http.NewUserHandler,
	usecase.NewAdminUserUseCase,
	usecase.NewRoleUseCase,
	usecase.NewUserUseCase,
)
