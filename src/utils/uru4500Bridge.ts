export type BiometricProvider = 'digitalpersona' | 'secugen' | 'unknown';

export interface BiometricDevice {
  sn: string;
  type: string;
  name?: string;
  provider?: BiometricProvider;
}

export interface BiometricCaptureResult {
  device: BiometricDevice | null;
  template: string;
  quality: number;
  provider: BiometricProvider;
}

const BRIDGE_URLS = ['ws://127.0.0.1:15896', 'ws://localhost:15896', 'wss://localhost:15896'];

export function captureBiometric(timeoutMs = 45000): Promise<BiometricCaptureResult> {
  return connectWithFallback(0, timeoutMs);
}

export function captureUru4500(timeoutMs = 45000): Promise<BiometricCaptureResult> {
  return captureBiometric(timeoutMs);
}

function connectWithFallback(index: number, timeoutMs: number): Promise<BiometricCaptureResult> {
  const url = BRIDGE_URLS[index];
  if (!url) {
    return Promise.reject(new Error('Biometric bridge is not running. Start the bridge or install the Startup launcher.'));
  }

  return captureFromUrl(url, timeoutMs).catch(error => {
    if (index + 1 < BRIDGE_URLS.length) {
      return connectWithFallback(index + 1, timeoutMs);
    }
    throw error;
  });
}

function captureFromUrl(url: string, timeoutMs: number): Promise<BiometricCaptureResult> {
  return new Promise((resolve, reject) => {
    let socket: WebSocket | null = null;
    let device: BiometricDevice | null = null;
    let captureStarted = false;
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try { socket?.close(); } catch {}
      fn();
    };

    const timer = window.setTimeout(() => {
      finish(() => reject(new Error('Fingerprint capture timed out. Keep the finger flat on the fingerprint sensor.')));
    }, timeoutMs);

    try {
      socket = new WebSocket(url);
    } catch (error) {
      finish(() => reject(error instanceof Error ? error : new Error(String(error))));
      return;
    }

    const startCapture = () => {
      if (captureStarted || !socket || socket.readyState !== WebSocket.OPEN) return;
      captureStarted = true;
      socket.send(JSON.stringify({
        action: 'StartCapture',
        format: 'DP_FMD_V20',
        quality: 70,
      }));
    };

    socket.onopen = () => {
      socket?.send(JSON.stringify({ action: 'GetDeviceList' }));
      window.setTimeout(startCapture, 250);
    };

    socket.onerror = () => {
      finish(() => reject(new Error(`Could not connect to biometric bridge at ${url}`)));
    };

    socket.onclose = () => {
      if (!settled) {
        finish(() => reject(new Error(`Biometric bridge connection closed before capture completed (${url})`)));
      }
    };

    socket.onmessage = event => {
      let msg: any;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }

      if (Array.isArray(msg.devices)) {
        const first = msg.devices[0];
        if (first) {
          device = {
            sn: first.sn || first.id || 'BIO-DEVICE',
            type: first.type || first.name || 'Fingerprint Reader',
            name: first.name,
            provider: first.provider || 'unknown',
          };
        }
        startCapture();
        return;
      }

      if (msg.status === 'Error' || msg.error) {
        finish(() => reject(new Error(String(msg.error || msg.message || 'Fingerprint capture failed'))));
        return;
      }

      const template = msg.template || msg.sample || msg.data;
      if (typeof template === 'string' && template.length > 0) {
        const quality = Math.round(Number(msg.quality || msg.qualityScore || 80));
        finish(() => resolve({ device, template, quality, provider: msg.provider || device?.provider || 'unknown' }));
      }
    };
  });
}
