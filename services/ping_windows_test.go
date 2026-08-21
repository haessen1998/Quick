//go:build windows

package services

import (
	"testing"

	"golang.org/x/text/encoding/simplifiedchinese"
)

func TestDecodeWindowsConsoleOutputGBK(t *testing.T) {
	want := "正在 Ping github.com 具有 32 字节的数据"
	encoded, err := simplifiedchinese.GBK.NewEncoder().Bytes([]byte(want))
	if err != nil {
		t.Fatal(err)
	}
	if got := decodeWindowsConsoleOutput(encoded, 936); got != want {
		t.Fatalf("decoded output = %q, want %q", got, want)
	}
}

func TestDecodeWindowsConsoleOutputKeepsUTF8(t *testing.T) {
	want := "Ping 已完成"
	if got := decodeWindowsConsoleOutput([]byte(want), 936); got != want {
		t.Fatalf("decoded output = %q, want %q", got, want)
	}
}
