import React from 'react';
import { Tag, Typography } from '@douyinfe/semi-ui';
import { IconImage } from '@douyinfe/semi-icons';
import './MediaTopBar.css';

const { Title, Paragraph } = Typography;

/**
 * 媒体工坊顶部栏
 * 显示标题、副标题、统计信息
 * 所有数据通过 props 传入
 */
export function MediaTopBar({
  title = '媒体创作工作台',
  subtitle = '任务、提示词、参数、生成和结果按同一条操作线排列。',
  stats = [],
}) {
  return (
    <div className="mp-top-bar">
      <div className="mp-top-bar-content">
        <div className="mp-top-bar-header">
          <Tag color="blue" prefixIcon={<IconImage />} className="mp-top-bar-kicker">
            星人媒体工坊
          </Tag>
          <Title heading={2} className="mp-top-bar-title">
            {title}
          </Title>
          <Paragraph className="mp-top-bar-subtitle">{subtitle}</Paragraph>
        </div>
        {stats.length > 0 && (
          <div className="mp-top-bar-stats">
            {stats.map((stat, index) => (
              <div key={index} className="mp-stat-pill">
                <span className="mp-stat-label">{stat.label}</span>
                <span className="mp-stat-value">{stat.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
