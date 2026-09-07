package repository

import (
	"context"
	"fmt"
	"reflect"

	sq "github.com/Masterminds/squirrel"
	"github.com/jmoiron/sqlx"
)

// BaseRepository mendefinisikan kontrak standar untuk operasi CRUD dasar.
type BaseRepository[T any] interface {
	FindAll(ctx context.Context) ([]T, error)
	FindByID(ctx context.Context, id int) (*T, error)
	SoftDelete(ctx context.Context, db sqlx.ExtContext, id int) error
	Restore(ctx context.Context, db sqlx.ExtContext, id int) error
}

type baseRepository[T any] struct {
	db           *sqlx.DB
	tableName    string
	columns      []string
	hasDeletedAt bool
	hasIsActive  bool
}

// NewBaseRepository melakukan inisialisasi dan membaca tag db menggunakan reflection (satu kali).
func NewBaseRepository[T any](db *sqlx.DB, tableName string) BaseRepository[T] {
	var t T
	cols, hasDeletedAt, hasIsActive := extractDBColumns(reflect.TypeOf(t))

	return &baseRepository[T]{
		db:           db,
		tableName:    tableName,
		columns:      cols,
		hasDeletedAt: hasDeletedAt,
		hasIsActive:  hasIsActive,
	}
}

func extractDBColumns(t reflect.Type) ([]string, bool, bool) {
	if t.Kind() == reflect.Ptr {
		t = t.Elem()
	}

	var cols []string
	hasDeletedAt := false
	hasIsActive := false

	for i := 0; i < t.NumField(); i++ {
		field := t.Field(i)
		
		// Rekursi untuk Embedded Structs (contoh: BaseEntity)
		if field.Anonymous {
			subCols, subDel, subAct := extractDBColumns(field.Type)
			cols = append(cols, subCols...)
			hasDeletedAt = hasDeletedAt || subDel
			hasIsActive = hasIsActive || subAct
			continue
		}

		dbTag := field.Tag.Get("db")
		if dbTag != "" && dbTag != "-" {
			cols = append(cols, dbTag)
			if dbTag == "deleted_at" {
				hasDeletedAt = true
			}
			if dbTag == "is_active" {
				hasIsActive = true
			}
		}
	}
	return cols, hasDeletedAt, hasIsActive
}

func (r *baseRepository[T]) FindAll(ctx context.Context) ([]T, error) {
	builder := sq.Select(r.columns...).From(r.tableName)

	if r.hasDeletedAt {
		builder = builder.Where(sq.Expr("deleted_at IS NULL"))
	} else if r.hasIsActive {
		// Fallback untuk tabel yang hanya menggunakan is_active tanpa deleted_at (seperti users)
		builder = builder.Where(sq.Eq{"is_active": 1})
	}

	query, args, err := builder.ToSql()
	if err != nil {
		return nil, err
	}

	var results []T
	err = r.db.SelectContext(ctx, &results, query, args...)
	// Return empty slice instead of nil if no error but empty
	if err == nil && results == nil {
		results = []T{}
	}
	return results, err
}

func (r *baseRepository[T]) FindByID(ctx context.Context, id int) (*T, error) {
	builder := sq.Select(r.columns...).From(r.tableName).Where(sq.Eq{"id": id})

	if r.hasDeletedAt {
		builder = builder.Where(sq.Expr("deleted_at IS NULL"))
	}

	query, args, err := builder.ToSql()
	if err != nil {
		return nil, err
	}

	var result T
	err = r.db.GetContext(ctx, &result, query, args...)
	if err != nil {
		return nil, err
	}
	return &result, nil
}

func (r *baseRepository[T]) SoftDelete(ctx context.Context, db sqlx.ExtContext, id int) error {
	var query string
	if r.hasDeletedAt && r.hasIsActive {
		query = fmt.Sprintf("UPDATE %s SET deleted_at = NOW(), is_active = 0 WHERE id = ?", r.tableName)
	} else if r.hasDeletedAt {
		query = fmt.Sprintf("UPDATE %s SET deleted_at = NOW() WHERE id = ?", r.tableName)
	} else if r.hasIsActive {
		query = fmt.Sprintf("UPDATE %s SET is_active = 0 WHERE id = ?", r.tableName)
	} else {
		query = fmt.Sprintf("DELETE FROM %s WHERE id = ?", r.tableName)
	}

	_, err := db.ExecContext(ctx, query, id)
	return err
}

func (r *baseRepository[T]) Restore(ctx context.Context, db sqlx.ExtContext, id int) error {
	var query string
	if r.hasDeletedAt && r.hasIsActive {
		query = fmt.Sprintf("UPDATE %s SET deleted_at = NULL, is_active = 1 WHERE id = ?", r.tableName)
	} else if r.hasDeletedAt {
		query = fmt.Sprintf("UPDATE %s SET deleted_at = NULL WHERE id = ?", r.tableName)
	} else if r.hasIsActive {
		query = fmt.Sprintf("UPDATE %s SET is_active = 1 WHERE id = ?", r.tableName)
	} else {
		return fmt.Errorf("restore tidak didukung untuk tabel %s", r.tableName)
	}

	_, err := db.ExecContext(ctx, query, id)
	return err
}
