//go:build windows

package main

import (
	"context"
	"os/exec"
	"strconv"
)

func runPing(ctx context.Context, host string, timeoutMS int) (string, error) {
	command := exec.CommandContext(ctx, "ping", "-n", "1", "-w", strconv.Itoa(timeoutMS), host)
	output, err := command.CombinedOutput()
	return string(output), err
}
