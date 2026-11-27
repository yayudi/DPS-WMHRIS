package eventbus

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/dps-wmhris/backend/internal/shared/config"
	amqp "github.com/rabbitmq/amqp091-go"
)

const retryFlushTimeout = 5 * time.Second

// amqpPublisher abstracts the subset of *amqp.Channel methods required for publishing,
// enabling deterministic unit testing of concurrency and reconnect logic without a live broker.
type amqpPublisher interface {
	IsClosed() bool
	Close() error
	PublishWithContext(ctx context.Context, exchange, key string, mandatory, immediate bool, msg amqp.Publishing) error
}

type rabbitMQEventBus struct {
	mu          sync.RWMutex
	retryWg     sync.WaitGroup
	conn        *amqp.Connection
	channel     *amqp.Channel
	pubChannel  amqpPublisher
	connectFunc func() error
	handlers    map[string]EventHandler
	url         string
	queueName   string
	dlxName     string
	dlqName     string
	maxRetries  int
	isClosed    bool
}

// NewRabbitMQEventBus initializes a RabbitMQ-backed EventBus with Dead-Letter Exchange (DLX) support.
func NewRabbitMQEventBus(url string, queueName string) (EventBus, error) {
	b := &rabbitMQEventBus{
		url:        url,
		queueName:  queueName,
		dlxName:    config.AppConfig.RabbitMQDLXExchangeName,
		dlqName:    config.AppConfig.RabbitMQDLQName,
		maxRetries: 3,
		handlers:   make(map[string]EventHandler),
	}
	b.connectFunc = b.connectAndSetupLocked

	if err := b.connectAndSetup(); err != nil {
		return nil, fmt.Errorf("failed to connect to RabbitMQ: %w", err)
	}

	return b, nil
}

func (b *rabbitMQEventBus) connectAndSetup() error {
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.connectFunc != nil {
		return b.connectFunc()
	}
	return b.connectAndSetupLocked()
}

func (b *rabbitMQEventBus) connectAndSetupLocked() error {
	if b.isClosed {
		return errors.New("event bus is closed")
	}

	if b.channel != nil && !b.channel.IsClosed() {
		_ = b.channel.Close()
	}
	if b.conn != nil && !b.conn.IsClosed() {
		_ = b.conn.Close()
	}

	conn, err := amqp.Dial(b.url)
	if err != nil {
		return fmt.Errorf("amqp dial failed: %w", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		_ = conn.Close()
		return fmt.Errorf("open channel failed: %w", err)
	}

	// 1. Declare Main Exchange
	err = ch.ExchangeDeclare(
		config.AppConfig.RabbitMQExchangeName,
		config.AppConfig.RabbitMQExchangeType,
		true,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		_ = ch.Close()
		_ = conn.Close()
		return fmt.Errorf("declare main exchange failed: %w", err)
	}

	// 2. Declare DLX Exchange & DLQ Queue
	if b.dlxName != "" {
		err = ch.ExchangeDeclare(
			b.dlxName,
			"topic",
			true,
			false,
			false,
			false,
			nil,
		)
		if err != nil {
			log.Printf("[RabbitMQ] Warning: declare DLX exchange failed: %v", err)
		} else if b.dlqName != "" {
			_, err = ch.QueueDeclare(
				b.dlqName,
				true,
				false,
				false,
				false,
				nil,
			)
			if err != nil {
				log.Printf("[RabbitMQ] Warning: declare DLQ queue failed: %v", err)
			} else {
				err = ch.QueueBind(
					b.dlqName,
					"#",
					b.dlxName,
					false,
					nil,
				)
				if err != nil {
					log.Printf("[RabbitMQ] Warning: bind DLQ failed: %v", err)
				}
			}
		}
	}

	b.conn = conn
	b.channel = ch
	b.pubChannel = ch
	return nil
}

func (b *rabbitMQEventBus) Publish(ctx context.Context, event Event) error {
	body, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}

	return b.publishMessage(ctx, event.Type, amqp.Publishing{
		ContentType: "application/json",
		Body:        body,
	})
}

