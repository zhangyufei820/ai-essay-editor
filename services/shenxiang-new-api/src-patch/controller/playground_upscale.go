package controller

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	_ "golang.org/x/image/webp"
	"gorm.io/gorm"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"math"
	"net"
	"net/http"
	"net/http/httptrace"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const upscalePlatform = constant.TaskPlatformPlaygroundUpscale

type upscaleRequest struct {
	Model        string `json:"model"`
	Image        string `json:"image"`
	Scale        int    `json:"scale_factor"`
	OptimizedFor string `json:"optimized_for,omitempty"`
	Prompt       string `json:"prompt,omitempty"`
	Engine       string `json:"engine,omitempty"`
	Flavor       string `json:"flavor,omitempty"`
	Creativity   *int   `json:"creativity,omitempty"`
	HDR          *int   `json:"hdr,omitempty"`
	Resemblance  *int   `json:"resemblance,omitempty"`
	Fractality   *int   `json:"fractality,omitempty"`
	Sharpen      *int   `json:"sharpen,omitempty"`
	SmartGrain   *int   `json:"smart_grain,omitempty"`
	UltraDetail  *int   `json:"ultra_detail,omitempty"`
	FilterNSFW   bool   `json:"filter_nsfw"`
}
type upscaleSize struct {
	Width  int   `json:"width"`
	Height int   `json:"height"`
	Pixels int64 `json:"pixels"`
}
type upscalePayload struct {
	Model        string               `json:"model"`
	Scale        int                  `json:"scale_factor"`
	Input        upscaleSize          `json:"input"`
	Output       upscaleSize          `json:"output"`
	Amount       float64              `json:"amount_cny"`
	Quota        int                  `json:"quota"`
	RequestHash  string               `json:"request_hash"`
	BillingState string               `json:"billing_state"`
	Item         *playgroundMediaItem `json:"item,omitempty"`
	Error        string               `json:"error,omitempty"`
}
type upscaleUpstreamResponse struct {
	Code string `json:"code"`
	Data struct {
		TaskID    string   `json:"task_id"`
		Status    string   `json:"status"`
		Generated []string `json:"generated"`
	} `json:"data"`
	Artifacts []string `json:"artifacts"`
	Billing   *struct {
		Amount float64 `json:"amount"`
	} `json:"billing"`
	Error json.RawMessage `json:"error"`
}

func upscaleFail(c *gin.Context, status int, message string) {
	c.JSON(status, gin.H{"success": false, "message": message})
}
func upscalePrecision(m string) bool { return m == service.UpscalePrecisionModel }
func upscaleRead(c *gin.Context) (upscaleRequest, error) {
	var q upscaleRequest
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 15*1024*1024)
	raw, err := io.ReadAll(c.Request.Body)
	if err != nil {
		return q, errors.New("请求内容过大或无法读取")
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil || fields == nil {
		return q, errors.New("参数必须为对象")
	}
	for _, value := range fields {
		if string(value) == "null" {
			return q, errors.New("参数不能为 null")
		}
	}
	d := json.NewDecoder(bytes.NewReader(raw))
	d.DisallowUnknownFields()
	if err := d.Decode(&q); err != nil {
		return q, errors.New("参数格式错误，请检查数字、布尔值和支持的参数")
	}
	var extra interface{}
	if d.Decode(&extra) != io.EOF {
		return q, errors.New("请求只能包含一个参数对象")
	}
	return q, upscaleValidate(q)
}
func upscaleValidate(q upscaleRequest) error {
	if q.Model != service.UpscalePrecisionModel && q.Model != service.UpscaleCreativeModel {
		return errors.New("请选择精准放大或创意放大")
	}
	if q.Scale != 2 && q.Scale != 4 && q.Scale != 8 && q.Scale != 16 {
		return errors.New("放大倍数只能为 2、4、8、16")
	}
	if strings.TrimSpace(q.Image) == "" {
		return errors.New("请上传要放大的图片")
	}
	if len([]rune(q.Prompt)) > 2000 {
		return errors.New("提示词不能超过两千字")
	}
	in := func(v string, values string) bool {
		if v == "" {
			return true
		}
		for _, allowed := range strings.Split(values, ",") {
			if v == allowed {
				return true
			}
		}
		return false
	}
	if upscalePrecision(q.Model) {
		if !in(q.Flavor, "sublime,photo,photo_denoiser") {
			return errors.New("处理风格不受支持")
		}
		if (q.Flavor == "photo" || q.Flavor == "photo_denoiser") && q.Scale != 2 {
			return errors.New("照片和照片去噪风格只支持二倍放大")
		}
		if q.Prompt != "" || q.Engine != "" || q.OptimizedFor != "" || q.Creativity != nil || q.HDR != nil || q.Resemblance != nil || q.Fractality != nil {
			return errors.New("精准模式不支持创意模式参数")
		}
		for _, v := range []*int{q.Sharpen, q.SmartGrain, q.UltraDetail} {
			if v != nil && (*v < 0 || *v > 100) {
				return errors.New("精准参数必须是零到一百的整数")
			}
		}
	} else {
		if q.Flavor != "" || q.Sharpen != nil || q.SmartGrain != nil || q.UltraDetail != nil {
			return errors.New("创意模式不支持精准模式参数")
		}
		if !in(q.OptimizedFor, "standard,soft_portraits,hard_portraits,art_n_illustration,videogame_assets,nature_n_landscapes,films_n_photography,3d_renders,science_fiction_n_horror") || !in(q.Engine, "automatic,magnific_illusio,magnific_sharpy,magnific_sparkle") {
			return errors.New("优化方向或引擎不受支持")
		}
		for _, v := range []*int{q.Creativity, q.HDR, q.Resemblance, q.Fractality} {
			if v != nil && (*v < -10 || *v > 10) {
				return errors.New("创意参数必须是负十到十的整数")
			}
		}
	}
	return nil
}
func upscaleMediaClient() *http.Client {
	return &http.Client{Timeout: 60 * time.Second, Transport: &http.Transport{DialContext: upscalePublicDial}, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) > 2 || req.URL.Scheme != "https" || req.URL.User != nil || isPrivateHost(req.URL.Hostname()) {
			return errors.New("图片链接跳转不安全")
		}
		return nil
	}}
}

