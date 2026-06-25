using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.ServiceProcess;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using DPUruNet;

namespace Uru4500Bridge
{
    internal static class Program
    {
        private const int Port = 15896;
        private static readonly object CaptureLock = new object();
        private static readonly string LogPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "bridge.log");

        private static void Main(string[] args)
        {
            if (args.Length > 0 && args[0].Equals("--service", StringComparison.OrdinalIgnoreCase))
            {
                ServiceBase.Run(new BridgeService());
                return;
            }

            var server = new BridgeServer();
            try
            {
                server.Start();
                Console.WriteLine("Biometric bridge listening on ws://localhost:" + Port);
                Console.WriteLine("Keep this window open while using the HR biometric module.");
                Thread.Sleep(Timeout.Infinite);
            }
            catch (Exception ex)
            {
                Log("Fatal: " + ex);
                throw;
            }
            finally
            {
                server.Stop();
            }
        }

        private sealed class BridgeService : ServiceBase
        {
            private readonly BridgeServer server = new BridgeServer();

            public BridgeService()
            {
                ServiceName = "URU4500Bridge";
                CanStop = true;
                CanPauseAndContinue = false;
                AutoLog = true;
            }

            protected override void OnStart(string[] args)
            {
                server.Start();
            }

            protected override void OnStop()
            {
                server.Stop();
            }
        }

        private sealed class BridgeServer
        {
            private TcpListener listener;
            private Thread acceptThread;
            private volatile bool running;

            public void Start()
            {
                Log("Starting biometric bridge");
                AddSdkNativePath();

                listener = new TcpListener(IPAddress.Loopback, Port);
                listener.Start();
                running = true;
                Log("Listening on ws://localhost:" + Port);

                acceptThread = new Thread(AcceptLoop);
                acceptThread.IsBackground = true;
                acceptThread.Start();
            }

            public void Stop()
            {
                running = false;
                try
                {
                    if (listener != null) listener.Stop();
                }
                catch { }
                Log("Stopped biometric bridge");
            }

            private void AcceptLoop()
            {
                while (running)
                {
                    try
                    {
                        var client = listener.AcceptTcpClient();
                        var thread = new Thread(() => HandleClient(client));
                        thread.IsBackground = true;
                        thread.Start();
                    }
                    catch (SocketException)
                    {
                        if (running) throw;
                    }
                    catch (ObjectDisposedException)
                    {
                        if (running) throw;
                    }
                    catch (Exception ex)
                    {
                        Log("AcceptLoop error: " + ex);
                    }
                }
            }
        }

        private static void Log(string message)
        {
            try
            {
                File.AppendAllText(LogPath, DateTime.Now.ToString("s") + " " + message + Environment.NewLine);
            }
            catch { }
        }

        private static void AddSdkNativePath()
        {
            var current = AppDomain.CurrentDomain.BaseDirectory;
            var sdkX64 = @"C:\Program Files\DigitalPersona\U.are.U SDK\Windows\Lib\x64";
            var path = Environment.GetEnvironmentVariable("PATH") ?? "";
            var secuGenPaths = string.Join(";", GetSecuGenSearchDirectories().ToArray());
            Environment.SetEnvironmentVariable("PATH", current + ";" + sdkX64 + ";" + secuGenPaths + ";" + path);
        }

