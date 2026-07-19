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
	appconstant "github.com/QuantumNous/new-api/constant"
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
		ImageSize:   "4K",
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
	require.Equal(t, "4K", imageConfig["imageSize"])
}

func TestConvertImageRequestPreservesGeminiImageSizeFromNestedConfigs(t *testing.T) {
	tests := []struct {
		name    string
		model   string
		request dto.ImageRequest
		want    string
	}{
		{
			name:  "banana generation extra body",
			model: "gemini-3.1-flash-image-preview",
			request: dto.ImageRequest{
				Prompt:      "test",
				AspectRatio: "16:9",
				ExtraBody:   json.RawMessage(`{"google":{"image_config":{"image_size":"2K"}}}`),
			},
			want: "2K",
		},
		{
			name:  "gemini pro generation config",
			model: "gemini-3-pro-image-preview",
			request: dto.ImageRequest{
				Prompt:           "test",
				AspectRatio:      "1:1",
				GenerationConfig: json.RawMessage(`{"imageConfig":{"imageSize":"4K"}}`),
			},
			want: "4K",
		},
		{
			name:  "ecommerce nano banana top level",
			model: "nano-banana-2",
			request: dto.ImageRequest{
				Prompt:    "test",
				ImageSize: "1K",
			},
			want: "1K",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			converted, err := (&Adaptor{}).ConvertImageRequest(nil, &relaycommon.RelayInfo{
				RelayMode:   constant.RelayModeImagesGenerations,
				ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: tt.model},
			}, tt.request)

			require.NoError(t, err)
			geminiRequest, ok := converted.(*dto.GeminiChatRequest)
			require.True(t, ok)

			var imageConfig map[string]string
			require.NoError(t, json.Unmarshal(geminiRequest.GenerationConfig.ImageConfig, &imageConfig))
			require.Equal(t, tt.want, imageConfig["imageSize"])
		})
	}
}

func TestConvertImageRequestRejectsNonImagineGeminiModel(t *testing.T) {
	_, err := (&Adaptor{}).ConvertImageRequest(nil, &relaycommon.RelayInfo{
		RelayMode:   constant.RelayModeImagesGenerations,
		ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "gemini-2.0-flash"},
	}, dto.ImageRequest{Prompt: "test"})
	require.ErrorContains(t, err, "only imagen and approved Gemini image models are supported")
}

func TestConvertImageRequestBridgesApprovedGeminiModelsToOpenAIChat(t *testing.T) {
	for _, modelName := range []string{"gemini-3.1-flash-image", "gemini-3-pro-image"} {
		t.Run(modelName, func(t *testing.T) {
			converted, err := (&Adaptor{}).ConvertImageRequest(nil, &relaycommon.RelayInfo{
				RelayMode: constant.RelayModeImagesGenerations,
				ChannelMeta: &relaycommon.ChannelMeta{
					ChannelType:       appconstant.ChannelTypeOpenAI,
					UpstreamModelName: modelName,
				},
			}, dto.ImageRequest{
				Prompt:      "test image",
				AspectRatio: "16:9",
				ImageSize:   "2K",
			})

			require.NoError(t, err)
			request, ok := converted.(*openAIChatGeminiImageRequest)
			require.True(t, ok)
			require.Equal(t, modelName, request.Model)
			require.False(t, request.Stream)
			require.Len(t, request.Messages, 1)
			require.Equal(t, "user", request.Messages[0].Role)
			require.Equal(t, "test image", request.Messages[0].Content)
			google := request.ExtraBody["google"].(map[string]interface{})
			imageConfig := google["image_config"].(map[string]interface{})
			require.Equal(t, "16:9", imageConfig["aspect_ratio"])
			require.Equal(t, "2K", imageConfig["image_size"])
		})
	}
}

func TestConvertImageRequestRejectsMultipleImagesForOpenAIChatBridge(t *testing.T) {
	count := uint(2)
	_, err := (&Adaptor{}).ConvertImageRequest(nil, &relaycommon.RelayInfo{
		RelayMode: constant.RelayModeImagesGenerations,
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType:       appconstant.ChannelTypeOpenAI,
			UpstreamModelName: "gemini-3-pro-image",
		},
	}, dto.ImageRequest{Prompt: "test", N: &count})

	require.ErrorContains(t, err, "one image per request")
}

func TestConvertImageRequestBridgesGeminiImageEditReference(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/edits", nil)
	ctx.Request.Header.Set("Content-Type", "application/json")

	converted, err := (&Adaptor{}).ConvertImageRequest(ctx, &relaycommon.RelayInfo{
		RelayMode: constant.RelayModeImagesEdits,
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType:       appconstant.ChannelTypeOpenAI,
			UpstreamModelName: "gemini-3.1-flash-image",
		},
	}, dto.ImageRequest{
		Prompt: "make the circle blue",
		Image:  json.RawMessage(`"data:image/png;base64,ZmFrZS1wbmc="`),
	})

	require.NoError(t, err)
	request := converted.(*openAIChatGeminiImageRequest)
	content := request.Messages[0].Content.([]openAIChatGeminiImageContentPart)
	require.Len(t, content, 2)
	require.Equal(t, "text", content[0].Type)
	require.Equal(t, "image_url", content[1].Type)
	require.Equal(t, "data:image/png;base64,ZmFrZS1wbmc=", content[1].ImageURL.URL)
}

