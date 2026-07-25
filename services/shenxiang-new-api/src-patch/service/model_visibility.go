package service

import "strings"

const (
	PublicDiscountImage2ModelName   = "特价 image-2"
	InternalDiscountImage2ModelName = "geek2api-image-2"
	FallbackDiscountImage2ModelName = "internal-image2-discount-v2"
	PublicStableImage2ModelName     = "官转image 2稳定"
	InternalStableImage2ModelName   = "internal-image2-stable-v1"
)

var supplierExposedModelNames = map[string]bool{
	InternalDiscountImage2ModelName: true,
	FallbackDiscountImage2ModelName: true,
	InternalStableImage2ModelName:   true,
}

var retiredImageModelNames = map[string]bool{}

var publicImageModelAliases = map[string]string{
	strings.ToLower(PublicDiscountImage2ModelName): InternalDiscountImage2ModelName,
	strings.ToLower(PublicStableImage2ModelName):   InternalStableImage2ModelName,
}

var internalImageModelAliases = map[string]string{
	strings.ToLower(InternalDiscountImage2ModelName): PublicDiscountImage2ModelName,
	strings.ToLower(InternalStableImage2ModelName):   PublicStableImage2ModelName,
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

func IsRetiredImageModelName(modelName string) bool {
	return retiredImageModelNames[strings.ToLower(strings.TrimSpace(modelName))]
}

func NormalizeImageGenerationModelName(modelName string) (normalized string, publicAlias string, changed bool) {
	trimmed := strings.TrimSpace(modelName)
	if strings.EqualFold(trimmed, "gpt-image-2") {
		return "gpt-image-2-4K", "", true
	}
	if internalModelName, ok := publicImageModelAliases[strings.ToLower(trimmed)]; ok {
		return internalModelName, trimmed, true
	}
	return trimmed, "", trimmed != modelName
}

func IsPublicImageModelAlias(modelName string) bool {
	_, ok := publicImageModelAliases[strings.ToLower(strings.TrimSpace(modelName))]
	return ok
}

func IsInternalImageModelAllowedByPublicAlias(internalModelName string, publicAlias string) bool {
	expectedInternalModel, ok := publicImageModelAliases[strings.ToLower(strings.TrimSpace(publicAlias))]
	return ok && strings.EqualFold(strings.TrimSpace(internalModelName), expectedInternalModel)
}

func PublicImageModelDisplayName(internalModelName string, publicAlias string) string {
	if alias := strings.TrimSpace(publicAlias); alias != "" {
		return alias
	}
	trimmed := strings.TrimSpace(internalModelName)
	if alias, ok := internalImageModelAliases[strings.ToLower(trimmed)]; ok {
		return alias
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
		IsSupplierExposedModelName(origin) || IsPublicImageModelAlias(origin) {
		return false
	}
	return !IsSupplierExposedModelName(upstream)
}
