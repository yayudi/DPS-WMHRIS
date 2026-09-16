package config

import (
	"context"
	"fmt"
	"os"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

var R2Client *s3.Client
var R2PresignClient *s3.PresignClient

func InitR2() error {
	endpoint := os.Getenv("R2_ENDPOINT")
	accessKey := os.Getenv("R2_ACCESS_KEY_ID")
	secretKey := os.Getenv("R2_SECRET_ACCESS_KEY")

	if endpoint == "" || accessKey == "" || secretKey == "" {
		fmt.Println("Warning: R2 credentials (ENDPOINT, ACCESS_KEY, SECRET_KEY) missing in .env. R2 Uploads will fail.")
		return nil
	}

	r2Resolver := aws.EndpointResolverWithOptionsFunc(func(service, region string, options ...interface{}) (aws.Endpoint, error) {
		return aws.Endpoint{
			URL: endpoint,
		}, nil
	})

	cfg, err := config.LoadDefaultConfig(context.TODO(),
		config.WithEndpointResolverWithOptions(r2Resolver),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKey, secretKey, "")),
		config.WithRegion("auto"), // R2 uses auto
	)
	if err != nil {
		return fmt.Errorf("failed to load R2 config: %w", err)
	}

	R2Client = s3.NewFromConfig(cfg)
	R2PresignClient = s3.NewPresignClient(R2Client)

	fmt.Println("R2 Client Initialized")
	return nil
}
