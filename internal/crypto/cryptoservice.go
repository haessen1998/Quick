package crypto

import (
	stdcrypto "crypto"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/md5"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/sha512"
	"crypto/x509"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"hash"
	"strings"
	"time"
)

const (
	identifierMaxLength = 4096
	quickSnowflakeEpoch = int64(1704067200000)
)

type CryptoService struct{}

type RSAKeyPair struct {
	PublicKey  string `json:"publicKey"`
	PrivateKey string `json:"privateKey"`
}

type RSAOperationResult struct {
	Output string `json:"output"`
	Valid  bool   `json:"valid"`
}

type aesPayload struct {
	Version int    `json:"v"`
	Salt    string `json:"salt"`
	IV      string `json:"iv"`
	Data    string `json:"data"`
}

func hashFactory(algorithm string) (func() hash.Hash, error) {
	switch strings.ToUpper(strings.TrimSpace(algorithm)) {
	case "MD5":
		return md5.New, nil
	case "SHA-1":
		return sha1.New, nil
	case "SHA-256":
		return sha256.New, nil
	case "SHA-512":
		return sha512.New, nil
	default:
		return nil, fmt.Errorf("不支持的 Hash 算法：%s", algorithm)
	}
}

func (s *CryptoService) Hash(input string, algorithm string, useHMAC bool, secret string) (string, error) {
	factory, err := hashFactory(algorithm)
	if err != nil {
		return "", err
	}
	var digest hash.Hash
	if useHMAC {
		if strings.EqualFold(strings.TrimSpace(algorithm), "MD5") {
			return "", errors.New("HMAC-MD5 已禁用，请选择 SHA 系列")
		}
		digest = hmac.New(factory, []byte(secret))
	} else {
		digest = factory()
	}
	_, _ = digest.Write([]byte(input))
	return hex.EncodeToString(digest.Sum(nil)), nil
}

func pbkdf2SHA256(password []byte, salt []byte, iterations int, length int) []byte {
	result := make([]byte, 0, length)
	var blockIndex uint32 = 1
	for len(result) < length {
		mac := hmac.New(sha256.New, password)
		_, _ = mac.Write(salt)
		var counter [4]byte
		binary.BigEndian.PutUint32(counter[:], blockIndex)
		_, _ = mac.Write(counter[:])
		current := mac.Sum(nil)
		block := append([]byte(nil), current...)
		for iteration := 1; iteration < iterations; iteration++ {
			mac = hmac.New(sha256.New, password)
			_, _ = mac.Write(current)
			current = mac.Sum(nil)
			for index := range block {
				block[index] ^= current[index]
			}
		}
		result = append(result, block...)
		blockIndex++
	}
	return result[:length]
}

func encryptAES(input string, password string) (string, error) {
	if password == "" {
		return "", errors.New("请输入 AES 密码")
	}
	salt := make([]byte, 16)
	iv := make([]byte, 12)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("读取安全随机源失败：%w", err)
	}
	if _, err := rand.Read(iv); err != nil {
		return "", fmt.Errorf("读取安全随机源失败：%w", err)
	}
	block, err := aes.NewCipher(pbkdf2SHA256([]byte(password), salt, 210000, 32))
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	payload := aesPayload{
		Version: 1,
		Salt:    base64.StdEncoding.EncodeToString(salt),
		IV:      base64.StdEncoding.EncodeToString(iv),
		Data:    base64.StdEncoding.EncodeToString(gcm.Seal(nil, iv, []byte(input), nil)),
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(encoded), nil
}

