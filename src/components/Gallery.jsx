import { useState, useEffect, useCallback, useRef } from 'react';
import { ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MasonryPhotoAlbum } from 'react-photo-album';
import 'react-photo-album/masonry.css';
import { s3Client, BUCKET_NAME } from '../aws-config';
import { toThumbKey, toImageStem, stemFromThumbKey } from '../utils/images';

// ─── Constants ────────────────────────────────────────────────────────────────
const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|avif)$/i;
const S3_PREFIX = '2026/';
const THUMB_PREFIX = 'thumbs/2026/';
const PAGE_SIZE = 20;
/** Placeholder aspect ratio until real size is known from img onLoad. */
const DEFAULT_WIDTH = 4;
const DEFAULT_HEIGHT = 3;
/** First N grid images load eagerly for faster LCP. */
const EAGER_COUNT = 6;

async function signGet(key) {
    return getSignedUrl(
        s3Client,
        new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }),
        { expiresIn: 3600 }
    );
}

/** Cached set of image stems that have a thumb on S3 (avoids 404 img requests). */
let thumbStemCache = null;

export function invalidateThumbCache() {
    thumbStemCache = null;
}

async function getExistingThumbStems() {
    if (thumbStemCache) return thumbStemCache;
    const stems = new Set();
    let token;
    do {
        const res = await s3Client.send(
            new ListObjectsV2Command({
                Bucket: BUCKET_NAME,
                Prefix: THUMB_PREFIX,
                ContinuationToken: token,
            })
        );
        for (const obj of res.Contents ?? []) {
            stems.add(stemFromThumbKey(obj.Key));
        }
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    thumbStemCache = stems;
    return stems;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function fetchPage(continuationToken) {
    const [response, thumbStems] = await Promise.all([
        s3Client.send(
            new ListObjectsV2Command({
                Bucket: BUCKET_NAME,
                Prefix: S3_PREFIX,
                MaxKeys: PAGE_SIZE,
                ContinuationToken: continuationToken,
            })
        ),
        getExistingThumbStems(),
    ]);

    const imageObjs = (response.Contents ?? []).filter((o) => IMAGE_EXTENSIONS.test(o.Key));

    // Only request thumb URLs that actually exist — missing thumbs caused Network (failed)
    const photos = await Promise.all(
        imageObjs.map(async (obj) => {
            const fullSrc = await signGet(obj.Key);
            const hasThumb = thumbStems.has(toImageStem(obj.Key));
            const src = hasThumb ? await signGet(toThumbKey(obj.Key)) : fullSrc;
            return {
                src,
                fullSrc,
                hasThumb,
                key: obj.Key,
                width: DEFAULT_WIDTH,
                height: DEFAULT_HEIGHT,
                sized: false,
                alt: obj.Key.split('/').pop(),
            };
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
    const pendingSizesRef = useRef(new Map());
    const flushRafRef = useRef(null);

    const updatePhotoSize = useCallback((key, width, height) => {
        if (!width || !height) return;
        pendingSizesRef.current.set(key, { width, height });
        if (flushRafRef.current != null) return;
        flushRafRef.current = requestAnimationFrame(() => {
            flushRafRef.current = null;
            const updates = pendingSizesRef.current;
            pendingSizesRef.current = new Map();
            setPhotos((prev) => {
                let changed = false;
                const next = prev.map((photo) => {
                    const u = updates.get(photo.key);
                    if (!u) return photo;
                    const ratioDelta = Math.abs(photo.width / photo.height - u.width / u.height);
                    if (photo.sized && ratioDelta < 0.02) return photo;
                    changed = true;
                    if (!photo.sized && ratioDelta < 0.02) {
                        return { ...photo, sized: true };
                    }
                    return { ...photo, width: u.width, height: u.height, sized: true };
                });
                return changed ? next : prev;
            });
        });
    }, []);

    useEffect(() => {
        return () => {
            if (flushRafRef.current != null) cancelAnimationFrame(flushRafRef.current);
        };
    }, []);

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
        invalidateThumbCache();
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
                componentsProps={{
                    image: { loading: 'lazy', decoding: 'async' },
                }}
                render={{
                    image: (props, { photo, index }) => (
                        <img
                            {...props}
                            loading={index < EAGER_COUNT ? 'eager' : 'lazy'}
                            fetchPriority={index < EAGER_COUNT ? 'high' : 'auto'}
                            decoding="async"
                            className={`${props.className ?? ''} rpa-lazy-img${photo.sized ? ' is-loaded' : ''}`}
                            onLoad={(e) => {
                                updatePhotoSize(
                                    photo.key,
                                    e.currentTarget.naturalWidth,
                                    e.currentTarget.naturalHeight
                                );
                                e.currentTarget.classList.add('is-loaded');
                            }}
                            onError={(e) => {
                                // Safety net if a thumb was deleted after listing
                                if (photo.hasThumb && photo.fullSrc && e.currentTarget.src !== photo.fullSrc) {
                                    e.currentTarget.src = photo.fullSrc;
                                }
                            }}
                        />
                    ),
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
    const [fullReady, setFullReady] = useState(false);

    const photo = photos[index];
    const fullUrl = photo?.fullSrc || photo?.src;
    const thumbUrl = photo?.src;

    const goPrev = useCallback(() => {
        setZoom(1);
        onChange((i) => (i > 0 ? i - 1 : photos.length - 1));
    }, [onChange, photos.length]);

    const goNext = useCallback(() => {
        setZoom(1);
        onChange((i) => (i < photos.length - 1 ? i + 1 : 0));
    }, [onChange, photos.length]);

    useEffect(() => {
        setFullReady(false);
    }, [photo?.key]);

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

    // Prefetch neighbors so swipe/next feels instant
    useEffect(() => {
        const prefetch = (i) => {
            const p = photos[i];
            const url = p?.fullSrc || p?.src;
            if (!url) return;
            const img = new Image();
            img.src = url;
        };
        if (photos.length < 2) return;
        prefetch((index + 1) % photos.length);
        prefetch((index - 1 + photos.length) % photos.length);
    }, [index, photos]);

    const onTouchStart = (e) => {
        setTouchEndX(null);
        setTouchStartX(e.targetTouches[0].clientX);
    };

    const onTouchMove = (e) => {
        setTouchEndX(e.targetTouches[0].clientX);
    };

    const onTouchEnd = () => {
        if (!touchStartX || !touchEndX) return;
        const distance = touchStartX - touchEndX;
        if (distance > 50) goNext();
        if (distance < -50) goPrev();
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
                    {!fullReady && (
                        <span style={{ marginLeft: '0.75rem', color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem' }}>
                            Đang tải ảnh gốc…
                        </span>
                    )}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', pointerEvents: 'auto' }}>
                    <button onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.max(z - 0.25, 0.5)); }} style={btnStyle} title="Thu nhỏ (-)">
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
                    </button>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', width: '2.5rem', textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
                    <button onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.min(z + 0.25, 3)); }} style={btnStyle} title="Phóng to (+)">
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    </button>
                    <a href={fullUrl} download target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={btnStyle} title="Tải xuống">
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
                    </a>
                    <button onClick={onClose} style={{ ...btnStyle, '--btn-hover-bg': 'rgba(239,68,68,0.5)' }} title="Đóng (ESC)">
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
            </div>

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

            {/* Progressive: thumb first (cached), then fade in optimized full */}
            <div className="relative flex items-center justify-center w-full h-full p-4 md:p-12 z-0">
                <div
                    className="animate-scaleIn relative w-full h-full flex items-center justify-center"
                    style={{ transform: `scale(${zoom})`, transition: 'transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94)' }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <img
                        key={`thumb-${photo.key}`}
                        src={thumbUrl}
                        alt=""
                        aria-hidden
                        className="absolute max-w-full max-h-full rounded-xl object-contain"
                        style={{
                            filter: fullReady ? 'none' : 'blur(8px)',
                            transform: fullReady ? 'none' : 'scale(1.04)',
                            opacity: fullReady ? 0 : 1,
                            transition: 'opacity 0.35s ease, filter 0.35s ease',
                        }}
                    />
                    <img
                        key={`full-${photo.key}`}
                        src={fullUrl}
                        alt={photo.alt}
                        className="relative max-w-full max-h-full rounded-xl object-contain shadow-2xl cursor-default"
                        style={{
                            opacity: fullReady ? 1 : 0,
                            transition: 'opacity 0.35s ease',
                        }}
                        onLoad={() => setFullReady(true)}
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
