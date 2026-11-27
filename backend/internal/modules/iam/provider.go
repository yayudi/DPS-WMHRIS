// Package iam wires the Identity and Access Management (IAM) bounded context.
package iam

import (
	"github.com/dps-wmhris/backend/internal/modules/iam/adapter/inbound/http"
	"github.com/dps-wmhris/backend/internal/modules/iam/adapter/outbound/mysql"
	"github.com/dps-wmhris/backend/internal/modules/iam/application/usecase"
	"github.com/google/wire"
)

// ProviderSet provides all repositories, use cases, and HTTP handlers for the IAM module.
var ProviderSet = wire.NewSet(
	mysql.NewAdminUserRepository,
	mysql.NewRoleRepository,
	mysql.NewUserRepository,
	mysql.NewUserPreferenceRepository,
	http.NewAdminUserHandler,
	http.NewRoleHandler,
	http.NewUserHandler,
	usecase.NewAdminUserUseCase,
	usecase.NewRoleUseCase,
	usecase.NewUserUseCase,
)
