package constant

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPath2RelayModeSupportsPlaygroundImages(t *testing.T) {
	require.Equal(t, RelayModeImagesGenerations, Path2RelayMode("/pg/images/generations"))
	require.Equal(t, RelayModeImagesEdits, Path2RelayMode("/pg/images/edits"))
	require.Equal(t, RelayModeImagesEdits, Path2RelayMode("/pg/images/edits?endpoint=/pg/images/edits"))
}

func TestPath2RelayModeSupportsVideoTasks(t *testing.T) {
	require.Equal(t, RelayModeVideoSubmit, Path2RelayMode("/v1/videos"))
	require.Equal(t, RelayModeVideoFetchByID, Path2RelayMode("/v1/videos/task_123"))
	require.Equal(t, RelayModeVideoSubmit, Path2RelayMode("/pg/videos"))
	require.Equal(t, RelayModeVideoFetchByID, Path2RelayMode("/pg/videos/task_123"))
	require.Equal(t, RelayModeVideoSubmit, Path2RelayMode("/pg/video/generations"))
	require.Equal(t, RelayModeVideoFetchByID, Path2RelayMode("/pg/video/generations/task_123"))
}
