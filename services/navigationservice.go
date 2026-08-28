package services

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"golang.org/x/net/html"
)

const maxNavigationPageSize = 1 << 20
const NavigationGroupsChangedEvent = "navigation-groups-changed"

type NavigationItem struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	URL         string `json:"url"`
	Icon        string `json:"icon"`
	Description string `json:"description"`
	List        string `json:"list"`
	Size        string `json:"size"`
}

type NavigationGroup struct {
	ID    string           `json:"id"`
	Name  string           `json:"name"`
	Items []NavigationItem `json:"items"`
}

// NavigationBatchUpdateRequest selects sites by exact IDs/titles and/or their
// current group/list. Source filters are combined with the ID/title selector.
// SetTargetList allows an empty TargetList to explicitly remove a site from a
// list. The other Set* fields similarly distinguish "clear" from "unchanged".
type NavigationBatchUpdateRequest struct {
	IDs             []string `json:"ids,omitempty"`
	Titles          []string `json:"titles,omitempty"`
	SourceGroup     string   `json:"sourceGroup,omitempty"`
	SourceList      string   `json:"sourceList,omitempty"`
	MatchSourceList bool     `json:"matchSourceList,omitempty"`
	TargetGroup     string   `json:"targetGroup,omitempty"`
	TargetList      string   `json:"targetList,omitempty"`
	SetTargetList   bool     `json:"setTargetList,omitempty"`
	Title           string   `json:"title,omitempty"`
	SetTitle        bool     `json:"setTitle,omitempty"`
	URL             string   `json:"url,omitempty"`
	SetURL          bool     `json:"setUrl,omitempty"`
	Icon            string   `json:"icon,omitempty"`
	SetIcon         bool     `json:"setIcon,omitempty"`
	Description     string   `json:"description,omitempty"`
	SetDescription  bool     `json:"setDescription,omitempty"`
	Size            string   `json:"size,omitempty"`
	SetSize         bool     `json:"setSize,omitempty"`
}

type NavigationSiteChange struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	FromGroup   string `json:"fromGroup"`
	FromList    string `json:"fromList"`
	TargetGroup string `json:"targetGroup"`
	TargetList  string `json:"targetList"`
}

type NavigationBatchUpdateResult struct {
	Updated int                    `json:"updated"`
	Sites   []NavigationSiteChange `json:"sites"`
	Groups  []NavigationGroup      `json:"groups"`
}

type NavigationService struct {
	client *http.Client
	config *ConfigService
	app    *application.App
	mu     sync.Mutex
}

func NewNavigationService(config *ConfigService, app *application.App) *NavigationService {
	return &NavigationService{client: &http.Client{Timeout: 8 * time.Second}, config: config, app: app}
}

func defaultNavigationGroups() []NavigationGroup {
	return []NavigationGroup{
		{ID: "quick", Name: "Quick", Items: []NavigationItem{
			{ID: "quick-github", Title: "Quick GitHub", URL: "https://github.com/haessen1998/Quick", Description: "源码、Issue 与版本发布", Size: "2x2"},
			{ID: "wails-docs", Title: "Wails 3", URL: "https://v3.wails.io/", Description: "Wails 3 官方文档", Size: "4x2"},
		}},
		{ID: "other", Name: "Other", Items: []NavigationItem{}},
	}
}

func validNavigationSize(value string) bool {
	return value == "1x1" || value == "2x2" || value == "4x2"
}

func normalizeNavigationGroups(groups []NavigationGroup) error {
	for groupIndex := range groups {
		group := &groups[groupIndex]
		group.ID = strings.TrimSpace(group.ID)
		group.Name = strings.TrimSpace(group.Name)
		if group.ID == "" || group.Name == "" {
			return fmt.Errorf("navigation groups require an id and name")
		}
		if group.Items == nil {
			group.Items = []NavigationItem{}
		}
		for itemIndex := range group.Items {
			item := &group.Items[itemIndex]
			item.ID = strings.TrimSpace(item.ID)
			item.Title = strings.TrimSpace(item.Title)
			item.List = strings.TrimSpace(item.List)
			item.Description = strings.TrimSpace(item.Description)
			if item.ID == "" || item.Title == "" {
				return fmt.Errorf("navigation sites require an id and title")
			}
			parsed, err := normalizeSiteURL(item.URL)
			if err != nil {
				return fmt.Errorf("site %q: %w", item.Title, err)
			}
			item.URL = parsed.String()
			if !validNavigationSize(item.Size) {
				item.Size = "2x2"
			}
		}
	}
	return nil
}

func (s *NavigationService) loadNavigationGroups() ([]NavigationGroup, error) {
	if s.config == nil {
		return nil, fmt.Errorf("navigation persistence is unavailable")
	}
	raw, err := s.config.Load("navigation-groups")
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(raw) == "" {
		groups := defaultNavigationGroups()
		if err := s.saveNavigationGroups(groups); err != nil {
			return nil, err
		}
		return groups, nil
	}
	var groups []NavigationGroup
	if err := json.Unmarshal([]byte(raw), &groups); err != nil {
		return nil, fmt.Errorf("parse navigation groups: %w", err)
	}
	if err := normalizeNavigationGroups(groups); err != nil {
		return nil, err
	}
	return groups, nil
}

func (s *NavigationService) saveNavigationGroups(groups []NavigationGroup) error {
	data, err := json.Marshal(groups)
	if err != nil {
		return fmt.Errorf("encode navigation groups: %w", err)
	}
	if err := s.config.Save("navigation-groups", string(data)); err != nil {
		return err
	}
	if s.app != nil {
		s.app.Event.Emit(NavigationGroupsChangedEvent, string(data))
	}
	return nil
}

