package dto

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSeedream55SizeAndSuccessfulCount(t *testing.T) {
	for _, tc := range []struct {
		size string
		rate int
	}{{"1K", 1092}, {"1.5K", 1092}, {"2K", 1932}, {"", 1932}, {"1800x1450", 1092}, {"1800x1451", 1932}} {
		q, err := Seedream55QuoteForRequest(&ImageRequest{Model: Seedream55Model, Prompt: "画一只鸟", Size: tc.size, Image: json.RawMessage(`["https://a.test/a.png","https://a.test/b.png"]`)})
		require.NoError(t, err)
		require.Equal(t, tc.rate, q.OutputRate)
		require.Equal(t, 2, q.InputCount)
		require.Equal(t, tc.rate+840, q.TotalUnits(1))
		require.Zero(t, q.TotalUnits(0))
	}
}

func TestSeedream55SplitValidation(t *testing.T) {
	r := ImageRequest{Model: Seedream55Model, Size: "auto", Image: json.RawMessage(`"https://a.test/in.png"`), LayerDecomposition: true}
	q, err := Seedream55QuoteForRequest(&r)
	require.NoError(t, err)
	require.Equal(t, 30, q.OutputCap)
	require.Equal(t, 420+2*1932, q.TotalUnits(2))
	cap := 101
	r.LayerDecompositionOptions = &Seedream55LayerOptions{MaxImages: &cap}
	_, err = Seedream55QuoteForRequest(&r)
	require.Error(t, err)
	cap = 2
	_, err = Seedream55QuoteForRequest(&r)
	require.NoError(t, err)
	r.Image = json.RawMessage(`["https://a.test/a.png","https://a.test/b.png"]`)
	_, err = Seedream55QuoteForRequest(&r)
	require.Error(t, err)
}

func TestSeedream55InvalidRequest(t *testing.T) {
	for _, body := range []string{
		`{"prompt":""}`, `{"prompt":"画画","n":2}`, `{"prompt":"画画","stream":true}`,
		`{"prompt":"画画","size":"9999999999999999999x1000"}`, `{"prompt":"画画","size":"4K"}`,
		`{"prompt":"修改","image":[null]}`, `{"layer_decomposition":true}`,
		`{"prompt":"画画","background":"transparent","output_format":"jpeg"}`,
		`{"prompt":"画画","extra_body":{"size":"2K"}}`,
	} {
		var req ImageRequest
		require.NoError(t, json.Unmarshal([]byte(body), &req))
		req.Model = Seedream55Model
		_, err := Seedream55QuoteForRequest(&req)
		require.Error(t, err, body)
	}
}
