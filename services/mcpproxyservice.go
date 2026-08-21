package services

import (
	"bufio"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const mcpProxyTokenHeader = "X-Quick-MCP-Token"

type MCPProxySession struct {
	Success  bool   `json:"success"`
	ID       string `json:"id"`
	Endpoint string `json:"endpoint"`
	Token    string `json:"token"`
	Error    string `json:"error"`
}

type mcpProxyTarget struct {
	url     *url.URL
	headers http.Header
	token   string
	client  *http.Client
}

// MCPProxyService is deliberately transport-only. The official TypeScript MCP
// client still owns protocol negotiation, schema parsing and tool calls; this
// loopback proxy only avoids WebView CORS restrictions and applies desktop proxy
// settings without exposing a general-purpose forward proxy.
type MCPProxyService struct {
	mu       sync.RWMutex
	listener net.Listener
	server   *http.Server
	baseURL  string
	sessions map[string]*mcpProxyTarget
}

func (s *MCPProxyService) CreateSession(targetURL string, headersText string, proxyMode string, proxyURL string) MCPProxySession {
	target, err := url.Parse(strings.TrimSpace(targetURL))
	if err != nil || target.Host == "" || (target.Scheme != "http" && target.Scheme != "https") {
		return MCPProxySession{Error: "MCP Server 地址必须是有效的 http 或 https URL"}
	}
	if target.User != nil {
		return MCPProxySession{Error: "请通过请求头配置凭据，不要把用户名或密码写入 URL"}
	}
	headers, err := parseHeaders(headersText)
	if err != nil {
		return MCPProxySession{Error: err.Error()}
	}
	proxy, err := proxyFunction(proxyMode, proxyURL)
	if err != nil {
		return MCPProxySession{Error: err.Error()}
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = proxy
	transport.ResponseHeaderTimeout = 30 * time.Second

	id, err := randomHex(16)
	if err != nil {
		return MCPProxySession{Error: "无法创建本地代理会话：" + err.Error()}
	}
	token, err := randomHex(24)
	if err != nil {
		return MCPProxySession{Error: "无法创建本地代理凭据：" + err.Error()}
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.ensureServerLocked(); err != nil {
		return MCPProxySession{Error: "无法启动本地 MCP 代理：" + err.Error()}
	}
	if len(s.sessions) >= 32 {
		return MCPProxySession{Error: "本地 MCP 代理会话已达到上限，请先断开不再使用的连接"}
	}
	s.sessions[id] = &mcpProxyTarget{
		url:     target,
		headers: headers,
		token:   token,
		client:  &http.Client{Transport: transport},
	}
	return MCPProxySession{Success: true, ID: id, Endpoint: s.baseURL + "/mcp/" + id, Token: token}
}

func (s *MCPProxyService) CloseSession(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if target := s.sessions[id]; target != nil {
		if transport, ok := target.client.Transport.(*http.Transport); ok {
			transport.CloseIdleConnections()
		}
		delete(s.sessions, id)
	}
}

func (s *MCPProxyService) ServiceShutdown() error {
	s.mu.Lock()
	server := s.server
	for id, target := range s.sessions {
		if transport, ok := target.client.Transport.(*http.Transport); ok {
			transport.CloseIdleConnections()
		}
		delete(s.sessions, id)
	}
	s.server = nil
	s.listener = nil
	s.baseURL = ""
	s.mu.Unlock()
	if server != nil {
		return server.Close()
	}
	return nil
}

func (s *MCPProxyService) ensureServerLocked() error {
	if s.server != nil {
		return nil
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return err
	}
	s.listener = listener
	s.baseURL = "http://" + listener.Addr().String()
	s.sessions = make(map[string]*mcpProxyTarget)
	mux := http.NewServeMux()
	mux.HandleFunc("/mcp/", s.handleProxy)
	s.server = &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	go func(server *http.Server, activeListener net.Listener) {
		_ = server.Serve(activeListener)
	}(s.server, listener)
	return nil
}

func (s *MCPProxyService) handleProxy(writer http.ResponseWriter, request *http.Request) {
	setMCPProxyCORS(writer, request)
	if request.Method == http.MethodOptions {
		writer.WriteHeader(http.StatusNoContent)
		return
	}
	id := strings.TrimPrefix(request.URL.Path, "/mcp/")
	if id == "" || strings.Contains(id, "/") {
		http.Error(writer, "unknown MCP proxy session", http.StatusNotFound)
		return
	}
	s.mu.RLock()
	target := s.sessions[id]
	s.mu.RUnlock()
	if target == nil {
		http.Error(writer, "unknown MCP proxy session", http.StatusNotFound)
		return
	}
	providedToken := request.Header.Get(mcpProxyTokenHeader)
	if subtle.ConstantTimeCompare([]byte(providedToken), []byte(target.token)) != 1 {
		http.Error(writer, "invalid MCP proxy token", http.StatusUnauthorized)
		return
	}

	destination, err := mcpProxyDestination(target.url, request.URL.Query())
	if err != nil {
		http.Error(writer, err.Error(), http.StatusBadRequest)
		return
	}
	upstream, err := http.NewRequestWithContext(request.Context(), request.Method, destination.String(), request.Body)
	if err != nil {
		http.Error(writer, err.Error(), http.StatusBadRequest)
		return
	}
	copyProxyHeaders(upstream.Header, target.headers)
	copyProxyHeaders(upstream.Header, request.Header)
	upstream.Header.Del(mcpProxyTokenHeader)
	upstream.Host = destination.Host

	response, err := target.client.Do(upstream)
	if err != nil {
		http.Error(writer, "MCP Server 请求失败："+err.Error(), http.StatusBadGateway)
		return
	}
	defer response.Body.Close()
	copyProxyHeaders(writer.Header(), response.Header)
	if strings.HasPrefix(strings.ToLower(response.Header.Get("Content-Type")), "text/event-stream") {
		writer.Header().Del("Content-Length")
	}
	setMCPProxyCORS(writer, request)
	writer.WriteHeader(response.StatusCode)
	if strings.HasPrefix(strings.ToLower(response.Header.Get("Content-Type")), "text/event-stream") {
		proxySSEBody(writer, response.Body, target.url, request.Host, request.URL.Path)
		return
	}

	buffer := make([]byte, 32*1024)
	flusher, canFlush := writer.(http.Flusher)
	for {
		count, readErr := response.Body.Read(buffer)
		if count > 0 {
			if _, writeErr := writer.Write(buffer[:count]); writeErr != nil {
				return
			}
			if canFlush {
				flusher.Flush()
			}
		}
		if readErr != nil {
			if readErr != io.EOF {
				return
			}
			return
		}
	}
}

func mcpProxyDestination(configured *url.URL, query url.Values) (*url.URL, error) {
	values := make(url.Values, len(query))
	for name, items := range query {
		values[name] = append([]string(nil), items...)
	}
	override := strings.TrimSpace(values.Get("quick_target"))
	values.Del("quick_target")
	destination := *configured
	if override != "" {
		parsed, err := url.Parse(override)
		if err != nil || parsed.Host == "" || !sameURLOrigin(configured, parsed) {
			return nil, fmt.Errorf("SSE endpoint must use the configured MCP Server origin")
		}
		destination = *parsed
	}
	if encoded := values.Encode(); encoded != "" {
		if destination.RawQuery == "" {
			destination.RawQuery = encoded
		} else {
			destination.RawQuery += "&" + encoded
		}
	}
	return &destination, nil
}

func sameURLOrigin(left *url.URL, right *url.URL) bool {
	return strings.EqualFold(left.Scheme, right.Scheme) && strings.EqualFold(left.Host, right.Host)
}

// Legacy SSE transports announce a separate POST endpoint in an `endpoint`
// event. Rewrite that address through the same authenticated loopback proxy so
// the WebView never has to make a cross-origin request to the upstream server.
func proxySSEBody(writer http.ResponseWriter, reader io.Reader, configured *url.URL, localHost string, localPath string) {
	buffered := bufio.NewReader(reader)
	eventName := ""
	flusher, canFlush := writer.(http.Flusher)
	for {
		line, err := buffered.ReadString('\n')
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "event:") {
			eventName = strings.TrimSpace(strings.TrimPrefix(trimmed, "event:"))
		} else if eventName == "endpoint" && strings.HasPrefix(trimmed, "data:") {
			endpointText := strings.TrimSpace(strings.TrimPrefix(trimmed, "data:"))
			if endpoint, parseErr := configured.Parse(endpointText); parseErr == nil && sameURLOrigin(configured, endpoint) {
				local := &url.URL{Scheme: "http", Host: localHost, Path: localPath}
				query := local.Query()
				query.Set("quick_target", endpoint.String())
				local.RawQuery = query.Encode()
				lineEnding := ""
				if strings.HasSuffix(line, "\r\n") {
					lineEnding = "\r\n"
				} else if strings.HasSuffix(line, "\n") {
					lineEnding = "\n"
				}
				line = "data: " + local.String() + lineEnding
			}
		}
		if line != "" {
			if _, writeErr := io.WriteString(writer, line); writeErr != nil {
				return
			}
			if canFlush {
				flusher.Flush()
			}
		}
		if trimmed == "" {
			eventName = ""
		}
		if err != nil {
			return
		}
	}
}

func copyProxyHeaders(destination http.Header, source http.Header) {
	for name, values := range source {
		if isHopByHopHeader(name) || strings.EqualFold(name, mcpProxyTokenHeader) || strings.HasPrefix(strings.ToLower(name), "access-control-") {
			continue
		}
		destination.Del(name)
		for _, value := range values {
			destination.Add(name, value)
		}
	}
}

func isHopByHopHeader(name string) bool {
	switch strings.ToLower(name) {
	case "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade":
		return true
	default:
		return false
	}
}

func setMCPProxyCORS(writer http.ResponseWriter, request *http.Request) {
	origin := request.Header.Get("Origin")
	if origin == "" {
		origin = "*"
	}
	writer.Header().Set("Access-Control-Allow-Origin", origin)
	writer.Header().Set("Access-Control-Expose-Headers", "Mcp-Session-Id, MCP-Protocol-Version, WWW-Authenticate")
	writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
	requestedHeaders := request.Header.Get("Access-Control-Request-Headers")
	if requestedHeaders == "" {
		requestedHeaders = "Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID, Mcp-Method, Mcp-Name, X-Quick-MCP-Token"
	}
	writer.Header().Set("Access-Control-Allow-Headers", requestedHeaders)
	writer.Header().Add("Vary", "Origin")
}

func randomHex(length int) (string, error) {
	value := make([]byte, length)
	if _, err := rand.Read(value); err != nil {
		return "", fmt.Errorf("random source: %w", err)
	}
	return hex.EncodeToString(value), nil
}
