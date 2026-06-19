/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Monitor, Play, Cpu, ShieldAlert, Server, HardDrive, Search, Terminal,
  RefreshCw, Settings, FileSpreadsheet, KeyRound, Smartphone, Layers, HelpCircle, UserCheck
} from 'lucide-react';
import { Employee, AttendanceLog, LeaveRequest, StatutoryConfig } from '../types';
import { motion } from 'motion/react';

interface WindowsAppProps {
  employees: Employee[];
  attendances: AttendanceLog[];
  leaves: LeaveRequest[];
  statConfig: StatutoryConfig;
  onSimulatePunch: (employeeId: string, punchIn: string, punchOut: string, method: string) => void;
  onApproveLeave: (id: string) => void;
}

export function WindowsApp({
  employees,
  attendances,
  leaves,
  statConfig,
  onSimulatePunch,
  onApproveLeave
}: WindowsAppProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState(employees[0]?.id || '');
  const [hardwarePort, setHardwarePort] = useState('COM3 (ZK-TeCO SDK v11.4)');
  const [hardwareStatus, setHardwareStatus] = useState<'IDLE' | 'READING' | 'SUCCESS'>('IDLE');
  const [activePane, setActivePane] = useState<'grid' | 'hardware' | 'logs'>('grid');

  // Filtered employees
  const filteredEmps = employees.filter(e => 
    e.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.employeeCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.cnic.includes(searchQuery)
  );

  // Trigger simulated biometric punch log
  const handleBiometricSimulation = () => {
    if (!selectedEmpId) return;
    setHardwareStatus('READING');
    
    setTimeout(() => {
      // Calculate realistic random timing
      const hourIn = String(8 + Math.floor(Math.random() * 2)).padStart(2, '0');
      const minIn = String(Math.floor(Math.random() * 60)).padStart(2, '0');
      const secIn = String(Math.floor(Math.random() * 60)).padStart(2, '0');
      
      const hourOut = '18';
      const minOut = String(Math.floor(Math.random() * 30)).padStart(2, '0');
      const secOut = String(Math.floor(Math.random() * 60)).padStart(2, '0');

      onSimulatePunch(
        selectedEmpId, 
        `${hourIn}:${minIn}:${secIn}`, 
        `${hourOut}:${minOut}:${secOut}`,
        'Biometric'
      );
      setHardwareStatus('SUCCESS');
      
      const empName = employees.find(e => e.id === selectedEmpId)?.fullName;
      
      // Quick clean alert notification
      setTimeout(() => {
        setHardwareStatus('IDLE');
      }, 1500);
    }, 800);
  };

  return (
    <div className="flex flex-col h-full bg-slate-250 select-none text-slate-800 font-mono text-xs border border-slate-400 shadow-xl overflow-hidden" id="win-desktop-root">
      
      {/* 1. Classic Windows Chrome Titlebar */}
      <div className="bg-gradient-to-r from-slate-750 to-slate-850 text-white px-2.5 py-1.5 flex items-center justify-between pointer-events-none select-none bg-slate-900 border-b border-slate-950" id="win-title">
        <div className="flex items-center space-x-2">
          {/* Simulated tiny app insignia */}
          <div className="w-4 h-4 rounded-xs bg-emerald-600 flex items-center justify-center text-[9px] font-bold text-white leading-none">
            B
          </div>
          <span className="font-sans font-medium text-xs tracking-wide">
            Bin Ishaq Enterprise HR client v2.4.1 (64-bit) - [Production Node: 42.10.x]
          </span>
        </div>
        
        {/* Windows title controls */}
        <div className="flex items-center space-x-1.5 font-sans pointer-events-auto">
          <div className="w-5 h-5 flex items-center justify-center rounded-xs transition hover:bg-slate-700 cursor-pointer text-slate-400 text-xs">—</div>
          <div className="w-5 h-5 flex items-center justify-center rounded-xs border border-slate-600 text-[10px] text-slate-400 select-none">▢</div>
          <div className="w-6 h-5 flex items-center justify-center rounded-xs transition hover:bg-rose-600 hover:text-white cursor-pointer text-slate-400" onClick={() => alert('Windows standard app exit requires full shell signal.')}>×</div>
        </div>
      </div>

      {/* 2. Classic File Menu Bar */}
      <div className="bg-slate-100 border-b border-slate-300 px-2 py-1 flex space-x-3 text-slate-700 text-[11px] font-sans" id="win-menu">
        <span className="hover:bg-slate-200 px-1.5 py-0.5 rounded cursor-pointer transition">File</span>
        <span className="hover:bg-slate-200 px-1.5 py-0.5 rounded cursor-pointer transition" onClick={() => alert('FBR tax slab configuration values are loaded directly from cloud database.')}>Edit</span>
        <span className="hover:bg-slate-200 px-1.5 py-0.5 rounded cursor-pointer transition" onClick={() => alert('Connected Biometric machine is in full sync mode.')}>Tools</span>
        <span className="hover:bg-slate-200 px-1.5 py-0.5 rounded cursor-pointer transition">Config</span>
        <span className="hover:bg-slate-200 px-1.5 py-0.5 rounded cursor-pointer transition">View</span>
        <span className="hover:bg-slate-200 px-1.5 py-0.5 rounded cursor-pointer transition" onClick={() => alert('Bin Ishaq Enterprise client builds on React framework for cross-system standardizations.')}>Help</span>
      </div>

      {/* 3. Classic High density Toolbar */}
      <div className="bg-slate-50 border-b border-slate-300 p-2 flex items-center justify-between" id="win-toolbar">
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => setActivePane('grid')}
            className={`px-3 py-1.5 border rounded flex items-center space-x-1 ${activePane === 'grid' ? 'bg-slate-300 border-slate-400 text-slate-900 font-bold' : 'bg-slate-100 hover:bg-slate-200 border-slate-300'}`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="font-sans">Grid view</span>
          </button>
          
          <button 
            onClick={() => setActivePane('hardware')}
            className={`px-3 py-1.5 border rounded flex items-center space-x-1 ${activePane === 'hardware' ? 'bg-slate-300 border-slate-400 text-slate-900 font-bold' : 'bg-slate-100 hover:bg-slate-200 border-slate-300'}`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span className="font-sans">Biometric Port SDK</span>
          </button>

          <button 
            onClick={() => setActivePane('logs')}
            className={`px-3 py-1.5 border rounded flex items-center space-x-1 ${activePane === 'logs' ? 'bg-slate-300 border-slate-400 text-slate-900 font-bold' : 'bg-slate-100 hover:bg-slate-200 border-slate-300'}`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span className="font-sans">Hardware Log files</span>
          </button>
        </div>

        {/* Dense filter search */}
        <div className="flex items-center space-x-1.5">
          <span className="text-[11px] font-sans text-slate-600">Filters:</span>
          <div className="relative">
            <input 
              type="text"
              placeholder="Search Code / CNIC..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-6 pr-2 py-1 border border-slate-350 bg-white rounded font-mono text-xs w-48 focus:outline-none"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1.5" />
          </div>
        </div>
      </div>

      {/* 4. Split panel application layout */}
      <div className="flex-1 flex overflow-hidden bg-white" id="win-body-split">
        
        {/* Left hierarchy panel: Dense list */}
        <div className="w-64 bg-slate-50 border-r border-slate-300 flex flex-col overflow-hidden" id="win-left-rail">
          <div className="px-3 py-2 bg-slate-200 border-b border-slate-300 font-bold font-sans text-slate-700 flex justify-between items-center text-[10px] uppercase">
            <span>Employees index list</span>
            <span className="bg-slate-400 text-white font-mono rounded px-1">{filteredEmps.length}</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-250">
            {filteredEmps.map(emp => {
              const worksAs = emp.wageType === 'Daily Wager' ? 'Daily' : 'Salaried';
              return (
                <div 
                  key={emp.id}
                  onClick={() => setSelectedEmpId(emp.id)}
                  className={`p-2.5 cursor-pointer transition select-none ${selectedEmpId === emp.id ? 'bg-indigo-600 text-white font-bold' : 'hover:bg-slate-100 text-slate-800'}`}
                >
                  <p className="font-sans leading-snug">{emp.fullName}</p>
                  <p className={`text-[10px] font-mono mt-0.5 ${selectedEmpId === emp.id ? 'text-indigo-100' : 'text-slate-500'}`}>
                    {emp.employeeCode} • {worksAs}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Main interactive viewport depends on tool selection */}
        <div className="flex-1 overflow-y-auto p-4 bg-white" id="win-content-view">
          
          {activePane === 'grid' && (
            <div className="space-y-4">
              
              {/* Highlight selection */}
              {selectedEmpId && (
                (() => {
                  const emp = employees.find(e => e.id === selectedEmpId);
                  if (!emp) return <p className="text-xs text-slate-400">Kindly choose an employee from sidebar.</p>;
                  return (
                    <div className="border border-slate-305 bg-slate-50/55 p-4 rounded space-y-3">
                      <div className="flex justify-between items-start border-b border-slate-300 pb-2">
                        <div>
                          <h3 className="font-sans font-bold text-slate-900 text-sm leading-none">{emp.fullName}</h3>
                          <p className="text-[10px] text-slate-500 mt-1 font-mono">REGISTRY: {emp.employeeCode} • NTN Check Verified</p>
                        </div>
                        <span className="bg-slate-905 text-white font-mono text-[9px] uppercase font-bold px-1.5 py-0.5 rounded leading-none bg-slate-800">
                          {emp.wageType}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-slate-700">
                        <p>CNIC Mapped: <strong className="text-slate-900 font-mono">{emp.cnic}</strong></p>
                        <p>Mobile: <strong className="text-slate-900 font-mono">{emp.contactNumber}</strong></p>
                        <p>Default BanK: <strong className="text-slate-900 font-serif">{emp.bankName}</strong></p>
                        <p>IBAN: <strong className="text-slate-900 font-mono">{emp.iban}</strong></p>
                        <p>Provincial Region: <strong className="text-slate-900 font-sans">Sindh (Social Sec: {emp.socialSecurityNumber || 'No'})</strong></p>
                        <p>Base Wage Constant: <strong className="text-emerald-700 font-mono">PKR {emp.basicSalary.toLocaleString()}</strong></p>
                      </div>

                      {/* Quick action button for biometric on this employee */}
                      <div className="pt-2 flex space-x-2">
                        <button 
                          onClick={() => {
                            setSelectedEmpId(emp.id);
                            setActivePane('hardware');
                          }}
                          className="bg-slate-900 text-white hover:bg-slate-800 px-3 py-1.5 rounded font-sans flex items-center font-bold text-[11px]"
                        >
                          <Cpu className="w-3 h-3 mr-1" /> Load into Biometric Punch Emulator
                        </button>
                      </div>
                    </div>
                  );
                })()
              )}

              {/* Data tables for attendance */}
              <div className="space-y-2">
                <h4 className="font-bold text-xs uppercase text-slate-700 border-b border-slate-200 pb-1 flex items-center font-sans">
                  <Terminal className="w-3.5 h-3.5 text-slate-505 mr-1" />
                  Active Attendance Database logs
                </h4>

                <div className="border border-slate-300 rounded overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left">
                    <thead className="bg-slate-50 text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono">
                      <tr>
                        <th className="px-3 py-1.5">Date</th>
                        <th className="px-3 py-1.5">Employee Name</th>
                        <th className="px-3 py-1.5">Punch In</th>
                        <th className="px-3 py-1.5">Punch Out</th>
                        <th className="px-3 py-1.5">Method</th>
                        <th className="px-3 py-1.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 text-[11px] font-mono text-slate-700">
                      {attendances.slice(-10).map((att, index) => {
                        const empName = employees.find(e => e.id === att.employeeId)?.fullName || 'Wager';
                        return (
                          <tr key={index} className="hover:bg-slate-50">
                            <td className="px-3 py-1.5">{att.date}</td>
                            <td className="px-3 py-1.5 font-sans font-medium">{empName}</td>
                            <td className="px-3 py-1.5 text-emerald-700 font-bold">{att.punchIn || '--:--'}</td>
                            <td className="px-3 py-1.5 text-indigo-700">{att.punchOut || '--:--'}</td>
                            <td className="px-3 py-1.5">{att.method}</td>
                            <td className="px-3 py-1.5">
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                att.status === 'Present' ? 'bg-emerald-100 text-emerald-800' : 
                                att.status === 'Late' ? 'bg-orange-100 text-orange-900' : 'bg-rose-100 text-rose-800'
                              }`}>
                                {att.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: BIOMETRIC SIMULATOR MODULE */}
          {activePane === 'hardware' && (
            <div className="space-y-4 max-w-lg mx-auto py-4">
              <div className="border border-slate-400 bg-slate-50 p-6 rounded-lg space-y-4 shadow-sm">
                
                <div className="flex items-center space-x-3 text-slate-850">
                  <Play className="w-8 h-8 text-emerald-600 flex-shrink-0" />
                  <div>
                    <h3 className="font-sans font-bold text-sm text-slate-900">Biometric Device Port Emulator (USB)</h3>
                    <p className="text-[10px] text-slate-400">Mocking SDK triggers to capture real-time fingerprint swipes</p>
                  </div>
                </div>

                <hr className="border-slate-300" />

                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Active Machine Port:</label>
                    <select 
                      value={hardwarePort}
                      onChange={(e) => setHardwarePort(e.target.value)}
                      className="w-full font-mono p-1.5 border border-slate-300 bg-white text-xs"
                    >
                      <option value="COM3 (ZK-TeCO SDK v11.4)">COM3 - ZK-Teco Biometric (Connected)</option>
                      <option value="COM4 (Hanvon FaceId Terminal)">COM4 - face check scanner (Idle)</option>
                      <option value="IP_PORT: 192.168.1.201">TCPIP Node 192.168.1.201</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Employee selection to register fingerprint scan:</label>
                    <select
                      value={selectedEmpId}
                      onChange={(e) => setSelectedEmpId(e.target.value)}
                      className="w-full font-sans p-1.5 border border-slate-300 bg-white text-xs"
                    >
                      {employees.map(e => (
                        <option key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="pt-2">
                  <button 
                    disabled={hardwareStatus === 'READING'}
                    onClick={handleBiometricSimulation}
                    className={`w-full font-sans uppercase font-bold py-3 px-4 rounded shadow-md border text-center transition flex justify-center items-center space-x-2 ${
                      hardwareStatus === 'READING' ? 'bg-amber-100 text-amber-700 border-amber-300' :
                      hardwareStatus === 'SUCCESS' ? 'bg-emerald-600 text-white border-emerald-700' :
                      'bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-700'
                    }`}
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>
                      {hardwareStatus === 'READING' ? 'PROCESSING SCAN...' : 
                       hardwareStatus === 'SUCCESS' ? 'PUNCH COMMITTED!' : 
                       'SIMULATE FINGERPRINT SWIPE'}
                    </span>
                  </button>
                </div>

                {/* Footnote instruction */}
                <p className="text-[10px] text-slate-400 italic text-center">
                  * Swiping generates attendance punch records in local list instantly, synchronizing parameters automatically to FBR tax engines in Web Dashboard.
                </p>

              </div>
            </div>
          )}

          {/* TAB 3: LOGS FEED FILE */}
          {activePane === 'logs' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center bg-slate-100 p-2 border border-slate-300 rounded font-sans">
                <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">Active COM3 Debug terminal stream</span>
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              </div>

              <div className="bg-slate-900 text-slate-300 p-4 rounded font-mono text-[11px] leading-relaxed space-y-1 h-80 overflow-y-auto">
                <p className="text-yellow-500">[SYSTEM_INFO] BI-HR client local runtime booted at {new Date().toISOString()}</p>
                <p className="text-slate-400">[PORT_SETUP] Initializing Serial connection on default COM3...</p>
                <p className="text-emerald-500">[PORT_OK] COM3 responding with baudrate 115200. ZKTeco firmware v4.11</p>
                <p className="text-blue-400">[SOCKET] Established persistent websocket handshake to Firestore ai-studio-0ab7c3a1...</p>
                <p className="text-slate-500">[POLLING] Awaiting hardware signals... (No action required)</p>
                {attendances.slice(-5).map((att, idx) => {
                  const emp = employees.find(e => e.id === att.employeeId);
                  return (
                    <div key={idx} className="text-slate-300 space-y-0.5">
                      <p className="text-emerald-400">[RAW_SIGNAL] Card/Fingerprint validated code: {emp?.employeeCode || '0X992'} on {att.date} {att.punchIn}</p>
                      <p className="text-slate-400">[COMMIT_LOCAL] Log parsed to JSON: {JSON.stringify({ id: att.id, stats: att.status })}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>

      </div>

      {/* 5. Windows Status bar */}
      <div className="bg-slate-100 border-t border-slate-300 px-3 py-1 flex justify-between items-center text-slate-600 text-[10px] font-sans" id="win-status">
        <div className="flex items-center space-x-3">
          <span className="flex items-center text-emerald-700 font-semibold uppercase font-mono">
            <Server className="w-3.5 h-3.5 mr-1" />
            Node: ONLINE
          </span>
          <span className="text-slate-400 border-l pl-3">COM3 Port: OK</span>
          <span className="text-slate-400 border-l pl-3">Statutory Config: FBR-FY26 Loaded</span>
        </div>
        
        <div className="flex items-center space-x-2">
          <span>Client: Active Web Session Synced</span>
          <span className="font-mono bg-slate-300 px-1 text-[10px]">CAP LOCK: OFF</span>
        </div>
      </div>

    </div>
  );
}
