package navigation

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"hash/crc32"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"golang.org/x/net/html"
)

const maxNavigationPageSize = 1 << 20
const maxNavigationIconSize = 2 << 20
const maxLocalNavigationIconSize = 5 << 20
const maxLocalNavigationIconDimension = 8192
const NavigationGroupsChangedEvent = "navigation-groups-changed"
const navigationIconCachePrefix = "quick-icon:"

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
	client        *http.Client
	config        navigationConfigStore
	app           *application.App
	iconDirectory string
	mu            sync.Mutex
	iconMu        sync.Mutex
}

type navigationConfigStore interface {
	Load(key string) (string, error)
	Save(key string, value string) error
}

func NewNavigationService(config navigationConfigStore, app *application.App) *NavigationService {
	directory, _ := quickNavigationIconDirectory()
	return &NavigationService{client: &http.Client{Timeout: 8 * time.Second}, config: config, app: app, iconDirectory: directory}
}

func defaultNavigationGroups() []NavigationGroup {
	return []NavigationGroup{
		{ID: "quick", Name: "Quick", Items: []NavigationItem{
			{ID: "quick-github", Title: "Quick GitHub", URL: "https://github.com/haessen1998/Quick", Description: "源码、Issue 与版本发布", Size: "2x2"},
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

func (s *NavigationService) declaredSiteIcon(site *url.URL) string {
	request, err := http.NewRequest(http.MethodGet, site.String(), nil)
	if err != nil {
		return ""
	}
	request.Header.Set("User-Agent", "Quick site-icon-discovery")
	response, err := s.client.Do(request)
	if err != nil {
		return ""
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 400 {
		return ""
	}
	baseURL := response.Request.URL
	tokenizer := html.NewTokenizer(io.LimitReader(response.Body, maxNavigationPageSize))
	for {
		tokenType := tokenizer.Next()
		if tokenType == html.ErrorToken {
			return ""
		}
		if tokenType != html.StartTagToken && tokenType != html.SelfClosingTagToken {
			continue
		}
		token := tokenizer.Token()
		if token.Data == "body" {
			return ""
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
			return resolved.String()
		}
	}
}

func detectNavigationIcon(data []byte) (extension string, mediaType string, err error) {
	if len(data) == 0 {
		return "", "", fmt.Errorf("icon response is empty")
	}
	if validPNG(data) {
		return "png", "image/png", nil
	}
	if len(data) >= 4 && bytes.Equal(data[:3], []byte{'\xff', '\xd8', '\xff'}) && bytes.Equal(data[len(data)-2:], []byte{'\xff', '\xd9'}) {
		return "jpg", "image/jpeg", nil
	}
	if len(data) >= 10 && (bytes.Equal(data[:6], []byte("GIF87a")) || bytes.Equal(data[:6], []byte("GIF89a"))) && binary.LittleEndian.Uint16(data[6:8]) > 0 && binary.LittleEndian.Uint16(data[8:10]) > 0 {
		return "gif", "image/gif", nil
	}
	if len(data) >= 16 && bytes.Equal(data[:4], []byte("RIFF")) && bytes.Equal(data[8:12], []byte("WEBP")) && int(binary.LittleEndian.Uint32(data[4:8]))+8 == len(data) && (bytes.Equal(data[12:16], []byte("VP8 ")) || bytes.Equal(data[12:16], []byte("VP8L")) || bytes.Equal(data[12:16], []byte("VP8X"))) {
		return "webp", "image/webp", nil
	}
	if len(data) >= 6 && bytes.Equal(data[:4], []byte{0, 0, 1, 0}) {
		count := int(binary.LittleEndian.Uint16(data[4:6]))
		directoryEnd := 6 + count*16
		if count > 0 && directoryEnd <= len(data) {
			valid := true
			for index := 0; index < count; index++ {
				entry := 6 + index*16
				size := int(binary.LittleEndian.Uint32(data[entry+8 : entry+12]))
				offset := int(binary.LittleEndian.Uint32(data[entry+12 : entry+16]))
				if size <= 0 || offset < directoryEnd || offset > len(data)-size || !validICOPayload(data[offset:offset+size]) {
					valid = false
					break
				}
			}
			if valid {
				return "ico", "image/x-icon", nil
			}
		}
	}
	trimmed := bytes.TrimSpace(bytes.TrimPrefix(data, []byte{'\xef', '\xbb', '\xbf'}))
	if validSVG(trimmed) {
		return "svg", "image/svg+xml", nil
	}
	return "", "", fmt.Errorf("downloaded file is not a supported image")
}

func validPNG(data []byte) bool {
	if len(data) < 33 || !bytes.Equal(data[:8], []byte{'\x89', 'P', 'N', 'G', '\r', '\n', '\x1a', '\n'}) || binary.BigEndian.Uint32(data[8:12]) != 13 || !bytes.Equal(data[12:16], []byte("IHDR")) {
		return false
	}
	if binary.BigEndian.Uint32(data[16:20]) == 0 || binary.BigEndian.Uint32(data[20:24]) == 0 {
		return false
	}
	return crc32.ChecksumIEEE(data[12:29]) == binary.BigEndian.Uint32(data[29:33])
}

func validICOPayload(data []byte) bool {
	if validPNG(data) {
		return true
	}
	if len(data) < 12 {
		return false
	}
	headerSize := int(binary.LittleEndian.Uint32(data[:4]))
	if headerSize == 12 {
		return len(data) >= headerSize && binary.LittleEndian.Uint16(data[4:6]) > 0 && binary.LittleEndian.Uint16(data[6:8]) > 0
	}
	if headerSize != 40 && headerSize != 52 && headerSize != 56 && headerSize != 64 && headerSize != 108 && headerSize != 124 {
		return false
	}
	return len(data) >= headerSize && binary.LittleEndian.Uint32(data[4:8]) > 0 && binary.LittleEndian.Uint32(data[8:12]) > 0
}

func validSVG(data []byte) bool {
	decoder := xml.NewDecoder(bytes.NewReader(data))
	foundRoot := false
	for {
		token, err := decoder.Token()
		if err == io.EOF {
			return foundRoot
		}
		if err != nil {
			return false
		}
		if start, ok := token.(xml.StartElement); ok && !foundRoot {
			if !strings.EqualFold(start.Name.Local, "svg") {
				return false
			}
			foundRoot = true
		}
	}
}

func (s *NavigationService) cacheDirectory() (string, error) {
	if strings.TrimSpace(s.iconDirectory) == "" {
		return "", fmt.Errorf("navigation icon cache is unavailable")
	}
	return s.iconDirectory, nil
}

// ImportLocalIcon opens a native file picker, validates the selected file by
// content instead of extension/MIME metadata, and stores it beside downloaded
// navigation icons. An empty result means the user cancelled the picker.
func (s *NavigationService) ImportLocalIcon() (string, error) {
	if s.app == nil {
		return "", fmt.Errorf("应用尚未初始化")
	}
	path, err := s.app.Dialog.OpenFile().
		SetTitle("选择导航图标").
		CanChooseDirectories(false).
		CanChooseFiles(true).
		AllowsOtherFileTypes(false).
		AddFilter("图片文件", "*.png;*.jpg;*.jpeg;*.gif;*.webp;*.ico;*.svg").
		PromptForSingleSelection()
	if err != nil || path == "" {
		return "", err
	}
	file, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("打开图片失败：%w", err)
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxLocalNavigationIconSize+1))
	if err != nil {
		return "", fmt.Errorf("读取图片失败：%w", err)
	}
	if len(data) > maxLocalNavigationIconSize {
		return "", fmt.Errorf("图片不能超过 5 MB")
	}
	extension, mediaType, err := detectNavigationIcon(data)
	if err != nil {
		return "", fmt.Errorf("不是有效的导航图片：%w", err)
	}
	if mediaType == "image/png" || mediaType == "image/jpeg" || mediaType == "image/gif" {
		config, _, configErr := image.DecodeConfig(bytes.NewReader(data))
		if configErr != nil || config.Width < 1 || config.Height < 1 {
			return "", fmt.Errorf("无法解析图片尺寸")
		}
		if config.Width > maxLocalNavigationIconDimension || config.Height > maxLocalNavigationIconDimension {
			return "", fmt.Errorf("图片尺寸不能超过 %d × %d", maxLocalNavigationIconDimension, maxLocalNavigationIconDimension)
		}
	}
	directory, err := s.cacheDirectory()
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return "", fmt.Errorf("创建导航图标目录失败：%w", err)
	}
	contentHash := sha256.Sum256(data)
	fileName := fmt.Sprintf("local-%x.%s", contentHash[:16], extension)
	if err := os.WriteFile(filepath.Join(directory, fileName), data, 0o600); err != nil {
		return "", fmt.Errorf("保存导航图标失败：%w", err)
	}
	return navigationIconCachePrefix + fileName, nil
}

func quickNavigationIconDirectory() (string, error) {
	if runtime.GOOS == "windows" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("resolve user home: %w", err)
		}
		return filepath.Join(home, "AppData", "Roaming", "Quick", "navigation-icons"), nil
	}
	directory, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("resolve user config directory: %w", err)
	}
	return filepath.Join(directory, "Quick", "navigation-icons"), nil
}

