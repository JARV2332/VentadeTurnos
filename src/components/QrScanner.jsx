import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const SCANNER_ID = 'qr-reader-entrega';

export default function QrScanner({ onScan, active = true }) {
  const scannerRef = useRef(null);
  const onScanRef = useRef(onScan);
  const [error, setError] = useState('');
  const [camOk, setCamOk] = useState(false);

  onScanRef.current = onScan;

  useEffect(() => {
    if (!active) return undefined;

    const scanner = new Html5Qrcode(SCANNER_ID);
    scannerRef.current = scanner;
    let mounted = true;

    Html5Qrcode.getCameras()
      .then((cameras) => {
        if (!mounted || !cameras?.length) {
          setError('No se detectó cámara. Use el código manual abajo.');
          return;
        }
        const camId = cameras[cameras.length - 1].id;
        scanner
          .start(
            camId,
            { fps: 8, qrbox: { width: 220, height: 220 } },
            (decoded) => onScanRef.current(decoded),
            () => {}
          )
          .then(() => { if (mounted) setCamOk(true); })
          .catch(() => setError('No se pudo iniciar la cámara. Ingrese el código manualmente.'));
      })
      .catch(() => setError('Permiso de cámara denegado. Ingrese el código manualmente.'));

    return () => {
      mounted = false;
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
      scannerRef.current = null;
    };
  }, [active]);

  return (
    <div className="qr-scanner">
      <div id={SCANNER_ID} className="qr-scanner__viewport" />
      {camOk && <p className="qr-scanner__hint">Apunte al código QR de la boleta</p>}
      {error && <p className="qr-scanner__error">{error}</p>}
    </div>
  );
}
