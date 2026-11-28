package mysql

import (
	"context"
	"time"

	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

type outboxRepositoryImpl struct {
	db *sqlx.DB
}

// NewOutboxRepository creates a MySQL-backed OutboxRepository.
func NewOutboxRepository(db *sqlx.DB) inventory_port.OutboxRepository {
	return &outboxRepositoryImpl{db: db}
}

// SaveTx persists a new outbox event inside the active transaction.
func (r *outboxRepositoryImpl) SaveTx(ctx context.Context, event *domain.OutboxEvent) error {
	ext := database.GetExt(ctx, r.db)
	if event.Status == "" {
		event.Status = domain.OutboxStatusPending
	}
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

// GetPendingEvents fetches up to limit pending outbox events below the retry ceiling in FIFO order.
func (r *outboxRepositoryImpl) GetPendingEvents(ctx context.Context, limit int) ([]domain.OutboxEvent, error) {
	if limit <= 0 {
		limit = 50
	}
	ext := database.GetExt(ctx, r.db)
	query := `
		SELECT id, aggregate_type, aggregate_id, event_type, payload, status, retry_count, created_at, published_at
		FROM outbox_events
		WHERE status = ? AND retry_count < ?
		ORDER BY id ASC
		LIMIT ?
	`
	events := make([]domain.OutboxEvent, 0)
	if err := ext.SelectContext(ctx, &events, query, domain.OutboxStatusPending, domain.OutboxMaxRetries, limit); err != nil {
		return nil, err
	}
	if events == nil {
		return []domain.OutboxEvent{}, nil
	}
	return events, nil
}

// MarkAsPublished transitions an outbox event to PUBLISHED and records the publication timestamp.
func (r *outboxRepositoryImpl) MarkAsPublished(ctx context.Context, id int64) error {
	ext := database.GetExt(ctx, r.db)
	query := `UPDATE outbox_events SET status = ?, published_at = ? WHERE id = ?`
	_, err := ext.ExecContext(ctx, query, domain.OutboxStatusPublished, time.Now(), id)
	return err
}

// IncrementRetry increments retry_count and transitions the event to FAILED once OutboxMaxRetries is reached.
func (r *outboxRepositoryImpl) IncrementRetry(ctx context.Context, id int64) error {
	ext := database.GetExt(ctx, r.db)
	query := `
		UPDATE outbox_events
		SET status = CASE WHEN retry_count + 1 >= ? THEN ? ELSE status END,
		    retry_count = retry_count + 1
		WHERE id = ?`
	_, err := ext.ExecContext(ctx, query, domain.OutboxMaxRetries, domain.OutboxStatusFailed, id)
	return err
}