// Dial the validated address itself, rather than resolving the hostname again.
// This closes the DNS-rebinding window between the URL check and the connection.
func upscalePublicDial(ctx context.Context, network, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, err
	}
	ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil || len(ips) == 0 {
		return nil, errors.New("图片地址无法解析")
	}
	for _, ip := range ips {
		if isPrivateHost(ip.IP.String()) || !ip.IP.IsGlobalUnicast() {
			return nil, errors.New("图片地址不可访问")
		}
	}
	dialer := net.Dialer{Timeout: 20 * time.Second}
	var last error
	for _, ip := range ips {
		conn, err := dialer.DialContext(ctx, network, net.JoinHostPort(ip.IP.String(), port))
		if err == nil {
			return conn, nil
		}
		last = err
	}
	return nil, last
}
func upscaleReadImage(c *gin.Context, raw string) ([]byte, upscaleSize, error) {
	var data []byte
	var err error
	if strings.HasPrefix(raw, "/pg/media/files/") {
		f, e := resolvePlaygroundStoredMediaURL(c, raw, "image")
		if e != nil {
			return nil, upscaleSize{}, errors.New("图片不属于当前用户或已失效")
		}
		if f.Size > 10*1024*1024 {
			return nil, upscaleSize{}, errors.New("上传图片不能超过十兆字节")
		}
		data, err = os.ReadFile(f.Path)
	} else if strings.HasPrefix(raw, "https://") {
		if len(raw) > 4096 {
			return nil, upscaleSize{}, errors.New("图片链接过长")
		}
		u, e := validatePlaygroundMediaURL(raw)
		if e != nil || u.User != nil {
			return nil, upscaleSize{}, errors.New("请使用可公开访问的安全图片链接")
		}
		req, e := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, u.String(), nil)
		if e != nil {
			return nil, upscaleSize{}, errors.New("图片链接无效")
		}
		resp, e := upscaleMediaClient().Do(req)
		if e != nil {
			return nil, upscaleSize{}, errors.New("无法读取图片链接")
		}
		defer resp.Body.Close()
		if resp.StatusCode != 200 || resp.ContentLength > 75*1024*1024 {
			return nil, upscaleSize{}, errors.New("图片链接不可用或超过七十五兆字节")
		}
		data, err = io.ReadAll(io.LimitReader(resp.Body, 75*1024*1024+1))
		if len(data) > 75*1024*1024 {
			return nil, upscaleSize{}, errors.New("图片超过七十五兆字节")
		}
	} else {
		if strings.HasPrefix(raw, "data:") {
			i := strings.Index(raw, ",")
			if i < 0 || !strings.Contains(raw[:i], ";base64") {
				return nil, upscaleSize{}, errors.New("图片编码格式无效")
			}
			raw = raw[i+1:]
		}
		raw = strings.Join(strings.Fields(raw), "")
		if len(raw) > base64.StdEncoding.EncodedLen(10*1024*1024) {
			return nil, upscaleSize{}, errors.New("图片编码超过十兆字节，请使用图片链接")
		}
		data, err = base64.StdEncoding.DecodeString(raw)
		if len(data) > 10*1024*1024 {
			return nil, upscaleSize{}, errors.New("图片编码超过十兆字节，请使用图片链接")
		}
	}
	if err != nil {
		return nil, upscaleSize{}, errors.New("图片编码无效")
	}
	cfg, format, e := image.DecodeConfig(bytes.NewReader(data))
	if e != nil || (format != "jpeg" && format != "png" && format != "webp") {
		return nil, upscaleSize{}, errors.New("仅支持静态照片、透明图片和网页图片格式（JPG、PNG、WebP）")
	}
	if upscaleAnimated(data, format) {
		return nil, upscaleSize{}, errors.New("不支持动态图片")
	}
	w, h := cfg.Width, cfg.Height
	orientation := upscaleEXIFOrientation(data)
	if format == "jpeg" && orientation >= 5 && orientation <= 8 {
		w, h = h, w
	}
	if w < 16 || h < 16 || w > 10000 || h > 10000 {
		return nil, upscaleSize{}, errors.New("图片每边必须在十六到一万像素之间")
	}
	return data, upscaleSize{w, h, int64(w) * int64(h)}, nil
}
func upscaleAnimated(b []byte, format string) bool {
	if format == "png" {
		for i := 8; i+12 <= len(b); {
			n := int(binary.BigEndian.Uint32(b[i : i+4]))
			if n < 0 || n > len(b)-i-12 {
				break
			}
			if string(b[i+4:i+8]) == "acTL" {
				return true
			}
			i += n + 12
		}
	}
	if format == "webp" {
		for i := 12; i+8 <= len(b); {
			n := int(binary.LittleEndian.Uint32(b[i+4 : i+8]))
			if string(b[i:i+4]) == "ANIM" {
				return true
			}
			if n < 0 || n > len(b)-i-8 {
				break
			}
			i += 8 + n + (n % 2)
		}
	}
	return false
}
func upscaleEXIFOrientation(b []byte) int {
	for i := 2; i+4 < len(b) && b[i] == 255; {
		marker := b[i+1]
		if marker == 0xda || marker == 0xd9 {
			break
		}
		n := int(binary.BigEndian.Uint16(b[i+2 : i+4]))
		if n < 2 || i+2+n > len(b) {
			break
		}
		s := b[i+4 : i+2+n]
		if marker == 0xe1 && len(s) >= 14 && string(s[:6]) == "Exif\x00\x00" {
			t := s[6:]
			var o binary.ByteOrder = binary.BigEndian
			if string(t[:2]) == "II" {
				o = binary.LittleEndian
			}
			off := int(o.Uint32(t[4:8]))
			if off < 0 || off+2 > len(t) {
				break
			}
			count := int(o.Uint16(t[off : off+2]))
			for j := 0; j < count; j++ {
				p := off + 2 + j*12
				if p+12 > len(t) {
					break
				}
				if o.Uint16(t[p:p+2]) == 0x112 && o.Uint16(t[p+2:p+4]) == 3 && o.Uint32(t[p+4:p+8]) == 1 {
					return int(o.Uint16(t[p+8 : p+10]))
				}
			}
		}
		i += n + 2
	}
	return 1
}
func upscaleAllowed(p int64) []int {
	v := []int{}
	for _, s := range []int{2, 4, 8, 16} {
		if _, e := service.UpscaleCredits(p, s); e == nil {
			v = append(v, s)
		}
	}
	return v
}
func upscaleEstimate(c *gin.Context, q upscaleRequest) ([]byte, upscalePayload, error) {
	data, input, err := upscaleReadImage(c, q.Image)
	if err != nil {
		return nil, upscalePayload{}, err
	}
	pricing, err := service.GetUpscalePricing()
	if err != nil {
		return nil, upscalePayload{}, err
	}
	amount, quota, err := pricing.Amount(input.Pixels, q.Scale)
	return data, upscalePayload{Model: q.Model, Scale: q.Scale, Input: input, Output: upscaleSize{input.Width * q.Scale, input.Height * q.Scale, input.Pixels * int64(q.Scale*q.Scale)}, Amount: amount, Quota: quota, BillingState: "reserved"}, err
}
func PlaygroundUpscaleConfig(c *gin.Context) {
	p, e := service.GetUpscalePricing()
	available := e == nil
	for _, name := range []string{service.UpscalePrecisionModel, service.UpscaleCreativeModel} {
		ch, err := upscaleChannel(name)
		if err != nil {
			available = false
			continue
		}
		if _, ok := upscaleRoutingGroup(c, ch, name); !ok {
			available = false
		}
	}
	c.JSON(200, gin.H{"success": true, "data": gin.H{"models": []gin.H{{"id": service.UpscalePrecisionModel, "name": service.UpscalePrecisionModel, "mode": "precision", "description": "保留原图结构与自然色彩"}, {"id": service.UpscaleCreativeModel, "name": service.UpscaleCreativeModel, "mode": "creative", "description": "补充纹理和细节，可使用提示词引导"}}, "scales": []int{2, 4, 8, 16}, "prices_cny": p.Examples(), "pricing_mode": p.Mode, "per_credit_cny": p.PerCredit, "per_credit_cny_by_scale": p.PerCreditByScale, "available": available, "currency": "CNY"}})
}
func PlaygroundUpscaleEstimate(c *gin.Context) {
	q, e := upscaleRead(c)
	if e != nil {
		upscaleFail(c, 400, e.Error())
		return
	}
	if !upscaleAuthorize(c, q.Model) {
		upscaleFail(c, 403, "当前令牌没有此模型权限")
		return
	}
	ch, err := upscaleChannel(q.Model)
	if err != nil {
		upscaleFail(c, 503, err.Error())
		return
	}
	if _, ok := upscaleRoutingGroup(c, ch, q.Model); !ok {
		upscaleFail(c, 403, "当前令牌分组尚未开放此模型")
		return
	}
	_, v, e := upscaleEstimate(c, q)
	if e != nil {
		upscaleFail(c, 400, e.Error())
		return
	}
	credits, _ := service.UpscaleCredits(v.Input.Pixels, q.Scale)
	c.JSON(200, gin.H{"success": true, "data": gin.H{"input": v.Input, "output": v.Output, "amount_cny": v.Amount, "currency": "CNY", "credits": credits, "allowed_scale_factors": upscaleAllowed(v.Input.Pixels)}})
}
func upscaleChannel(m string) (model.Channel, error) {
	tag := "xingren-upscale-creative"
	if upscalePrecision(m) {
		tag = "xingren-upscale-precision"
	}
	var ch model.Channel
	var channels []model.Channel
	err := model.DB.Where("tag = ? AND status = 1", tag).Limit(2).Find(&channels).Error
	if err != nil || len(channels) != 1 {
		return ch, errors.New("高清放大服务暂时不可用")
	}
	ch = channels[0]
	if err != nil || ch.BaseURL == nil || ch.Key == "" || strings.TrimSpace(ch.Models) != m {
		return ch, errors.New("高清放大服务暂时不可用")
	}
	u, e := url.Parse(*ch.BaseURL)
	if e != nil || u.Scheme != "https" || u.Host != "api.smile-ai-studio.com" || (u.Path != "" && u.Path != "/") || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return ch, errors.New("高清放大服务配置无效")
	}
	return ch, nil
}
func upscaleAuthorize(c *gin.Context, m string) bool {
	if c.GetInt("id") <= 0 {
		return false
	}
	tid := c.GetInt("token_id")
	if tid <= 0 {
		return true
	}
	var t model.Token
	if model.DB.Where("id = ? AND user_id = ? AND status = 1", tid, c.GetInt("id")).First(&t).Error != nil {
		return false
	}
	return !t.ModelLimitsEnabled || strings.Contains(","+t.ModelLimits+",", ","+m+",")
}

