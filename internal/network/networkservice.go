package network

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

const maxHTTPResponseSize = 2 << 20

var validHostPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]*$`)

type NetworkService struct{}

type NetworkResult struct {
	Success    bool   `json:"success"`
	Output     string `json:"output"`
	DurationMS int64  `json:"durationMs"`
}

type HTTPResult struct {
	Success    bool                `json:"success"`
	Status     string              `json:"status"`
	StatusCode int                 `json:"statusCode"`
	Headers    map[string][]string `json:"headers"`
	Body       string              `json:"body"`
	DurationMS int64               `json:"durationMs"`
}

type ProcessInfo struct {
	PID   int    `json:"pid"`
	Name  string `json:"name"`
	Ports []int  `json:"ports"`
}

type ProcessResult struct {
	Success   bool          `json:"success"`
	Processes []ProcessInfo `json:"processes"`
	Output    string        `json:"output"`
}

func normalizeHost(host string) (string, error) {
	host = strings.TrimSpace(host)
	if host == "" || len(host) > 253 || !validHostPattern.MatchString(host) {
		return "", fmt.Errorf("invalid host name or IP address")
	}
	return host, nil
}

func timeoutDuration(timeoutMS int) time.Duration {
	if timeoutMS < 100 {
		timeoutMS = 100
	}
	if timeoutMS > 60000 {
		timeoutMS = 60000
	}
	return time.Duration(timeoutMS) * time.Millisecond
}

func (n *NetworkService) FindProcesses(searchType string, query string) ProcessResult {
	searchType = strings.ToLower(strings.TrimSpace(searchType))
	query = strings.TrimSpace(query)
	if searchType != "pid" && searchType != "port" && searchType != "name" {
		return ProcessResult{Success: false, Output: "search type must be pid, port, or name"}
	}
	processes, err := listLocalProcesses()
	if err != nil {
		return ProcessResult{Success: false, Output: err.Error()}
	}
	if query == "" {
		sort.Slice(processes, func(i, j int) bool { return processes[i].PID < processes[j].PID })
		return ProcessResult{Success: true, Processes: processes, Output: fmt.Sprintf("显示全部 %d 个进程；输入搜索条件后才可关闭进程", len(processes))}
	}
	var numericQuery int
	if searchType != "name" {
		numericQuery, err = strconv.Atoi(query)
		if err != nil || numericQuery < 1 || (searchType == "port" && numericQuery > 65535) {
			return ProcessResult{Success: false, Output: "请输入有效的 PID 或 1–65535 端口"}
		}
	}
	matches := make([]ProcessInfo, 0)
	for _, process := range processes {
		matched := searchType == "pid" && process.PID == numericQuery
		if searchType == "name" {
			matched = strings.Contains(strings.ToLower(process.Name), strings.ToLower(query))
		}
		if searchType == "port" {
			for _, port := range process.Ports {
				if port == numericQuery {
					matched = true
					break
				}
			}
		}
		if matched {
			matches = append(matches, process)
		}
	}
	sort.Slice(matches, func(i, j int) bool { return matches[i].PID < matches[j].PID })
	return ProcessResult{Success: true, Processes: matches, Output: fmt.Sprintf("找到 %d 个进程", len(matches))}
}

func (n *NetworkService) TerminateProcess(pid int) NetworkResult {
	if pid <= 4 || pid == os.Getpid() {
		return NetworkResult{Success: false, Output: "refusing to terminate a system process or Quick itself"}
	}
	process, err := os.FindProcess(pid)
	if err != nil {
		return NetworkResult{Success: false, Output: err.Error()}
	}
	if err = process.Kill(); err != nil {
		return NetworkResult{Success: false, Output: err.Error()}
	}
	return NetworkResult{Success: true, Output: fmt.Sprintf("process %d terminated", pid)}
}

func normalizePingOptions(count int, timeoutMS int, packetSize int) error {
	if count < 1 || count > 20 {
		return fmt.Errorf("ping count must be between 1 and 20")
	}
	if timeoutMS < 100 || timeoutMS > 60000 {
		return fmt.Errorf("ping timeout must be between 100 and 60000 milliseconds")
	}
	if packetSize < 1 || packetSize > 65500 {
		return fmt.Errorf("ping packet size must be between 1 and 65500 bytes")
	}
	return nil
}

func (n *NetworkService) Ping(host string, count int, timeoutMS int, packetSize int) NetworkResult {
	start := time.Now()
	normalized, err := normalizeHost(host)
	if err != nil {
		return NetworkResult{Success: false, Output: err.Error()}
	}
	if err := normalizePingOptions(count, timeoutMS, packetSize); err != nil {
		return NetworkResult{Success: false, Output: err.Error()}
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeoutDuration(timeoutMS))
	defer cancel()
	output, err := runPing(ctx, normalized, count, timeoutMS, packetSize)
	if ctx.Err() == context.DeadlineExceeded {
		return NetworkResult{Success: false, Output: "ping timed out", DurationMS: time.Since(start).Milliseconds()}
	}
	return NetworkResult{Success: err == nil, Output: strings.TrimSpace(output), DurationMS: time.Since(start).Milliseconds()}
}

func (n *NetworkService) CheckPort(host string, port int, timeoutMS int) NetworkResult {
	start := time.Now()
	normalized, err := normalizeHost(host)
	if err != nil {
		return NetworkResult{Success: false, Output: err.Error()}
	}
	if port < 1 || port > 65535 {
		return NetworkResult{Success: false, Output: "port must be between 1 and 65535"}
	}
	address := net.JoinHostPort(normalized, strconv.Itoa(port))
	connection, err := net.DialTimeout("tcp", address, timeoutDuration(timeoutMS))
	if err != nil {
		return NetworkResult{Success: false, Output: err.Error(), DurationMS: time.Since(start).Milliseconds()}
	}
	defer connection.Close()
	return NetworkResult{Success: true, Output: fmt.Sprintf("connected to %s", address), DurationMS: time.Since(start).Milliseconds()}
}

func (n *NetworkService) DNSQuery(host string, recordType string, timeoutMS int) NetworkResult {
	start := time.Now()
	normalized, err := normalizeHost(host)
	if err != nil {
		return NetworkResult{Success: false, Output: err.Error()}
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeoutDuration(timeoutMS))
	defer cancel()
	resolver := net.DefaultResolver
	var values []string
	switch strings.ToUpper(strings.TrimSpace(recordType)) {
	case "A", "AAAA":
		addresses, lookupErr := resolver.LookupIPAddr(ctx, normalized)
		err = lookupErr
		for _, address := range addresses {
			isIPv4 := address.IP.To4() != nil
			if (strings.EqualFold(recordType, "A") && isIPv4) || (strings.EqualFold(recordType, "AAAA") && !isIPv4) {
				values = append(values, address.IP.String())
			}
		}
	case "CNAME":
		var value string
		value, err = resolver.LookupCNAME(ctx, normalized)
		if err == nil {
			values = append(values, value)
		}
	case "MX":
		var records []*net.MX
		records, err = resolver.LookupMX(ctx, normalized)
		for _, record := range records {
			values = append(values, fmt.Sprintf("%d %s", record.Pref, record.Host))
		}
	case "NS":
		var records []*net.NS
		records, err = resolver.LookupNS(ctx, normalized)
		for _, record := range records {
			values = append(values, record.Host)
		}
	case "TXT":
		values, err = resolver.LookupTXT(ctx, normalized)
	default:
		return NetworkResult{Success: false, Output: "record type must be A, AAAA, CNAME, MX, NS, or TXT"}
	}
	if err != nil {
		return NetworkResult{Success: false, Output: err.Error(), DurationMS: time.Since(start).Milliseconds()}
	}
	sort.Strings(values)
	if len(values) == 0 {
		return NetworkResult{Success: false, Output: "no matching records", DurationMS: time.Since(start).Milliseconds()}
	}
	return NetworkResult{Success: true, Output: strings.Join(values, "\n"), DurationMS: time.Since(start).Milliseconds()}
}

func ParseHeaders(value string) (http.Header, error) {
	headers := make(http.Header)
	scanner := bufio.NewScanner(strings.NewReader(value))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		name, headerValue, found := strings.Cut(line, ":")
		if !found || strings.TrimSpace(name) == "" {
			return nil, fmt.Errorf("invalid header line: %s", line)
		}
		headers.Add(strings.TrimSpace(name), strings.TrimSpace(headerValue))
	}
	return headers, scanner.Err()
}

func ProxyFunction(mode string, customURL string) (func(*http.Request) (*url.URL, error), error) {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "", "system":
		return http.ProxyFromEnvironment, nil
	case "none":
		return nil, nil
	case "custom":
		parsed, err := url.Parse(strings.TrimSpace(customURL))
		if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https" && parsed.Scheme != "socks5") {
			return nil, fmt.Errorf("custom proxy must be a valid http, https, or socks5 URL")
		}
		return http.ProxyURL(parsed), nil
	default:
		return nil, fmt.Errorf("proxy mode must be system, custom, or none")
	}
}

func (n *NetworkService) HTTPRequest(method string, targetURL string, headersText string, body string, proxyMode string, proxyURL string, timeoutMS int) HTTPResult {
	start := time.Now()
	parsedURL, err := url.Parse(strings.TrimSpace(targetURL))
	if err != nil || parsedURL.Host == "" || (parsedURL.Scheme != "http" && parsedURL.Scheme != "https") {
		return HTTPResult{Success: false, Body: "URL must use http or https"}
	}
	method = strings.ToUpper(strings.TrimSpace(method))
	if method == "" {
		method = http.MethodGet
	}
	request, err := http.NewRequest(method, parsedURL.String(), strings.NewReader(body))
	if err != nil {
		return HTTPResult{Success: false, Body: err.Error()}
	}
	headers, err := ParseHeaders(headersText)
	if err != nil {
		return HTTPResult{Success: false, Body: err.Error()}
	}
	request.Header = headers
	proxy, err := ProxyFunction(proxyMode, proxyURL)
	if err != nil {
		return HTTPResult{Success: false, Body: err.Error()}
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = proxy
	client := &http.Client{Transport: transport, Timeout: timeoutDuration(timeoutMS)}
	response, err := client.Do(request)
	if err != nil {
		return HTTPResult{Success: false, Body: err.Error(), DurationMS: time.Since(start).Milliseconds()}
	}
	defer response.Body.Close()
	limited := io.LimitReader(response.Body, maxHTTPResponseSize+1)
	responseBody, err := io.ReadAll(limited)
	if err != nil {
		return HTTPResult{Success: false, Status: response.Status, StatusCode: response.StatusCode, Body: err.Error(), DurationMS: time.Since(start).Milliseconds()}
	}
	truncated := len(responseBody) > maxHTTPResponseSize
	if truncated {
		responseBody = responseBody[:maxHTTPResponseSize]
	}
	bodyText := string(responseBody)
	if truncated {
		bodyText += "\n\n[response truncated at 2 MiB]"
	}
	return HTTPResult{
		Success:    response.StatusCode >= 200 && response.StatusCode < 400,
		Status:     response.Status,
		StatusCode: response.StatusCode,
		Headers:    response.Header,
		Body:       bodyText,
		DurationMS: time.Since(start).Milliseconds(),
	}
}
