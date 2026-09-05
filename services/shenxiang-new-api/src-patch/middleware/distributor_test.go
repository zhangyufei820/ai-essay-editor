package middleware

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestGetModelRequestReadsGrokVideoDurationFromMediaMultipart(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for field, value := range map[string]string{
		"model":   "grok-video-1.5",
		"group":   "default",
		"prompt":  "text to video",
		"seconds": "6",
		"size":    "1280x720",
	} {
		if err := writer.WriteField(field, value); err != nil {
			t.Fatalf("write %s: %v", field, err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart: %v", err)
	}

	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = httptest.NewRequest(http.MethodPost, "/pg/videos", bytes.NewReader(body.Bytes()))
	context.Request.Header.Set("Content-Type", writer.FormDataContentType())

	request, shouldSelect, err := getModelRequest(context)

	if err != nil {
		t.Fatalf("getModelRequest() error = %v", err)
	}
	if !shouldSelect {
		t.Fatal("getModelRequest() shouldSelect = false, want true")
	}
	if request.Model != "grok-video-1.5" || request.Group != "default" || request.Seconds != "6" {
		t.Fatalf("request = %#v, want Grok model/default group/6 seconds", request)
	}
}

func TestSelectGrokVideo15DurationChannelRoutesMediaWorkshopRequests(t *testing.T) {
	gin.SetMode(gin.TestMode)
	require.NoError(t, model.DB.AutoMigrate(&model.Channel{}, &model.Ability{}))
	originalMemoryCacheEnabled := common.MemoryCacheEnabled
	common.MemoryCacheEnabled = false
	t.Cleanup(func() {
		common.MemoryCacheEnabled = originalMemoryCacheEnabled
		model.DB.Where("model = ?", grokVideo15PublicModel).Delete(&model.Ability{})
		model.DB.Where("tag IN ?", []string{grokVideo15SixSecondChannelTag, grokVideo15TenSecondChannelTag}).Delete(&model.Channel{})
	})

	createChannel := func(tag string) int {
		channel := model.Channel{
			Type:   constant.ChannelTypeOpenAI,
			Key:    "test-video-key",
			Status: common.ChannelStatusEnabled,
			Name:   "duration-routed-video-test",
			Models: grokVideo15PublicModel,
			Group:  "default",
			Tag:    &tag,
		}
		require.NoError(t, model.DB.Create(&channel).Error)
		require.NoError(t, model.DB.Create(&model.Ability{
			Group:     "default",
			Model:     grokVideo15PublicModel,
			ChannelId: channel.Id,
			Enabled:   true,
			Tag:       &tag,
		}).Error)
		return channel.Id
	}

	sixSecondChannelID := createChannel(grokVideo15SixSecondChannelTag)
	tenSecondChannelID := createChannel(grokVideo15TenSecondChannelTag)
	testCases := []struct {
		name          string
		seconds       string
		withReference bool
		wantChannelID int
	}{
		{name: "six second text to video", seconds: "6", wantChannelID: sixSecondChannelID},
		{name: "six second image to video", seconds: "6", withReference: true, wantChannelID: sixSecondChannelID},
		{name: "ten second text to video", seconds: "10", wantChannelID: tenSecondChannelID},
		{name: "ten second image to video", seconds: "10", withReference: true, wantChannelID: tenSecondChannelID},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			var body bytes.Buffer
			writer := multipart.NewWriter(&body)
			require.NoError(t, writer.WriteField("model", grokVideo15PublicModel))
			require.NoError(t, writer.WriteField("group", "default"))
			require.NoError(t, writer.WriteField("prompt", "media workshop request"))
			require.NoError(t, writer.WriteField("seconds", testCase.seconds))
			require.NoError(t, writer.WriteField("size", "1280x720"))
			if testCase.withReference {
				fileWriter, err := writer.CreateFormFile("input_reference", "reference.png")
				require.NoError(t, err)
				_, err = fileWriter.Write([]byte("test-image"))
				require.NoError(t, err)
			}
			require.NoError(t, writer.Close())

			context, _ := gin.CreateTestContext(httptest.NewRecorder())
			context.Request = httptest.NewRequest(http.MethodPost, "/pg/videos", bytes.NewReader(body.Bytes()))
			context.Request.Header.Set("Content-Type", writer.FormDataContentType())
			request, _, err := getModelRequest(context)
			require.NoError(t, err)

			channel, group, handled, err := selectGrokVideo15DurationChannel(context, request, "default")

			require.NoError(t, err)
			require.True(t, handled)
			require.Equal(t, "default", group)
			require.NotNil(t, channel)
			require.Equal(t, testCase.wantChannelID, channel.Id)
		})
	}
}

