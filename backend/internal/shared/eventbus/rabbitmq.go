package eventbus

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	amqp "github.com/rabbitmq/amqp091-go"
)

const ExchangeName = "dps.wmhris.events"

type rabbitMQEventBus struct {
	conn      *amqp.Connection
	channel   *amqp.Channel
	handlers  map[string]EventHandler
	url       string
	queueName string
}

func NewRabbitMQEventBus(url string, queueName string) (EventBus, error) {
	conn, err := amqp.Dial(url)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to RabbitMQ: %w", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		return nil, fmt.Errorf("failed to open a channel: %w", err)
	}

	err = ch.ExchangeDeclare(
		ExchangeName, // name
		"topic",      // type
		true,         // durable
		false,        // auto-deleted
		false,        // internal
		false,        // no-wait
		nil,          // arguments
	)
	if err != nil {
		return nil, fmt.Errorf("failed to declare an exchange: %w", err)
	}

	return &rabbitMQEventBus{
		conn:      conn,
		channel:   ch,
		handlers:  make(map[string]EventHandler),
		url:       url,
		queueName: queueName, // e.g. "queue.system.log"
	}, nil
}

func (b *rabbitMQEventBus) Publish(ctx context.Context, event Event) error {
	body, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}

	err = b.channel.PublishWithContext(ctx,
		ExchangeName, // exchange
		event.Type,   // routing key
		false,        // mandatory
		false,        // immediate
		amqp.Publishing{
			ContentType: "application/json",
			Body:        body,
		})
	if err != nil {
		return fmt.Errorf("failed to publish event %s: %w", event.Type, err)
	}

	return nil
}

func (b *rabbitMQEventBus) Subscribe(eventType string, handler EventHandler) error {
	b.handlers[eventType] = handler
	return nil
}

func (b *rabbitMQEventBus) Start(ctx context.Context) error {
	q, err := b.channel.QueueDeclare(
		b.queueName, // name
		true,        // durable
		false,       // delete when unused
		false,       // exclusive
		false,       // no-wait
		nil,         // arguments
	)
	if err != nil {
		return fmt.Errorf("failed to declare a queue: %w", err)
	}

	// Bind the queue to the exchange for all registered event types
	for eventType := range b.handlers {
		err = b.channel.QueueBind(
			q.Name,       // queue name
			eventType,    // routing key
			ExchangeName, // exchange
			false,
			nil,
		)
		if err != nil {
			return fmt.Errorf("failed to bind queue to exchange for routing key %s: %w", eventType, err)
		}
	}

	msgs, err := b.channel.Consume(
		q.Name, // queue
		"",     // consumer
		false,  // auto-ack (set false for manual ack)
		false,  // exclusive
		false,  // no-local
		false,  // no-wait
		nil,    // args
	)
	if err != nil {
		return fmt.Errorf("failed to register a consumer: %w", err)
	}

	log.Printf("[RabbitMQ] Started consuming on queue %s", b.queueName)

	go func() {
		for {
			select {
			case <-ctx.Done():
				log.Printf("[RabbitMQ] Context cancelled, stopping consumer")
				return
			case d, ok := <-msgs:
				if !ok {
					log.Printf("[RabbitMQ] Channel closed")
					return
				}

				var event Event
				if err := json.Unmarshal(d.Body, &event); err != nil {
					log.Printf("[RabbitMQ] Error unmarshaling event: %v", err)
					d.Nack(false, false) // reject without requeue
					continue
				}

				if handler, exists := b.handlers[event.Type]; exists {
					// Handle the event
					err := handler(context.Background(), event)
					if err != nil {
						log.Printf("[RabbitMQ] Handler error for event %s: %v", event.Type, err)
						d.Nack(false, true) // requeue if handler failed
					} else {
						d.Ack(false)
					}
				} else {
					log.Printf("[RabbitMQ] No handler registered for event type %s", event.Type)
					d.Ack(false) // ack it since we don't care about it
				}
			}
		}
	}()

	return nil
}

func (b *rabbitMQEventBus) Close() error {
	b.channel.Close()
	return b.conn.Close()
}
