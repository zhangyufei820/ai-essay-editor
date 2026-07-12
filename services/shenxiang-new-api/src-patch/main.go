package main

import (
	"bytes"
	"context"
	"embed"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/oauth"
	perfmetrics "github.com/QuantumNous/new-api/pkg/perf_metrics"
	"github.com/QuantumNous/new-api/relay"
	"github.com/QuantumNous/new-api/router"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/service/authz"
	_ "github.com/QuantumNous/new-api/setting/performance_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/bytedance/gopkg/util/gopool"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"

	_ "net/http/pprof"
)

//go:embed web/default/dist
var buildFS embed.FS

//go:embed web/default/dist/index.html
var indexPage []byte

//go:embed web/classic/dist
var classicBuildFS embed.FS

//go:embed web/classic/dist/index.html
var classicIndexPage []byte

//go:embed web/xingren-api-onboarding-assistant.js
var xingrenAPIOnboardingAssistantJS []byte

//go:embed web/xingren-api-assistant-avatar.jpg
var xingrenAPIAssistantAvatarJPG []byte

func localPprofListenAddr(configured string) string {
	configured = strings.TrimSpace(configured)
	if configured == "" {
		return "127.0.0.1:8005"
	}
	_, port, err := net.SplitHostPort(configured)
	if err == nil && port != "" {
		return net.JoinHostPort("127.0.0.1", port)
	}
	if strings.HasPrefix(configured, ":") && len(configured) > 1 {
		return "127.0.0.1" + configured
	}
	if _, err := strconv.Atoi(configured); err == nil {
		return "127.0.0.1:" + configured
	}
	common.SysError("invalid PPROF_LISTEN_ADDR " + configured + "; forcing 127.0.0.1:8005")
	return "127.0.0.1:8005"
}

type trackedHTTPHandler struct {
	mutex         sync.Mutex
	handler       http.Handler
	active        int
	admissionOpen bool
	done          chan struct{}
	doneOnce      sync.Once
}

func newTrackedHTTPHandler(handler http.Handler) *trackedHTTPHandler {
	return &trackedHTTPHandler{
		handler:       handler,
		admissionOpen: true,
		done:          make(chan struct{}),
	}
}

func (handler *trackedHTTPHandler) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	handler.mutex.Lock()
	if !handler.admissionOpen {
		handler.mutex.Unlock()
		http.Error(writer, "server is shutting down", http.StatusServiceUnavailable)
		return
	}
	handler.active++
	handler.mutex.Unlock()
	defer func() {
		handler.mutex.Lock()
		handler.active--
		if !handler.admissionOpen && handler.active == 0 {
			handler.doneOnce.Do(func() { close(handler.done) })
		}
		handler.mutex.Unlock()
	}()
	handler.handler.ServeHTTP(writer, request)
}

func (handler *trackedHTTPHandler) stopAdmission() {
	handler.mutex.Lock()
	handler.admissionOpen = false
	if handler.active == 0 {
		handler.doneOnce.Do(func() { close(handler.done) })
	}
	handler.mutex.Unlock()
}

func (handler *trackedHTTPHandler) wait(ctx context.Context) bool {
	select {
	case <-handler.done:
		return true
	case <-ctx.Done():
		return false
	}
}

type httpShutdownServer interface {
	Shutdown(context.Context) error
	Close() error
}

type httpShutdownResult struct {
	shutdownErr     error
	closeErr        error
	handlersDrained bool
}

func shutdownHTTPServer(ctx context.Context, server httpShutdownServer, handler *trackedHTTPHandler) httpShutdownResult {
	if ctx == nil {
		ctx = context.Background()
	}
	handler.stopAdmission()
	result := httpShutdownResult{}
	result.shutdownErr = server.Shutdown(ctx)
	if result.shutdownErr != nil {
		result.closeErr = server.Close()
		if errors.Is(result.closeErr, http.ErrServerClosed) {
			result.closeErr = nil
		}
	}
	result.handlersDrained = handler.wait(ctx)
	return result
}

