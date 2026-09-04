package config

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/zalando/go-keyring"
)

func TestLegacyCiphertextMigratesToSystemKey(t *testing.T) {
	service := &ConfigService{path: filepath.Join(t.TempDir(), "settings.json")}
	block, _ := aes.NewCipher(configEncryptionKey[:])
	gcm, _ := cipher.NewGCM(block)
	nonce := make([]byte, gcm.NonceSize()) // Deterministic legacy fixture only.
	value := []byte(`[{"apiKey":"legacy-secret"}]`)
	old := legacyEncryptionPrefix + base64.RawStdEncoding.EncodeToString(gcm.Seal(nonce, nonce, value, []byte("ai-profiles")))
	fixture, _ := json.Marshal(persistentConfigFile{Version: 2, EncryptedValues: map[string]string{"ai-profiles": old}})
	if err := os.WriteFile(service.path, fixture, 0600); err != nil {
		t.Fatal(err)
	}
	loaded, err := service.Load("ai-profiles")
	if err != nil || loaded != string(value) {
		t.Fatalf("legacy round trip failed: %v", err)
	}
	data, _ := os.ReadFile(service.path)
	if bytes.Contains(data, []byte(legacyEncryptionPrefix)) || !bytes.Contains(data, []byte(configEncryptionPrefix)) {
		t.Fatal("legacy ciphertext was not migrated")
	}
	if bytes.Contains(data, []byte("legacy-secret")) {
		t.Fatal("plaintext leaked to settings")
	}
}

func TestMissingSystemKeyDoesNotOverwriteExistingCiphertext(t *testing.T) {
	service := &ConfigService{path: filepath.Join(t.TempDir(), "settings.json")}
	if err := service.Save("ai-profiles", `[{"apiKey":"original"}]`); err != nil {
		t.Fatal(err)
	}
	if err := service.Save("app-language", `"en-US"`); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(service.path)
	keyring.MockInit() // Simulate a lost credential store; never touches real OS credentials.
	if _, err := service.Load("ai-profiles"); err == nil {
		t.Fatal("missing key accepted")
	}
	if err := service.Save("ai-profiles", `[]`); err == nil {
		t.Fatal("overwrote ciphertext after losing key")
	}
	after, _ := os.ReadFile(service.path)
	if !bytes.Equal(before, after) {
		t.Fatal("failed migration/save changed original file")
	}
	language, err := service.Load("app-language")
	if err != nil || language != `"en-US"` {
		t.Fatal("missing credential blocked ordinary preferences")
	}
}

func TestSystemKeysAreScopedToConfigDirectory(t *testing.T) {
	first := &ConfigService{path: filepath.Join(t.TempDir(), "settings.json")}
	second := &ConfigService{path: filepath.Join(t.TempDir(), "settings.json")}
	a, err := first.encryptionKey(true)
	if err != nil {
		t.Fatal(err)
	}
	b, err := second.encryptionKey(true)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Equal(a, b) {
		t.Fatal("independent profiles share an encryption key")
	}
}