// publishMessage serializes concurrent publish calls on the shared AMQP channel and lazily
// reconnects once if the channel was dropped while the bus is still active.
func (b *rabbitMQEventBus) publishMessage(ctx context.Context, routingKey string, msg amqp.Publishing) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.isClosed {
		return fmt.Errorf("failed to publish event %s: event bus is closed", routingKey)
	}

	if b.pubChannel == nil || b.pubChannel.IsClosed() {
		reconnect := b.connectAndSetupLocked
		if b.connectFunc != nil {
			// Allow test hook override when connectFunc is customized
			reconnect = b.connectFunc
		}
		if err := reconnect(); err != nil {
			return fmt.Errorf("failed to publish event %s: rabbitmq channel unavailable and reconnect failed: %w", routingKey, err)
		}
	}

	if b.pubChannel == nil || b.pubChannel.IsClosed() {
		return fmt.Errorf("failed to publish event %s: rabbitmq channel is not available", routingKey)
	}

	if err := b.pubChannel.PublishWithContext(
		ctx,
		config.AppConfig.RabbitMQExchangeName,
		routingKey,
		false,
		false,
		msg,
	); err != nil {
		return fmt.Errorf("failed to publish event %s: %w", routingKey, err)
	}

	return nil
}

func (b *rabbitMQEventBus) Subscribe(eventType string, handler EventHandler) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.handlers[eventType] = handler
	return nil
}

func (b *rabbitMQEventBus) Start(ctx context.Context) error {
	initialBackoff := 1 * time.Second
	maxBackoff := 30 * time.Second
	backoff := initialBackoff

	for {
		select {
		case <-ctx.Done():
			log.Printf("[RabbitMQ] Context cancelled, stopping supervisor")
			return b.Close()
		default:
		}

		b.mu.RLock()
		isConnected := b.conn != nil && !b.conn.IsClosed() && b.channel != nil && !b.channel.IsClosed()
		b.mu.RUnlock()

		if !isConnected {
			log.Printf("[RabbitMQ] Connecting to broker...")
			if err := b.connectAndSetup(); err != nil {
				log.Printf("[RabbitMQ] Connection failed: %v. Retrying in %v...", err, backoff)
				select {
				case <-ctx.Done():
					return b.Close()
				case <-time.After(backoff):
					backoff = min(backoff*2, maxBackoff)
					continue
				}
			}
			backoff = initialBackoff
			log.Printf("[RabbitMQ] Connected successfully")
		}

		// Bind all registered handlers & setup consumer
		consumerErr := b.setupAndConsume(ctx)
		if consumerErr != nil {
			log.Printf("[RabbitMQ] Consumer stopped or failed: %v. Reconnecting in %v...", consumerErr, backoff)
			select {
			case <-ctx.Done():
				return b.Close()
			case <-time.After(backoff):
				backoff = min(backoff*2, maxBackoff)
			}
		}
	}
}

