package services

import (
	"net/http"
	"net/http/httptest"
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