        private static void HandleClient(TcpClient client)
        {
            using (client)
            using (var stream = client.GetStream())
            {
                try
                {
                    if (!Handshake(stream)) return;
                    SendText(stream, "{\"status\":\"Connected\",\"message\":\"Biometric bridge ready\"}");

                    while (client.Connected)
                    {
                        var message = ReadTextFrame(stream);
                        if (message == null) break;

                        if (message.IndexOf("GetDeviceList", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            SendText(stream, BuildDeviceListJson());
                        }
                        else if (message.IndexOf("StartCapture", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            Log("StartCapture requested");
                            SendText(stream, "{\"status\":\"CaptureStarted\",\"message\":\"Place finger on the fingerprint reader\"}");
                            SendText(stream, CaptureJson());
                        }
                        else if (message.IndexOf("Identify", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            Log("Identify requested");
                            SendText(stream, "{\"status\":\"CaptureStarted\",\"message\":\"Place finger on the fingerprint reader\"}");
                            SendText(stream, IdentifyJson(message));
                        }
                        else if (message.IndexOf("StopCapture", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            SendText(stream, "{\"status\":\"CaptureStopped\"}");
                        }
                        else
                        {
                            SendText(stream, "{\"status\":\"Unknown\",\"message\":\"Unsupported action\"}");
                        }
                    }
                }
                catch (Exception ex)
                {
                    try { SendText(stream, ErrorJson(ex.Message)); } catch { }
                    Console.WriteLine("Client error: " + ex.Message);
                }
            }
        }

        private static string BuildDeviceListJson()
        {
            var parts = new List<string>();
            var diagnostics = new List<string>();

            try
            {
                var readers = ReaderCollection.GetReaders();
                if (readers.Count == 0)
                {
                    diagnostics.Add("DigitalPersona runtime is available, but no U.are.U reader is currently detected.");
                }

                foreach (Reader reader in readers)
                {
                    var sn = reader.Description.SerialNumber ?? "URU4500";
                    var name = reader.Description.Name ?? "U.are.U 4500";
                    parts.Add("{\"sn\":\"" + Json(sn) + "\",\"id\":\"" + Json(sn) + "\",\"provider\":\"digitalpersona\",\"type\":\"" + Json(name) + "\",\"name\":\"" + Json(name) + "\"}");
                }
            }
            catch (Exception ex)
            {
                diagnostics.Add("DigitalPersona reader scan failed: " + ex.Message);
            }

            var secuGenAssembly = FindSecuGenAssemblyPath();
            var secuGenNative = FindSecuGenNativePath();
            if (secuGenAssembly.Length > 0 || secuGenNative.Length > 0)
            {
                parts.Add("{\"sn\":\"SECUGEN-HUPX\",\"id\":\"SECUGEN-HUPX\",\"provider\":\"secugen\",\"type\":\"SecuGen Hamster Pro (HUPx)\",\"name\":\"SecuGen Corporation Hamster Pro (HUPx)\"}");
            }
            else
            {
                if (secuGenAssembly.Length == 0)
                {
                    diagnostics.Add("SecuGen FDx SDK Pro is not detected: missing SecuGen.FDxSDKPro.Windows.dll.");
                }
                if (secuGenNative.Length == 0)
                {
                    diagnostics.Add("SecuGen native runtime is not detected: missing sgfplib.dll.");
                }
                diagnostics.Add("Install the SecuGen driver/runtime, copy sgfplib.dll beside URU4500Bridge.exe, or set SECUGEN_FDX_SDK to the SDK/service folder.");
            }

            return "{\"status\":\"DeviceList\",\"devices\":[" + string.Join(",", parts.ToArray()) +
                "],\"diagnostics\":[" + QuoteList(diagnostics) + "]}";
        }

        private static string CaptureJson()
        {
            lock (CaptureLock)
            {
                try
                {
                    var captured = CaptureFmd();
                    return "{\"status\":\"CaptureComplete\",\"provider\":\"" + Json(captured.Provider) +
                        "\",\"quality\":" + captured.Quality +
                        ",\"device\":" + captured.DeviceJson +
                        ",\"template\":\"" + Json(captured.Template) +
                        "\",\"sample\":\"" + Json(captured.Template) + "\"}";
                }
                catch (Exception ex)
                {
                    return ErrorJson(ex.Message);
                }
            }
        }

        private static CaptureResult CaptureAsync(Reader reader, int resolution, int timeoutMs)
        {
            CaptureResult capture = null;
            var done = new ManualResetEvent(false);
            Reader.CaptureCallback callback = result =>
            {
                Log("CaptureAsync callback result=" + (result == null ? "null" : result.ResultCode + " quality=" + result.Quality));
                capture = result;
                done.Set();
            };

            reader.On_Captured += callback;
            try
            {
                var start = reader.CaptureAsync(
                    Constants.Formats.Fid.ANSI,
                    Constants.CaptureProcessing.DP_IMG_PROC_DEFAULT,
                    resolution
                );
                Log("CaptureAsync start result=" + start);
                if (start != Constants.ResultCode.DP_SUCCESS)
                {
                    throw new Exception("CaptureAsync failed to start: " + start);
                }

                if (!done.WaitOne(timeoutMs))
                {
                    Log("CaptureAsync timed out after " + timeoutMs + "ms");
                    try { reader.CancelCapture(); } catch { }
                    return new CaptureResult(
                        Constants.ResultCode.DP_SUCCESS,
                        Constants.CaptureQuality.DP_QUALITY_TIMED_OUT,
                        0,
                        null
                    );
                }

                return capture;
            }
            finally
            {
                try { reader.On_Captured -= callback; } catch { }
            }
        }

        private sealed class GalleryItem
        {
            public string EmployeeId;
            public string Template;
        }

        private sealed class CapturedFmd
        {
            public Fmd Fmd;
            public string Template;
            public int Quality;
            public string DeviceJson;
            public string Provider;
            public object SecuGenManager;
        }

        private static string IdentifyJson(string requestJson)
        {
            lock (CaptureLock)
            {
                try
                {
                    var gallery = ExtractGallery(requestJson);
                    if (gallery.Count == 0)
                    {
                        return ErrorJson("No enrolled fingerprint templates were supplied.");
                    }

                    var captured = CaptureFmd();
                    if (captured == null || string.IsNullOrEmpty(captured.Template))
                    {
                        return ErrorJson("Fingerprint capture did not produce a template.");
                    }

                    var threshold = ExtractInt(requestJson, "threshold", 2147);
                    var bestEmployeeId = "";
                    var bestScore = int.MaxValue;

                    if (captured.Provider == "secugen")
                    {
                        foreach (var item in gallery)
                        {
                            if (!item.Template.StartsWith("SGFDX:", StringComparison.OrdinalIgnoreCase)) continue;
                            try
                            {
                                var score = SecuGenMatchScore(captured.SecuGenManager, captured.Template, item.Template);
                                if (score >= 0 && score < bestScore)
                                {
                                    bestScore = score;
                                    bestEmployeeId = item.EmployeeId;
                                }
                            }
                            catch (Exception ex)
                            {
                                Log("SecuGen identify compare error for employee=" + item.EmployeeId + " error=" + ex.Message);
                            }
                        }
                    }
                    else
                    {
                        foreach (var item in gallery)
                        {
                            if (item.Template.StartsWith("SGFDX:", StringComparison.OrdinalIgnoreCase)) continue;
                            try
                            {
                                var bytes = Convert.FromBase64String(item.Template);
                                var enrolledResult = Importer.ImportFmd(bytes, Constants.Formats.Fmd.ANSI, Constants.Formats.Fmd.ANSI);
                                if (enrolledResult == null || enrolledResult.Data == null || enrolledResult.ResultCode != Constants.ResultCode.DP_SUCCESS)
                                {
                                    Log("ImportFmd failed for employee=" + item.EmployeeId);
                                    continue;
                                }

                                var compare = Comparison.Compare(captured.Fmd, 0, enrolledResult.Data, 0);
                                if (compare != null && compare.ResultCode == Constants.ResultCode.DP_SUCCESS && compare.Score < bestScore)
                                {
                                    bestScore = compare.Score;
                                    bestEmployeeId = item.EmployeeId;
                                }
                            }
                            catch (Exception ex)
                            {
                                Log("Identify compare error for employee=" + item.EmployeeId + " error=" + ex.Message);
                            }
                        }
                    }

                    var matched = bestEmployeeId.Length > 0 && bestScore <= threshold;
                    return "{\"status\":\"IdentifyComplete\",\"matched\":" + (matched ? "true" : "false") +
                        ",\"employeeId\":\"" + Json(matched ? bestEmployeeId : "") +
                        "\",\"score\":" + (bestScore == int.MaxValue ? -1 : bestScore) +
                        ",\"threshold\":" + threshold +
                        ",\"quality\":" + captured.Quality +
                        ",\"device\":" + captured.DeviceJson +
                        ",\"template\":\"" + Json(captured.Template) + "\"}";
                }
                catch (Exception ex)
                {
                    return ErrorJson(ex.Message);
                }
            }
        }

        private static CapturedFmd CaptureFmd()
        {
            Reader reader = null;
            try
            {
                var readers = ReaderCollection.GetReaders();
                Log("ReaderCollection.GetReaders count=" + (readers == null ? 0 : readers.Count));
                if (readers == null || readers.Count == 0)
                {
                    Log("No DigitalPersona reader found; trying SecuGen FDx SDK.");
                    return CaptureSecuGenTemplate();
                }

                reader = readers[0];
                Log("Using reader name=" + reader.Description.Name + " sn=" + reader.Description.SerialNumber);
                var open = reader.Open(Constants.CapturePriority.DP_PRIORITY_EXCLUSIVE);
                Log("Reader.Open exclusive result=" + open);
                if (open != Constants.ResultCode.DP_SUCCESS)
                {
                    open = reader.Open(Constants.CapturePriority.DP_PRIORITY_COOPERATIVE);
                    Log("Reader.Open cooperative result=" + open);
                }
                if (open != Constants.ResultCode.DP_SUCCESS)
                {
                    throw new Exception("Reader open failed: " + open);
                }

                EnsureReady(reader);
                var resolution = reader.Capabilities.Resolutions[0];
                var capture = CaptureAsync(reader, resolution, 30000);
                Log("Capture result=" + (capture == null ? "null" : capture.ResultCode + " quality=" + capture.Quality));

                if (capture == null || capture.Data == null || capture.ResultCode != Constants.ResultCode.DP_SUCCESS ||
                    capture.Quality == Constants.CaptureQuality.DP_QUALITY_TIMED_OUT ||
                    capture.Quality == Constants.CaptureQuality.DP_QUALITY_CANCELED ||
                    capture.Quality == Constants.CaptureQuality.DP_QUALITY_NO_FINGER)
                {
                    var reason = capture == null ? "No capture result" : capture.ResultCode + " / " + capture.Quality;
                    throw new Exception("Capture failed: " + reason);
                }

                var fmd = FeatureExtraction.CreateFmdFromFid(capture.Data, Constants.Formats.Fmd.ANSI);
                Log("FMD result=" + (fmd == null ? "null" : fmd.ResultCode.ToString()));
                if (fmd == null || fmd.Data == null || fmd.ResultCode != Constants.ResultCode.DP_SUCCESS)
                {
                    var reason = fmd == null ? "No FMD result" : fmd.ResultCode.ToString();
                    throw new Exception("Template extraction failed: " + reason);
                }

                var sn = reader.Description.SerialNumber ?? "URU4500";
                var name = reader.Description.Name ?? "U.are.U 4500";
                return new CapturedFmd
                {
                    Fmd = fmd.Data,
                    Template = Convert.ToBase64String(fmd.Data.Bytes),
                    Quality = QualityScore(capture.Quality),
                    Provider = "digitalpersona",
                    DeviceJson = "{\"sn\":\"" + Json(sn) + "\",\"provider\":\"digitalpersona\",\"type\":\"" + Json(name) + "\",\"name\":\"" + Json(name) + "\"}"
                };
            }
            finally
            {
                if (reader != null)
                {
                    try { reader.CancelCapture(); } catch { }
                    try { reader.Dispose(); } catch { }
                }
            }
        }

        private static List<GalleryItem> ExtractGallery(string requestJson)
        {
            var items = new List<GalleryItem>();
            var matches = Regex.Matches(
                requestJson,
                "\"employeeId\"\\s*:\\s*\"(?<employeeId>(?:\\\\.|[^\"])*)\"\\s*,\\s*\"template\"\\s*:\\s*\"(?<template>(?:\\\\.|[^\"])*)\"",
                RegexOptions.IgnoreCase
            );

            foreach (Match match in matches)
            {
                items.Add(new GalleryItem
                {
                    EmployeeId = Unjson(match.Groups["employeeId"].Value),
                    Template = Unjson(match.Groups["template"].Value)
                });
            }
            return items;
        }

        private static bool IsSecuGenSdkAvailable()
        {
            return FindSecuGenAssemblyPath().Length > 0;
        }

        private static string FindSecuGenAssemblyPath()
        {
            foreach (var dir in GetSecuGenSearchDirectories())
            {
                var candidate = Path.Combine(dir, "SecuGen.FDxSDKPro.Windows.dll");
                if (File.Exists(candidate)) return candidate;
            }
            return "";
        }

        private static string FindSecuGenNativePath()
        {
            foreach (var dir in GetSecuGenSearchDirectories())
            {
                var candidate = Path.Combine(dir, "sgfplib.dll");
                if (File.Exists(candidate)) return candidate;
            }
            return "";
        }

        private static List<string> GetSecuGenSearchDirectories()
        {
            var dirs = new List<string>();
            AddDirectory(dirs, AppDomain.CurrentDomain.BaseDirectory);
            AddDirectory(dirs, Environment.GetEnvironmentVariable("SECUGEN_FDX_SDK"));
            AddDirectory(dirs, @"C:\Program Files\SecuGen\FDx SDK Pro for Windows\bin");
            AddDirectory(dirs, @"C:\Program Files\SecuGen\FDx SDK Pro for Windows\bin\x64");
            AddDirectory(dirs, @"C:\Program Files (x86)\SecuGen\FDx SDK Pro for Windows\bin");
            AddDirectory(dirs, @"C:\Program Files (x86)\SecuGen\FDx SDK Pro for Windows\bin\x64");

            AddSecuGenSubDirectories(dirs, Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles));
            AddSecuGenSubDirectories(dirs, Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86));
            return dirs;
        }

        private static void AddSecuGenSubDirectories(List<string> dirs, string programFilesRoot)
        {
            if (string.IsNullOrWhiteSpace(programFilesRoot)) return;
            var secuGenRoot = Path.Combine(programFilesRoot, "SecuGen");
            if (!Directory.Exists(secuGenRoot)) return;

            try
            {
                foreach (var dll in Directory.GetFiles(secuGenRoot, "SecuGen.FDxSDKPro.Windows.dll", SearchOption.AllDirectories))
                {
                    AddDirectory(dirs, Path.GetDirectoryName(dll));
                }
                foreach (var dll in Directory.GetFiles(secuGenRoot, "sgfplib.dll", SearchOption.AllDirectories))
                {
                    AddDirectory(dirs, Path.GetDirectoryName(dll));
                }
            }
            catch (Exception ex)
            {
                Log("SecuGen SDK directory scan skipped: " + ex.Message);
            }
        }

        private static void AddDirectory(List<string> dirs, string path)
        {
            if (string.IsNullOrWhiteSpace(path)) return;
            var fullPath = Path.GetFullPath(path);
            if (!Directory.Exists(fullPath)) return;
            foreach (var existing in dirs)
            {
                if (string.Equals(existing, fullPath, StringComparison.OrdinalIgnoreCase)) return;
            }
            dirs.Add(fullPath);
        }

        private static Assembly LoadSecuGenAssembly()
        {
            var path = FindSecuGenAssemblyPath();
            if (path.Length == 0)
            {
                throw new Exception("SecuGen Hamster Pro (HUPx) support requires SecuGen FDx SDK Pro for Windows runtime files. Install the SecuGen driver/SDK, or copy SecuGen.FDxSDKPro.Windows.dll and sgfplib.dll beside URU4500Bridge.exe. You may also set SECUGEN_FDX_SDK to the SDK bin folder.");
            }
            return Assembly.LoadFrom(path);
        }

        private static CapturedFmd CaptureSecuGenTemplate()
        {
            if (FindSecuGenAssemblyPath().Length == 0 && FindSecuGenNativePath().Length > 0)
            {
                return CaptureSecuGenTemplateNative();
            }

            Assembly asm;
            try
            {
                asm = LoadSecuGenAssembly();
            }
            catch (Exception ex)
            {
                if (FindSecuGenNativePath().Length > 0)
                {
                    Log("Managed SecuGen load failed; falling back to native sgfplib.dll. Error=" + ex.Message);
                    return CaptureSecuGenTemplateNative();
                }
                throw;
            }

            var managerType = asm.GetType("SecuGen.FDxSDKPro.Windows.SGFingerPrintManager", true);
            var deviceNameType = asm.GetType("SecuGen.FDxSDKPro.Windows.SGFPMDeviceName", true);
            var portAddrType = asm.GetType("SecuGen.FDxSDKPro.Windows.SGFPMPortAddr", true);
            var infoType = asm.GetType("SecuGen.FDxSDKPro.Windows.SGFPMDeviceInfoParam", true);

            var manager = Activator.CreateInstance(managerType);
            Invoke(manager, "Init", Enum.Parse(deviceNameType, "DEV_AUTO"));
            Invoke(manager, "OpenDevice", Enum.Parse(portAddrType, "USB_AUTO_DETECT"));

            var info = Activator.CreateInstance(infoType);
            TryInvoke(manager, "GetDeviceInfo", info);
            var width = Math.Max(1, GetIntProperty(info, "ImageWidth", 260));
            var height = Math.Max(1, GetIntProperty(info, "ImageHeight", 300));
            var serial = GetStringProperty(info, "DeviceSN", "SECUGEN-HUPX");

            var image = new byte[width * height];
            if (!TryInvoke(manager, "GetImageEx", image, 10000, 50))
            {
                Invoke(manager, "GetImage", image);
            }

            var quality = 80;
            var qualityArgs = new object[] { width, height, image, quality };
            if (TryInvokeRef(manager, "GetImageQuality", qualityArgs))
            {
                quality = Convert.ToInt32(qualityArgs[3]);
            }

            var maxTemplateSize = 400;
            var sizeArgs = new object[] { maxTemplateSize };
            if (TryInvokeRef(manager, "GetMaxTemplateSize", sizeArgs))
            {
                maxTemplateSize = Math.Max(128, Convert.ToInt32(sizeArgs[0]));
            }

            var template = new byte[maxTemplateSize];
            Invoke(manager, "CreateTemplate", null, image, template);
            var templateText = "SGFDX:" + Convert.ToBase64String(template);

            return new CapturedFmd
            {
                Fmd = null,
                Provider = "secugen",
                SecuGenManager = manager,
                Template = templateText,
                Quality = Math.Max(0, Math.Min(100, quality)),
                DeviceJson = "{\"sn\":\"" + Json(serial) + "\",\"provider\":\"secugen\",\"type\":\"SecuGen Hamster Pro (HUPx)\",\"name\":\"SecuGen Corporation Hamster Pro (HUPx)\"}"
            };
        }

        private static int SecuGenMatchScore(object manager, string capturedTemplate, string enrolledTemplate)
        {
            if (manager is IntPtr)
            {
                return SecuGenNativeMatchScore((IntPtr)manager, capturedTemplate, enrolledTemplate);
            }

            var captured = DecodeSecuGenTemplate(capturedTemplate);
            var enrolled = DecodeSecuGenTemplate(enrolledTemplate);
            var asm = manager.GetType().Assembly;
            var securityType = asm.GetType("SecuGen.FDxSDKPro.Windows.SGFPMSecurityLevel", true);
            var level = Enum.Parse(securityType, "NORMAL");

            var matched = false;
            var args = new object[] { captured, enrolled, level, matched };
            if (!TryInvokeRef(manager, "MatchTemplate", args)) return -1;

            matched = Convert.ToBoolean(args[3]);
            return matched ? 0 : int.MaxValue;
        }

        private static CapturedFmd CaptureSecuGenTemplateNative()
        {
            IntPtr manager;
            CheckSecuGenCode(NativeSecuGen.CreateSGFPMObject(out manager), "CreateSGFPMObject");
            if (manager == IntPtr.Zero) throw new Exception("CreateSGFPMObject returned an empty SecuGen manager.");

            CheckSecuGenCode(NativeSecuGen.SGFPM_Init(manager, NativeSecuGen.SG_DEV_AUTO), "SGFPM_Init");
            CheckSecuGenCode(NativeSecuGen.SGFPM_OpenDevice(manager, NativeSecuGen.USB_AUTO_DETECT), "SGFPM_OpenDevice");

            var width = 260;
            var height = 300;
            var serial = "SECUGEN-HUPX";
            try
            {
                var info = new NativeSecuGen.SGDeviceInfoParam();
                if (NativeSecuGen.SGFPM_GetDeviceInfo(manager, ref info) == 0)
                {
                    width = info.ImageWidth > 0 ? info.ImageWidth : width;
                    height = info.ImageHeight > 0 ? info.ImageHeight : height;
                    if (!string.IsNullOrWhiteSpace(info.DeviceSN)) serial = info.DeviceSN.Trim();
                }
            }
            catch (Exception ex)
            {
                Log("SecuGen native GetDeviceInfo skipped: " + ex.Message);
            }

            var image = new byte[Math.Max(1, width * height)];
            var imageCode = NativeSecuGen.SGFPM_GetImageEx(manager, image, 10000, 50);
            if (imageCode != 0)
            {
                imageCode = NativeSecuGen.SGFPM_GetImage(manager, image);
            }
            CheckSecuGenCode(imageCode, "SGFPM_GetImage");

            var quality = 80;
            try
            {
                NativeSecuGen.SGFPM_GetImageQuality(manager, width, height, image, ref quality);
            }
            catch (Exception ex)
            {
                Log("SecuGen native GetImageQuality skipped: " + ex.Message);
            }

            var maxTemplateSize = 400;
            try
            {
                NativeSecuGen.SGFPM_GetMaxTemplateSize(manager, ref maxTemplateSize);
            }
            catch (Exception ex)
            {
                Log("SecuGen native GetMaxTemplateSize skipped: " + ex.Message);
            }
            maxTemplateSize = Math.Max(128, maxTemplateSize);

            var template = new byte[maxTemplateSize];
            CheckSecuGenCode(NativeSecuGen.SGFPM_CreateTemplate(manager, IntPtr.Zero, image, template), "SGFPM_CreateTemplate");

            return new CapturedFmd
            {
                Fmd = null,
                Provider = "secugen",
                SecuGenManager = manager,
                Template = "SGFDX:" + Convert.ToBase64String(template),
                Quality = Math.Max(0, Math.Min(100, quality)),
                DeviceJson = "{\"sn\":\"" + Json(serial) + "\",\"provider\":\"secugen\",\"type\":\"SecuGen Hamster Pro (HUPx)\",\"name\":\"SecuGen Corporation Hamster Pro (HUPx)\"}"
            };
        }

        private static int SecuGenNativeMatchScore(IntPtr manager, string capturedTemplate, string enrolledTemplate)
        {
            var captured = DecodeSecuGenTemplate(capturedTemplate);
            var enrolled = DecodeSecuGenTemplate(enrolledTemplate);
            var matched = false;
            var code = NativeSecuGen.SGFPM_MatchTemplate(manager, captured, enrolled, NativeSecuGen.SECURITY_NORMAL, ref matched);
            if (code != 0)
            {
                Log("SecuGen native MatchTemplate failed with code " + code);
                return -1;
            }
            return matched ? 0 : int.MaxValue;
        }

        private static void CheckSecuGenCode(int code, string operation)
        {
            if (code != 0) throw new Exception(operation + " failed with SecuGen code " + code);
        }

        private static byte[] DecodeSecuGenTemplate(string template)
        {
            var raw = template.StartsWith("SGFDX:", StringComparison.OrdinalIgnoreCase)
                ? template.Substring("SGFDX:".Length)
                : template;
            return Convert.FromBase64String(raw);
        }

        private static object Invoke(object target, string methodName, params object[] args)
        {
            var method = FindMethod(target.GetType(), methodName, args.Length);
            if (method == null) throw new MissingMethodException(target.GetType().FullName, methodName);
            var result = method.Invoke(target, args);
            var code = Convert.ToInt32(result ?? 0);
            if (code != 0) throw new Exception(methodName + " failed with SecuGen code " + code);
            return result;
        }

        private static bool TryInvoke(object target, string methodName, params object[] args)
        {
            try
            {
                var method = FindMethod(target.GetType(), methodName, args.Length);
                if (method == null) return false;
                var result = method.Invoke(target, args);
                return Convert.ToInt32(result ?? 0) == 0;
            }
            catch (Exception ex)
            {
                Log("SecuGen " + methodName + " failed: " + ex.Message);
                return false;
            }
        }

        private static bool TryInvokeRef(object target, string methodName, object[] args)
        {
            try
            {
                var method = FindMethod(target.GetType(), methodName, args.Length);
                if (method == null) return false;
                var result = method.Invoke(target, args);
                return Convert.ToInt32(result ?? 0) == 0;
            }
            catch (Exception ex)
            {
                Log("SecuGen " + methodName + " failed: " + ex.Message);
                return false;
            }
        }

        private static MethodInfo FindMethod(Type type, string methodName, int argCount)
        {
            foreach (var method in type.GetMethods())
            {
                if (method.Name == methodName && method.GetParameters().Length == argCount) return method;
            }
            return null;
        }

        private static int GetIntProperty(object target, string propertyName, int fallback)
        {
            try
            {
                var prop = target.GetType().GetProperty(propertyName);
                if (prop == null) return fallback;
                return Convert.ToInt32(prop.GetValue(target, null));
            }
            catch { return fallback; }
        }

        private static string GetStringProperty(object target, string propertyName, string fallback)
        {
            try
            {
                var prop = target.GetType().GetProperty(propertyName);
                if (prop == null) return fallback;
                return Convert.ToString(prop.GetValue(target, null)) ?? fallback;
            }
            catch { return fallback; }
        }

        private static int ExtractInt(string requestJson, string key, int fallback)
        {
            var match = Regex.Match(requestJson, "\"" + Regex.Escape(key) + "\"\\s*:\\s*(?<value>\\d+)", RegexOptions.IgnoreCase);
            if (!match.Success) return fallback;
            int value;
            return int.TryParse(match.Groups["value"].Value, out value) ? value : fallback;
        }

        private static void EnsureReady(Reader reader)
        {
            var result = reader.GetStatus();
            Log("Reader.GetStatus result=" + result);
            if (result != Constants.ResultCode.DP_SUCCESS)
            {
                throw new Exception("Reader status failed: " + result);
            }

            Log("Reader status=" + reader.Status.Status);
            if (reader.Status.Status == Constants.ReaderStatuses.DP_STATUS_NEED_CALIBRATION)
            {
                Log("Calibrating reader");
                reader.Calibrate();
            }
            else if (reader.Status.Status == Constants.ReaderStatuses.DP_STATUS_BUSY)
            {
                Thread.Sleep(100);
            }
            else if (reader.Status.Status != Constants.ReaderStatuses.DP_STATUS_READY)
            {
                throw new Exception("Reader not ready: " + reader.Status.Status);
            }
        }

        private static int QualityScore(Constants.CaptureQuality quality)
        {
            if (quality == Constants.CaptureQuality.DP_QUALITY_GOOD) return 90;
            if (quality == Constants.CaptureQuality.DP_QUALITY_TIMED_OUT) return 0;
            if (quality == Constants.CaptureQuality.DP_QUALITY_CANCELED) return 0;
            if (quality == Constants.CaptureQuality.DP_QUALITY_NO_FINGER) return 20;
            return 65;
        }

        private static bool Handshake(NetworkStream stream)
        {
            var request = ReadHttpHeader(stream);
            if (request.Length == 0) return false;

            var key = "";
            var lines = request.Split(new[] { "\r\n" }, StringSplitOptions.None);
            foreach (var line in lines)
            {
                if (line.StartsWith("Sec-WebSocket-Key:", StringComparison.OrdinalIgnoreCase))
                {
                    key = line.Substring(line.IndexOf(':') + 1).Trim();
                    break;
                }
            }
            if (key.Length == 0) return false;

            var accept = Convert.ToBase64String(
                SHA1.Create().ComputeHash(Encoding.ASCII.GetBytes(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
            );
            var response =
                "HTTP/1.1 101 Switching Protocols\r\n" +
                "Upgrade: websocket\r\n" +
                "Connection: Upgrade\r\n" +
                "Sec-WebSocket-Accept: " + accept + "\r\n\r\n";
            var bytes = Encoding.ASCII.GetBytes(response);
            stream.Write(bytes, 0, bytes.Length);
            return true;
        }

        private static string ReadHttpHeader(NetworkStream stream)
        {
            var data = new List<byte>();
            var buffer = new byte[1];
            while (stream.Read(buffer, 0, 1) == 1)
            {
                data.Add(buffer[0]);
                var count = data.Count;
                if (count >= 4 &&
                    data[count - 4] == '\r' &&
                    data[count - 3] == '\n' &&
                    data[count - 2] == '\r' &&
                    data[count - 1] == '\n') break;
            }
            return Encoding.ASCII.GetString(data.ToArray());
        }

        private static string ReadTextFrame(NetworkStream stream)
        {
            var header = new byte[2];
            if (!ReadExact(stream, header, 0, 2)) return null;

            var opcode = header[0] & 0x0F;
            if (opcode == 0x8) return null;

            var masked = (header[1] & 0x80) != 0;
            ulong length = (ulong)(header[1] & 0x7F);
            if (length == 126)
            {
                var ext = new byte[2];
                if (!ReadExact(stream, ext, 0, 2)) return null;
                length = (ulong)((ext[0] << 8) | ext[1]);
            }
            else if (length == 127)
            {
                var ext = new byte[8];
                if (!ReadExact(stream, ext, 0, 8)) return null;
                if (BitConverter.IsLittleEndian) Array.Reverse(ext);
                length = BitConverter.ToUInt64(ext, 0);
            }

            var mask = new byte[4];
            if (masked && !ReadExact(stream, mask, 0, 4)) return null;

            var payload = new byte[length];
            if (!ReadExact(stream, payload, 0, payload.Length)) return null;
            if (masked)
            {
                for (ulong i = 0; i < length; i++) payload[i] = (byte)(payload[i] ^ mask[i % 4]);
            }
            return Encoding.UTF8.GetString(payload);
        }

        private static bool ReadExact(Stream stream, byte[] buffer, int offset, int count)
        {
            while (count > 0)
            {
                var read = stream.Read(buffer, offset, count);
                if (read <= 0) return false;
                offset += read;
                count -= read;
            }
            return true;
        }

        private static void SendText(NetworkStream stream, string text)
        {
            var payload = Encoding.UTF8.GetBytes(text);
            var frame = new List<byte>();
            frame.Add(0x81);
            if (payload.Length < 126)
            {
                frame.Add((byte)payload.Length);
            }
            else if (payload.Length <= ushort.MaxValue)
            {
                frame.Add(126);
                frame.Add((byte)((payload.Length >> 8) & 0xFF));
                frame.Add((byte)(payload.Length & 0xFF));
            }
            else
            {
                frame.Add(127);
                var len = BitConverter.GetBytes((ulong)payload.Length);
                if (BitConverter.IsLittleEndian) Array.Reverse(len);
                frame.AddRange(len);
            }
            frame.AddRange(payload);
            var bytes = frame.ToArray();
            stream.Write(bytes, 0, bytes.Length);
        }

        private static string ErrorJson(string message)
        {
            return "{\"status\":\"Error\",\"error\":\"" + Json(message) + "\"}";
        }

        private static string Json(string value)
        {
            return (value ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "\\r").Replace("\n", "\\n");
        }

        private static string QuoteList(List<string> values)
        {
            var quoted = new List<string>();
            foreach (var value in values)
            {
                quoted.Add("\"" + Json(value) + "\"");
            }
            return string.Join(",", quoted.ToArray());
        }

        private static class NativeSecuGen
        {
            public const int SG_DEV_AUTO = 255;
            public const int USB_AUTO_DETECT = 255;
            public const int SECURITY_NORMAL = 3;

            [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
            public struct SGDeviceInfoParam
            {
                public int DeviceID;
                [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 16)]
                public string DeviceSN;
                public int ComPort;
                public int ComSpeed;
                public int ImageWidth;
                public int ImageHeight;
                public int Contrast;
                public int Brightness;
                public int Gain;
                public int ImageDPI;
                public int FWVersion;
            }

            [DllImport("sgfplib.dll")]
            public static extern int CreateSGFPMObject(out IntPtr phFPM);

            [DllImport("sgfplib.dll")]
            public static extern int DestroySGFPMObject(IntPtr hFPM);

            [DllImport("sgfplib.dll")]
            public static extern int SGFPM_Init(IntPtr hFPM, int deviceName);

            [DllImport("sgfplib.dll")]
            public static extern int SGFPM_OpenDevice(IntPtr hFPM, int deviceId);

            [DllImport("sgfplib.dll")]
            public static extern int SGFPM_CloseDevice(IntPtr hFPM);

            [DllImport("sgfplib.dll")]
            public static extern int SGFPM_GetDeviceInfo(IntPtr hFPM, ref SGDeviceInfoParam deviceInfo);

            [DllImport("sgfplib.dll")]
            public static extern int SGFPM_GetImage(IntPtr hFPM, byte[] imageBuffer);

            [DllImport("sgfplib.dll")]
            public static extern int SGFPM_GetImageEx(IntPtr hFPM, byte[] imageBuffer, int timeout, int quality);

            [DllImport("sgfplib.dll")]
            public static extern int SGFPM_GetImageQuality(IntPtr hFPM, int width, int height, byte[] imageBuffer, ref int quality);

            [DllImport("sgfplib.dll")]
            public static extern int SGFPM_GetMaxTemplateSize(IntPtr hFPM, ref int size);

            [DllImport("sgfplib.dll")]
            public static extern int SGFPM_CreateTemplate(IntPtr hFPM, IntPtr fingerInfo, byte[] imageBuffer, byte[] minTemplate);

            [DllImport("sgfplib.dll")]
            public static extern int SGFPM_MatchTemplate(IntPtr hFPM, byte[] template1, byte[] template2, int securityLevel, [MarshalAs(UnmanagedType.Bool)] ref bool matched);
        }

        private static string Unjson(string value)
        {
            return (value ?? "")
                .Replace("\\\"", "\"")
                .Replace("\\\\", "\\")
                .Replace("\\r", "\r")
                .Replace("\\n", "\n");
        }
    }
}
