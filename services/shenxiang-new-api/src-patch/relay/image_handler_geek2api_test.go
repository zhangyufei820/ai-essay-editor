package relay

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/stretchr/testify/require"
)

func TestSanitizeGeek2APIImage2OutboundBodyStripsWorkshopOnlyFields(t *testing.T) {
	body := []byte(`{
		"model":"gpt-image-2",
		"prompt":"red cube",
		"group":"default",
		"n":1,
		"size":"2048x2048",
		"quality":"low",
		"resolution":"2K",
		"image_size":"2K",
		"aspect_ratio":"1:1",
		"responseFormat":{"image":{"aspectRatio":"1:1","imageSize":"2K"}},
		"generationConfig":{"responseModalities":["TEXT","IMAGE"]},
		"extra_body":{"generationConfig":{"imageConfig":{"aspectRatio":"1:1"}}},
		"output_format":"png",
		"output_compression":100,
		"background":"auto",
		"moderation":"auto"
	}`)

	sanitized, err := sanitizeGeek2APIImage2OutboundBody(
		&relaycommon.RelayInfo{OriginModelName: geek2APIImage2ModelName},
		body,
	)
	require.NoError(t, err)

	var payload map[string]interface{}
	require.NoError(t, common.Unmarshal(sanitized, &payload))
	require.Equal(t, "gpt-image-2", payload["model"])
	require.Equal(t, "red cube", payload["prompt"])
	require.Equal(t, "2048x2048", payload["size"])
	require.Equal(t, "low", payload["quality"])
	require.Equal(t, "png", payload["output_format"])
	require.Contains(t, payload, "output_compression")
	require.Contains(t, payload, "background")
	require.Contains(t, payload, "moderation")
	require.NotContains(t, payload, "group")
	require.NotContains(t, payload, "resolution")
	require.NotContains(t, payload, "image_size")
	require.NotContains(t, payload, "aspect_ratio")
	require.NotContains(t, payload, "responseFormat")
	require.NotContains(t, payload, "generationConfig")
	require.NotContains(t, payload, "extra_body")
}

func TestSanitizeGeek2APIImage2OutboundBodyLeavesOtherModelsUntouched(t *testing.T) {
	body := []byte(`{"model":"gpt-image-2","resolution":"4K"}`)

	sanitized, err := sanitizeGeek2APIImage2OutboundBody(
		&relaycommon.RelayInfo{OriginModelName: "gpt-image-2-4K"},
		body,
	)

	require.NoError(t, err)
	require.Equal(t, string(body), string(sanitized))
}

func TestDiscountImage2V2OutboundBodyPreservesVerifiedFields(t *testing.T) {
	body := []byte(`{"model":"gpt-image-2","prompt":"poster","n":1,"size":"2880x2880","resolution":"4K","quality":"high","output_format":"png"}`)

	sanitized, err := sanitizeGeek2APIImage2OutboundBody(
		&relaycommon.RelayInfo{OriginModelName: "internal-image2-discount-v2"},
		body,
	)

	require.NoError(t, err)
	var payload map[string]interface{}
	require.NoError(t, common.Unmarshal(sanitized, &payload))
	require.Equal(t, "2880x2880", payload["size"])
	require.Equal(t, "4K", payload["resolution"])
	require.Equal(t, "high", payload["quality"])
	require.Equal(t, "png", payload["output_format"])
}

func TestUseGeminiAdaptorForNativeImageModelMappedFromOpenAIChannel(t *testing.T) {
	info := &relaycommon.RelayInfo{
		RelayMode: relayconstant.RelayModeImagesEdits,
		ChannelMeta: &relaycommon.ChannelMeta{
			ApiType:           constant.APITypeOpenAI,
			ChannelType:       constant.ChannelTypeOpenAI,
			ChannelBaseUrl:    "https://moonapix.com/v1/",
			UpstreamModelName: "gemini-3.1-flash-image-preview",
			IsModelMapped:     true,
		},
	}

	useGeminiAdaptorForNativeImageModel(info)

	require.Equal(t, constant.APITypeGemini, info.ApiType)
	require.Equal(t, constant.ChannelTypeOpenAI, info.ChannelType)
	require.Equal(t, "https://moonapix.com", info.ChannelBaseUrl)
}

func TestUseGeminiAdaptorForNativeImageModelSupportsNanoBananaAliases(t *testing.T) {
	info := &relaycommon.RelayInfo{
		RelayMode: relayconstant.RelayModeImagesGenerations,
		ChannelMeta: &relaycommon.ChannelMeta{
			ApiType:           constant.APITypeOpenAI,
			ChannelBaseUrl:    "https://moonapix.com",
			UpstreamModelName: "nano-banana-2",
		},
	}

	useGeminiAdaptorForNativeImageModel(info)

	require.Equal(t, constant.APITypeGemini, info.ApiType)
}

func TestUseGeminiAdaptorForApprovedOpenAIChatImageModels(t *testing.T) {
	for _, modelName := range []string{"gemini-3.1-flash-image", "gemini-3-pro-image"} {
		t.Run(modelName, func(t *testing.T) {
			info := &relaycommon.RelayInfo{
				RelayMode: relayconstant.RelayModeImagesGenerations,
				ChannelMeta: &relaycommon.ChannelMeta{
					ApiType:           constant.APITypeOpenAI,
					ChannelType:       constant.ChannelTypeOpenAI,
					ChannelBaseUrl:    "https://new.ddpapi.top/v1/",
					UpstreamModelName: modelName,
				},
			}

			useGeminiAdaptorForNativeImageModel(info)

			require.Equal(t, constant.APITypeGemini, info.ApiType)
			require.Equal(t, "https://new.ddpapi.top", info.ChannelBaseUrl)
		})
	}
}