// Creation respects the published group abilities. Existing owned results remain
// downloadable if a provider is later disabled.
func upscaleRoutingGroup(c *gin.Context, ch model.Channel, name string) (string, bool) {
	if strings.TrimSpace(ch.Group) == "internal" && c.GetInt("id") != 1 {
		return "", false
	}
	groups := []string{"default"}
	if tid := c.GetInt("token_id"); tid > 0 {
		var token model.Token
		if model.DB.Where("id = ? AND user_id = ?", tid, c.GetInt("id")).First(&token).Error != nil {
			return "", false
		}
		groups = strings.Split(token.Group, ",")
		if token.Group == "" {
			var u model.User
			if model.DB.First(&u, c.GetInt("id")).Error != nil {
				return "", false
			}
			groups = []string{u.Group}
		}
	} else if c.GetInt("id") == 1 {
		groups = append(groups, "internal")
	}
	for _, group := range groups {
		group = strings.TrimSpace(group)
		var n int64
		if group == "" || !strings.Contains(","+ch.Group+",", ","+group+",") {
			continue
		}
		if model.DB.Model(&model.Ability{}).Where("channel_id = ? AND model = ? AND `group` = ? AND enabled = ?", ch.Id, name, group, true).Count(&n).Error == nil && n > 0 {
			return group, true
		}
	}
	return "", false
}
func PlaygroundUpscaleCreate(c *gin.Context) {
	q, e := upscaleRead(c)
	if e != nil {
		upscaleFail(c, 400, e.Error())
		return
	}
	if !upscaleAuthorize(c, q.Model) {
		upscaleFail(c, 403, "当前令牌没有此模型权限")
		return
	}
	requestBytes, _ := json.Marshal(q)
	requestHash := fmt.Sprintf("%x", sha256.Sum256(requestBytes))
	idem := strings.TrimSpace(c.GetHeader("Idempotency-Key"))
	if idem == "" || len(idem) > 200 {
		upscaleFail(c, 400, "请提供有效的请求唯一标识")
		return
	}
	taskID := fmt.Sprintf("task_%x", sha256.Sum256([]byte(fmt.Sprintf("%d:%s", c.GetInt("id"), idem))))
	var existing model.Task
	if model.DB.Where("task_id = ? AND user_id = ? AND platform = ?", taskID, c.GetInt("id"), upscalePlatform).First(&existing).Error == nil {
		var prior upscalePayload
		_ = existing.GetData(&prior)
		if prior.RequestHash != requestHash {
			upscaleFail(c, 409, "请求标识已用于不同参数")
			return
		}
		c.JSON(200, gin.H{"success": true, "data": upscalePublicFor(c, &existing)})
		return
	}
	validatedData, v, e := upscaleEstimate(c, q)
	if e != nil {
		upscaleFail(c, 400, e.Error())
		return
	}
	ch, e := upscaleChannel(q.Model)
	if e != nil {
		upscaleFail(c, 503, e.Error())
		return
	}
	group, available := upscaleRoutingGroup(c, ch, q.Model)
	if !available {
		upscaleFail(c, 403, "当前令牌分组尚未开放此模型")
		return
	}
	quota := v.Quota
	if expected := c.GetHeader("X-Upscale-Expected-Amount"); expected != "" {
		amount, err := strconv.ParseFloat(expected, 64)
		if err != nil || math.IsNaN(amount) || math.IsInf(amount, 0) {
			upscaleFail(c, 400, "费用确认信息无效")
			return
		}
		if math.Abs(amount-v.Amount) > 1e-9 {
			upscaleFail(c, 409, "费用已更新，请重新确认后提交")
			return
		}
	}
	v.RequestHash = requestHash
	task := &model.Task{TaskID: taskID, Platform: upscalePlatform, Action: constant.TaskActionImageUpscale, UserId: c.GetInt("id"), ChannelId: ch.Id, Quota: quota, Group: group, SubmitTime: time.Now().Unix(), Status: model.TaskStatusSubmitted, Progress: "5%", Properties: model.Properties{OriginModelName: q.Model}, PrivateData: model.TaskPrivateData{TokenId: c.GetInt("token_id"), BillingSource: "wallet"}}
	task.SetData(v)
	if e = model.ReserveUpscaleTask(task, c.GetInt("token_id")); e != nil {
		if errors.Is(e, model.ErrUpscaleTaskExists) {
			var prior model.Task
			_ = model.DB.Where("task_id = ? AND user_id = ?", taskID, c.GetInt("id")).First(&prior).Error
			var pp upscalePayload
			_ = prior.GetData(&pp)
			if pp.RequestHash != requestHash {
				upscaleFail(c, 409, "请求标识已用于不同参数")
				return
			}
			c.JSON(200, gin.H{"success": true, "data": upscalePublicFor(c, &prior)})
			return
		}
		message := e.Error()
		if message != "余额不足，请先充值" && message != "令牌不可用" && message != "令牌已过期" && message != "令牌额度不足" {
			upscaleFail(c, 503, "暂时无法预扣费用，请稍后重试")
			return
		}
		upscaleFail(c, 403, message)
		return
	}
	_ = model.InvalidateUserTokensCache(task.UserId)
	// Preserve exactly the validated image. Large inputs use an owner-only signed immutable reference.
	if len(validatedData) <= 10*1024*1024 {
		q.Image = "data:" + http.DetectContentType(validatedData) + ";base64," + base64.StdEncoding.EncodeToString(validatedData)
	} else {
		ext := ".png"
		if mime := http.DetectContentType(validatedData); mime == "image/jpeg" {
			ext = ".jpg"
		} else if mime == "image/webp" {
			ext = ".webp"
		}
		item, er := writePlaygroundMedia(c, playgroundMediaCacheRequest{Kind: "image", Model: q.Model, Workflow: "高清放大", Metadata: map[string]interface{}{"role": "reference", "hidden": true, "public_reference": true}}, bytes.NewReader(validatedData), ext, 75*1024*1024)
		if er != nil {
			upscaleReject(task.TaskID, "图片保存失败")
			upscaleFail(c, 500, "图片保存失败")
			return
		}
		q.Image = playgroundSignedPublicMediaURL(c, item)
		if strings.HasPrefix(q.Image, "/") {
			q.Image = strings.TrimRight(system_setting.ServerAddress, "/") + q.Image
		}
		if !strings.HasPrefix(q.Image, "https://") {
			upscaleReject(task.TaskID, "图片访问地址尚未配置")
			upscaleFail(c, 503, "图片访问地址尚未配置")
			return
		}
	}
	go upscaleSubmit(task.TaskID, q, ch)
	c.JSON(200, gin.H{"success": true, "data": gin.H{"task_id": task.TaskID, "status": "SUBMITTED", "poll_url": upscaleTaskPrefix(c) + task.TaskID, "amount_cny": v.Amount}})
}
func upscalePath(m string) string {
	if upscalePrecision(m) {
		return "/magnific/v1/ai/image-upscaler-precision-v2"
	}
	return "/magnific/v1/ai/image-upscaler"
}
func upscaleUpstreamBody(q upscaleRequest) []byte {
	body, _ := json.Marshal(q)
	var m map[string]interface{}
	_ = json.Unmarshal(body, &m)
	if upscalePrecision(q.Model) {
		m["model"] = "magnific-upscaler-precision-v2"
		if q.Flavor == "" {
			m["flavor"] = "sublime"
		}
	} else {
		m["model"] = "magnific-upscaler-creative"
		m["scale_factor"] = fmt.Sprintf("%dx", q.Scale)
	}
	b, _ := json.Marshal(m)
	return b
}

