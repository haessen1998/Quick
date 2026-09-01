//go:build !windows

package network

import (
	"context"
	"os/exec"
	"strconv"
)

func runPing(ctx context.Context, host string, count int, timeoutMS int, packetSize int) (string, error) {
	command := exec.CommandContext(ctx, "ping", "-c", strconv.Itoa(count), "-s", strconv.Itoa(packetSize), host)
	output, err := command.CombinedOutput()
	return string(output), err
}
