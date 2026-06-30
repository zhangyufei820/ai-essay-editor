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

	require.Contains(t, videoModels, "seedance-2.0")
	require.Contains(t, videoModels, "seedance-2.0-dj-fast")
	require.Contains(t, videoModels, "seedance-2.0-ld-17")
	require.Contains(t, videoModels, "grok-video-super-720p")
}
