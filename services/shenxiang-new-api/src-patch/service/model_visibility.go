package service

import "strings"

const (
	PublicDiscountImage2ModelName   = "特价 image-2"
	InternalDiscountImage2ModelName = "geek2api-image-2"
)

var supplierExposedModelNames = map[string]bool{
	InternalDiscountImage2ModelName: true,
}

var supplierExposedModelMarkers = []string{
	"ccapi",
	"drag tokens",
	"dragtokens",
	"geek2api",
	"moonapix",
	"relay dance",
	"relaydance",
}

func IsSupplierExposedModelName(modelName string) bool {
	normalized := strings.ToLower(strings.TrimSpace(modelName))
	if normalized == "" {
		return false
	}
	if supplierExposedModelNames[normalized] {
		return true
	}
	for _, marker := range supplierExposedModelMarkers {
		if strings.Contains(normalized, marker) {
			return true
		}
	}
	return false
}

func NormalizeImageGenerationModelName(modelName string) (normalized string, publicAlias string, changed bool) {
	trimmed := strings.TrimSpace(modelName)
	if strings.EqualFold(trimmed, "gpt-image-2") {
		return "gpt-image-2-4K", "", true
	}
	if strings.EqualFold(trimmed, PublicDiscountImage2ModelName) {
		return InternalDiscountImage2ModelName, PublicDiscountImage2ModelName, true
	}
	return trimmed, "", trimmed != modelName
}

func IsPublicImageModelAlias(modelName string) bool {
	return strings.EqualFold(strings.TrimSpace(modelName), PublicDiscountImage2ModelName)
}

func IsInternalImageModelAllowedByPublicAlias(internalModelName string, publicAlias string) bool {
	return strings.EqualFold(strings.TrimSpace(internalModelName), InternalDiscountImage2ModelName) &&
		IsPublicImageModelAlias(publicAlias)
}

func PublicImageModelDisplayName(internalModelName string, publicAlias string) string {
	if alias := strings.TrimSpace(publicAlias); alias != "" {
		return alias
	}
	trimmed := strings.TrimSpace(internalModelName)
	if strings.EqualFold(trimmed, InternalDiscountImage2ModelName) {
		return PublicDiscountImage2ModelName
	}
	return trimmed
}

func ShouldRecordModelMapping(originModelName string, upstreamModelName string, publicAlias string) bool {
	origin := strings.TrimSpace(originModelName)
	upstream := strings.TrimSpace(upstreamModelName)
	if upstream == "" || strings.EqualFold(upstream, origin) {
		return false
	}
	if IsInternalImageModelAllowedByPublicAlias(origin, publicAlias) ||
		strings.EqualFold(origin, InternalDiscountImage2ModelName) ||
		IsPublicImageModelAlias(origin) {
		return false
	}
	return !IsSupplierExposedModelName(upstream)
}