var errUpscaleNotSent = errors.New("request was not sent")
var upscaleDoRequest = func(req *http.Request) (*http.Response, error) {
	client := &http.Client{Timeout: 75 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	return client.Do(req)
}

func upscaleAPI(ch model.Channel, method, path string, body []byte) (upscaleUpstreamResponse, int, error) {
	var v upscaleUpstreamResponse
	ctx, cancel := context.WithTimeout(context.Background(), 75*time.Second)
	defer cancel()
	req, e := http.NewRequestWithContext(ctx, method, strings.TrimRight(*ch.BaseURL, "/")+path, bytes.NewReader(body))
	if e != nil {
		return v, 0, e
	}
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(ch.Key))
	req.Header.Set("Content-Type", "application/json")
	var wroteHeaders atomic.Bool
	req = req.WithContext(httptrace.WithClientTrace(req.Context(), &httptrace.ClientTrace{WroteHeaders: func() { wroteHeaders.Store(true) }}))
	resp, e := upscaleDoRequest(req)
	if e != nil {
		if !wroteHeaders.Load() {
			return v, 0, errUpscaleNotSent
		}
		return v, 0, e
	}
	defer resp.Body.Close()
	raw, e := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024+1))
	if e != nil || len(raw) > 2*1024*1024 {
		return v, resp.StatusCode, errors.New("无效任务响应")
	}
	if json.Unmarshal(raw, &v) != nil {
		return v, resp.StatusCode, errors.New("无效任务响应")
	}
	return v, resp.StatusCode, nil
}
func upscaleReject(id, message string) error {
	var uid int
	err := model.UpscaleTaskTransaction(id, func(tx *gorm.DB, t *model.Task) error {
		uid = t.UserId
		if err := model.RefundUnacceptedUpscaleTask(t, tx); err != nil {
			return err
		}
		var p upscalePayload
		_ = t.GetData(&p)
		p.Error = message
		t.SetData(p)
		t.Status = model.TaskStatusFailure
		t.FailReason = message
		t.FinishTime = time.Now().Unix()
		t.Progress = "100%"
		return nil
	})
	if err == nil && uid > 0 {
		_ = model.InvalidateUserCache(uid)
		_ = model.InvalidateUserTokensCache(uid)
	}
	return err
}
func upscaleSubmit(id string, q upscaleRequest, ch model.Channel) {
	claimed := false
	err := model.UpscaleTaskTransaction(id, func(tx *gorm.DB, t *model.Task) error {
		var p upscalePayload
		_ = t.GetData(&p)
		if p.BillingState != "reserved" {
			return nil
		}
		p.BillingState = "submitting"
		t.SetData(p)
		claimed = true
		return nil
	})
	if err != nil || !claimed {
		return
	}
	v, status, err := upscaleAPI(ch, "POST", upscalePath(q.Model), upscaleUpstreamBody(q))
	if (errors.Is(err, errUpscaleNotSent) || (status >= 400 && status < 500) || (err == nil && status >= 500 && v.Code == "server_error")) && v.Data.TaskID == "" && v.Billing == nil {
		upscaleReject(id, "服务未受理任务，预扣费用已退回，请稍后重试")
		return
	}
	if err != nil || status != 200 || v.Data.TaskID == "" || v.Billing == nil {
		_ = model.UpscaleTaskTransaction(id, func(tx *gorm.DB, t *model.Task) error {
			var p upscalePayload
			_ = t.GetData(&p)
			p.BillingState = "uncertain"
			// A known task may be queried safely even if its initial billing
			// receipt was incomplete. Never submit it a second time.
			if status == 200 && v.Data.TaskID != "" {
				t.PrivateData.UpstreamTaskID = v.Data.TaskID
			}
			if err := upscaleAuditSettlement(tx, t, "upscale_pending_confirmation"); err != nil {
				return err
			}
			p.Error = "提交结果尚未确认，请勿重复提交；费用待核对"
			t.SetData(p)
			t.Status = model.TaskStatusUnknown
			return nil
		})
		return
	}
	// Journal the receipt before the database transition so a restart between
	// provider acceptance and the commit can recover by GET rather than POST.
	_ = upscaleWriteReceipt(id, v)
	if upscaleAcceptReceipt(id, v) != nil {
		return
	}
	upscaleApplyResult(id, v)
	upscaleRefresh(id)
}