func TestGetModelRequestReadsNumericGrokVideoDurationFromJSON(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = httptest.NewRequest(http.MethodPost, "/v1/video/generations", bytes.NewBufferString(`{"model":"grok-video-1.5","seconds":10}`))
	context.Request.Header.Set("Content-Type", "application/json")

	request, _, err := getModelRequest(context)

	require.NoError(t, err)
	require.Equal(t, "10", request.Seconds)
}

func TestMain(m *testing.M) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		panic("failed to open test db: " + err.Error())
	}
	sqlDB, err := db.DB()
	if err != nil {
		panic("failed to get sql DB: " + err.Error())
	}
	sqlDB.SetMaxOpenConns(1)

	model.DB = db
	model.LOG_DB = db
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	if err := db.AutoMigrate(&model.Task{}, &model.User{}); err != nil {
		panic("failed to migrate test db: " + err.Error())
	}

	os.Exit(m.Run())
}

func TestApplyPlaygroundTextPricingPreferenceOverridesStaleClientGroup(t *testing.T) {
	gin.SetMode(gin.TestMode)
	require.NoError(t, model.DB.AutoMigrate(&model.Token{}))
	redisEnabled := common.RedisEnabled
	common.RedisEnabled = false
	t.Cleanup(func() { common.RedisEnabled = redisEnabled })
	user := model.User{
		Username: "middleware-pricing-sync",
		Password: "password-for-test",
		Status:   common.UserStatusEnabled,
		Group:    model.TextPricingGroupDefault,
	}
	setting := user.GetSetting()
	setting.TextPricingGroup = model.TextPricingGroupDiscount
	user.SetSetting(setting)
	if err := model.DB.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	t.Cleanup(func() { model.DB.Delete(&model.User{}, user.Id) })

	assertGroup := func(requestedGroup, wantGroup string) {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/chat/completions", nil)
		ctx.Set("id", user.Id)
		common.SetContextKey(ctx, constant.ContextKeyUsingGroup, requestedGroup)
		modelRequest := &ModelRequest{Model: "gpt-5.5", Group: requestedGroup}

		got, err := applyPlaygroundTextPricingPreference(ctx, modelRequest)
		if err != nil {
			t.Fatalf("apply preference: %v", err)
		}
		if got != wantGroup || modelRequest.Group != wantGroup {
			t.Fatalf("group = %q request group = %q, want %q", got, modelRequest.Group, wantGroup)
		}
		if usingGroup := common.GetContextKeyString(ctx, constant.ContextKeyUsingGroup); usingGroup != wantGroup {
			t.Fatalf("using group = %q, want %q", usingGroup, wantGroup)
		}
		if tokenGroup := common.GetContextKeyString(ctx, constant.ContextKeyTokenGroup); tokenGroup != wantGroup {
			t.Fatalf("token group = %q, want %q", tokenGroup, wantGroup)
		}
		if header := recorder.Header().Get("X-Aiphui-Pricing-Group"); header != wantGroup {
			t.Fatalf("pricing header = %q, want %q", header, wantGroup)
		}
	}

	assertGroup(model.TextPricingGroupDefault, model.TextPricingGroupDiscount)
	setting.TextPricingGroup = model.TextPricingGroupDefault
	if err := model.UpdateUserSetting(user.Id, setting); err != nil {
		t.Fatalf("update preference: %v", err)
	}
	assertGroup(model.TextPricingGroupDiscount, model.TextPricingGroupDefault)
}

func TestApplyPlaygroundTextPricingPreferenceUsesManagedGroupChain(t *testing.T) {
	gin.SetMode(gin.TestMode)
	require.NoError(t, model.DB.AutoMigrate(&model.Token{}))
	redisEnabled := common.RedisEnabled
	common.RedisEnabled = false
	t.Cleanup(func() { common.RedisEnabled = redisEnabled })

	createUser := func(username, preferredGroup, tokenGroup string) model.User {
		user := model.User{
			Username: username,
			Password: "password-for-test",
			Status:   common.UserStatusEnabled,
			Group:    model.TextPricingGroupDefault,
			AffCode:  username,
		}
		setting := user.GetSetting()
		setting.TextPricingGroup = preferredGroup
		user.SetSetting(setting)
		require.NoError(t, model.DB.Create(&user).Error)
		require.NoError(t, model.DB.Create(&model.Token{
			UserId:         user.Id,
			Key:            "pricing-chain-" + username,
			Status:         common.TokenStatusEnabled,
			Name:           "星人 Codex 文本令牌",
			ExpiredTime:    -1,
			UnlimitedQuota: true,
			Group:          tokenGroup,
		}).Error)
		t.Cleanup(func() {
			model.DB.Where("user_id = ?", user.Id).Delete(&model.Token{})
			model.DB.Delete(&model.User{}, user.Id)
		})
		return user
	}

	tests := []struct {
		name       string
		user       model.User
		wantGroups []string
	}{
		{
			name: "preserves matching fallback chain",
			user: createUser(
				"middleware-pricing-chain",
				model.TextPricingGroupDiscount,
				"discount,plus,default",
			),
			wantGroups: []string{"discount", "plus", "default"},
		},
		{
			name: "rejects stale chain primary",
			user: createUser(
				"middleware-pricing-stale-chain",
				model.TextPricingGroupDiscount,
				"plus,default",
			),
			wantGroups: []string{"discount"},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/chat/completions", nil)
			ctx.Set("id", test.user.Id)
			modelRequest := &ModelRequest{Model: "gpt-5.5", Group: model.TextPricingGroupDefault}

			group, err := applyPlaygroundTextPricingPreference(ctx, modelRequest)

			require.NoError(t, err)
			require.Equal(t, model.TextPricingGroupDiscount, group)
			require.Equal(t, model.TextPricingGroupDiscount, modelRequest.Group)
			require.Equal(t, test.wantGroups, service.GetTokenGroupChain(ctx))
			require.Equal(t, model.TextPricingGroupDiscount, recorder.Header().Get("X-Aiphui-Pricing-Group"))
		})
	}
}

