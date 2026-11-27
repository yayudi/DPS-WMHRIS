package config

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// R2Client is the shared Cloudflare R2 S3-compatible client singleton.
var R2Client *s3.Client

// R2PresignClient is the shared Cloudflare R2 presigned URL generator singleton.
var R2PresignClient *s3.PresignClient

// InitR2 initializes the Cloudflare R2 S3 client and presign client using AppConfig (or environment fallback).
func InitR2() error {
	endpoint := strings.TrimSpace(AppConfig.R2Endpoint)
	if endpoint == "" {
		endpoint = strings.TrimSpace(os.Getenv("R2_ENDPOINT"))
	}
	accessKey := strings.TrimSpace(AppConfig.R2AccessKeyID)
	if accessKey == "" {
		accessKey = strings.TrimSpace(os.Getenv("R2_ACCESS_KEY_ID"))
	}
	secretKey := strings.TrimSpace(AppConfig.R2SecretAccessKey)
	if secretKey == "" {
		secretKey = strings.TrimSpace(os.Getenv("R2_SECRET_ACCESS_KEY"))
	}

	if endpoint == "" || accessKey == "" || secretKey == "" {
		log.Println("[R2] Warning: R2 credentials (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) missing in .env. R2 uploads will fail.")
		return nil
	}

	r2Resolver := aws.EndpointResolverWithOptionsFunc(func(service, region string, options ...any) (aws.Endpoint, error) {
		return aws.Endpoint{
			URL: endpoint,
		}, nil
	})

	cfg, err := awsconfig.LoadDefaultConfig(context.Background(),
		awsconfig.WithEndpointResolverWithOptions(r2Resolver),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKey, secretKey, "")),
		awsconfig.WithRegion("auto"),
	)
	if err != nil {
		return fmt.Errorf("failed to load R2 config: %w", err)
	}

	R2Client = s3.NewFromConfig(cfg)
	R2PresignClient = s3.NewPresignClient(R2Client)

	log.Println("[R2] Client initialized successfully.")
	return nil
}
