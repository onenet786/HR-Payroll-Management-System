/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Scan, User, Cpu, ShieldCheck, AlertCircle, Camera, CheckCircle, VideoOff, Settings, X, Trash2, RefreshCw, Users, Sparkles
} from 'lucide-react';
import { Employee, AttendanceLog, Branch, MobilePunchDetails } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { captureBiometric } from '../utils/uru4500Bridge';
import { assessBrowserFaceDetection, createFaceDescriptorFromVideo, findBestFaceMatch, hasFaceEnrollment, FACE_MATCH_THRESHOLD } from '../utils/faceRecognition';
import { performActiveLiveness, randomLivenessOrder } from '../utils/faceLiveness';
import { MultiFaceTracker } from '../utils/multiFaceTracker';
import { drawMultiFaceHUD } from '../utils/faceCanvasOverlay';

const RETURNABLE_CHECKOUT_REASONS = new Set([
  'Lunch Break', 'Tea Break', 'Official Duty', 'Client Meeting', 'Site Visit',
  'Personal Work', 'Medical Appointment', 'Prayer',
]);

interface KioskTerminalProps {
  employees: Employee[];
  attendances: AttendanceLog[];
  onSimulatePunch: (employeeId: string, punchIn: string, punchOut: string, method: string, lat?: number, lon?: number, locationAccuracyMeters?: number, locationCapturedAt?: string, locationAddress?: string, mobileDetails?: MobilePunchDetails) => void | Promise<void>;
  nativeMobileKiosk?: boolean;
  branches?: Branch[];
  onExitKiosk?: () => void;
}

