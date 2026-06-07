'use client';

import React, { useRef, useState, useCallback } from 'react';
import styles from './FileDropzone.module.css';

interface FileDropzoneProps {
  onFileSelect?: (file: File) => void;
  onUploadStart?: () => void;
  onUploadComplete?: (result: { success: boolean; fileId?: string; fileName?: string; size?: number; error?: string }) => void;
  maxSize?: number;
  acceptedTypes?: string[];
}

export const FileDropzone: React.FC<FileDropzoneProps> = ({
  onFileSelect,
  onUploadStart,
  onUploadComplete,
  maxSize = 100 * 1024 * 1024, // 100MB for testing
  acceptedTypes = ['.pdf', '.txt', '.doc', '.docx', '.json', '.png', '.jpg', '.jpeg', '.md'],
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: number } | null>(null);

  const validateFile = (file: File): { valid: boolean; error?: string } => {
    console.log('[FileDropzone] validateFile called:', { name: file.name, size: file.size, type: file.type });

    if (file.size > maxSize) {
      const msg = `File size exceeds ${maxSize / 1024 / 1024}MB limit`;
      console.log('[FileDropzone] validation failed - size:', msg);
      return { valid: false, error: msg };
    }

    const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!acceptedTypes.includes(fileExt)) {
      const msg = `File type not supported. Accepted: ${acceptedTypes.join(', ')}`;
      console.log('[FileDropzone] validation failed - type:', msg);
      return { valid: false, error: msg };
    }

    console.log('[FileDropzone] validation passed');
    return { valid: true };
  };

  const uploadFile = useCallback(async (file: File) => {
    console.log('[FileDropzone] uploadFile called:', { name: file.name, size: file.size, type: file.type });

    const validation = validateFile(file);
    console.log('[FileDropzone] validation result:', validation);

    if (!validation.valid) {
      console.error('[FileDropzone] validation failed, aborting upload');
      setError(validation.error || 'Invalid file');
      onUploadComplete?.({ success: false, error: validation.error });
      return;
    }

    console.log('[FileDropzone] validation passed, starting upload');
    setError(null);
    setIsUploading(true);
    setUploadProgress(10); // Start at 10%
    onUploadStart?.();
    onFileSelect?.(file);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setUploadProgress((p) => (p < 90 ? p + Math.random() * 20 : p));
    }, 200);

    try {
      console.log('[FileDropzone] creating FormData');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileName', file.name);

      console.log('[FileDropzone] calling fetch to /api/console/upload');
      const response = await fetch('/api/console/upload', {
        method: 'POST',
        body: formData,
      });

      console.log('[FileDropzone] fetch response received:', { status: response.status, ok: response.ok });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Upload failed' }));
        const errorMsg = errorData.message || `Upload failed with status ${response.status}`;
        console.error('[FileDropzone] response not ok:', errorMsg);
        throw new Error(errorMsg);
      }

      const data = await response.json();
      console.log('[FileDropzone] response data:', data);

      setUploadProgress(100);
      setUploadedFile({ name: data.fileName, size: data.size });

      console.log('[FileDropzone] upload successful:', { fileId: data.fileId, fileName: data.fileName });

      onUploadComplete?.({
        success: true,
        fileId: data.fileId,
        fileName: data.fileName,
        size: data.size,
      });

      // Clear success state after 2 seconds
      setTimeout(() => {
        setUploadProgress(0);
        setUploadedFile(null);
      }, 2000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Upload failed';
      console.error('[FileDropzone] upload error:', errorMsg, err);
      setError(errorMsg);
      onUploadComplete?.({ success: false, error: errorMsg });
    } finally {
      clearInterval(progressInterval);
      setIsUploading(false);
    }
  }, [maxSize, acceptedTypes, onFileSelect, onUploadStart, onUploadComplete]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    console.log('[FileDropzone] dragover event');
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    console.log('[FileDropzone] dragleave event');
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    console.log('[FileDropzone] drop event');
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    console.log('[FileDropzone] drop files count:', files.length);

    if (files.length > 0) {
      console.log('[FileDropzone] processing first file:', files[0].name);
      uploadFile(files[0]);
    }
  }, [uploadFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('[FileDropzone] file input change event');
    const file = e.target.files?.[0];
    console.log('[FileDropzone] selected file:', file?.name);

    if (file) {
      uploadFile(file);
    }
  };

  const handleClick = () => {
    console.log('[FileDropzone] click event - opening file picker');
    fileInputRef.current?.click();
  };

  return (
    <div className={styles.container}>
      <div
        className={`${styles.dropzone} ${isDragging ? styles.dragging : ''} ${isUploading ? styles.uploading : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleClick();
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          disabled={isUploading}
          accept={acceptedTypes.join(',')}
          className={styles.hiddenInput}
          aria-label="Upload file"
        />

        {isUploading ? (
          <div className={styles.uploadingContent}>
            <div className={styles.spinner} />
            <p className={styles.uploadingText}>Uploading... {Math.round(uploadProgress)}%</p>
          </div>
        ) : uploadedFile ? (
          <div className={styles.successContent}>
            <svg className={styles.checkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <p className={styles.successText}>{uploadedFile.name}</p>
            <p className={styles.sizeText}>({(uploadedFile.size / 1024).toFixed(1)} KB)</p>
          </div>
        ) : (
          <div className={styles.defaultContent}>
            <svg className={styles.uploadIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p className={styles.mainText}>Drag and drop your file here</p>
            <p className={styles.subText}>or click to browse</p>
            <p className={styles.formatText}>Supported: {acceptedTypes.join(', ')}</p>
          </div>
        )}
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {uploadProgress > 0 && uploadProgress < 100 && (
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${uploadProgress}%` }} />
        </div>
      )}
    </div>
  );
};
