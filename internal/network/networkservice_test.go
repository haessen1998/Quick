package network

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

func TestPingRejectsInvalidOptions(t *testing.T) {
	service := &NetworkService{}
	tests := []struct {
		name       string
		count      int
		timeoutMS  int
		packetSize int
	}{
		{name: "count", count: 0, timeoutMS: 1000, packetSize: 32},
		{name: "timeout", count: 1, timeoutMS: 99, packetSize: 32},
		{name: "packet size", count: 1, timeoutMS: 1000, packetSize: 65501},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			result := service.Ping("127.0.0.1", test.count, test.timeoutMS, test.packetSize)
			if result.Success || result.Output == "" {
				t.Fatalf("Ping() = %#v", result)
			}
		})
	}
}

func TestFindProcessesWithEmptyQueryReturnsAll(t *testing.T) {
	result := (&NetworkService{}).FindProcesses("name", "")
	if !result.Success {
		t.Fatalf("empty query should list all processes: %s", result.Output)
	}
	if len(result.Processes) == 0 {
		t.Fatal("expected at least one local process")
	}
}
