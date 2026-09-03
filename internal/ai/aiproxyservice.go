package ai

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/haessen1998/Quick/internal/network"
)

const (
	aiProxyTokenHeader  = "X-Quick-AI-Token"
	aiProxyTargetHeader = "X-Quick-AI-Target"
)

type AIProxySession struct {
	Success  bool   `json:"success"`
	ID       string `json:"id"`
	Endpoint string `json:"endpoint"`
	Token    string `json:"token"`
	Error    string `json:"error"`
}

type aiProxyTarget struct {
	origin *url.URL
	token  string
	client *http.Client
}

// AIProxyService keeps the TypeScript AI SDK in charge of provider protocols,
// while all external HTTP traffic is sent by Go. Each session is restricted to
// the origin of the first provider request and protected by an unguessable token.
type AIProxyService struct {
	mu       sync.RWMutex
	listener net.Listener
	server   *http.Server
	baseURL  string
	sessions map[string]*aiProxyTarget
}

func (s *AIProxyService) CreateSession(targetURL string, proxyMode string, proxyURL string) AIProxySession {
	target, err := parseAITarget(targetURL)
	if err != nil {
		return AIProxySession{Error: err.Error()}
	}
	proxy, err := network.ProxyFunction(proxyMode, proxyURL)
	if err != nil {
		return AIProxySession{Error: err.Error()}
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = proxy
	transport.ResponseHeaderTimeout = 60 * time.Second
	origin := &url.URL{Scheme: target.Scheme, Host: target.Host}
	client := &http.Client{Transport: transport}
	client.CheckRedirect = func(request *http.Request, via []*http.Request) error {
		if !sameOrigin(origin, request.URL) {
			return fmt.Errorf("AI Provider 重定向到了不同来源")
		}
		if len(via) >= 10 {
			return fmt.Errorf("AI Provider 重定向次数过多")
		}
		return nil
	}
	id, err := randomHex(16)
	if err != nil {
		return AIProxySession{Error: "无法创建 AI 代理会话：" + err.Error()}
	}
	token, err := randomHex(24)
	if err != nil {
		return AIProxySession{Error: "无法创建 AI 代理凭据：" + err.Error()}
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.ensureServerLocked(); err != nil {
		return AIProxySession{Error: "无法启动本地 AI 代理：" + err.Error()}
	}
	if len(s.sessions) >= 32 {
		return AIProxySession{Error: "本地 AI 代理会话已达到上限"}
	}
	s.sessions[id] = &aiProxyTarget{origin: origin, token: token, client: client}
	return AIProxySession{Success: true, ID: id, Endpoint: s.baseURL + "/ai/" + id, Token: token}
}

func (s *AIProxyService) CloseSession(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if target := s.sessions[id]; target != nil {
		if transport, ok := target.client.Transport.(*http.Transport); ok {
			transport.CloseIdleConnections()
		}
		delete(s.sessions, id)
	}
}

func (s *AIProxyService) ServiceShutdown() error {
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

func (s *AIProxyService) ensureServerLocked() error {
	if s.server != nil {
		return nil
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return err
	}
	s.listener = listener
	s.baseURL = "http://" + listener.Addr().String()
	s.sessions = make(map[string]*aiProxyTarget)
	mux := http.NewServeMux()
	mux.HandleFunc("/ai/", s.handleProxy)
	s.server = &http.Server{Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	go func(server *http.Server, activeListener net.Listener) {
		_ = server.Serve(activeListener)
	}(s.server, listener)
	return nil
}

func (s *AIProxyService) handleProxy(writer http.ResponseWriter, request *http.Request) {
	setAIProxyCORS(writer, request)
	if request.Method == http.MethodOptions {
		writer.WriteHeader(http.StatusNoContent)
		return
	}
	id := strings.TrimPrefix(request.URL.Path, "/ai/")
	if id == "" || strings.Contains(id, "/") {
		http.Error(writer, "unknown AI proxy session", http.StatusNotFound)
		return
	}
	s.mu.RLock()
	target := s.sessions[id]
	s.mu.RUnlock()
	if target == nil {
		http.Error(writer, "unknown AI proxy session", http.StatusNotFound)
		return
	}
	if subtle.ConstantTimeCompare([]byte(request.Header.Get(aiProxyTokenHeader)), []byte(target.token)) != 1 {
		http.Error(writer, "invalid AI proxy token", http.StatusUnauthorized)
		return
	}
	destination, err := parseAITarget(request.Header.Get(aiProxyTargetHeader))
	if err != nil || !sameOrigin(target.origin, destination) {
		http.Error(writer, "AI request target is outside the configured provider origin", http.StatusBadRequest)
		return
	}
	upstream, err := http.NewRequestWithContext(request.Context(), request.Method, destination.String(), request.Body)
	if err != nil {
		http.Error(writer, err.Error(), http.StatusBadRequest)
		return
	}
	copyAIProxyHeaders(upstream.Header, request.Header)
	upstream.Host = destination.Host
	response, err := target.client.Do(upstream)
	if err != nil {
		http.Error(writer, "AI Provider 请求失败："+err.Error(), http.StatusBadGateway)
		return
	}
	defer response.Body.Close()
	copyAIProxyHeaders(writer.Header(), response.Header)
	setAIProxyCORS(writer, request)
	writer.WriteHeader(response.StatusCode)
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
			return
		}
	}
}

func parseAITarget(value string) (*url.URL, error) {
	target, err := url.Parse(strings.TrimSpace(value))
	if err != nil || target.Host == "" || (target.Scheme != "http" && target.Scheme != "https") {
		return nil, fmt.Errorf("AI Provider 地址必须是有效的 http 或 https URL")
	}
	if target.User != nil {
		return nil, fmt.Errorf("AI Provider 地址不能包含用户名或密码")
	}
	target.Fragment = ""
	return target, nil
}

func sameOrigin(left *url.URL, right *url.URL) bool {
	return left != nil && right != nil && strings.EqualFold(left.Scheme, right.Scheme) && strings.EqualFold(left.Host, right.Host)
}

func copyAIProxyHeaders(destination http.Header, source http.Header) {
	for name, values := range source {
		lower := strings.ToLower(name)
		if isHopByHopHeader(lower) || lower == strings.ToLower(aiProxyTokenHeader) || lower == strings.ToLower(aiProxyTargetHeader) || lower == "origin" || lower == "referer" || strings.HasPrefix(lower, "sec-fetch-") || strings.HasPrefix(lower, "access-control-") {
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

func setAIProxyCORS(writer http.ResponseWriter, request *http.Request) {
	origin := request.Header.Get("Origin")
	if origin == "" {
		origin = "*"
	}
	writer.Header().Set("Access-Control-Allow-Origin", origin)
	writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
	requestedHeaders := request.Header.Get("Access-Control-Request-Headers")
	if requestedHeaders == "" {
		requestedHeaders = "Content-Type, Authorization, X-API-Key, X-Goog-Api-Key, X-Quick-AI-Token, X-Quick-AI-Target"
	}
	writer.Header().Set("Access-Control-Allow-Headers", requestedHeaders)
	writer.Header().Set("Access-Control-Expose-Headers", "Content-Type, Request-Id, X-Request-Id")
	writer.Header().Add("Vary", "Origin")
}

func randomHex(length int) (string, error) {
	value := make([]byte, length)
	if _, err := rand.Read(value); err != nil {
		return "", fmt.Errorf("random source: %w", err)
	}
	return hex.EncodeToString(value), nil
}
