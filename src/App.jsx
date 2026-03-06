import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import GalleryPage from './pages/GalleryPage';
import UploadPage from './pages/UploadPage';

/* ─── Nav link style helper ─────────────────────────────────────────────── */
const navLinkClass = ({ isActive }) =>
  [
    'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150',
    isActive
      ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/30'
      : 'text-slate-400 hover:text-white hover:bg-white/10',
  ].join(' ');

/* ─── Scroll to top on route change ─────────────────────────────────────── */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

/* ─── Main shell ─────────────────────────────────────────────────────────── */
function Shell() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 text-white">
      <ScrollToTop />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1e293b',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: '16px 24px',
            fontSize: '1.05rem',
            maxWidth: '400px',
          },
          success: {
            iconTheme: {
              primary: '#a78bfa',
              secondary: '#1e293b',
            },
          },
        }}
      />

      {/* ── Header / Nav ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">

          {/* Brand */}
          <NavLink to="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div>
              <p className="text-base font-bold leading-none tracking-tight bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                Ảnh Gia Đình
              </p>
              <p className="text-xs text-slate-500 leading-none mt-0.5">Powered by Linh</p>
            </div>
          </NavLink>

          {/* Navigation */}
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={navLinkClass}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              Thư viện
            </NavLink>

            <NavLink to="/upload" className={navLinkClass}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
              Tải lên
            </NavLink>
          </nav>
        </div>
      </header>

      {/* ── Page content ─────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Routes>
          <Route path="/" element={<GalleryPage />} />
          <Route path="/upload" element={<UploadPage />} />
        </Routes>
      </main>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-6 mt-12">
        <p className="text-center text-slate-600 text-xs">
          Ảnh Gia Đình — lưu trữ bởi AWS S3
        </p>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Shell />
    </BrowserRouter>
  );
}
