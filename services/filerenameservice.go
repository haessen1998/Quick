package services

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type RenameFileInfo struct {
	Path      string `json:"path"`
	Name      string `json:"name"`
	Directory string `json:"directory"`
	Extension string `json:"extension"`
	Size      int64  `json:"size"`
	Modified  string `json:"modified"`
}

type RenameRequest struct {
	Paths            []string `json:"paths"`
	Recursive        bool     `json:"recursive"`
	MatchMode        string   `json:"matchMode"`
	MatchPattern     string   `json:"matchPattern"`
	MatchFullName    bool     `json:"matchFullName"`
	Operation        string   `json:"operation"`
	Find             string   `json:"find"`
	Replacement      string   `json:"replacement"`
	UseRegex         bool     `json:"useRegex"`
	Prefix           string   `json:"prefix"`
	Suffix           string   `json:"suffix"`
	Start            int      `json:"start"`
	Step             int      `json:"step"`
	Width            int      `json:"width"`
	IncludeExtension bool     `json:"includeExtension"`
	SortBy           string   `json:"sortBy"`
}

type RenamePlanItem struct {
	SourcePath string `json:"sourcePath"`
	TargetPath string `json:"targetPath"`
	OldName    string `json:"oldName"`
	NewName    string `json:"newName"`
	Status     string `json:"status"`
	Error      string `json:"error"`
}

type RenamePreview struct {
	Items     []RenamePlanItem `json:"items"`
	Total     int              `json:"total"`
	Matched   int              `json:"matched"`
	Ready     int              `json:"ready"`
	Conflicts int              `json:"conflicts"`
}

type RenameExecutionResult struct {
	Success bool             `json:"success"`
	Renamed int              `json:"renamed"`
	Items   []RenamePlanItem `json:"items"`
	CanUndo bool             `json:"canUndo"`
	Message string           `json:"message"`
}

type renamePair struct {
	source string
	target string
}

type FileRenameService struct {
	app  *application.App
	mu   sync.Mutex
	last []renamePair
}

func NewFileRenameService(app *application.App) *FileRenameService {
	return &FileRenameService{app: app}
}

func (s *FileRenameService) ChooseFolder() (string, error) {
	if s.app == nil {
		return "", errors.New("应用尚未初始化")
	}
	return s.app.Dialog.OpenFile().
		SetTitle("选择要批量重命名的文件夹").
		CanChooseDirectories(true).
		CanChooseFiles(false).
		PromptForSingleSelection()
}

func (s *FileRenameService) ListFiles(paths []string, recursive bool) ([]RenameFileInfo, error) {
	return collectRenameFiles(paths, recursive)
}

func (s *FileRenameService) PreviewRename(request RenameRequest) (RenamePreview, error) {
	return buildRenamePreview(request)
}

func (s *FileRenameService) ExecuteRename(request RenameRequest) (RenameExecutionResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	preview, err := buildRenamePreview(request)
	if err != nil {
		return RenameExecutionResult{}, err
	}
	if preview.Conflicts > 0 {
		return RenameExecutionResult{}, fmt.Errorf("存在 %d 个命名冲突，请修正规则后重新预览", preview.Conflicts)
	}
	pairs := make([]renamePair, 0, preview.Ready)
	for _, item := range preview.Items {
		if item.Status == "ready" {
			pairs = append(pairs, renamePair{source: item.SourcePath, target: item.TargetPath})
		}
	}
	if len(pairs) == 0 {
		return RenameExecutionResult{Success: true, Items: preview.Items, Message: "没有需要重命名的文件"}, nil
	}
	if err := renameAtomically(pairs); err != nil {
		return RenameExecutionResult{}, err
	}
	s.last = append([]renamePair(nil), pairs...)
	return RenameExecutionResult{Success: true, Renamed: len(pairs), Items: preview.Items, CanUndo: true, Message: fmt.Sprintf("已重命名 %d 个文件", len(pairs))}, nil
}