func decryptAES(input string, password string) (string, error) {
	if password == "" {
		return "", errors.New("请输入 AES 密码")
	}
	encoded, err := base64.StdEncoding.DecodeString(strings.TrimSpace(input))
	if err != nil {
		return "", errors.New("加密载荷不是有效的 Base64")
	}
	var payload aesPayload
	if err := json.Unmarshal(encoded, &payload); err != nil || payload.Version != 1 {
		return "", errors.New("加密载荷格式无效或版本不受支持")
	}
	salt, err := base64.StdEncoding.DecodeString(payload.Salt)
	if err != nil || len(salt) != 16 {
		return "", errors.New("加密载荷中的 Salt 无效")
	}
	iv, err := base64.StdEncoding.DecodeString(payload.IV)
	if err != nil || len(iv) != 12 {
		return "", errors.New("加密载荷中的 IV 无效")
	}
	data, err := base64.StdEncoding.DecodeString(payload.Data)
	if err != nil {
		return "", errors.New("加密载荷中的密文无效")
	}
	block, err := aes.NewCipher(pbkdf2SHA256([]byte(password), salt, 210000, 32))
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	plaintext, err := gcm.Open(nil, iv, data, nil)
	if err != nil {
		return "", errors.New("解密失败：密码错误或数据已损坏")
	}
	return string(plaintext), nil
}

func (s *CryptoService) AES(mode string, input string, password string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "encrypt":
		return encryptAES(input, password)
	case "decrypt":
		return decryptAES(input, password)
	default:
		return "", fmt.Errorf("不支持的 AES 操作：%s", mode)
	}
}

func (s *CryptoService) GenerateRSA(usage string) (RSAKeyPair, error) {
	if usage != "encrypt" && usage != "sign" {
		return RSAKeyPair{}, fmt.Errorf("不支持的 RSA 密钥用途：%s", usage)
	}
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return RSAKeyPair{}, fmt.Errorf("生成 RSA 密钥失败：%w", err)
	}
	publicDER, err := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
	if err != nil {
		return RSAKeyPair{}, err
	}
	privateDER, err := x509.MarshalPKCS8PrivateKey(privateKey)
	if err != nil {
		return RSAKeyPair{}, err
	}
	return RSAKeyPair{
		PublicKey:  string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: publicDER})),
		PrivateKey: string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: privateDER})),
	}, nil
}

func parsePublicKey(value string) (*rsa.PublicKey, error) {
	block, _ := pem.Decode([]byte(value))
	if block == nil || block.Type != "PUBLIC KEY" {
		return nil, errors.New("请输入有效的 PKIX RSA 公钥")
	}
	parsed, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, errors.New("无法解析 RSA 公钥")
	}
	key, ok := parsed.(*rsa.PublicKey)
	if !ok {
		return nil, errors.New("输入的公钥不是 RSA 密钥")
	}
	return key, nil
}

func parsePrivateKey(value string) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode([]byte(value))
	if block == nil || block.Type != "PRIVATE KEY" {
		return nil, errors.New("请输入有效的 PKCS#8 RSA 私钥")
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, errors.New("无法解析 RSA 私钥")
	}
	key, ok := parsed.(*rsa.PrivateKey)
	if !ok {
		return nil, errors.New("输入的私钥不是 RSA 密钥")
	}
	return key, nil
}

func (s *CryptoService) RSA(action string, input string, signature string, publicKeyPEM string, privateKeyPEM string) (RSAOperationResult, error) {
	switch strings.ToLower(strings.TrimSpace(action)) {
	case "encrypt":
		key, err := parsePublicKey(publicKeyPEM)
		if err != nil {
			return RSAOperationResult{}, err
		}
		output, err := rsa.EncryptOAEP(sha256.New(), rand.Reader, key, []byte(input), nil)
		if err != nil {
			return RSAOperationResult{}, fmt.Errorf("RSA 加密失败：%w", err)
		}
		return RSAOperationResult{Output: base64.StdEncoding.EncodeToString(output)}, nil
	case "decrypt":
		key, err := parsePrivateKey(privateKeyPEM)
		if err != nil {
			return RSAOperationResult{}, err
		}
		data, err := base64.StdEncoding.DecodeString(strings.TrimSpace(input))
		if err != nil {
			return RSAOperationResult{}, errors.New("RSA 密文不是有效的 Base64")
		}
		output, err := rsa.DecryptOAEP(sha256.New(), rand.Reader, key, data, nil)
		if err != nil {
			return RSAOperationResult{}, errors.New("RSA 解密失败：私钥不匹配或密文已损坏")
		}
		return RSAOperationResult{Output: string(output)}, nil
	case "sign":
		key, err := parsePrivateKey(privateKeyPEM)
		if err != nil {
			return RSAOperationResult{}, err
		}
		digest := sha256.Sum256([]byte(input))
		output, err := rsa.SignPSS(rand.Reader, key, stdcrypto.SHA256, digest[:], &rsa.PSSOptions{SaltLength: 32, Hash: stdcrypto.SHA256})
		if err != nil {
			return RSAOperationResult{}, fmt.Errorf("RSA 签名失败：%w", err)
		}
		return RSAOperationResult{Output: base64.StdEncoding.EncodeToString(output)}, nil
	case "verify":
		key, err := parsePublicKey(publicKeyPEM)
		if err != nil {
			return RSAOperationResult{}, err
		}
		decoded, err := base64.StdEncoding.DecodeString(strings.TrimSpace(signature))
		if err != nil {
			return RSAOperationResult{}, errors.New("RSA 签名不是有效的 Base64")
		}
		digest := sha256.Sum256([]byte(input))
		err = rsa.VerifyPSS(key, stdcrypto.SHA256, digest[:], decoded, &rsa.PSSOptions{SaltLength: 32, Hash: stdcrypto.SHA256})
		return RSAOperationResult{Valid: err == nil}, nil
	default:
		return RSAOperationResult{}, fmt.Errorf("不支持的 RSA 操作：%s", action)
	}
}

