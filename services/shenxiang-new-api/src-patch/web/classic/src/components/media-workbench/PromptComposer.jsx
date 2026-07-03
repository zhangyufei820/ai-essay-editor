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
  const promptValue = String(prompt || '');
  const [negativeExpanded, setNegativeExpanded] = useState(false);
  const promptStructures = [
    {
      key: 'frame',
      label: '结构骨架',
      text: '主体：\n场景：\n光线：\n镜头：\n风格：\n用途：',
    },
    {
      key: 'poster',
      label: '商业海报',
      text: '主体：\n产品/人物：\n核心卖点：\n场景氛围：\n光线与色彩：\n构图与留白：\n用途：商业海报',
    },
    {
      key: 'product',
      label: '产品摄影',
      text: '主体：产品特写\n材质细节：\n背景：\n光线：柔和棚拍光\n镜头：近景，清晰边缘\n风格：高级产品摄影',
    },
    {
      key: 'video-shot',
      label: '视频镜头',
      text: '主体：\n动作：\n场景：\n镜头运动：\n光线：\n节奏：\n画幅用途：',
    },
  ];
  const promptAtoms = [
    { key: 'subject', label: '主体', hint: '谁或什么是主角', text: '主体：' },
    { key: 'scene', label: '场景', hint: '地点、时代、环境', text: '场景：' },
    { key: 'light', label: '光线', hint: '自然光、棚拍、夜景', text: '光线：' },
    { key: 'camera', label: '镜头', hint: '角度、景别、运动', text: '镜头：' },
    { key: 'style', label: '风格', hint: '质感、艺术方向', text: '风格：' },
    { key: 'usage', label: '用途', hint: '海报、商品图、短片', text: '用途：' },
  ];
  const handleNegativeSwitch = (checked) => {
    onNegativePromptEnabledChange?.(checked);
    setNegativeExpanded(Boolean(checked));
  };
  const applyPromptStructure = (text) => {
    const nextPrompt = promptValue.trim() ? `${promptValue}\n\n${text}` : text;
    onPromptChange?.(nextPrompt);
  };
  const insertPromptAtom = (text) => {
    const prefix = promptValue.trim() ? '\n' : '';
    onPromptChange?.(`${promptValue}${prefix}${text}`);
  };
  const openPromptAssistant = () => {
    window.dispatchEvent(new CustomEvent('aiphui:open-api-teacher'));
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
          <p className="mp-prompt-guide">
            把创意拆成一张可执行的画面：先写主体，再补场景、光线、镜头、风格和用途。
          </p>
        </div>
        <div className="mp-prompt-toolbar" aria-label="提示词工具">
          <div className="mp-prompt-primary-tools">
            <Tooltip content="打开 API 老师，协助整理提示词和页面操作">
              <Button
                size="small"
                theme="borderless"
                className="mp-btn-secondary is-strong"
                onClick={openPromptAssistant}
              >
                提示词助手
              </Button>
            </Tooltip>
            {onReverseClick ? (
              <Tooltip content="跳转到图像反推面板">
                <Button
                  size="small"
                  theme="borderless"
                  icon={<IconRefresh />}
                  className="mp-btn-secondary"
                  onClick={onReverseClick}
                >
                  反推填入
                </Button>
              </Tooltip>
            ) : null}
          </div>
          <div className="mp-prompt-utility-tools">
            <Tooltip content="复制提示词">
              <Button
                size="small"
                theme="borderless"
                className="mp-btn-tool"
                icon={<IconCopy />}
                disabled={!promptValue.trim()}
                onClick={onCopy}
              >
                复制
              </Button>
            </Tooltip>
            <Tooltip content="清空提示词">
              <Button
                size="small"
                theme="borderless"
                icon={<IconDelete />}
                className="mp-btn-danger"
                disabled={!promptValue}
                onClick={onClear}
              >
                清空
              </Button>
            </Tooltip>
            <span className="mp-prompt-counter">{promptLength} / 2000</span>
          </div>
        </div>
      </div>

      <div className="mp-prompt-writing-rail" aria-label="提示词写作顺序">
        <div className="mp-prompt-rail-head">
          <span>写作顺序</span>
          <em>点击任一节点插入结构片段</em>
        </div>
        <div className="mp-prompt-atom-rail">
          {promptAtoms.map((item, index) => (
            <button
              key={item.key}
              type="button"
              className="mp-prompt-atom-chip"
              onClick={() => insertPromptAtom(item.text)}
            >
              <span>{index + 1}</span>
              <strong>{item.label}</strong>
              <small>{item.hint}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="mp-prompt-structure-row" aria-label="提示词结构模板">
        <span>结构模板</span>
        <div className="mp-prompt-template-group">
          <div className="mp-prompt-template-presets">
            {promptStructures.map((item) => (
              <button
                key={item.key}
                type="button"
                className="mp-prompt-structure-chip"
                onClick={() => applyPromptStructure(item.text)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mp-prompt-creative-grid">
        <div className="mp-prompt-editor-shell">
          <div className="mp-prompt-editor-topline">
            <span>创意画布</span>
            <em>{promptValue.trim() ? '继续补足画面细节' : '从主体开始写，避免只写风格词'}</em>
          </div>
          <div className="mp-prompt-input-container">
            <TextArea
              ref={promptTextareaRef}
              value={prompt}
              autosize={{ minRows: 7, maxRows: 12 }}
              onChange={onPromptChange}
              onClick={onPromptClick}
              onKeyUp={onPromptKeyUp}
              onKeyDown={onPromptKeyDown}
              onCompositionStart={onCompositionStart}
              onCompositionEnd={onCompositionEnd}
              placeholder="例如：主体是一位穿墨绿色丝绒西装的老师，站在雨后玻璃教室里，柔和侧逆光，35mm 电影镜头，高级教育品牌海报，留出标题空间。"
              className="mp-prompt-textarea"
              data-xr-agent="media-prompt"
            />
            {mentionMenu}
          </div>
        </div>
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
