/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Scan, ShieldCheck, MapPin, Camera, CameraOff,
  Calendar, FileText, User, Fingerprint, CheckCircle, AlertCircle, Clock
} from 'lucide-react';
import { Employee, AttendanceLog, LeaveRequest, Payslip, UserAccount, MobileAttendanceAction, MobilePunchDetails, MobileDutyAuthorization } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { assessBrowserFaceDetection, createFaceDescriptorFromVideo, findBestFaceMatch, hasFaceEnrollment } from '../utils/faceRecognition';
import { performActiveLiveness, randomLivenessOrder } from '../utils/faceLiveness';

interface MobileAppProps {
  employees: Employee[];
  attendances: AttendanceLog[];
  mobileDutyAuthorizations: MobileDutyAuthorization[];
  leaves: LeaveRequest[];
  onApplyLeave: (leave: LeaveRequest) => void;
  onSimulatePunch: (employeeId: string, punchIn: string, punchOut: string, method: string, lat?: number, lon?: number, locationAccuracyMeters?: number, locationCapturedAt?: string, locationAddress?: string, mobileDetails?: MobilePunchDetails) => void | Promise<void>;
  onAddRegularization: (employeeId: string, date: string, reason: string) => void;
  hideMockPhoneFrame?: boolean;
  loggedInUser?: UserAccount;
  onLogout?: () => void;
  payrollPayslips?: Payslip[];
}

type PunchStep = 'preview' | 'done';
type BiometricStatus = 'idle' | 'scanning' | 'success' | 'failed' | 'unsupported';

