package domain

import "time"

// OutboxEvent represents an event to be published atomically via the Transactional Outbox Pattern.
// keep: ID uses int64 for high-throughput outbox event table (bigint).
type OutboxEvent struct {
	ID            int64      `db:"id" json:"id"`
	AggregateType string     `db:"aggregate_type" json:"aggregate_type"`
	AggregateID   string     `db:"aggregate_id" json:"aggregate_id"`
	EventType     string     `db:"event_type" json:"event_type"`
	Payload       string     `db:"payload" json:"payload"`
	Status        string     `db:"status" json:"status"` // PENDING, PUBLISHED, FAILED
	RetryCount    int        `db:"retry_count" json:"retry_count"`
	CreatedAt     time.Time  `db:"created_at" json:"created_at"`
	PublishedAt   *time.Time `db:"published_at" json:"published_at"`
}
