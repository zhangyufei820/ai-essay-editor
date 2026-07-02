import React from 'react';
import { Progress, Tag, Typography } from '@douyinfe/semi-ui';
import './RightStatusPanel.css';

const { Text } = Typography;

/**
 * 右侧状态面板
 * 显示当前任务、资源使用、任务队列等
 */
export function RightStatusPanel({
  currentTask,
  resourceUsage,
  taskQueue,
  activityLog,
  summary = [],
}) {
  const statusColor = currentTask?.status === 'running' || currentTask?.status === 'polling'
    ? 'blue'
    : currentTask?.status === 'failed'
      ? 'red'
      : currentTask?.status === 'completed'
        ? 'green'
        : 'grey';
  const hasProgress = typeof currentTask?.progress === 'number';

  return (
    <div className="mp-right-status-panel">
      {currentTask && (
        <div className="mp-status-card mp-current-task-card">
          <div className="mp-status-card-head">
            <h4 className="mp-status-card-title">当前任务</h4>
            <Tag color={statusColor}>
              {currentTask.statusText || currentTask.status}
            </Tag>
          </div>
          <div className="mp-status-card-content">
            <div className="mp-task-status">
              <div className="mp-task-info">
                <Text strong>{currentTask.name}</Text>
                <Text type="tertiary" size="small">
                  {currentTask.model}
                </Text>
              </div>
            </div>
            <div className={hasProgress ? 'mp-task-progress' : 'mp-task-progress is-pending'}>
              {hasProgress ? (
                <Progress
                  percent={currentTask.progress}
                  showInfo={false}
                  size="small"
                  className="mp-status-progress"
                />
              ) : null}
              <div className="mp-task-progress-meta">
                <Text type="tertiary" size="small">
                  {currentTask.remainingTime || '等待提交后显示进度'}
                </Text>
                {currentTask.taskId ? (
                  <Text type="tertiary" size="small">
                    ID {currentTask.taskId}
                  </Text>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {resourceUsage && (
        <div className="mp-status-card">
          <div className="mp-status-card-head">
            <h4 className="mp-status-card-title">资源使用</h4>
            <span className="mp-status-link">{resourceUsage.period || '本次'}</span>
          </div>
          <div className="mp-status-card-content">
            <div className="mp-resource-item">
              <Text type="tertiary">{resourceUsage.label || '本次作品'}</Text>
              <Progress
                percent={resourceUsage.usagePercent}
                showInfo={false}
                size="small"
                className="mp-status-progress mp-resource-progress"
              />
              <div className="mp-resource-stats">
                <Text strong>{resourceUsage.used}</Text>
                <Text type="tertiary">/ {resourceUsage.total}</Text>
              </div>
            </div>
            {resourceUsage.balance !== undefined && (
              <div className="mp-resource-item">
                <Text type="tertiary">账户余额</Text>
                <Text strong className="mp-balance-value">
                  ¥ {resourceUsage.balance}
                </Text>
              </div>
            )}
          </div>
        </div>
      )}

      {taskQueue && (
        <div className="mp-status-card">
          <div className="mp-status-card-head">
            <h4 className="mp-status-card-title">任务队列</h4>
          </div>
          <div className="mp-status-card-content">
            <div className="mp-queue-stats">
              <div className="mp-queue-stat-item">
                <span className="mp-queue-count">{taskQueue.running || 0}</span>
                <Text type="tertiary" size="small">运行中</Text>
              </div>
              <div className="mp-queue-stat-item">
                <span className="mp-queue-count">{taskQueue.pending || 0}</span>
                <Text type="tertiary" size="small">排队中</Text>
              </div>
              <div className="mp-queue-stat-item">
                <span className="mp-queue-count">{taskQueue.completed || 0}</span>
                <Text type="tertiary" size="small">已完成</Text>
              </div>
              <div className="mp-queue-stat-item">
                <span className="mp-queue-count">{taskQueue.failed || 0}</span>
                <Text type="tertiary" size="small">失败</Text>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mp-status-card">
        <div className="mp-status-card-head">
          <h4 className="mp-status-card-title">活动记录</h4>
          <span className="mp-status-link">最新</span>
        </div>
        <div className="mp-status-card-content">
          {activityLog && activityLog.length > 0 ? (
            <div className="mp-activity-list">
              {activityLog.slice(0, 5).map((activity, index) => (
                <div key={index} className="mp-activity-item">
                  <div className="mp-activity-icon">{activity.icon || '记'}</div>
                  <div className="mp-activity-content">
                    <Text size="small">{activity.text}</Text>
                    <Text type="tertiary" size="small">{activity.time}</Text>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mp-activity-empty">
              <Text type="tertiary" size="small">生成完成后会记录在这里。</Text>
            </div>
          )}
        </div>
      </div>

      {summary.length > 0 && (
        <div className="mp-status-card">
          <div className="mp-status-card-head">
            <h4 className="mp-status-card-title">本次任务摘要</h4>
          </div>
          <div className="mp-status-card-content">
            <div className="mp-summary-list">
              {summary.map((item) => (
                <div key={item.label} className="mp-summary-item">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