func decodeJWTPart(value string, target any) error {
	data, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return errors.New("JWT 包含无效的 Base64URL")
	}
	if err := json.Unmarshal(data, target); err != nil {
		return errors.New("JWT 包含无效的 JSON")
	}
	return nil
}

func parseJWT(value string) (map[string]any, map[string]any, []string, error) {
	parts := strings.Split(strings.TrimSpace(value), ".")
	if len(parts) != 3 || parts[0] == "" || parts[1] == "" {
		return nil, nil, nil, errors.New("JWT 必须包含 header、payload 和 signature 三段")
	}
	header := map[string]any{}
	payload := map[string]any{}
	if err := decodeJWTPart(parts[0], &header); err != nil {
		return nil, nil, nil, err
	}
	if err := decodeJWTPart(parts[1], &payload); err != nil {
		return nil, nil, nil, err
	}
	return header, payload, parts, nil
}

func prettyJSON(value any) (string, error) {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func validateJWTTimeClaims(payload map[string]any) error {
	now := float64(time.Now().Unix())
	if expires, ok := payload["exp"].(float64); ok && expires <= now {
		return errors.New("JWT 已过期")
	}
	if notBefore, ok := payload["nbf"].(float64); ok && notBefore > now {
		return errors.New("JWT 尚未生效")
	}
	return nil
}

func (s *CryptoService) JWT(mode string, input string, secret string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "parse":
		header, payload, _, err := parseJWT(input)
		if err != nil {
			return "", err
		}
		return prettyJSON(map[string]any{"header": header, "payload": payload})
	case "sign":
		if len([]byte(secret)) < 32 {
			return "", errors.New("HS256 密钥建议至少 32 字节")
		}
		payload := map[string]any{}
		if err := json.Unmarshal([]byte(input), &payload); err != nil {
			return "", errors.New("JWT Payload 必须是有效的 JSON 对象")
		}
		now := time.Now().Unix()
		payload["iat"] = now
		payload["exp"] = now + 2*60*60
		headerPart, _ := json.Marshal(map[string]any{"alg": "HS256", "typ": "JWT"})
		payloadPart, err := json.Marshal(payload)
		if err != nil {
			return "", err
		}
		unsigned := base64.RawURLEncoding.EncodeToString(headerPart) + "." + base64.RawURLEncoding.EncodeToString(payloadPart)
		mac := hmac.New(sha256.New, []byte(secret))
		_, _ = mac.Write([]byte(unsigned))
		return unsigned + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
	case "verify":
		if len([]byte(secret)) < 32 {
			return "", errors.New("HS256 密钥建议至少 32 字节")
		}
		header, payload, parts, err := parseJWT(input)
		if err != nil {
			return "", err
		}
		if algorithm, _ := header["alg"].(string); algorithm != "HS256" {
			return "", errors.New("JWT 算法必须是 HS256")
		}
		signature, err := base64.RawURLEncoding.DecodeString(parts[2])
		if err != nil {
			return "", errors.New("JWT 签名不是有效的 Base64URL")
		}
		mac := hmac.New(sha256.New, []byte(secret))
		_, _ = mac.Write([]byte(parts[0] + "." + parts[1]))
		if !hmac.Equal(signature, mac.Sum(nil)) {
			return "", errors.New("JWT 签名验证失败")
		}
		if err := validateJWTTimeClaims(payload); err != nil {
			return "", err
		}
		return prettyJSON(map[string]any{"protectedHeader": header, "payload": payload})
	default:
		return "", fmt.Errorf("不支持的 JWT 操作：%s", mode)
	}
}