func (s *FileRenameService) UndoLastRename() (RenameExecutionResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.last) == 0 {
		return RenameExecutionResult{Success: false, Message: "没有可以撤销的重命名操作"}, nil
	}
	reverse := make([]renamePair, 0, len(s.last))
	for _, pair := range s.last {
		reverse = append(reverse, renamePair{source: pair.target, target: pair.source})
	}
	if err := validateRenamePairs(reverse); err != nil {
		return RenameExecutionResult{}, fmt.Errorf("无法撤销：%w", err)
	}
	if err := renameAtomically(reverse); err != nil {
		return RenameExecutionResult{}, fmt.Errorf("撤销失败：%w", err)
	}
	count := len(s.last)
	items := make([]RenamePlanItem, 0, count)
	for _, pair := range reverse {
		items = append(items, RenamePlanItem{SourcePath: pair.source, TargetPath: pair.target, OldName: filepath.Base(pair.source), NewName: filepath.Base(pair.target), Status: "ready"})
	}
	s.last = nil
	return RenameExecutionResult{Success: true, Renamed: count, Items: items, CanUndo: false, Message: fmt.Sprintf("已撤销 %d 个文件的重命名", count)}, nil
}

func collectRenameFiles(paths []string, recursive bool) ([]RenameFileInfo, error) {
	seen := make(map[string]struct{})
	files := make([]RenameFileInfo, 0)
	addFile := func(path string, info os.FileInfo) error {
		absolute, err := filepath.Abs(path)
		if err != nil {
			return err
		}
		absolute = filepath.Clean(absolute)
		key := canonicalPath(absolute)
		if _, ok := seen[key]; ok {
			return nil
		}
		seen[key] = struct{}{}
		files = append(files, RenameFileInfo{
			Path: absolute, Name: info.Name(), Directory: filepath.Dir(absolute),
			Extension: filepath.Ext(info.Name()), Size: info.Size(), Modified: info.ModTime().Format(time.RFC3339),
		})
		return nil
	}

	for _, raw := range paths {
		if strings.TrimSpace(raw) == "" {
			continue
		}
		path := filepath.Clean(raw)
		info, err := os.Stat(path)
		if err != nil {
			return nil, fmt.Errorf("无法读取 %s：%w", path, err)
		}
		if !info.IsDir() {
			if info.Mode().IsRegular() {
				if err := addFile(path, info); err != nil {
					return nil, err
				}
			}
			continue
		}
		if recursive {
			err = filepath.Walk(path, func(current string, currentInfo os.FileInfo, walkErr error) error {
				if walkErr != nil {
					return walkErr
				}
				if currentInfo.Mode().IsRegular() {
					return addFile(current, currentInfo)
				}
				return nil
			})
		} else {
			entries, readErr := os.ReadDir(path)
			if readErr != nil {
				return nil, readErr
			}
			for _, entry := range entries {
				if entry.Type().IsRegular() {
					entryInfo, infoErr := entry.Info()
					if infoErr != nil {
						return nil, infoErr
					}
					if err := addFile(filepath.Join(path, entry.Name()), entryInfo); err != nil {
						return nil, err
					}
				}
			}
		}
		if err != nil {
			return nil, err
		}
	}
	return files, nil
}

