import React from 'react';
import './MediaWorkbenchShell.css';

/**
 * 媒体工坊整体 Shell
 * 负责顶部、左侧、中间、右侧的统一布局容器
 * 不包含业务逻辑，只负责布局结构
 */
export function MediaWorkbenchShell({
  topBar,
  sidebar,
  workspace,
  rightPanel,
  className = '',
}) {
  return (
    <div className={`mp-workbench-shell ${className}`}>
      {topBar && <div className="mp-shell-top">{topBar}</div>}
      <div className="mp-shell-body">
        {sidebar && <aside className="mp-shell-sidebar">{sidebar}</aside>}
        <main className="mp-shell-workspace">{workspace}</main>
        {rightPanel && <aside className="mp-shell-right">{rightPanel}</aside>}
      </div>
    </div>
  );
}
