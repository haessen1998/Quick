package services

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

var validEnvironmentName = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

type MCPStdioConnectResult struct {
	Success      bool     `json:"success"`
	SessionID    string   `json:"sessionId"`
	Name         string   `json:"name"`
	Version      string   `json:"version"`
	Instructions string   `json:"instructions"`
	Capabilities []string `json:"capabilities"`
	Error        string   `json:"error"`
}

type MCPStdioToolsResult struct {
	Success   bool   `json:"success"`
	ToolsJSON string `json:"toolsJson"`
	Error     string `json:"error"`
}

type MCPStdioCallResult struct {
	Success    bool   `json:"success"`
	ResultJSON string `json:"resultJson"`
	DurationMS int64  `json:"durationMs"`
	Error      string `json:"error"`
}

type mcpStdioConnection struct {
	session *mcp.ClientSession
	stderr  *cappedLogWriter
}

type MCPStdioService struct {
	mu       sync.RWMutex
	sessions map[string]*mcpStdioConnection
}

func (s *MCPStdioService) Connect(command string, argsJSON string, envText string, cwd string) MCPStdioConnectResult {
	command = strings.TrimSpace(command)
	if command == "" {
		return MCPStdioConnectResult{Error: "STDIO 命令不能为空"}
	}
	var args []string
	if strings.TrimSpace(argsJSON) == "" {
		argsJSON = "[]"
	}
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return MCPStdioConnectResult{Error: "参数必须是字符串 JSON 数组：" + err.Error()}
	}
	environment, err := parseMCPEnvironment(envText)
	if err != nil {
		return MCPStdioConnectResult{Error: err.Error()}
	}
	if cwd = strings.TrimSpace(cwd); cwd != "" {
		absolute, resolveErr := filepath.Abs(cwd)
		if resolveErr != nil {
			return MCPStdioConnectResult{Error: "无法解析工作目录：" + resolveErr.Error()}
		}
		info, statErr := os.Stat(absolute)
		if statErr != nil || !info.IsDir() {
			return MCPStdioConnectResult{Error: "工作目录不存在或不是文件夹"}
		}
		cwd = absolute
	}

	cmd := exec.Command(command, args...)
	cmd.Dir = cwd
	if len(environment) > 0 {
		cmd.Env = append(os.Environ(), environment...)
	}
	configureMCPCommand(cmd)
	stderr := &cappedLogWriter{limit: 64 * 1024}
	cmd.Stderr = stderr

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	client := mcp.NewClient(&mcp.Implementation{Name: "quick-mcp-tester", Version: "0.2.0"}, nil)
	session, err := client.Connect(ctx, &mcp.CommandTransport{Command: cmd, TerminateDuration: 2 * time.Second}, nil)
	if err != nil {
		message := err.Error()
		if logs := strings.TrimSpace(stderr.String()); logs != "" {
			message += "\n\nServer stderr:\n" + logs
		}
		return MCPStdioConnectResult{Error: message}
	}

	id, err := randomHex(16)
	if err != nil {
		_ = session.Close()
		return MCPStdioConnectResult{Error: "无法创建 STDIO 会话：" + err.Error()}
	}
	s.mu.Lock()
	if s.sessions == nil {
		s.sessions = make(map[string]*mcpStdioConnection)
	}
	if len(s.sessions) >= 16 {
		s.mu.Unlock()
		_ = session.Close()
		return MCPStdioConnectResult{Error: "STDIO 会话已达到上限，请先断开不再使用的连接"}
	}
	s.sessions[id] = &mcpStdioConnection{session: session, stderr: stderr}
	s.mu.Unlock()

	result := session.InitializeResult()
	response := MCPStdioConnectResult{Success: true, SessionID: id}
	if result != nil {
		response.Instructions = result.Instructions
		response.Capabilities = capabilityNames(result.Capabilities)
		if result.ServerInfo != nil {
			response.Name = result.ServerInfo.Name
			if result.ServerInfo.Title != "" {
				response.Name = result.ServerInfo.Title
			}
			response.Version = result.ServerInfo.Version
		}
	}
	if response.Name == "" {
		response.Name = "STDIO MCP Server"
	}
	return response
}

