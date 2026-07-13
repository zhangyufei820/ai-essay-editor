package helper

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/dto"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type responseChunkWriteErrorWriter struct {
	gin.ResponseWriter
}

func (writer *responseChunkWriteErrorWriter) WriteString(string) (int, error) {
	return 0, io.ErrClosedPipe
}

type responseChunkShortWriteWriter struct {
	gin.ResponseWriter
}

func (writer *responseChunkShortWriteWriter) WriteString(value string) (int, error) {
	return len(value) - 1, nil
}

func TestResponseChunkDataReturnsClientWriteError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	context.Writer = &responseChunkWriteErrorWriter{ResponseWriter: context.Writer}

	err := ResponseChunkData(context, dto.ResponsesStreamResponse{Type: "response.output_text.delta"}, `{"type":"response.output_text.delta","delta":"hello"}`)

	require.ErrorIs(t, err, io.ErrClosedPipe)
}

func TestResponseChunkDataReturnsClientShortWrite(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	context.Writer = &responseChunkShortWriteWriter{ResponseWriter: context.Writer}

	err := ResponseChunkData(context, dto.ResponsesStreamResponse{Type: "response.output_text.delta"}, `{"type":"response.output_text.delta","delta":"hello"}`)

	require.ErrorIs(t, err, io.ErrShortWrite)
}

func TestResponseChunkDataWritesExpectedSSEFrame(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)

	err := ResponseChunkData(context, dto.ResponsesStreamResponse{Type: "response.output_text.delta"}, `{"type":"response.output_text.delta","delta":"hello"}`)

	require.NoError(t, err)
	require.Equal(t, "event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"hello\"}\n\n", recorder.Body.String())
}

func TestStringDataReturnsClientWriteError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	context.Writer = &responseChunkWriteErrorWriter{ResponseWriter: context.Writer}

	err := StringData(context, `{"choices":[{"delta":{"content":"hello"}}]}`)

	require.ErrorIs(t, err, io.ErrClosedPipe)
}

func TestStringDataReturnsClientShortWrite(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	context.Writer = &responseChunkShortWriteWriter{ResponseWriter: context.Writer}

	err := StringData(context, `{"choices":[{"delta":{"content":"hello"}}]}`)

	require.ErrorIs(t, err, io.ErrShortWrite)
}

func TestStringDataWritesExpectedSSEFrame(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)

	err := StringData(context, `{"choices":[{"delta":{"content":"hello"}}]}`)

	require.NoError(t, err)
	require.Equal(t, "data: {\"choices\":[{\"delta\":{\"content\":\"hello\"}}]}\n\n", recorder.Body.String())
}
