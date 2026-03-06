import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import toast from 'react-hot-toast';
import { s3Client, BUCKET_NAME } from '../aws-config';

const ACCEPTED_TYPES = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/gif': ['.gif'],
    'image/webp': ['.webp'],
    'image/avif': ['.avif'],
};

function generateS3Key(file) {
    const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `2026/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${sanitized}`;
}

/**
 * ImageUploader — two-phase upload:
 *  Phase 1: Drop / select files  →  preview queue appears
 *  Phase 2: User clicks "Tải lên" → files are uploaded to S3
 */
export default function ImageUploader({ onUploadSuccess }) {
    // queue items: { id, file, previewUrl, status, error }
    const [queue, setQueue] = useState([]);
    const [isUploading, setIsUploading] = useState(false);

    // Revoke blob URLs when queue clears to avoid memory leaks
    useEffect(() => {
        return () => {
            queue.forEach((item) => URL.revokeObjectURL(item.previewUrl));
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const onDrop = useCallback((acceptedFiles) => {
        const newItems = acceptedFiles.map((file) => ({
            id: `${file.name}-${Date.now()}-${Math.random()}`,
            file,
            previewUrl: URL.createObjectURL(file),
            status: 'pending', // pending | uploading | done | error
            error: null,
        }));
        setQueue((prev) => [...prev, ...newItems]);
    }, []);

    const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
        onDrop,
        accept: ACCEPTED_TYPES,
        multiple: true,
    });

    /** Remove a single item from the pending queue (before upload) */
    const removeItem = useCallback((id) => {
        setQueue((prev) => {
            const item = prev.find((i) => i.id === id);
            if (item) URL.revokeObjectURL(item.previewUrl);
            return prev.filter((i) => i.id !== id);
        });
    }, []);

    /** Upload all pending items */
    const handleUpload = useCallback(async () => {
        const pending = queue.filter((i) => i.status === 'pending');
        if (pending.length === 0) return;

        setIsUploading(true);

        // Mark all pending as uploading
        setQueue((prev) =>
            prev.map((i) => (i.status === 'pending' ? { ...i, status: 'uploading' } : i))
        );

        let hasError = false;

        await Promise.all(
            pending.map(async (item) => {
                const key = generateS3Key(item.file);
                try {
                    // Convert File object to ArrayBuffer then Uint8Array to avoid AWS SDK v3 browser stream reading bugs
                    const arrayBuffer = await item.file.arrayBuffer();
                    const bodyData = new Uint8Array(arrayBuffer);

                    await s3Client.send(
                        new PutObjectCommand({
                            Bucket: BUCKET_NAME,
                            Key: key,
                            Body: bodyData,
                            ContentType: item.file.type,
                        })
                    );
                    setQueue((prev) =>
                        prev.map((i) => (i.id === item.id ? { ...i, status: 'done' } : i))
                    );
                } catch (err) {
                    hasError = true;
                    console.error('[ImageUploader] Upload error:', err);
                    setQueue((prev) =>
                        prev.map((i) =>
                            i.id === item.id ? { ...i, status: 'error', error: err.message } : i
                        )
                    );
                }
            })
        );

        setIsUploading(false);

        if (!hasError) {
            toast.success('Tải lên thành công!', { duration: 3000 });
            // Delay redirect so user can see the success checkmarks
            setTimeout(() => {
                onUploadSuccess();
            }, 1500);
        } else {
            toast.error('Có lỗi xảy ra khi tải ảnh lên!', { duration: 4000 });
            // Clean up successful ones after delay if there were errors, leaving the errors visible
            setTimeout(() => {
                setQueue((prev) => {
                    const done = prev.filter((i) => i.status === 'done');
                    done.forEach((i) => URL.revokeObjectURL(i.previewUrl));
                    return prev.filter((i) => i.status !== 'done');
                });
            }, 3000);
        }
    }, [queue, onUploadSuccess]);

    const pendingCount = queue.filter((i) => i.status === 'pending').length;
    const uploadingCount = queue.filter((i) => i.status === 'uploading').length;
    const hasQueue = queue.length > 0;

    return (
        <div className="w-full space-y-4">
            {/* ── Drop Zone ─────────────────────────────────────────────────── */}
            <div
                {...getRootProps()}
                className={`
          relative flex flex-col items-center justify-center
          w-full min-h-40 p-8 rounded-2xl border-2 border-dashed
          cursor-pointer transition-all duration-300 group
          ${isDragActive
                        ? 'border-violet-400 bg-violet-500/10 scale-[1.01] shadow-lg shadow-violet-500/20'
                        : 'border-white/20 bg-white/5 hover:border-violet-400/60 hover:bg-white/10'
                    }
        `}
            >
                <input {...getInputProps()} />

                <div
                    className={`
            w-14 h-14 mb-3 rounded-full flex items-center justify-center
            transition-all duration-300
            ${isDragActive ? 'bg-violet-500/30 scale-110' : 'bg-white/10 group-hover:bg-violet-500/20'}
          `}
                >
                    <svg
                        className={`w-7 h-7 transition-colors duration-300 ${isDragActive ? 'text-violet-300' : 'text-slate-400 group-hover:text-violet-400'}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
                    >
                        <path strokeLinecap="round" strokeLinejoin="round"
                            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                        />
                    </svg>
                </div>

                {isDragActive ? (
                    <p className="text-violet-300 font-semibold text-base animate-pulse">Thả ảnh vào đây…</p>
                ) : (
                    <>
                        <p className="text-slate-300 font-medium text-sm text-center">
                            Kéo thả ảnh hoặc{' '}
                            <span className="text-violet-400 underline underline-offset-2">chọn file</span>
                        </p>
                        <p className="text-slate-500 text-xs mt-1">JPG · PNG · GIF · WEBP · AVIF</p>
                    </>
                )}
            </div>

            {/* ── Rejected files warning ────────────────────────────────────── */}
            {fileRejections.length > 0 && (
                <div className="rounded-xl bg-red-900/30 border border-red-500/40 p-3 text-xs text-red-300">
                    <p className="font-semibold mb-1">⚠ File không hợp lệ:</p>
                    {fileRejections.map(({ file, errors }) => (
                        <p key={file.name} className="text-red-400">
                            {file.name} — {errors.map((e) => e.message).join(', ')}
                        </p>
                    ))}
                </div>
            )}

            {/* ── Selected file queue ───────────────────────────────────────── */}
            {hasQueue && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
                    {/* Queue header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                        <span className="text-slate-300 text-sm font-medium">
                            {pendingCount > 0
                                ? `${pendingCount} ảnh chờ tải lên`
                                : uploadingCount > 0
                                    ? `Đang tải lên ${uploadingCount} ảnh…`
                                    : 'Hoàn tất!'}
                        </span>

                        {/* Clear pending button */}
                        {pendingCount > 0 && !isUploading && (
                            <button
                                onClick={() =>
                                    setQueue((prev) => {
                                        prev.filter((i) => i.status === 'pending').forEach((i) =>
                                            URL.revokeObjectURL(i.previewUrl)
                                        );
                                        return prev.filter((i) => i.status !== 'pending');
                                    })
                                }
                                className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                            >
                                Xóa tất cả
                            </button>
                        )}
                    </div>

                    {/* File list */}
                    <ul className="divide-y divide-white/5 max-h-64 overflow-y-auto">
                        {queue.map((item) => (
                            <QueueItem
                                key={item.id}
                                item={item}
                                onRemove={removeItem}
                                isUploading={isUploading}
                            />
                        ))}
                    </ul>

                    {/* Upload button */}
                    {pendingCount > 0 && (
                        <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between gap-3">
                            <p className="text-slate-500 text-xs">
                                Nhấn "Tải lên" để đẩy {pendingCount} ảnh lên S3
                            </p>
                            <button
                                onClick={handleUpload}
                                disabled={isUploading}
                                className="
                  flex items-center gap-2 px-5 py-2 rounded-xl
                  bg-gradient-to-r from-violet-600 to-violet-500
                  hover:from-violet-500 hover:to-violet-400
                  active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed
                  text-white text-sm font-semibold
                  shadow-lg shadow-violet-500/30
                  transition-all duration-150
                "
                            >
                                {isUploading ? (
                                    <>
                                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                                        </svg>
                                        Đang tải…
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                                            />
                                        </svg>
                                        Tải lên {pendingCount} ảnh
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/** Single queue item row */
function QueueItem({ item, onRemove, isUploading }) {
    const { id, file, previewUrl, status, error } = item;

    const statusConfig = {
        pending: { color: 'text-slate-400', badge: null },
        uploading: { color: 'text-violet-400', badge: <SpinnerIcon /> },
        done: { color: 'text-emerald-400', badge: <CheckIcon /> },
        error: { color: 'text-red-400', badge: <ErrorIcon /> },
    };

    const cfg = statusConfig[status] ?? statusConfig.pending;

    return (
        <li className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition-colors">
            {/* Thumbnail */}
            <img
                src={previewUrl}
                alt={file.name}
                className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-white/10"
            />

            {/* Info */}
            <div className="flex-1 min-w-0">
                <p className="text-slate-300 text-sm font-medium truncate">{file.name}</p>
                <p className={`text-xs ${cfg.color}`}>
                    {status === 'pending' && `${(file.size / 1024).toFixed(0)} KB · Chờ tải lên`}
                    {status === 'uploading' && 'Đang tải lên…'}
                    {status === 'done' && '✓ Hoàn tất'}
                    {status === 'error' && `✗ ${error}`}
                </p>
            </div>

            {/* Status icon or Remove button */}
            <div className="flex-shrink-0">
                {status === 'pending' && !isUploading ? (
                    <button
                        onClick={() => onRemove(id)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Xóa"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                ) : (
                    <span className={cfg.color}>{cfg.badge}</span>
                )}
            </div>
        </li>
    );
}

function SpinnerIcon() {
    return (
        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
    );
}

function CheckIcon() {
    return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
    );
}

function ErrorIcon() {
    return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
    );
}
