package openai

import (
	"bytes"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestConvertGrokImageEditStripsRoutingGroup(t *testing.T) {
	gin.SetMode(gin.TestMode)

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	require.NoError(t, writer.WriteField("model", "grok-imagine-image"))
	require.NoError(t, writer.WriteField("group", "internal"))
	require.NoError(t, writer.WriteField("prompt", "edit this image"))
	part, err := writer.CreateFormFile("image", "input.jpg")
	require.NoError(t, err)
	_, err = part.Write([]byte("fake image"))
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = httptest.NewRequest(http.MethodPost, "/v1/images/edits", &body)
	context.Request.Header.Set("Content-Type", writer.FormDataContentType())

	converted, err := (&Adaptor{}).ConvertImageRequest(
		context,
		&relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeImagesEdits},
		dto.ImageRequest{Model: "grok-imagine-image", Prompt: "edit this image"},
	)
	require.NoError(t, err)

	convertedBody, ok := converted.(*bytes.Buffer)
	require.True(t, ok)
	replayed := httptest.NewRequest(http.MethodPost, "/v1/images/edits", bytes.NewReader(convertedBody.Bytes()))
	replayed.Header.Set("Content-Type", context.Request.Header.Get("Content-Type"))
	require.NoError(t, replayed.ParseMultipartForm(32<<20))
	require.Empty(t, replayed.PostForm.Get("group"))
	require.Len(t, replayed.MultipartForm.File["image"], 1)
	require.Empty(t, replayed.MultipartForm.File["image[]"])
}

func TestConvertGrokImageGenerationMapsAspectRatioToVerifiedProviderSize(t *testing.T) {
	tests := map[string]string{
		"1:1":  "1024x1024",
		"9:16": "720x1280",
		"16:9": "1280x720",
		"2:3":  "768x1152",
	}

	for aspectRatio, expectedSize := range tests {
		t.Run(aspectRatio, func(t *testing.T) {
			converted, err := (&Adaptor{}).ConvertImageRequest(
				nil,
				&relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeImagesGenerations},
				dto.ImageRequest{
					Model:       "grok-imagine-image",
					Prompt:      "test image",
					AspectRatio: aspectRatio,
					Resolution:  "1k",
					Size:        "1280x640",
				},
			)
			require.NoError(t, err)

			request, ok := converted.(dto.ImageRequest)
			require.True(t, ok)
			require.Equal(t, expectedSize, request.Size)
		})
	}
}

func TestConvertGrokImageGenerationRejectsUnsupportedAspectRatio(t *testing.T) {
	for _, aspectRatio := range []string{"2:1", "3:2"} {
		t.Run(aspectRatio, func(t *testing.T) {
			converted, err := (&Adaptor{}).ConvertImageRequest(
				nil,
				&relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeImagesGenerations},
				dto.ImageRequest{
					Model:       "grok-imagine-image",
					Prompt:      "test image",
					AspectRatio: aspectRatio,
					Resolution:  "1k",
				},
			)

			require.Nil(t, converted)
			require.EqualError(t, err, fmt.Sprintf("unsupported aspect_ratio %q for grok-imagine-image", aspectRatio))
		})
	}
}
