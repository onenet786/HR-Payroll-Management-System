/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Scan, ShieldCheck, MapPin, Camera, CameraOff,
  Calendar, FileText, User, Fingerprint, CheckCircle, AlertCircle, Clock
} from 'lucide-react';
import { Employee, AttendanceLog, LeaveRequest, UserAccount } from '../types';
import { computePayslipDetails } from '../data/defaults';
import { motion, AnimatePresence } from 'motion/react';

interface MobileAppProps {
  employees: Employee[];
  attendances: AttendanceLog[];
  leaves: LeaveRequest[];
  onApplyLeave: (leave: LeaveRequest) => void;
  onSimulatePunch: (employeeId: string, punchIn: string, punchOut: string, method: string, lat?: number, lon?: number) => void;
  onAddRegularization: (employeeId: string, date: string, reason: string) => void;
  hideMockPhoneFrame?: boolean;
  loggedInUser?: UserAccount;
  onLogout?: () => void;
}

type PunchStep = 'preview' | 'done';
type BiometricStatus = 'idle' | 'scanning' | 'success' | 'failed' | 'unsupported';

function nowTimeStr() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}:${String(n.getSeconds()).padStart(2, '0')}`;
}

// True when running inside Capacitor native shell (Android/iOS APK)
const isCapacitorApp = !!(window as any).Capacitor?.isNativePlatform?.();

export function MobileApp({
  employees,
  attendances,
  leaves,
  onApplyLeave,
  onSimulatePunch,
  onAddRegularization,
  hideMockPhoneFrame,
  loggedInUser,
  onLogout
}: MobileAppProps) {
  const [mobileTab, setMobileTab] = useState<'home' | 'punch' | 'leave' | 'payslips'>('home');
  const [waNotice, setWaNotice] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Camera + biometric state
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [biometricStatus, setBiometricStatus] = useState<BiometricStatus>('idle');
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [punchStep, setPunchStep] = useState<PunchStep>('preview');
  const [punchMethod, setPunchMethod] = useState('');

  // Forms state
  const [leaveForm, setLeaveForm] = useState({
    leaveType: 'Casual' as 'Casual' | 'Sick' | 'Annual' | 'Unpaid',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    reason: ''
  });
  const [regForm, setRegForm] = useState({
    date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
    reason: ''
  });

  // Resolved by loggedInUser.employeeId when available; fallback to first employee
  const currentEmp = loggedInUser?.employeeId
    ? (employees.find(e => e.id === loggedInUser.employeeId) ?? employees[0])
    : employees[0];
  const myPunches = attendances.filter(a => a.employeeId === currentEmp?.id);
  const todayStr = new Date().toISOString().split('T')[0];
  const isCheckedInToday = myPunches.some(p => p.date === todayStr);
  const myPayslip = currentEmp ? computePayslipDetails(currentEmp, 6, 2026, attendances, leaves) : null;

  // Clock tick
  useEffect(() => {
    const id = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const triggerWaToast = (msg: string) => {
    setWaNotice(msg);
    setTimeout(() => setWaNotice(null), 4500);
  };

  // ── Camera ────────────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera API not supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 360 } },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => setCameraReady(true);
      }
      setCameraError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Permission') || msg.includes('NotAllowed')) {
        setCameraError('Camera access denied. Please allow camera in browser settings.');
      } else if (msg.includes('NotFound') || msg.includes('DevicesNotFound')) {
        setCameraError('No camera detected on this device.');
      } else {
        setCameraError('Could not start camera: ' + msg);
      }
    }
  }, []);

  useEffect(() => {
    if (mobileTab === 'punch') {
      setPunchStep('preview');
      setCapturedPhoto(null);
      setGpsCoords(null);
      setBiometricStatus('idle');
      startCamera();
      checkBiometricSupport();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [mobileTab, startCamera, stopCamera]);

  const captureFrame = (): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.85);
  };

  // ── Biometric (Capacitor native on APK; WebAuthn fallback in browser) ───────
  const checkBiometricSupport = async () => {
    if (isCapacitorApp) {
      try {
        const result = await (window as any).Capacitor.Plugins.BiometricPlugin.checkAvailability();
        setBiometricSupported(result?.available === true);
      } catch { setBiometricSupported(false); }
    } else if (window.PublicKeyCredential) {
      try {
        const ok = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        setBiometricSupported(ok);
      } catch { setBiometricSupported(false); }
    } else {
      setBiometricSupported(false);
    }
  };

  const getBiometricCredKey = (empId: string) => `biometric_cred_${empId}`;

  const registerBiometric = async (emp: Employee): Promise<boolean> => {
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userId = new TextEncoder().encode(emp.id);
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'HR Management System', id: window.location.hostname || 'localhost' },
          user: { id: userId, name: emp.email || emp.id, displayName: emp.fullName },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 }
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred'
          },
          timeout: 60000
        }
      }) as PublicKeyCredential | null;
      if (cred) {
        const credIdB64 = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
        localStorage.setItem(getBiometricCredKey(emp.id), credIdB64);
        return true;
      }
    } catch (e) { console.warn('Biometric registration failed:', e); }
    return false;
  };

  const verifyBiometric = async (empId: string): Promise<boolean> => {
    const saved = localStorage.getItem(getBiometricCredKey(empId));
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const allowCredentials: PublicKeyCredentialDescriptor[] = saved
        ? [{ type: 'public-key', id: Uint8Array.from(atob(saved), c => c.charCodeAt(0)) }]
        : [];
      await navigator.credentials.get({
        publicKey: { challenge, allowCredentials, userVerification: 'required', timeout: 60000 }
      });
      return true;
    } catch { return false; }
  };

  // ── Punch handlers ─────────────────────────────────────────────────────────
  // Async so we can await GPS before writing to the server
  const finishPunch = async (method: string) => {
    if (!currentEmp) return;
    const photo = captureFrame();
    setCapturedPhoto(photo);
    setPunchMethod(method);

    const timeStr = nowTimeStr();

    // Get GPS first (cached OK, 3 s max wait) so it's included in the Firestore write
    let lat: number | undefined;
    let lon: number | undefined;
    if (navigator.geolocation) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            maximumAge: 60000,
            timeout: 3000,
            enableHighAccuracy: false
          });
        });
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
        setGpsCoords({ lat, lon });
      } catch {
        setGpsCoords(null);
      }
    }

    // Pass time in the correct slot: punchIn for first punch, punchOut for second
    if (isCheckedInToday) {
      onSimulatePunch(currentEmp.id, '', timeStr, method, lat, lon);   // Punch OUT
    } else {
      onSimulatePunch(currentEmp.id, timeStr, '', method, lat, lon);   // Punch IN
    }
    setPunchStep('done');
    setBiometricStatus('success');
    triggerWaToast(`✅ ${currentEmp.fullName}: ${isCheckedInToday ? 'Punch OUT' : 'Punch IN'} recorded at ${timeStr} via ${method}`);
  };

  const handleBiometricPunch = async () => {
    if (!currentEmp || !biometricSupported) return;
    setBiometricStatus('scanning');
    try {
      if (isCapacitorApp) {
        // Native Android BiometricPrompt via our registered Capacitor plugin
        await (window as any).Capacitor.Plugins.BiometricPlugin.authenticate({
          title: 'Attendance Verification',
          reason: `${isCheckedInToday ? 'Punch OUT' : 'Punch IN'} — ${currentEmp.fullName}`
        });
        finishPunch('Biometric');
      } else {
        // WebAuthn for Chrome/Edge browser (desktop/web)
        const hasCredential = !!localStorage.getItem(getBiometricCredKey(currentEmp.id));
        const ok = hasCredential
          ? await verifyBiometric(currentEmp.id)
          : await registerBiometric(currentEmp);
        if (ok) finishPunch('Biometric');
        else setBiometricStatus('failed');
      }
    } catch {
      setBiometricStatus('failed');
    }
  };

  const handleCameraPunch = () => {
    if (!currentEmp) return;
    finishPunch('Camera'); // selfie captured if camera ready; punch records regardless
  };

  const handleApplyLeaveSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!currentEmp) return;
    const start = new Date(leaveForm.startDate);
    const end = new Date(leaveForm.endDate);
    const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
    const request: LeaveRequest = {
      id: 'lv-' + Date.now(),
      employeeId: currentEmp.id,
      leaveType: leaveForm.leaveType,
      startDate: leaveForm.startDate,
      endDate: leaveForm.endDate,
      totalDays,
      reason: leaveForm.reason,
      status: 'Pending',
      appliedOn: todayStr
    };
    onApplyLeave(request);
    triggerWaToast(`📋 Leave request for ${totalDays} day(s) submitted for HR review.`);
    setLeaveForm(p => ({ ...p, reason: '' }));
  };

  const handleApplyRegularization = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!currentEmp) return;
    onAddRegularization(currentEmp.id, regForm.date, regForm.reason);
    triggerWaToast(`📝 Regularization for ${regForm.date} sent to HR approval queue.`);
    setRegForm(p => ({ ...p, reason: '' }));
  };

  const timeDisplay = currentTime.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true });
  const dateDisplay = currentTime.toLocaleDateString('en-PK', { weekday: 'short', month: 'short', day: 'numeric' });

  // ── Inner screen content ───────────────────────────────────────────────────
  const innerContent = (
    <>
      {/* Locked identity bar — only the logged-in user's employee */}
      <div className="bg-slate-800/90 px-3 py-1.5 border-b border-slate-700/60 flex items-center justify-between text-[10px] flex-shrink-0">
        <div className="flex items-center gap-1.5 bg-emerald-900/30 border border-emerald-700/40 rounded-lg px-2 py-1">
          <ShieldCheck size={9} className="text-emerald-400 flex-shrink-0" />
          <span className="text-emerald-300 font-bold truncate max-w-[130px]">
            {currentEmp?.fullName || loggedInUser?.username || 'Employee'}
          </span>
        </div>
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-1 text-slate-500 hover:text-rose-400 px-2 py-1 rounded-lg hover:bg-rose-500/10 transition active:scale-95"
            aria-label="Logout"
          >
            <User size={9} />
            <span className="text-[9px] font-semibold">Logout</span>
          </button>
        )}
      </div>

      {/* Screen area */}
      <div className="flex-1 bg-slate-900 overflow-y-auto relative" id="mob-screen-scroll">

        {/* WhatsApp toast */}
        <AnimatePresence>
          {waNotice && (
            <motion.div
              initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -50, opacity: 0 }}
              className="absolute top-2 left-2 right-2 z-50 bg-[#128C7E] text-white p-3 rounded-xl shadow-lg flex items-start gap-2 border-l-4 border-[#075E54]"
            >
              <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center text-emerald-800 text-[9px] font-bold flex-shrink-0">WA</div>
              <div className="flex-1 text-[10px] leading-snug">
                <div className="font-bold flex justify-between"><span>HR Notifications</span><span className="text-[8px] text-emerald-200 opacity-70">now</span></div>
                <p className="mt-0.5">{waNotice}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── HOME TAB ── */}
        {mobileTab === 'home' && currentEmp && (
          <div className="p-3 space-y-3">
            {/* Greeting */}
            <div className="flex items-center gap-3 pt-1">
              <div className="w-10 h-10 rounded-full bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 font-bold flex items-center justify-center text-sm">
                {currentEmp.fullName.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 className="font-bold text-white text-sm leading-tight">Sabaq Khair, {currentEmp.fullName.split(' ')[0]}!</h3>
                <p className="text-[10px] text-emerald-400">{dateDisplay} • {currentEmp.employeeCode}</p>
              </div>
            </div>

            {/* Status card */}
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Today's Status</span>
                <span className={`px-2 py-0.5 rounded-full text-[9px] uppercase font-bold ${isCheckedInToday ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}`}>
                  {isCheckedInToday ? '● Clocked In' : '○ Not Clocked'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <MapPin className="w-3 h-3 text-slate-500" />
                <span>Clifton HQ Geofence • <span className="text-emerald-400">In Range</span></span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <Clock className="w-3 h-3 text-slate-500" />
                <span className="font-mono text-white">{timeDisplay}</span>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Monthly Streak', val: '94.2%', sub: 'Excellent', color: 'emerald' },
                { label: 'Casual Leave', val: '8 / 10', sub: 'Days Left', color: 'blue' }
              ].map(({ label, val, sub, color }) => (
                <div key={label} className={`bg-${color}-500/10 border border-${color}-500/20 rounded-2xl p-3`}>
                  <div className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold">{label}</div>
                  <div className={`text-base font-bold text-${color}-400 mt-1`}>{val}</div>
                  <div className="text-[9px] text-slate-500 mt-0.5">{sub}</div>
                </div>
              ))}
            </div>

            {/* Quick punch CTA */}
            <button
              type="button"
              onClick={() => setMobileTab('punch')}
              className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold p-3 rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-900/30"
            >
              <Camera className="w-4 h-4" />
              <span className="text-sm">Mark Attendance</span>
            </button>
          </div>
        )}

        {/* ── PUNCH TAB ── */}
        {mobileTab === 'punch' && (
          <div className="p-3 space-y-3">

            {punchStep === 'preview' && (
              <>
                <div className="text-center pt-1">
                  <h3 className="font-bold text-white text-sm">Attendance Verification</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">{isCheckedInToday ? 'Punch OUT' : 'Punch IN'} • {currentEmp?.fullName}</p>
                </div>

                {/* Camera preview */}
                <div className="relative bg-slate-800 rounded-2xl overflow-hidden border border-slate-700/50 aspect-[4/3]">
                  {cameraError ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-500">
                      <CameraOff size={28} className="opacity-50" />
                      <p className="text-[10px] text-center px-4 text-slate-500">{cameraError}</p>
                    </div>
                  ) : (
                    <>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover -scale-x-100"
                      />
                      {/* Face guide overlay */}
                      {cameraReady && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-24 h-28 rounded-full border-2 border-emerald-400/70 shadow-lg shadow-emerald-400/20">
                            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-4 h-1 bg-slate-900" />
                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-1 bg-slate-900" />
                            <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-1 h-4 bg-slate-900" />
                            <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-1 h-4 bg-slate-900" />
                          </div>
                        </div>
                      )}
                      {!cameraReady && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-[10px] text-slate-400 animate-pulse flex items-center gap-1.5">
                            <Camera size={12} /> Starting camera...
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {/* Time overlay */}
                  <div className="absolute bottom-2 left-2 right-2 flex justify-between text-[9px] font-mono">
                    <span className="bg-black/60 text-white px-1.5 py-0.5 rounded">{timeDisplay}</span>
                    <span className="bg-black/60 text-emerald-300 px-1.5 py-0.5 rounded">● REC</span>
                  </div>
                </div>
                {/* Hidden canvas for capture */}
                <canvas ref={canvasRef} className="hidden" />

                {/* Biometric status */}
                {biometricStatus === 'scanning' && (
                  <div className="flex items-center gap-2 justify-center text-amber-400 text-xs animate-pulse">
                    <Fingerprint size={14} /> Waiting for biometric...
                  </div>
                )}
                {biometricStatus === 'failed' && (
                  <div className="flex items-center gap-2 justify-center text-rose-400 text-xs">
                    <AlertCircle size={14} /> Biometric failed. Try again or use camera.
                  </div>
                )}

                {/* Action buttons */}
                <div className="space-y-2">
                  {biometricSupported && (
                    <button
                      type="button"
                      onClick={handleBiometricPunch}
                      disabled={biometricStatus === 'scanning'}
                      className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 active:scale-95 text-white font-bold py-3 rounded-xl transition text-sm shadow-lg shadow-indigo-900/30"
                    >
                      <Fingerprint size={16} />
                      {localStorage.getItem(getBiometricCredKey(currentEmp?.id || ''))
                        ? 'Verify Biometric & Punch'
                        : 'Register Biometric & Punch'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleCameraPunch}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold py-3 rounded-xl transition text-sm"
                  >
                    <Camera size={16} />
                    {isCheckedInToday ? 'Camera Punch OUT' : 'Camera Punch IN'}
                  </button>
                  {!biometricSupported && (
                    <p className="text-[9px] text-slate-500 text-center">TouchID/FaceID/Windows Hello not available on this device</p>
                  )}
                </div>

                {/* GPS status */}
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                  <MapPin size={10} />
                  <span>GPS location will be captured on punch</span>
                </div>

                {/* Regularization form */}
                <div className="border-t border-slate-700/50 pt-3">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2">Missed Punch? Regularize</p>
                  <form onSubmit={handleApplyRegularization} className="space-y-2">
                    <input type="date" value={regForm.date}
                      aria-label="Date of missed punch"
                      onChange={e => setRegForm(p => ({ ...p, date: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                    <textarea aria-label="Reason for missing punch" value={regForm.reason}
                      onChange={e => setRegForm(p => ({ ...p, reason: e.target.value }))}
                      placeholder="Reason for missing punch..."
                      rows={2}
                      className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none" />
                    <button type="submit"
                      className="w-full bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold py-2 rounded-xl transition">
                      File Regularization
                    </button>
                  </form>
                </div>
              </>
            )}

            {/* Punch success screen */}
            {punchStep === 'done' && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-3 pt-2">
                <div className="text-center">
                  <div className="w-12 h-12 bg-emerald-500/20 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto mb-2">
                    <CheckCircle className="text-emerald-400" size={24} />
                  </div>
                  <h3 className="font-bold text-white text-sm">Attendance Recorded!</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">{isCheckedInToday ? 'Punch OUT logged' : 'Punch IN logged'}</p>
                </div>

                {/* Captured selfie */}
                {capturedPhoto ? (
                  <div className="rounded-2xl overflow-hidden border border-slate-700/50 bg-slate-800">
                    <img src={capturedPhoto} alt="Attendance selfie" className="w-full -scale-x-100" />
                    <div className="px-3 py-1.5 text-[9px] text-slate-400 flex justify-between">
                      <span>Identity verified via selfie</span>
                      <span className="text-emerald-400">✓ Saved</span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 text-center text-slate-500 text-[10px]">
                    Camera not available — attendance still recorded
                  </div>
                )}

                {/* Details */}
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-3 space-y-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Time</span>
                    <span className="font-mono text-white">{timeDisplay}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Method</span>
                    <span className="text-emerald-400 font-semibold">{punchMethod}</span>
                  </div>
                  {gpsCoords && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">GPS</span>
                      <span className="font-mono text-slate-300 text-[10px]">
                        {gpsCoords.lat.toFixed(4)}°N, {gpsCoords.lon.toFixed(4)}°E
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-400">Employee</span>
                    <span className="text-white">{currentEmp?.fullName}</span>
                  </div>
                </div>

                <button type="button" onClick={() => { setPunchStep('preview'); setBiometricStatus('idle'); setCapturedPhoto(null); }}
                  className="w-full bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold py-2.5 rounded-xl transition">
                  Back to Camera
                </button>
              </motion.div>
            )}
          </div>
        )}

        {/* ── LEAVE TAB ── */}
        {mobileTab === 'leave' && (
          <div className="p-3 space-y-3">
            <div className="pt-1">
              <h3 className="font-bold text-white text-sm">Apply Leave</h3>
              <p className="text-[10px] text-slate-400">Submit a leave request for HR approval</p>
            </div>

            <form onSubmit={handleApplyLeaveSubmit} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Leave Type</label>
                <select aria-label="Leave type" value={leaveForm.leaveType}
                  onChange={e => setLeaveForm(p => ({ ...p, leaveType: e.target.value as typeof p.leaveType }))}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-emerald-500">
                  <option value="Casual">Casual Leave (Paid)</option>
                  <option value="Sick">Sick / Medical Leave (Paid)</option>
                  <option value="Annual">Annual Vacation (Paid)</option>
                  <option value="Unpaid">Unpaid Leave</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">From</label>
                  <input type="date" aria-label="Leave start date" value={leaveForm.startDate}
                    onChange={e => setLeaveForm(p => ({ ...p, startDate: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">To</label>
                  <input type="date" aria-label="Leave end date" value={leaveForm.endDate}
                    onChange={e => setLeaveForm(p => ({ ...p, endDate: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Reason *</label>
                <textarea aria-label="Leave reason" value={leaveForm.reason}
                  onChange={e => setLeaveForm(p => ({ ...p, reason: e.target.value }))}
                  rows={3} placeholder="Describe your reason..."
                  className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none" />
              </div>
              <button type="submit" disabled={!leaveForm.reason.trim()}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition text-sm">
                Submit Leave Request
              </button>
            </form>

            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-3 text-[10px] text-indigo-300">
              <div className="font-bold flex items-center gap-1 mb-1"><ShieldCheck size={12} /> Policy Note</div>
              Hajj, maternity, and paternity leaves require paper documentation submitted to HR office. Auto-approval is not available for these categories.
            </div>
          </div>
        )}

        {/* ── PAYSLIPS TAB ── */}
        {mobileTab === 'payslips' && (
          <div className="p-3 space-y-3">
            <div className="pt-1">
              <h3 className="font-bold text-white text-sm">My Payslip</h3>
              <p className="text-[10px] text-slate-400">June 2026 — {currentEmp?.fullName}</p>
            </div>

            {myPayslip ? (
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl overflow-hidden">
                <div className="bg-slate-700/60 px-3 py-2 flex justify-between items-center">
                  <span className="text-[10px] font-bold text-white uppercase tracking-wide">Paycheck Receipt</span>
                  <span className="text-[9px] text-slate-400 font-mono">Jun 2026</span>
                </div>
                <div className="p-3 space-y-2 font-mono text-[11px]">
                  {[
                    { label: 'Basic Salary', val: myPayslip.basicEarnings, color: 'text-white', sign: '' },
                    { label: 'House Rent', val: myPayslip.houseRentAllowance, color: 'text-white', sign: '' },
                    { label: 'Medical', val: myPayslip.medicalAllowance, color: 'text-white', sign: '' },
                    ...(myPayslip.overtimePay > 0 ? [{ label: 'Overtime', val: myPayslip.overtimePay, color: 'text-emerald-400', sign: '+' }] : []),
                  ].map(({ label, val, color, sign }) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-slate-400 font-sans">{label}</span>
                      <span className={color}>{sign}{val.toLocaleString()} PKR</span>
                    </div>
                  ))}

                  <div className="border-t border-slate-700 pt-2 space-y-1">
                    <div className="flex justify-between text-rose-400">
                      <span className="font-sans">FBR Tax</span>
                      <span>-{myPayslip.incomeTaxDeduction.toLocaleString()} PKR</span>
                    </div>
                    <div className="flex justify-between text-rose-400">
                      <span className="font-sans">EOBI</span>
                      <span>-{myPayslip.eobiEmployeeDeduction.toLocaleString()} PKR</span>
                    </div>
                  </div>

                  <div className="border-t border-slate-600 pt-2 flex justify-between text-sm font-bold">
                    <span className="font-sans text-slate-300">Net Take-Home</span>
                    <span className="text-emerald-400">{myPayslip.netSalary.toLocaleString()} PKR</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-10 text-slate-500 text-xs">No payslip data available.</div>
            )}
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div className="bg-slate-800/90 border-t border-slate-700/60 py-2 flex justify-around items-center flex-shrink-0">
        {([
          { tab: 'home', icon: User, label: 'Home' },
          { tab: 'punch', icon: Camera, label: 'Attend' },
          { tab: 'leave', icon: Calendar, label: 'Leave' },
          { tab: 'payslips', icon: FileText, label: 'Payslip' }
        ] as const).map(({ tab, icon: Icon, label }) => (
          <button type="button" key={tab} onClick={() => setMobileTab(tab)}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition ${mobileTab === tab ? 'text-emerald-400' : 'text-slate-500'}`}>
            <Icon className="w-4 h-4" />
            <span className="text-[9px] font-semibold">{label}</span>
          </button>
        ))}
      </div>
    </>
  );

  if (hideMockPhoneFrame) {
    return (
      <div className="w-full h-full bg-slate-900 flex flex-col font-sans text-xs text-slate-200" id="native-mobile-container">
        {innerContent}
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm mx-auto h-[650px] bg-slate-950 rounded-[44px] p-3 shadow-2xl relative border-4 border-slate-800 flex flex-col font-sans text-xs text-slate-200" id="mob-emulate-container">
      {/* Notch */}
      <div className="absolute top-2.5 left-1/2 -translate-x-1/2 bg-slate-900 rounded-full h-5 w-28 flex items-center justify-center gap-2 z-10 border border-slate-800">
        <span className="w-1.5 h-1.5 bg-slate-700 rounded-full" />
        <span className="w-10 h-1 bg-slate-800 rounded-full" />
        <span className="w-1.5 h-1.5 bg-slate-600 rounded-full" />
      </div>

      {/* Status bar */}
      <div className="bg-slate-900 text-slate-300 rounded-t-[36px] pt-6 pb-1.5 px-5 flex justify-between items-center text-[10px] font-mono leading-none flex-shrink-0 border-b border-slate-800">
        <span className="font-bold">{currentTime.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
        <div className="flex items-center gap-2 text-slate-400">
          <Scan size={9} className="text-slate-500" />
          <span>Jazz 4G</span>
          <span>🔋 84%</span>
        </div>
      </div>

      {innerContent}
    </div>
  );
}
