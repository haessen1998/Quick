package services

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestConfigServiceRoundTrip(t *testing.T) {
	service := &ConfigService{path: filepath.Join(t.TempDir(), "Quick", "settings.json")}
	const value = `[{"id":"ai-test","apiKey":"secret"}]`
	if err := service.Save("ai-profiles", value); err != nil {
		t.Fatalf("Save() error = %v", err)
	}
	stored, err := os.ReadFile(service.path)
	if err != nil {
		t.Fatalf("read settings file: %v", err)
	}
	if bytes.Contains(stored, []byte("secret")) || !bytes.Contains(stored, []byte(configEncryptionPrefix)) {
		t.Fatalf("settings file was not encrypted: %s", stored)
	}
	loaded, err := service.Load("ai-profiles")
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	var got, want any
	if err := json.Unmarshal([]byte(loaded), &got); err != nil {
		t.Fatalf("decode loaded value: %v", err)
	}
	if err := json.Unmarshal([]byte(value), &want); err != nil {
		t.Fatalf("decode expected value: %v", err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Load() = %v, want %v", got, want)
	}
	const updated = `[{"id":"ai-updated","apiKey":"new-secret"}]`
	if err := service.Save("ai-profiles", updated); err != nil {
		t.Fatalf("second Save() error = %v", err)
	}
	loaded, err = service.Load("ai-profiles")
	if err != nil || loaded == value {
		t.Fatalf("second Load() = %q, %v", loaded, err)
	}
}

func TestConfigServiceMigratesPlaintextSensitiveValues(t *testing.T) {
	directory := filepath.Join(t.TempDir(), "Quick")
	if err := os.MkdirAll(directory, 0o700); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(directory, "settings.json")
	const legacy = `{"version":1,"values":{"ai-profiles":[{"id":"legacy","apiKey":"legacy-secret"}],"navigation-groups":[]}}`
	if err := os.WriteFile(path, []byte(legacy), 0o600); err != nil {
		t.Fatal(err)
	}
	service := &ConfigService{path: path}
	if err := service.migratePlaintextValues(); err != nil {
		t.Fatalf("migratePlaintextValues() error = %v", err)
	}
	stored, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(stored, []byte("legacy-secret")) {
		t.Fatalf("migrated settings still contain plaintext: %s", stored)
	}
	loaded, err := service.Load("ai-profiles")
	if err != nil || !bytes.Contains([]byte(loaded), []byte("legacy-secret")) {
		t.Fatalf("Load() after migration = %q, %v", loaded, err)
	}
	if !bytes.Contains(stored, []byte(`"navigation-groups": []`)) {
		t.Fatalf("migration removed non-sensitive config: %s", stored)
	}
}

func TestConfigServiceRejectsUnknownKeysAndMalformedJSON(t *testing.T) {
	service := &ConfigService{path: filepath.Join(t.TempDir(), "settings.json")}
	if err := service.Save("unknown", `{}`); err == nil {
		t.Fatal("Save() accepted an unknown key")
	}
	if err := service.Save("ai-profiles", `{`); err == nil {
		t.Fatal("Save() accepted malformed JSON")
	}
}
