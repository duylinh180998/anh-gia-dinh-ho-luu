import Gallery from '../components/Gallery';
import { useState, useCallback } from 'react';

export default function GalleryPage() {
    const [refreshKey, setRefreshKey] = useState(0);

    const handleRefresh = useCallback(() => {
        setRefreshKey((k) => k + 1);
    }, []);

    return (
        <div className="space-y-6">
            {/* Page heading */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-100">Thư viện ảnh</h2>
                </div>

                {/* Refresh button */}
                <button
                    onClick={handleRefresh}
                    title="Tải lại"
                    className="p-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                    </svg>
                </button>
            </div>

            <Gallery refreshKey={refreshKey} />
        </div>
    );
}
