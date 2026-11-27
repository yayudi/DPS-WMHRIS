package database

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/jmoiron/sqlx"
)

type fakeTxTracker struct {
	begins    int32
	commits   int32
	rollbacks int32
}

type fakeDriver struct {
	tracker *fakeTxTracker
}

type fakeConn struct {
	tracker *fakeTxTracker
}

type fakeTx struct {
	tracker *fakeTxTracker
}

func (d *fakeDriver) Open(name string) (driver.Conn, error) {
	return &fakeConn{tracker: d.tracker}, nil
}

func (c *fakeConn) Prepare(query string) (driver.Stmt, error) { return nil, errors.New("not implemented") }
func (c *fakeConn) Close() error                              { return nil }
func (c *fakeConn) Begin() (driver.Tx, error) {
	atomic.AddInt32(&c.tracker.begins, 1)
	return &fakeTx{tracker: c.tracker}, nil
}

func (tx *fakeTx) Commit() error {
	atomic.AddInt32(&tx.tracker.commits, 1)
	return nil
}

func (tx *fakeTx) Rollback() error {
	atomic.AddInt32(&tx.tracker.rollbacks, 1)
	return nil
}

var (
	registerFakeDriverOnce sync.Once
	sharedFakeTracker      = &fakeTxTracker{}
)

func openFakeSqlxDB(t *testing.T) (*sqlx.DB, *fakeTxTracker) {
	t.Helper()
	registerFakeDriverOnce.Do(func() {
		sql.Register("fake_tx_driver", &fakeDriver{tracker: sharedFakeTracker})
	})
	atomic.StoreInt32(&sharedFakeTracker.begins, 0)
	atomic.StoreInt32(&sharedFakeTracker.commits, 0)
	atomic.StoreInt32(&sharedFakeTracker.rollbacks, 0)

	rawDB, err := sql.Open("fake_tx_driver", "test")
	if err != nil {
		t.Fatalf("failed to open fake driver: %v", err)
	}
	t.Cleanup(func() { _ = rawDB.Close() })
	return sqlx.NewDb(rawDB, "mysql"), sharedFakeTracker
}

func TestWithTransaction_CommitRollbackAndNestedReuse(t *testing.T) {
	t.Run("commits once and reuses active transaction on nested WithTransaction calls", func(t *testing.T) {
		db, tracker := openFakeSqlxDB(t)
		tm := NewTransactionManager(db)

		err := tm.WithTransaction(context.Background(), func(outerCtx context.Context) error {
			outerExt := GetExt(outerCtx, db)
			if outerExt == db {
				t.Fatal("expected GetExt to return active transaction, not defaultDB")
			}

			// Nested WithTransaction must reuse outer transaction without calling Begin again
			return tm.WithTransaction(outerCtx, func(innerCtx context.Context) error {
				innerExt := GetExt(innerCtx, db)
				if innerExt != outerExt {
					t.Fatal("expected nested WithTransaction to reuse the exact same ExtContext")
				}
				return nil
			})
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if got := atomic.LoadInt32(&tracker.begins); got != 1 {
			t.Errorf("expected 1 Begin call for nested transaction, got %d", got)
		}
		if got := atomic.LoadInt32(&tracker.commits); got != 1 {
			t.Errorf("expected 1 Commit call, got %d", got)
		}
		if got := atomic.LoadInt32(&tracker.rollbacks); got != 0 {
			t.Errorf("expected 0 Rollback calls, got %d", got)
		}
	})

	t.Run("rolls back outer transaction when nested WithTransaction returns error", func(t *testing.T) {
		db, tracker := openFakeSqlxDB(t)
		tm := NewTransactionManager(db)

		expectedErr := errors.New("inner stock deduction failed")
		err := tm.WithTransaction(context.Background(), func(outerCtx context.Context) error {
			return tm.WithTransaction(outerCtx, func(innerCtx context.Context) error {
				return expectedErr
			})
		})
		if !errors.Is(err, expectedErr) {
			t.Fatalf("expected error %v, got %v", expectedErr, err)
		}

		if got := atomic.LoadInt32(&tracker.begins); got != 1 {
			t.Errorf("expected 1 Begin call, got %d", got)
		}
		if got := atomic.LoadInt32(&tracker.commits); got != 0 {
			t.Errorf("expected 0 Commit calls, got %d", got)
		}
		if got := atomic.LoadInt32(&tracker.rollbacks); got != 1 {
			t.Errorf("expected 1 Rollback call, got %d", got)
		}
	})

	t.Run("rolls back transaction and re-panics on panic", func(t *testing.T) {
		db, tracker := openFakeSqlxDB(t)
		tm := NewTransactionManager(db)

		defer func() {
			if r := recover(); r == nil {
				t.Fatal("expected panic to propagate after rollback")
			}
			if got := atomic.LoadInt32(&tracker.rollbacks); got != 1 {
				t.Errorf("expected 1 Rollback call on panic, got %d", got)
			}
			if got := atomic.LoadInt32(&tracker.commits); got != 0 {
				t.Errorf("expected 0 Commit calls on panic, got %d", got)
			}
		}()

		_ = tm.WithTransaction(context.Background(), func(ctx context.Context) error {
			panic("unexpected domain invariant failure")
		})
	})
}