func buildRenamePreview(request RenameRequest) (RenamePreview, error) {
	files, err := collectRenameFiles(request.Paths, request.Recursive)
	if err != nil {
		return RenamePreview{}, err
	}
	if request.Step == 0 {
		request.Step = 1
	}
	if request.Width < 1 {
		request.Width = 3
	}
	if request.Width > 12 {
		request.Width = 12
	}

	sort.SliceStable(files, func(i, j int) bool {
		switch request.SortBy {
		case "modified":
			return files[i].Modified < files[j].Modified
		case "size":
			if files[i].Size == files[j].Size {
				return strings.ToLower(files[i].Name) < strings.ToLower(files[j].Name)
			}
			return files[i].Size < files[j].Size
		default:
			return strings.ToLower(files[i].Name) < strings.ToLower(files[j].Name)
		}
	})

	matcher, err := compileRenameMatcher(request.MatchMode, request.MatchPattern)
	if err != nil {
		return RenamePreview{}, err
	}
	var replaceExpression *regexp.Regexp
	if request.Operation == "replace" && request.UseRegex {
		replaceExpression, err = regexp.Compile(request.Find)
		if err != nil {
			return RenamePreview{}, fmt.Errorf("替换正则表达式无效：%w", err)
		}
	}

	preview := RenamePreview{Items: make([]RenamePlanItem, 0, len(files)), Total: len(files)}
	targets := make(map[string]int)
	sequence := request.Start
	for _, file := range files {
		ext := filepath.Ext(file.Name)
		stem := strings.TrimSuffix(file.Name, ext)
		matchValue := stem
		if request.MatchFullName {
			matchValue = file.Name
		}
		matched, matchErr := matcher(matchValue)
		if matchErr != nil {
			return RenamePreview{}, matchErr
		}
		if !matched {
			preview.Items = append(preview.Items, RenamePlanItem{SourcePath: file.Path, TargetPath: file.Path, OldName: file.Name, NewName: file.Name, Status: "skipped"})
			continue
		}
		preview.Matched++
		working := stem
		workingExt := ext
		if request.IncludeExtension {
			working, workingExt = file.Name, ""
		}
		switch request.Operation {
		case "reset":
			base := strings.TrimSpace(request.Replacement)
			if base == "" {
				base = "文件"
			}
			working = fmt.Sprintf("%s-%0*d", base, request.Width, sequence)
			sequence += request.Step
		case "replace":
			if request.UseRegex {
				working = replaceExpression.ReplaceAllString(working, request.Replacement)
			} else {
				working = strings.ReplaceAll(working, request.Find, request.Replacement)
			}
		case "prefix":
			working = request.Prefix + working
		case "suffix":
			working += request.Suffix
		default:
			return RenamePreview{}, fmt.Errorf("不支持的重命名操作：%s", request.Operation)
		}
		newName := working + workingExt
		item := RenamePlanItem{SourcePath: file.Path, TargetPath: filepath.Join(file.Directory, newName), OldName: file.Name, NewName: newName, Status: "ready"}
		if newName == file.Name {
			item.Status = "unchanged"
		} else if nameErr := validateFilename(newName); nameErr != nil {
			item.Status, item.Error = "conflict", nameErr.Error()
		}
		preview.Items = append(preview.Items, item)
		if item.Status == "ready" {
			targets[canonicalPath(item.TargetPath)]++
		}
	}

	movingSources := make(map[string]struct{}, len(preview.Items))
	for _, item := range preview.Items {
		if item.Status == "ready" {
			movingSources[canonicalPath(item.SourcePath)] = struct{}{}
		}
	}
	for index := range preview.Items {
		item := &preview.Items[index]
		if item.Status != "ready" {
			continue
		}
		key := canonicalPath(item.TargetPath)
		if targets[key] > 1 {
			item.Status, item.Error = "conflict", "多个文件会生成相同名称"
		} else if _, statErr := os.Stat(item.TargetPath); statErr == nil {
			if _, movingAway := movingSources[key]; !movingAway {
				item.Status, item.Error = "conflict", "目标文件已经存在"
			}
		} else if !errors.Is(statErr, os.ErrNotExist) {
			item.Status, item.Error = "conflict", statErr.Error()
		}
	}
	for _, item := range preview.Items {
		switch item.Status {
		case "ready":
			preview.Ready++
		case "conflict":
			preview.Conflicts++
		}
	}
	return preview, nil
}

func compileRenameMatcher(mode, pattern string) (func(string) (bool, error), error) {
	pattern = strings.TrimSpace(pattern)
	switch mode {
	case "", "all":
		return func(string) (bool, error) { return true, nil }, nil
	case "wildcard":
		if pattern == "" {
			return nil, errors.New("请输入通配符")
		}
		return func(value string) (bool, error) {
			if runtime.GOOS == "windows" {
				value, pattern = strings.ToLower(value), strings.ToLower(pattern)
			}
			return filepath.Match(pattern, value)
		}, nil
	case "regex":
		if pattern == "" {
			return nil, errors.New("请输入正则表达式")
		}
		expression, err := regexp.Compile(pattern)
		if err != nil {
			return nil, fmt.Errorf("匹配正则表达式无效：%w", err)
		}
		return func(value string) (bool, error) { return expression.MatchString(value), nil }, nil
	default:
		return nil, fmt.Errorf("不支持的匹配方式：%s", mode)
	}
}

