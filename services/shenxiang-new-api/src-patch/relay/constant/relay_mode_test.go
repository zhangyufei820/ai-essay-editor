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