// GetNavigationGroups returns the durable navigation configuration. It does
// not depend on the navigation page being mounted in the frontend.
func (s *NavigationService) GetNavigationGroups() ([]NavigationGroup, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.loadNavigationGroups()
}

func equalFoldTrimmed(left, right string) bool {
	return strings.EqualFold(strings.TrimSpace(left), strings.TrimSpace(right))
}

// BatchUpdateSites edits or moves one or many durable navigation records in a
// single transaction. Selecting only SourceGroup moves every site in that Tab;
// adding MatchSourceList narrows it to one list (including the empty list).
func (s *NavigationService) BatchUpdateSites(request NavigationBatchUpdateRequest) (NavigationBatchUpdateResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	result := NavigationBatchUpdateResult{Sites: []NavigationSiteChange{}}
	if len(request.IDs) == 0 && len(request.Titles) == 0 && strings.TrimSpace(request.SourceGroup) == "" && !request.MatchSourceList {
		return result, fmt.Errorf("select sites by ids, titles, sourceGroup, or sourceList")
	}
	if request.SetSize && !validNavigationSize(request.Size) {
		return result, fmt.Errorf("navigation size must be 1x1, 2x2, or 4x2")
	}
	groups, err := s.loadNavigationGroups()
	if err != nil {
		return result, err
	}
	targetGroupIndex := -1
	if strings.TrimSpace(request.TargetGroup) != "" {
		for index := range groups {
			if equalFoldTrimmed(groups[index].Name, request.TargetGroup) {
				targetGroupIndex = index
				break
			}
		}
		if targetGroupIndex < 0 {
			return result, fmt.Errorf("target navigation group %q does not exist", request.TargetGroup)
		}
	}
	idSet := map[string]struct{}{}
	for _, id := range request.IDs {
		idSet[strings.TrimSpace(id)] = struct{}{}
	}
	titleSet := map[string]struct{}{}
	for _, title := range request.Titles {
		titleSet[strings.ToLower(strings.TrimSpace(title))] = struct{}{}
	}
	hasIdentitySelector := len(idSet) > 0 || len(titleSet) > 0
	type location struct{ group, item int }
	locations := []location{}
	for groupIndex, group := range groups {
		if strings.TrimSpace(request.SourceGroup) != "" && !equalFoldTrimmed(group.Name, request.SourceGroup) {
			continue
		}
		for itemIndex, item := range group.Items {
			if request.MatchSourceList && !equalFoldTrimmed(item.List, request.SourceList) {
				continue
			}
			if hasIdentitySelector {
				_, idMatches := idSet[item.ID]
				_, titleMatches := titleSet[strings.ToLower(strings.TrimSpace(item.Title))]
				if !idMatches && !titleMatches {
					continue
				}
			}
			locations = append(locations, location{group: groupIndex, item: itemIndex})
		}
	}
	if len(locations) == 0 {
		return result, fmt.Errorf("no navigation sites matched the selection")
	}
	if len(locations) > 1 && (request.SetTitle || request.SetURL) {
		return result, fmt.Errorf("title and URL can only be changed when exactly one site is selected")
	}
	if request.SetTitle && strings.TrimSpace(request.Title) == "" {
		return result, fmt.Errorf("navigation site title cannot be empty")
	}
	var normalizedURL string
	if request.SetURL {
		parsed, err := normalizeSiteURL(request.URL)
		if err != nil {
			return result, err
		}
		normalizedURL = parsed.String()
	}
	selected := map[string]struct{}{}
	for _, value := range locations {
		selected[fmt.Sprintf("%d:%d", value.group, value.item)] = struct{}{}
	}
	moved := []NavigationItem{}
	for groupIndex := range groups {
		originalItems := groups[groupIndex].Items
		kept := make([]NavigationItem, 0, len(originalItems))
		for itemIndex, original := range originalItems {
			if _, ok := selected[fmt.Sprintf("%d:%d", groupIndex, itemIndex)]; !ok {
				kept = append(kept, original)
				continue
			}
			updated := original
			if request.SetTitle {
				updated.Title = strings.TrimSpace(request.Title)
			}
			if request.SetURL {
				updated.URL = normalizedURL
				if !request.SetIcon {
					updated.Icon = ""
				}
			}
			if request.SetIcon {
				updated.Icon = strings.TrimSpace(request.Icon)
			}
			if request.SetDescription {
				updated.Description = strings.TrimSpace(request.Description)
			}
			if request.SetSize {
				updated.Size = request.Size
			}
			if request.SetTargetList {
				updated.List = strings.TrimSpace(request.TargetList)
			}
			destinationGroup := groupIndex
			if targetGroupIndex >= 0 {
				destinationGroup = targetGroupIndex
			}
			result.Sites = append(result.Sites, NavigationSiteChange{ID: updated.ID, Title: updated.Title, FromGroup: groups[groupIndex].Name, FromList: original.List, TargetGroup: groups[destinationGroup].Name, TargetList: updated.List})
			if destinationGroup == groupIndex {
				kept = append(kept, updated)
			} else {
				moved = append(moved, updated)
			}
		}
		groups[groupIndex].Items = kept
	}
	if targetGroupIndex >= 0 && len(moved) > 0 {
		groups[targetGroupIndex].Items = append(groups[targetGroupIndex].Items, moved...)
	}
	if err := s.saveNavigationGroups(groups); err != nil {
		return NavigationBatchUpdateResult{}, err
	}
	result.Updated = len(result.Sites)
	result.Groups = groups
	return result, nil
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
