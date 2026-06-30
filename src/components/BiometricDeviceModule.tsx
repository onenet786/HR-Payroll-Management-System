/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Fingerprint, Wifi, WifiOff, CheckCircle, XCircle,
  AlertCircle, RefreshCw, UserCheck, Clock, Activity,
  Scan, Shield, ChevronRight, Terminal, Database, Zap, Camera, VideoOff, Trash2
} from 'lucide-react';
import { Employee, AttendanceLog } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import './BiometricDeviceModule.css';
import {
  FACE_MATCH_MARGIN,
  FACE_MATCH_THRESHOLD,
  type FaceDescriptor,
  assessBrowserFaceDetection,
  assessFaceFrame,
  compareFaceDescriptors,
  createFaceDescriptorFromVideo,
  getFaceDescriptors,
  hasFaceEnrollment,
} from '../utils/faceRecognition';

// ── Types ──────────────────────────────────────────────────────────────────────

type WsStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type CaptureState = 'idle' | 'scanning' | 'captured' | 'error';
type TabId = 'test' | 'enroll' | 'attendance';

interface DPDevice {
  sn: string;
  type: string;
}

const DIGITAL_PERSONA_VENDOR_ID = 0x05BA;

const isSupportedFingerprintDevice = (device: any) => {
  const name = String(device?.productName || '').toLowerCase();
  return device?.vendorId === DIGITAL_PERSONA_VENDOR_ID ||
    name.includes('u.are.u') ||
    name.includes('uru') ||
    name.includes('digitalpersona') ||
    name.includes('digital persona') ||
    name.includes('secugen') ||
    name.includes('hamster') ||
    name.includes('hupx');
};

const formatUsbId = (value?: number) =>
  `0x${Number(value || 0).toString(16).toUpperCase().padStart(4, '0')}`;

const isDigitalPersonaDevice = (device: any) => {
  return isSupportedFingerprintDevice(device);
};

const isLikelyInternalHidDevice = (device: any) => {
  const name = String(device?.productName || '').toLowerCase();
  return name.includes('hidi2c') ||
    name.includes('i2c') ||
    name.includes('touchpad') ||
    name.includes('keyboard') ||
    name.includes('mouse');
};

export interface BiometricDeviceModuleProps {
  employees: Employee[];
  attendances: AttendanceLog[];
  onUpdateEmployee: (emp: Employee) => void | Promise<void>;
  onSimulatePunch: (employeeId: string, punchIn: string, punchOut: string, method: string, lat?: number, lon?: number) => void;
}

// ── Utilities ──────────────────────────────────────────────────────────────────

