package services

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
)

const (
	configFileVersion        = 2
	configEncryptionPassword = "quick"
	configEncryptionPrefix   = "aes-256-gcm:v1:"
)

var configEncryptionKey = sha256.Sum256([]byte(configEncryptionPassword))

var persistentConfigKeys = map[string]struct{}{
	"ai-profiles":       {},
	"mcp-servers":       {},
	"navigation-groups": {},
}

var encryptedConfigKeys = map[string]struct{}{
	"ai-profiles": {},
	"mcp-servers": {},
}

type persistentConfigFile struct {
	Version         int                        `json:"version"`
	Values          map[string]json.RawMessage `json:"values,omitempty"`
	EncryptedValues map[string]string          `json:"encryptedValues,omitempty"`
}

// ConfigService stores long-lived application settings outside the WebView
// profile. This keeps them stable when the frontend dev-server port, WebView
// origin, executable, or package format changes.
type ConfigService struct {
	mu   sync.Mutex
	path string
	err  error
}

func NewConfigService() *ConfigService {
	directory, err := quickConfigDirectory()
	if err != nil {
		return &ConfigService{err: err}
	}
	service := &ConfigService{path: filepath.Join(directory, "settings.json")}
	if err := service.migratePlaintextValues(); err != nil {
		service.err = err
	}
	return service
}

func quickConfigDirectory() (string, error) {
	if runtime.GOOS == "windows" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("resolve user home: %w", err)
		}
		return filepath.Join(home, "AppData", "Roaming", "Quick"), nil
	}
	directory, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("resolve user config directory: %w", err)
	}
	return filepath.Join(directory, "Quick"), nil
}

func validatePersistentConfigKey(key string) error {
	if _, ok := persistentConfigKeys[key]; !ok {
		return fmt.Errorf("unsupported persistent config key %q", key)
	}
	return nil
}

func shouldEncryptConfigKey(key string) bool {
	_, ok := encryptedConfigKeys[key]
	return ok
}

func encryptPersistentValue(key string, plaintext []byte) (string, error) {
	block, err := aes.NewCipher(configEncryptionKey[:])
	if err != nil {
		return "", fmt.Errorf("create AES-256 cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("create AES-GCM cipher: %w", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("create encryption nonce: %w", err)
	}
	payload := gcm.Seal(nonce, nonce, plaintext, []byte(key))
	return configEncryptionPrefix + base64.RawStdEncoding.EncodeToString(payload), nil
}

func decryptPersistentValue(key string, encrypted string) ([]byte, error) {
	if !strings.HasPrefix(encrypted, configEncryptionPrefix) {
		return nil, errors.New("unsupported encrypted config format")
	}
	payload, err := base64.RawStdEncoding.DecodeString(strings.TrimPrefix(encrypted, configEncryptionPrefix))
	if err != nil {
		return nil, fmt.Errorf("decode encrypted config: %w", err)
	}
	block, err := aes.NewCipher(configEncryptionKey[:])
	if err != nil {
		return nil, fmt.Errorf("create AES-256 cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("create AES-GCM cipher: %w", err)
	}
	if len(payload) < gcm.NonceSize() {
		return nil, errors.New("encrypted config payload is too short")
	}
	nonce, ciphertext := payload[:gcm.NonceSize()], payload[gcm.NonceSize():]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, []byte(key))
	if err != nil {
		return nil, fmt.Errorf("decrypt config: %w", err)
	}
	if !json.Valid(plaintext) {
		return nil, errors.New("decrypted config is not valid JSON")
	}
	return plaintext, nil
}

func (s *ConfigService) readLocked() (persistentConfigFile, error) {
	config := persistentConfigFile{Version: configFileVersion, Values: map[string]json.RawMessage{}, EncryptedValues: map[string]string{}}
	if s.err != nil {
		return config, s.err
	}
	data, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return config, nil
	}
	if err != nil {
		return config, fmt.Errorf("read Quick settings: %w", err)
	}
	if err := json.Unmarshal(data, &config); err != nil {
		return config, fmt.Errorf("parse Quick settings: %w", err)
	}
	if config.Values == nil {
		config.Values = map[string]json.RawMessage{}
	}
	if config.EncryptedValues == nil {
		config.EncryptedValues = map[string]string{}
	}
	return config, nil
}

func (s *ConfigService) writeLocked(config persistentConfigFile) error {
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("encode Quick settings: %w", err)
	}
	directory := filepath.Dir(s.path)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return fmt.Errorf("create Quick settings directory: %w", err)
	}
	temporary, err := os.CreateTemp(directory, "settings-*.tmp")
	if err != nil {
		return fmt.Errorf("create temporary settings file: %w", err)
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(0o600); err != nil {
		temporary.Close()
		return fmt.Errorf("secure temporary settings file: %w", err)
	}
	if _, err := temporary.Write(data); err != nil {
		temporary.Close()
		return fmt.Errorf("write Quick settings: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close Quick settings: %w", err)
	}
	if err := os.Rename(temporaryPath, s.path); err != nil {
		return fmt.Errorf("replace Quick settings: %w", err)
	}
	return nil
}

func (s *ConfigService) migratePlaintextValues() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	config, err := s.readLocked()
	if err != nil {
		return err
	}
	changed := false
	for key := range encryptedConfigKeys {
		value, hasPlaintext := config.Values[key]
		if !hasPlaintext {
			continue
		}
		if _, hasEncrypted := config.EncryptedValues[key]; !hasEncrypted {
			encrypted, err := encryptPersistentValue(key, value)
			if err != nil {
				return err
			}
			config.EncryptedValues[key] = encrypted
		}
		delete(config.Values, key)
		changed = true
	}
	if !changed {
		return nil
	}
	config.Version = configFileVersion
	return s.writeLocked(config)
}

func (s *ConfigService) Load(key string) (string, error) {
	if err := validatePersistentConfigKey(key); err != nil {
		return "", err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	config, err := s.readLocked()
	if err != nil {
		return "", err
	}
	if encrypted, ok := config.EncryptedValues[key]; ok {
		value, err := decryptPersistentValue(key, encrypted)
		if err != nil {
			return "", err
		}
		return string(value), nil
	}
	value, ok := config.Values[key]
	if !ok {
		return "", nil
	}
	return string(value), nil
}

func (s *ConfigService) Save(key string, value string) error {
	if err := validatePersistentConfigKey(key); err != nil {
		return err
	}
	if !json.Valid([]byte(value)) {
		return errors.New("persistent config value must be valid JSON")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	config, err := s.readLocked()
	if err != nil {
		return err
	}
	config.Version = configFileVersion
	if shouldEncryptConfigKey(key) {
		encrypted, err := encryptPersistentValue(key, []byte(value))
		if err != nil {
			return err
		}
		config.EncryptedValues[key] = encrypted
		delete(config.Values, key)
	} else {
		config.Values[key] = json.RawMessage(value)
		delete(config.EncryptedValues, key)
	}
	return s.writeLocked(config)
}
