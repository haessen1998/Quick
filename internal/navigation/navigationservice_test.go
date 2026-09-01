package navigation

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type testNavigationConfig struct {
	value string
}

func (config *testNavigationConfig) Load(key string) (string, error) {
	if key != "navigation-groups" {
		return "", nil
	}
	return config.value, nil
}

func (config *testNavigationConfig) Save(key string, value string) error {
	if key == "navigation-groups" {
		config.value = value
	}
	return nil
}

func TestDiscoverSiteIcon(t *testing.T) {
	iconBody := `<svg xmlns="http://www.w3.org/2000/svg"><rect width="16" height="16"/></svg>`
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path == "/assets/site.svg" {
			writer.Header().Set("Content-Type", "image/svg+xml")
			_, _ = writer.Write([]byte(iconBody))
			return
		}
		writer.Header().Set("Content-Type", "text/html")
		_, _ = writer.Write([]byte(`<html><head><link rel="icon" href="/assets/site.svg"></head><body></body></html>`))
	}))
	defer server.Close()
	service := testNavigationService(t, nil)
	service.client = server.Client()
	icon, err := service.DiscoverSiteIcon(server.URL + "/docs")
	if err != nil {
		t.Fatalf("DiscoverSiteIcon() error = %v", err)
	}
	if !strings.HasPrefix(icon, navigationIconCachePrefix) {
		t.Fatalf("DiscoverSiteIcon() = %q", icon)
	}
	cached, err := service.GetCachedSiteIcon(icon)
	if err != nil || !strings.HasPrefix(cached, "data:image/svg+xml;base64,") {
		t.Fatalf("GetCachedSiteIcon() = %q, %v", cached, err)
	}
	payload, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(cached, "data:image/svg+xml;base64,"))
	if err != nil || !strings.Contains(string(payload), "<svg") {
		t.Fatalf("cached icon payload = %q, %v", payload, err)
	}
	iconBody = `<svg xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="8"/></svg>`
	refreshed, err := service.DiscoverSiteIcon(server.URL + "/docs")
	if err != nil || refreshed == icon {
		t.Fatalf("refreshed icon = %q, %v; old = %q", refreshed, err, icon)
	}
	if _, err := service.GetCachedSiteIcon(icon); err == nil {
		t.Fatal("refresh left the stale cached icon behind")
	}
}

func testNavigationService(t *testing.T, groups []NavigationGroup) *NavigationService {
	t.Helper()
	config := &testNavigationConfig{}
	if groups != nil {
		data, err := json.Marshal(groups)
		if err != nil {
			t.Fatal(err)
		}
		if err := config.Save("navigation-groups", string(data)); err != nil {
			t.Fatal(err)
		}
	}
	service := NewNavigationService(config, nil)
	service.iconDirectory = filepath.Join(t.TempDir(), "navigation-icons")
	return service
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
		if request.URL.Path == "/favicon.ico" {
			writer.Header().Set("Content-Type", "image/x-icon")
			icon := []byte{
				0, 0, 1, 0, 1, 0,
				16, 16, 0, 0, 1, 0, 32, 0, 40, 0, 0, 0, 22, 0, 0, 0,
				40, 0, 0, 0, 16, 0, 0, 0, 32, 0, 0, 0, 1, 0, 32, 0,
			}
			icon = append(icon, make([]byte, 24)...)
			_, _ = writer.Write(icon)
			return
		}
		_, _ = writer.Write([]byte(`<html><head></head><body></body></html>`))
	}))
	defer server.Close()
	service := testNavigationService(t, nil)
	service.client = server.Client()
	icon, err := service.DiscoverSiteIcon(server.URL + "/docs")
	if err != nil || !strings.HasPrefix(icon, navigationIconCachePrefix) {
		t.Fatalf("fallback = %q, %v", icon, err)
	}
	if _, err := service.DiscoverSiteIcon("file:///tmp/icon.png"); err == nil {
		t.Fatal("DiscoverSiteIcon() accepted a non-HTTP URL")
	}
}

func TestDetectNavigationIconRejectsTruncatedImageHeaders(t *testing.T) {
	for _, data := range [][]byte{
		{'\x89', 'P', 'N', 'G', '\r', '\n', '\x1a', '\n'},
		{'\xff', '\xd8', '\xff'},
		[]byte("GIF89a"),
		[]byte("RIFF\x04\x00\x00\x00WEBP"),
		[]byte("<svg><path></svg"),
	} {
		if _, _, err := detectNavigationIcon(data); err == nil {
			t.Fatalf("detectNavigationIcon() accepted truncated data %q", data)
		}
	}
}

func TestDiscoverSiteIconRejectsInvalidFileWithoutCaching(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "text/html")
		_, _ = writer.Write([]byte(`<html><head><link rel="icon" href="/not-an-image"></head></html>`))
	}))
	defer server.Close()
	service := testNavigationService(t, nil)
	service.client = server.Client()
	if _, err := service.DiscoverSiteIcon(server.URL); err == nil {
		t.Fatal("DiscoverSiteIcon() accepted HTML as an icon")
	}
	directory := service.iconDirectory
	entries, err := os.ReadDir(directory)
	if err != nil && !os.IsNotExist(err) {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("invalid icon created cache files: %#v", entries)
	}
}

func TestGetCachedSiteIconRejectsTraversalAndCorruptFiles(t *testing.T) {
	service := testNavigationService(t, nil)
	if _, err := service.GetCachedSiteIcon("quick-icon:../settings.json"); err == nil {
		t.Fatal("GetCachedSiteIcon() accepted path traversal")
	}
	directory := service.iconDirectory
	if err := os.MkdirAll(directory, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(directory, "broken.ico"), []byte("not an icon"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := service.GetCachedSiteIcon("quick-icon:broken.ico"); err == nil {
		t.Fatal("GetCachedSiteIcon() accepted a corrupt cache file")
	}
}
