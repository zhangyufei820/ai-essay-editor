package controller

import (
	"bytes"
	"encoding/json"
	"image"
	"image/png"
	"mime"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestPlaygroundMediaPolicyUsesProviderSpecificImageLimits(t *testing.T) {
	gpt := playgroundMediaPolicyFor("gpt-image-2.5-flare", "image_edit")
	require.Equal(t, int64(49*1024*1024), gpt.MaxImageBytes)
	require.Equal(t, playgroundMediaGlobalRequestBytes, gpt.MaxTotalBytes)
	require.Equal(t, "stored_url", gpt.UploadTransport)
	require.True(t, gpt.AutoCompress)

	gemini := playgroundMediaPolicyFor("banana-2", "image_edit")
	require.Equal(t, int64(18*1024*1024), gemini.MaxImageBytes)
	require.Equal(t, int64(18*1024*1024), gemini.MaxTotalBytes)

	fallback := playgroundMediaPolicyFor("grok-imagine-image", "image_edit")
	require.Equal(t, int64(20*1024*1024), fallback.MaxImageBytes)
	require.Equal(t, playgroundMediaGlobalRequestBytes, fallback.MaxTotalBytes)
}

func TestPlaygroundUploadMediaStreamsImageIntoUserStorage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("PLAYGROUND_MEDIA_CACHE_DIR", t.TempDir())

	imageBytes := testPlaygroundUploadPNG(t)
	var requestBody bytes.Buffer
	writer := multipart.NewWriter(&requestBody)
	part, err := writer.CreateFormFile("file", "source.png")
	require.NoError(t, err)
	_, err = part.Write(imageBytes)
	require.NoError(t, err)
	require.NoError(t, writer.WriteField("role", "edit_source"))
	require.NoError(t, writer.Close())

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("id", 17)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/media/upload?kind=image&model=gpt-image-2.5-flare&workflow=image_edit", &requestBody)
	ctx.Request.Header.Set("Content-Type", writer.FormDataContentType())
	PlaygroundUploadMedia(ctx)

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	var response struct {
		Success bool `json:"success"`
		Data    struct {
			URL string `json:"url"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	require.True(t, strings.HasPrefix(response.Data.URL, "/pg/media/files/u-17/"))
	stored, err := resolvePlaygroundStoredMediaURL(ctx, response.Data.URL, "image")
	require.NoError(t, err)
	require.Equal(t, int64(len(imageBytes)), stored.Size)
}

func TestPlaygroundUploadMediaRejectsMismatchedContent(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("PLAYGROUND_MEDIA_CACHE_DIR", t.TempDir())

	var requestBody bytes.Buffer
	writer := multipart.NewWriter(&requestBody)
	part, err := writer.CreateFormFile("file", "fake.png")
	require.NoError(t, err)
	_, err = part.Write([]byte("this is not an image"))
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("id", 17)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/media/upload?kind=image", &requestBody)
	ctx.Request.Header.Set("Content-Type", writer.FormDataContentType())
	PlaygroundUploadMedia(ctx)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
}

func TestMaterializePlaygroundStoredImageEditAcceptsCurrentUserURLsOnly(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("PLAYGROUND_MEDIA_CACHE_DIR", t.TempDir())

	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Set("id", 23)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/tasks/edits", nil)
	ctx.Request.Header.Set("Content-Type", "application/json")
	item, err := writePlaygroundMedia(ctx, playgroundMediaCacheRequest{
		Kind:     "image",
		Model:    "gpt-image-2.5-flare",
		Workflow: "image_edit",
		Metadata: map[string]interface{}{"public_reference": true},
	}, bytes.NewReader(testPlaygroundUploadPNG(t)), ".png", playgroundMediaGPTImageBytes)
	require.NoError(t, err)

	body, err := json.Marshal(map[string]interface{}{
		"model":      "gpt-image-2.5-flare",
		"prompt":     "edit this image",
		"n":          1,
		"image_urls": []string{item.URL},
	})
	require.NoError(t, err)
	materialized, contentType, changed, status, err := materializePlaygroundStoredImageEdit(ctx, body)
	require.NoError(t, err)
	require.True(t, changed)
	require.Equal(t, http.StatusOK, status)

	mediaType, params, err := mime.ParseMediaType(contentType)
	require.NoError(t, err)
	require.Equal(t, "multipart/form-data", mediaType)
	form, err := multipart.NewReader(bytes.NewReader(materialized), params["boundary"]).ReadForm(1024 * 1024)
	require.NoError(t, err)
	defer form.RemoveAll()
	require.Equal(t, []string{"gpt-image-2.5-flare"}, form.Value["model"])
	require.Equal(t, []string{"edit this image"}, form.Value["prompt"])
	require.Len(t, form.File["image"], 1)

	foreignBody := bytes.ReplaceAll(body, []byte("/u-23/"), []byte("/u-24/"))
	_, _, _, status, err = materializePlaygroundStoredImageEdit(ctx, foreignBody)
	require.ErrorContains(t, err, "current user")
	require.Equal(t, http.StatusBadRequest, status)
}

func testPlaygroundUploadPNG(t *testing.T) []byte {
	t.Helper()
	var buffer bytes.Buffer
	require.NoError(t, png.Encode(&buffer, image.NewRGBA(image.Rect(0, 0, 4, 4))))
	return buffer.Bytes()
}
