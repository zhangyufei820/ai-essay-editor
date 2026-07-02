import React from 'react';
import { Empty } from '@douyinfe/semi-ui';
import { ResultCard } from './ResultCard';
import './ResultGallery.css';

/**
 * 结果画廊
 * 展示所有生成结果
 */
export function ResultGallery({
  results = [],
  onDownload,
  onCopy,
  onDelete,
  onContinueEdit,
  onUseAsReference,
  mediaType = 'image',
  emptyText = '暂无生成结果',
}) {
  if (results.length === 0) {
    return (
      <div className="mp-result-gallery-empty">
        <Empty
          image={<Empty.IllustrationNoContent />}
          description={emptyText}
        />
      </div>
    );
  }

  return (
    <div className="mp-result-gallery">
      <div className="mp-result-gallery-header">
        <h3 className="mp-section-title">生成结果</h3>
        <span className="mp-result-count">{results.length} 个</span>
      </div>
      <div className="mp-result-grid">
        {results.map((result, index) => (
          <ResultCard
            key={result.id || index}
            result={result}
            onDownload={onDownload}
            onCopy={onCopy}
            onDelete={onDelete}
            onContinueEdit={onContinueEdit}
            onUseAsReference={onUseAsReference}
            mediaType={mediaType}
          />
        ))}
      </div>
    </div>
  );
}
