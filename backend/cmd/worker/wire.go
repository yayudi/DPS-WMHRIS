//go:build wireinject
// +build wireinject

package main

import (
	"github.com/dps-wmhris/backend/internal/di"
	"github.com/google/wire"
	"github.com/jmoiron/sqlx"
)

func InitializeWorker(db *sqlx.DB) (*di.WorkerContainer, error) {
	wire.Build(
		di.GlobalProviderSet,
		di.ContainerProviderSet,
	)
	return &di.WorkerContainer{}, nil
}
