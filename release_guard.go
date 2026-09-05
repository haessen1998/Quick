//go:build production && mcp

package main

// A production artifact must never contain Wails' unauthenticated debug MCP.
// Use a development build (without the production tag) for MCP A/B tests.
var _ = PRODUCTION_BUILDS_MUST_NOT_ENABLE_DEBUG_MCP
