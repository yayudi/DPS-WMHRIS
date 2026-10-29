package eventbus

import (
	"testing"

	amqp "github.com/rabbitmq/amqp091-go"
)

func TestGetRetryCount(t *testing.T) {
	tests := []struct {
		name     string
		headers  amqp.Table
		expected int
	}{
		{
			name:     "Nil headers",
			headers:  nil,
			expected: 0,
		},
		{
			name:     "Missing retry count header",
			headers:  amqp.Table{"other-header": "test"},
			expected: 0,
		},
		{
			name:     "Int retry count",
			headers:  amqp.Table{"x-retry-count": 2},
			expected: 2,
		},
		{
			name:     "Int32 retry count",
			headers:  amqp.Table{"x-retry-count": int32(3)},
			expected: 3,
		},
		{
			name:     "Int64 retry count",
			headers:  amqp.Table{"x-retry-count": int64(4)},
			expected: 4,
		},
		{
			name:     "Float64 retry count",
			headers:  amqp.Table{"x-retry-count": float64(5)},
			expected: 5,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := getRetryCount(tc.headers)
			if got != tc.expected {
				t.Errorf("getRetryCount() = %d, expected %d", got, tc.expected)
			}
		})
	}
}
