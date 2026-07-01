package relay

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
)

const geek2APIImage2ModelName = "geek2api-image-2"

func sanitizeGeek2APIImage2OutboundBody(info *relaycommon.RelayInfo, body []byte) ([]byte, error) {
	if info == nil || strings.TrimSpace(info.OriginModelName) != geek2APIImage2ModelName {
		return body, nil
	}
	var payload map[string]interface{}
	if err := common.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	for _, key := range []string{
		"resolution",
		"image_size",
		"aspect_ratio",
		"responseFormat",
		"generationConfig",
		"extra_body",
		"group",
	} {
		delete(payload, key)
	}
	return common.Marshal(payload)
}
