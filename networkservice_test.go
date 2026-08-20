package main

import (
	"os"
	"strconv"
	"testing"
)

func TestFindProcessesByCurrentPID(t *testing.T) {
	service := &NetworkService{}
	result := service.FindProcesses("pid", strconv.Itoa(os.Getpid()))
	if !result.Success {
		t.Fatalf("process search failed: %s", result.Output)
	}
	if len(result.Processes) != 1 || result.Processes[0].PID != os.Getpid() {
		t.Fatalf("expected current process, got %#v", result.Processes)
	}
}

func TestTerminateProcessRefusesCurrentProcess(t *testing.T) {
	result := (&NetworkService{}).TerminateProcess(os.Getpid())
	if result.Success {
		t.Fatal("expected the service to refuse terminating itself")
	}
}

func TestFindProcessesRejectsInvalidPort(t *testing.T) {
	result := (&NetworkService{}).FindProcesses("port", "70000")
	if result.Success {
		t.Fatal("expected invalid port to be rejected")
	}
}
