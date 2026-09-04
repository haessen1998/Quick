package config

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

	"github.com/zalando/go-keyring"
)

const (
	configFileVersion        = 3
	configEncryptionPassword = "quick" // Legacy v1 migration only; never used for new encryption.
	configEncryptionPrefix   = "keyring-aes-256-gcm:v2:"
	legacyEncryptionPrefix   = "aes-256-gcm:v1:"
)

var configEncryptionKey = sha256.Sum256([]byte(configEncryptionPassword))

var persistentConfigKeys = map[string]struct{}{
	"app-language":      {},
	"ai-profiles":       {},
	"mcp-servers":       {},
	"navigation-groups": {},
	"sidebar-order":     {},
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
	// Sensitive values migrate on access. Ordinary preferences remain usable if the keychain is locked.
	return service
}

func quickConfigDirectory() (string, error) {
	if runtime.GOOS == "windows" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("resolve user home: %w", err)
		}
		return filepath.Join(home, "AppData", "Roaming", "Quick", configProfile), nil
	}
	directory, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("resolve user config directory: %w", err)
	}
	return filepath.Join(directory, "Quick", configProfile), nil
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

func (s *ConfigService) encryptPersistentValue(key string, plaintext []byte) (string, error) {
	secret, err := s.encryptionKey(true)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(secret)
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

func (s *ConfigService) decryptPersistentValue(key string, encrypted string) ([]byte, error) {
	prefix := configEncryptionPrefix
	secret := configEncryptionKey[:]
	if strings.HasPrefix(encrypted, legacyEncryptionPrefix) {
		prefix = legacyEncryptionPrefix
	} else {
		var err error
		secret, err = s.encryptionKey(false)
		if err != nil {
			return nil, err
		}
	}
	if !strings.HasPrefix(encrypted, prefix) {
		return nil, errors.New("unsupported encrypted config format")
	}
	payload, err := base64.RawStdEncoding.DecodeString(strings.TrimPrefix(encrypted, prefix))
	if err != nil {
		return nil, fmt.Errorf("decode encrypted config: %w", err)
	}
	block, err := aes.NewCipher(secret)
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
		if old, ok := config.EncryptedValues[key]; ok && strings.HasPrefix(old, legacyEncryptionPrefix) {
			decrypted, err := s.decryptPersistentValue(key, old)
			if err != nil {
				return err
			}
			encrypted, err := s.encryptPersistentValue(key, decrypted)
			if err != nil {
				return err
			}
			config.EncryptedValues[key] = encrypted
			changed = true
		}
		if !hasPlaintext {
			continue
		}
		if _, hasEncrypted := config.EncryptedValues[key]; !hasEncrypted {
			encrypted, err := s.encryptPersistentValue(key, value)
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
	if shouldEncryptConfigKey(key) {
		if err := s.migratePlaintextValues(); err != nil {
			return "", err
		}
	}
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
		value, err := s.decryptPersistentValue(key, encrypted)
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
		encrypted, err := s.encryptPersistentValue(key, []byte(value))
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

// The random encryption key lives in the OS credential store, never in settings.json.
// The path-derived account name keeps independent installations/config directories separate.
func (s *ConfigService) encryptionKey(create bool) ([]byte, error) {
	accountHash := sha256.Sum256([]byte(filepath.Clean(s.path)))
	account := fmt.Sprintf("settings-%x", accountHash[:12])
	encoded, err := keyring.Get("Quick", account)
	if errors.Is(err, keyring.ErrNotFound) && create {
		config, readErr := s.readLocked()
		if readErr != nil {
			return nil, readErr
		}
		for _, encrypted := range config.EncryptedValues {
			if strings.HasPrefix(encrypted, configEncryptionPrefix) {
				return nil, errors.New("系统凭据密钥丢失；为保护现有配置，未生成新密钥或覆盖文件")
			}
		}
		key := make([]byte, 32)
		if _, err := io.ReadFull(rand.Reader, key); err != nil {
			return nil, err
		}
		encoded = base64.RawStdEncoding.EncodeToString(key)
		if err := keyring.Set("Quick", account, encoded); err != nil {
			return nil, fmt.Errorf("无法保存系统凭据，请解锁系统钥匙串后重试: %w", err)
		}
		// Verify before replacing legacy data on disk.
		saved, err := keyring.Get("Quick", account)
		if err != nil || saved != encoded {
			return nil, errors.New("系统凭据写入验证失败；原配置保持不变")
		}
	} else if err != nil {
		return nil, fmt.Errorf("无法读取系统凭据，请解锁系统钥匙串后重试: %w", err)
	}
	key, err := base64.RawStdEncoding.DecodeString(encoded)
	if err != nil || len(key) != 32 {
		return nil, errors.New("系统凭据密钥无效")
	}
	return key, nil
}