func upscaleReceiptPath(id string) string {
	return filepath.Join(playgroundMediaCacheRoot(), ".upscale-receipts", id+".json")
}

func upscaleWriteReceipt(id string, v upscaleUpstreamResponse) error {
	path := upscaleReceiptPath(id)
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	v.Error = nil
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(path), ".receipt-")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	if _, err = f.Write(data); err != nil {
		f.Close()
		return err
	}
	if err = f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	return os.Rename(f.Name(), path)
}

func upscaleAcceptReceipt(id string, v upscaleUpstreamResponse) error {
	err := model.UpscaleTaskTransaction(id, func(tx *gorm.DB, t *model.Task) error {
		if t.PrivateData.UpstreamTaskID != "" && t.PrivateData.UpstreamTaskID != v.Data.TaskID {
			return errors.New("任务回执不一致")
		}
		var p upscalePayload
		_ = t.GetData(&p)
		if v.Data.TaskID == "" {
			return errors.New("受理回执缺少任务标识")
		}
		if p.BillingState == "refunded" {
			return errors.New("已退回的任务不能重新受理")
		}
		if p.BillingState != "charged" {
			if err := upscaleChargeStats(tx, t); err != nil {
				return err
			}
		}
		p.BillingState = "charged"
		p.Error = ""
		if err := upscaleAuditSettlement(tx, t, "upscale_charged"); err != nil {
			return err
		}
		t.SetData(p)
		t.PrivateData.UpstreamTaskID = v.Data.TaskID
		if t.Status != model.TaskStatusSuccess && t.Status != model.TaskStatusFailure {
			t.Status = model.TaskStatusInProgress
		}
		return nil
	})
	if err == nil {
		_ = os.Remove(upscaleReceiptPath(id))
	}
	return err
}

