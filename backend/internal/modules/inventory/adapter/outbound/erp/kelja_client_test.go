package erp

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) {
	return f(r)
}

func jsonResponse(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body:       io.NopCloser(strings.NewReader(body)),
	}
}

func TestKeljaClient_BaseURLSanitizationAnd401TokenRefresh(t *testing.T) {
	loginCalls := 0
	fulfillmentCalls := 0
	var lastLoginURL string

	httpClient := &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			switch {
			case req.URL.Path == "/api/auth/login":
				loginCalls++
				lastLoginURL = req.URL.String()
				if loginCalls == 1 {
					return jsonResponse(http.StatusOK, `{"data":{"access_token":"tok-old"}}`), nil
				}
				return jsonResponse(http.StatusOK, `{"data":{"access_token":"tok-fresh"}}`), nil

			case req.URL.Path == "/api/fulfillment":
				fulfillmentCalls++
				if req.Header.Get("Authorization") == "Bearer tok-old" {
					return jsonResponse(http.StatusUnauthorized, `{"message":"expired"}`), nil
				}
				return jsonResponse(http.StatusOK, `{"data":[{"id":10,"code":"KLJ-10","fulfillment_status":{"description":"PENDING"},"warehouse_code":"WH-1"}]}`), nil

			case req.URL.Path == "/api/fulfillment/10":
				return jsonResponse(http.StatusOK, `{"data":{"id":10,"code":"KLJ-10","transaction_items":[{"qty":3,"product":{"code":"SKU-1"}},{"qty":0,"product":{"code":"SKU-ZERO"}}]}}`), nil

			default:
				return jsonResponse(http.StatusNotFound, `{}`), nil
			}
		}),
	}

	// Trailing slash on baseURL must be trimmed cleanly
	client := newKeljaClientWithConfig("https://erp.example.test/api///", "ops@test.id", "secret", httpClient)
	ctx := context.Background()

	// 1. First call receives 401 on tok-old, invalidates token, logs in again, and succeeds with tok-fresh
	list, err := client.FetchRecentFulfillments(ctx, 0, 0)
	if err != nil {
		t.Fatalf("FetchRecentFulfillments failed: %v", err)
	}
	if lastLoginURL != "https://erp.example.test/api/auth/login" {
		t.Fatalf("expected trimmed login URL, got %s", lastLoginURL)
	}
	if loginCalls != 2 || fulfillmentCalls != 2 {
		t.Fatalf("expected 2 logins and 2 fulfillment attempts (401 retry), got logins=%d calls=%d", loginCalls, fulfillmentCalls)
	}
	if len(list) != 1 || list[0].Code != "KLJ-10" || list[0].Status != "PENDING" {
		t.Fatalf("unexpected fulfillment list: %+v", list)
	}

	// 2. Detail call reuses cached tok-fresh (no 3rd login) and filters out qty<=0 items
	detail, err := client.FetchFulfillmentDetail(ctx, 10)
	if err != nil {
		t.Fatalf("FetchFulfillmentDetail failed: %v", err)
	}
	if loginCalls != 2 {
		t.Fatalf("expected cached token reuse (2 logins total), got %d", loginCalls)
	}
	if detail.Code != "KLJ-10" || len(detail.Items) != 1 || detail.Items[0].ProductCode != "SKU-1" || detail.Items[0].Quantity != 3 {
		t.Fatalf("unexpected detail: %+v", detail)
	}

	// 3. Invalid fulfillmentID <= 0 rejected before HTTP call
	if _, err := client.FetchFulfillmentDetail(ctx, 0); err == nil {
		t.Fatal("expected error for fulfillmentID=0")
	}

	// 4. Unconfigured client returns empty non-nil slice on list and error on detail
	unconfigured := newKeljaClientWithConfig("", "", "", httpClient)
	emptyList, err := unconfigured.FetchRecentFulfillments(ctx, 1, 10)
	if err != nil || emptyList == nil || len(emptyList) != 0 {
		t.Fatalf("expected non-nil empty list for unconfigured client, got %#v err=%v", emptyList, err)
	}
	if _, err := unconfigured.FetchFulfillmentDetail(ctx, 10); err == nil {
		t.Fatal("expected error from unconfigured FetchFulfillmentDetail")
	}
}