func main() {
	startTime := time.Now()

	err := InitResources()
	if err != nil {
		common.FatalLog("failed to initialize resources: " + err.Error())
		return
	}

	common.SysLog("New API " + common.Version + " started")
	if os.Getenv("GIN_MODE") != "debug" {
		gin.SetMode(gin.ReleaseMode)
	}
	if common.DebugEnabled {
		common.SysLog("running in debug mode")
	}

	if common.RedisEnabled {
		// for compatibility with old versions
		common.MemoryCacheEnabled = true
	}
	if common.MemoryCacheEnabled {
		common.SysLog("memory cache enabled")
		common.SysLog(fmt.Sprintf("sync frequency: %d seconds", common.SyncFrequency))

		// Add panic recovery and retry for InitChannelCache
		func() {
			defer func() {
				if r := recover(); r != nil {
					common.SysLog(fmt.Sprintf("InitChannelCache panic: %v, retrying once", r))
					// Retry once
					_, _, fixErr := model.FixAbility()
					if fixErr != nil {
						common.FatalLog(fmt.Sprintf("InitChannelCache failed: %s", fixErr.Error()))
					}
				}
			}()
			model.InitChannelCache()
		}()

		go model.SyncChannelCache(common.SyncFrequency)
	}

	// 热更新配置
	go model.SyncOptions(common.SyncFrequency)
	go authz.StartPolicySync(common.SyncFrequency)

	// 数据看板
	go model.UpdateQuotaData()

	if os.Getenv("CHANNEL_UPDATE_FREQUENCY") != "" {
		frequency, err := strconv.Atoi(os.Getenv("CHANNEL_UPDATE_FREQUENCY"))
		if err != nil {
			common.FatalLog("failed to parse CHANNEL_UPDATE_FREQUENCY: " + err.Error())
		}
		go controller.AutomaticallyUpdateChannels(frequency)
	}

	// Codex credential auto-refresh check every 10 minutes, refresh when expires within 1 day
	service.StartCodexCredentialAutoRefreshTask()

	// System smoke/probe tokens are admin-owned only; never mint them for normal users.
	service.StartSystemTokenReconcileTask()

	// Subscription quota reset task (daily/weekly/monthly/custom)
	service.StartSubscriptionQuotaResetTask()
	service.StartSystemInstanceReporter()
	runtimeWorkerContext, stopRuntimeWorkers := context.WithCancel(context.Background())
	service.ConfigureAsyncVideoWatcherContext(runtimeWorkerContext)
	billingLedgerWorkerDone := make(chan struct{})
	gopool.Go(func() {
		defer close(billingLedgerWorkerDone)
		service.BillingLedgerWorkerLoop(runtimeWorkerContext)
	})
	var stopRuntimeWorkersOnce sync.Once
	stopRuntimeWorkersAndWait := func() {
		stopRuntimeWorkersOnce.Do(func() {
			stopRuntimeWorkers()
			workerShutdownContext, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			select {
			case <-billingLedgerWorkerDone:
			case <-workerShutdownContext.Done():
				common.SysError("billing ledger worker did not stop within shutdown deadline")
			}
			if err := service.StopAsyncVideoWatchers(workerShutdownContext); err != nil {
				common.SysError("async video watchers did not stop within shutdown deadline")
			}
		})
	}
	defer stopRuntimeWorkersAndWait()

	// Wire task polling adaptor factory (breaks service -> relay import cycle)
	service.GetTaskAdaptorFunc = func(platform constant.TaskPlatform) service.TaskPollingAdaptor {
		a := relay.GetTaskAdaptor(platform)
		if a == nil {
			return nil
		}
		contextualAdaptor, ok := a.(service.TaskPollingAdaptor)
		if !ok {
			common.SysError(fmt.Sprintf("task adaptor %s does not support context-aware polling", platform))
			return nil
		}
		return contextualAdaptor
	}

	controller.RegisterScheduledSystemTasks()
	service.StartSystemTaskRunner()

	if common.IsMasterNode {
		controller.FailInterruptedPlaygroundImageTasksOnStartup()
		controller.StartPlaygroundMediaCacheCleanupTask()
	}
	if os.Getenv("BATCH_UPDATE_ENABLED") == "true" {
		common.BatchUpdateEnabled = true
		common.SysLog("batch update enabled with interval " + strconv.Itoa(common.BatchUpdateInterval) + "s")
		model.InitBatchUpdater()
	}

	if os.Getenv("ENABLE_PPROF") == "true" {
		pprofListenAddr := localPprofListenAddr(common.GetEnvOrDefaultString("PPROF_LISTEN_ADDR", "127.0.0.1:8005"))
		gopool.Go(func() {
			log.Println(http.ListenAndServe(pprofListenAddr, nil))
		})
		go common.Monitor()
		common.SysLog("pprof enabled on " + pprofListenAddr)
	}

	err = common.StartPyroScope()
	if err != nil {
		common.SysError(fmt.Sprintf("start pyroscope error : %v", err))
	}

	// Initialize HTTP server
	server := gin.New()
	configureTrustedProxies(server)
	server.Use(gin.CustomRecovery(func(c *gin.Context, err any) {
		common.SysLog(fmt.Sprintf("panic detected: %v", err))
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"message": "internal server error",
				"type":    "internal_error",
			},
		})
	}))
	// This will cause SSE not to work!!!
	//server.Use(gzip.Gzip(gzip.DefaultCompression))
	server.Use(middleware.RequestId())
	server.Use(middleware.PoweredBy())
	server.Use(middleware.I18n())
	middleware.SetUpLogger(server)
	// Initialize session store
	store := cookie.NewStore([]byte(common.SessionSecret))
	secureCookie := common.GetEnvOrDefaultBool("SESSION_COOKIE_SECURE", true)
	store.Options(sessions.Options{
		Path:     "/",
		MaxAge:   2592000, // 30 days
		HttpOnly: true,
		Secure:   secureCookie,
		SameSite: http.SameSiteStrictMode,
	})
	server.Use(sessions.Sessions("session", store))

	InjectUmamiAnalytics()
	InjectGoogleAnalytics()
	InjectXingrenAPIOnboardingAssistant()
	RegisterXingrenAPIStaticAssets(server)
	RegisterXingrenOnboardingAssistant(server)

	// 设置路由
	router.SetRouter(server, router.ThemeAssets{
		DefaultBuildFS:   buildFS,
		DefaultIndexPage: indexPage,
		ClassicBuildFS:   classicBuildFS,
		ClassicIndexPage: classicIndexPage,
	})
	registerMonthlyCardTokenRoute(server)
	var port = os.Getenv("PORT")
	if port == "" {
		port = strconv.Itoa(*common.Port)
	}

	trackedHandler := newTrackedHTTPHandler(server)
	srv := newHTTPServer(port, trackedHandler)
	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			common.FatalLog("failed to start HTTP server: " + err.Error())
		}
	}()
	time.Sleep(100 * time.Millisecond)
	common.LogStartupSuccess(startTime, port)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	sig := <-quit
	common.SysLog(fmt.Sprintf("received signal: %v, shutting down...", sig))
	shutdownTimeout := time.Duration(common.GetEnvOrDefault("SHUTDOWN_TIMEOUT_SECONDS", 120)) * time.Second
	ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	shutdownResult := shutdownHTTPServer(ctx, srv, trackedHandler)
	if shutdownResult.shutdownErr != nil {
		common.SysError(fmt.Sprintf("server forced to shutdown: %v", shutdownResult.shutdownErr))
	}
	if shutdownResult.closeErr != nil {
		common.SysError(fmt.Sprintf("server close failed: %v", shutdownResult.closeErr))
	}
	if !shutdownResult.handlersDrained {
		common.SysError("HTTP handlers did not stop within shutdown deadline")
	}
	stopRuntimeWorkersAndWait()
	if common.DataExportEnabled {
		model.SaveQuotaDataCache()
	}
	common.SysLog("server exited")
}

