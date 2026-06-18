package service

import (
	"encoding/json"
	"os"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/gin-gonic/gin"
)

const (
	imageResolution2K = "2k"
	imageResolution4K = "4k"

	ContextKeyRelayImageRequest          = "relay_image_request"
	ContextKeyHighResolutionImageRouting = "high_resolution_image_routing"
)

func CaptureImageRequestForRouting(c *gin.Context, modelName string) error {
	if modelName != "gpt-image-2-4K" {
		return nil
	}
	var imageReq dto.ImageRequest
	if err := common.UnmarshalBodyReusable(c, &imageReq); err != nil {
		return err
	}
	c.Set(ContextKeyRelayImageRequest, &imageReq)
	return nil
}

func SetImageRequestForRouting(c *gin.Context, req *dto.ImageRequest) {
	if req != nil {
		c.Set(ContextKeyRelayImageRequest, req)
	}
}

func HighResolutionImageChannelSet(c *gin.Context, modelName string) map[int]struct{} {
	if modelName != "gpt-image-2-4K" {
		return nil
	}
	req, ok := c.Get(ContextKeyRelayImageRequest)
	if !ok {
		return nil
	}
	imageReq, ok := req.(*dto.ImageRequest)
	if !ok || imageReq == nil {
		return nil
	}

	resolution := requestedImageResolution(*imageReq)
	if resolution == "" {
		return nil
	}

	allowed := parseChannelIDSet(os.Getenv("GPT_IMAGE_2_4K_CHANNEL_IDS"))
	if len(allowed) == 0 {
		if resolution == imageResolution4K {
			allowed = parseChannelIDSet(os.Getenv("GPT_IMAGE_2_4K_4K_CHANNEL_IDS"))
		} else {
			allowed = parseChannelIDSet(os.Getenv("GPT_IMAGE_2_4K_2K_CHANNEL_IDS"))
		}
	}
	if len(allowed) == 0 {
		return nil
	}
	c.Set(ContextKeyHighResolutionImageRouting, resolution)
	return allowed
}

func requestedImageResolution(req dto.ImageRequest) string {
	if is4KSize(req.Size) {
		return imageResolution4K
	}
	if is2KSize(req.Size) {
		return imageResolution2K
	}
	switch strings.ToLower(strings.TrimSpace(req.Resolution)) {
	case "4k":
		return imageResolution4K
	case "2k":
		return imageResolution2K
	}

	type imageFormat struct {
		Image struct {
			ImageSize string `json:"imageSize"`
		} `json:"image"`
	}
	for _, raw := range []json.RawMessage{req.ResponseFormatObj, req.GenerationConfig} {
		if len(raw) == 0 {
			continue
		}
		var format imageFormat
		if err := json.Unmarshal(raw, &format); err == nil {
			switch strings.ToLower(strings.TrimSpace(format.Image.ImageSize)) {
			case "4k":
				return imageResolution4K
			case "2k":
				return imageResolution2K
			}
		}
		var wrapper struct {
			ResponseFormat imageFormat `json:"responseFormat"`
		}
		if err := json.Unmarshal(raw, &wrapper); err == nil {
			switch strings.ToLower(strings.TrimSpace(wrapper.ResponseFormat.Image.ImageSize)) {
			case "4k":
				return imageResolution4K
			case "2k":
				return imageResolution2K
			}
		}
	}
	return ""
}

func is2KSize(size string) bool {
	width, height, ok := parseImageSize(size)
	return ok && (width >= 2048 || height >= 2048)
}

func is4KSize(size string) bool {
	width, height, ok := parseImageSize(size)
	return ok && (width >= 3840 || height >= 3840)
}

func parseImageSize(size string) (int, int, bool) {
	parts := strings.Split(strings.ToLower(strings.TrimSpace(size)), "x")
	if len(parts) != 2 {
		return 0, 0, false
	}
	width, errW := strconv.Atoi(strings.TrimSpace(parts[0]))
	height, errH := strconv.Atoi(strings.TrimSpace(parts[1]))
	if errW != nil || errH != nil || width <= 0 || height <= 0 {
		return 0, 0, false
	}
	return width, height, true
}

func parseChannelIDSet(raw string) map[int]struct{} {
	result := make(map[int]struct{})
	for _, part := range strings.Split(raw, ",") {
		id, err := strconv.Atoi(strings.TrimSpace(part))
		if err != nil || id <= 0 {
			continue
		}
		result[id] = struct{}{}
	}
	return result
}
