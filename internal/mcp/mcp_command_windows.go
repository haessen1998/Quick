//go:build windows

package mcp

import (
	"os/exec"
	"syscall"
)

func configureMCPCommand(command *exec.Cmd) {
	command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
}
