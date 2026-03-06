import { useState, useEffect, useCallback, useRef } from 'react';
import { ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MasonryPhotoAlbum } from 'react-photo-album';
import 'react-photo-album/masonry.css';
import { s3Client, BUCKET_NAME } from '../aws-config';

// ─── Constants ────────────────────────────────────────────────────────────────
const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|avif)$/i;
const S3_PREFIX = '2026/';
const PAGE_SIZE = 20;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getImageDimensions(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve({ width: 4, height: 3 });
        img.src = src;
    });
}

async function fetchPage(continuationToken) {
    const command = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: S3_PREFIX,
        MaxKeys: PAGE_SIZE,
        ContinuationToken: continuationToken,
    });

    const response = await s3Client.send(command);
    const imageObjs = (response.Contents ?? []).filter((o) => IMAGE_EXTENSIONS.test(o.Key));

    const photos = await Promise.all(
        imageObjs.map(async (obj) => {
            const src = await getSignedUrl(
                s3Client,
                new GetObjectCommand({ Bucket: BUCKET_NAME, Key: obj.Key }),
                { expiresIn: 3600 }
            );
            const { width, height } = await getImageDimensions(src);
            return { src, key: obj.Key, width, height, alt: obj.Key.split('/').pop() };
        })
    );

    return {
        photos,
        nextToken: response.IsTruncated ? response.NextContinuationToken : null,
    };
}

// ─── Photo Extras (hover overlay rendered by react-photo-album v3) ────────────
// render.extras renders children with position:absolute inside each photo item
function PhotoExtras({ photo }) {
    return (
        <>
            {/* Dark gradient overlay */}
            <div className="rpa-overlay" />
            {/* Expand icon */}
            <div className="rpa-icon-wrap">
                <div className="rpa-icon">
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round"
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                    </svg>
                </div>
            </div>
            {/* Caption */}
            <div className="rpa-caption">
                <span className="rpa-caption-text">{photo.alt}</span>
            </div>
        </>
    );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
function SkeletonGrid() {
    const heights = [180, 240, 160, 220, 200, 190, 170, 250, 160, 210, 180, 200];
    return (
        <div style={{ columns: 4, gap: '10px' }}>
            {heights.map((h, i) => (
                <div
                    key={i}
                    style={{ height: h, display: 'block', width: '100%', marginBottom: 10, borderRadius: '0.75rem', overflow: 'hidden', background: 'rgba(255,255,255,0.05)', position: 'relative', breakInside: 'avoid' }}
                >
                    <div className="animate-shimmer" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)', animation: 'shimmer 1.5s infinite' }} />
                </div>
            ))}
        </div>
    );
}

