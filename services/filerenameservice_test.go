package services

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRenamePreviewAndUndo(t *testing.T) {
	directory := t.TempDir()
	for _, name := range []string{"b.txt", "a.txt", "ignore.log"} {
		if err := os.WriteFile(filepath.Join(directory, name), []byte(name), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	service := NewFileRenameService(nil)
	request := RenameRequest{Paths: []string{directory}, MatchMode: "wildcard", MatchPattern: "*.txt", MatchFullName: true, Operation: "reset", Replacement: "note", Start: 1, Step: 1, Width: 2, SortBy: "name"}
	preview, err := service.PreviewRename(request)
	if err != nil {
		t.Fatal(err)
	}
	if preview.Ready != 2 || preview.Conflicts != 0 {
		t.Fatalf("unexpected preview: %+v", preview)
	}
	result, err := service.ExecuteRename(request)
	if err != nil {
		t.Fatal(err)
	}
	if result.Renamed != 2 || !result.CanUndo {
		t.Fatalf("unexpected result: %+v", result)
	}
	for _, name := range []string{"note-01.txt", "note-02.txt", "ignore.log"} {
		if _, err := os.Stat(filepath.Join(directory, name)); err != nil {
			t.Fatalf("expected %s: %v", name, err)
		}
	}
	undo, err := service.UndoLastRename()
	if err != nil {
		t.Fatal(err)
	}
	if undo.Renamed != 2 || undo.CanUndo {
		t.Fatalf("unexpected undo: %+v", undo)
	}
	if len(undo.Items) != 2 {
		t.Fatalf("expected undo path mapping: %+v", undo)
	}
	for _, name := range []string{"a.txt", "b.txt", "ignore.log"} {
		if _, err := os.Stat(filepath.Join(directory, name)); err != nil {
			t.Fatalf("expected restored %s: %v", name, err)
		}
	}
}

func TestRenamePreviewDetectsCollision(t *testing.T) {
	directory := t.TempDir()
	for _, name := range []string{"a.txt", "b.txt"} {
		if err := os.WriteFile(filepath.Join(directory, name), []byte(name), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	preview, err := buildRenamePreview(RenameRequest{Paths: []string{directory}, MatchMode: "all", Operation: "replace", Find: `[ab]`, Replacement: "same", UseRegex: true})
	if err != nil {
		t.Fatal(err)
	}
	if preview.Conflicts != 2 {
		t.Fatalf("expected two conflicts: %+v", preview)
	}
}

func TestRenamePreviewDoesNotTreatSkippedTargetAsMoving(t *testing.T) {
	directory := t.TempDir()
	for _, name := range []string{"a.txt", "b.txt"} {
		if err := os.WriteFile(filepath.Join(directory, name), []byte(name), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	preview, err := buildRenamePreview(RenameRequest{Paths: []string{directory}, MatchMode: "regex", MatchPattern: `^a$`, Operation: "replace", Find: "a", Replacement: "b"})
	if err != nil {
		t.Fatal(err)
	}
	if preview.Conflicts != 1 {
		t.Fatalf("expected the existing skipped target to conflict: %+v", preview)
	}
}
