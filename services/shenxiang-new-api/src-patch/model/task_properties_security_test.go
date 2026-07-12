package model

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestTaskPropertiesHideUpstreamModelFromPublicJSON(t *testing.T) {
	properties := Properties{
		Input:             "public prompt",
		OriginModelName:   "public-model",
		UpstreamModelName: "internal-provider-model",
	}

	encoded, err := json.Marshal(properties)
	require.NoError(t, err)
	require.JSONEq(t, `{"input":"public prompt","origin_model_name":"public-model"}`, string(encoded))
	require.NotContains(t, string(encoded), "internal-provider-model")
}

func TestTaskPropertiesPreserveUpstreamModelInDatabaseValue(t *testing.T) {
	properties := Properties{
		Input:             "public prompt",
		OriginModelName:   "public-model",
		UpstreamModelName: "internal-provider-model",
	}

	value, err := properties.Value()
	require.NoError(t, err)
	encoded, ok := value.([]byte)
	require.True(t, ok)
	require.Contains(t, string(encoded), `"upstream_model_name":"internal-provider-model"`)
}
