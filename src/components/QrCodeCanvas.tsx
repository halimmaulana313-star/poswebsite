import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Download } from 'lucide-react';

interface QrCodeCanvasProps {
  value: string;
  size?: number;
  downloadName?: string;
  showDownload?: boolean;
  caption?: string;
}

export const QrCodeCanvas: React.FC<QrCodeCanvasProps> = ({
  value,
  size = 200,
  downloadName = 'qr-code.png',
  showDownload = false,
  caption,
}) => {
  const [dataUrl, setDataUrl] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let mounted = true;
    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 2,
      color: {
        dark: '#111827',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (mounted) {
          setDataUrl(url);
          setError('');
        }
      })
      .catch(() => {
        if (mounted) setError('Gagal merender QR Code');
      });

    return () => {
      mounted = false;
    };
  }, [value, size]);

  const handleDownload = async () => {
    try {
      const hiResUrl = await QRCode.toDataURL(value, {
        width: 800,
        margin: 3,
        color: {
          dark: '#111827',
          light: '#FFFFFF',
        },
        errorCorrectionLevel: 'H',
      });
      const link = document.createElement('a');
      link.href = hiResUrl;
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      // Fallback handled silently
    }
  };

  if (error) {
    return (
      <div
        className="flex items-center justify-center bg-zinc-100 border border-zinc-200 rounded-lg text-xs text-zinc-500 p-4"
        style={{ width: size, height: size }}
      >
        {error}
      </div>
    );
  }

  return (
    <div className="inline-flex flex-col items-center gap-2">
      <div className="bg-white border border-zinc-200 rounded-xl p-3">
        {dataUrl ? (
          <img
            src={dataUrl}
            alt={caption || 'QR Barcode Pelanggan'}
            width={size}
            height={size}
            className="block rounded-md"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            className="bg-zinc-100 animate-pulse rounded-md"
            style={{ width: size, height: size }}
          />
        )}
      </div>
      {caption && <p className="text-xs text-zinc-500 font-mono text-center max-w-[220px] truncate">{caption}</p>}
      {showDownload && dataUrl && (
        <button
          type="button"
          onClick={handleDownload}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5" />
          Unduh QR PNG
        </button>
      )}
    </div>
  );
};
