package service

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSystemTokenProfilesIncludesSeedanceVideoModels(t *testing.T) {
	var videoModels []string
	for _, profile := range SystemTokenProfiles() {
		if profile.Mode == "video" {
			videoModels = profile.Models
			break
		}
	}

	require.Contains(t, videoModels, "seedance-2.0-dj-fast")
	require.Contains(t, videoModels, "seedance-2.0-ld-17")
	require.Contains(t, videoModels, "grok-video-super-720p")
	require.Contains(t, videoModels, "seedance-2.0")
	require.Contains(t, videoModels, "seedance-2.0-cl-mini")
	require.NotContains(t, videoModels, "seedance-2.0-kz-fast")
	require.NotContains(t, videoModels, "seedance-2.0-cl-fast")
	require.NotContains(t, videoModels, "seedance-2.0-cl")
}

func TestSystemTokenProfilesIncludesGeek2APIImage2(t *testing.T) {
	var imageModels []string
	for _, profile := range SystemTokenProfiles() {
		if profile.Mode == "image" {
			imageModels = profile.Models
			break
		}
	}

	require.Contains(t, imageModels, "gpt-image-2-4K")
	require.Contains(t, imageModels, "geek2api-image-2")
}
