package services

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestParseMCPEnvironment(t *testing.T) {
	values, err := parseMCPEnvironment("TOKEN=abc=123\nEMPTY=\n")
	if err != nil {
		t.Fatal(err)
	}
	if len(values) != 2 || values[0] != "TOKEN=abc=123" || values[1] != "EMPTY=" {
		t.Fatalf("unexpected environment: %#v", values)
	}
}

func TestParseMCPEnvironmentRejectsInvalidName(t *testing.T) {
	if _, err := parseMCPEnvironment("BAD-NAME=value"); err == nil {
		t.Fatal("expected invalid environment name to fail")
	}
}

func TestMCPStdioRejectsInvalidArgumentsBeforeStartingProcess(t *testing.T) {
	result := (&MCPStdioService{}).Connect("does-not-run", "not json", "", "")
	if result.Success || result.Error == "" {
		t.Fatalf("expected invalid args to fail: %#v", result)
	}
}

type stdioEchoArguments struct {
	Text string `json:"text" jsonschema:"text returned by the test server"`
}

func TestMCPStdioHelperProcess(t *testing.T) {
	if os.Getenv("QUICK_MCP_STDIO_TEST_HELPER") != "1" {
		return
	}
	server := mcp.NewServer(&mcp.Implementation{Name: "quick-test-server", Version: "1.0.0"}, nil)
	mcp.AddTool(server, &mcp.Tool{Name: "echo", Description: "echo test text"}, func(_ context.Context, _ *mcp.CallToolRequest, arguments stdioEchoArguments) (*mcp.CallToolResult, any, error) {
		return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: arguments.Text}}}, nil, nil
	})
	if err := server.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		t.Fatal(err)
	}
}

func TestMCPStdioConnectListAndCall(t *testing.T) {
	args, err := json.Marshal([]string{"-test.run=^TestMCPStdioHelperProcess$"})
	if err != nil {
		t.Fatal(err)
	}
	service := &MCPStdioService{}
	defer service.ServiceShutdown()
	connected := service.Connect(os.Args[0], string(args), "QUICK_MCP_STDIO_TEST_HELPER=1", "")
	if !connected.Success {
		t.Fatalf("Connect failed: %s", connected.Error)
	}
	tools := service.ListTools(connected.SessionID)
	if !tools.Success || !strings.Contains(tools.ToolsJSON, `"name":"echo"`) {
		t.Fatalf("ListTools = %#v", tools)
	}
	called := service.CallTool(connected.SessionID, "echo", `{"text":"hello stdio"}`)
	if !called.Success || !strings.Contains(called.ResultJSON, "hello stdio") {
		t.Fatalf("CallTool = %#v", called)
	}
	service.Close(connected.SessionID)
}