// ─── Gallery ─────────────────────────────────────────────────────────────────
export default function Gallery({ refreshKey }) {
    const [photos, setPhotos] = useState([]);
    const [nextToken, setNextToken] = useState(undefined);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [lightboxIdx, setLightboxIdx] = useState(null);

    const sentinelRef = useRef(null);

    const loadPage = useCallback(async (token, isReset = false) => {
        setLoading(true);
        setError(null);
        try {
            const { photos: newPhotos, nextToken: nt } = await fetchPage(token);
            setPhotos((prev) => (isReset ? newPhotos : [...prev, ...newPhotos]));
            setNextToken(nt);
        } catch (err) {
            console.error('[Gallery] error:', err);
            setError(err.message || 'Không thể tải ảnh từ S3.');
        } finally {
            setLoading(false);
        }
    }, []);

    // Reset on refresh
    useEffect(() => {
        setPhotos([]);
        setNextToken(undefined);
        loadPage(undefined, true);
    }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // Infinite scroll sentinel
    useEffect(() => {
        const el = sentinelRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && !loading && nextToken) {
                    loadPage(nextToken);
                }
            },
            { rootMargin: '200px' }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [loading, nextToken, loadPage]);

    // ── Loading (first page) ────────────────────────────────────────────────
    if (nextToken === undefined && loading) {
        return (
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                    <div style={{ width: '1rem', height: '1rem', borderRadius: '50%', border: '2px solid #8b5cf6', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                    <span style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Đang tải thư viện ảnh…</span>
                </div>
                <SkeletonGrid />
            </div>
        );
    }

    // ── Error ───────────────────────────────────────────────────────────────
    if (error && photos.length === 0) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '5rem 0', textAlign: 'center' }}>
                <div style={{ width: '4rem', height: '4rem', borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                    <svg style={{ width: '2rem', height: '2rem', color: '#f87171' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                </div>
                <p style={{ color: '#fca5a5', fontWeight: 600, marginBottom: '0.25rem' }}>Không thể tải ảnh</p>
                <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem', maxWidth: '20rem' }}>{error}</p>
                <button
                    onClick={() => loadPage(undefined, true)}
                    style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', background: '#7c3aed', color: 'white', fontSize: '0.875rem', fontWeight: 500, border: 'none', cursor: 'pointer' }}
                >
                    Thử lại
                </button>
            </div>
        );
    }

    // ── Empty ───────────────────────────────────────────────────────────────
    if (photos.length === 0 && nextToken === null) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6rem 0', textAlign: 'center' }}>
                <div style={{ width: '5rem', height: '5rem', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem' }}>
                    <svg style={{ width: '2.5rem', height: '2.5rem', color: '#475569' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                            d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                    </svg>
                </div>
                <p style={{ color: '#94a3b8', fontWeight: 500 }}>Thư viện trống</p>
                <p style={{ color: '#475569', fontSize: '0.875rem', marginTop: '0.25rem' }}>Hãy tải lên ảnh đầu tiên!</p>
            </div>
        );
    }

    // ── Gallery ─────────────────────────────────────────────────────────────
    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <span style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
                    {photos.length} ảnh{nextToken ? ' · cuộn để xem thêm' : ' · Tất cả'}
                </span>
            </div>

            <MasonryPhotoAlbum
                photos={photos}
                columns={(w) => {
                    if (w < 400) return 1;
                    if (w < 640) return 2;
                    if (w < 1024) return 3;
                    return 4;
                }}
                spacing={10}
                onClick={({ index }) => setLightboxIdx(index)}
                render={{
                    extras: (_, { photo }) => <PhotoExtras photo={photo} />,
                }}
            />

            {/* Sentinel + status */}
            <div ref={sentinelRef} style={{ marginTop: '2.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                {loading && photos.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#94a3b8', fontSize: '0.875rem', padding: '1rem 0' }}>
                        <div style={{ width: '1rem', height: '1rem', borderRadius: '50%', border: '2px solid #8b5cf6', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                        Đang tải thêm ảnh…
                    </div>
                )}
                {nextToken === null && photos.length > 0 && (
                    <p style={{ color: '#475569', fontSize: '0.75rem', padding: '1rem 0' }}>✓ Đã hiển thị tất cả {photos.length} ảnh</p>
                )}
            </div>

            {/* Lightbox */}
            {lightboxIdx !== null && (
                <Lightbox
                    photos={photos}
                    index={lightboxIdx}
                    onClose={() => setLightboxIdx(null)}
                    onChange={setLightboxIdx}
                />
            )}
        </>
    );
}

// ─── Lightbox ────────────────────────────────────────────────────────────────
function Lightbox({ photos, index, onClose, onChange }) {
    const [zoom, setZoom] = useState(1);
    const [touchStartX, setTouchStartX] = useState(null);
    const [touchEndX, setTouchEndX] = useState(null);

    const photo = photos[index];

    const goPrev = useCallback(() => {
        setZoom(1);
        onChange((i) => (i > 0 ? i - 1 : photos.length - 1));
    }, [onChange, photos.length]);

    const goNext = useCallback(() => {
        setZoom(1);
        onChange((i) => (i < photos.length - 1 ? i + 1 : 0));
    }, [onChange, photos.length]);

    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowLeft') goPrev();
            if (e.key === 'ArrowRight') goNext();
            if (e.key === '+') setZoom((z) => Math.min(z + 0.25, 3));
            if (e.key === '-') setZoom((z) => Math.max(z - 0.25, 0.5));
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose, goPrev, goNext]);

    const onTouchStart = (e) => {
        setTouchEndX(null); // Reset when starting a new touch
        setTouchStartX(e.targetTouches[0].clientX);
    };

    const onTouchMove = (e) => {
        setTouchEndX(e.targetTouches[0].clientX);
    };

    const onTouchEnd = () => {
        if (!touchStartX || !touchEndX) return;
        const distance = touchStartX - touchEndX;
        const isLeftSwipe = distance > 50;
        const isRightSwipe = distance < -50;

        if (isLeftSwipe) {
            goNext();
        }
        if (isRightSwipe) {
            goPrev();
        }

        setTouchStartX(null);
        setTouchEndX(null);
    };

    if (!photo) return null;

    return (
        <div
            className="animate-fadeIn"
            style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.93)', backdropFilter: 'blur(16px)' }}
            onClick={onClose}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
        >
            {/* Top bar */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', zIndex: 20, background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)', pointerEvents: 'none' }}>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.875rem', fontWeight: 500, pointerEvents: 'auto' }}>
                    {index + 1} / {photos.length}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', pointerEvents: 'auto' }}>
                    <button onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.max(z - 0.25, 0.5)); }} style={btnStyle} title="Thu nhỏ (-)">
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
                    </button>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', width: '2.5rem', textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
                    <button onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.min(z + 0.25, 3)); }} style={btnStyle} title="Phóng to (+)">
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    </button>
                    <a href={photo.src} download target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={btnStyle} title="Tải xuống">
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
                    </a>
                    <button onClick={onClose} style={{ ...btnStyle, '--btn-hover-bg': 'rgba(239,68,68,0.5)' }} title="Đóng (ESC)">
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
            </div>

            {/* Clickable zones for Prev/Next for better UX */}
            <div
                className="absolute inset-y-0 left-0 w-1/6 md:w-32 z-10 flex items-center justify-start px-4 md:px-8 cursor-pointer group"
                onClick={(e) => { e.stopPropagation(); goPrev(); }}
                title="Ảnh trước (←)"
            >
                <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-black/20 group-hover:bg-black/60 flex items-center justify-center text-white/50 group-hover:text-white transition-all backdrop-blur-sm -translate-x-4 opacity-0 group-hover:translate-x-0 group-hover:opacity-100">
                    <svg className="w-8 h-8 md:w-10 md:h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </div>
            </div>

            {/* Image container */}
            <div className="relative flex items-center justify-center w-full h-full p-4 md:p-12 z-0">
                <div className="animate-scaleIn w-full h-full flex items-center justify-center">
                    <img
                        key={photo.src}
                        src={photo.src}
                        alt={photo.alt}
                        className="max-w-full max-h-full rounded-xl object-contain shadow-2xl cursor-default"
                        style={{ transform: `scale(${zoom})`, transition: 'transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94)' }}
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            </div>

            <div
                className="absolute inset-y-0 right-0 w-1/6 md:w-32 z-10 flex items-center justify-end px-4 md:px-8 cursor-pointer group"
                onClick={(e) => { e.stopPropagation(); goNext(); }}
                title="Ảnh tiếp (→)"
            >
                <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-black/20 group-hover:bg-black/60 flex items-center justify-center text-white/50 group-hover:text-white transition-all backdrop-blur-sm translate-x-4 opacity-0 group-hover:translate-x-0 group-hover:opacity-100">
                    <svg className="w-8 h-8 md:w-10 md:h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </div>
            </div>

            {/* Caption */}
            <div className="absolute bottom-0 inset-x-0 flex justify-center pb-6 md:pb-8 pt-16 z-20 pointer-events-none bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                <span className="text-white/80 text-sm md:text-base px-6 truncate max-w-2xl text-center drop-shadow-md">
                    {photo.alt}
                </span>
            </div>
        </div>
    );
}

// ─── Style helpers ────────────────────────────────────────────────────────────
const btnStyle = {
    width: '2.5rem',
    height: '2.5rem',
    borderRadius: '0.75rem',
    background: 'rgba(255,255,255,0.1)',
    backdropFilter: 'blur(8px)',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    transition: 'all 0.2s',
    textDecoration: 'none',
};