func (s *MCPStdioService) ListTools(sessionID string) MCPStdioToolsResult {
	connection := s.get(sessionID)
	if connection == nil {
		return MCPStdioToolsResult{Error: "STDIO 会话不存在或已经关闭"}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	tools := make([]*mcp.Tool, 0)
	cursor := ""
	for page := 0; page < 64; page++ {
		result, err := connection.session.ListTools(ctx, &mcp.ListToolsParams{Cursor: cursor})
		if err != nil {
			return MCPStdioToolsResult{Error: appendStdioLogs(err.Error(), connection.stderr)}
		}
		tools = append(tools, result.Tools...)
		if result.NextCursor == "" {
			encoded, marshalErr := json.Marshal(tools)
			if marshalErr != nil {
				return MCPStdioToolsResult{Error: marshalErr.Error()}
			}
			return MCPStdioToolsResult{Success: true, ToolsJSON: string(encoded)}
		}
		cursor = result.NextCursor
	}
	return MCPStdioToolsResult{Error: "tools/list 分页超过 64 页，已停止读取"}
}

func (s *MCPStdioService) CallTool(sessionID string, name string, argumentsJSON string) MCPStdioCallResult {
	start := time.Now()
	connection := s.get(sessionID)
	if connection == nil {
		return MCPStdioCallResult{Error: "STDIO 会话不存在或已经关闭"}
	}
	var arguments map[string]any
	if err := json.Unmarshal([]byte(argumentsJSON), &arguments); err != nil {
		return MCPStdioCallResult{Error: "工具参数必须是 JSON 对象：" + err.Error()}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	result, err := connection.session.CallTool(ctx, &mcp.CallToolParams{Name: name, Arguments: arguments})
	if err != nil {
		return MCPStdioCallResult{DurationMS: time.Since(start).Milliseconds(), Error: appendStdioLogs(err.Error(), connection.stderr)}
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		return MCPStdioCallResult{DurationMS: time.Since(start).Milliseconds(), Error: err.Error()}
	}
	return MCPStdioCallResult{Success: true, ResultJSON: string(encoded), DurationMS: time.Since(start).Milliseconds()}
}

func (s *MCPStdioService) Close(sessionID string) {
	s.mu.Lock()
	connection := s.sessions[sessionID]
	delete(s.sessions, sessionID)
	s.mu.Unlock()
	if connection != nil {
		_ = connection.session.Close()
	}
}

func (s *MCPStdioService) ServiceShutdown() error {
	s.mu.Lock()
	connections := make([]*mcpStdioConnection, 0, len(s.sessions))
	for id, connection := range s.sessions {
		connections = append(connections, connection)
		delete(s.sessions, id)
	}
	s.mu.Unlock()
	for _, connection := range connections {
		_ = connection.session.Close()
	}
	return nil
}

func (s *MCPStdioService) get(id string) *mcpStdioConnection {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.sessions[id]
}

func parseMCPEnvironment(value string) ([]string, error) {
	result := make([]string, 0)
	for lineNumber, original := range strings.Split(value, "\n") {
		line := strings.TrimSpace(strings.TrimSuffix(original, "\r"))
		if line == "" {
			continue
		}
		name, envValue, found := strings.Cut(line, "=")
		name = strings.TrimSpace(name)
		if !found || !validEnvironmentName.MatchString(name) || strings.ContainsRune(envValue, 0) {
			return nil, fmt.Errorf("第 %d 行不是有效的 KEY=value 环境变量", lineNumber+1)
		}
		result = append(result, name+"="+envValue)
	}
	return result, nil
}

func capabilityNames(capabilities *mcp.ServerCapabilities) []string {
	if capabilities == nil {
		return nil
	}
	encoded, err := json.Marshal(capabilities)
	if err != nil {
		return nil
	}
	var values map[string]any
	if json.Unmarshal(encoded, &values) != nil {
		return nil
	}
	names := make([]string, 0, len(values))
	for name, value := range values {
		if value != nil {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	return names
}

func appendStdioLogs(message string, logs *cappedLogWriter) string {
	if value := strings.TrimSpace(logs.String()); value != "" {
		return message + "\n\nServer stderr:\n" + value
	}
	return message
}

type cappedLogWriter struct {
	mu    sync.Mutex
	limit int
	value []byte
}

func (w *cappedLogWriter) Write(value []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.value = append(w.value, value...)
	if len(w.value) > w.limit {
		w.value = append([]byte(nil), w.value[len(w.value)-w.limit:]...)
	}
	return len(value), nil
}

func (w *cappedLogWriter) String() string {
	w.mu.Lock()
	defer w.mu.Unlock()
	return string(w.value)
}