func (s *NavigationService) downloadAndCacheSiteIcon(site *url.URL, iconURL string) (string, error) {
	request, err := http.NewRequest(http.MethodGet, iconURL, nil)
	if err != nil {
		return "", err
	}
	request.Header.Set("Accept", "image/avif,image/webp,image/svg+xml,image/*;q=0.9,*/*;q=0.1")
	request.Header.Set("User-Agent", "Quick site-icon-cache")
	response, err := s.client.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", fmt.Errorf("icon request returned HTTP %d", response.StatusCode)
	}
	if response.ContentLength > maxNavigationIconSize {
		return "", fmt.Errorf("icon is larger than 2 MiB")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, maxNavigationIconSize+1))
	if err != nil {
		return "", fmt.Errorf("read site icon: %w", err)
	}
	if len(data) > maxNavigationIconSize {
		return "", fmt.Errorf("icon is larger than 2 MiB")
	}
	extension, _, err := detectNavigationIcon(data)
	if err != nil {
		return "", err
	}
	directory, err := s.cacheDirectory()
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return "", fmt.Errorf("create navigation icon cache: %w", err)
	}
	siteHash := sha256.Sum256([]byte(site.String()))
	contentHash := sha256.Sum256(data)
	baseName := fmt.Sprintf("%x", siteHash[:16])
	fileName := fmt.Sprintf("%s-%x.%s", baseName, contentHash[:6], extension)
	targetPath := filepath.Join(directory, fileName)
	if err := os.WriteFile(targetPath, data, 0o600); err != nil {
		return "", fmt.Errorf("write navigation icon cache: %w", err)
	}
	entries, _ := os.ReadDir(directory)
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasPrefix(entry.Name(), baseName+"-") && entry.Name() != fileName {
			_ = os.Remove(filepath.Join(directory, entry.Name()))
		}
	}
	return navigationIconCachePrefix + fileName, nil
}

