//go:build !windows

package services

import "os/exec"

func configureMCPCommand(_ *exec.Cmd) {}
