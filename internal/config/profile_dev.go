//go:build !production

package config

// Development builds never migrate or overwrite released-product settings.
const configProfile = "dev"
const ProfileSubdirectory = configProfile
const ApplicationName = "Quick Dev"