// DiscoverSiteIcon downloads the icon declared by a site, falling back to
// /favicon.ico. Only validated image bytes are stored in Quick's config
// directory, so navigation cards never need to contact the site to render it.
// Calling this method again refreshes the cached file for the site.
func (s *NavigationService) DiscoverSiteIcon(value string) (string, error) {
	site, err := normalizeSiteURL(value)
	if err != nil {
		return "", err
	}
	candidates := []string{s.declaredSiteIcon(site), defaultSiteIcon(site)}
	s.iconMu.Lock()
	defer s.iconMu.Unlock()
	var failures []string
	seen := map[string]struct{}{}
	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		if _, ok := seen[candidate]; ok {
			continue
		}
		seen[candidate] = struct{}{}
		cached, cacheErr := s.downloadAndCacheSiteIcon(site, candidate)
		if cacheErr == nil {
			return cached, nil
		}
		failures = append(failures, cacheErr.Error())
	}
	if len(failures) == 0 {
		return "", fmt.Errorf("site does not expose an icon")
	}
	return "", fmt.Errorf("no valid site icon found: %s", strings.Join(failures, "; "))
}

// GetCachedSiteIcon returns a data URL backed by a validated local cache file.
// The cache reference never allows path traversal outside navigation-icons.
func (s *NavigationService) GetCachedSiteIcon(reference string) (string, error) {
	fileName := strings.TrimPrefix(strings.TrimSpace(reference), navigationIconCachePrefix)
	if fileName == reference || fileName == "" || filepath.Base(fileName) != fileName {
		return "", fmt.Errorf("invalid navigation icon cache reference")
	}
	directory, err := s.cacheDirectory()
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(filepath.Join(directory, fileName))
	if err != nil {
		return "", fmt.Errorf("read cached navigation icon: %w", err)
	}
	_, mediaType, err := detectNavigationIcon(data)
	if err != nil {
		return "", fmt.Errorf("cached navigation icon is invalid: %w", err)
	}
	return "data:" + mediaType + ";base64," + base64.StdEncoding.EncodeToString(data), nil
}
