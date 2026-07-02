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
}) {
  return (
    <div className="mp-right-status-panel">
      {/* 当前任务卡片 */}
      {currentTask && (
        <div className="mp-status-card">
          <h4 className="mp-status-card-title">当前任务</h4>
          <div className="mp-status-card-content">
            <div className="mp-task-status">
              <div className="mp-task-info">
                <Text strong>{currentTask.name}</Text>
                <Text type="tertiary" size="small">
                  {currentTask.model}
                </Text>
              </div>
              <Tag color={currentTask.status === 'running' ? 'blue' : 'grey'}>
                {currentTask.statusText || currentTask.status}
              </Tag>
            </div>
            {currentTask.progress !== undefined && (
              <div className="mp-task-progress">
                <Progress
                  percent={currentTask.progress}
                  showInfo
                  size="small"
                />
                {currentTask.remainingTime && (
                  <Text type="tertiary" size="small">
                    预计剩余 {currentTask.remainingTime}
                  </Text>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 资源使用卡片 */}
      {resourceUsage && (
        <div className="mp-status-card">
          <h4 className="mp-status-card-title">资源使用</h4>
          <div className="mp-status-card-content">
            <div className="mp-resource-item">
              <Text type="tertiary">本月已用</Text>
              <Progress
                percent={resourceUsage.usagePercent}
                showInfo={false}
                size="small"
                className="mp-resource-progress"
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

      {/* 任务队列卡片 */}
      {taskQueue && (
        <div className="mp-status-card">
          <h4 className="mp-status-card-title">任务队列</h4>
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
            </div>
          </div>
        </div>
      )}

      {/* 活动记录卡片 */}
      {activityLog && activityLog.length > 0 && (
        <div className="mp-status-card">
          <h4 className="mp-status-card-title">活动记录</h4>
          <div className="mp-status-card-content">
            <div className="mp-activity-list">
              {activityLog.slice(0, 5).map((activity, index) => (
                <div key={index} className="mp-activity-item">
                  <div className="mp-activity-icon">{activity.icon || '📝'}</div>
                  <div className="mp-activity-content">
                    <Text size="small">{activity.text}</Text>
                    <Text type="tertiary" size="small">{activity.time}</Text>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
