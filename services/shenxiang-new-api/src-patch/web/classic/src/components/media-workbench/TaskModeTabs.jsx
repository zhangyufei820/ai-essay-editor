import React from 'react';
import { IconImage, IconPlay } from '@douyinfe/semi-icons';
import './TaskModeTabs.css';

/**
 * 任务模式切换
 * 图片生成 / 视频生成
 * 保持原有切换逻辑
 */
export function TaskModeTabs({ mode, onChange }) {
  return (
    <div className="mp-task-mode-tabs" role="tablist" aria-label="生成类型">
      <button
        className={`mp-task-tab ${mode === 'image' ? 'active' : ''}`}
        onClick={() => onChange('image')}
        type="button"
        role="tab"
        aria-selected={mode === 'image'}
        data-xr-agent="media-mode-image"
      >
        <IconImage />
        <span>图像</span>
      </button>
      <button
        className={`mp-task-tab ${mode === 'video' ? 'active' : ''}`}
        onClick={() => onChange('video')}
        type="button"
        role="tab"
        aria-selected={mode === 'video'}
        data-xr-agent="media-mode-video"
      >
        <IconPlay />
        <span>视频</span>
      </button>
    </div>
  );
}
