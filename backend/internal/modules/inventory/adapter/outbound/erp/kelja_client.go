package erp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
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

// NewKeljaClient initializes a client for the Kelja ERP API.
func NewKeljaClient() inventory_port.KeljaClient {
	return &keljaClient{
		baseURL:    config.AppConfig.KeljaApiURL,
		username:   config.AppConfig.KeljaApiUsername,
		password:   config.AppConfig.KeljaApiPass,
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

func (c *keljaClient) getToken(ctx context.Context) (string, error) {
	if c.username == "" || c.password == "" {
		return "", fmt.Errorf("kelja credentials not configured")
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
	body, _ := json.Marshal(payload)

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
	defer resp.Body.Close()

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

func (c *keljaClient) FetchRecentFulfillments(ctx context.Context, page int, perPage int) ([]domain.KeljaFulfillmentSummary, error) {
	if c.username == "" || c.password == "" {
		return nil, nil
	}

	token, err := c.getToken(ctx)
	if err != nil {
		return nil, fmt.Errorf("kelja auth: %w", err)
	}

	url := fmt.Sprintf("%s/fulfillment?page=%d&per_page=%d&sort_by=created_at&sort=desc", c.baseURL, page, perPage)
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
	defer resp.Body.Close()

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

	var list []domain.KeljaFulfillmentSummary
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

func (c *keljaClient) FetchFulfillmentDetail(ctx context.Context, fulfillmentID int) (*domain.KeljaFulfillmentDetail, error) {
	token, err := c.getToken(ctx)
	if err != nil {
		return nil, err
	}

	url := fmt.Sprintf("%s/fulfillment/%d", c.baseURL, fulfillmentID)
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
	defer resp.Body.Close()

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
		ID:   res.Data.ID,
		Code: res.Data.Code,
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
