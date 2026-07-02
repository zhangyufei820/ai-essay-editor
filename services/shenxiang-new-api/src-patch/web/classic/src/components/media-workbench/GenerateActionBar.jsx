import React from 'react';
import { Button } from '@douyinfe/semi-ui';
import { IconImage, IconPlay } from '@douyinfe/semi-icons';
import './GenerateActionBar.css';

/**
 * 生成动作栏
 * 主要操作按钮，所有逻辑通过 props 传入
 */
export function GenerateActionBar({
  mode,
  imageWorkflow,
  videoWorkflow,
  onGenerate,
  disabled,
  loading,
  modelName,
  estimatedCost,
  outputSpec,
}) {
  const getButtonText = () => {
    if (mode === 'image') {
      return imageWorkflow === 'edit' ? '编辑图片' : '生成图片';
    }
    return '生成视频';
  };

  const buttonIcon = mode === 'image' ? <IconImage /> : <IconPlay />;

  return (
    <div className="mp-generate-action-bar">
      <div className="mp-generate-info">
        <div className="mp-generate-info-item">
          <span className="mp-info-label">当前模型</span>
          <span className="mp-info-value">{modelName}</span>
        </div>
        {outputSpec && (
          <div className="mp-generate-info-item">
            <span className="mp-info-label">输出规格</span>
            <span className="mp-info-value">{outputSpec}</span>
          </div>
        )}
        {estimatedCost && (
          <div className="mp-generate-info-item">
            <span className="mp-info-label">预计消耗</span>
            <span className="mp-info-value">{estimatedCost}</span>
          </div>
        )}
      </div>

      <Button
        theme="solid"
        type="primary"
        size="large"
        disabled={disabled}
        loading={loading}
        onClick={onGenerate}
        className="mp-generate-button"
        data-xr-agent="media-generate"
      >
        <span className="mp-generate-icon">{buttonIcon}</span>
        <span>{getButtonText()}</span>
      </Button>
    </div>
  );
}
