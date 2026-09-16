package config

import (
	"context"
	"log"
	"os"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/db"
	"google.golang.org/api/option"
)

var (
	FirebaseApp           *firebase.App
	FirebaseDB            *db.Client
	IsFirebaseInitialized bool
)

// InitFirebase initializes the Firebase Admin SDK
func InitFirebase() {
	credentialsPath := os.Getenv("FIREBASE_CREDENTIALS_PATH")
	if credentialsPath == "" {
		log.Println("[FIREBASE] Warning: FIREBASE_CREDENTIALS_PATH not set in .env. Real-time signals will not be sent.")
		return
	}

	dbURL := os.Getenv("FIREBASE_DB_URL")
	if dbURL == "" {
		log.Println("[FIREBASE] Warning: FIREBASE_DB_URL not set in .env. Real-time signals will not be sent.")
		return
	}

	ctx := context.Background()
	opt := option.WithCredentialsFile(credentialsPath)
	conf := &firebase.Config{
		DatabaseURL: dbURL,
	}

	app, err := firebase.NewApp(ctx, conf, opt)
	if err != nil {
		log.Printf("[FIREBASE] Error initializing Admin SDK: %v\n", err)
		return
	}

	database, err := app.Database(ctx)
	if err != nil {
		log.Printf("[FIREBASE] Error initializing RTDB client: %v\n", err)
		return
	}

	FirebaseApp = app
	FirebaseDB = database
	IsFirebaseInitialized = true
	log.Println("[FIREBASE] Admin SDK initialized successfully.")
}
