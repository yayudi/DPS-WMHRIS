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

type rabbitMQEventBus struct {
	mu         sync.RWMutex
	conn       *amqp.Connection
	channel    *amqp.Channel
	handlers   map[string]EventHandler
	url        string
	queueName  string
	dlxName    string
	dlqName    string
	maxRetries int
	isClosed   bool
}

func NewRabbitMQEventBus(url string, queueName string) (EventBus, error) {
	b := &rabbitMQEventBus{
		url:        url,
		queueName:  queueName,
		dlxName:    config.AppConfig.RabbitMQDLXExchangeName,
		dlqName:    config.AppConfig.RabbitMQDLQName,
		maxRetries: 3,
		handlers:   make(map[string]EventHandler),
	}

	if err := b.connectAndSetup(); err != nil {
		return nil, fmt.Errorf("failed to connect to RabbitMQ: %w", err)
	}

	return b, nil
}

func (b *rabbitMQEventBus) connectAndSetup() error {
	b.mu.Lock()
	defer b.mu.Unlock()

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
	return nil
}

func (b *rabbitMQEventBus) Publish(ctx context.Context, event Event) error {
	b.mu.RLock()
	ch := b.channel
	b.mu.RUnlock()

	if ch == nil || ch.IsClosed() {
		return fmt.Errorf("failed to publish event %s: rabbitmq channel is not available", event.Type)
	}

	body, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}

	err = ch.PublishWithContext(ctx,
		config.AppConfig.RabbitMQExchangeName,
		event.Type,
		false,
		false,
		amqp.Publishing{
			ContentType: "application/json",
			Body:        body,
		},
	)
	if err != nil {
		return fmt.Errorf("failed to publish event %s: %w", event.Type, err)
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
	b.mu.Unlock()

	if ch == nil || ch.IsClosed() || conn == nil || conn.IsClosed() {
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
		b.mu.Lock()
		newCh, chErr := conn.Channel()
		if chErr != nil {
			b.mu.Unlock()
			return fmt.Errorf("reopen channel failed: %w", chErr)
		}
		b.channel = newCh
		ch = newCh
		b.mu.Unlock()

		q, err = ch.QueueDeclare(b.queueName, true, false, false, false, nil)
		if err != nil {
			return fmt.Errorf("declare queue without args failed: %w", err)
		}
	}

	// Bind queue for all registered handlers
	b.mu.RLock()
	handlersCopy := make(map[string]EventHandler, len(b.handlers))
	for k, v := range b.handlers {
		handlersCopy[k] = v
	}
	b.mu.RUnlock()

	for eventType := range handlersCopy {
		err = ch.QueueBind(
			q.Name,
			eventType,
			config.AppConfig.RabbitMQExchangeName,
			false,
			nil,
		)
		if err != nil {
			return fmt.Errorf("bind queue for %s failed: %w", eventType, err)
		}
	}

	err = ch.Qos(
		config.AppConfig.RabbitMQPrefetchCount,
		config.AppConfig.RabbitMQPrefetchSize,
		false,
	)
	if err != nil {
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
		return fmt.Errorf("register consumer failed: %w", err)
	}

	log.Printf("[RabbitMQ] Started consuming on queue %s", q.Name)

	closeChan := make(chan *amqp.Error, 1)
	ch.NotifyClose(closeChan)
	connCloseChan := make(chan *amqp.Error, 1)
	conn.NotifyClose(connCloseChan)

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

			if err := handler(context.Background(), event); err != nil {
				log.Printf("[RabbitMQ] Handler error for %s (retry %d/%d): %v", event.Type, retryCount, b.maxRetries, err)
				if retryCount >= b.maxRetries {
					log.Printf("[RabbitMQ] Max retries reached for %s. Nacking to DLQ.", event.Type)
					_ = d.Nack(false, false)
				} else {
					go b.republishWithDelay(event, d.Headers, retryCount+1)
					_ = d.Ack(false)
				}
			} else {
				_ = d.Ack(false)
			}
		}
	}
}

func (b *rabbitMQEventBus) republishWithDelay(event Event, headers amqp.Table, nextRetry int) {
	delay := time.Duration(1<<uint(nextRetry-1)) * time.Second
	if delay > 30*time.Second {
		delay = 30 * time.Second
	}
	time.Sleep(delay)

	b.mu.RLock()
	ch := b.channel
	b.mu.RUnlock()

	if ch == nil || ch.IsClosed() {
		log.Printf("[RabbitMQ] Cannot republish retry %d for %s: channel closed", nextRetry, event.Type)
		return
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

	err = ch.PublishWithContext(context.Background(),
		config.AppConfig.RabbitMQExchangeName,
		event.Type,
		false,
		false,
		amqp.Publishing{
			ContentType: "application/json",
			Headers:     newHeaders,
			Body:        body,
		},
	)
	if err != nil {
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
