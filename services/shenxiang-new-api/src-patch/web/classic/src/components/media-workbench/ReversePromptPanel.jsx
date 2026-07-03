import React from 'react';
import { Button, TextArea, Tag } from '@douyinfe/semi-ui';
import { IconEyeOpened, IconCopy, IconRefresh } from '@douyinfe/semi-icons';
import './ReversePromptPanel.css';

/**
 * 图像反推提示词面板
 * 所有逻辑和状态通过 props 传入
 */
export function ReversePromptPanel({
  file,
  onFileChange,
  reversePromptText,
  onReversePromptTextChange,
  isRunning,
  onStartReverse,
  onCopyResult,
  onApplyResult,
  message,
  disabled = false,
  modelName,
  imageWorkflow,
  fileDrop,
  modelSelector,
}) {
  return (
    <div className="mp-reverse-prompt-panel">
      <div className="mp-reverse-header">
        <div>
          <h3 className="mp-section-title">
            图像提示词反推
            <span className="mp-section-meta">{modelName}</span>
          </h3>
        </div>
        <Tag color="cyan">识图反推</Tag>
      </div>

      <div className="mp-reverse-body">
        {fileDrop ? (
          <div className="mp-reverse-upload-section">
            {fileDrop}
          </div>
        ) : null}

        <div className="mp-reverse-output-section">
          {modelSelector}
          <TextArea
            value={reversePromptText}
            autosize={{ minRows: 4, maxRows: 8 }}
            onChange={onReversePromptTextChange}
            disabled={imageWorkflow === 'generate'}
            placeholder={
              imageWorkflow === 'generate'
                ? '文生图模式下此框仅展示反推结果，请在上方"画面描述"输入提示词。'
                : '反推完成后，提示词会出现在这里，并自动写入上方画面描述。'
            }
            className="mp-reverse-textarea"
            aria-label="反推提示词"
          />

          <div className="mp-reverse-actions">
            <Button
              theme="solid"
              type="primary"
              icon={<IconEyeOpened />}
              loading={isRunning}
              disabled={!file || disabled}
              onClick={onStartReverse}
              data-xr-agent="media-reverse-prompt"
            >
              开始反推
            </Button>
            <Button
              icon={<IconCopy />}
              disabled={!reversePromptText.trim()}
              onClick={onCopyResult}
            >
              复制
            </Button>
            <Button
              icon={<IconRefresh />}
              disabled={!reversePromptText.trim()}
              onClick={onApplyResult}
            >
              套用
            </Button>
          </div>

          {message && (
            <div className="mp-reverse-message" role="status" aria-live="polite">
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
