package files

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"unicode/utf8"

	"github.com/wailsapp/wails/v3/pkg/application"
)

const maxCSVFileSize = 10 * 1024 * 1024

type TextFileResult struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

type FileDialogService struct {
	app *application.App
}

func NewFileDialogService(app *application.App) *FileDialogService {
	return &FileDialogService{app: app}
}

func (s *FileDialogService) SaveCSV(filename string, content string) (string, error) {
	if s.app == nil {
		return "", errors.New("应用尚未初始化")
	}
	path, err := s.app.Dialog.SaveFileWithOptions(&application.SaveFileDialogOptions{
		Title:                "保存 CSV 文件",
		Filename:             filename,
		CanCreateDirectories: true,
		AllowOtherFileTypes:  false,
		Filters: []application.FileFilter{{
			DisplayName: "CSV 文件",
			Pattern:     "*.csv",
		}},
	}).PromptForSingleSelection()
	if err != nil || path == "" {
		return path, err
	}
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		return "", fmt.Errorf("写入 CSV 文件失败：%w", err)
	}
	return path, nil
}

func (s *FileDialogService) OpenCSV() (TextFileResult, error) {
	if s.app == nil {
		return TextFileResult{}, errors.New("应用尚未初始化")
	}
	path, err := s.app.Dialog.OpenFile().
		SetTitle("选择要导入的 CSV 文件").
		CanChooseDirectories(false).
		CanChooseFiles(true).
		AllowsOtherFileTypes(false).
		AddFilter("CSV 文件", "*.csv").
		PromptForSingleSelection()
	if err != nil || path == "" {
		return TextFileResult{Path: path}, err
	}
	file, err := os.Open(path)
	if err != nil {
		return TextFileResult{}, fmt.Errorf("打开 CSV 文件失败：%w", err)
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxCSVFileSize+1))
	if err != nil {
		return TextFileResult{}, fmt.Errorf("读取 CSV 文件失败：%w", err)
	}
	if len(data) > maxCSVFileSize {
		return TextFileResult{}, errors.New("CSV 文件不能超过 10 MB")
	}
	data = bytes.TrimPrefix(data, []byte{0xef, 0xbb, 0xbf})
	if !utf8.Valid(data) {
		return TextFileResult{}, errors.New("CSV 文件必须使用 UTF-8 编码")
	}
	return TextFileResult{Path: path, Content: string(data)}, nil
}
