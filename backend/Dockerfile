FROM golang:1.25-alpine AS builder

WORKDIR /app

# Copy file go.mod dan go.sum
COPY go.mod go.sum ./
RUN go mod download

# Copy seluruh source code
COPY . .

# Build aplikasi (di dalam docker ini OS-nya otomatis linux)
# Penamaan output di linux biasanya tidak memakai .exe
RUN GOOS=linux GOARCH=amd64 go build -o bin/api ./cmd/api
RUN GOOS=linux GOARCH=amd64 go build -o bin/worker ./cmd/worker

# (Opsional) Tahap kedua untuk image yang lebih kecil
FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/bin/api .
COPY --from=builder /app/bin/worker .

EXPOSE 3000
CMD ["./api"]