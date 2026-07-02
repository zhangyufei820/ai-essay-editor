import React from 'react';
import { Button, TextArea, Input, Space, Tooltip, Typography } from '@douyinfe/semi-ui';
import { IconCopy, IconDelete, IconRefresh } from '@douyinfe/semi-icons';
import './PromptComposer.css';

const { Text } = Typography;

/**
 * Prompt 编辑器组件
 * 所有事件通过 props 传入，保持原有逻辑
 */
export function PromptComposer({
  prompt,
  onPromptChange,
  negativePrompt,
  onNegativePromptChange,
  presets = [],
  activePreset,
  onPresetClick,
  onCopy,
  onClear,
  promptTextareaRef,
  onPromptClick,
  onPromptKeyUp,
  onPromptKeyDown,
  onCompositionStart,
  onCompositionEnd,
  mentionMenu,
  onReverseClick,
}) {
  const promptLength = String(prompt || '').trim().length;
  const assistantPreset = presets[0];

  return (
    <div className="mp-prompt-composer">
      <div className="mp-prompt-header">
        <div>
          <h3 className="mp-section-title">
            Prompt 提示词
            <span className="mp-section-meta">Prompt</span>
          </h3>
          <Text type="tertiary">主体、镜头、光线、风格、用途。</Text>
        </div>
        <div className="mp-prompt-toolbar" aria-label="提示词工具">
          {assistantPreset ? (
            <Tooltip content="套用推荐提示词模板">
              <Button
                size="small"
                theme="borderless"
                icon={<IconRefresh />}
                onClick={() => onPresetClick(assistantPreset.value)}
              >
                推荐模板
              </Button>
            </Tooltip>
          ) : null}
          {onReverseClick ? (
            <Tooltip content="跳转到图像反推面板">
              <Button
                size="small"
                theme="borderless"
                icon={<IconRefresh />}
                onClick={onReverseClick}
              >
                反推提示词
              </Button>
            </Tooltip>
          ) : null}
          <Tooltip content="复制提示词">
            <Button
              size="small"
              theme="borderless"
              icon={<IconCopy />}
              disabled={!prompt.trim()}
              onClick={onCopy}
            />
          </Tooltip>
          <Tooltip content="清空提示词">
            <Button
              size="small"
              theme="borderless"
              icon={<IconDelete />}
              disabled={!prompt}
              onClick={onClear}
            />
          </Tooltip>
          <span className="mp-prompt-counter">{promptLength} 字</span>
        </div>
      </div>

      {presets.length > 0 ? (
        <Space spacing={8} wrap className="mp-prompt-presets">
          {presets.map((preset) => (
            <Button
              key={preset.label}
              size="small"
              theme={activePreset === preset.label ? 'solid' : 'light'}
              type={activePreset === preset.label ? 'primary' : 'tertiary'}
              onClick={() => onPresetClick(preset.value)}
            >
              {preset.label}
            </Button>
          ))}
        </Space>
      ) : null}

      <div className="mp-prompt-input-container">
        <TextArea
          ref={promptTextareaRef}
          value={prompt}
          autosize={{ minRows: 6, maxRows: 12 }}
          onChange={onPromptChange}
          onClick={onPromptClick}
          onKeyUp={onPromptKeyUp}
          onKeyDown={onPromptKeyDown}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={onCompositionEnd}
          placeholder="例如：一张高级商业海报，主体清晰，真实光影，适合品牌宣传。"
          className="mp-prompt-textarea"
          data-xr-agent="media-prompt"
        />
        {mentionMenu}
      </div>

      <label className="mp-negative-prompt-field">
        <span>负面提示词</span>
        <Input
          value={negativePrompt}
          onChange={onNegativePromptChange}
          placeholder="不想出现的内容：低清晰度、畸形手指、文字错误、过曝等"
          className="mp-negative-prompt-input"
          data-xr-agent="media-negative-prompt"
        />
      </label>
    </div>
  );
}
