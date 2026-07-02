import React, { useState } from 'react';
import { Button, Modal, Tag, Input } from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';
import './ModelSelector.css';

/**
 * 模型选择器组件
 * 显示当前模型卡片 + 模型切换功能
 * 所有模型数据和选择逻辑通过 props 传入
 */
export function ModelSelector({
  models = [],
  selectedModel,
  onSelectModel,
  mode = 'image',
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const currentModel = models.find(m => m.value === selectedModel) || models[0];

  const filteredModels = models.filter(model =>
    model.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    model.vendor?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectModel = (modelValue) => {
    onSelectModel(modelValue);
    setIsModalOpen(false);
    setSearchQuery('');
  };

  return (
    <>
      <div className="mp-model-selector">
        <div className="mp-current-model-card">
          <div className="mp-current-model-header">
            <div className="mp-current-model-info">
              <h4 className="mp-current-model-name">{currentModel.label}</h4>
              <span className="mp-current-model-vendor">{currentModel.vendor}</span>
            </div>
            {currentModel.badge && (
              <Tag color="blue" size="small">{currentModel.badge}</Tag>
            )}
          </div>

          <div className="mp-current-model-meta">
            {currentModel.priceLabel && (
              <span className="mp-meta-tag">{currentModel.priceLabel}</span>
            )}
            {currentModel.billingLabel && (
              <span className="mp-meta-tag">{currentModel.billingLabel}</span>
            )}
            {currentModel.sizes?.length && (
              <span className="mp-meta-tag">{currentModel.sizes.length} 规格</span>
            )}
          </div>

          {currentModel.hint && (
            <p className="mp-current-model-hint">{currentModel.hint}</p>
          )}

          <Button
            block
            theme="borderless"
            onClick={() => setIsModalOpen(true)}
            className="mp-change-model-btn"
          >
            更换模型
          </Button>
        </div>
      </div>

      <Modal
        title={`选择${mode === 'image' ? '图像' : '视频'}模型`}
        visible={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          setSearchQuery('');
        }}
        footer={null}
        width={720}
        className="mp-model-selector-modal"
      >
        <Input
          prefix={<IconSearch />}
          placeholder="搜索模型名称或提供商..."
          value={searchQuery}
          onChange={setSearchQuery}
          className="mp-model-search"
        />

        <div className="mp-model-list">
          {filteredModels.map((model) => (
            <button
              key={model.value}
              type="button"
              className={`mp-model-option ${selectedModel === model.value ? 'active' : ''}`}
              onClick={() => handleSelectModel(model.value)}
            >
              <div className="mp-model-option-header">
                <div>
                  <div className="mp-model-option-name">{model.label}</div>
                  <div className="mp-model-option-vendor">{model.vendor}</div>
                </div>
                {model.badge && <Tag color="cyan" size="small">{model.badge}</Tag>}
              </div>

              <div className="mp-model-option-meta">
                {model.priceLabel && (
                  <span className="mp-model-option-tag">{model.priceLabel}</span>
                )}
                {model.supportsFace === true && (
                  <span className="mp-model-option-tag">可过人脸</span>
                )}
                {model.supportsFace === false && (
                  <span className="mp-model-option-tag">不能过人脸</span>
                )}
                {model.maxCount && (
                  <span className="mp-model-option-tag">最多 {model.maxCount} 张</span>
                )}
              </div>

              {model.hint && (
                <p className="mp-model-option-hint">{model.hint}</p>
              )}
            </button>
          ))}
        </div>

        {filteredModels.length === 0 && (
          <div className="mp-model-empty">
            没有找到匹配的模型
          </div>
        )}
      </Modal>
    </>
  );
}
