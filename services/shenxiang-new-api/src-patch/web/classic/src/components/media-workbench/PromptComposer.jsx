import React, { useEffect, useState } from 'react';
import { Button, TextArea, Switch, Tooltip } from '@douyinfe/semi-ui';
import { IconCopy, IconDelete, IconRefresh } from '@douyinfe/semi-icons';
import './PromptComposer.css';

/**
 * Prompt 编辑器组件
 * 所有事件通过 props 传入，保持原有逻辑
 */
export function PromptComposer({
  prompt,
  onPromptChange,
  negativePrompt,
  onNegativePromptChange,
  negativePromptEnabled = false,
  onNegativePromptEnabledChange,
  negativePromptPreset = '',
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
  const [negativeExpanded, setNegativeExpanded] = useState(
    Boolean(negativePromptEnabled || negativePrompt),
  );
  const handleNegativeSwitch = (checked) => {
    onNegativePromptEnabledChange?.(checked);
    setNegativeExpanded(Boolean(checked));
  };

  useEffect(() => {
    if (!negativePromptEnabled) {
      setNegativeExpanded(false);
    }
  }, [negativePromptEnabled]);

  return (
    <div className="mp-prompt-composer">
      <div className="mp-prompt-header">
        <div>
          <h3 className="mp-section-title">
            Prompt 提示词
            <span className="mp-section-meta">Prompt</span>
          </h3>
        </div>
        <div className="mp-prompt-toolbar" aria-label="提示词工具">
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

      <div className="mp-prompt-input-container">
        <TextArea
          ref={promptTextareaRef}
          value={prompt}
          autosize={{ minRows: 8, maxRows: 14 }}
          onChange={onPromptChange}
          onClick={onPromptClick}
          onKeyUp={onPromptKeyUp}
          onKeyDown={onPromptKeyDown}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={onCompositionEnd}
          placeholder="输入你要生成的画面、镜头或修改要求。"
          className="mp-prompt-textarea"
          data-xr-agent="media-prompt"
        />
        {mentionMenu}
      </div>

      <div className={negativeExpanded ? 'mp-negative-prompt-field is-expanded' : 'mp-negative-prompt-field'}>
        <div className="mp-negative-toggle">
          <button
            type="button"
            className="mp-negative-toggle-main"
            onClick={() => setNegativeExpanded((value) => !value)}
            aria-expanded={negativeExpanded}
          >
            <span>负面提示词</span>
            <strong>{negativePromptEnabled ? '已开启' : '关闭'}</strong>
          </button>
          <Switch
            size="small"
            checked={negativePromptEnabled}
            onChange={handleNegativeSwitch}
            aria-label="启用负面提示词"
          />
        </div>
        {negativePromptEnabled && negativeExpanded ? (
          <TextArea
            value={negativePrompt}
            onChange={onNegativePromptChange}
            autosize={{ minRows: 2, maxRows: 5 }}
            placeholder={negativePromptPreset || '打开后自动填入通用图像/视频负面提示词，可继续编辑。'}
            className="mp-negative-prompt-input"
            data-xr-agent="media-negative-prompt"
          />
        ) : null}
      </div>
    </div>
  );
}