func TestAstraModelIsHandledByTheSelectedPricingGroup(t *testing.T) {
	require.True(t, service.IsTextPricingPreferenceModel(service.Gpt6AstraModelName))
}

func TestApplyKimiK3PricingRouteOverridesDiscountAndPlusGroups(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, tokenGroup := range []string{service.DiscountPricingGroupName, service.PlusPricingGroupName} {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		common.SetContextKey(ctx, constant.ContextKeyUsingGroup, tokenGroup)
		modelRequest := &ModelRequest{Model: service.KimiK3ModelName, Group: tokenGroup}

		got := applyKimiK3PricingRoute(ctx, modelRequest)

		require.Equal(t, service.KimiK3PricingGroupName, got)
		require.Equal(t, service.KimiK3PricingGroupName, modelRequest.Group)
		require.Equal(t, service.KimiK3PricingGroupName, common.GetContextKeyString(ctx, constant.ContextKeyUsingGroup))
		require.Equal(t, []string{service.KimiK3PricingGroupName}, service.GetTokenGroupChain(ctx))
		require.Equal(t, service.KimiK3PricingGroupName, recorder.Header().Get("X-Aiphui-Pricing-Group"))
	}
}

func truncateMiddlewareTestDB(t *testing.T) {
	t.Helper()
	t.Cleanup(func() {
		model.DB.Exec("DELETE FROM tasks")
	})
}

func TestNormalizeImageEndpointModelRequestMapsPlaygroundRawGPTImage2(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", bytes.NewBufferString(`{"model":"gpt-image-2"}`))
	modelRequest := &ModelRequest{Model: "gpt-image-2"}

	normalizeImageEndpointModelRequest(ctx, modelRequest)

	if modelRequest.Model != "gpt-image-2-4K" {
		t.Fatalf("model = %q, want gpt-image-2-4K", modelRequest.Model)
	}
}

func TestNormalizeImageEndpointModelRequestMapsV1GenerationRawGPTImage2(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", bytes.NewBufferString(`{"model":"gpt-image-2"}`))
	modelRequest := &ModelRequest{Model: "gpt-image-2"}

	normalizeImageEndpointModelRequest(ctx, modelRequest)

	if modelRequest.Model != "gpt-image-2-4K" {
		t.Fatalf("model = %q, want gpt-image-2-4K", modelRequest.Model)
	}
}

func TestNormalizeImageEndpointModelRequestMapsV1EditRawGPTImage2(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/images/edits", bytes.NewBufferString(`{"model":"gpt-image-2"}`))
	modelRequest := &ModelRequest{Model: "gpt-image-2"}

	normalizeImageEndpointModelRequest(ctx, modelRequest)

	if modelRequest.Model != "gpt-image-2-4K" {
		t.Fatalf("model = %q, want gpt-image-2-4K", modelRequest.Model)
	}
}

func TestNormalizeImageEndpointModelRequestMapsDiscountImage2PublicAlias(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", bytes.NewBufferString(`{"model":"特价 image-2"}`))
	modelRequest := &ModelRequest{Model: "特价 image-2"}

	normalizeImageEndpointModelRequest(ctx, modelRequest)

	if modelRequest.Model != "geek2api-image-2" {
		t.Fatalf("model = %q, want geek2api-image-2", modelRequest.Model)
	}
	if publicAlias := PublicImageModelAliasForRequest(ctx); publicAlias != "特价 image-2" {
		t.Fatalf("public alias = %q, want 特价 image-2", publicAlias)
	}
}

