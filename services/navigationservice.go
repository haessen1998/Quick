package services

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"golang.org/x/net/html"
)

const maxNavigationPageSize = 1 << 20

type NavigationService struct {
	client *http.Client
}

func NewNavigationService() *NavigationService {
	return &NavigationService{client: &http.Client{Timeout: 8 * time.Second}}
}

func normalizeSiteURL(value string) (*url.URL, error) {
	value = strings.TrimSpace(value)
	if !strings.Contains(value, "://") {
		value = "https://" + value
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return nil, fmt.Errorf("invalid HTTP or HTTPS site URL")
	}
	return parsed, nil
}

func defaultSiteIcon(site *url.URL) string {
	return site.ResolveReference(&url.URL{Path: "/favicon.ico"}).String()
}

// DiscoverSiteIcon reads the site's declared icon URL. It returns the
// conventional /favicon.ico URL when the page is unavailable or has no icon
// declaration, allowing the frontend image element to perform the final check.
func (s *NavigationService) DiscoverSiteIcon(value string) (string, error) {
	site, err := normalizeSiteURL(value)
	if err != nil {
		return "", err
	}
	fallback := defaultSiteIcon(site)
	request, err := http.NewRequest(http.MethodGet, site.String(), nil)
	if err != nil {
		return fallback, nil
	}
	request.Header.Set("User-Agent", "Quick/0.1 site-icon-discovery")
	response, err := s.client.Do(request)
	if err != nil {
		return fallback, nil
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 400 {
		return fallback, nil
	}
	baseURL := response.Request.URL
	tokenizer := html.NewTokenizer(io.LimitReader(response.Body, maxNavigationPageSize))
	for {
		tokenType := tokenizer.Next()
		if tokenType == html.ErrorToken {
			return fallback, nil
		}
		if tokenType != html.StartTagToken && tokenType != html.SelfClosingTagToken {
			continue
		}
		token := tokenizer.Token()
		if token.Data == "body" {
			return fallback, nil
		}
		if token.Data != "link" {
			continue
		}
		var relation, href string
		for _, attribute := range token.Attr {
			switch strings.ToLower(attribute.Key) {
			case "rel":
				relation = strings.ToLower(attribute.Val)
			case "href":
				href = strings.TrimSpace(attribute.Val)
			}
		}
		if href == "" || !strings.Contains(relation, "icon") || strings.HasPrefix(strings.ToLower(href), "data:") {
			continue
		}
		iconURL, err := url.Parse(href)
		if err != nil {
			continue
		}
		resolved := baseURL.ResolveReference(iconURL)
		if resolved.Scheme == "http" || resolved.Scheme == "https" {
			return resolved.String(), nil
		}
	}
}