func recoverUpscaleReceipts() {
	entries, err := os.ReadDir(filepath.Dir(upscaleReceiptPath("task")))
	if err != nil {
		return
	}
	count := 0
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasPrefix(entry.Name(), "task_") || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		info, err := entry.Info()
		if err != nil || info.Size() > 2*1024*1024 {
			continue
		}
		id := strings.TrimSuffix(entry.Name(), ".json")
		data, err := os.ReadFile(upscaleReceiptPath(id))
		if err != nil {
			continue
		}
		var receipt upscaleUpstreamResponse
		if json.Unmarshal(data, &receipt) != nil || receipt.Data.TaskID == "" {
			continue
		}
		if upscaleAcceptReceipt(id, receipt) == nil {
			upscaleApplyResult(id, receipt)
			go upscaleRefresh(id)
		}
		count++
		if count >= 100 {
			break
		}
	}
}

var upscaleActive sync.Map

func upscaleRefresh(id string) {
	if _, busy := upscaleActive.LoadOrStore(id, true); busy {
		return
	}
	defer upscaleActive.Delete(id)
	var task model.Task
	if model.DB.Where("task_id = ? AND platform = ?", id, upscalePlatform).First(&task).Error != nil || task.PrivateData.UpstreamTaskID == "" || task.Status == model.TaskStatusFailure || task.Status == model.TaskStatusSuccess {
		return
	}
	var p upscalePayload
	_ = task.GetData(&p)
	var ch model.Channel
	if model.DB.First(&ch, task.ChannelId).Error != nil || ch.BaseURL == nil {
		return
	}
	v, status, e := upscaleAPI(ch, "GET", upscalePath(p.Model)+"/"+url.PathEscape(task.PrivateData.UpstreamTaskID), nil)
	if e != nil || status != 200 {
		return
	}
	upscaleApplyResult(id, v)
}
func upscaleApplyResult(id string, v upscaleUpstreamResponse) {
	_ = model.UpscaleTaskTransaction(id, func(tx *gorm.DB, t *model.Task) error {
		if t.Status == model.TaskStatusFailure || t.Status == model.TaskStatusSuccess {
			return nil
		}
		var p upscalePayload
		_ = t.GetData(&p)
		if t.PrivateData.UpstreamTaskID != "" && p.BillingState != "charged" && (v.Data.Status == "CREATED" || v.Data.Status == "IN_PROGRESS" || v.Data.Status == "COMPLETED" || v.Data.Status == "FAILED") {
			if err := upscaleChargeStats(tx, t); err != nil {
				return err
			}
			p.BillingState = "charged"
			if err := upscaleAuditSettlement(tx, t, "upscale_charged"); err != nil {
				return err
			}
		}
		switch v.Data.Status {
		case "FAILED":
			p.Error = "图片放大处理失败；服务已受理，费用不退回"
			t.FailReason = p.Error
			t.Status = model.TaskStatusFailure
			t.FinishTime = time.Now().Unix()
		case "COMPLETED":
			if len(v.Data.Generated) == 0 {
				p.Error = "任务已完成但未返回图片；费用不退回"
				t.Status = model.TaskStatusFailure
				t.FinishTime = time.Now().Unix()
				break
			}
			u, err := url.Parse(v.Data.Generated[0])
			if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || isPrivateHost(u.Hostname()) {
				p.Error = "任务已完成但未返回可用图片；费用不退回"
				t.Status = model.TaskStatusFailure
				t.FinishTime = time.Now().Unix()
				break
			}
			t.PrivateData.ResultURL = v.Data.Generated[0]
			t.Status = model.TaskStatusSuccess
			t.FinishTime = time.Now().Unix()
			t.Progress = "100%"
		default:
			t.Status = model.TaskStatusInProgress
			t.Progress = "50%"
		}
		if t.Status == model.TaskStatusFailure {
			t.Progress = "100%"
		}
		t.SetData(p)
		return nil
	})
}
func upscaleOwned(c *gin.Context) (*model.Task, bool) {
	var t model.Task
	if model.DB.Where("task_id = ? AND user_id = ? AND platform = ?", c.Param("task_id"), c.GetInt("id"), upscalePlatform).First(&t).Error != nil || !upscaleAuthorize(c, t.Properties.OriginModelName) {
		upscaleFail(c, 404, "任务不存在或无权访问")
		return nil, false
	}
	return &t, true
}
func upscalePublic(t *model.Task) gin.H {
	var p upscalePayload
	_ = t.GetData(&p)
	url := ""
	if t.Status == model.TaskStatusSuccess {
		url = "/pg/upscale/tasks/" + t.TaskID + "/download"
	}
	return gin.H{"task_id": t.TaskID, "status": t.Status, "model": p.Model, "scale_factor": p.Scale, "input": p.Input, "output": p.Output, "amount_cny": p.Amount, "currency": "CNY", "billing_state": p.BillingState, "url": url, "download_url": url, "error": p.Error, "item": p.Item, "created_at": t.SubmitTime}
}
func upscaleTaskPrefix(c *gin.Context) string {
	if c != nil && c.Request != nil && strings.HasPrefix(c.Request.URL.Path, "/v1/") {
		return "/v1/images/upscale/tasks/"
	}
	return "/pg/upscale/tasks/"
}
func upscalePublicFor(c *gin.Context, t *model.Task) gin.H {
	v := upscalePublic(t)
	v["poll_url"] = upscaleTaskPrefix(c) + t.TaskID
	if t.Status == model.TaskStatusSuccess {
		v["download_url"] = upscaleTaskPrefix(c) + t.TaskID + "/download"
		v["url"] = v["download_url"]
	}
	return v
}
func PlaygroundUpscaleGet(c *gin.Context) {
	t, ok := upscaleOwned(c)
	if !ok {
		return
	}
	upscaleRefresh(t.TaskID)
	_ = model.DB.First(t, t.ID).Error
	c.JSON(200, gin.H{"success": true, "data": upscalePublicFor(c, t)})
}
func PlaygroundUpscaleList(c *gin.Context) {
	var tasks []model.Task
	if model.DB.Where("user_id = ? AND platform = ?", c.GetInt("id"), upscalePlatform).Order("id DESC").Limit(100).Find(&tasks).Error != nil {
		upscaleFail(c, 500, "无法读取放大任务")
		return
	}
	list := []gin.H{}
	for i := range tasks {
		if upscaleAuthorize(c, tasks[i].Properties.OriginModelName) {
			list = append(list, upscalePublicFor(c, &tasks[i]))
		}
	}
	c.JSON(200, gin.H{"success": true, "data": list})
}

