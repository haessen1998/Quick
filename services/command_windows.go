//go:build windows

package services

import (
	"context"
	"os/exec"
	"syscall"
)

const createNoWindow = 0x08000000

func hiddenWindowsCommand(name string, args ...string) *exec.Cmd {
	return configureHiddenWindowsCommand(exec.Command(name, args...))
}

func hiddenWindowsCommandContext(ctx context.Context, name string, args ...string) *exec.Cmd {
	return configureHiddenWindowsCommand(exec.CommandContext(ctx, name, args...))
}

func configureHiddenWindowsCommand(command *exec.Cmd) *exec.Cmd {
	command.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: createNoWindow,
	}
	return command
}
