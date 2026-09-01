//go:build !windows

package network

import (
	"bufio"
	"fmt"
	"os/exec"
	"sort"
	"strconv"
	"strings"
)

func listLocalProcesses() ([]ProcessInfo, error) {
	output, err := exec.Command("ps", "-eo", "pid=,comm=").Output()
	if err != nil {
		return nil, fmt.Errorf("ps failed: %w", err)
	}
	portsByPID := make(map[int]map[int]struct{})
	if portOutput, portErr := exec.Command("lsof", "-nP", "-iTCP", "-Fpcn").Output(); portErr == nil {
		pid := 0
		for _, line := range strings.Split(string(portOutput), "\n") {
			if strings.HasPrefix(line, "p") {
				pid, _ = strconv.Atoi(strings.TrimPrefix(line, "p"))
			}
			if strings.HasPrefix(line, "n") && pid > 0 {
				address := strings.TrimPrefix(line, "n")
				if colon := strings.LastIndex(address, ":"); colon >= 0 {
					portText := strings.Fields(address[colon+1:])[0]
					if port, parseErr := strconv.Atoi(portText); parseErr == nil {
						if portsByPID[pid] == nil {
							portsByPID[pid] = make(map[int]struct{})
						}
						portsByPID[pid][port] = struct{}{}
					}
				}
			}
		}
	}
	processes := make([]ProcessInfo, 0)
	scanner := bufio.NewScanner(strings.NewReader(string(output)))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 2 {
			continue
		}
		pid, parseErr := strconv.Atoi(fields[0])
		if parseErr != nil {
			continue
		}
		ports := make([]int, 0, len(portsByPID[pid]))
		for port := range portsByPID[pid] {
			ports = append(ports, port)
		}
		sort.Ints(ports)
		processes = append(processes, ProcessInfo{PID: pid, Name: strings.Join(fields[1:], " "), Ports: ports})
	}
	return processes, scanner.Err()
}
