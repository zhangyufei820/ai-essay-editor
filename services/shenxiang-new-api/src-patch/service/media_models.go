package service

const EcommerceBanana2Model = "ecommerce-banana-2"

func IsEcommerceBanana2Model(modelName string) bool {
	return modelName == EcommerceBanana2Model
}

func ShouldSkipUpstreamCostBillingForModel(modelName string) bool {
	return IsEcommerceBanana2Model(modelName)
}
