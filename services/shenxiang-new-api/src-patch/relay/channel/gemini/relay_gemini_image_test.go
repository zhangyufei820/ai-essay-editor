package gemini

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/constant"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestConvertImageRequestAllowsGeminiImagePreviewMultipartEdit(t *testing.T) {
	gin.SetMode(gin.TestMode)

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	require.NoError(t, writer.WriteField("model", "banana-2"))
	require.NoError(t, writer.WriteField("prompt", "turn this into a product poster"))
	require.NoError(t, writer.WriteField("size", "2048x4096"))
	require.NoError(t, writer.WriteField("aspect_ratio", "3:4"))
	imagePart, err := writer.CreateFormFile("image", "reference.png")
	require.NoError(t, err)
	_, err = imagePart.Write([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n', 0, 0, 0, 0})
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/edits", bytes.NewReader(body.Bytes()))
	ctx.Request.Header.Set("Content-Type", writer.FormDataContentType())
	storage, err := common.CreateBodyStorage(body.Bytes())
	require.NoError(t, err)
	ctx.Set(common.KeyBodyStorage, storage)
	defer common.CleanupBodyStorage(ctx)

	converted, err := (&Adaptor{}).ConvertImageRequest(ctx, &relaycommon.RelayInfo{
		RelayMode:   constant.RelayModeImagesEdits,
		ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "gemini-3.1-flash-image-preview"},
	}, dto.ImageRequest{
		Prompt:      "turn this into a product poster",
		Size:        "2048x4096",
		AspectRatio: "3:4",
	})

	require.NoError(t, err)
	geminiRequest, ok := converted.(*dto.GeminiChatRequest)
	require.True(t, ok)
	require.Equal(t, []string{"TEXT", "IMAGE"}, geminiRequest.GenerationConfig.ResponseModalities)
	require.Len(t, geminiRequest.Contents, 1)
	require.Len(t, geminiRequest.Contents[0].Parts, 2)
	require.Equal(t, "turn this into a product poster", geminiRequest.Contents[0].Parts[0].Text)
	require.NotNil(t, geminiRequest.Contents[0].Parts[1].InlineData)
	require.Equal(t, "image/png", geminiRequest.Contents[0].Parts[1].InlineData.MimeType)
	require.NotEmpty(t, geminiRequest.Contents[0].Parts[1].InlineData.Data)

	var imageConfig map[string]string
	require.NoError(t, json.Unmarshal(geminiRequest.GenerationConfig.ImageConfig, &imageConfig))
	require.Equal(t, "3:4", imageConfig["aspectRatio"])
	require.Empty(t, imageConfig["imageSize"])
}

func TestConvertImageRequestRejectsNonImagineGeminiModel(t *testing.T) {
	_, err := (&Adaptor{}).ConvertImageRequest(nil, &relaycommon.RelayInfo{
		RelayMode:   constant.RelayModeImagesGenerations,
		ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "gemini-2.0-flash"},
	}, dto.ImageRequest{Prompt: "test"})
	require.ErrorContains(t, err, "only imagen and gemini image-preview models are supported")
}

func TestGeminiImageHandlerConvertsInlineDataCandidates(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", nil)

	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body: io.NopCloser(strings.NewReader(`{
			"candidates": [
				{
					"content": {
						"parts": [
							{"text": "done"},
							{"inlineData": {"mimeType": "image/png", "data": "ZmFrZS1wbmc="}}
						]
					}
				}
			],
			"usageMetadata": {
				"promptTokenCount": 297,
				"candidatesTokenCount": 1120,
				"totalTokenCount": 1417
			}
		}`)),
	}

	usage, apiErr := GeminiImageHandler(ctx, &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "banana-2"},
	}, resp)
	require.Nil(t, apiErr)
	require.NotNil(t, usage)
	require.Equal(t, 297, usage.PromptTokens)
	require.Equal(t, 1120, usage.CompletionTokens)
	require.Equal(t, 1417, usage.TotalTokens)

	require.Equal(t, http.StatusOK, recorder.Code)
	var imageResponse dto.ImageResponse
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &imageResponse))
	require.Len(t, imageResponse.Data, 1)
	require.Equal(t, "ZmFrZS1wbmc=", imageResponse.Data[0].B64Json)
}

func TestGeminiImagePreviewRelayUsesImageHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/edits", nil)

	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body: io.NopCloser(strings.NewReader(`{
			"candidates": [
				{
					"content": {
						"parts": [
							{"inlineData": {"mimeType": "image/png", "data": "ZmFrZS1wbmc="}}
						]
					}
				}
			]
		}`)),
	}

	usage, apiErr := (&Adaptor{}).DoResponse(ctx, resp, &relaycommon.RelayInfo{
		RelayMode:   constant.RelayModeImagesEdits,
		ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "gemini-3.1-flash-image-preview"},
	})
	require.Nil(t, apiErr)
	require.NotNil(t, usage)

	var imageResponse dto.ImageResponse
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &imageResponse))
	require.Len(t, imageResponse.Data, 1)
	require.Equal(t, "ZmFrZS1wbmc=", imageResponse.Data[0].B64Json)
}
