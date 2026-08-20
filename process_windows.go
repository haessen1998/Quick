//go:build windows

package main

import (
	"encoding/csv"
	"fmt"
	"net"
	"os/exec"
	"sort"
	"strconv"
	"strings"
)

func listLocalProcesses() ([]ProcessInfo, error) {
	processOutput, err := exec.Command("tasklist", "/FO", "CSV", "/NH").Output()
	if err != nil {
		return nil, fmt.Errorf("tasklist failed: %w", err)
	}
	portOutput, _ := exec.Command("netstat", "-ano", "-p", "tcp").Output()
	portsByPID := make(map[int]map[int]struct{})
	for _, line := range strings.Split(string(portOutput), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 4 || !strings.EqualFold(fields[0], "TCP") {
			continue
		}
		pid, pidErr := strconv.Atoi(fields[len(fields)-1])
		_, portText, splitErr := net.SplitHostPort(fields[1])
		port, portErr := strconv.Atoi(portText)
		if pidErr != nil || splitErr != nil || portErr != nil {
			continue
		}
		if portsByPID[pid] == nil {
			portsByPID[pid] = make(map[int]struct{})
		}
		portsByPID[pid][port] = struct{}{}
	}
	reader := csv.NewReader(strings.NewReader(string(processOutput)))
	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("unable to parse tasklist: %w", err)
	}
	processes := make([]ProcessInfo, 0, len(records))
	for _, record := range records {
		if len(record) < 2 {
			continue
		}
		pid, parseErr := strconv.Atoi(strings.TrimSpace(record[1]))
		if parseErr != nil {
			continue
		}
		ports := make([]int, 0, len(portsByPID[pid]))
		for port := range portsByPID[pid] {
			ports = append(ports, port)
		}
		sort.Ints(ports)
		processes = append(processes, ProcessInfo{PID: pid, Name: strings.TrimSpace(record[0]), Ports: ports})
	}
	return processes, nil
}