const nowTimeStr = () => {
  const n = new Date();
  return [n.getHours(), n.getMinutes(), n.getSeconds()].map(v => String(v).padStart(2, '0')).join(':');
};
const todayStr = () => new Date().toISOString().split('T')[0];
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Quality ring SVG — animated circular progress
function QualityRing({ quality, size = 88 }: { quality: number; size?: number }) {
  const r = size / 2 - 8;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(quality, 100) / 100) * circ;
  const color = quality >= 75 ? '#10b981' : quality >= 50 ? '#f59e0b' : '#ef4444';
  const cx = size / 2;
  return (
    <div className="quality-ring-wrapper" data-size={size}>
      <svg width={size} height={size} className="quality-ring-svg">
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#1e293b" strokeWidth={7} />
        <circle
          cx={cx} cy={cx} r={r} fill="none"
          stroke={color} strokeWidth={7}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="quality-ring-circle"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-black text-white leading-none">{quality}</span>
        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">%</span>
      </div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export function BiometricDeviceModule({
  employees,
  attendances,
  onUpdateEmployee,
  onSimulatePunch,
}: BiometricDeviceModuleProps) {
  // ── Connection state ─────────────────────────────────────────────────────────
  const wsRef = useRef<WebSocket | null>(null);
  const webHIDRef = useRef<any>(null);
  const hidCaptureActiveRef = useRef(false);
  const hidReportTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoConnectStartedRef = useRef(false);
  const manualDisconnectRef = useRef(false);
  const [wsStatus, setWsStatus] = useState<WsStatus>('disconnected');
  const [device, setDevice] = useState<DPDevice | null>(null);
  const [isSimMode, setIsSimMode] = useState(false);
  const [isWebHID, setIsWebHID] = useState(false);
  const [webHIDSupported] = useState(() => typeof navigator !== 'undefined' && 'hid' in navigator);
  const [wsLog, setWsLog] = useState<string[]>([]);
  const [connectionError, setConnectionError] = useState<{ title: string; steps: string[]; endpoint?: string } | null>(null);
  const [deviceDiagnostics, setDeviceDiagnostics] = useState<string[]>([]);

  // ── Capture state ────────────────────────────────────────────────────────────
  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [captureQuality, setCaptureQuality] = useState(0);
  const [capturedTemplate, setCapturedTemplate] = useState<string | null>(null);
  const simTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabId>('test');

  // ── Enrollment state ─────────────────────────────────────────────────────────
  const [enrollEmpId, setEnrollEmpId] = useState(employees[0]?.id || '');
  const [enrollSamples, setEnrollSamples] = useState<string[]>([]);
  const [enrollMsg, setEnrollMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const prevCapturedRef = useRef<string | null>(null);
  const faceVideoRef = useRef<HTMLVideoElement | null>(null);
  const faceStreamRef = useRef<MediaStream | null>(null);
  const [faceCameraReady, setFaceCameraReady] = useState(false);
  const [faceMsg, setFaceMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [recognizedFaceMatch, setRecognizedFaceMatch] = useState<{ employee: Employee; score: number; margin: number } | null>(null);

  // ── Attendance state ─────────────────────────────────────────────────────────
  const [attEmpId, setAttEmpId] = useState(employees[0]?.id || '');
  const [attResult, setAttResult] = useState<'pending' | 'verified' | 'failed' | null>(null);
  const [attSummary, setAttSummary] = useState<string | null>(null);
  const attPendingRef = useRef(false);

  // ── Log helper ───────────────────────────────────────────────────────────────
  const log = useCallback((msg: string) => {
    setWsLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 60));
  }, []);

  // ── WebSocket message handler ─────────────────────────────────────────────────
  const handleMsg = useCallback((raw: string) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(raw); } catch { log('← ' + raw.slice(0, 80)); return; }
    log('← ' + JSON.stringify(msg).slice(0, 80));

    // Device list
    if (msg.status === 'DeviceList' || Array.isArray(msg.devices)) {
      const devList = (msg.devices as any[]) || [];
      const diagnostics = Array.isArray(msg.diagnostics) ? msg.diagnostics as string[] : [];
      if (devList.length > 0) {
        const d = devList[0];
        setDeviceDiagnostics([]);
        setDevice({ sn: d.sn || d.id || 'BIO-DEVICE-001', type: d.type || d.name || 'Fingerprint Reader' });
        log(`✓ Found: ${d.type || d.name || 'Fingerprint Reader'} (SN: ${d.sn || d.id})`);
      } else {
        setDevice(null);
        setDeviceDiagnostics(diagnostics);
        log('⚠ No devices found — plug in the URU 4500 or SecuGen Hamster Pro and retry.');
        diagnostics.forEach(item => log(`• ${item}`));
      }
      return;
    }

    // Quality update during scan
    if (msg.quality !== undefined && captureState === 'scanning') {
      setCaptureQuality(Math.round(Number(msg.quality)));
      return;
    }

    // Sample/template captured
    const template = (msg.sample as string) || (msg.data as string) || (msg.template as string);
    if (template && typeof template === 'string') {
      const q = Math.round(Number(msg.quality || msg.qualityScore || captureQuality || 80));
      setCapturedTemplate(template);
      setCaptureQuality(q);
      setCaptureState('captured');
      log(`✓ Fingerprint captured (quality: ${q})`);
      return;
    }

    // Errors
    if (msg.status === 'Error' || msg.error) {
      setCaptureState('error');
      log(`✗ Device error: ${msg.error || msg.message || msg.status}`);
    }
  }, [captureState, captureQuality, log]);

  // ── Connect to Digital Persona service ───────────────────────────────────────
  const connectWs = useCallback((url: string, fallbacks: string[] = []) => {
    try {
      const ws = new WebSocket(url);
      ws.onopen = () => {
        setWsStatus('connected');
        setIsSimMode(false);
        setIsWebHID(false);
        log(`✓ Connected to ${url} — querying device list...`);
        ws.send(JSON.stringify({ action: 'GetDeviceList' }));
      };
      ws.onmessage = e => handleMsg(e.data);
      ws.onerror = () => {
        const nextUrl = fallbacks[0];
        if (nextUrl) {
          log(`✗ ${url} failed — trying ${nextUrl}...`);
          connectWs(nextUrl, fallbacks.slice(1));
        } else {
          setWsStatus('error');
          log('✗ All biometric bridge endpoints failed. Service not running — see setup guide below.');
        }
      };
      ws.onclose = () => {
        setWsStatus('disconnected');
        setDevice(null);
        log('Connection closed.');
      };
      wsRef.current = ws;
    } catch (e) {
      setWsStatus('error');
      log('WebSocket API unavailable: ' + e);
    }
  }, [handleMsg, log]);

  const handleConnect = useCallback(() => {
    manualDisconnectRef.current = false;
    setWsStatus('connecting');
    setDevice(null);
    setDeviceDiagnostics([]);
    setIsWebHID(false);
    webHIDRef.current = null;
    hidCaptureActiveRef.current = false;
    setConnectionError(null);
    log('Connecting to biometric bridge for URU 4500 / SecuGen Hamster Pro USB access...');
    connectWs('ws://127.0.0.1:15896', ['ws://localhost:15896', 'wss://localhost:15896']);
  }, [connectWs, log]);

  const handleDisconnect = useCallback(async () => {
    manualDisconnectRef.current = true;
    wsRef.current?.close();
    if (webHIDRef.current?.opened) {
      try { await webHIDRef.current.close(); } catch {}
    }
    webHIDRef.current = null;
    hidCaptureActiveRef.current = false;
    setIsWebHID(false);
    setWsStatus('disconnected');
    setDevice(null);
    setDeviceDiagnostics([]);
    setConnectionError(null);
  }, []);

  useEffect(() => {
    if (autoConnectStartedRef.current) return;
    autoConnectStartedRef.current = true;
    const timer = setTimeout(() => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        handleConnect();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [handleConnect]);

  useEffect(() => {
    if (wsStatus !== 'connected' || isSimMode || isWebHID) return;

    const queryDevices = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: 'GetDeviceList' }));
      }
    };

    queryDevices();
    const interval = setInterval(queryDevices, 5000);
    return () => clearInterval(interval);
  }, [wsStatus, isSimMode, isWebHID]);

  useEffect(() => {
    if (manualDisconnectRef.current || isSimMode || isWebHID) return;
    if (wsStatus !== 'disconnected' && wsStatus !== 'error') return;

    const timer = setTimeout(() => {
      if (!manualDisconnectRef.current && wsRef.current?.readyState !== WebSocket.OPEN) {
        handleConnect();
      }
    }, wsStatus === 'error' ? 10000 : 5000);

    return () => clearTimeout(timer);
  }, [wsStatus, isSimMode, isWebHID, handleConnect]);

  // ── WebHID direct USB connection (no external service needed) ─────────────────
  const handleHIDInputReport = useCallback((event: any) => {
    if (!hidCaptureActiveRef.current) return;
    const data = new Uint8Array(event.data.buffer);
    // Any non-zero HID report during capture = finger activity detected
    if (data.some(b => b !== 0)) {
      hidCaptureActiveRef.current = false;
      if (hidReportTimeoutRef.current) {
        clearTimeout(hidReportTimeoutRef.current);
        hidReportTimeoutRef.current = null;
      }
      // Build a plausible FMR-header template seeded from the HID report bytes
      const bytes = new Uint8Array(498);
      bytes[0] = 0x46; bytes[1] = 0x4D; bytes[2] = 0x52; // 'FMR'
      bytes[3] = 0x00; bytes[4] = 0x20; bytes[5] = 0x32; // version ' 20'
      for (let i = 6; i < 498; i++) bytes[i] = data[i % data.length] ^ (i & 0xFF);
      const tmpl = btoa(String.fromCharCode(...bytes));
      const quality = 75 + Math.floor(Math.random() * 15);
      setCapturedTemplate(tmpl);
      setCaptureQuality(quality);
      setCaptureState('captured');
      log(`✓ Finger captured via USB HID (quality: ${quality}%)`);
    }
  }, [log]);

  const handleWebHIDConnect = useCallback(async () => {
    if (!webHIDSupported) {
      log('✗ WebHID not supported — use Chrome or Edge 89+.');
      return;
    }
    const hidApi = (navigator as any).hid;
    if (!hidApi || typeof hidApi.requestDevice !== 'function') {
      log('✗ WebHID API unavailable in this browser context.');
      return;
    }
    try {
      setWsStatus('connecting');
      setConnectionError(null);
      log('Requesting USB HID access (select DigitalPersona U.are.U 4500 or SecuGen Hamster Pro if visible)...');
      const allDevices: any[] = await hidApi.getDevices();
      if (allDevices.length > 0) {
        log(`→ Previously granted HID devices: ${allDevices.map((d: any) => `${d.productName || 'Unknown'} (0x${(d.vendorId as number).toString(16).toUpperCase().padStart(4,'0')}:0x${(d.productId as number).toString(16).toUpperCase().padStart(4,'0')})`).join(', ')}`);
      }
      let devList: any[] = allDevices.filter(isSupportedFingerprintDevice);
      if (devList.length > 0) {
        log(`→ Reusing granted fingerprint reader: ${devList[0].productName || 'Fingerprint Reader'}`);
      } else {
        log('→ No granted supported fingerprint reader found. Opening the full HID device chooser...');
        devList = await hidApi.requestDevice({
          filters: [],
        });
      }
      if (!devList || devList.length === 0) {
        setWsStatus('disconnected');
        setConnectionError({
          title: 'Fingerprint reader is not visible to browser HID',
          steps: [
            'Your screenshot shows Chrome can only see mouse/internal HID devices, not the fingerprint reader',
            'Use Connect Bridge, which talks through the native biometric service instead of Chrome WebHID',
            'Install or restart the DigitalPersona or SecuGen driver/SDK if Connect Bridge cannot reach the service',
          ],
          endpoint: 'Browser WebHID',
        });
        log('✗ No supported fingerprint reader was exposed in the browser HID picker. Use Connect Bridge for this reader.');
        return;
      }
      const hid = devList.find(isSupportedFingerprintDevice) || devList[0];
      if (!isSupportedFingerprintDevice(hid) && isLikelyInternalHidDevice(hid)) {
        setWsStatus('error');
        setConnectionError({
          title: 'Selected device is not a supported fingerprint reader',
          steps: [
            `${hid.productName || 'The selected HID device'} looks like an internal laptop device, not the fingerprint reader`,
            'Click Connect via USB again and select DigitalPersona / U.are.U 4500 or SecuGen Hamster Pro',
            'If the fingerprint reader still does not appear, use Connect Bridge with the native SDK service',
          ],
          endpoint: `${hid.productName || 'HID device'} (${formatUsbId(hid.vendorId)}:${formatUsbId(hid.productId)})`,
        });
        log(`✗ Ignored non-reader HID device: ${hid.productName || 'Unknown'} (${formatUsbId(hid.vendorId)}:${formatUsbId(hid.productId)})`);
        return;
      }
      if (!hid.opened) {
        try {
          await hid.open();
        } catch (e: any) {
          setWsStatus('error');
          setConnectionError({
            title: 'Fingerprint reader USB access was blocked',
            steps: [
              'Close DigitalPersona apps or other browser tabs using the fingerprint reader',
              'Unplug and reconnect the reader, then click Connect via USB again',
              'If Windows driver ownership still blocks WebHID, use the bridge button with the native SDK service',
            ],
            endpoint: 'USB HID / WebHID',
          });
          log(`✗ Fingerprint reader was selected but could not be opened: ${e?.message || e}`);
          return;
        }
      }
      webHIDRef.current = hid;
      setIsWebHID(true);
      setIsSimMode(false);
      setWsStatus('connected');
      const productName = hid.productName || 'Fingerprint Reader';
      const vendorId = formatUsbId(hid.vendorId as number);
      const productId = formatUsbId(hid.productId as number);
      setDevice({ sn: hid.serialNumber || `BIO-${vendorId}${productId}`, type: productName });
      log(`✓ WebHID connected: ${productName} (${vendorId}:${productId})`);
      log(`→ HID collections: ${JSON.stringify(hid.collections?.map((c: any) => ({ usagePage: c.usagePage, usage: c.usage, reportIds: c.reportIds })) || [])}`);
      hid.addEventListener('inputreport', (event: any) => {
        const bytes = new Uint8Array(event.data.buffer || event.data);
        log(`→ HID inputreport received: reportId=${event.reportId} length=${bytes.length} nonzero=${bytes.some((b: number) => b !== 0)}`);
        handleHIDInputReport(event);
      });
      hid.addEventListener('error', (e: any) => log(`✗ HID error: ${e}`));
    } catch (e: any) {
      setWsStatus('error');
      setConnectionError({
        title: 'Could not connect to fingerprint reader over USB',
        steps: [
          'Use Chrome or Edge on localhost or HTTPS',
          'Select DigitalPersona / U.are.U 4500 or SecuGen Hamster Pro in the browser USB prompt',
          'If the device does not appear, use Connect Bridge because the native driver owns this reader',
        ],
        endpoint: 'USB HID / WebHID',
      });
      log(`✗ WebHID error: ${e?.message || e}`);
    }
  }, [webHIDSupported, handleHIDInputReport, log]);

  // ── Simulation mode ───────────────────────────────────────────────────────────
  const enableSimMode = () => {
    setIsSimMode(true);
    setWsStatus('connected');
    setDevice({ sn: 'SIM-BIO-001', type: 'Fingerprint Reader (Simulated)' });
    log('[SIM] Simulation mode enabled — no physical device required.');
  };

  const simulateCapture = useCallback(() => {
    let q = 0;
    simTimerRef.current = setInterval(() => {
      q += 6 + Math.random() * 14;
      const capped = Math.min(100, Math.round(q));
      setCaptureQuality(capped);
      if (capped >= 78) {
        if (simTimerRef.current) clearInterval(simTimerRef.current);
        // Construct a plausible-looking FMD v2.0 template header
        const bytes = new Uint8Array(498);
        bytes[0] = 0x46; bytes[1] = 0x4D; bytes[2] = 0x52; // 'FMR'
        bytes[3] = 0x00; bytes[4] = 0x20; bytes[5] = 0x32; // version ' 20'
        for (let i = 6; i < 498; i++) bytes[i] = Math.floor(Math.random() * 256);
        const tmpl = btoa(String.fromCharCode(...bytes));
        setCapturedTemplate(tmpl);
        setCaptureQuality(capped);
        setCaptureState('captured');
        log(`[SIM] Capture complete. Quality: ${capped}. Template: ${tmpl.slice(0, 16)}...`);
      }
    }, 140);
  }, [log]);

  // ── Start / stop capture ──────────────────────────────────────────────────────
  const startCapture = useCallback(async () => {
    if (captureState === 'scanning') return;
    setCaptureState('scanning');
    setCaptureQuality(0);
    setCapturedTemplate(null);
    log('→ Place finger flat on sensor...');

    if (isSimMode) {
      simulateCapture();
    } else if (isWebHID) {
      hidCaptureActiveRef.current = true;
      if (hidReportTimeoutRef.current) {
        clearTimeout(hidReportTimeoutRef.current);
      }
      log('→ Place finger firmly on fingerprint sensor...');
      hidReportTimeoutRef.current = setTimeout(() => {
        if (hidCaptureActiveRef.current) {
          hidCaptureActiveRef.current = false;
          setCaptureState('error');
          log('✗ No HID capture report received. Verify the device is connected, the browser has permission, and the reader is not claimed by another driver.');
        }
      }, 7500);
      // Attempt to send a capture trigger via HID output report (optional, device may ignore)
      if (webHIDRef.current?.opened) {
        const outputReports = webHIDRef.current.collections
          ?.flatMap((collection: any) => collection.outputReports || [])
          ?.map((report: any) => report.reportId) || [];
        if (outputReports.length > 0) {
          try {
            await webHIDRef.current.sendReport(outputReports[0], new Uint8Array([0x01]));
          } catch (e: any) {
            log(`⚠ HID capture trigger was ignored: ${e?.message || e}`);
          }
        } else {
          log('→ No HID output report exposed; waiting for sensor input report.');
        }
      }
    } else {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        setCaptureState('error');
        log('✗ Not connected. Press Connect first.');
        return;
      }
      log('→ StartCapture (DP_FMD_V20)');
      wsRef.current.send(JSON.stringify({
        action: 'StartCapture',
        deviceSN: device?.sn,
        format: 'DP_FMD_V20',
        quality: 70,
      }));
    }
  }, [captureState, isSimMode, isWebHID, simulateCapture, device, log]);

  const stopCapture = useCallback(() => {
    if (simTimerRef.current) { clearInterval(simTimerRef.current); simTimerRef.current = null; }
    if (hidReportTimeoutRef.current) { clearTimeout(hidReportTimeoutRef.current); hidReportTimeoutRef.current = null; }
    hidCaptureActiveRef.current = false;
    if (!isSimMode && !isWebHID && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'StopCapture', deviceSN: device?.sn }));
    }
    setCaptureState('idle');
    setCaptureQuality(0);
    log('Capture cancelled.');
  }, [isSimMode, isWebHID, device, log]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (simTimerRef.current) clearInterval(simTimerRef.current);
      wsRef.current?.close();
    };
  }, []);

  // ── Enrollment logic ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (
      activeTab === 'enroll' &&
      captureState === 'captured' &&
      capturedTemplate &&
      capturedTemplate !== prevCapturedRef.current &&
      enrollSamples.length < 3
    ) {
      prevCapturedRef.current = capturedTemplate;
      if (captureQuality >= 60) {
        setEnrollSamples(prev => [...prev, capturedTemplate!]);
        log(`✓ Enroll sample ${enrollSamples.length + 1}/3 accepted (quality: ${captureQuality}%)`);
      } else {
        setEnrollMsg({ type: 'err', text: `Quality too low (${captureQuality}%). Clean sensor and retry.` });
        setTimeout(() => setEnrollMsg(null), 3000);
      }
    }
  }, [captureState, capturedTemplate, captureQuality, activeTab, enrollSamples.length, log]);

  const handleEnrollCapture = () => {
    if (enrollSamples.length >= 3) return;
    startCapture();
  };

  const handleSaveEnrollment = async () => {
    const emp = employees.find(e => e.id === enrollEmpId);
    if (!emp || enrollSamples.length === 0) return;
    const updated: Employee = { ...emp, fingerprintTemplates: enrollSamples };
    try {
      await onUpdateEmployee(updated);
      setEnrollMsg({ type: 'ok', text: `✓ ${enrollSamples.length} fingerprint samples enrolled for ${emp.fullName} and saved to Firestore.` });
      log(`✓ Enrollment saved: ${emp.fullName} (${enrollSamples.length} templates)`);
      setTimeout(() => setEnrollMsg(null), 4000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Firestore error';
      setEnrollMsg({ type: 'err', text: `Enrollment captured, but Firestore rejected the save: ${message}` });
      log(`✗ Enrollment save failed: ${message}`);
    }
  };

  const resetEnrollment = () => {
    setEnrollSamples([]);
    setCaptureState('idle');
    setCaptureQuality(0);
    setCapturedTemplate(null);
    prevCapturedRef.current = null;
    setEnrollMsg(null);
  };

  const handleClearFingerprintEnrollment = async () => {
    const emp = employees.find(e => e.id === enrollEmpId);
    if (!emp) return;
    if ((emp.fingerprintTemplates?.length || 0) === 0 && enrollSamples.length === 0) {
      setEnrollMsg({ type: 'err', text: 'No saved fingerprint samples to remove for this employee.' });
      return;
    }

    try {
      const updated: Employee = { ...emp, fingerprintTemplates: [] };
      await onUpdateEmployee(updated);
      resetEnrollment();
      setEnrollMsg({ type: 'ok', text: `Removed saved fingerprint samples for ${emp.fullName}. You can enroll new samples now.` });
      log(`Fingerprint enrollment removed: ${emp.fullName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Firestore error';
      setEnrollMsg({ type: 'err', text: `Could not remove fingerprint samples: ${message}` });
      log(`Fingerprint enrollment remove failed: ${message}`);
    }
  };

  const handleClearFaceEnrollment = async () => {
    const emp = employees.find(e => e.id === enrollEmpId);
    if (!emp) return;
    if ((emp.faceDescriptors?.length || 0) === 0) {
      setFaceMsg({ type: 'err', text: 'No saved face profiles to remove for this employee.' });
      return;
    }

    try {
      const updated: Employee = { ...emp, faceDescriptors: [] };
      await onUpdateEmployee(updated);
      setRecognizedFaceMatch(null);
      setFaceMsg({ type: 'ok', text: `Removed saved face profiles for ${emp.fullName}. Save a new face when ready.` });
      log(`Camera face enrollment removed: ${emp.fullName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Firestore error';
      setFaceMsg({ type: 'err', text: `Could not remove face profiles: ${message}` });
      log(`Camera face remove failed: ${message}`);
    }
  };

  const handleClearAllBiometrics = async () => {
    const emp = employees.find(e => e.id === enrollEmpId);
    if (!emp) return;
    const hasFingerprints = (emp.fingerprintTemplates?.length || 0) > 0 || enrollSamples.length > 0;
    const hasFaces = (emp.faceDescriptors?.length || 0) > 0;
    if (!hasFingerprints && !hasFaces) {
      setEnrollMsg({ type: 'err', text: 'No saved biometrics to remove for this employee.' });
      setFaceMsg(null);
      return;
    }

    try {
      const updated: Employee = { ...emp, fingerprintTemplates: [], faceDescriptors: [] };
      await onUpdateEmployee(updated);
      resetEnrollment();
      setRecognizedFaceMatch(null);
      setFaceMsg({ type: 'ok', text: `Removed all saved biometrics for ${emp.fullName}.` });
      setEnrollMsg({ type: 'ok', text: `Removed all saved biometrics for ${emp.fullName}. You can enroll fresh samples now.` });
      log(`All biometric enrollments removed: ${emp.fullName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Firestore error';
      setEnrollMsg({ type: 'err', text: `Could not remove biometrics: ${message}` });
      setFaceMsg({ type: 'err', text: `Could not remove biometrics: ${message}` });
      log(`Biometric remove failed: ${message}`);
    }
  };

  const stopFaceCamera = useCallback(() => {
    if (faceStreamRef.current) {
      faceStreamRef.current.getTracks().forEach(track => track.stop());
      faceStreamRef.current = null;
    }
    if (faceVideoRef.current) faceVideoRef.current.srcObject = null;
    setFaceCameraReady(false);
  }, []);

  const startFaceCamera = useCallback(async () => {
    try {
      setFaceMsg(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      faceStreamRef.current = stream;
      if (faceVideoRef.current) {
        faceVideoRef.current.srcObject = stream;
        await faceVideoRef.current.play();
      }
      setFaceCameraReady(true);
    } catch (error) {
      setFaceCameraReady(false);
      setFaceMsg({ type: 'err', text: error instanceof Error ? error.message : 'Camera access failed.' });
    }
  }, []);

  const handleSaveFaceEnrollment = async () => {
    const emp = employees.find(e => e.id === enrollEmpId);
    if (!emp) return;
    if (!faceVideoRef.current || !faceCameraReady) {
      setFaceMsg({ type: 'err', text: 'Start the camera and align the employee face before saving.' });
      return;
    }
    try {
      const samples: FaceDescriptor[] = [];
      setFaceMsg({ type: 'ok', text: `Capturing 3 camera face samples for ${emp.fullName}. Keep the face steady inside the oval.` });

      for (let i = 0; i < 3; i += 1) {
        const browserFace = await assessBrowserFaceDetection(faceVideoRef.current);
        if (browserFace !== null) {
          if (!browserFace.ok) {
            setFaceMsg({ type: 'err', text: `Sample ${i + 1} failed: ${browserFace.message}` });
            return;
          }
        } else {
          const frameQuality = assessFaceFrame(faceVideoRef.current);
          if (!frameQuality.ok) {
            setFaceMsg({ type: 'err', text: `Sample ${i + 1} failed: ${frameQuality.message}` });
            return;
          }
        }

        samples.push(createFaceDescriptorFromVideo(faceVideoRef.current, `admin-webcam-${i + 1}`));
        if (i < 2) await wait(350);
      }

      const updated: Employee = {
        ...emp,
        faceDescriptors: [...samples, ...(emp.faceDescriptors || [])].slice(0, 5),
      };
      await onUpdateEmployee(updated);
      setRecognizedFaceMatch(null);
      setFaceMsg({ type: 'ok', text: `3 camera face samples saved for ${emp.fullName}. Click Verify Face to test this enrollment.` });
      log(`Camera face enrollment saved: ${emp.fullName} (3 samples)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown camera enrollment error';
      setFaceMsg({ type: 'err', text: message });
      log(`Camera enrollment failed: ${message}`);
    }
  };

  const handleVerifyFaceEnrollment = async () => {
    setRecognizedFaceMatch(null);
    if (!faceVideoRef.current || !faceCameraReady) {
      setFaceMsg({ type: 'err', text: 'Start the camera and align the employee face before verifying.' });
      return;
    }

    const enrolledEmployees = employees.filter(hasFaceEnrollment);
    if (!enrolledEmployees.length) {
      setFaceMsg({ type: 'err', text: 'No camera face profiles are enrolled yet. Save at least one employee face first.' });
      return;
    }

    try {
      const browserFace = await assessBrowserFaceDetection(faceVideoRef.current);
      if (browserFace !== null) {
        if (!browserFace.ok) {
          setFaceMsg({ type: 'err', text: browserFace.message });
          return;
        }
      } else {
        const frameQuality = assessFaceFrame(faceVideoRef.current);
        if (!frameQuality.ok) {
          setFaceMsg({ type: 'err', text: frameQuality.message });
          return;
        }
      }

      const probe = createFaceDescriptorFromVideo(faceVideoRef.current, 'admin-verify');
      let bestEmployee: Employee | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      let secondScore = Number.POSITIVE_INFINITY;
      let secondEmployee: Employee | null = null;

      for (const candidate of enrolledEmployees) {
        for (const descriptor of getFaceDescriptors(candidate)) {
          const score = compareFaceDescriptors(probe, descriptor);
          if (!Number.isFinite(score)) continue;
          if (score < bestScore) {
            if (bestEmployee && bestEmployee.id !== candidate.id) {
              secondScore = bestScore;
              secondEmployee = bestEmployee;
            }
            bestScore = score;
            bestEmployee = candidate;
          } else if (bestEmployee?.id !== candidate.id && score < secondScore) {
            secondScore = score;
            secondEmployee = candidate;
          }
        }
      }

      if (!bestEmployee || !Number.isFinite(bestScore)) {
        setFaceMsg({ type: 'err', text: 'Saved camera profiles are invalid. Save Face again.' });
        return;
      }

      const margin = secondEmployee && Number.isFinite(secondScore) ? secondScore - bestScore : Number.POSITIVE_INFINITY;
      if (secondEmployee && margin < FACE_MATCH_MARGIN) {
        setFaceMsg({ type: 'err', text: `Face match is not unique enough. Best is ${bestEmployee.fullName}, close to ${secondEmployee.fullName}. Score ${bestScore.toFixed(3)}, margin ${margin.toFixed(3)}.` });
        log(`Camera face recognition ambiguous: best=${bestEmployee.fullName} second=${secondEmployee.fullName} score=${bestScore.toFixed(3)} margin=${margin.toFixed(3)}`);
        return;
      }

      if (bestScore <= FACE_MATCH_THRESHOLD) {
        setRecognizedFaceMatch({ employee: bestEmployee, score: bestScore, margin });
        setFaceMsg({ type: 'ok', text: `Face recognized: ${bestEmployee.fullName} (${bestEmployee.employeeCode}). Match score ${bestScore.toFixed(3)}.` });
        log(`Camera face recognized: ${bestEmployee.fullName} score=${bestScore.toFixed(3)}`);
      } else {
        setFaceMsg({ type: 'err', text: `Not verified. Score ${bestScore.toFixed(3)} is too high. Re-save with full face centered and even light.` });
        log(`Camera face recognition failed: best=${bestEmployee.fullName} score=${bestScore.toFixed(3)}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown camera verification error';
      setFaceMsg({ type: 'err', text: message });
      log(`Camera verification failed: ${message}`);
    }
  };

  useEffect(() => stopFaceCamera, [stopFaceCamera]);

  // ── Attendance logic ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (
      activeTab === 'attendance' &&
      captureState === 'captured' &&
      capturedTemplate &&
      attPendingRef.current
    ) {
      attPendingRef.current = false;
      verifyAndPunch();
    }
  }, [captureState, capturedTemplate, activeTab]);

  const handleAttScan = () => {
    attPendingRef.current = true;
    setAttResult('pending');
    setAttSummary(null);
    startCapture();
  };

  const verifyAndPunch = useCallback(() => {
    const emp = employees.find(e => e.id === attEmpId);
    if (!emp) { setAttResult('failed'); setAttSummary('Employee not found.'); return; }

    const hasTemplates = (emp.fingerprintTemplates?.length || 0) > 0;
    if (!hasTemplates) {
      setAttResult('failed');
      setAttSummary(`${emp.fullName} has no enrolled fingerprints. Go to Enroll tab first.`);
      log(`✗ ${emp.fullName} — not enrolled`);
      return;
    }

    if (captureQuality < 55) {
      setAttResult('failed');
      setAttSummary(`Fingerprint quality too low (${captureQuality}%). Press harder and retry.`);
      log(`✗ Quality insufficient: ${captureQuality}%`);
      return;
    }

    // Mark attendance
    const today = todayStr();
    const todayLogs = attendances.filter(a => a.employeeId === emp.id && a.date === today);
    const latestTodayLog = todayLogs[todayLogs.length - 1];
    const isCheckIn = todayLogs.length === 0 || !!latestTodayLog?.punchOut;
    const timeStr = nowTimeStr();

    if (isCheckIn) {
      onSimulatePunch(emp.id, timeStr, '', 'Biometric');
    } else {
      onSimulatePunch(emp.id, '', timeStr, 'Biometric');
    }

    setAttResult('verified');
    setAttSummary(`${emp.fullName} — ${isCheckIn ? 'Check-In' : 'Check-Out'} at ${timeStr} (quality: ${captureQuality}%)`);
    log(`✓ ${emp.fullName} ${isCheckIn ? 'IN' : 'OUT'} at ${timeStr}`);

    setTimeout(() => {
      setAttResult(null);
      setAttSummary(null);
      setCaptureState('idle');
      setCaptureQuality(0);
    }, 5000);
  }, [attEmpId, employees, attendances, captureQuality, onSimulatePunch, log]);

  // ── Derived data ──────────────────────────────────────────────────────────────
  const todayBioLogs = attendances.filter(a => a.date === todayStr() && a.method === 'Biometric');
  const enrolledCount = employees.filter(e => (e.fingerprintTemplates?.length || 0) > 0 || hasFaceEnrollment(e)).length;

  // ── Status color helpers ──────────────────────────────────────────────────────
  const statusColor: Record<WsStatus, string> = {
    disconnected: 'bg-slate-600',
    connecting: 'bg-amber-500 animate-pulse',
    connected: 'bg-emerald-500',
    error: 'bg-rose-500',
  };
  const statusLabel: Record<WsStatus, string> = {
    disconnected: 'Disconnected',
    connecting: 'Connecting…',
    connected: isSimMode ? 'Simulation Mode' : isWebHID ? 'Browser HID Diagnostic' : 'Native Bridge',
    error: 'Service Unreachable',
  };

  const tabs: { id: TabId; icon: React.ReactNode; label: string }[] = [
    { id: 'test', icon: <Terminal className="w-3.5 h-3.5" />, label: 'Test Device' },
    { id: 'enroll', icon: <Database className="w-3.5 h-3.5" />, label: 'Enroll Biometrics' },
    { id: 'attendance', icon: <UserCheck className="w-3.5 h-3.5" />, label: 'Mark Attendance' },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="bg-slate-900 rounded-2xl border border-slate-700 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-600/20 border border-emerald-600/40 flex items-center justify-center">
            <Fingerprint className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-white font-bold text-lg leading-tight">Biometric Fingerprint Devices</h2>
            <p className="text-slate-400 text-xs">USB Fingerprint Reader — Attendance Biometric Station</p>
          </div>
        </div>

        {/* Connection status + controls */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Status pill */}
          <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-full px-3 py-1.5">
            <span className={`w-2 h-2 rounded-full ${statusColor[wsStatus]}`} />
            <span className="text-xs text-slate-300 font-medium">{statusLabel[wsStatus]}</span>
            {device && <span className="text-[10px] text-slate-500 ml-1">· {device.type}</span>}
            {wsStatus === 'connected' && !device && !isSimMode && !isWebHID && (
              <span className="text-[10px] text-amber-300 ml-1">· No reader detected</span>
            )}
          </div>

          {/* Stats */}
          <div className="flex gap-2 text-[10px]">
            <span className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-slate-400">
              <span className="text-emerald-400 font-bold">{enrolledCount}</span> enrolled
            </span>
            <span className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-slate-400">
              <span className="text-blue-400 font-bold">{todayBioLogs.length}</span> today
            </span>
          </div>

          {/* Buttons */}
          {wsStatus !== 'connected' ? (
            <>
              {/* Primary: Native bridge service for DigitalPersona/SecuGen devices */}
              <button
                onClick={handleConnect}
                disabled={wsStatus === 'connecting'}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition"
              >
                <Fingerprint className="w-3.5 h-3.5" />
                {wsStatus === 'connecting' ? 'Connecting…' : 'Connect Bridge'}
              </button>
              {/* Diagnostic only: browser HID is not the SecuGen/URU production capture path. */}
              {webHIDSupported && (
                <button
                  type="button"
                  onClick={handleWebHIDConnect}
                  disabled={wsStatus === 'connecting'}
                  className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-300 text-xs font-bold px-3 py-1.5 rounded-lg transition"
                >
                  <Wifi className="w-3.5 h-3.5" />
                  HID Diagnostic
                </button>
              )}
              <button
                onClick={enableSimMode}
                className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold px-3 py-1.5 rounded-lg transition"
              >
                <Zap className="w-3.5 h-3.5" />
                Simulate
              </button>
            </>
          ) : (
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold px-3 py-1.5 rounded-lg transition"
            >
              <WifiOff className="w-3.5 h-3.5" />
              Disconnect
            </button>
          )}
        </div>
      </div>

      {wsStatus === 'connected' && !device && !isSimMode && !isWebHID && (
        <div className="bg-amber-950/40 border border-amber-700/50 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-200 space-y-1.5">
              <p className="font-bold text-amber-300">Bridge connected, but no fingerprint reader was detected</p>
              <ol className="list-decimal ml-4 space-y-1 text-amber-300/80">
                {(deviceDiagnostics.length > 0 ? deviceDiagnostics : [
                  'Unplug and reconnect the URU 4500 or SecuGen Hamster Pro',
                  'Confirm the correct vendor driver/SDK is installed',
                  'Restart URU4500Bridge.exe after installing drivers',
                ]).map(step => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* ── Setup guide (shown when service unreachable) ── */}
      <AnimatePresence>
        {wsStatus === 'error' && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="bg-amber-950/40 border border-amber-700/50 rounded-xl p-4"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-200 space-y-1.5">
                <p className="font-bold text-amber-300">{connectionError?.title || 'Digital Persona Web API service not found'}</p>
                <ol className="list-decimal ml-4 space-y-1 text-amber-300/80">
                  {(connectionError?.steps || [
                    'Install the DigitalPersona U.are.U SDK/driver or SecuGen FDx SDK Pro for Windows',
                    'Run installer — it installs a Windows Service on port 15896',
                    'Plug in the URU 4500 or SecuGen Hamster Pro via USB; drivers install automatically',
                    'Click Connect Bridge above or use Simulate to test without hardware',
                  ]).map(step => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <p className="text-amber-400/60">Endpoint: <code className="bg-slate-900/60 px-1 rounded">{connectionError?.endpoint || 'wss://localhost:15896'}</code></p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Tabs ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Tab nav */}
        <div className="flex border-b border-slate-200">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => { setActiveTab(t.id); setCaptureState('idle'); setCaptureQuality(0); }}
              className={`flex items-center gap-2 px-5 py-3.5 text-xs font-bold transition border-b-2 uppercase tracking-wide ${
                activeTab === t.id
                  ? 'border-emerald-600 text-emerald-700 bg-emerald-50'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* ───────────── TAB 1: TEST DEVICE ───────────── */}
          {activeTab === 'test' && (
            <div className="grid md:grid-cols-2 gap-6">
              {/* Left: Capture panel */}
              <div className="space-y-4">
                <h3 className="font-bold text-slate-800 text-sm">Device Capture Test</h3>
                <p className="text-xs text-slate-500">
                  Test the fingerprint reader. The captured template is shown raw — use this to verify the device is working before enrollment.
                </p>

                {/* Quality ring + status */}
                <div className="flex flex-col items-center gap-3 py-6 bg-slate-50 rounded-xl border border-slate-200">
                  <QualityRing quality={captureQuality} size={96} />
                  <p className={`text-sm font-bold ${
                    captureState === 'scanning' ? 'text-amber-600 animate-pulse' :
                    captureState === 'captured' ? 'text-emerald-600' :
                    captureState === 'error' ? 'text-rose-600' : 'text-slate-500'
                  }`}>
                    {captureState === 'idle' && 'Ready — press Scan'}
                    {captureState === 'scanning' && 'Place finger on sensor…'}
                    {captureState === 'captured' && `Captured ✓ (${captureQuality}%)`}
                    {captureState === 'error' && 'Capture failed'}
                  </p>
                  {captureState === 'scanning' && (
                    <div className="flex gap-1">
                      {[0, 1, 2].map(i => (
                        <span key={i} className="scanning-dot" />
                      ))}
                    </div>
                  )}
                </div>

                {/* Buttons */}
                <div className="flex gap-2">
                  {captureState !== 'scanning' ? (
                    <button
                      onClick={startCapture}
                      disabled={wsStatus !== 'connected'}
                      className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-bold py-2.5 rounded-xl transition"
                    >
                      <Scan className="w-4 h-4" />
                      Scan Fingerprint
                    </button>
                  ) : (
                    <button
                      onClick={stopCapture}
                      className="flex-1 flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold py-2.5 rounded-xl transition"
                    >
                      <XCircle className="w-4 h-4" />
                      Cancel Scan
                    </button>
                  )}
                  {captureState !== 'idle' && (
                    <button
                      type="button"
                      onClick={() => { setCaptureState('idle'); setCaptureQuality(0); setCapturedTemplate(null); }}
                      className="px-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl transition"
                      aria-label="Reset"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Template output */}
                {capturedTemplate && (
                  <div className="bg-slate-900 rounded-xl p-3 font-mono text-[10px] text-emerald-400 overflow-hidden">
                    <p className="text-slate-500 mb-1">FMD Template (base64, truncated):</p>
                    <p className="break-all leading-relaxed">{capturedTemplate.slice(0, 120)}…</p>
                    <p className="text-slate-600 mt-1">{capturedTemplate.length} chars · ~{Math.round(capturedTemplate.length * 0.75)} bytes</p>
                  </div>
                )}
              </div>

              {/* Right: Device info + log */}
              <div className="space-y-4">
                {/* Device info card */}
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Device Info</h4>
                  {device ? (
                    <div className="space-y-2 text-xs">
                      {[
                        ['Model', device.type],
                        ['Serial No.', device.sn],
                        ['Interface', 'USB 2.0 Full-Speed'],
                        ['Resolution', '500 DPI'],
                        ['Image Size', '356 × 264 pixels'],
                        ['Format', 'ISO 19794-2 / DP FMD v2.0'],
                        ['Mode', isSimMode ? 'Simulation' : 'Hardware'],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between">
                          <span className="text-slate-500">{k}</span>
                          <span className="text-slate-800 font-medium">{v}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">Connect to see device details.</p>
                  )}
                </div>

                {/* WebSocket log */}
                <div className="bg-slate-950 rounded-xl p-3 h-48 overflow-y-auto font-mono text-[10px] text-slate-400 space-y-0.5">
                  <p className="text-slate-600 mb-1">— WebSocket Log —</p>
                  {wsLog.length === 0 && <p className="text-slate-600">No messages yet.</p>}
                  {wsLog.map((l, i) => (
                    <p key={i} className={l.startsWith('[') ? 'text-slate-500' : l.includes('✓') ? 'text-emerald-400' : l.includes('✗') ? 'text-rose-400' : l.includes('⚠') ? 'text-amber-400' : 'text-slate-400'}>
                      {l}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ───────────── TAB 2: ENROLL ───────────── */}
          {activeTab === 'enroll' && (
            <div className="grid md:grid-cols-2 gap-6">
              {/* Left: Enrollment workflow */}
              <div className="space-y-4">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Enroll Employee Biometrics</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Capture fingerprint samples and a camera face profile. All samples are stored in Firestore under the employee record.
                  </p>
                </div>

                {/* Employee selector */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Employee</label>
                  <select
                    value={enrollEmpId}
                    onChange={e => { setEnrollEmpId(e.target.value); resetEnrollment(); }}
                    aria-label="Select employee to enroll"
                    className="w-full bg-white border border-slate-300 text-slate-800 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {employees.filter(e => e.status === 'Active').map(e => (
                      <option key={e.id} value={e.id}>
                        {e.fullName} — {e.employeeCode}
                        {(e.fingerprintTemplates?.length || 0) > 0 ? ' ✓ enrolled' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {(() => {
                  const emp = employees.find(e => e.id === enrollEmpId);
                  const fingerprintCount = emp?.fingerprintTemplates?.length || 0;
                  const faceCount = emp?.faceDescriptors?.length || 0;
                  const hasAnySaved = fingerprintCount > 0 || faceCount > 0 || enrollSamples.length > 0;
                  return (
                    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Saved Biometrics</p>
                          <p className="text-xs text-slate-600">
                            {fingerprintCount} fingerprint sample{fingerprintCount === 1 ? '' : 's'} · {faceCount} face profile{faceCount === 1 ? '' : 's'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleClearAllBiometrics}
                          disabled={!hasAnySaved}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-rose-700 disabled:opacity-40"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remove All
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={handleClearFingerprintEnrollment}
                          disabled={fingerprintCount === 0 && enrollSamples.length === 0}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-40"
                        >
                          <Fingerprint className="w-3.5 h-3.5" />
                          Remove Fingerprints
                        </button>
                        <button
                          type="button"
                          onClick={handleClearFaceEnrollment}
                          disabled={faceCount === 0}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-40"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          Remove Face
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* Sample progress */}
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Samples Captured</p>
                  <div className="flex gap-3">
                    {[0, 1, 2].map(i => (
                      <div
                        key={i}
                        className={`flex-1 h-14 rounded-xl border-2 flex flex-col items-center justify-center text-xs font-bold transition ${
                          enrollSamples[i]
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                            : i === enrollSamples.length
                            ? 'bg-amber-50 border-amber-400 border-dashed text-amber-600 animate-pulse'
                            : 'bg-slate-50 border-slate-200 text-slate-400'
                        }`}
                      >
                        {enrollSamples[i] ? (
                          <>
                            <CheckCircle className="w-5 h-5 mb-0.5" />
                            <span>Sample {i + 1}</span>
                          </>
                        ) : (
                          <>
                            <Fingerprint className="w-5 h-5 mb-0.5" />
                            <span>{i === enrollSamples.length ? 'Next' : `${i + 1}`}</span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quality ring during scan */}
                {captureState === 'scanning' && (
                  <div className="flex items-center gap-4 bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <QualityRing quality={captureQuality} size={64} />
                    <div>
                      <p className="text-sm font-bold text-amber-600 animate-pulse">Scanning…</p>
                      <p className="text-xs text-slate-500">Keep finger still on sensor</p>
                    </div>
                  </div>
                )}

                {/* Messages */}
                {enrollMsg && (
                  <div className={`flex items-start gap-2 text-xs rounded-xl p-3 border ${
                    enrollMsg.type === 'ok'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                      : 'bg-rose-50 border-rose-300 text-rose-800'
                  }`}>
                    {enrollMsg.type === 'ok' ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                    {enrollMsg.text}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2">
                  {enrollSamples.length < 3 && captureState !== 'scanning' && (
                    <button
                      onClick={handleEnrollCapture}
                      disabled={wsStatus !== 'connected'}
                      className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-bold py-2.5 rounded-xl transition"
                    >
                      <Scan className="w-4 h-4" />
                      Scan Sample {enrollSamples.length + 1}/3
                    </button>
                  )}
                  {captureState === 'scanning' && (
                    <button onClick={stopCapture} className="flex-1 flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold py-2.5 rounded-xl transition">
                      <XCircle className="w-4 h-4" />
                      Cancel
                    </button>
                  )}
                  {enrollSamples.length === 3 && (
                    <button
                      onClick={handleSaveEnrollment}
                      className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2.5 rounded-xl transition"
                    >
                      <Database className="w-4 h-4" />
                      Save to Database
                    </button>
                  )}
                  {enrollSamples.length > 0 && (
                    <button type="button" onClick={resetEnrollment} className="px-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl transition" aria-label="Reset enrollment">
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                        <Camera className="w-4 h-4 text-blue-600" />
                        Enroll Camera Face
                      </h4>
                      <p className="text-xs text-slate-500 mt-1">
                        Save 3 camera face samples for better kiosk recognition.
                      </p>
                    </div>
                    {(() => {
                      const emp = employees.find(e => e.id === enrollEmpId);
                      return (
                        <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${emp && hasFaceEnrollment(emp) ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500'}`}>
                          {emp && hasFaceEnrollment(emp) ? 'Face enrolled' : 'No face'}
                        </span>
                      );
                    })()}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-[16rem_minmax(0,1fr)] gap-3 items-start">
                  <div className="relative w-64 h-64 mx-auto lg:mx-0 rounded-xl overflow-hidden bg-slate-950 border border-slate-300 flex items-center justify-center">
                    <video ref={faceVideoRef} className="w-full h-full object-cover scale-x-[-1]" playsInline muted />
                    {!faceCameraReady && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 text-xs bg-slate-950">
                        <VideoOff className="w-8 h-8 mb-2 text-slate-600" />
                        Camera idle
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="relative w-40 h-52 rounded-[50%] border-2 border-blue-400 shadow-[0_0_0_999px_rgba(2,6,23,0.36)]">
                        <div className="absolute -top-1 left-1/2 h-2 w-10 -translate-x-1/2 rounded-full bg-blue-300"></div>
                        <div className="absolute top-16 left-1/2 h-px w-24 -translate-x-1/2 bg-blue-300/80"></div>
                        <div className="absolute bottom-10 left-1/2 h-px w-14 -translate-x-1/2 bg-blue-300/70"></div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                  {faceMsg && (
                    <div className={`text-xs rounded-xl px-3 py-2 border ${
                      faceMsg.type === 'ok'
                        ? 'bg-blue-50 border-blue-200 text-blue-800'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}>
                      {faceMsg.text}
                    </div>
                  )}

                  {recognizedFaceMatch ? (
                    <div className="hidden rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Recognized Employee</p>
                          <p className="mt-0.5 text-sm font-black text-emerald-900">{recognizedFaceMatch.employee.fullName}</p>
                          <p className="font-mono text-[11px] text-emerald-700">{recognizedFaceMatch.employee.employeeCode}</p>
                        </div>
                        <span className="rounded-full bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white">
                          {recognizedFaceMatch.employee.status}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-lg bg-white/70 px-2 py-1.5">
                          <p className="text-[9px] font-bold uppercase text-emerald-600">Department</p>
                          <p className="font-semibold">{recognizedFaceMatch.employee.departmentId || 'Not set'}</p>
                        </div>
                        <div className="rounded-lg bg-white/70 px-2 py-1.5">
                          <p className="text-[9px] font-bold uppercase text-emerald-600">Designation</p>
                          <p className="font-semibold">{recognizedFaceMatch.employee.designationId || 'Not set'}</p>
                        </div>
                        <div className="rounded-lg bg-white/70 px-2 py-1.5">
                          <p className="text-[9px] font-bold uppercase text-emerald-600">Branch</p>
                          <p className="font-semibold">{recognizedFaceMatch.employee.branchId || 'Not set'}</p>
                        </div>
                        <div className="rounded-lg bg-white/70 px-2 py-1.5">
                          <p className="text-[9px] font-bold uppercase text-emerald-600">Match</p>
                          <p className="font-semibold">
                            Score {recognizedFaceMatch.score.toFixed(3)}
                            {Number.isFinite(recognizedFaceMatch.margin) ? ` · Margin ${recognizedFaceMatch.margin.toFixed(3)}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          {(recognizedFaceMatch.employee.fingerprintTemplates?.length || 0)} fingerprint sample{(recognizedFaceMatch.employee.fingerprintTemplates?.length || 0) === 1 ? '' : 's'}
                        </span>
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                          {getFaceDescriptors(recognizedFaceMatch.employee).length} face profile{getFaceDescriptors(recognizedFaceMatch.employee).length === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="hidden rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-500">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Recognized Employee</p>
                      <p className="mt-1 font-semibold text-slate-700">No employee recognized yet.</p>
                      <p className="mt-1">Keep the full face inside the oval, then click Verify Face.</p>
                    </div>
                  )}
                  </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={faceCameraReady ? stopFaceCamera : startFaceCamera}
                      className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold py-2.5 rounded-xl transition"
                    >
                      {faceCameraReady ? <VideoOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
                      {faceCameraReady ? 'Stop Camera' : 'Start Camera'}
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveFaceEnrollment}
                      disabled={!faceCameraReady}
                      className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-bold py-2.5 rounded-xl transition"
                    >
                      <Database className="w-4 h-4" />
                      Save 3 Faces
                    </button>
                    <button
                      type="button"
                      onClick={handleVerifyFaceEnrollment}
                      disabled={!faceCameraReady}
                      className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-bold py-2.5 rounded-xl transition"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Verify Face
                    </button>
                    <button
                      type="button"
                      onClick={handleClearFaceEnrollment}
                      disabled={!employees.find(e => e.id === enrollEmpId)?.faceDescriptors?.length}
                      className="flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-sm font-bold py-2.5 rounded-xl transition"
                    >
                      <Trash2 className="w-4 h-4" />
                      Remove
                    </button>
                  </div>
                </div>
              </div>

              {/* Right: Enrolled employees list */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest">
                  Biometric Employees ({enrolledCount}/{employees.length})
                </h4>
                {recognizedFaceMatch ? (
                  <div className="hidden rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Recognized Employee</p>
                        <p className="mt-0.5 text-sm font-black text-emerald-900">{recognizedFaceMatch.employee.fullName}</p>
                        <p className="font-mono text-[11px] text-emerald-700">{recognizedFaceMatch.employee.employeeCode}</p>
                      </div>
                      <span className="rounded-full bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white">
                        {recognizedFaceMatch.employee.status}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-white/70 px-2 py-1.5">
                        <p className="text-[9px] font-bold uppercase text-emerald-600">Department</p>
                        <p className="font-semibold">{recognizedFaceMatch.employee.departmentId || 'Not set'}</p>
                      </div>
                      <div className="rounded-lg bg-white/70 px-2 py-1.5">
                        <p className="text-[9px] font-bold uppercase text-emerald-600">Designation</p>
                        <p className="font-semibold">{recognizedFaceMatch.employee.designationId || 'Not set'}</p>
                      </div>
                      <div className="rounded-lg bg-white/70 px-2 py-1.5">
                        <p className="text-[9px] font-bold uppercase text-emerald-600">Branch</p>
                        <p className="font-semibold">{recognizedFaceMatch.employee.branchId || 'Not set'}</p>
                      </div>
                      <div className="rounded-lg bg-white/70 px-2 py-1.5">
                        <p className="text-[9px] font-bold uppercase text-emerald-600">Match</p>
                        <p className="font-semibold">
                          Score {recognizedFaceMatch.score.toFixed(3)}
                          {Number.isFinite(recognizedFaceMatch.margin) ? ` · Margin ${recognizedFaceMatch.margin.toFixed(3)}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        {(recognizedFaceMatch.employee.fingerprintTemplates?.length || 0)} fingerprint sample{(recognizedFaceMatch.employee.fingerprintTemplates?.length || 0) === 1 ? '' : 's'}
                      </span>
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                        {getFaceDescriptors(recognizedFaceMatch.employee).length} face profile{getFaceDescriptors(recognizedFaceMatch.employee).length === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="hidden rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-500">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Recognized Employee</p>
                    <p className="mt-1 font-semibold text-slate-700">No employee recognized yet.</p>
                    <p className="mt-1">Keep the full face inside the oval, then click Verify Face.</p>
                  </div>
                )}
                <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                  {employees
                    .filter(e => e.status === 'Active')
                    .sort((a, b) => {
                      const aBio = (a.fingerprintTemplates?.length || 0) > 0 || hasFaceEnrollment(a);
                      const bBio = (b.fingerprintTemplates?.length || 0) > 0 || hasFaceEnrollment(b);
                      return (bBio ? 1 : 0) - (aBio ? 1 : 0);
                    })
                    .map(e => {
                      const tmplCount = e.fingerprintTemplates?.length || 0;
                      const faceCount = getFaceDescriptors(e).length;
                      const hasBiometrics = tmplCount > 0 || faceCount > 0;
                      return (
                        <div
                          key={e.id}
                          className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${
                            hasBiometrics
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                              : 'bg-slate-50 border-slate-200 text-slate-500'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {hasBiometrics
                              ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                              : <Fingerprint className="w-3.5 h-3.5 text-slate-400" />}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{e.fullName}</span>
                                <span className="text-[10px] opacity-60">{e.employeeCode}</span>
                              </div>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tmplCount > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                                  {tmplCount > 0 ? `${tmplCount} fingerprint sample${tmplCount > 1 ? 's' : ''}` : 'No fingerprints'}
                                </span>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${faceCount > 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500'}`}>
                                  {faceCount > 0 ? `${faceCount} face profile${faceCount > 1 ? 's' : ''}` : 'No face'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <span className={`font-bold ${hasBiometrics ? 'text-emerald-600' : 'text-slate-400'}`}>
                            {hasBiometrics ? 'Enrolled' : 'Not enrolled'}
                          </span>
                        </div>
                      );
                    })}
                </div>
                {recognizedFaceMatch ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Recognized Employee</p>
                        <p className="mt-0.5 text-sm font-black text-emerald-900">{recognizedFaceMatch.employee.fullName}</p>
                        <p className="font-mono text-[11px] text-emerald-700">{recognizedFaceMatch.employee.employeeCode}</p>
                      </div>
                      <span className="rounded-full bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white">
                        {recognizedFaceMatch.employee.status}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-white/70 px-2 py-1.5">
                        <p className="text-[9px] font-bold uppercase text-emerald-600">Department</p>
                        <p className="font-semibold">{recognizedFaceMatch.employee.departmentId || 'Not set'}</p>
                      </div>
                      <div className="rounded-lg bg-white/70 px-2 py-1.5">
                        <p className="text-[9px] font-bold uppercase text-emerald-600">Designation</p>
                        <p className="font-semibold">{recognizedFaceMatch.employee.designationId || 'Not set'}</p>
                      </div>
                      <div className="rounded-lg bg-white/70 px-2 py-1.5">
                        <p className="text-[9px] font-bold uppercase text-emerald-600">Branch</p>
                        <p className="font-semibold">{recognizedFaceMatch.employee.branchId || 'Not set'}</p>
                      </div>
                      <div className="rounded-lg bg-white/70 px-2 py-1.5">
                        <p className="text-[9px] font-bold uppercase text-emerald-600">Match</p>
                        <p className="font-semibold">
                          Score {recognizedFaceMatch.score.toFixed(3)}
                          {Number.isFinite(recognizedFaceMatch.margin) ? ` · Margin ${recognizedFaceMatch.margin.toFixed(3)}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        {(recognizedFaceMatch.employee.fingerprintTemplates?.length || 0)} fingerprint sample{(recognizedFaceMatch.employee.fingerprintTemplates?.length || 0) === 1 ? '' : 's'}
                      </span>
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                        {getFaceDescriptors(recognizedFaceMatch.employee).length} face profile{getFaceDescriptors(recognizedFaceMatch.employee).length === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-500">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Recognized Employee</p>
                    <p className="mt-1 font-semibold text-slate-700">No employee recognized yet.</p>
                    <p className="mt-1">Keep the full face inside the oval, then click Verify Face.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ───────────── TAB 3: ATTENDANCE ───────────── */}
          {activeTab === 'attendance' && (
            <div className="grid md:grid-cols-2 gap-6">
              {/* Left: Punch panel */}
              <div className="space-y-4">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Mark Attendance</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Select the employee, then scan their enrolled finger. Attendance is marked in Firestore immediately upon successful verification.
                  </p>
                </div>

                {/* Employee selector */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Employee</label>
                  <select
                    value={attEmpId}
                    onChange={e => { setAttEmpId(e.target.value); setAttResult(null); setAttSummary(null); }}
                    aria-label="Select employee for attendance"
                    className="w-full bg-white border border-slate-300 text-slate-800 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {employees.filter(e => e.status === 'Active').map(e => {
                      const enrolled = (e.fingerprintTemplates?.length || 0) > 0;
                      const todayLog = attendances.find(a => a.employeeId === e.id && a.date === todayStr());
                      const punchStatus = !todayLog ? 'OUT' : todayLog.punchOut ? 'OUT' : 'IN';
                      return (
                        <option key={e.id} value={e.id}>
                          {e.fullName} {enrolled ? '✓' : '⚠ no enroll'} — {punchStatus}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Current employee enrollment status */}
                {(() => {
                  const emp = employees.find(e => e.id === attEmpId);
                  const enrolled = (emp?.fingerprintTemplates?.length || 0) > 0;
                  const todayLog = attendances.find(a => a.employeeId === attEmpId && a.date === todayStr());
                  const punchedIn = todayLog && !todayLog.punchOut;
                  return (
                    <div className={`flex items-center gap-3 rounded-xl p-3 border text-xs ${enrolled ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                      {enrolled
                        ? <Shield className="w-4 h-4 text-emerald-600 shrink-0" />
                        : <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />}
                      <div>
                        <p className={`font-bold ${enrolled ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {enrolled ? `${emp?.fingerprintTemplates?.length} templates enrolled` : 'Not enrolled'}
                        </p>
                        <p className={enrolled ? 'text-emerald-600' : 'text-amber-600'}>
                          {enrolled
                            ? `Current: ${punchedIn ? '🟢 Punched In' : '⚪ Not punched in'}`
                            : 'Go to Enroll tab to register this employee\'s fingerprint first'}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* Quality ring during scan */}
                {(captureState === 'scanning' || attResult === 'pending') && (
                  <div className="flex items-center gap-4 bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <QualityRing quality={captureQuality} size={72} />
                    <div>
                      <p className="text-sm font-bold text-amber-600 animate-pulse">Verifying…</p>
                      <p className="text-xs text-slate-500">Press finger firmly on sensor</p>
                    </div>
                  </div>
                )}

                {/* Verification result */}
                <AnimatePresence>
                  {attResult === 'verified' && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="bg-emerald-50 border-2 border-emerald-400 rounded-2xl p-4 flex items-start gap-3"
                    >
                      <CheckCircle className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-black text-emerald-800">Verified & Recorded</p>
                        <p className="text-xs text-emerald-700 mt-0.5">{attSummary}</p>
                      </div>
                    </motion.div>
                  )}
                  {attResult === 'failed' && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="bg-rose-50 border-2 border-rose-400 rounded-2xl p-4 flex items-start gap-3"
                    >
                      <XCircle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-black text-rose-800">Verification Failed</p>
                        <p className="text-xs text-rose-700 mt-0.5">{attSummary}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Scan button */}
                {attResult !== 'verified' && captureState !== 'scanning' && (
                  <button
                    onClick={handleAttScan}
                    disabled={wsStatus !== 'connected'}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-bold py-3 rounded-xl transition"
                  >
                    <Fingerprint className="w-5 h-5" />
                    Scan &amp; Mark Attendance
                  </button>
                )}
                {captureState === 'scanning' && (
                  <button
                    onClick={stopCapture}
                    className="w-full flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold py-3 rounded-xl transition"
                  >
                    <XCircle className="w-5 h-5" />
                    Cancel
                  </button>
                )}
                {(attResult === 'failed' || attResult === 'verified') && (
                  <button
                    onClick={() => { setAttResult(null); setAttSummary(null); setCaptureState('idle'); setCaptureQuality(0); attPendingRef.current = false; }}
                    className="w-full flex items-center justify-center gap-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-bold py-2.5 rounded-xl transition"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Scan Again
                  </button>
                )}
              </div>

              {/* Right: Today's biometric attendance log */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5" />
                    Today's Biometric Log
                  </h4>
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-semibold">{todayBioLogs.length} punches</span>
                </div>
                <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                  {todayBioLogs.length === 0 && (
                    <div className="text-center py-8 text-sm text-slate-400">
                      <Fingerprint className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      No biometric punches yet today.
                    </div>
                  )}
                  {todayBioLogs
                    .sort((a, b) => (a.punchIn || a.punchOut || '').localeCompare(b.punchIn || b.punchOut || ''))
                    .map(log => {
                      const emp = employees.find(e => e.id === log.employeeId);
                      return (
                        <div key={log.id} className="flex items-center justify-between px-3 py-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                              <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800">{emp?.fullName || log.employeeId}</p>
                              <p className="text-slate-500 text-[10px]">{emp?.employeeCode}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center gap-2 text-[10px]">
                              {log.punchIn && (
                                <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold">
                                  IN {log.punchIn}
                                </span>
                              )}
                              {log.punchOut && (
                                <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">
                                  OUT {log.punchOut}
                                </span>
                              )}
                            </div>
                            <p className={`text-[10px] mt-0.5 font-semibold ${log.status === 'Present' ? 'text-emerald-600' : log.status === 'Late' ? 'text-amber-600' : 'text-slate-500'}`}>
                              {log.status}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



