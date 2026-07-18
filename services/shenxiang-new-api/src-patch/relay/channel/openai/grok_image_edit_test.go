package openai

import (
	"bytes"
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

func TestConvertGrokImageEditUsesArrayFileField(t *testing.T) {
	gin.SetMode(gin.TestMode)

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	require.NoError(t, writer.WriteField("model", "grok-imagine-image"))
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
	require.Empty(t, replayed.MultipartForm.File["image"])
	require.Len(t, replayed.MultipartForm.File["image[]"], 1)
}