var upscaleDownloads sync.Map

func PlaygroundUpscaleDownload(c *gin.Context) {
	t, ok := upscaleOwned(c)
	if !ok {
		return
	}
	if _, busy := upscaleDownloads.LoadOrStore(t.TaskID, true); busy {
		upscaleFail(c, 409, "图片正在保存，请稍后重试")
		return
	}
	defer upscaleDownloads.Delete(t.TaskID)
	if t.Status != model.TaskStatusSuccess {
		upscaleFail(c, 409, "图片尚未完成")
		return
	}
	var p upscalePayload
	_ = t.GetData(&p)
	if p.Item != nil && p.Item.URL != "" {
		if _, err := resolvePlaygroundStoredMediaURL(c, p.Item.URL, "image"); err == nil {
			c.Redirect(302, p.Item.URL)
			return
		}
	}
	var ch model.Channel
	if model.DB.First(&ch, t.ChannelId).Error != nil || ch.BaseURL == nil {
		upscaleFail(c, 503, "图片下载服务暂时不可用")
		return
	}
	// Refresh through authenticated artifact endpoint; never forward credentials across redirects.
	ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
	defer cancel()
	req, e := http.NewRequestWithContext(ctx, "GET", strings.TrimRight(*ch.BaseURL, "/")+"/v1/tasks/"+url.PathEscape(t.PrivateData.UpstreamTaskID)+"/artifacts/image-0/content", nil)
	if e != nil {
		upscaleFail(c, 502, "暂时无法下载图片")
		return
	}
	req.Header.Set("Authorization", "Bearer "+ch.Key)
	client := &http.Client{Timeout: 60 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, e := client.Do(req)
	if e != nil {
		upscaleFail(c, 502, "暂时无法下载图片")
		return
	}
	defer resp.Body.Close()
	rawURL := ""
	if resp.StatusCode == 302 || resp.StatusCode == 303 || resp.StatusCode == 307 {
		rawURL = resp.Header.Get("Location")
	}
	if rawURL == "" {
		upscaleFail(c, 502, "图片下载链接暂时不可用")
		return
	}
	if _, err := validatePlaygroundMediaURL(rawURL); err != nil || !strings.HasPrefix(rawURL, "https://") {
		upscaleFail(c, 502, "图片下载链接无效")
		return
	}
	req, e = http.NewRequestWithContext(ctx, "GET", rawURL, nil)
	if e != nil {
		upscaleFail(c, 502, "图片下载链接无效")
		return
	}
	resp2, e := upscaleMediaClient().Do(req)
	if e != nil {
		upscaleFail(c, 502, "暂时无法下载图片")
		return
	}
	defer resp2.Body.Close()
	if resp2.StatusCode != 200 {
		upscaleFail(c, 502, "图片链接已失效，请稍后重试")
		return
	}
	reader := bufio.NewReaderSize(resp2.Body, 1024*1024)
	ext, err := upscaleOutputHeader(reader, p.Output)
	if err != nil {
		upscaleFail(c, 502, "放大结果不是有效图片或尺寸不匹配，请稍后重试")
		return
	}
	item, e := writePlaygroundMedia(c, playgroundMediaCacheRequest{Kind: "image", Model: p.Model, Workflow: "高清放大", Metadata: map[string]interface{}{"scale_factor": p.Scale, "task_id": t.TaskID}}, reader, ext, 1024*1024*1024)
	if e != nil {
		upscaleFail(c, 502, "图片保存失败，请稍后重试")
		return
	}
	item.OriginalURL = ""
	p.Item = item
	_ = model.UpscaleTaskTransaction(t.TaskID, func(tx *gorm.DB, t *model.Task) error {
		var current upscalePayload
		_ = t.GetData(&current)
		current.Item = item
		t.SetData(current)
		return nil
	})
	c.Redirect(302, item.URL)
}

// Decode through Peek so the stream remains intact for storage.
func upscaleOutputHeader(reader *bufio.Reader, expected upscaleSize) (string, error) {
	header, _ := reader.Peek(1024 * 1024)
	cfg, format, err := image.DecodeConfig(bytes.NewReader(header))
	if err != nil || cfg.Width != expected.Width || cfg.Height != expected.Height {
		return "", errors.New("结果图片尺寸无效")
	}
	switch format {
	case "png":
		return ".png", nil
	case "jpeg":
		return ".jpg", nil
	case "webp":
		return ".webp", nil
	}
	return "", errors.New("结果图片格式无效")
}
func StartPlaygroundUpscaleReconciler() {
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			if model.DB == nil {
				continue
			}
			recoverUpscaleReceipts()
			var tasks []model.Task
			_ = model.DB.Where("platform = ?", upscalePlatform).Where("status IN ? OR (status = ? AND private_data LIKE ?)", []string{"SUBMITTED", "IN_PROGRESS"}, "UNKNOWN", "%\"upstream_task_id\"%").Order("id").Limit(100).Find(&tasks).Error
			for _, t := range tasks {
				if t.PrivateData.UpstreamTaskID != "" {
					go upscaleRefresh(t.TaskID)
				} else if time.Now().Unix()-t.SubmitTime > 120 {
					_ = model.UpscaleTaskTransaction(t.TaskID, func(tx *gorm.DB, t *model.Task) error {
						var p upscalePayload
						_ = t.GetData(&p)
						if p.BillingState == "reserved" {
							if err := model.RefundUnacceptedUpscaleTask(t, tx); err != nil {
								return err
							}
							_ = t.GetData(&p)
							p.Error = "任务尚未发送，预扣费用已退回"
							t.SetData(p)
							t.Status = model.TaskStatusFailure
							t.Progress = "100%"
							t.FinishTime = time.Now().Unix()
						} else if p.BillingState == "submitting" {
							p.BillingState = "uncertain"
							p.Error = "提交结果尚未确认，请勿重复提交；费用待核对"
							t.SetData(p)
							t.Status = model.TaskStatusUnknown
						}
						return nil
					})
					_ = model.InvalidateUserCache(t.UserId)
					_ = model.InvalidateUserTokensCache(t.UserId)
				}
			}
		}
	}()
}

func upscaleChargeStats(tx *gorm.DB, t *model.Task) error {
	if err := tx.Model(&model.User{}).Where("id = ?", t.UserId).Update("request_count", gorm.Expr("request_count + 1")).Error; err != nil {
		return err
	}
	return tx.Model(&model.Channel{}).Where("id = ?", t.ChannelId).Update("used_quota", gorm.Expr("used_quota + ?", t.Quota)).Error
}
func upscaleAuditSettlement(tx *gorm.DB, t *model.Task, state string) error {
	var logs []model.Log
	if err := tx.Where("user_id = ? AND type = ? AND other LIKE ?", t.UserId, model.LogTypeConsume, "%\"task_id\":\""+t.TaskID+"\"%").Find(&logs).Error; err != nil {
		return err
	}
	for _, l := range logs {
		var o map[string]interface{}
		if json.Unmarshal([]byte(l.Other), &o) != nil {
			continue
		}
		o["billing_settlement"] = state
		b, _ := json.Marshal(o)
		if err := tx.Model(&model.Log{}).Where("id = ?", l.Id).Update("other", string(b)).Error; err != nil {
			return err
		}
	}
	return nil
}