func newHTTPServer(port string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              ":" + port,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}
}

func configureTrustedProxies(server *gin.Engine) {
	server.ForwardedByClientIP = true
	server.RemoteIPHeaders = []string{"CF-Connecting-IP", "X-Forwarded-For", "X-Real-IP"}
	configured := common.GetEnvOrDefaultString("TRUSTED_PROXIES", "127.0.0.1,::1,172.16.0.0/12,10.0.0.0/8,192.168.0.0/16")
	proxies := make([]string, 0)
	for _, item := range strings.Split(configured, ",") {
		item = strings.TrimSpace(item)
		if item != "" {
			proxies = append(proxies, item)
		}
	}
	if len(proxies) == 0 {
		proxies = []string{"127.0.0.1", "::1"}
	}
	if err := server.SetTrustedProxies(proxies); err != nil {
		common.SysError("failed to configure trusted proxies: " + err.Error())
		_ = server.SetTrustedProxies([]string{"127.0.0.1", "::1"})
	}
}

func RegisterXingrenAPIStaticAssets(server *gin.Engine) {
	server.GET("/assets/xingren-api-assistant-avatar.jpg", func(c *gin.Context) {
		c.Header("Cache-Control", "public, max-age=31536000, immutable")
		c.Data(http.StatusOK, "image/jpeg", xingrenAPIAssistantAvatarJPG)
	})
	server.GET("/assets/xingren-api-onboarding-assistant.js", func(c *gin.Context) {
		c.Header("Cache-Control", "public, max-age=31536000, immutable")
		c.Data(http.StatusOK, "application/javascript; charset=utf-8", xingrenAPIOnboardingAssistantJS)
	})
}

