package erp

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/config"
)

type keljaClient struct {
	baseURL    string
	username   string
	password   string
	httpClient *http.Client

	// Token caching
	tokenMutex sync.RWMutex
	token      string
	tokenExp   time.Time
}


func NewKeljaClient() port.KeljaERPClient {
	log.Printf("Initializing Kelja Client with Username: %q", config.AppConfig.KeljaApiUsername)
	return &keljaClient{
		baseURL:    config.AppConfig.KeljaApiURL,
		username:   config.AppConfig.KeljaApiUsername,
		password:   config.AppConfig.KeljaApiPass,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *keljaClient) getToken(ctx context.Context) (string, error) {
	c.tokenMutex.RLock()
	// Check if we have a valid token (with 5 minutes buffer)
	if c.token != "" && time.Now().Before(c.tokenExp.Add(-5*time.Minute)) {
		tok := c.token
		c.tokenMutex.RUnlock()
		return tok, nil
	}
	c.tokenMutex.RUnlock()

	// Need to login
	c.tokenMutex.Lock()
	defer c.tokenMutex.Unlock()

	// Double check after lock
	if c.token != "" && time.Now().Before(c.tokenExp.Add(-5*time.Minute)) {
		return c.token, nil
	}

	payload := map[string]string{
		"email":    c.username, // Kelja API expects the key to be 'email'
		"password": c.password,
	}
	body, _ := json.Marshal(payload)

	log.Printf("[KeljaClient] Logging in to %s/auth/login ...", c.baseURL)
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
		bodyBytes, _ := io.ReadAll(resp.Body)
		log.Printf("[KeljaClient] Login FAILED: status %d, body: %s", resp.StatusCode, string(bodyBytes))
		return "", fmt.Errorf("failed to login to kelja erp: status %d, response: %s", resp.StatusCode, string(bodyBytes))
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
		return "", errors.New("empty token returned from kelja erp login")
	}

	c.token = res.Data.Token
	// Assume token is valid for 1 hour
	c.tokenExp = time.Now().Add(1 * time.Hour)
	log.Printf("[KeljaClient] Login successful, token cached for 1 hour")

	return c.token, nil
}

func (c *keljaClient) doRequest(ctx context.Context, method, path string, body io.Reader) (*http.Response, error) {
	token, err := c.getToken(ctx)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, method, fmt.Sprintf("%s%s", c.baseURL, path), body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}

	// Retry once on 401 Unauthorized (token invalidated)
	if resp.StatusCode == http.StatusUnauthorized {
		resp.Body.Close()
		log.Printf("[KeljaClient] 401 Unauthorized, clearing token cache and retrying...")
		
		c.tokenMutex.Lock()
		c.token = ""
		c.tokenMutex.Unlock()

		newToken, err := c.getToken(ctx)
		if err != nil {
			return nil, err
		}
		
		// Re-create request
		req, err = http.NewRequestWithContext(ctx, method, fmt.Sprintf("%s%s", c.baseURL, path), body)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+newToken)
		req.Header.Set("Accept", "application/json")
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		return c.httpClient.Do(req)
	}

	return resp, nil
}

func (c *keljaClient) FetchFulfillments(ctx context.Context, page int, perPage int) ([]map[string]interface{}, error) {
	path := fmt.Sprintf("/fulfillment?page=%d&per_page=%d&sort_by=created_at&sort=asc", page, perPage)
	resp, err := c.doRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("kelja api returned status %d on fetch fulfillments", resp.StatusCode)
	}

	var res struct {
		Data []map[string]interface{} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return nil, err
	}

	return res.Data, nil
}

func (c *keljaClient) FetchAllFulfillments(ctx context.Context) ([]map[string]interface{}, error) {
	var allData []map[string]interface{}
	page := 1
	perPage := 50

	for {
		path := fmt.Sprintf("/fulfillment?page=%d&per_page=%d&sort_by=created_at&sort=asc", page, perPage)
		resp, err := c.doRequest(ctx, http.MethodGet, path, nil)
		if err != nil {
			log.Printf("[KeljaClient] FetchAllFulfillments page %d failed: %v", page, err)
			return nil, fmt.Errorf("fetch page %d: %w", page, err)
		}

		var res struct {
			Data        []map[string]interface{} `json:"data"`
			Total       int                      `json:"total"`
			PerPage     int                      `json:"per_page"`
			CurrentPage int                      `json:"current_page"`
			LastPage    int                      `json:"last_page"`
		}
		
		bodyBytes, _ := io.ReadAll(resp.Body)
		
		if err := json.Unmarshal(bodyBytes, &res); err != nil {
			resp.Body.Close()
			return nil, fmt.Errorf("decode page %d: %w", page, err)
		}
		resp.Body.Close()

		allData = append(allData, res.Data...)
		log.Printf("[KeljaSync] Fetched page %d/%d (%d records)", page, res.LastPage, len(res.Data))

		if page >= res.LastPage || len(res.Data) == 0 {
			break
		}
		page++
	}

	log.Printf("[KeljaSync] Total fetched: %d fulfillments", len(allData))
	return allData, nil
}

func (c *keljaClient) FetchFulfillmentDetail(ctx context.Context, fulfillmentID int) (map[string]interface{}, error) {
	path := fmt.Sprintf("/fulfillment/%d", fulfillmentID)
	resp, err := c.doRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("kelja api returned status %d on fetch fulfillment detail %d", resp.StatusCode, fulfillmentID)
	}

	var res struct {
		Data map[string]interface{} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return nil, err
	}

	return res.Data, nil
}

func (c *keljaClient) SendCallbackDone(ctx context.Context, fulfillmentID int, expeditionID int, awb string, action string) error {
	// action is "checker", "packer", or "shipper"
	if action == "" {
		action = "checker"
	}
	path := fmt.Sprintf("/fulfillment/%d/%s", fulfillmentID, action)
	
	payload := map[string]interface{}{}
	if action == "shipper" {
		payload["expedition_id"] = expeditionID
		payload["expedition_tracking"] = awb
	}
	
	body, _ := json.Marshal(payload)

	resp, err := c.doRequest(ctx, http.MethodPatch, path, bytes.NewBuffer(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	
	if resp.StatusCode >= 300 {
		return fmt.Errorf("kelja api returned status %d on %s callback for %d: %s", resp.StatusCode, action, fulfillmentID, string(bodyBytes))
	}

	return nil
}