export function KioskTerminal({
  employees,
  attendances,
  onSimulatePunch,
  nativeMobileKiosk = false,
  branches = [],
  onExitKiosk,
}: KioskTerminalProps) {
  const [method, setMethod] = useState<'id' | 'fingerprint' | 'face'>(nativeMobileKiosk ? 'face' : 'id');
  
  // ID state
  const [empIdInput, setEmpIdInput] = useState('');
  
  // Status states
  const [status, setStatus] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [matchedEmp, setMatchedEmp] = useState<Employee | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [pendingCheckout, setPendingCheckout] = useState<{ employee: Employee; punchMethod: string; time: string } | null>(null);
  const [checkoutReason, setCheckoutReason] = useState('');
  const [kioskSettings, setKioskSettings] = useState(() => {
    const defaults = { terminalId: 'KIOSK-MOB-01', location: 'Main Entrance Gate-1', branchId: '', autoCapture: true };
    try {
      const saved = window.localStorage.getItem('mobile_kiosk_settings');
      return saved ? { ...defaults, ...JSON.parse(saved) } as { terminalId: string; location: string; branchId: string; autoCapture: boolean } : defaults;
    } catch { return defaults; }
  });
  const faceScanBusyRef = useRef(false);
  const autoStableFramesRef = useRef(0);
  const autoCaptureArmedRef = useRef(true);

  // Multi-Face Tracking states
  const [faceMode, setFaceMode] = useState<'multi' | 'single'>('multi');
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const multiTrackerRef = useRef<MultiFaceTracker>(new MultiFaceTracker(5));
  const [recentPunches, setRecentPunches] = useState<Array<{ id: string; name: string; code: string; time: string; type: 'in' | 'out' }>>([]);

  // Camera states
  const [hasWebcam, setHasWebcam] = useState<boolean | null>(null);
  const [cameraError, setCameraError] = useState('');
  const [streamActive, setStreamActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Time clock state
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Handle webcam setup
  useEffect(() => {
    if (method === 'face') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [method]);

  const startCamera = async () => {
    try {
      setHasWebcam(null);
      setCameraError('');
      if (nativeMobileKiosk) {
        const permission = await (window as any).Capacitor?.Plugins?.DeviceSettingsPlugin?.ensureCameraPermission();
        if (permission && !permission.granted) {
          await new Promise(resolve => setTimeout(resolve, 1200));
          const checked = await (window as any).Capacitor?.Plugins?.DeviceSettingsPlugin?.ensureCameraPermission();
          if (!checked?.granted) throw new Error('Android camera permission is not granted.');
        }
      }
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      } else {
        stream.getTracks().forEach(track => track.stop());
        throw new Error('Camera preview is not mounted. Tap Retry Camera.');
      }
      setStreamActive(true);
      setHasWebcam(true);
    } catch (err) {
      console.warn('Webcam permission denied or unavailable.', err);
      setCameraError(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
      setHasWebcam(false);
      setStreamActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setStreamActive(false);
  };

  const restartFaceScan = async () => {
    faceScanBusyRef.current = false;
    autoStableFramesRef.current = 0;
    autoCaptureArmedRef.current = true;
    setPendingCheckout(null);
    setCheckoutReason('');
    setMatchedEmp(null);
    setMessage('Restarting face scanner...');
    setStatus('idle');
    stopCamera();
    await new Promise(resolve => setTimeout(resolve, 250));
    await startCamera();
    setMessage('');
  };

  // Keyboard pad helpers
  const handleKeyPress = (num: string) => {
    if (status === 'scanning' || status === 'success') return;
    if (empIdInput.length < 12) {
      setEmpIdInput(prev => prev + num);
    }
  };

  const handleBackspace = () => {
    if (status === 'scanning' || status === 'success') return;
    setEmpIdInput(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (status === 'scanning' || status === 'success') return;
    setEmpIdInput('');
  };

  function playPunchChime() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch {
      // Audio context not allowed or not supported
    }
  }

  // Run the punch process
  const triggerPunch = async (emp: Employee, punchMethod: string, confirmedOutReason = '', isMultiMode = false) => {
    // Generate current formatted time
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const timeStr = `${hh}:${mm}:${ss}`;

    // Punch log check today
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayAttendance = attendances.find(a => a.employeeId === emp.id && a.date === todayStr);
    const isReturningFromTemporaryExit = Boolean(todayAttendance?.punchOut && RETURNABLE_CHECKOUT_REASONS.has(todayAttendance.outReason?.trim() || ''));
    const isClockIn = !todayAttendance?.punchIn || isReturningFromTemporaryExit;
    if (todayAttendance?.punchOut && !isReturningFromTemporaryExit) {
      if (!isMultiMode) {
        setStatus('error');
        setMessage(`${emp.fullName} has already completed attendance for today.`);
        setTimeout(() => { setStatus('idle'); setMessage(''); }, 3500);
      }
      return;
    }

    const lastPunchTime = todayAttendance?.lastPunchAt || todayAttendance?.punchOut || todayAttendance?.punchIn;
    if (lastPunchTime) {
      const [lastHours, lastMinutes, lastSeconds] = lastPunchTime.split(':').map(Number);
      const lastPunchSeconds = lastHours * 3600 + lastMinutes * 60 + (lastSeconds || 0);
      const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      const secondsSinceLastPunch = currentSeconds - lastPunchSeconds;
      if (secondsSinceLastPunch >= 0 && secondsSinceLastPunch < 60) {
        if (!isMultiMode) {
          const remaining = 60 - secondsSinceLastPunch;
          setStatus('error');
          setMessage(`Please wait ${remaining} second${remaining === 1 ? '' : 's'} before punching again. Minimum delay is 1 minute between punches.`);
          setTimeout(() => { setStatus('idle'); setMessage(''); }, 3500);
        }
        return;
      }
    }

    if (!isClockIn && nativeMobileKiosk && !confirmedOutReason) {
      setPendingCheckout({ employee: emp, punchMethod, time: timeStr });
      setCheckoutReason('');
      setMatchedEmp(emp);
      setStatus('scanning');
      setMessage('Select a checkout reason to complete Punch Out.');
      return;
    }

    const checkoutDetails: MobilePunchDetails | undefined = !isClockIn && confirmedOutReason
      ? { action: 'workday-out', reasonCategory: 'Kiosk checkout', reasonNote: confirmedOutReason, verificationMethod: 'Camera' }
      : undefined;
    await onSimulatePunch(emp.id, isClockIn ? timeStr : '', isClockIn ? '' : timeStr, nativeMobileKiosk ? 'Mobile Kiosk' : punchMethod, undefined, undefined, undefined, undefined, undefined, checkoutDetails);
    
    playPunchChime();

    if (isMultiMode) {
      setRecentPunches(prev => [
        { id: `${emp.id}-${Date.now()}`, name: emp.fullName, code: emp.employeeCode, time: timeStr, type: isClockIn ? 'in' : 'out' },
        ...prev.filter(p => p.code !== emp.employeeCode).slice(0, 4)
      ]);
    } else {
      setMatchedEmp(emp);
      setStatus('success');
      setMessage(isClockIn 
        ? `${isReturningFromTemporaryExit ? `Welcome back ${emp.fullName}! Return` : `Welcome ${emp.fullName}! Check-In`} registered at ${timeStr}.`
        : `Goodbye ${emp.fullName}! Check-Out registered at ${timeStr}.`
      );

      setTimeout(() => {
        setStatus('idle');
        setEmpIdInput('');
        setMatchedEmp(null);
        setMessage('');
      }, 4000);
    }
  };

  // 1. Submit ID
  const handleIdSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!empIdInput) return;

    setStatus('scanning');
    setTimeout(() => {
      const cleanInput = empIdInput.trim();
      const cleanDigits = cleanInput.replace(/\D/g, '');
      const emp = employees.find(
        e => (e.status ?? 'Active') === 'Active' && (
          e.employeeCode.toUpperCase() === cleanInput.toUpperCase() ||
          e.employeeCode.toLowerCase().endsWith(cleanInput.toLowerCase()) ||
          (cleanDigits.length >= 5 && e.cnic && e.cnic.replace(/\D/g, '') === cleanDigits) ||
          (e.email && e.email.toLowerCase() === cleanInput.toLowerCase())
        )
      );

      if (emp) {
        void triggerPunch(emp, 'RFID'); // Kiosk counts as RFID/card terminal check-in
      } else {
        setStatus('error');
        setMessage('Invalid Employee Code. Please verify and try again.');
        setTimeout(() => setStatus('idle'), 3000);
      }
    }, 1000);
  };

  // 2. Submit Biometric
  const handleBiometricScan = async () => {
    if (status === 'scanning') return;
    
    setStatus('scanning');
    setMessage('Place finger firmly on the URU 4500 / SecuGen Hamster Pro fingerprint reader...');

    try {
      await captureBiometric();
      setStatus('error');
      setMessage('Browser biometric punching is disabled because it cannot securely prove template ownership. Use the authenticated desktop kiosk.');
      setTimeout(() => setStatus('idle'), 5000);
    } catch {
      setStatus('error');
      setMessage('Fingerprint verification failed. Try again or contact an administrator.');
      setTimeout(() => setStatus('idle'), 4000);
    }
  };

  // 3. Submit Face Scan (1-on-1 Secure Mode)
  const handleFaceScan = async () => {
    if (status === 'scanning' || faceScanBusyRef.current) return;
    faceScanBusyRef.current = true;

    setStatus('scanning');
    setMessage('Align your face inside the framing box. Comparing enrolled camera profile...');

    try {
      if (!videoRef.current || !streamActive) {
        throw new Error('Camera is not ready. Allow webcam access and try again.');
      }
      const enrolledEmployees = employees.filter(employee => employee.status === 'Active' && (!kioskSettings.branchId || employee.branchId === kioskSettings.branchId) && hasFaceEnrollment(employee));
      if (enrolledEmployees.length === 0) {
        throw new Error('No camera face profiles are enrolled yet. Enroll employees from HR biometric setup first.');
      }
      await new Promise(resolve => setTimeout(resolve, 500));
      const frameQuality = await assessBrowserFaceDetection(videoRef.current);
      if (!frameQuality?.ok) throw new Error(frameQuality?.message || 'Keep one complete face inside the oval.');
      const liveness = await performActiveLiveness(videoRef.current, randomLivenessOrder(), statusMessage => setMessage(statusMessage));
      if (!liveness.ok) throw new Error(liveness.message);
      const probe = createFaceDescriptorFromVideo(videoRef.current, 'kiosk-webcam');
      const match = findBestFaceMatch(enrolledEmployees, probe, FACE_MATCH_THRESHOLD);
      if (!match) {
        throw new Error('Face not recognized. Step closer, improve lighting, or re-enroll the camera profile.');
      }
      setMessage(`Face match confidence ${(Math.max(0, 1 - match.score / FACE_MATCH_THRESHOLD) * 100).toFixed(1)}%.`);
      await triggerPunch(match.employee, 'Camera');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Face verification failed. Try again or contact an administrator.');
      setTimeout(() => setStatus('idle'), 3500);
    } finally {
      faceScanBusyRef.current = false;
    }
  };

  // Continuous Multi-Face Detection and Tracking Loop
  useEffect(() => {
    if (method !== 'face' || faceMode !== 'multi' || !streamActive || !videoRef.current) return;
    let active = true;
    let isProcessing = false;

    const intervalId = window.setInterval(async () => {
      if (!active || isProcessing || !videoRef.current || !overlayCanvasRef.current) return;
      const video = videoRef.current;
      const canvas = overlayCanvasRef.current;

      if (!video.videoWidth || !video.videoHeight) return;

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      isProcessing = true;
      try {
        const activeEnrolled = employees.filter(
          emp => emp.status === 'Active' && (!kioskSettings.branchId || emp.branchId === kioskSettings.branchId) && hasFaceEnrollment(emp)
        );

        const renderData = await multiTrackerRef.current.processFrame(
          video,
          activeEnrolled,
          async matchedEmp => {
            await triggerPunch(matchedEmp, 'Camera-Multi', undefined, true);
          }
        );

        if (active && overlayCanvasRef.current) {
          drawMultiFaceHUD(overlayCanvasRef.current, renderData, true);
        }
      } catch {
        // catch frame errors
      } finally {
        isProcessing = false;
      }
    }, 110);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      if (overlayCanvasRef.current) {
        const ctx = overlayCanvasRef.current.getContext('2d');
        ctx?.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
      }
    };
  }, [method, faceMode, streamActive, employees, kioskSettings.branchId]);

  // Single-Mode Auto-capture timer (for native or enabled stations)
  useEffect(() => {
    if (faceMode !== 'single' || !kioskSettings.autoCapture || method !== 'face' || !streamActive || status !== 'idle' || pendingCheckout) return;
    const timer = window.setInterval(async () => {
      if (faceScanBusyRef.current || !videoRef.current) return;
      try {
        const quality = await assessBrowserFaceDetection(videoRef.current);
        if (!quality?.ok) {
          autoStableFramesRef.current = 0;
          autoCaptureArmedRef.current = true;
          return;
        }
        if (!autoCaptureArmedRef.current) return;
        autoStableFramesRef.current += 1;
        if (autoStableFramesRef.current >= 3) {
          autoStableFramesRef.current = 0;
          autoCaptureArmedRef.current = false;
          void handleFaceScan();
        }
      } catch {
        autoStableFramesRef.current = 0;
      }
    }, 700);
    return () => window.clearInterval(timer);
  }, [faceMode, kioskSettings.autoCapture, method, pendingCheckout, status, streamActive]);

  return (
    <div className={`w-full max-w-5xl mx-auto bg-slate-950 border-slate-800 shadow-2xl text-slate-100 flex flex-col h-full max-h-full justify-between relative overflow-hidden font-sans select-none ${nativeMobileKiosk ? 'p-2' : 'border-4 rounded-[36px] p-6'}`} id="kiosk-container">
      
      {/* Laser grids or scanline background effects for high-end aesthetic */}
      <div className="absolute inset-0 bg-radial-gradient from-slate-900 via-slate-950 to-black pointer-events-none opacity-40"></div>

      {pendingCheckout && <div className="absolute inset-0 z-[80] flex items-center justify-center bg-slate-950/90 p-4">
        <form className="w-full max-w-md rounded-2xl border border-amber-500/40 bg-slate-900 p-5 shadow-2xl" onSubmit={async event => {
          event.preventDefault();
          if (!checkoutReason.trim()) return;
          const pending = pendingCheckout;
          try {
            await triggerPunch(pending.employee, pending.punchMethod, checkoutReason.trim());
            setPendingCheckout(null);
          } catch (error) {
            setPendingCheckout(null);
            setMatchedEmp(null);
            setStatus('error');
            setMessage(error instanceof Error ? error.message : 'Attendance could not be saved to Database. Try again.');
            setTimeout(() => { setStatus('idle'); setMessage(''); }, 4500);
          }
        }}>
          <h3 className="text-lg font-black text-white">Punch Out Reason</h3>
          <p className="mt-1 text-xs text-slate-400">{pendingCheckout.employee.fullName} · Face verified at {pendingCheckout.time}</p>
          <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-amber-300">Reason is required</label>
          <select autoFocus value={checkoutReason} onChange={event => setCheckoutReason(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white">
            <option value="">Select checkout reason</option>
            <option>End of Shift</option>
            <option>Lunch Break</option>
            <option>Tea Break</option>
            <option>Official Duty</option>
            <option>Client Meeting</option>
            <option>Site Visit</option>
            <option>Personal Work</option>
            <option>Medical Appointment</option>
            <option>Prayer</option>
            <option>Emergency</option>
          </select>
          <div className="mt-4 flex gap-3">
            <button type="button" onClick={() => { setPendingCheckout(null); setCheckoutReason(''); setMatchedEmp(null); setStatus('idle'); setMessage(''); }} className="flex-1 rounded-xl border border-slate-700 p-3 text-xs font-bold text-slate-300">CANCEL</button>
            <button type="submit" disabled={!checkoutReason} className="flex-1 rounded-xl bg-amber-600 p-3 text-xs font-black text-white disabled:opacity-40">CONFIRM PUNCH OUT</button>
          </div>
        </form>
      </div>}

      {/* Header bar showing Time & Kiosk mode status */}
      <div className={`flex justify-between items-center border-b border-slate-800 z-10 ${nativeMobileKiosk ? 'pb-1' : 'pb-4'}`}>
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-extrabold text-sm shadow-md animate-pulse">
            B
          </div>
          <div>
            <h3 className="font-bold text-xs uppercase tracking-widest text-emerald-400">Terminal Kiosk Mode</h3>
            <p className="text-[10px] text-slate-400 font-mono">{kioskSettings.location} · {kioskSettings.terminalId}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-right font-mono">
          {nativeMobileKiosk && <button type="button" onClick={() => setShowSettings(true)} className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-300" aria-label="Kiosk settings"><Settings className="h-4 w-4" /></button>}
          <div>
          <p className="text-sm font-bold text-white tracking-wider">
            {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
          <p className="text-[9px] text-slate-400">{time.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p>
          </div>
        </div>
      </div>

      {showSettings && <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/95 p-3">
        <div className="max-h-full w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-4">
          <div className="mb-3 flex items-center justify-between"><div><h3 className="font-bold text-white">Mobile Kiosk Settings</h3><p className="text-[10px] text-slate-400">Terminal configuration and local maintenance</p></div><button type="button" onClick={() => setShowSettings(false)} className="rounded-lg p-2 text-slate-400"><X className="h-5 w-5" /></button></div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-[10px] text-slate-400">Terminal ID<input value={kioskSettings.terminalId} onChange={e => setKioskSettings(p => ({ ...p, terminalId: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white" /></label>
            <label className="text-[10px] text-slate-400">Location / Description<input value={kioskSettings.location} onChange={e => setKioskSettings(p => ({ ...p, location: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white" /></label>
            <label className="text-[10px] text-slate-400 md:col-span-2">Assigned Branch<select value={kioskSettings.branchId} onChange={e => setKioskSettings(p => ({ ...p, branchId: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white"><option value="">Company wide — all active employees</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}</select></label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 p-2 text-[10px] text-slate-300 md:col-span-2"><input type="checkbox" checked={kioskSettings.autoCapture} onChange={e => setKioskSettings(p => ({ ...p, autoCapture: e.target.checked }))} /> Automatically verify and punch when one face is centered</label>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void startCamera()} className="rounded-lg bg-emerald-700 p-2 text-[10px] font-bold text-white">START / RETRY CAMERA</button>
            <button type="button" onClick={() => void (window as any).Capacitor?.Plugins?.DeviceSettingsPlugin?.openAppSettings()} className="rounded-lg border border-slate-600 bg-slate-800 p-2 text-[10px] font-bold text-slate-200">ANDROID CAMERA PERMISSION</button>
            <button type="button" onClick={async () => { if (window.confirm('Flush the kiosk WebView cache? Saved attendance records will not be deleted.')) { await (window as any).Capacitor?.Plugins?.DeviceSettingsPlugin?.clearKioskCache(); window.location.reload(); } }} className="col-span-2 flex items-center justify-center gap-2 rounded-lg border border-rose-800 bg-rose-950/40 p-2 text-[10px] font-bold text-rose-300"><Trash2 className="h-3 w-3" /> FLUSH LOCAL WEB CACHE</button>
          </div>
          <button type="button" onClick={() => { const saved = { terminalId: kioskSettings.terminalId.trim() || 'KIOSK-MOB-01', location: kioskSettings.location.trim() || 'Main Entrance Gate-1', branchId: kioskSettings.branchId, autoCapture: kioskSettings.autoCapture }; window.localStorage.setItem('mobile_kiosk_settings', JSON.stringify(saved)); setKioskSettings(saved); setShowSettings(false); }} className="mt-4 w-full rounded-lg bg-indigo-700 p-2 text-xs font-bold text-white">SAVE KIOSK SETTINGS</button>
          {nativeMobileKiosk && onExitKiosk && <button type="button" onClick={() => {
            void (window as any).Capacitor?.Plugins?.DeviceSettingsPlugin?.setKioskFullscreen({ enabled: false });
            onExitKiosk();
          }} className="mt-2 w-full rounded-lg border border-rose-700 bg-rose-950/60 p-2 text-xs font-bold text-rose-200">LOG OFF / EXIT KIOSK</button>}
        </div>
      </div>}

      {/* Main interactive terminal area */}
      <div className={`flex-1 flex items-center justify-center z-10 overflow-hidden ${nativeMobileKiosk ? 'flex-row gap-2 py-2' : 'flex-col md:flex-row gap-6 py-6'}`}>
        
        {/* Left Side: Method Controller Tabs */}
        {!nativeMobileKiosk && <div className="flex md:flex-col gap-2 w-full md:w-44 flex-shrink-0">
          <button 
            onClick={() => { setMethod('id'); setStatus('idle'); setMessage(''); }}
            className={`flex-1 py-3 px-3 rounded-xl border transition flex items-center space-x-2 text-left font-semibold text-xs leading-none ${
              method === 'id' 
                ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400 shadow' 
                : 'bg-slate-900 border-slate-800 hover:bg-slate-850 text-slate-400'
            }`}
          >
            <User className="w-4 h-4 flex-shrink-0" />
            <span>Employee ID</span>
          </button>

          <button 
            onClick={() => { setMethod('fingerprint'); setStatus('idle'); setMessage(''); }}
            className={`flex-1 py-3 px-3 rounded-xl border transition flex items-center space-x-2 text-left font-semibold text-xs leading-none ${
              method === 'fingerprint' 
                ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400 shadow' 
                : 'bg-slate-900 border-slate-800 hover:bg-slate-850 text-slate-400'
            }`}
          >
            <Cpu className="w-4 h-4 flex-shrink-0" />
            <span>Biometric Scan</span>
          </button>

          <button 
            onClick={() => { setMethod('face'); setStatus('idle'); setMessage(''); }}
            className={`flex-1 py-3 px-3 rounded-xl border transition flex items-center space-x-2 text-left font-semibold text-xs leading-none ${
              method === 'face' 
                ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400 shadow' 
                : 'bg-slate-900 border-slate-800 hover:bg-slate-850 text-slate-400'
            }`}
          >
            <Camera className="w-4 h-4 flex-shrink-0" />
            <span>Face ID</span>
          </button>
        </div>}

        {/* Right Side: Interactive Scanner screen depending on method */}
        <div className={`flex-1 bg-slate-900/60 border border-slate-800/80 rounded-2xl flex flex-col items-center justify-center w-full relative h-full min-h-0 ${nativeMobileKiosk ? 'p-0' : 'p-4 min-h-[220px]'}`}>
          
          <AnimatePresence mode="wait">
            
            {/* STATUS MESSAGE OVERLAYS */}
            {status === 'scanning' && !(nativeMobileKiosk && method === 'face') && (
              <motion.div 
                key="scanning"
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-950/90 rounded-2xl flex flex-col items-center justify-center p-6 text-center z-20 space-y-4"
              >
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <div className="absolute inset-0 border-4 border-emerald-500/20 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-t-emerald-400 rounded-full animate-spin"></div>
                  <Scan className="w-6 h-6 text-emerald-400 animate-pulse" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-emerald-400 uppercase tracking-widest">Scanning Verification...</h4>
                  <p className="text-xs text-slate-400 mt-2">{message}</p>
                </div>
              </motion.div>
            )}

            {status === 'success' && matchedEmp && (
              <motion.div 
                key="success"
                initial={{ scale: 0.9, opacity: 0 }} 
                animate={{ scale: 1, opacity: 1 }} 
                exit={{ scale: 0.9, opacity: 0 }}
                className="absolute inset-0 bg-slate-950/95 rounded-2xl flex flex-col items-center justify-center p-6 text-center z-20 space-y-4"
              >
                <div className="w-16 h-16 rounded-full bg-emerald-950/60 border border-emerald-500 flex items-center justify-center text-emerald-400">
                  <CheckCircle className="w-9 h-9" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-lg text-white">ACCESS GRANTED</h4>
                  <p className="text-xs text-emerald-400 font-mono font-bold">{matchedEmp.fullName}</p>
                  <p className="text-[10px] text-slate-500 font-mono">Code: {matchedEmp.employeeCode} • {matchedEmp.wageType}</p>
                  <p className="text-xs text-slate-350 mt-2 px-4 py-1.5 bg-slate-900 rounded-lg">{message}</p>
                </div>
              </motion.div>
            )}

            {status === 'error' && (
              <motion.div 
                key="error"
                initial={{ scale: 0.9, opacity: 0 }} 
                animate={{ scale: 1, opacity: 1 }} 
                exit={{ scale: 0.9, opacity: 0 }}
                className="absolute inset-0 bg-slate-950/95 rounded-2xl flex flex-col items-center justify-center p-6 text-center z-20 space-y-4"
              >
                <div className="w-16 h-16 rounded-full bg-rose-950/60 border border-rose-500 flex items-center justify-center text-rose-400">
                  <AlertCircle className="w-9 h-9" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-rose-400 uppercase tracking-widest">VERIFICATION FAILED</h4>
                  <p className="text-xs text-slate-300 mt-2">{message}</p>
                </div>
              </motion.div>
            )}

          </AnimatePresence>

          {/* VIEWPORT CONTROLS */}
          {method === 'id' && (
            <motion.div 
              key="view-id"
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full flex flex-col md:flex-row gap-4 items-center justify-center h-full"
            >
              <div className="flex-1 flex flex-col justify-center space-y-3 w-full">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Enter Employee ID Code:</label>
                  <form onSubmit={handleIdSubmit} className="flex space-x-2">
                    <input
                      type="text"
                      aria-label="Employee ID Code"
                      placeholder="e.g. IND-KHI-001"
                      value={empIdInput}
                      onChange={(e) => setEmpIdInput(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-center text-sm font-mono text-white tracking-widest focus:outline-none focus:border-emerald-500 flex-1"
                    />
                    <button 
                      type="submit" 
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 rounded-lg shadow-md transition"
                    >
                      PUNCH
                    </button>
                  </form>
                </div>
                <p className="text-[10px] text-slate-400 italic">
                  * Typable inputs match codes like <code>IND-KHI-001</code>, <code>002</code>, etc.
                </p>
              </div>

              {/* Number key pad */}
              <div className="grid grid-cols-3 gap-1.5 w-48 bg-slate-950/80 p-2 rounded-xl border border-slate-850/80 flex-shrink-0">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      if (k === 'C') handleClear();
                      else if (k === '⌫') handleBackspace();
                      else handleKeyPress(k);
                    }}
                    className="h-10 rounded-lg bg-slate-900 border border-slate-800/80 hover:bg-slate-800 text-xs font-mono font-bold text-slate-200 active:bg-emerald-800 transition"
                  >
                    {k}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {method === 'fingerprint' && (
            <motion.div 
              key="view-finger"
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center space-y-5 h-full text-center"
            >
              <div className="text-slate-400 text-[11px] max-w-xs leading-normal">
                Place finger on the DigitalPersona U.are.U 4500 or SecuGen Hamster Pro reader. Enter employee code first for direct employee matching.
              </div>
              
              <button 
                onClick={handleBiometricScan}
                className="w-32 h-32 rounded-2xl bg-slate-950 border border-slate-800/80 shadow-inner hover:border-emerald-500/50 hover:bg-slate-900/60 active:scale-95 transition flex flex-col items-center justify-center group relative cursor-pointer"
              >
                <div className="absolute inset-0 bg-emerald-500/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <Cpu className="w-14 h-14 text-slate-600 group-hover:text-emerald-500 transition animate-pulse" />
                <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mt-2">Biometric Zone</span>
              </button>

              <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest bg-emerald-950/20 border border-emerald-900/40 px-3 py-1 rounded-full">
                DEVICE: Biometric Bridge ws://127.0.0.1:15896
              </span>
            </motion.div>
          )}

          {method === 'face' && (
            <motion.div 
              key="view-face"
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full flex flex-col items-center justify-center gap-3 h-full relative"
            >
              {/* Top Mode Selector Bar */}
              <div className="flex items-center justify-between w-full max-w-[640px] px-1">
                <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 p-1 rounded-xl shadow-inner">
                  <button
                    type="button"
                    onClick={() => setFaceMode('multi')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                      faceMode === 'multi'
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Multi-Face Stream</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFaceMode('single')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                      faceMode === 'single'
                        ? 'bg-amber-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>1-on-1 Liveness</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border ${
                    faceMode === 'multi'
                      ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-400'
                      : 'bg-amber-950/60 border-amber-700/60 text-amber-300'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${faceMode === 'multi' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-ping'}`} />
                    {faceMode === 'multi' ? 'CONTINUOUS WALK-THROUGH' : 'ACTIVE CHALLENGE'}
                  </span>
                </div>
              </div>

              {/* Webcam Frame Container with Canvas Overlay */}
              <div className="relative w-full max-w-[640px] aspect-[4/3] bg-slate-950 border-2 border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center">
                {hasWebcam !== false && (
                  <video 
                    ref={videoRef} 
                    className={`w-full h-full object-cover scale-x-[-1] ${streamActive ? 'opacity-100' : 'opacity-0'}`}
                    playsInline 
                    muted 
                  />
                )}

                {/* Real-Time Multi-Face Bounding Box Canvas Overlay */}
                {faceMode === 'multi' && streamActive && (
                  <canvas
                    ref={overlayCanvasRef}
                    className="absolute inset-0 w-full h-full pointer-events-none"
                  />
                )}

                {/* 1-on-1 Oval Guide when in single challenge mode */}
                {faceMode === 'single' && hasWebcam !== false && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="relative rounded-[50%] border-2 border-emerald-400 shadow-[0_0_0_999px_rgba(2,6,23,0.38)] w-44 h-60">
                      <div className="absolute -top-1 left-1/2 h-2 w-10 -translate-x-1/2 rounded-full bg-emerald-300"></div>
                      <div className="absolute top-20 left-1/2 h-px w-24 -translate-x-1/2 bg-emerald-300/80"></div>
                      <div className="absolute bottom-14 left-1/2 h-px w-14 -translate-x-1/2 bg-emerald-300/70"></div>
                    </div>
                  </div>
                )}

                {hasWebcam === false ? (
                  <div className="flex flex-col items-center text-center p-4 text-slate-500 space-y-2">
                    <VideoOff className="w-10 h-10 text-slate-700 animate-pulse" />
                    <span className="text-[11px] leading-relaxed">{cameraError || 'Camera access is blocked or unavailable.'}</span>
                    <button type="button" onClick={() => void startCamera()} className="rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-bold text-white">START / RETRY CAMERA</button>
                    {nativeMobileKiosk && <button type="button" onClick={() => void (window as any).Capacitor?.Plugins?.DeviceSettingsPlugin?.openAppSettings()} className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-[10px] font-bold text-slate-200">OPEN APP SETTINGS</button>}
                  </div>
                ) : !streamActive ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 space-y-2 text-xs">
                    <div className="w-6 h-6 border-2 border-slate-600 border-t-slate-400 rounded-full animate-spin"></div>
                    <span>Initializing camera...</span>
                  </div>
                ) : null}

                {/* Bottom Model Badge */}
                <div className="absolute bottom-2 left-2 bg-slate-900/80 px-2 py-0.5 text-[8px] font-mono text-emerald-400 rounded border border-emerald-900/50">
                  {faceMode === 'multi' ? 'ENGINE: MULTI_TRACK_V1 (AUTO_PUNCH)' : 'CV_MODEL: v4.1 (FACE_DETECT)'}
                </div>

                {/* Mode description pill */}
                <div className="absolute top-2 right-2 bg-slate-900/80 px-2 py-0.5 text-[9px] font-mono text-slate-300 rounded border border-slate-700/60">
                  {faceMode === 'multi' ? 'WALK-IN · MULTI-PERSON' : '1-TO-1 CHALLENGE'}
                </div>
              </div>

              {/* Bottom Control & Feed Section */}
              <div className="w-full max-w-[640px] flex flex-col gap-2">
                {faceMode === 'single' ? (
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={handleFaceScan}
                      disabled={status === 'scanning'}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold uppercase rounded-xl flex-1 py-2.5 text-xs flex items-center justify-center space-x-1.5 shadow"
                    >
                      <Scan className="w-4 h-4" />
                      <span>{status === 'scanning' ? message : 'START 1-ON-1 SCAN & PUNCH'}</span>
                    </button>
                    {nativeMobileKiosk && (
                      <button
                        type="button"
                        onClick={() => void restartFaceScan()}
                        className="rounded-xl border border-indigo-500/50 bg-indigo-950/60 px-4 py-2.5 text-xs font-bold uppercase text-indigo-200"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ) : (
                  /* Multi-Face Live Recent Punches Feed */
                  <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-2.5 text-xs flex items-center justify-between gap-2 overflow-hidden shadow-md">
                    <div className="flex items-center gap-2 shrink-0">
                      <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 animate-pulse" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Live Attendees:</span>
                    </div>
                    {recentPunches.length === 0 ? (
                      <span className="text-[11px] text-slate-500 italic">Stand in front of the camera to automatically mark attendance...</span>
                    ) : (
                      <div className="flex items-center gap-2 overflow-x-auto py-0.5">
                        {recentPunches.map(punch => (
                          <span
                            key={punch.id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-700/60 text-emerald-300 text-[10px] font-bold shrink-0"
                          >
                            <CheckCircle className="w-3 h-3 text-emerald-400" />
                            {punch.name} ({punch.time})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}

        </div>

      </div>

      {/* Terminal Kiosk Footer showing diagnostic node states */}
      <div className={`border-t border-slate-900 pt-3 justify-between items-center text-[10px] text-slate-500 font-mono z-10 leading-none ${nativeMobileKiosk ? 'hidden' : 'flex'}`}>
        <div className="flex space-x-4">
          <span className="flex items-center text-emerald-500 font-semibold uppercase">
            <ShieldCheck className="w-3.5 h-3.5 mr-1" />
            SECURE ACCESS: ON
          </span>
          <span className="hidden sm:inline border-l border-slate-900 pl-4">CAMERA NODE: {hasWebcam ? 'LIVE WEBCAM' : 'SIMULATION'}</span>
        </div>
        <span>ZK-FACE_ID PRO v12.1</span>
      </div>

    </div>
  );
}