func randomString(length int, alphabet string) (string, error) {
	if length < 1 || length > identifierMaxLength {
		return "", fmt.Errorf("长度需要在 1–%d 之间", identifierMaxLength)
	}
	if alphabet == "" || len(alphabet) > 256 {
		return "", errors.New("随机字符集无效")
	}
	limit := 256 - (256 % len(alphabet))
	result := make([]byte, 0, length)
	buffer := make([]byte, 128)
	for len(result) < length {
		if _, err := rand.Read(buffer); err != nil {
			return "", fmt.Errorf("读取安全随机源失败：%w", err)
		}
		for _, value := range buffer {
			if int(value) < limit {
				result = append(result, alphabet[int(value)%len(alphabet)])
				if len(result) == length {
					break
				}
			}
		}
	}
	return string(result), nil
}

func generateUUID() (string, error) {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return "", fmt.Errorf("读取安全随机源失败：%w", err)
	}
	value[6] = (value[6] & 0x0f) | 0x40
	value[8] = (value[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		value[0:4], value[4:6], value[6:8], value[8:10], value[10:16]), nil
}

func generateULID() (string, error) {
	value := make([]byte, 16)
	milliseconds := uint64(time.Now().UnixMilli())
	value[0] = byte(milliseconds >> 40)
	value[1] = byte(milliseconds >> 32)
	value[2] = byte(milliseconds >> 24)
	value[3] = byte(milliseconds >> 16)
	value[4] = byte(milliseconds >> 8)
	value[5] = byte(milliseconds)
	if _, err := rand.Read(value[6:]); err != nil {
		return "", fmt.Errorf("读取安全随机源失败：%w", err)
	}
	const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
	encoded := make([]byte, 26)
	bitBuffer := uint32(0)
	bits := 2 // ULID is 128 bits represented in a 130-bit field with two leading zero bits.
	inputIndex := 0
	for index := 0; index < len(encoded); index++ {
		for bits < 5 {
			bitBuffer = (bitBuffer << 8) | uint32(value[inputIndex])
			inputIndex++
			bits += 8
		}
		shift := bits - 5
		encoded[index] = alphabet[(bitBuffer>>shift)&31]
		if shift == 0 {
			bitBuffer = 0
		} else {
			bitBuffer &= (1 << shift) - 1
		}
		bits = shift
	}
	return string(encoded), nil
}

func generateSnowflake() (string, error) {
	var randomBits [4]byte
	if _, err := rand.Read(randomBits[:]); err != nil {
		return "", fmt.Errorf("读取安全随机源失败：%w", err)
	}
	timestamp := time.Now().UnixMilli() - quickSnowflakeEpoch
	if timestamp < 0 {
		return "", errors.New("系统时间早于 Quick 雪花 ID 纪元")
	}
	value := (uint64(timestamp) << 22) | uint64(binary.BigEndian.Uint32(randomBits[:])&0x3fffff)
	return fmt.Sprintf("%d", value), nil
}

func (s *CryptoService) GenerateIdentifier(kind string, length int) (string, error) {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "uuid", "guid":
		return generateUUID()
	case "ulid":
		return generateULID()
	case "snowflake":
		return generateSnowflake()
	case "number":
		return randomString(length, "0123456789")
	case "password":
		return randomString(length, "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=")
	case "string":
		return randomString(length, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789")
	default:
		return "", fmt.Errorf("不支持的生成类型：%s", kind)
	}
}
