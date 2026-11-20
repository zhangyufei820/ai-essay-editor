package relay

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

// Send only fields whose semantics and costs we have validated, even on
// channels otherwise configured for body pass-through.
func seedream55OutboundBody(r *dto.ImageRequest) ([]byte, error) {
	out := map[string]any{"model": r.Model}
	if prompt := strings.TrimSpace(r.Prompt); prompt != "" {
		out["prompt"] = prompt
	}
	if r.Size != "" {
		out["size"] = r.Size
	}
	if r.ResponseFormat != "" {
		out["response_format"] = r.ResponseFormat
	}
	if r.OutputFormat != nil {
		out["output_format"] = r.OutputFormat
	}
	if r.Image != nil {
		out["image"] = r.Image
	}
	if r.Background != nil {
		out["background"] = r.Background
	}
	if r.Watermark != nil {
		out["watermark"] = *r.Watermark
	}
	if r.LayerDecomposition {
		out["layer_decomposition"] = true
		if r.LayerDecompositionOptions != nil {
			out["layer_decomposition_options"] = r.LayerDecompositionOptions
		}
	}
	return json.Marshal(out)
}

func seedream55OutputCount(body []byte, cap int) (int, error) {
	var response struct {
		Error json.RawMessage `json:"error"`
		Data  []struct {
			URL    string          `json:"url"`
			Base64 string          `json:"b64_json"`
			Error  json.RawMessage `json:"error"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &response); err != nil || (len(response.Error) > 0 && string(response.Error) != "null") || len(response.Data) == 0 || len(response.Data) > cap {
		return 0, errors.New("未收到符合请求的完整图片结果")
	}
	for _, item := range response.Data {
		if len(item.Error) > 0 && string(item.Error) != "null" {
			return 0, errors.New("部分图片生成失败，本次请求按整单失败处理")
		}
		if u, err := url.Parse(item.URL); err == nil && (u.Scheme == "https" || u.Scheme == "http") && u.Hostname() != "" {
			continue
		}
		if item.Base64 != "" {
			decoder := base64.NewDecoder(base64.StdEncoding, strings.NewReader(item.Base64))
			if n, err := io.Copy(io.Discard, decoder); err == nil && n > 0 {
				continue
			}
		}
		return 0, errors.New("返回的图片结果缺少有效文件")
	}
	return len(response.Data), nil
}

func relaySeedream55Image(c *gin.Context, info *relaycommon.RelayInfo, r *dto.ImageRequest) *types.NewAPIError {
	bill := service.GetSeedream55Billing(c)
	if bill == nil || info.ApiType != constant.APITypeOpenAI || r.Model != dto.Seedream55Model {
		return types.NewErrorWithStatusCode(errors.New("豆包绘图渠道或计费配置不完整"), types.ErrorCodeInvalidRequest, http.StatusServiceUnavailable, types.ErrOptionWithSkipRetry())
	}
	body, err := seedream55OutboundBody(r)
	if err != nil {
		return types.NewErrorWithStatusCode(err, types.ErrorCodeInvalidRequest, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
	}
	adaptor := GetAdaptor(info.ApiType)
	adaptor.Init(info)
	info.UpstreamRequestBodySize = int64(len(body))
	recordPlaygroundImageRequestLog(c, info, r)
	rawResp, err := adaptor.DoRequest(c, info, bytes.NewReader(body))
	// After dispatch the provider may already have generated and billed an image.
	// Never generate a second set while retrying a transport or result error.
	fail := func(message string, code int) *types.NewAPIError {
		c.Header("X-AIPHUI-Retryable", "false")
		return types.NewErrorWithStatusCode(errors.New(message), types.ErrorCodeBadResponse, code, types.ErrOptionWithSkipRetry())
	}
	resp, ok := rawResp.(*http.Response)
	if err != nil || !ok || resp == nil || resp.Body == nil {
		return fail("图片服务的结果尚未确认，请查看原任务记录", http.StatusBadGateway)
	}
	defer service.CloseResponseBodyGracefully(resp)
	if resp.StatusCode != http.StatusOK {
		return fail(fmt.Sprintf("图片服务未完成本次请求（HTTP %d）", resp.StatusCode), http.StatusBadGateway)
	}
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return fail("未能完整接收图片结果，请查看原任务记录", http.StatusBadGateway)
	}
	count, err := seedream55OutputCount(data, bill.Quote.OutputCap)
	if err != nil {
		return fail(err.Error(), http.StatusBadGateway)
	}
	bill.ActualOutputs = count
	// Images are billed by validated outputs. Token counts do not participate.
	usage := &dto.Usage{}
	service.IOCopyBytesGracefully(c, resp, data)
	if callback, ok := c.Get(PlaygroundImageResponseCaptureKey); ok {
		if capture, ok := callback.(func(*dto.ImageRequest, *dto.Usage)); ok {
			capture(r, usage)
		}
	}
	service.PostTextConsumeQuota(c, info, usage, []string{fmt.Sprintf("输入 %d 张，输出 %d 张（含底图），请求尺寸 %s", bill.Quote.InputCount, count, r.Size)})
	return nil
}
