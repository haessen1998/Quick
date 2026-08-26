//go:build windows

package services

import (
	"context"
	"strconv"
	"syscall"
	"unicode/utf8"

	"golang.org/x/text/encoding"
	"golang.org/x/text/encoding/charmap"
	"golang.org/x/text/encoding/japanese"
	"golang.org/x/text/encoding/korean"
	"golang.org/x/text/encoding/simplifiedchinese"
	"golang.org/x/text/encoding/traditionalchinese"
)

var getOEMCodePage = syscall.NewLazyDLL("kernel32.dll").NewProc("GetOEMCP")

func runPing(ctx context.Context, host string, timeoutMS int) (string, error) {
	command := hiddenWindowsCommandContext(ctx, "ping", "-n", "1", "-w", strconv.Itoa(timeoutMS), host)
	output, err := command.CombinedOutput()
	return decodeWindowsConsoleOutput(output, windowsOEMCodePage()), err
}

func windowsOEMCodePage() uint32 {
	value, _, _ := getOEMCodePage.Call()
	return uint32(value)
}

func decodeWindowsConsoleOutput(value []byte, codePage uint32) string {
	if len(value) == 0 || codePage == 65001 || utf8.Valid(value) {
		return string(value)
	}
	var codec encoding.Encoding
	switch codePage {
	case 936:
		codec = simplifiedchinese.GBK
	case 950:
		codec = traditionalchinese.Big5
	case 932:
		codec = japanese.ShiftJIS
	case 949:
		codec = korean.EUCKR
	case 437:
		codec = charmap.CodePage437
	case 850:
		codec = charmap.CodePage850
	case 866:
		codec = charmap.CodePage866
	default:
		return string(value)
	}
	decoded, err := codec.NewDecoder().Bytes(value)
	if err != nil {
		return string(value)
	}
	return string(decoded)
}