func TestOpenAICompatibleGeminiImageModelsUseChatCompletionsURL(t *testing.T) {
	for _, modelName := range []string{"gemini-3.1-flash-image", "gemini-3-pro-image"} {
		t.Run(modelName, func(t *testing.T) {
			url, err := (&Adaptor{}).GetRequestURL(&relaycommon.RelayInfo{
				RelayMode: constant.RelayModeImagesGenerations,
				ChannelMeta: &relaycommon.ChannelMeta{
					ChannelType:       appconstant.ChannelTypeOpenAI,
					ChannelBaseUrl:    "https://new.ddpapi.top",
					UpstreamModelName: modelName,
				},
			})

			require.NoError(t, err)
			require.Equal(t, "https://new.ddpapi.top/v1/chat/completions", url)
		})
	}
}

func TestApprovedGeminiImageModelKeepsNativeURLForGeminiChannel(t *testing.T) {
	url, err := (&Adaptor{}).GetRequestURL(&relaycommon.RelayInfo{
		RelayMode: constant.RelayModeImagesGenerations,
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType:       appconstant.ChannelTypeGemini,
			ChannelBaseUrl:    "https://generativelanguage.googleapis.com",
			UpstreamModelName: "gemini-3-pro-image",
		},
	})

	require.NoError(t, err)
	require.Equal(t, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent", url)
}

func TestConvertImageRequestAllowsNanoBananaModel(t *testing.T) {
	converted, err := (&Adaptor{}).ConvertImageRequest(nil, &relaycommon.RelayInfo{
		RelayMode:   constant.RelayModeImagesGenerations,
		ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "nano-banana-2"},
	}, dto.ImageRequest{Prompt: "test"})

	require.NoError(t, err)
	_, ok := converted.(*dto.GeminiChatRequest)
	require.True(t, ok)
}

func TestGeminiImagePreviewEditUsesGenerateContentURL(t *testing.T) {
	url, err := (&Adaptor{}).GetRequestURL(&relaycommon.RelayInfo{
		IsStream: false,
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelBaseUrl:    "https://moonapix.com",
			UpstreamModelName: "gemini-3.1-flash-image-preview",
		},
		RelayMode: constant.RelayModeImagesEdits,
	})

	require.NoError(t, err)
	require.Equal(t, "https://moonapix.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent", url)
}

func TestGeminiAdaptorUsesBearerAuthForOpenAICompatibleGeminiEndpoint(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/edits", nil)

	header := http.Header{}
	err := (&Adaptor{}).SetupRequestHeader(ctx, &header, &relaycommon.RelayInfo{
		RelayMode: constant.RelayModeImagesEdits,
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType:       appconstant.ChannelTypeOpenAI,
			UpstreamModelName: "gemini-3.1-flash-image-preview",
			ApiKey:            "test-key",
		},
	})

	require.NoError(t, err)
	require.Equal(t, "application/json", header.Get("Content-Type"))
	require.Equal(t, "Bearer test-key", header.Get("Authorization"))
	require.Empty(t, header.Get("x-goog-api-key"))
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

func TestGeminiImageHandlerConvertsMarkdownImageURLCandidates(t *testing.T) {
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
							{"text": "![image](https://file2.aitohumanize.com/file/example-image.png)"}
						]
					}
				}
			],
			"usageMetadata": {
				"promptTokenCount": 100,
				"candidatesTokenCount": 20,
				"totalTokenCount": 120
			}
		}`)),
	}

	usage, apiErr := GeminiImageHandler(ctx, &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "banana-2"},
	}, resp)
	require.Nil(t, apiErr)
	require.NotNil(t, usage)

	require.Equal(t, http.StatusOK, recorder.Code)
	var imageResponse dto.ImageResponse
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &imageResponse))
	require.Len(t, imageResponse.Data, 1)
	require.Equal(t, "https://file2.aitohumanize.com/file/example-image.png", imageResponse.Data[0].Url)
	require.Empty(t, imageResponse.Data[0].B64Json)
}

func TestOpenAIChatGeminiImageHandlerConvertsMarkdownDataURL(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", nil)

	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body: io.NopCloser(strings.NewReader(`{
			"choices":[{"message":{"content":"done\n![image](data:image/png;base64,ZmFrZS1wbmc=)"}}],
			"usage":{"prompt_tokens":12,"completion_tokens":34,"total_tokens":46}
		}`)),
	}

	usage, apiErr := (&Adaptor{}).DoResponse(ctx, resp, &relaycommon.RelayInfo{
		RelayMode: constant.RelayModeImagesGenerations,
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType:       appconstant.ChannelTypeOpenAI,
			UpstreamModelName: "gemini-3.1-flash-image",
		},
	})

	require.Nil(t, apiErr)
	require.Equal(t, 46, usage.(*dto.Usage).TotalTokens)
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
