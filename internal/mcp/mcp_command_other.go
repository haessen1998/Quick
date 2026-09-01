//go:build !windows

package mcp

import "os/exec"

func configureMCPCommand(_ *exec.Cmd) {}