func (b *rabbitMQEventBus) setupAndConsume(ctx context.Context) error {
	b.mu.Lock()
	ch := b.channel
	conn := b.conn
	if ch == nil || ch.IsClosed() || conn == nil || conn.IsClosed() {
		b.mu.Unlock()
		return errors.New("channel or connection closed")
	}

	// Declare main queue with DLX args if configured
	queueArgs := amqp.Table{}
	if b.dlxName != "" {
		queueArgs["x-dead-letter-exchange"] = b.dlxName
	}

	q, err := ch.QueueDeclare(
		b.queueName,
		true,
		false,
		false,
		false,
		queueArgs,
	)
	if err != nil {
		log.Printf("[RabbitMQ] Notice: queue declare with DLX args failed: %v. Retrying without args...", err)
		_ = ch.Close()
		newCh, chErr := conn.Channel()
		if chErr != nil {
			b.mu.Unlock()
			return fmt.Errorf("reopen channel failed: %w", chErr)
		}
		b.channel = newCh
		b.pubChannel = newCh
		ch = newCh

		q, err = ch.QueueDeclare(b.queueName, true, false, false, false, nil)
		if err != nil {
			b.mu.Unlock()
			return fmt.Errorf("declare queue without args failed: %w", err)
		}
	}

	// Bind queue for all registered handlers
	handlersCopy := make(map[string]EventHandler, len(b.handlers))
	for k, v := range b.handlers {
		handlersCopy[k] = v
	}

	for eventType := range handlersCopy {
		err = ch.QueueBind(
			q.Name,
			eventType,
			config.AppConfig.RabbitMQExchangeName,
			false,
			nil,
		)
		if err != nil {
			b.mu.Unlock()
			return fmt.Errorf("bind queue for %s failed: %w", eventType, err)
		}
	}

	err = ch.Qos(
		config.AppConfig.RabbitMQPrefetchCount,
		config.AppConfig.RabbitMQPrefetchSize,
		false,
	)
	if err != nil {
		b.mu.Unlock()
		return fmt.Errorf("set QoS failed: %w", err)
	}

	msgs, err := ch.Consume(
		q.Name,
		"",
		false,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		b.mu.Unlock()
		return fmt.Errorf("register consumer failed: %w", err)
	}

	closeChan := make(chan *amqp.Error, 1)
	ch.NotifyClose(closeChan)
	connCloseChan := make(chan *amqp.Error, 1)
	conn.NotifyClose(connCloseChan)
	b.mu.Unlock()

	log.Printf("[RabbitMQ] Started consuming on queue %s", q.Name)

	for {
		select {
		case <-ctx.Done():
			return nil
		case err, ok := <-closeChan:
			if !ok || err == nil {
				return errors.New("channel closed")
			}
			return fmt.Errorf("channel error: %w", err)
		case err, ok := <-connCloseChan:
			if !ok || err == nil {
				return errors.New("connection closed")
			}
			return fmt.Errorf("connection error: %w", err)
		case d, ok := <-msgs:
			if !ok {
				return errors.New("msgs channel closed")
			}

			var event Event
			if err := json.Unmarshal(d.Body, &event); err != nil {
				log.Printf("[RabbitMQ] Unmarshal error: %v. Rejecting to DLQ.", err)
				_ = d.Nack(false, false)
				continue
			}

			handler, exists := handlersCopy[event.Type]
			if !exists {
				log.Printf("[RabbitMQ] No handler registered for %s, acking", event.Type)
				_ = d.Ack(false)
				continue
			}

			retryCount := getRetryCount(d.Headers)

			if err := handler(ctx, event); err != nil {
				log.Printf("[RabbitMQ] Handler error for %s (retry %d/%d): %v", event.Type, retryCount, b.maxRetries, err)
				if retryCount >= b.maxRetries {
					log.Printf("[RabbitMQ] Max retries reached for %s. Nacking to DLQ.", event.Type)
					_ = d.Nack(false, false)
				} else {
					b.retryWg.Add(1)
					go b.republishWithDelay(ctx, event, d.Headers, retryCount+1)
					_ = d.Ack(false)
				}
			} else {
				_ = d.Ack(false)
			}
		}
	}
}

func (b *rabbitMQEventBus) republishWithDelay(ctx context.Context, event Event, headers amqp.Table, nextRetry int) {
	defer b.retryWg.Done()

	delay := time.Duration(1<<uint(nextRetry-1)) * time.Second
	if delay > 30*time.Second {
		delay = 30 * time.Second
	}

	timer := time.NewTimer(delay)
	select {
	case <-ctx.Done():
		timer.Stop()
		log.Printf("[RabbitMQ] Shutdown detected during retry backoff for %s; flushing retry %d immediately", event.Type, nextRetry)
	case <-timer.C:
	}

	body, err := json.Marshal(event)
	if err != nil {
		return
	}

	newHeaders := amqp.Table{}
	for k, v := range headers {
		newHeaders[k] = v
	}
	newHeaders["x-retry-count"] = nextRetry

	pubCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), retryFlushTimeout)
	defer cancel()

	if err := b.publishMessage(pubCtx, event.Type, amqp.Publishing{
		ContentType: "application/json",
		Headers:     newHeaders,
		Body:        body,
	}); err != nil {
		log.Printf("[RabbitMQ] Failed to republish retry %d for %s: %v", nextRetry, event.Type, err)
	}
}

func getRetryCount(headers amqp.Table) int {
	if headers == nil {
		return 0
	}
	val, ok := headers["x-retry-count"]
	if !ok {
		return 0
	}
	switch v := val.(type) {
	case int:
		return v
	case int32:
		return int(v)
	case int64:
		return int(v)
	case float64:
		return int(v)
	default:
		return 0
	}
}

func (b *rabbitMQEventBus) Close() error {
	// Wait for any in-flight retry republishes to flush before closing the AMQP channel.
	b.retryWg.Wait()

	b.mu.Lock()
	defer b.mu.Unlock()
	b.isClosed = true

	var errCh, errConn error
	if b.channel != nil && !b.channel.IsClosed() {
		errCh = b.channel.Close()
	}
	if b.conn != nil && !b.conn.IsClosed() {
		errConn = b.conn.Close()
	}
	if errCh != nil {
		return errCh
	}
	return errConn
}
