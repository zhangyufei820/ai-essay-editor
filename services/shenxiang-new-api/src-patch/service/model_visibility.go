package service

import "strings"

var supplierExposedModelNames = map[string]bool{
	"geek2api-image-2": true,
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
