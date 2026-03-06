import { useNavigate } from 'react-router-dom';
import ImageUploader from '../components/ImageUploader';

export default function UploadPage() {
    const navigate = useNavigate();

    const handleUploadSuccess = () => {
        // After successful upload, navigate to gallery so user can see new photos
        navigate('/', { state: { refresh: true } });
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            {/* Page heading */}
            <div>
                <h2 className="text-2xl font-bold text-slate-100">Tải ảnh lên</h2>
                <p className="text-slate-500 text-sm mt-0.5">
                    Chọn ảnh, xem trước, rồi nhấn "Tải lên" để lưu vào AWS S3
                </p>
            </div>

            {/* Uploader card */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
                <ImageUploader onUploadSuccess={handleUploadSuccess} />
            </div>

            {/* Info tips */}
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-2">
                <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide">Lưu ý</p>
                <ul className="space-y-1.5 text-slate-500 text-sm">
                    <li className="flex items-start gap-2">
                        <span className="text-violet-500 mt-0.5">•</span>
                        Định dạng hỗ trợ: <span className="text-slate-400">JPG, PNG, GIF, WEBP, AVIF</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-violet-500 mt-0.5">•</span>
                        Có thể chọn nhiều ảnh cùng lúc và tải lên song song
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-violet-500 mt-0.5">•</span>
                        Sau khi tải lên xong, bạn sẽ được chuyển về thư viện tự động
                    </li>
                </ul>
            </div>
        </div>
    );
}
