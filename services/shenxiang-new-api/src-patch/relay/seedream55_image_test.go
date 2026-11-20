package relay

import (
	"encoding/json"
	"testing"

	"github.com/QuantumNous/new-api/dto"
	"github.com/stretchr/testify/require"
)

func TestSeedream55CountRequiresCompleteOutputs(t *testing.T) {
	for _, tc := range []struct {
		body       string
		cap, count int
	}{
		{`{"data":[{"url":"https://a.test/file"}]}`, 1, 1},
		{`{"data":[{"url":"https://a.test/file","z_index":0},{"url":"https://a.test/file","z_index":1}]}`, 3, 2},
		{`{"data":[{"b64_json":"AQID"}]}`, 1, 1},
		{`{"data":[{"b64_json":"!!!"}]}`, 1, 0},
		{`{"error":{"code":"failed"},"data":[{"url":"https://a.test/file"}]}`, 1, 0},
		{`{"data":[{"url":"https://a.test/file"},{"error":{"message":"failed"}}]}`, 3, 0},
		{`{"data":[{"url":"https://a.test/file"},{}]}`, 3, 0},
		{`{"data":[{"url":"https://a.test/a"},{"url":"https://a.test/b"}]}`, 1, 0},
		{`{"data":[]}`, 2, 0},
		{`{}`, 1, 0},
	} {
		count, err := seedream55OutputCount([]byte(tc.body), tc.cap)
		if tc.count == 0 {
			require.Error(t, err)
		} else {
			require.NoError(t, err)
		}
		require.Equal(t, tc.count, count)
	}
}

func TestSeedream55OutboundOnlyForwardsValidatedFields(t *testing.T) {
	var req dto.ImageRequest
	require.NoError(t, json.Unmarshal([]byte(`{"model":"doubao-seedream-5-5-261028","n":1,"output_format":"png","size":"1.5K","image":"https://a.test/file","layer_decomposition":true,"layer_decomposition_options":{"max_images":5,"text_recognition":true},"extra_body":{"size":"2K"},"price":0}`), &req))
	body, err := seedream55OutboundBody(&req)
	require.NoError(t, err)
	require.JSONEq(t, `{"model":"doubao-seedream-5-5-261028","output_format":"png","size":"1.5K","image":"https://a.test/file","layer_decomposition":true,"layer_decomposition_options":{"max_images":5,"text_recognition":true}}`, string(body))
}
