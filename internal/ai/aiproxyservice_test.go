package ai

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAIProxyForwardsWithinSessionOrigin(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Header.Get("Authorization") != "Bearer quick" {
			http.Error(writer, "missing auth", http.StatusUnauthorized)
			return
		}
		writer.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(writer, "data: ok\n\n")
	}))
	defer upstream.Close()

	service := &AIProxyService{}
	defer service.ServiceShutdown()
	session := service.CreateSession(upstream.URL+"/v1/responses", "none", "")
	if !session.Success {
		t.Fatal(session.Error)
	}
	request, err := http.NewRequest(http.MethodPost, session.Endpoint, nil)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set(aiProxyTokenHeader, session.Token)
	request.Header.Set(aiProxyTargetHeader, upstream.URL+"/v1/responses?stream=true")
	request.Header.Set("Authorization", "Bearer quick")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode != http.StatusOK || string(body) != "data: ok\n\n" {
		t.Fatalf("unexpected response: %d %q", response.StatusCode, body)
	}
}

func TestAIProxyRejectsAnotherOrigin(t *testing.T) {
	service := &AIProxyService{}
	defer service.ServiceShutdown()
	session := service.CreateSession("https://api.example.com/v1", "none", "")
	if !session.Success {
		t.Fatal(session.Error)
	}
	request, _ := http.NewRequest(http.MethodGet, session.Endpoint, nil)
	request.Header.Set(aiProxyTokenHeader, session.Token)
	request.Header.Set(aiProxyTargetHeader, "https://other.example.com/v1")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", response.StatusCode)
	}
}