func TestGetTaskOriginModelNameUsesPublicDiscountImage2Alias(t *testing.T) {
	truncateMiddlewareTestDB(t)
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodGet, "/v1/images/tasks/task_public_alias", nil)
	ctx.Params = gin.Params{{Key: "task_id", Value: "task_public_alias"}}
	ctx.Set("id", 1)
	common.SetContextKey(ctx, constant.ContextKeyTokenModelLimitEnabled, true)

	task := &model.Task{
		TaskID: "task_public_alias",
		UserId: 1,
		Properties: model.Properties{
			OriginModelName: "geek2api-image-2",
		},
	}
	if err := model.DB.Create(task).Error; err != nil {
		t.Fatalf("create task: %v", err)
	}

	if got := getTaskOriginModelName(ctx); got != "特价 image-2" {
		t.Fatalf("getTaskOriginModelName() = %q, want 特价 image-2", got)
	}
}

func TestDistributeAllowsVideoFetchWithoutSelectingChannel(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET(
		"/v1/videos/:task_id",
		func(c *gin.Context) {
			c.Set("id", 1)
			c.Next()
		},
		Distribute(),
		func(c *gin.Context) {
			c.Status(http.StatusNoContent)
		},
	)

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/v1/videos/task_public_video", nil))

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("status = %d body=%s, want %d", recorder.Code, recorder.Body.String(), http.StatusNoContent)
	}
}

func TestGetModelRequestRejectsChatImageModelBeforeChannelSelection(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", bytes.NewBufferString(`{"model":"gpt-image-2","messages":[]}`))
	ctx.Request.Header.Set("Content-Type", "application/json")

	_, _, err := getModelRequest(ctx)

	if err == nil {
		t.Fatal("getModelRequest() err = nil, want image model text endpoint rejection")
	}
	if !strings.Contains(err.Error(), "/v1/images/generations") || !strings.Contains(err.Error(), "/v1/images/edits") {
		t.Fatalf("error = %q, want image endpoint hints", err.Error())
	}
}

func TestGetModelRequestRejectsDiscountImage2TextEndpointWithoutSupplierLeak(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", bytes.NewBufferString(`{"model":"特价 image-2","messages":[]}`))
	ctx.Request.Header.Set("Content-Type", "application/json")

	_, _, err := getModelRequest(ctx)

	if err == nil {
		t.Fatal("getModelRequest() err = nil, want image model text endpoint rejection")
	}
	if !strings.Contains(err.Error(), "特价 image-2") {
		t.Fatalf("error = %q, want public model name", err.Error())
	}
	if !strings.Contains(err.Error(), "/v1/images/generations") || strings.Contains(err.Error(), "/v1/images/edits") {
		t.Fatalf("error = %q, want generation-only endpoint hint", err.Error())
	}
}

func TestGetModelRequestRejectsDiscountImage2EditEndpoint(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/images/edits", bytes.NewBufferString(`{"model":"特价 image-2"}`))
	ctx.Request.Header.Set("Content-Type", "application/json")

	_, _, err := getModelRequest(ctx)

	require.Error(t, err)
	require.Contains(t, err.Error(), "仅支持 POST /v1/images/generations 文生图")
	require.NotContains(t, err.Error(), "internal-image2")
}

func TestGetModelRequestRejectsSupplierImageModelWithoutEchoingName(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", bytes.NewBufferString(`{"model":"geek2api-image-2","messages":[]}`))
	ctx.Request.Header.Set("Content-Type", "application/json")

	_, _, err := getModelRequest(ctx)

	if err == nil {
		t.Fatal("getModelRequest() err = nil, want image model text endpoint rejection")
	}
	if strings.Contains(err.Error(), "geek2api") {
		t.Fatalf("error = %q, want no supplier model name", err.Error())
	}
	if !strings.Contains(err.Error(), "/v1/images/generations") || !strings.Contains(err.Error(), "/v1/images/edits") {
		t.Fatalf("error = %q, want image endpoint hints", err.Error())
	}
}

func TestDistributeRejectsSupplierExposedModelWithoutEchoingName(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", bytes.NewBufferString(`{"model":"custom-geek2api-image"}`))
	ctx.Request.Header.Set("Content-Type", "application/json")

	Distribute()(ctx)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusForbidden)
	}
	var payload map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("response json error: %v", err)
	}
	body := recorder.Body.String()
	if strings.Contains(body, "geek2api") {
		t.Fatalf("response leaks supplier model name: %s", body)
	}
	if payload["error"] == nil {
		t.Fatalf("response missing error: %s", body)
	}
}

func TestDistributeRejectsInternalDiscountImage2WithoutEchoingName(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", bytes.NewBufferString(`{"model":"geek2api-image-2"}`))
	ctx.Request.Header.Set("Content-Type", "application/json")

	Distribute()(ctx)

	require.Equal(t, http.StatusForbidden, recorder.Code)
	require.Contains(t, recorder.Body.String(), string(types.ErrorCodeAccessDenied))
	require.NotContains(t, recorder.Body.String(), "geek2api")
}