// analyticsIDPattern restricts analytics identifiers to characters that cannot
// break out of an HTML attribute or JS string literal. Umami website IDs are
// UUIDs and Google measurement IDs look like "G-XXXX"/"UA-XXXX-Y"; both fit.
var analyticsIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

// validAnalyticsID reports whether an admin-supplied analytics ID is safe to
// inline into the index page. Although these come from deployment env vars (not
// end users), validating them prevents a stray quote or "</script>" in a
// misconfigured value from breaking the page or injecting markup.
func validAnalyticsID(id string) bool {
	return len(id) <= 64 && analyticsIDPattern.MatchString(id)
}

// validAnalyticsScriptURL reports whether the Umami script URL is a well-formed
// absolute http(s) URL safe to place in a src attribute.
func validAnalyticsScriptURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return false
	}
	return u.Host != ""
}

func InjectUmamiAnalytics() {
	analyticsInjectBuilder := &strings.Builder{}
	if umamiSiteID := os.Getenv("UMAMI_WEBSITE_ID"); umamiSiteID != "" {
		if !validAnalyticsID(umamiSiteID) {
			common.SysError("UMAMI_WEBSITE_ID 含非法字符，跳过注入")
		} else {
			umamiScriptURL := os.Getenv("UMAMI_SCRIPT_URL")
			if umamiScriptURL == "" {
				umamiScriptURL = "https://analytics.umami.is/script.js"
			}
			if !validAnalyticsScriptURL(umamiScriptURL) {
				common.SysError("UMAMI_SCRIPT_URL 不是合法的 http(s) 地址，跳过注入")
			} else {
				analyticsInjectBuilder.WriteString("<script defer src=\"")
				analyticsInjectBuilder.WriteString(umamiScriptURL)
				analyticsInjectBuilder.WriteString("\" data-website-id=\"")
				analyticsInjectBuilder.WriteString(umamiSiteID)
				analyticsInjectBuilder.WriteString("\"></script>")
			}
		}
	}
	analyticsInjectBuilder.WriteString("<!--Umami QuantumNous-->\n")
	analyticsInject := []byte(analyticsInjectBuilder.String())
	placeholder := []byte("<!--umami-->\n")
	indexPage = bytes.ReplaceAll(indexPage, placeholder, analyticsInject)
	classicIndexPage = bytes.ReplaceAll(classicIndexPage, placeholder, analyticsInject)
}

func InjectGoogleAnalytics() {
	analyticsInjectBuilder := &strings.Builder{}
	if gaID := os.Getenv("GOOGLE_ANALYTICS_ID"); gaID != "" {
		if !validAnalyticsID(gaID) {
			common.SysError("GOOGLE_ANALYTICS_ID 含非法字符，跳过注入")
		} else {
			// Google Analytics 4 (gtag.js)
			analyticsInjectBuilder.WriteString("<script async src=\"https://www.googletagmanager.com/gtag/js?id=")
			analyticsInjectBuilder.WriteString(gaID)
			analyticsInjectBuilder.WriteString("\"></script>")
			analyticsInjectBuilder.WriteString("<script>")
			analyticsInjectBuilder.WriteString("window.dataLayer = window.dataLayer || [];")
			analyticsInjectBuilder.WriteString("function gtag(){dataLayer.push(arguments);}")
			analyticsInjectBuilder.WriteString("gtag('js', new Date());")
			analyticsInjectBuilder.WriteString("gtag('config', '")
			analyticsInjectBuilder.WriteString(gaID)
			analyticsInjectBuilder.WriteString("');")
			analyticsInjectBuilder.WriteString("</script>")
		}
	}
	analyticsInjectBuilder.WriteString("<!--Google Analytics QuantumNous-->\n")
	analyticsInject := []byte(analyticsInjectBuilder.String())
	placeholder := []byte("<!--Google Analytics-->\n")
	indexPage = bytes.ReplaceAll(indexPage, placeholder, analyticsInject)
	classicIndexPage = bytes.ReplaceAll(classicIndexPage, placeholder, analyticsInject)
}

