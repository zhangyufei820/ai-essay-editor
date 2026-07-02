package relay

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	appconstant "github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestHydrateNativeGeminiImageRequestFromMultipartPreservesImageConfig(t *testing.T) {
	gin.SetMode(gin.TestMode)

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	require.NoError(t, writer.WriteField("model", "banana-2"))
	require.NoError(t, writer.WriteField("prompt", "turn this into a portrait poster"))
	require.NoError(t, writer.WriteField("size", "2048x4096"))
	require.NoError(t, writer.WriteField("aspect_ratio", "9:16"))
	require.NoError(t, writer.WriteField("resolution", "4K"))
	require.NoError(t, writer.WriteField("image_size", "4K"))
	require.NoError(t, writer.WriteField("responseFormat", `{"image":{"aspectRatio":"9:16","imageSize":"4K"}}`))
	require.NoError(t, writer.WriteField("generationConfig", `{"imageConfig":{"aspectRatio":"9:16","imageSize":"4K"}}`))
	require.NoError(t, writer.WriteField("extra_body", `{"google":{"image_config":{"aspect_ratio":"9:16","image_size":"4K"}}}`))
	imagePart, err := writer.CreateFormFile("image", "reference.png")
	require.NoError(t, err)
	_, err = imagePart.Write([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'})
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/edits", bytes.NewReader(body.Bytes()))
	ctx.Request.Header.Set("Content-Type", writer.FormDataContentType())
	defer common.CleanupBodyStorage(ctx)

	request, err := helper.GetAndValidOpenAIImageRequest(ctx, relayconstant.RelayModeImagesEdits)
	require.NoError(t, err)
	require.Empty(t, request.AspectRatio)
	require.Empty(t, request.Resolution)
	require.Empty(t, request.ImageSize)
	require.Empty(t, request.ResponseFormatObj)
	require.Empty(t, request.GenerationConfig)
	require.Empty(t, request.ExtraBody)

	hydrateNativeGeminiImageRequestFromMultipart(ctx, &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{ApiType: appconstant.APITypeGemini},
	}, request)

	require.Equal(t, "9:16", request.AspectRatio)
	require.Equal(t, "4K", request.Resolution)
	require.Equal(t, "4K", request.ImageSize)

	var responseFormat map[string]any
	require.NoError(t, json.Unmarshal(request.ResponseFormatObj, &responseFormat))
	require.Equal(t, "9:16", responseFormat["image"].(map[string]any)["aspectRatio"])

	var generationConfig map[string]any
	require.NoError(t, json.Unmarshal(request.GenerationConfig, &generationConfig))
	require.Equal(t, "4K", generationConfig["imageConfig"].(map[string]any)["imageSize"])

	var extraBody map[string]any
	require.NoError(t, json.Unmarshal(request.ExtraBody, &extraBody))
	google := extraBody["google"].(map[string]any)
	imageConfig := google["image_config"].(map[string]any)
	require.Equal(t, "9:16", imageConfig["aspect_ratio"])
	require.Equal(t, "4K", imageConfig["image_size"])
}
