package mysql

import (
	"context"
	"time"

	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	database "github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

type outboxRepositoryImpl struct {
	db *sqlx.DB
}

func NewOutboxRepository(db *sqlx.DB) inventory_port.OutboxRepository {
	return &outboxRepositoryImpl{db: db}
}

func (r *outboxRepositoryImpl) SaveTx(ctx context.Context, event *domain.OutboxEvent) error {
	ext := database.GetExt(ctx, r.db)
	query := `
		INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status, retry_count, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`
	res, err := ext.ExecContext(ctx, query,
		event.AggregateType,
		event.AggregateID,
		event.EventType,
		event.Payload,
		event.Status,
		event.RetryCount,
		event.CreatedAt,
	)
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	event.ID = id
	return nil
}

func (r *outboxRepositoryImpl) GetPendingEvents(ctx context.Context, limit int) ([]domain.OutboxEvent, error) {
	ext := database.GetExt(ctx, r.db)
	query := `
		SELECT id, aggregate_type, aggregate_id, event_type, payload, status, retry_count, created_at, published_at
		FROM outbox_events
		WHERE status = 'PENDING'
		ORDER BY id ASC
		LIMIT ?
	`
	var events []domain.OutboxEvent
	err := ext.SelectContext(ctx, &events, query, limit)
	if err != nil {
		return nil, err
	}
	return events, nil
}

func (r *outboxRepositoryImpl) MarkAsPublished(ctx context.Context, id int64) error {
	ext := database.GetExt(ctx, r.db)
	query := `UPDATE outbox_events SET status = 'PUBLISHED', published_at = ? WHERE id = ?`
	_, err := ext.ExecContext(ctx, query, time.Now(), id)
	return err
}

func (r *outboxRepositoryImpl) IncrementRetry(ctx context.Context, id int64) error {
	ext := database.GetExt(ctx, r.db)
	query := `UPDATE outbox_events SET retry_count = retry_count + 1 WHERE id = ?`
	_, err := ext.ExecContext(ctx, query, id)
	return err
}
