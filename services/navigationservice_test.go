package services

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestDiscoverSiteIcon(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "text/html")
		_, _ = writer.Write([]byte(`<html><head><link rel="icon" href="/assets/site.svg"></head><body></body></html>`))
	}))
	defer server.Close()
	service := &NavigationService{client: server.Client()}
	icon, err := service.DiscoverSiteIcon(server.URL + "/docs")
	if err != nil {
		t.Fatalf("DiscoverSiteIcon() error = %v", err)
	}
	if icon != server.URL+"/assets/site.svg" {
		t.Fatalf("DiscoverSiteIcon() = %q", icon)
	}
}

func testNavigationService(t *testing.T, groups []NavigationGroup) *NavigationService {
	t.Helper()
	config := &ConfigService{path: filepath.Join(t.TempDir(), "settings.json")}
	if groups != nil {
		data, err := json.Marshal(groups)
		if err != nil {
			t.Fatal(err)
		}
		if err := config.Save("navigation-groups", string(data)); err != nil {
			t.Fatal(err)
		}
	}
	return NewNavigationService(config, nil)
}

func TestBatchUpdateSitesMovesGroupAndList(t *testing.T) {
	service := testNavigationService(t, []NavigationGroup{
		{ID: "ai", Name: "AI", Items: []NavigationItem{
			{ID: "one", Title: "One", URL: "https://one.example", List: "Models", Size: "2x2"},
			{ID: "two", Title: "Two", URL: "https://two.example", List: "Models", Size: "2x2"},
			{ID: "three", Title: "Three", URL: "https://three.example", List: "Other", Size: "2x2"},
		}},
		{ID: "quick", Name: "Quick", Items: []NavigationItem{}},
	})
	result, err := service.BatchUpdateSites(NavigationBatchUpdateRequest{
		SourceGroup: "AI", SourceList: "Models", MatchSourceList: true,
		TargetGroup: "Quick", TargetList: "Providers", SetTargetList: true,
	})
	if err != nil {
		t.Fatalf("BatchUpdateSites() error = %v", err)
	}
	if result.Updated != 2 || len(result.Sites) != 2 {
		t.Fatalf("updated = %d, sites = %#v", result.Updated, result.Sites)
	}
	if len(result.Groups[0].Items) != 1 || result.Groups[0].Items[0].Title != "Three" {
		t.Fatalf("source group = %#v", result.Groups[0].Items)
	}
	if len(result.Groups[1].Items) != 2 || result.Groups[1].Items[0].List != "Providers" || result.Groups[1].Items[1].List != "Providers" {
		t.Fatalf("target group = %#v", result.Groups[1].Items)
	}
	persisted, err := service.GetNavigationGroups()
	if err != nil || len(persisted[1].Items) != 2 {
		t.Fatalf("persisted groups = %#v, %v", persisted, err)
	}
}

func TestBatchUpdateSitesEditsSingleAndBulkFields(t *testing.T) {
	service := testNavigationService(t, []NavigationGroup{{ID: "quick", Name: "Quick", Items: []NavigationItem{
		{ID: "one", Title: "One", URL: "https://one.example", Size: "2x2"},
		{ID: "two", Title: "Two", URL: "https://two.example", Size: "2x2"},
	}}})
	bulk, err := service.BatchUpdateSites(NavigationBatchUpdateRequest{SourceGroup: "Quick", Description: "Developer link", SetDescription: true, Size: "1x1", SetSize: true})
	if err != nil || bulk.Updated != 2 {
		t.Fatalf("bulk update = %#v, %v", bulk, err)
	}
	single, err := service.BatchUpdateSites(NavigationBatchUpdateRequest{IDs: []string{"one"}, Title: "First", SetTitle: true, URL: "first.example/docs", SetURL: true})
	if err != nil {
		t.Fatalf("single update error = %v", err)
	}
	if single.Sites[0].Title != "First" || single.Groups[0].Items[0].URL != "https://first.example/docs" {
		t.Fatalf("single update = %#v", single)
	}
	if _, err := service.BatchUpdateSites(NavigationBatchUpdateRequest{SourceGroup: "Quick", Title: "Duplicate", SetTitle: true}); err == nil {
		t.Fatal("bulk title update unexpectedly succeeded")
	}
}

func TestDiscoverSiteIconFallbackAndValidation(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		_, _ = writer.Write([]byte(`<html><head></head><body></body></html>`))
	}))
	defer server.Close()
	service := &NavigationService{client: server.Client()}
	icon, err := service.DiscoverSiteIcon(server.URL + "/docs")
	if err != nil || icon != server.URL+"/favicon.ico" {
		t.Fatalf("fallback = %q, %v", icon, err)
	}
	if _, err := service.DiscoverSiteIcon("file:///tmp/icon.png"); err == nil {
		t.Fatal("DiscoverSiteIcon() accepted a non-HTTP URL")
	}
}
