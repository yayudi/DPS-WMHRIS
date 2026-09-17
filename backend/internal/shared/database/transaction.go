package database

import (
	"context"
	"database/sql"

	"github.com/jmoiron/sqlx"
)

type txKey struct{}

// TransactionManager is an interface that abstracts database transactions from UseCases.
// This allows UseCases to be fully mocked without depending on sqlx.DB.
type TransactionManager interface {
	WithTransaction(ctx context.Context, fn func(ctx context.Context) error) error
}

type sqlxTransactionManager struct {
	db *sqlx.DB
}

func NewTransactionManager(db *sqlx.DB) TransactionManager {
	return &sqlxTransactionManager{db: db}
}

// WithTransaction executes a block of code within a database transaction.
// It automatically injects the transaction into the context so Repositories can extract it.
func (tm *sqlxTransactionManager) WithTransaction(ctx context.Context, fn func(ctx context.Context) error) error {
	tx, err := tm.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}

	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback()
			panic(p)
		}
	}()

	// Inject the transaction into the context
	ctxWithTx := context.WithValue(ctx, txKey{}, tx)

	err = fn(ctxWithTx)
	if err != nil {
		_ = tx.Rollback()
		return err
	}

	return tx.Commit()
}

// ExtContext defines an interface that both sqlx.DB and sqlx.Tx implement,
// including SelectContext and GetContext which are not in sqlx.ExtContext.
type ExtContext interface {
	sqlx.ExtContext
	SelectContext(ctx context.Context, dest interface{}, query string, args ...interface{}) error
	GetContext(ctx context.Context, dest interface{}, query string, args ...interface{}) error
	NamedExecContext(ctx context.Context, query string, arg interface{}) (sql.Result, error)
}

// GetExt retrieves the ExtContext from the context if a transaction is active.
// Otherwise, it falls back to the provided sqlx.DB connection.
// Repositories should call this before executing queries.
func GetExt(ctx context.Context, defaultDB *sqlx.DB) ExtContext {
	if tx, ok := ctx.Value(txKey{}).(*sqlx.Tx); ok {
		return tx
	}
	return defaultDB
}
