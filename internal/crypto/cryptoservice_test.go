package crypto

import (
	"encoding/base64"
	"encoding/json"
	"regexp"
	"strings"
	"testing"
)

func TestPBKDF2SHA256Vector(t *testing.T) {
	actual := base64.StdEncoding.EncodeToString(pbkdf2SHA256([]byte("password"), []byte("salt"), 1, 32))
	const expected = "Eg+2z/z4syxD5yJSVsT4N6hlSMkszDVICAWYfLcL4Xs="
	if actual != expected {
		t.Fatalf("PBKDF2 mismatch: got %s", actual)
	}
}

func TestAESRoundTripAndPayloadCompatibility(t *testing.T) {
	service := &CryptoService{}
	encrypted, err := service.AES("encrypt", "Quick 世界", "correct horse battery staple")
	if err != nil {
		t.Fatal(err)
	}
	payloadJSON, err := base64.StdEncoding.DecodeString(encrypted)
	if err != nil {
		t.Fatal(err)
	}
	var payload aesPayload
	if err := json.Unmarshal(payloadJSON, &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Version != 1 {
		t.Fatalf("unexpected payload version: %d", payload.Version)
	}
	decrypted, err := service.AES("decrypt", encrypted, "correct horse battery staple")
	if err != nil {
		t.Fatal(err)
	}
	if decrypted != "Quick 世界" {
		t.Fatalf("unexpected plaintext: %q", decrypted)
	}
}

func TestRSAEncryptAndSign(t *testing.T) {
	service := &CryptoService{}
	keys, err := service.GenerateRSA("encrypt")
	if err != nil {
		t.Fatal(err)
	}
	encrypted, err := service.RSA("encrypt", "Quick RSA", "", keys.PublicKey, "")
	if err != nil {
		t.Fatal(err)
	}
	decrypted, err := service.RSA("decrypt", encrypted.Output, "", "", keys.PrivateKey)
	if err != nil {
		t.Fatal(err)
	}
	if decrypted.Output != "Quick RSA" {
		t.Fatalf("unexpected plaintext: %q", decrypted.Output)
	}
	signed, err := service.RSA("sign", "Quick RSA", "", "", keys.PrivateKey)
	if err != nil {
		t.Fatal(err)
	}
	verified, err := service.RSA("verify", "Quick RSA", signed.Output, keys.PublicKey, "")
	if err != nil || !verified.Valid {
		t.Fatalf("signature did not verify: valid=%v err=%v", verified.Valid, err)
	}
}

func TestJWTSignParseAndVerify(t *testing.T) {
	service := &CryptoService{}
	secret := strings.Repeat("s", 32)
	token, err := service.JWT("sign", `{"sub":"quick-user"}`, secret)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := service.JWT("parse", token, "")
	if err != nil || !strings.Contains(parsed, "quick-user") {
		t.Fatalf("parse failed: %s %v", parsed, err)
	}
	verified, err := service.JWT("verify", token, secret)
	if err != nil || !strings.Contains(verified, "protectedHeader") {
		t.Fatalf("verify failed: %s %v", verified, err)
	}
}

func TestIdentifiersUseExpectedFormats(t *testing.T) {
	service := &CryptoService{}
	uuid, err := service.GenerateIdentifier("uuid", 0)
	if err != nil || !regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`).MatchString(uuid) {
		t.Fatalf("invalid UUID %q: %v", uuid, err)
	}
	ulid, err := service.GenerateIdentifier("ulid", 0)
	if err != nil || !regexp.MustCompile(`^[0-7][0-9A-HJKMNP-TV-Z]{25}$`).MatchString(ulid) {
		t.Fatalf("invalid ULID %q: %v", ulid, err)
	}
	password, err := service.GenerateIdentifier("password", 64)
	if err != nil || len(password) != 64 {
		t.Fatalf("invalid password length %d: %v", len(password), err)
	}
}
