// Package erp implements outbound HTTP clients for external ERP integrations such as Kelja.id.
package erp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/config"
)

type keljaClient struct {
	baseURL    string
	username   string
	password   string
	httpClient *http.Client

	tokenMutex sync.RWMutex
	token      string
	tokenExp   time.Time
}

// NewKeljaClient initializes an HTTP client for the Kelja ERP API using AppConfig settings.
func NewKeljaClient() inventory_port.KeljaClient {
	return newKeljaClientWithConfig(
		config.AppConfig.KeljaApiURL,
		config.AppConfig.KeljaApiUsername,
		config.AppConfig.KeljaApiPass,
		&http.Client{Timeout: 15 * time.Second},
	)
}

func newKeljaClientWithConfig(baseURL, username, password string, httpClient *http.Client) *keljaClient {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 15 * time.Second}
	}
	return &keljaClient{
		baseURL:    strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		username:   strings.TrimSpace(username),
		password:   password,
		httpClient: httpClient,
	}
}

func (c *keljaClient) isConfigured() bool {
	return c.baseURL != "" && c.username != "" && c.password != ""
}

func (c *keljaClient) invalidateToken(staleToken string) {
	c.tokenMutex.Lock()
	defer c.tokenMutex.Unlock()
	if c.token == staleToken {
		c.token = ""
		c.tokenExp = time.Time{}
	}
}

func drainAndClose(body io.ReadCloser) {
	if body == nil {
		return
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(body, 4096))
	_ = body.Close()
}

func (c *keljaClient) getToken(ctx context.Context) (string, error) {
	if !c.isConfigured() {
		return "", fmt.Errorf("kelja api url or credentials not configured")
	}

	c.tokenMutex.RLock()
	if c.token != "" && time.Now().Before(c.tokenExp.Add(-5*time.Minute)) {
		tok := c.token
		c.tokenMutex.RUnlock()
		return tok, nil
	}
	c.tokenMutex.RUnlock()

	c.tokenMutex.Lock()
	defer c.tokenMutex.Unlock()

	if c.token != "" && time.Now().Before(c.tokenExp.Add(-5*time.Minute)) {
		return c.token, nil
	}

	payload := map[string]string{
		"email":    c.username,
		"password": c.password,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("failed to marshal kelja login payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s/auth/login", c.baseURL), bytes.NewBuffer(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer drainAndClose(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("kelja auth login failed with status %d", resp.StatusCode)
	}

	var res struct {
		Data struct {
			Token string `json:"access_token"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return "", err
	}
	if res.Data.Token == "" {
		return "", fmt.Errorf("empty token returned from kelja login")
	}

	c.token = res.Data.Token
	c.tokenExp = time.Now().Add(1 * time.Hour)
	return c.token, nil
}

// doAuthenticatedGet executes a GET request with bearer token auth, invalidating and retrying once on 401 Unauthorized.
func (c *keljaClient) doAuthenticatedGet(ctx context.Context, url string) (*http.Response, error) {
	for attempt := 0; attempt < 2; attempt++ {
		token, err := c.getToken(ctx)
		if err != nil {
			return nil, fmt.Errorf("kelja auth: %w", err)
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Accept", "application/json")

		resp, err := c.httpClient.Do(req)
		if err != nil {
			return nil, err
		}

		if resp.StatusCode == http.StatusUnauthorized && attempt == 0 {
			drainAndClose(resp.Body)
			c.invalidateToken(token)
			continue
		}
		return resp, nil
	}
	return nil, fmt.Errorf("kelja request failed after token refresh retry")
}

// FetchRecentFulfillments retrieves a page of recent fulfillment summaries from Kelja ERP.
func (c *keljaClient) FetchRecentFulfillments(ctx context.Context, page int, perPage int) ([]domain.KeljaFulfillmentSummary, error) {
	if !c.isConfigured() {
		return []domain.KeljaFulfillmentSummary{}, nil
	}
	if page <= 0 {
		page = 1
	}
	if perPage <= 0 {
		perPage = 50
	}

	url := fmt.Sprintf("%s/fulfillment?page=%d&per_page=%d&sort_by=created_at&sort=desc", c.baseURL, page, perPage)
	resp, err := c.doAuthenticatedGet(ctx, url)
	if err != nil {
		return nil, err
	}
	defer drainAndClose(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetch fulfillments returned status %d", resp.StatusCode)
	}

	var res struct {
		Data []struct {
			ID                int    `json:"id"`
			Code              string `json:"code"`
			FulfillmentStatus struct {
				Description string `json:"description"`
			} `json:"fulfillment_status"`
			WarehouseCode string `json:"warehouse_code"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return nil, err
	}

	list := make([]domain.KeljaFulfillmentSummary, 0, len(res.Data))
	for _, item := range res.Data {
		list = append(list, domain.KeljaFulfillmentSummary{
			ID:            item.ID,
			Code:          item.Code,
			Status:        item.FulfillmentStatus.Description,
			WarehouseCode: item.WarehouseCode,
		})
	}

	return list, nil
}

// FetchFulfillmentDetail retrieves line-item details for a single Kelja fulfillment order ID.
func (c *keljaClient) FetchFulfillmentDetail(ctx context.Context, fulfillmentID int) (*domain.KeljaFulfillmentDetail, error) {
	if !c.isConfigured() {
		return nil, fmt.Errorf("kelja api url or credentials not configured")
	}
	if fulfillmentID <= 0 {
		return nil, fmt.Errorf("invalid fulfillment id: %d", fulfillmentID)
	}

	url := fmt.Sprintf("%s/fulfillment/%d", c.baseURL, fulfillmentID)
	resp, err := c.doAuthenticatedGet(ctx, url)
	if err != nil {
		return nil, err
	}
	defer drainAndClose(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("detail returned status %d", resp.StatusCode)
	}

	var res struct {
		Data struct {
			ID               int    `json:"id"`
			Code             string `json:"code"`
			TransactionItems []struct {
				Qty     int `json:"qty"`
				Product struct {
					Code string `json:"code"`
				} `json:"product"`
			} `json:"transaction_items"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return nil, err
	}

	detail := &domain.KeljaFulfillmentDetail{
		ID:    res.Data.ID,
		Code:  res.Data.Code,
		Items: make([]domain.KeljaFulfillmentItem, 0, len(res.Data.TransactionItems)),
	}
	for _, item := range res.Data.TransactionItems {
		if item.Product.Code != "" && item.Qty > 0 {
			detail.Items = append(detail.Items, domain.KeljaFulfillmentItem{
				ProductCode: item.Product.Code,
				Quantity:    item.Qty,
			})
		}
	}

	return detail, nil
}
