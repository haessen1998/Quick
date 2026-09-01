package mcp

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestMCPProxySessionForwardsRequestsAndHeaders(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost {
			t.Errorf("method = %s, want POST", request.Method)
		}
		if got := request.Header.Get("Authorization"); got != "Bearer test-token" {
			t.Errorf("Authorization = %q", got)
		}
		if got := request.Header.Get("Mcp-Protocol-Version"); got != "2025-06-18" {
			t.Errorf("Mcp-Protocol-Version = %q", got)
		}
		body, _ := io.ReadAll(request.Body)
		if string(body) != `{"jsonrpc":"2.0"}` {
			t.Errorf("body = %q", body)
		}
		writer.Header().Set("Content-Type", "application/json")
		writer.Header().Set("Mcp-Session-Id", "session-123")
		_, _ = writer.Write([]byte(`{"ok":true}`))
	}))
	defer upstream.Close()

	service := &MCPProxyService{}
	defer service.ServiceShutdown()
	session := service.CreateSession(upstream.URL+"/mcp", "Authorization: Bearer test-token", "none", "")
	if !session.Success {
		t.Fatalf("CreateSession failed: %s", session.Error)
	}

	request, err := http.NewRequest(http.MethodPost, session.Endpoint, strings.NewReader(`{"jsonrpc":"2.0"}`))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set(mcpProxyTokenHeader, session.Token)
	request.Header.Set("Mcp-Protocol-Version", "2025-06-18")
	request.Header.Set("Origin", "http://wails.localhost")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode != http.StatusOK || string(body) != `{"ok":true}` {
		t.Fatalf("response = %d %q", response.StatusCode, body)
	}
	if got := response.Header.Get("Mcp-Session-Id"); got != "session-123" {
		t.Errorf("Mcp-Session-Id = %q", got)
	}
	if got := response.Header.Get("Access-Control-Allow-Origin"); got != "http://wails.localhost" {
		t.Errorf("Access-Control-Allow-Origin = %q", got)
	}

	service.CloseSession(session.ID)
	closedRequest, _ := http.NewRequest(http.MethodPost, session.Endpoint, nil)
	closedRequest.Header.Set(mcpProxyTokenHeader, session.Token)
	closedResponse, err := http.DefaultClient.Do(closedRequest)
	if err != nil {
		t.Fatal(err)
	}
	closedResponse.Body.Close()
	if closedResponse.StatusCode != http.StatusNotFound {
		t.Errorf("closed session status = %d, want 404", closedResponse.StatusCode)
	}
}

func TestMCPProxyRejectsCredentialsInURLAndInvalidHeaders(t *testing.T) {
	service := &MCPProxyService{}
	if result := service.CreateSession("https://user:secret@example.com/mcp", "", "none", ""); result.Success {
		t.Fatal("URL credentials should be rejected")
	}
	if result := service.CreateSession("https://example.com/mcp", "not-a-header", "none", ""); result.Success {
		t.Fatal("invalid headers should be rejected")
	}
}

func TestMCPProxyRewritesLegacySSEEndpointAndForwardsMessages(t *testing.T) {
	messageReceived := false
	upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/sse":
			writer.Header().Set("Content-Type", "text/event-stream")
			_, _ = io.WriteString(writer, "event: endpoint\ndata: /messages?sessionId=test-session\n\n")
		case "/messages":
			if request.URL.Query().Get("sessionId") != "test-session" {
				t.Errorf("sessionId = %q", request.URL.Query().Get("sessionId"))
			}
			messageReceived = true
			writer.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(writer, `{"ok":true}`)
		default:
			http.NotFound(writer, request)
		}
	}))
	defer upstream.Close()

	service := &MCPProxyService{}
	defer service.ServiceShutdown()
	session := service.CreateSession(upstream.URL+"/sse", "", "none", "")
	if !session.Success {
		t.Fatalf("CreateSession failed: %s", session.Error)
	}

	request, _ := http.NewRequest(http.MethodGet, session.Endpoint, nil)
	request.Header.Set(mcpProxyTokenHeader, session.Token)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(response.Body)
	response.Body.Close()
	dataLine := strings.TrimSpace(strings.TrimPrefix(strings.Split(string(body), "\n")[1], "data:"))
	rewritten, err := url.Parse(dataLine)
	if err != nil {
		t.Fatalf("rewritten endpoint = %q: %v", dataLine, err)
	}
	if rewritten.Query().Get("quick_target") != upstream.URL+"/messages?sessionId=test-session" {
		t.Fatalf("quick_target = %q", rewritten.Query().Get("quick_target"))
	}

	post, _ := http.NewRequest(http.MethodPost, rewritten.String(), strings.NewReader(`{"jsonrpc":"2.0"}`))
	post.Header.Set(mcpProxyTokenHeader, session.Token)
	postResponse, err := http.DefaultClient.Do(post)
	if err != nil {
		t.Fatal(err)
	}
	postResponse.Body.Close()
	if !messageReceived {
		t.Fatal("rewritten SSE message endpoint was not forwarded")
	}
}
