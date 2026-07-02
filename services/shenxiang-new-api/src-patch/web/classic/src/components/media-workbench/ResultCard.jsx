import React from 'react';
import { Button, Spin } from '@douyinfe/semi-ui';
import { IconDownload, IconCopy, IconDelete, IconRefresh } from '@douyinfe/semi-icons';
import './ResultCard.css';

/**
 * 单个结果卡片
 * 所有操作通过 props 传入
 */
export function ResultCard({
  result,
  onDownload,
  onCopy,
  onDelete,
  onContinueEdit,
  onUseAsReference,
  mediaType = 'image',
}) {
  const isVideo = mediaType === 'video';
  const isLoading = result.status === 'processing' || result.status === 'pending';
  const isError = result.status === 'error' || result.status === 'failed';

  return (
    <div className={`mp-result-card ${isError ? 'error' : ''}`}>
      <div className="mp-result-preview">
        {isLoading ? (
          <div className="mp-result-loading">
            <Spin size="large" />
            <span className="mp-loading-text">生成中...</span>
          </div>
        ) : isError ? (
          <div className="mp-result-error">
            <span className="mp-error-icon">⚠️</span>
            <span className="mp-error-text">生成失败</span>
          </div>
        ) : isVideo ? (
          <video
            src={result.url || result.displayUrl}
            controls
            className="mp-result-video"
            preload="metadata"
          />
        ) : (
          <img
            src={result.url || result.displayUrl || result.cachedUrl}
            alt="生成结果"
            className="mp-result-image"
            loading="lazy"
          />
        )}
      </div>

      {!isLoading && !isError && (
        <div className="mp-result-actions">
          <Button
            size="small"
            icon={<IconDownload />}
            onClick={() => onDownload(result)}
            theme="borderless"
          >
            下载
          </Button>
          <Button
            size="small"
            icon={<IconCopy />}
            onClick={() => onCopy(result)}
            theme="borderless"
          >
            复制
          </Button>
          {onContinueEdit && (
            <Button
              size="small"
              icon={<IconRefresh />}
              onClick={() => onContinueEdit(result)}
              theme="borderless"
            >
              继续编辑
            </Button>
          )}
          {onUseAsReference && (
            <Button
              size="small"
              onClick={() => onUseAsReference(result)}
              theme="borderless"
            >
              作为参考图
            </Button>
          )}
          <Button
            size="small"
            icon={<IconDelete />}
            onClick={() => onDelete(result)}
            theme="borderless"
            type="danger"
          >
            删除
          </Button>
        </div>
      )}

      {result.metadata && (
        <div className="mp-result-meta">
          {result.metadata.size && (
            <span className="mp-meta-item">{result.metadata.size}</span>
          )}
          {result.metadata.format && (
            <span className="mp-meta-item">{result.metadata.format}</span>
          )}
          {result.metadata.duration && (
            <span className="mp-meta-item">{result.metadata.duration}s</span>
          )}
        </div>
      )}
    </div>
  );
}