function nowTimeStr() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}:${String(n.getSeconds()).padStart(2, '0')}`;
}

function localDateStr(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const actionLabel = (action: MobileAttendanceAction) => ({
  'workday-in': 'Start Day',
  'workday-out': 'Finish Day',
  'visit-in': 'Client / Field Check In',
  'visit-out': 'Client / Field Check Out',
}[action]);

// True when running inside Capacitor native shell (Android/iOS APK)
const isCapacitorApp = !!(window as any).Capacitor?.isNativePlatform?.();
const biometricCredentialIds = new Map<string, string>();

export function MobileApp({
  employees,
  attendances,
  mobileDutyAuthorizations,
  leaves,
  onApplyLeave,
  onSimulatePunch,
  onAddRegularization,
  hideMockPhoneFrame,
  loggedInUser,
  onLogout,
  payrollPayslips = []
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
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lon: number; address?: string } | null>(null);
  const [biometricStatus, setBiometricStatus] = useState<BiometricStatus>('idle');
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [punchStep, setPunchStep] = useState<PunchStep>('preview');
  const [punchMethod, setPunchMethod] = useState('');
  const [faceStatus, setFaceStatus] = useState('Center your face inside the oval.');
  const [selectedAction, setSelectedAction] = useState<MobileAttendanceAction>('workday-in');
  const [completedAction, setCompletedAction] = useState<MobileAttendanceAction | null>(null);
  const [punchReason, setPunchReason] = useState({ category: 'Work from home', note: '', clientName: '' });
  const facePunchBusyRef = useRef(false);
  const autoFaceStableFramesRef = useRef(0);

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

  // Fail closed: never substitute another employee when the authenticated profile is unlinked or invalid.
  const currentEmp = loggedInUser?.employeeId
    ? employees.find(e => e.id === loggedInUser.employeeId)
    : undefined;
  const myPunches = attendances.filter(a => a.employeeId === currentEmp?.id);
  const todayStr = localDateStr();
  const activeMobileDuty = mobileDutyAuthorizations.find(item => item.employeeId === currentEmp?.id && item.status === 'Approved' && item.validFrom <= todayStr && item.validTo >= todayStr);
  const todayAttendance = myPunches.find(p => p.date === todayStr);
  const isWorkdayActive = Boolean(todayAttendance?.punchIn && !todayAttendance?.punchOut);
  const isWorkdayComplete = Boolean(todayAttendance?.punchOut);
  const activeVisit = todayAttendance?.fieldVisits?.find(visit => !visit.checkOut);
  const authorizationAllowsVisits = Boolean(activeMobileDuty && (
    activeMobileDuty.allowFieldVisits
    || ['Client visit', 'Market / field duty', 'Out of station', 'Official travel', 'Direct reporting to worksite'].includes(activeMobileDuty.dutyType)
  ));
  const canSubmitSelectedAction = Boolean(activeMobileDuty) && (selectedAction === 'workday-in' ? !todayAttendance?.punchIn
    : selectedAction === 'workday-out' ? isWorkdayActive && !activeVisit
    : selectedAction === 'visit-in' ? authorizationAllowsVisits && isWorkdayActive && !activeVisit
    : authorizationAllowsVisits && Boolean(activeVisit));
  const nextAction: MobileAttendanceAction | null = !todayAttendance?.punchIn ? 'workday-in'
    : activeVisit ? 'visit-out'
    : isWorkdayActive ? (authorizationAllowsVisits ? 'visit-in' : 'workday-out')
    : null;
  const myPayslip = currentEmp ? [...payrollPayslips].reverse().find(p => p.employeeId === currentEmp.id) || null : null;
  const payslipPeriod = myPayslip?.periodMonth && myPayslip.periodYear
    ? new Date(myPayslip.periodYear, myPayslip.periodMonth - 1).toLocaleString('en-PK', { month: 'long', year: 'numeric' })
    : 'Latest approved period';

  useEffect(() => {
    if (!activeMobileDuty && mobileTab === 'punch') setMobileTab('home');
  }, [activeMobileDuty, mobileTab]);

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
      } else setCameraError('Could not start camera.');
    }
  }, []);

  useEffect(() => {
    if (mobileTab === 'punch') {
      setPunchStep('preview');
      setCapturedPhoto(null);
      setGpsCoords(null);
      setBiometricStatus('idle');
      setFaceStatus('Center your face inside the oval.');
      setCompletedAction(null);
      setSelectedAction(!todayAttendance?.punchIn ? 'workday-in' : activeVisit ? 'visit-out' : isWorkdayActive ? (authorizationAllowsVisits ? 'visit-in' : 'workday-out') : 'workday-out');
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
          user: { id: userId, name: emp.id, displayName: 'Employee' },
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
        biometricCredentialIds.set(getBiometricCredKey(emp.id), credIdB64);
        return true;
      }
    } catch { console.warn('Biometric registration failed.'); }
    return false;
  };

  const verifyBiometric = async (empId: string): Promise<boolean> => {
    const saved = biometricCredentialIds.get(getBiometricCredKey(empId));
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
    if (!activeMobileDuty) throw new Error('Mobile attendance is not authorized for today.');
    if (!canSubmitSelectedAction) throw new Error(isWorkdayComplete ? 'Today’s workday is complete.' : 'This attendance action is not currently available.');
    const reasonCategory = activeMobileDuty.dutyType;
    const reasonNote = punchReason.note.trim();
    const clientName = punchReason.clientName.trim();
    if (!reasonCategory) throw new Error('Select a reason for this mobile action.');
    if (!reasonNote) throw new Error('Enter the business reason or visit details before verification.');
    if (selectedAction === 'visit-in' && !clientName) throw new Error('Enter the client or field location name.');
    const photo = captureFrame();
    setCapturedPhoto(photo);
    setPunchMethod(method);

    const timeStr = nowTimeStr();

    // Mobile attendance is location-bound. Require a fresh, reasonably accurate
    // device fix and persist its accuracy/timestamp with the Firestore record.
    if (!navigator.geolocation) throw new Error('Location is unavailable on this device. Attendance was not recorded.');
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        maximumAge: 0,
        timeout: 12000,
        enableHighAccuracy: true,
      });
    });
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    const accuracy = pos.coords.accuracy;
    if (![lat, lon, accuracy].every(Number.isFinite) || accuracy <= 0 || accuracy > 100) {
      throw new Error(`GPS accuracy is ${Math.round(accuracy || 0)} m. Move to an open area and retry (100 m required).`);
    }
    const locationCapturedAt = new Date(pos.timestamp).toISOString();
    let locationAddress = '';
    if (isCapacitorApp) {
      try {
        const resolved = await (window as any).Capacitor.Plugins.LocationPlugin.reverseGeocode({ latitude: lat, longitude: lon });
        locationAddress = String(resolved?.address || '').trim().slice(0, 300);
      } catch { /* Coordinates remain valid evidence when the device geocoder is unavailable. */ }
    }
    setGpsCoords({ lat, lon, address: locationAddress || undefined });

    const details: MobilePunchDetails = { action: selectedAction, reasonCategory, reasonNote, verificationMethod: method === 'Biometric' ? 'Biometric' : 'Camera', ...(clientName && { clientName }) };
    const isOutAction = selectedAction === 'workday-out' || selectedAction === 'visit-out';
    await onSimulatePunch(currentEmp.id, isOutAction ? '' : timeStr, isOutAction ? timeStr : '', 'Mobile GPS', lat, lon, accuracy, locationCapturedAt, locationAddress, details);
    setCompletedAction(selectedAction);
    setPunchStep('done');
    setBiometricStatus('success');
    triggerWaToast(`✅ ${currentEmp.fullName}: ${actionLabel(selectedAction)} recorded at ${timeStr} via ${method}`);
  };

  const handleBiometricPunch = async () => {
    if (!currentEmp || !biometricSupported) return;
    setBiometricStatus('scanning');
    try {
      if (isCapacitorApp) {
        // Native Android BiometricPrompt via our registered Capacitor plugin
        await (window as any).Capacitor.Plugins.BiometricPlugin.authenticate({
          title: 'Attendance Verification',
          reason: `${actionLabel(selectedAction)} — ${currentEmp.fullName}`
        });
        finishPunch('Biometric');
      } else {
        // WebAuthn for Chrome/Edge browser (desktop/web)
        const hasCredential = !!biometricCredentialIds.get(getBiometricCredKey(currentEmp.id));
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

  const handleCameraPunch = useCallback(async () => {
    const video = videoRef.current;
    if (!currentEmp || !video || facePunchBusyRef.current) return;
    facePunchBusyRef.current = true;
    setBiometricStatus('scanning');
    try {
      if (!cameraReady) throw new Error('Front camera is not ready.');
      if (!hasFaceEnrollment(currentEmp)) throw new Error('Secure face enrollment is required before mobile attendance.');
      const quality = await assessBrowserFaceDetection(video);
      if (!quality?.ok) throw new Error(quality?.message || 'Keep one complete face centered inside the oval.');

      const order = randomLivenessOrder();
      const liveness = await performActiveLiveness(video, order, message => setFaceStatus(message));
      if (!liveness.ok) throw new Error(liveness.message);

      const probe = createFaceDescriptorFromVideo(video, 'mobile-front-camera');
      const match = findBestFaceMatch([currentEmp], probe, 0.24);
      if (!match || match.employee.id !== currentEmp.id) throw new Error('Face does not match the signed-in employee. Attendance was not recorded.');

      setFaceStatus('Face verified. Capturing secure GPS location…');
      await finishPunch('Camera');
    } catch (error) {
      setBiometricStatus('failed');
      setFaceStatus(error instanceof Error ? error.message : 'Face verification failed.');
    } finally {
      facePunchBusyRef.current = false;
    }
  }, [cameraReady, currentEmp, finishPunch]);

  // Hands-free fallback: three stable centered detections start the same secure
  // path as the manual button. The busy lock prevents duplicate submissions.
  useEffect(() => {
    if (mobileTab !== 'punch' || punchStep !== 'preview' || !cameraReady || !currentEmp || !canSubmitSelectedAction || !punchReason.note.trim() || (selectedAction === 'visit-in' && !punchReason.clientName.trim())) return;
    const timer = window.setInterval(async () => {
      if (facePunchBusyRef.current || !videoRef.current) return;
      try {
        const quality = await assessBrowserFaceDetection(videoRef.current);
        autoFaceStableFramesRef.current = quality?.ok ? autoFaceStableFramesRef.current + 1 : 0;
        if (!quality?.ok) setFaceStatus(quality?.message || 'Center your face inside the oval.');
        if (autoFaceStableFramesRef.current >= 3) {
          autoFaceStableFramesRef.current = 0;
          void handleCameraPunch();
        }
      } catch {
        autoFaceStableFramesRef.current = 0;
      }
    }, 700);
    return () => window.clearInterval(timer);
  }, [cameraReady, canSubmitSelectedAction, currentEmp, handleCameraPunch, mobileTab, punchReason.clientName, punchReason.note, punchStep, selectedAction]);

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
        {mobileTab === 'home' && !currentEmp && (
          <div className="p-4">
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-100">
              <h3 className="text-sm font-bold">Employee account is not linked</h3>
              <p className="mt-2 text-xs leading-relaxed text-amber-200/80">
                This login is not linked to an available employee record. Ask an administrator to open User Management, edit this user, and select the correct employee. Mobile-duty attendance will appear after the link is saved.
              </p>
            </div>
          </div>
        )}
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
                <span className={`px-2 py-0.5 rounded-full text-[9px] uppercase font-bold ${isWorkdayActive ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-700 text-slate-300 border border-slate-600'}`}>
                  {isWorkdayComplete ? '✓ Day Finished' : isWorkdayActive ? '● Day Active' : '○ Not Started'}
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

            {activeMobileDuty && <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-[10px] text-indigo-200">
              <div className="font-bold">Assigned Mobile Duty: {activeMobileDuty.dutyType}</div>
              <div className="mt-1">Valid {activeMobileDuty.validFrom} to {activeMobileDuty.validTo}</div>
              {activeMobileDuty.assignedLocation && <div className="mt-1 text-slate-300">Location: {activeMobileDuty.assignedLocation}</div>}
              {activeMobileDuty.instructions && <div className="mt-1 text-slate-300">{activeMobileDuty.instructions}</div>}
              <div className="mt-1 text-slate-400">Assigned by {activeMobileDuty.assignedByName}</div>
            </div>}

            {activeMobileDuty && <button
              type="button"
              onClick={() => setMobileTab('punch')}
              className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold p-3 rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-900/30"
            >
              <Camera className="w-4 h-4" />
              <span className="text-sm">Mark Attendance</span>
            </button>}
          </div>
        )}

        {/* ── PUNCH TAB ── */}
        {mobileTab === 'punch' && (
          <div className="p-3 space-y-3">

            {punchStep === 'preview' && (
              <>
                <div className="text-center pt-1">
                  <h3 className="font-bold text-white text-sm">Attendance Verification</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">{actionLabel(selectedAction)} • {currentEmp?.fullName}</p>
                </div>

                <div className="space-y-2">
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div><p className="text-[11px] font-bold text-white">Workday Attendance</p><p className="text-[9px] text-slate-400">One Start Day and Finish Day per date</p></div>
                      <span className="text-[9px] font-semibold text-emerald-400">{isWorkdayComplete ? 'Completed' : isWorkdayActive ? 'Active' : 'Not started'}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" disabled={Boolean(todayAttendance?.punchIn)} onClick={() => setSelectedAction('workday-in')} className={`rounded-xl border px-2 py-2 text-[10px] font-bold disabled:opacity-35 ${selectedAction === 'workday-in' ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300' : 'border-slate-700 bg-slate-800 text-slate-300'}`}>Start Day</button>
                      <button type="button" disabled={!isWorkdayActive || Boolean(activeVisit)} onClick={() => setSelectedAction('workday-out')} className={`rounded-xl border px-2 py-2 text-[10px] font-bold disabled:opacity-35 ${selectedAction === 'workday-out' ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300' : 'border-slate-700 bg-slate-800 text-slate-300'}`}>Finish Day</button>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div><p className="text-[11px] font-bold text-white">Client &amp; Field Visits</p><p className="text-[9px] text-slate-400">Repeat for every client visited today</p></div>
                      <span className="text-[9px] font-semibold text-indigo-300">{activeVisit ? `At ${activeVisit.clientName}` : `${todayAttendance?.fieldVisits?.length || 0} visit(s)`}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" disabled={!authorizationAllowsVisits || !isWorkdayActive || Boolean(activeVisit)} onClick={() => setSelectedAction('visit-in')} className={`rounded-xl border px-2 py-2 text-[10px] font-bold disabled:opacity-35 ${selectedAction === 'visit-in' ? 'border-indigo-400 bg-indigo-500/20 text-indigo-300' : 'border-slate-700 bg-slate-800 text-slate-300'}`}>Check In</button>
                      <button type="button" disabled={!authorizationAllowsVisits || !activeVisit} onClick={() => setSelectedAction('visit-out')} className={`rounded-xl border px-2 py-2 text-[10px] font-bold disabled:opacity-35 ${selectedAction === 'visit-out' ? 'border-indigo-400 bg-indigo-500/20 text-indigo-300' : 'border-slate-700 bg-slate-800 text-slate-300'}`}>Check Out</button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 rounded-2xl border border-slate-700/60 bg-slate-800/60 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Required mobile reason</p>
                  {selectedAction === 'visit-in' && <input value={punchReason.clientName} onChange={e => setPunchReason(p => ({ ...p, clientName: e.target.value }))} placeholder="Client or field location name *" className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none" />}
                  {selectedAction === 'visit-out' && activeVisit && <div className="rounded-lg bg-slate-900 px-3 py-2 text-[10px] text-indigo-300">Checking out from: <strong>{activeVisit.clientName}</strong></div>}
                  <div className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-indigo-300">{activeMobileDuty?.dutyType}</div>
                  <textarea value={punchReason.note} onChange={e => setPunchReason(p => ({ ...p, note: e.target.value }))} rows={2} placeholder="Business reason, instructions, client purpose or completion details *" className="w-full resize-none rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none" />
                </div>

                {isWorkdayComplete && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-center text-[10px] text-emerald-300">Today’s workday is complete. No further attendance or visit actions are available.</div>}

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
                        className="w-full h-full object-contain bg-black -scale-x-100"
                      />
                      {/* Face guide overlay */}
                      {cameraReady && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="relative h-[90%] w-[56%] rounded-[50%] border-2 border-emerald-400/80 shadow-lg shadow-emerald-400/20">
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
                  <div className="flex items-center gap-2 justify-center text-amber-400 text-xs animate-pulse text-center">
                    <Scan size={14} /> {faceStatus}
                  </div>
                )}
                {biometricStatus === 'failed' && (
                  <div className="flex items-center gap-2 justify-center text-rose-400 text-xs text-center">
                    <AlertCircle size={14} /> {faceStatus}
                  </div>
                )}

                {/* Action buttons */}
                <div className="space-y-2">
                  {biometricSupported && (
                    <button
                      type="button"
                      onClick={handleBiometricPunch}
                      disabled={biometricStatus === 'scanning' || !canSubmitSelectedAction}
                      className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 active:scale-95 text-white font-bold py-3 rounded-xl transition text-sm shadow-lg shadow-indigo-900/30"
                    >
                      <Fingerprint size={16} />
                      {biometricCredentialIds.get(getBiometricCredKey(currentEmp?.id || ''))
                        ? 'Verify Biometric & Punch'
                        : 'Register Biometric & Punch'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleCameraPunch}
                    disabled={biometricStatus === 'scanning' || !canSubmitSelectedAction}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 active:scale-95 text-white font-bold py-3 rounded-xl transition text-sm"
                  >
                    <Camera size={16} />
                    Verify Face &amp; {actionLabel(selectedAction)}
                  </button>
                  {!biometricSupported && (
                    <p className="text-[9px] text-slate-500 text-center">TouchID/FaceID/Windows Hello not available on this device</p>
                  )}
                </div>

                {/* GPS status */}
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                  <MapPin size={10} />
                  <span>Fresh high-accuracy GPS (within 100 m) is required and sent with the punch</span>
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
                  <p className="text-[10px] text-slate-400 mt-0.5">{completedAction ? `${actionLabel(completedAction)} logged` : 'Mobile action logged'}</p>
                </div>

                {/* Captured selfie */}
                {capturedPhoto ? (
                  <div className="rounded-2xl overflow-hidden border border-slate-700/50 bg-slate-800">
                    <img src={capturedPhoto} alt="Attendance selfie" className="w-full -scale-x-100" />
                    <div className="px-3 py-1.5 text-[9px] text-slate-400 flex justify-between">
                      <span>Identity verified by face + active liveness</span>
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
                    <span className="text-slate-400">Method/GPS</span>
                    <span className="text-emerald-400 font-semibold">{punchMethod} / Mobile GPS</span>
                  </div>
                  {gpsCoords && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">GPS</span>
                      <span className="max-w-[70%] text-right text-slate-300 text-[10px]">
                        {gpsCoords.address || `${gpsCoords.lat.toFixed(4)}°, ${gpsCoords.lon.toFixed(4)}°`}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-400">Employee</span>
                    <span className="text-white">{currentEmp?.fullName}</span>
                  </div>
                </div>

                <button type="button" onClick={() => { if (nextAction) { setSelectedAction(nextAction); setPunchStep('preview'); } else setMobileTab('home'); setBiometricStatus('idle'); setCapturedPhoto(null); setPunchReason(p => ({ ...p, note: '', clientName: '' })); }}
                  className="w-full bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold py-2.5 rounded-xl transition">
                  {nextAction ? 'Record Next Action' : 'Back to Home'}
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
              <p className="text-[10px] text-slate-400">{payslipPeriod} — {currentEmp?.fullName}</p>
            </div>

            {myPayslip ? (
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl overflow-hidden">
                <div className="bg-slate-700/60 px-3 py-2 flex justify-between items-center">
                  <span className="text-[10px] font-bold text-white uppercase tracking-wide">Paycheck Receipt</span>
                  <span className="text-[9px] text-slate-400 font-mono">{payslipPeriod}</span>
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
        ] as const).filter(item => item.tab !== 'punch' || Boolean(activeMobileDuty)).map(({ tab, icon: Icon, label }) => (
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
