package config

import (
	"context"
	"log"
	"os"
	"path/filepath"
	"strings"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/db"
	"google.golang.org/api/option"
)

var (
	// FirebaseApp holds the initialized Firebase Admin SDK application singleton.
	FirebaseApp *firebase.App

	// FirebaseDB holds the initialized Firebase Realtime Database client singleton.
	FirebaseDB *db.Client

	// IsFirebaseInitialized indicates whether Firebase RTDB was configured and connected at startup.
	IsFirebaseInitialized bool
)

// InitFirebase initializes the Firebase Admin SDK and Realtime Database client using AppConfig.
func InitFirebase() {
	credentialsPath := strings.TrimSpace(AppConfig.FirebaseCredentialsPath)
	if credentialsPath == "" {
		credentialsPath = strings.TrimSpace(os.Getenv("FIREBASE_CREDENTIALS_PATH"))
	}
	if credentialsPath == "" {
		log.Println("[FIREBASE] Warning: FIREBASE_CREDENTIALS_PATH not set in .env. Real-time signals will not be sent.")
		return
	}

	dbURL := strings.TrimSpace(AppConfig.FirebaseDBURL)
	if dbURL == "" {
		dbURL = strings.TrimSpace(os.Getenv("FIREBASE_DB_URL"))
	}
	if dbURL == "" {
		log.Println("[FIREBASE] Warning: FIREBASE_DB_URL not set in .env. Real-time signals will not be sent.")
		return
	}

	resolvedCredPath := resolveConfigFilePath(credentialsPath)

	ctx := context.Background()
	opt := option.WithCredentialsFile(resolvedCredPath)
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

// resolveConfigFilePath resolves a configuration file path safely across CWD and executable directory.
func resolveConfigFilePath(path string) string {
	if path == "" {
		return ""
	}
	cleanPath := filepath.Clean(path)
	if _, err := os.Stat(cleanPath); err == nil {
		return cleanPath
	}
	if execPath, err := os.Executable(); err == nil {
		candidate := filepath.Join(filepath.Dir(execPath), cleanPath)
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	return cleanPath
}
