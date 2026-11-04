package controller

import (
	"bufio"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"image"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"net/http/httptrace"
	"os"
	"strings"
	"testing"
)

func TestUpscaleValidationBlocksInvalidOrCrossModeParameters(t *testing.T) {
	q := upscaleRequest{Model: service.UpscalePrecisionModel, Image: "x", Scale: 4, Flavor: "photo"}
	require.Error(t, upscaleValidate(q))
	q.Flavor = "sublime"
	require.NoError(t, upscaleValidate(q))
	q.Prompt = "change"
	require.Error(t, upscaleValidate(q))
	q.Prompt = ""
	q.Flavor = "sublime,photo"
	require.Error(t, upscaleValidate(q))
	q = upscaleRequest{Model: service.UpscaleCreativeModel, Image: "x", Scale: 2}
	v := 11
	q.Creativity = &v
	require.Error(t, upscaleValidate(q))
	q.Creativity = nil
	q.Engine = "automatic,magnific_sharpy"
	require.Error(t, upscaleValidate(q))
}

func TestUpscalePublicResponseDoesNotExposePrivateRouteOrSupplier(t *testing.T) {
	task := model.Task{TaskID: "task_public", Platform: constant.TaskPlatformPlaygroundUpscale, Status: model.TaskStatusSuccess, ChannelId: 91, UserId: 2, PrivateData: model.TaskPrivateData{Key: "private_key", UpstreamTaskID: "private_upstream_id", ResultURL: "https://upstream.example/private.png"}}
	task.SetData(upscalePayload{Model: service.UpscalePrecisionModel, Scale: 2, Amount: 0.613, BillingState: "charged"})
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("GET", "/v1/images/upscale/tasks/task_public", nil)
	b, err := json.Marshal(upscalePublicFor(c, &task))
	require.NoError(t, err)
	for _, hidden := range []string{"private_key", "private_upstream_id", "upstream.example", "channel_id"} {
		require.NotContains(t, string(b), hidden)
	}
	require.Contains(t, string(b), "/v1/images/upscale/tasks/task_public/download")
}
func TestUpscaleJSONStrictTypes(t *testing.T) {
	for _, b := range []string{`{"model":"精准放大","image":"x","scale_factor":"2"}`, `{"model":"精准放大","image":"x","scale_factor":2,"filter_nsfw":"true"}`, `{"model":"精准放大","image":"x","scale_factor":2,"webhook_url":"https://example.com"}`} {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest("POST", "/", strings.NewReader(b))
		_, e := upscaleRead(c)
		require.Error(t, e)
	}
}
func TestUpscaleImageValidationAndPrivateURL(t *testing.T) {
	var b bytes.Buffer
	require.NoError(t, png.Encode(&b, image.NewRGBA(image.Rect(0, 0, 100, 200))))
	raw := "data:image/png;base64," + base64.StdEncoding.EncodeToString(b.Bytes())
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/", nil)
	_, s, e := upscaleReadImage(c, raw)
	require.NoError(t, e)
	require.Equal(t, 100, s.Width)
	require.Equal(t, int64(20000), s.Pixels)
	for _, raw := range []string{"https://127.0.0.1/a.png", "https://[::1]/a.png", "data:image/png;base64,INVALID"} {
		_, _, e = upscaleReadImage(c, raw)
		require.Error(t, e)
	}
}
func TestUpscaleEXIFOrientation(t *testing.T) {
	b := []byte{255, 216, 255, 225, 0, 34, 'E', 'x', 'i', 'f', 0, 0, 'I', 'I', 42, 0, 8, 0, 0, 0, 1, 0, 18, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0}
	require.Equal(t, 6, upscaleEXIFOrientation(b))
}

