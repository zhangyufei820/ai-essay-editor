import React, { useEffect, useState } from 'react';
import { Button, Upload, Spin, Progress } from '@douyinfe/semi-ui';
import { IconDelete, IconUpload, IconImage, IconVideo } from '@douyinfe/semi-icons';
import './MediaUploadPanel.css';

function MediaPreview({ file, type, index }) {
  const [source, setSource] = useState('');

  useEffect(() => {
    if (typeof file === 'string') {
      setSource(file);
      return undefined;
    }
    if (file?.preview) {
      setSource(file.preview);
      return undefined;
    }
    if (typeof File === 'undefined' || !(file instanceof File)) {
      setSource('');
      return undefined;
    }

    const previewUrl = URL.createObjectURL(file);
    setSource(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [file]);

  if (type === 'video') {
    return (
      <video
        src={source}
        className='mp-upload-video'
        preload='metadata'
      />
    );
  }
  return (
    <img
      src={source}
      alt={`预览 ${index + 1}`}
      className='mp-upload-image'
      onError={(event) => {
        event.currentTarget.style.display = 'none';
      }}
    />
  );
}

/**
 * 统一的媒体上传面板
 * 支持图片、视频、音频上传
 * 所有逻辑通过 props 传入，保持原有业务逻辑
 */
export function MediaUploadPanel({
  type = 'image', // 'image' | 'video' | 'audio' | 'mixed'
  files = [],
  maxFiles = 10,
  accept = '',
  onFiles, // 原 MultiFileDrop 使用 onFiles
  onFilesChange, // 新接口使用 onFilesChange
  onRemove,
  disabled = false,
  hint = '',
  label = '上传文件',
  uploading = false,
  progress = 0,
}) {
  const handleFileInput = (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length > 0) {
      // 兼容原 onFiles 和新 onFilesChange
      if (onFiles) {
        onFiles(selectedFiles);
      } else if (onFilesChange) {
        onFilesChange(selectedFiles);
      }
    }
  };

  const handleRemove = (index) => {
    onRemove(index);
  };

  const isImage = type === 'image';
  const isVideo = type === 'video';
  const isMixed = type === 'mixed';
  const isEmpty = files.length === 0;
  const isFull = files.length >= maxFiles;

  return (
    <div className="mp-upload-panel">
      {label && <div className="mp-upload-label">{label}</div>}

      <div className="mp-upload-grid">
        {files.map((file, index) => (
          <div key={index} className="mp-upload-item">
            <div className="mp-upload-preview">
              {(isImage || isMixed) && (
                <MediaPreview file={file} type='image' index={index} />
              )}
              {isVideo && (
                <MediaPreview file={file} type='video' index={index} />
              )}
              {!isImage && !isVideo && !isMixed && (
                <div className="mp-upload-audio">
                  <IconVideo size="large" />
                  <span className="mp-upload-filename">
                    {file.name || '音频文件'}
                  </span>
                </div>
              )}
            </div>
            <button
              type="button"
              className="mp-upload-remove"
              onClick={() => handleRemove(index)}
              disabled={disabled}
              aria-label="删除文件"
            >
              <IconDelete />
            </button>
            {uploading && index === files.length - 1 && (
              <div className="mp-upload-progress">
                <Progress percent={progress} showInfo={false} size="small" />
              </div>
            )}
          </div>
        ))}

        {!isFull && (
          <label className={`mp-upload-add ${disabled ? 'disabled' : ''}`}>
            <input
              type="file"
              accept={accept}
              multiple={maxFiles > 1}
              onChange={handleFileInput}
              disabled={disabled || uploading}
              className="mp-upload-input"
            />
            <div className="mp-upload-add-content">
              <IconUpload size="large" />
              <span className="mp-upload-add-text">
                {isEmpty ? '点击上传' : '继续添加'}
              </span>
            </div>
          </label>
        )}
      </div>

      {hint && (
        <div className="mp-upload-hint">
          {hint}
          {` (${files.length} / ${maxFiles})`}
        </div>
      )}
    </div>
  );
}