func validateFilename(name string) error {
	if name == "" || name == "." || name == ".." {
		return errors.New("文件名不能为空")
	}
	if strings.ContainsRune(name, 0) || strings.ContainsAny(name, `/\\`) {
		return errors.New("文件名包含路径分隔符")
	}
	if runtime.GOOS == "windows" {
		if strings.ContainsAny(name, `<>:"|?*`) {
			return errors.New("文件名包含 Windows 非法字符")
		}
		trimmed := strings.TrimRight(name, ". ")
		if trimmed != name {
			return errors.New("Windows 文件名不能以句点或空格结尾")
		}
		base := strings.ToUpper(strings.TrimSuffix(name, filepath.Ext(name)))
		reserved := regexp.MustCompile(`^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$`)
		if reserved.MatchString(base) {
			return errors.New("文件名是 Windows 保留名称")
		}
	}
	return nil
}

func validateRenamePairs(pairs []renamePair) error {
	targets := make(map[string]struct{}, len(pairs))
	sources := make(map[string]struct{}, len(pairs))
	for _, pair := range pairs {
		source, err := filepath.Abs(pair.source)
		if err != nil {
			return err
		}
		target, err := filepath.Abs(pair.target)
		if err != nil {
			return err
		}
		if filepath.Dir(source) != filepath.Dir(target) {
			return errors.New("只允许在原文件夹内重命名")
		}
		if err := validateFilename(filepath.Base(target)); err != nil {
			return err
		}
		if info, statErr := os.Stat(source); statErr != nil || !info.Mode().IsRegular() {
			if statErr != nil {
				return fmt.Errorf("源文件不可用：%s", source)
			}
			return fmt.Errorf("源路径不是普通文件：%s", source)
		}
		sourceKey, targetKey := canonicalPath(source), canonicalPath(target)
		if _, exists := targets[targetKey]; exists {
			return fmt.Errorf("目标名称重复：%s", target)
		}
		targets[targetKey] = struct{}{}
		sources[sourceKey] = struct{}{}
	}
	for _, pair := range pairs {
		if _, err := os.Stat(pair.target); err == nil {
			if _, movingAway := sources[canonicalPath(pair.target)]; !movingAway {
				return fmt.Errorf("目标文件已存在：%s", pair.target)
			}
		} else if !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}
	return nil
}

func renameAtomically(pairs []renamePair) error {
	if err := validateRenamePairs(pairs); err != nil {
		return err
	}
	temps := make([]renamePair, 0, len(pairs))
	for _, pair := range pairs {
		file, err := os.CreateTemp(filepath.Dir(pair.source), ".quick-rename-*")
		if err != nil {
			rollbackTemps(temps)
			return err
		}
		temporary := file.Name()
		if closeErr := file.Close(); closeErr != nil {
			os.Remove(temporary)
			rollbackTemps(temps)
			return closeErr
		}
		if removeErr := os.Remove(temporary); removeErr != nil {
			rollbackTemps(temps)
			return removeErr
		}
		if err := os.Rename(pair.source, temporary); err != nil {
			rollbackTemps(temps)
			return fmt.Errorf("无法暂存 %s：%w", filepath.Base(pair.source), err)
		}
		temps = append(temps, renamePair{source: pair.source, target: temporary})
	}
	completed := 0
	for index, pair := range pairs {
		if err := os.Rename(temps[index].target, pair.target); err != nil {
			for previous := completed - 1; previous >= 0; previous-- {
				_ = os.Rename(pairs[previous].target, pairs[previous].source)
			}
			for remaining := index; remaining < len(temps); remaining++ {
				_ = os.Rename(temps[remaining].target, temps[remaining].source)
			}
			return fmt.Errorf("无法写入 %s：%w", filepath.Base(pair.target), err)
		}
		completed++
	}
	return nil
}

func rollbackTemps(temps []renamePair) {
	for index := len(temps) - 1; index >= 0; index-- {
		_ = os.Rename(temps[index].target, temps[index].source)
	}
}

func canonicalPath(path string) string {
	clean := filepath.Clean(path)
	if runtime.GOOS == "windows" || runtime.GOOS == "darwin" {
		return strings.ToLower(clean)
	}
	return clean
}
