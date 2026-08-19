//go:build !windows

package main

import (
	"context"
	"os/exec"
)

func runPing(ctx context.Context, host string, timeoutMS int) (string, error) {
	command := exec.CommandContext(ctx, "ping", "-c", "1", host)
	output, err := command.CombinedOutput()
	return string(output), err
}
