//go:build wireinject
// +build wireinject

package main

import (
	"github.com/dps-wmhris/backend/internal/di"
	"github.com/google/wire"
	"github.com/jmoiron/sqlx"
)

func InitializeAPI(db *sqlx.DB) (*di.Container, error) {
	wire.Build(
		di.GlobalProviderSet,
		di.ContainerProviderSet,
	)
	return &di.Container{}, nil
}