func setupUpscaleStateTest(t *testing.T) (*model.Task, model.Channel) {
	setupSystemTokenControllerTestDB(t)
	t.Setenv("PLAYGROUND_MEDIA_CACHE_DIR", t.TempDir())
	require.NoError(t, model.DB.AutoMigrate(&model.Task{}, &model.Log{}, &model.Channel{}, &model.Ability{}))
	require.NoError(t, model.DB.Create(&model.User{Id: 1, Username: "upscale-test", Status: 1, Quota: 100000, Group: "default"}).Error)
	base := "https://api.smile-ai-studio.com"
	tag := "xingren-upscale-precision"
	ch := model.Channel{Id: 1, Status: 1, Type: 1, BaseURL: &base, Tag: &tag, Key: "test-key", Models: service.UpscalePrecisionModel, Group: "internal"}
	require.NoError(t, model.DB.Create(&ch).Error)
	task := &model.Task{TaskID: "task_test", UserId: 1, ChannelId: 1, Quota: 100, Platform: upscalePlatform, Status: model.TaskStatusSubmitted, Properties: model.Properties{OriginModelName: service.UpscalePrecisionModel}}
	task.SetData(upscalePayload{Model: service.UpscalePrecisionModel, Scale: 2, BillingState: "reserved", Output: upscaleSize{200, 400, 80000}})
	require.NoError(t, model.ReserveUpscaleTask(task, 0))
	return task, ch
}
func readUpscaleState(t *testing.T, id string) (model.Task, upscalePayload) {
	var task model.Task
	require.NoError(t, model.DB.Where("task_id = ?", id).First(&task).Error)
	var p upscalePayload
	require.NoError(t, task.GetData(&p))
	return task, p
}
func TestUpscaleAcceptedFailureRetainsChargeAndReceiptIsIdempotent(t *testing.T) {
	task, _ := setupUpscaleStateTest(t)
	var v upscaleUpstreamResponse
	v.Data.TaskID = "provider-task"
	v.Data.Status = "FAILED"
	require.NoError(t, upscaleWriteReceipt(task.TaskID, v))
	path := upscaleReceiptPath(task.TaskID)
	info, err := os.Stat(path)
	require.NoError(t, err)
	require.Zero(t, info.Mode().Perm()&0077)
	for i := 0; i < 2; i++ {
		require.NoError(t, upscaleAcceptReceipt(task.TaskID, v))
		upscaleApplyResult(task.TaskID, v)
	}
	_, err = os.Stat(path)
	require.True(t, os.IsNotExist(err))
	stored, p := readUpscaleState(t, task.TaskID)
	require.Equal(t, model.TaskStatus(model.TaskStatusFailure), stored.Status)
	require.Equal(t, "charged", p.BillingState)
	require.Error(t, upscaleReject(task.TaskID, "rejected"))
	var u model.User
	require.NoError(t, model.DB.First(&u, 1).Error)
	require.Equal(t, 99900, u.Quota)
	require.Equal(t, 1, u.RequestCount)
	var ch model.Channel
	require.NoError(t, model.DB.First(&ch, 1).Error)
	require.EqualValues(t, 100, ch.UsedQuota)
}
func TestUpscaleSubmitRejectionRefundsOnceWithoutRetry(t *testing.T) {
	task, ch := setupUpscaleStateTest(t)
	old := upscaleDoRequest
	defer func() { upscaleDoRequest = old }()
	calls := 0
	upscaleDoRequest = func(req *http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: 429, Body: io.NopCloser(strings.NewReader("temporarily unavailable"))}, nil
	}
	q := upscaleRequest{Model: service.UpscalePrecisionModel, Scale: 2, Image: "test"}
	upscaleSubmit(task.TaskID, q, ch)
	upscaleSubmit(task.TaskID, q, ch)
	require.Equal(t, 1, calls)
	stored, p := readUpscaleState(t, task.TaskID)
	require.Equal(t, model.TaskStatus(model.TaskStatusFailure), stored.Status)
	require.Equal(t, "refunded", p.BillingState)
	var u model.User
	require.NoError(t, model.DB.First(&u, 1).Error)
	require.Equal(t, 100000, u.Quota)
	var count int64
	model.DB.Model(&model.Log{}).Where("type = ?", model.LogTypeRefund).Count(&count)
	require.EqualValues(t, 1, count)
}
func TestUpscaleAmbiguousSubmitNeverResubmitsOrRefunds(t *testing.T) {
	task, ch := setupUpscaleStateTest(t)
	old := upscaleDoRequest
	defer func() { upscaleDoRequest = old }()
	calls := 0
	upscaleDoRequest = func(req *http.Request) (*http.Response, error) {
		calls++
		trace := httptrace.ContextClientTrace(req.Context())
		trace.WroteHeaders()
		return nil, errors.New("connection lost after write")
	}
	q := upscaleRequest{Model: service.UpscalePrecisionModel, Scale: 2, Image: "test"}
	upscaleSubmit(task.TaskID, q, ch)
	upscaleSubmit(task.TaskID, q, ch)
	stored, p := readUpscaleState(t, task.TaskID)
	require.Equal(t, 1, calls)
	require.Equal(t, model.TaskStatus(model.TaskStatusUnknown), stored.Status)
	require.Equal(t, "uncertain", p.BillingState)
	var u model.User
	require.NoError(t, model.DB.First(&u, 1).Error)
	require.Equal(t, 99900, u.Quota)
}
func TestUpscaleStagingIsAdminOnlyAndOwnershipIsEnforced(t *testing.T) {
	task, ch := setupUpscaleStateTest(t)
	require.NoError(t, model.DB.Create(&model.Ability{ChannelId: 1, Model: service.UpscalePrecisionModel, Group: "internal", Enabled: true, Tag: ch.Tag}).Error)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Set("id", 2)
	require.NoError(t, model.DB.Create(&model.Token{Id: 7, UserId: 2, Status: 1, Group: "internal", Key: "test-internal"}).Error)
	c.Set("token_id", 7)
	_, ok := upscaleRoutingGroup(c, ch, service.UpscalePrecisionModel)
	require.False(t, ok)
	c.Set("token_id", 0)
	c.Params = gin.Params{{Key: "task_id", Value: task.TaskID}}
	_, ok = upscaleOwned(c)
	require.False(t, ok)
	c.Set("id", 1)
	_, ok = upscaleRoutingGroup(c, ch, service.UpscalePrecisionModel)
	require.True(t, ok)
	require.NoError(t, model.DB.Model(&ch).Update("group", "default,standard,pro,code,internal").Error)
	require.NoError(t, model.DB.Create(&model.Ability{ChannelId: 1, Model: service.UpscalePrecisionModel, Group: "default", Enabled: true, Tag: ch.Tag}).Error)
	c.Set("id", 2)
	_, ok = upscaleRoutingGroup(c, ch, service.UpscalePrecisionModel)
	require.True(t, ok)
}
func TestUpscaleDownloadRejectsHTMLAndWrongDimensions(t *testing.T) {
	expected := upscaleSize{200, 400, 80000}
	_, err := upscaleOutputHeader(bufio.NewReaderSize(strings.NewReader("<html>error</html>"), 1024*1024), expected)
	require.Error(t, err)
	var b bytes.Buffer
	require.NoError(t, png.Encode(&b, image.NewRGBA(image.Rect(0, 0, 100, 200))))
	_, err = upscaleOutputHeader(bufio.NewReaderSize(bytes.NewReader(b.Bytes()), 1024*1024), expected)
	require.Error(t, err)
	b.Reset()
	require.NoError(t, png.Encode(&b, image.NewRGBA(image.Rect(0, 0, 200, 400))))
	ext, err := upscaleOutputHeader(bufio.NewReaderSize(bytes.NewReader(b.Bytes()), 1024*1024), expected)
	require.NoError(t, err)
	require.Equal(t, ".png", ext)
}
