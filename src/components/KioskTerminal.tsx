/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Scan, User, Cpu, ShieldCheck, AlertCircle, Camera, CheckCircle, VideoOff
} from 'lucide-react';
import { Employee, AttendanceLog } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { captureBiometric } from '../utils/uru4500Bridge';
import { assessFaceFrame, createFaceDescriptorFromVideo, findBestFaceMatch, hasFaceEnrollment, FACE_MATCH_THRESHOLD } from '../utils/faceRecognition';

interface KioskTerminalProps {
  employees: Employee[];
  attendances: AttendanceLog[];
  onSimulatePunch: (employeeId: string, punchIn: string, punchOut: string, method: string, lat?: number, lon?: number) => void;
}

export function KioskTerminal({
  employees,
  attendances,
  onSimulatePunch
}: KioskTerminalProps) {
  const [method, setMethod] = useState<'id' | 'fingerprint' | 'face'>('id');
  
  // ID state
  const [empIdInput, setEmpIdInput] = useState('');
  
  // Status states
  const [status, setStatus] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [matchedEmp, setMatchedEmp] = useState<Employee | null>(null);

  // Camera states
  const [hasWebcam, setHasWebcam] = useState<boolean | null>(null);
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
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 400, height: 300, facingMode: 'user' } 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setStreamActive(true);
      setHasWebcam(true);
    } catch (err) {
      console.warn('Webcam permission denied or unavailable:', err);
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

  // Run the punch process
  const triggerPunch = (emp: Employee, punchMethod: string) => {
    // Generate current formatted time
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const timeStr = `${hh}:${mm}:${ss}`;

    // Punch log check today
    const todayStr = now.toISOString().split('T')[0];
    const userPunchesToday = attendances.filter(a => a.employeeId === emp.id && a.date === todayStr);
    const isClockIn = userPunchesToday.length === 0;

    onSimulatePunch(emp.id, isClockIn ? timeStr : '09:00:00', isClockIn ? '18:00:00' : timeStr, punchMethod);
    
    setMatchedEmp(emp);
    setStatus('success');
    setMessage(isClockIn 
      ? `Welcome ${emp.fullName}! Check-In registered at ${timeStr}.` 
      : `Goodbye ${emp.fullName}! Check-Out registered at ${timeStr}.`
    );

    setTimeout(() => {
      setStatus('idle');
      setEmpIdInput('');
      setMatchedEmp(null);
      setMessage('');
      if (punchMethod === 'face' && method === 'face') {
        // restart camera stream or remain ready
      }
    }, 4000);
  };

  // 1. Submit ID
  const handleIdSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!empIdInput) return;

    setStatus('scanning');
    setTimeout(() => {
      // Find employee by code (exact or suffix match)
      const emp = employees.find(
        e => e.employeeCode.toUpperCase() === empIdInput.toUpperCase() || 
             e.employeeCode.toLowerCase().endsWith(empIdInput.toLowerCase())
      );

      if (emp) {
        triggerPunch(emp, 'RFID'); // Kiosk counts as RFID/card terminal check-in
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
      const result = await captureBiometric();
      const typedEmp = empIdInput
        ? employees.find(e =>
            e.employeeCode.toUpperCase() === empIdInput.toUpperCase() ||
            e.employeeCode.toLowerCase().endsWith(empIdInput.toLowerCase())
          )
        : null;
      const enrolledEmp = employees.find(e => (e.fingerprintTemplates?.length || 0) > 0);
      const emp = typedEmp || enrolledEmp || employees[0];

      if (emp) {
        setMessage(`Fingerprint captured from ${result.device?.type || 'URU 4500 / SecuGen Hamster Pro'} at ${result.quality}% quality.`);
        triggerPunch(emp, 'Biometric');
      } else {
        setStatus('error');
        setMessage('Fingerprint captured, but no employee record is available.');
        setTimeout(() => setStatus('idle'), 3000);
      }
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : String(error));
      setTimeout(() => setStatus('idle'), 4000);
    }
  };

  // 3. Submit Face Scan
  const handleFaceScan = async () => {
    if (status === 'scanning') return;

    setStatus('scanning');
    setMessage('Align your face inside the framing box. Comparing enrolled camera profile...');

    try {
      if (!videoRef.current || !streamActive) {
        throw new Error('Camera is not ready. Allow webcam access and try again.');
      }
      const enrolledEmployees = employees.filter(hasFaceEnrollment);
      if (enrolledEmployees.length === 0) {
        throw new Error('No camera face profiles are enrolled yet. Enroll employees from HR biometric setup first.');
      }
      await new Promise(resolve => setTimeout(resolve, 650));
      const frameQuality = assessFaceFrame(videoRef.current);
      if (!frameQuality.ok) throw new Error(frameQuality.message);
      const probe = createFaceDescriptorFromVideo(videoRef.current, 'kiosk-webcam');
      const match = findBestFaceMatch(enrolledEmployees, probe);
      if (!match) {
        throw new Error('Face not recognized. Step closer, improve lighting, or re-enroll the camera profile.');
      }
      setMessage(`Face match confidence ${(Math.max(0, 1 - match.score / FACE_MATCH_THRESHOLD) * 100).toFixed(1)}%.`);
      triggerPunch(match.employee, 'Camera');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : String(error));
      setTimeout(() => setStatus('idle'), 3500);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-slate-950 border-4 border-slate-800 rounded-[36px] shadow-2xl p-6 text-slate-100 flex flex-col h-full max-h-full justify-between relative overflow-hidden font-sans select-none" id="kiosk-container">
      
      {/* Laser grids or scanline background effects for high-end aesthetic */}
      <div className="absolute inset-0 bg-radial-gradient from-slate-900 via-slate-950 to-black pointer-events-none opacity-40"></div>

      {/* Header bar showing Time & Kiosk mode status */}
      <div className="flex justify-between items-center border-b border-slate-800 pb-4 z-10">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-extrabold text-sm shadow-md animate-pulse">
            B
          </div>
          <div>
            <h3 className="font-bold text-xs uppercase tracking-widest text-emerald-400">Terminal Kiosk Mode</h3>
            <p className="text-[10px] text-slate-400 font-mono">Location: Main Entrance Gate-1</p>
          </div>
        </div>

        <div className="text-right font-mono">
          <p className="text-sm font-bold text-white tracking-wider">
            {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
          <p className="text-[9px] text-slate-400">{time.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p>
        </div>
      </div>

      {/* Main interactive terminal area */}
      <div className="flex-1 flex flex-col md:flex-row gap-6 items-center justify-center py-6 z-10 overflow-hidden">
        
        {/* Left Side: Method Controller Tabs */}
        <div className="flex md:flex-col gap-2 w-full md:w-44 flex-shrink-0">
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
        </div>

        {/* Right Side: Interactive Scanner screen depending on method */}
        <div className="flex-1 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col items-center justify-center min-h-[220px] w-full relative h-full">
          
          <AnimatePresence mode="wait">
            
            {/* STATUS MESSAGE OVERLAYS */}
            {status === 'scanning' && (
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
              className="w-full flex flex-col lg:flex-row items-center justify-center gap-5 h-full relative"
            >
              {/* Webcam Frame Container */}
              <div className="flex w-full lg:flex-1 items-center justify-center">
              <div className="relative w-64 h-64 bg-slate-950 border-2 border-slate-800 rounded-xl overflow-hidden flex items-center justify-center shadow-lg">
                
                {hasWebcam === true && streamActive ? (
                  <video 
                    ref={videoRef} 
                    className="w-full h-full object-cover scale-x-[-1]" 
                    playsInline 
                    muted 
                  />
                ) : hasWebcam === false ? (
                  <div className="flex flex-col items-center text-center p-4 text-slate-500 space-y-2">
                    <VideoOff className="w-10 h-10 text-slate-700 animate-pulse" />
                    <span className="text-[11px] leading-relaxed">
                      Webcam access denied or not found.<br/>Camera verification unavailable.
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-slate-600 space-y-2 text-xs">
                    <div className="w-6 h-6 border-2 border-slate-600 border-t-slate-400 rounded-full animate-spin"></div>
                    <span>Initializing camera...</span>
                  </div>
                )}

                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="relative w-40 h-52 rounded-[50%] border-2 border-emerald-400 shadow-[0_0_0_999px_rgba(2,6,23,0.38)]">
                    <div className="absolute -top-1 left-1/2 h-2 w-10 -translate-x-1/2 rounded-full bg-emerald-300"></div>
                    <div className="absolute top-16 left-1/2 h-px w-24 -translate-x-1/2 bg-emerald-300/80"></div>
                    <div className="absolute bottom-10 left-1/2 h-px w-14 -translate-x-1/2 bg-emerald-300/70"></div>
                  </div>
                </div>

                <div className="absolute bottom-2 left-2 bg-slate-900/80 px-2 py-0.5 text-[8px] font-mono text-emerald-400 rounded border border-emerald-900/50">
                  CV_MODEL: v4.1 (FACE_DETECT)
                </div>
              </div>
              </div>

              <div className="flex flex-col justify-center space-y-3 w-full lg:w-72 text-left">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">TERMINAL READY</p>
                  <h4 className="text-sm font-black text-white">Attendance Kiosk Online</h4>
                  <div className="space-y-1.5 text-[11px] leading-relaxed text-slate-400">
                    <p><span className="text-emerald-400 font-bold">1.</span> Keep face inside the oval marker.</p>
                    <p><span className="text-emerald-400 font-bold">2.</span> Look straight, hold still, avoid glare.</p>
                    <p><span className="text-emerald-400 font-bold">3.</span> Press face match to mark attendance.</p>
                  </div>
                </div>
                <button 
                  onClick={handleFaceScan}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase px-6 py-2.5 rounded-lg w-full flex items-center justify-center space-x-1.5 shadow"
                >
                  <Scan className="w-4 h-4" />
                  <span>FACE MATCH &amp; PUNCH</span>
                </button>
                <p className="text-[10px] text-slate-500 italic text-center">
                  * Matches enrolled camera profiles and registers attendance instantly.
                </p>
              </div>
            </motion.div>
          )}

        </div>

      </div>

      {/* Terminal Kiosk Footer showing diagnostic node states */}
      <div className="border-t border-slate-900 pt-3 flex justify-between items-center text-[10px] text-slate-500 font-mono z-10 leading-none">
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