func InjectXingrenAPIOnboardingAssistant() {
	if strings.EqualFold(os.Getenv("XINGREN_API_ONBOARDING_ASSISTANT"), "false") {
		return
	}

	snippet := []byte("\n<script src=\"/assets/xingren-api-onboarding-assistant.js?v=api-teacher-panel-20260709\" defer></script>\n")

	indexPage = injectBeforeClosingBody(indexPage, snippet)
	classicIndexPage = injectBeforeClosingBody(classicIndexPage, snippet)
}

func injectBeforeClosingBody(page []byte, snippet []byte) []byte {
	if bytes.Contains(page, snippet) {
		return page
	}
	if bytes.Contains(page, []byte("</body>")) {
		return bytes.Replace(page, []byte("</body>"), append(snippet, []byte("</body>")...), 1)
	}
	return append(page, snippet...)
}

func InitResources() error {
	// Initialize resources here if needed
	// This is a placeholder function for future resource initialization
	err := godotenv.Load(".env")
	if err != nil {
		if common.DebugEnabled {
			common.SysLog("No .env file found, using default environment variables. If needed, please create a .env file and set the relevant variables.")
		}
	}

	// 加载环境变量
	common.InitEnv()
	normalizeSyncFrequency()

	logger.SetupLogger()

	// Initialize model settings
	ratio_setting.InitRatioSettings()

	service.InitHttpClient()

	service.InitTokenEncoders()

	// Initialize SQL Database
	err = model.InitDB()
	if err != nil {
		common.FatalLog("failed to initialize database: " + err.Error())
		return err
	}
	if err = authz.Init(model.DB); err != nil {
		common.FatalLog("failed to initialize authorization: " + err.Error())
		return err
	}

	model.CheckSetup()

	// Initialize options, should after model.InitDB()
	model.InitOptionMap()

	// 清理旧的磁盘缓存文件
	common.CleanupOldCacheFiles()

	// 初始化模型
	model.GetPricing()

	// Initialize SQL Database
	err = model.InitLogDB()
	if err != nil {
		return err
	}

	// Initialize Redis
	err = common.InitRedisClient()
	if err != nil {
		return err
	}

	perfmetrics.Init()

	// 启动系统监控
	common.StartSystemMonitor()

	// Initialize i18n
	err = i18n.Init()
	if err != nil {
		common.SysError("failed to initialize i18n: " + err.Error())
		// Don't return error, i18n is not critical
	} else {
		common.SysLog("i18n initialized with languages: " + strings.Join(i18n.SupportedLanguages(), ", "))
	}
	// Register user language loader for lazy loading
	i18n.SetUserLangLoader(model.GetUserLanguage)

	// Load custom OAuth providers from database
	err = oauth.LoadCustomProviders()
	if err != nil {
		common.SysError("failed to load custom OAuth providers: " + err.Error())
		// Don't return error, custom OAuth is not critical
	}

	return nil
}

func normalizeSyncFrequency() {
	const maxSyncFrequencySeconds = 24 * 60 * 60
	if common.SyncFrequency > 0 && common.SyncFrequency <= maxSyncFrequencySeconds {
		return
	}
	common.SysError("SYNC_FREQUENCY must be between 1 and 86400 seconds; using 60 seconds")
	common.SyncFrequency = 60
}

func registerMonthlyCardTokenRoute(server *gin.Engine) {
	for _, route := range server.Routes() {
		if route.Method == http.MethodPost && route.Path == "/api/subscription/monthly-card-token" {
			return
		}
	}
	apiRoute := server.Group("/api")
	apiRoute.Use(middleware.RouteTag("api"))
	apiRoute.Use(middleware.GlobalAPIRateLimit())

	subscriptionRoute := apiRoute.Group("/subscription")
	subscriptionRoute.Use(middleware.UserAuth())
	subscriptionRoute.POST(
		"/monthly-card-token",
		middleware.CriticalRateLimit(),
		middleware.DisableCache(),
		controller.CreateMonthlyCardToken,
	)
}
