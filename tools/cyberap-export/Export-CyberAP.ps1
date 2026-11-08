<#
.SYNOPSIS
  Exports a legacy CyberAP (SQL Server) attendance/payroll database into one migration package
  (*.cyberap.gz) that the HR & Payroll vendor console, or scripts/cyberap-import.cjs, imports.

.DESCRIPTION
  Read-only: the script only runs SELECT statements against CyberAP and never changes it.
  Needs nothing installed besides Windows PowerShell 5.1 (it compiles a small C# helper with the
  .NET Framework that ships with Windows). Signs in with your Windows account unless -SqlUser is given.

  The package is gzip-compressed JSON lines:
    header   format, version, source server/database, column lists
    row      every row of every small table (passwords and connection strings removed)
    employee every employee, with the fingerprint template and photos resized to a thumbnail and an archive copy
    day      one line per employee per date: p processed day, o overtime, a every in/out punch, k branch tracking,
             r time-out reason totals (merged from the big tables, ordered by employee and date; columns in header.dayColumns)
    end      row counts, checked by the importer

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\Export-CyberAP.ps1
  powershell -ExecutionPolicy Bypass -File .\Export-CyberAP.ps1 -Server "192.168.86.83" -SqlUser sa -SqlPassword "..." -OutFile D:\cyberap.cyberap.gz
  powershell -ExecutionPolicy Bypass -File .\Export-CyberAP.ps1 -FromDate 2026-11-01   # gap export: masters + employees + days from that date
#>
param(
  [string]$Server = '.\SQLEXPRESS',
  [string]$Database = 'CyberAP',
  [string]$OutFile = '',
  [string]$SqlUser = '',
  [string]$SqlPassword = '',
  [string]$FromDate = '',
  [switch]$NoPhotos,
  [int]$ThumbSize = 160,
  [int]$PhotoSize = 480
)

$ErrorActionPreference = 'Stop'
# The HR & Payroll server passes the SQL password this way, so it never appears on a command line.
if ($SqlUser -and -not $SqlPassword -and $env:CYBERAP_SQL_PASSWORD) { $SqlPassword = $env:CYBERAP_SQL_PASSWORD }

if (-not $OutFile) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmm'
  $OutFile = Join-Path (Get-Location) ("$Database-$stamp.cyberap.gz")
}
$OutFile = [System.IO.Path]::GetFullPath($OutFile)

$from = ''
if ($FromDate) {
  $parsed = [datetime]::MinValue
  if (-not [datetime]::TryParseExact($FromDate, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture, 'None', [ref]$parsed)) {
    throw "-FromDate must be YYYY-MM-DD (got '$FromDate')."
  }
  $from = $parsed.ToString('yyyy-MM-dd')
}

$builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
$builder['Data Source'] = $Server
$builder['Initial Catalog'] = $Database
$builder['Application Name'] = 'CyberAP-Export'
$builder['Connect Timeout'] = 30
if ($SqlUser) { $builder['User ID'] = $SqlUser; $builder['Password'] = $SqlPassword } else { $builder['Integrated Security'] = $true }

$source = @'
using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Text;

public static class CyberApExporter
{
    static readonly CultureInfo Inv = CultureInfo.InvariantCulture;
    static readonly Dictionary<string, long> Counts = new Dictionary<string, long>();

    // Big tables are merged into "day" lines; the employee table is written with its images; the rest is dumped as rows.
    static readonly string[] MergedTables = { "attendance", "processed_attendance", "employee_over_time", "employee_tracking", "employee_time_out_reason", "employee", "sysdiagrams" };

    class DaySource
    {
        public string Key; public string[] Columns; public SqlConnection Conn; public SqlDataReader Reader;
        public bool Has; public int Emp; public DateTime Day;
        public void Next() { Has = Reader.Read(); if (Has) { Emp = Convert.ToInt32(Reader.GetValue(0)); Day = Reader.GetDateTime(1).Date; } }
    }

    static void Count(string key, long n) { long v; Counts.TryGetValue(key, out v); Counts[key] = v + n; }

    static void Str(StringBuilder sb, string s)
    {
        if (s == null) { sb.Append("null"); return; }
        sb.Append('"');
        foreach (char c in s)
        {
            switch (c)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (c < 0x20 || c == '\u2028' || c == '\u2029') sb.AppendFormat(Inv, "\\u{0:x4}", (int)c); else sb.Append(c);
                    break;
            }
        }
        sb.Append('"');
    }

    static void Val(StringBuilder sb, object v, string sqlType)
    {
        if (v == null || v is DBNull) { sb.Append("null"); return; }
        if (v is string) { Str(sb, (string)v); return; }
        if (v is bool) { sb.Append((bool)v ? "true" : "false"); return; }
        if (v is DateTime)
        {
            DateTime d = (DateTime)v;
            if (d.Year <= 1900) { sb.Append("null"); return; }
            if (sqlType == "date") Str(sb, d.ToString("yyyy-MM-dd", Inv)); else Str(sb, d.ToString("yyyy-MM-ddTHH:mm:ss", Inv));
            return;
        }
        if (v is double || v is float)
        {
            double x = Convert.ToDouble(v, Inv);
            if (double.IsNaN(x) || double.IsInfinity(x)) sb.Append("null"); else sb.Append(x.ToString("R", Inv));
            return;
        }
        if (v is byte[]) { Str(sb, Convert.ToBase64String((byte[])v)); return; }
        if (v is Guid) { Str(sb, v.ToString()); return; }
        if (v is IFormattable) { sb.Append(((IFormattable)v).ToString(null, Inv)); return; }
        Str(sb, v.ToString());
    }

    static SqlConnection Open(string cs) { var c = new SqlConnection(cs); c.Open(); return c; }

    static SqlDataReader Query(SqlConnection conn, string sql)
    {
        var cmd = new SqlCommand(sql, conn);
        cmd.CommandTimeout = 0;
        return cmd.ExecuteReader(CommandBehavior.SequentialAccess);
    }

    static ImageCodecInfo JpegCodec()
    {
        foreach (var codec in ImageCodecInfo.GetImageEncoders()) if (codec.MimeType == "image/jpeg") return codec;
        return null;
    }

    static string Jpeg(byte[] data, int max, long quality)
    {
        if (data == null || data.Length < 16 || max <= 0) return null;
        try
        {
            using (var input = new MemoryStream(data))
            using (var img = Image.FromStream(input, false, false))
            {
                double scale = Math.Min(1.0, (double)max / Math.Max(img.Width, img.Height));
                int w = Math.Max(1, (int)Math.Round(img.Width * scale));
                int h = Math.Max(1, (int)Math.Round(img.Height * scale));
                using (var bmp = new Bitmap(w, h))
                {
                    using (var g = Graphics.FromImage(bmp))
                    {
                        g.Clear(Color.White);
                        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                        g.SmoothingMode = SmoothingMode.HighQuality;
                        g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                        g.DrawImage(img, 0, 0, w, h);
                    }
                    var parameters = new EncoderParameters(1);
                    parameters.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, quality);
                    using (var output = new MemoryStream())
                    {
                        bmp.Save(output, JpegCodec(), parameters);
                        return "data:image/jpeg;base64," + Convert.ToBase64String(output.ToArray());
                    }
                }
            }
        }
        catch (Exception) { return null; }
    }

    static string[] Names(string csv) { var parts = csv.Split(','); for (int i = 0; i < parts.Length; i++) parts[i] = parts[i].Trim(); return parts; }

    public static void Run(string cs, string outFile, string fromDate, bool photos, int thumbSize, int photoSize, string server, string database)
    {
        var started = DateTime.Now;
        string dateFilter = string.IsNullOrEmpty(fromDate) ? "" : " WHERE {0} >= '" + fromDate + "'";

        // Day streams: column 0 = employee_id, column 1 = the date; the rest are written as arrays in this order.
        var specs = new List<string[]>();
        specs.Add(new string[] { "p", "processed_attendance", "processed_attendance_date", "processed_attendance_id",
            "remarks1,remarks2,remarks3,remarks4,in_date_time,out_date_time,in_duration,out_duration,total_in_duration,total_out_duration,day_status,shift_duration,allowed_out_duration,adjusted_in_date_time,adjusted_out_date_time,is_closed" });
        specs.Add(new string[] { "o", "employee_over_time", "over_time_date", "over_time_id",
            "early_in_over_time,late_out_over_time,total_over_time,approved_early_in_over_time,approved_late_out_over_time,approved_extra_day,approval_remarks" });
        specs.Add(new string[] { "a", "attendance", "attendance_date", "attendance_time, attendance_id",
            "attendance_time,attendance_type,attendance_reason,attendance_seqno,duration,reason_remarks,allowed_duration,branch_name,shift_name" });
        specs.Add(new string[] { "k", "employee_tracking", "tracking_date", "tracking_id",
            "branch_id,in_date_time,out_date_time,in_duration,out_duration" });
        specs.Add(new string[] { "r", "employee_time_out_reason", "time_out_reason_date", "employee_time_out_reason_id",
            "time_out_reason_id,time_out_reason_duration" });

        using (var file = new FileStream(outFile, FileMode.Create, FileAccess.Write, FileShare.None, 1 << 20))
        using (var gzip = new GZipStream(file, CompressionLevel.Optimal))
        using (var writer = new StreamWriter(gzip, new UTF8Encoding(false), 1 << 20))
        {
            writer.NewLine = "\n";
            var sb = new StringBuilder(1 << 16);

            // ── header ──
            sb.Append("{\"t\":\"header\",\"format\":\"cyberap-export\",\"version\":1,\"exportedAt\":");
            Str(sb, DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ssK", Inv));
            sb.Append(",\"server\":"); Str(sb, server);
            sb.Append(",\"database\":"); Str(sb, database);
            sb.Append(",\"fromDate\":"); Str(sb, string.IsNullOrEmpty(fromDate) ? null : fromDate);
            sb.Append(",\"photos\":").Append(photos ? "true" : "false");
            sb.Append(",\"dayColumns\":{");
            for (int i = 0; i < specs.Count; i++)
            {
                if (i > 0) sb.Append(',');
                Str(sb, specs[i][0]); sb.Append(":[");
                var names = Names(specs[i][4]);
                for (int j = 0; j < names.Length; j++) { if (j > 0) sb.Append(','); Str(sb, names[j]); }
                sb.Append(']');
            }
            sb.Append("}}");
            writer.WriteLine(sb.ToString());

            // ── small tables ──
            using (var conn = Open(cs))
            {
                var tables = new List<string>();
                using (var r = Query(conn, "SELECT name FROM sys.tables WHERE is_ms_shipped = 0 ORDER BY name"))
                    while (r.Read()) tables.Add(r.GetString(0));
                foreach (var table in tables)
                {
                    if (Array.IndexOf(MergedTables, table) >= 0) continue;
                    long n = 0;
                    using (var r = Query(conn, "SELECT * FROM [dbo].[" + table.Replace("]", "]]") + "]"))
                    {
                        while (r.Read())
                        {
                            sb.Clear();
                            var values = new object[r.FieldCount];
                            r.GetValues(values);
                            if (table == "configuration")
                            {
                                string pname = Convert.ToString(values[r.GetOrdinal("parameter_name")]).ToLowerInvariant();
                                if (pname.Contains("connection") || pname.Contains("session") || pname.Contains("password")) continue;
                            }
                            sb.Append("{\"t\":\"row\",\"table\":"); Str(sb, table); sb.Append(",\"r\":{");
                            bool first = true;
                            for (int i = 0; i < r.FieldCount; i++)
                            {
                                string col = r.GetName(i);
                                string lower = col.ToLowerInvariant();
                                if (lower.Contains("password") || lower.Contains("connection_string")) continue;
                                if (!first) sb.Append(','); first = false;
                                Str(sb, col); sb.Append(':'); Val(sb, values[i], r.GetDataTypeName(i));
                            }
                            sb.Append("}}");
                            writer.WriteLine(sb.ToString());
                            n++;
                        }
                    }
                    Count("row:" + table, n);
                }
                Console.WriteLine("  small tables: " + tables.Count + " read");

                // ── employees ──
                long employees = 0, withPhoto = 0, badPhoto = 0;
                using (var r = Query(conn, "SELECT * FROM employee ORDER BY employee_id"))
                {
                    while (r.Read())
                    {
                        sb.Clear();
                        var values = new object[r.FieldCount];
                        r.GetValues(values);
                        sb.Append("{\"t\":\"employee\",\"r\":{");
                        bool first = true;
                        byte[] image = null, finger = null;
                        for (int i = 0; i < r.FieldCount; i++)
                        {
                            string col = r.GetName(i);
                            if (col == "employee_image") { image = values[i] as byte[]; continue; }
                            if (col == "employee_finger_print") { finger = values[i] as byte[]; continue; }
                            if (!first) sb.Append(','); first = false;
                            Str(sb, col); sb.Append(':'); Val(sb, values[i], r.GetDataTypeName(i));
                        }
                        sb.Append('}');
                        if (finger != null && finger.Length > 0) { sb.Append(",\"fp\":"); Str(sb, Convert.ToBase64String(finger)); }
                        if (photos && image != null && image.Length > 0)
                        {
                            string thumb = Jpeg(image, thumbSize, 72L);
                            string photo = Jpeg(image, photoSize, 78L);
                            if (thumb == null) badPhoto++; else withPhoto++;
                            if (thumb != null) { sb.Append(",\"thumb\":"); Str(sb, thumb); }
                            if (photo != null) { sb.Append(",\"photo\":"); Str(sb, photo); }
                        }
                        sb.Append('}');
                        writer.WriteLine(sb.ToString());
                        employees++;
                        if (employees % 500 == 0) Console.WriteLine("  employees: " + employees);
                    }
                }
                Count("employee", employees);
                Count("employeePhoto", withPhoto);
                Count("employeePhotoUnreadable", badPhoto);
                Console.WriteLine("  employees: " + employees + " (photos " + withPhoto + ", unreadable " + badPhoto + ")");
            }

            // ── attendance days: k-way merge of the big tables, ordered by employee and date ──
            var sources = new List<DaySource>();
            try
            {
                foreach (var spec in specs)
                {
                    var src = new DaySource();
                    src.Key = spec[0];
                    src.Columns = Names(spec[4]);
                    string where = string.IsNullOrEmpty(dateFilter) ? "" : string.Format(dateFilter, spec[2]);
                    string sql = "SELECT employee_id, " + spec[2] + ", " + spec[4] + " FROM " + spec[1] + where +
                                 " ORDER BY employee_id, " + spec[2] + ", " + spec[3] + " OPTION (MAXDOP 2)";
                    src.Conn = Open(cs);
                    Console.WriteLine("  opening " + spec[1] + " ...");
                    src.Reader = Query(src.Conn, sql);
                    src.Next();
                    sources.Add(src);
                }

                long days = 0;
                var perSource = new long[sources.Count];
                while (true)
                {
                    int emp = int.MaxValue; DateTime day = DateTime.MaxValue; bool any = false;
                    foreach (var s in sources)
                    {
                        if (!s.Has) continue;
                        if (!any || s.Emp < emp || (s.Emp == emp && s.Day < day)) { emp = s.Emp; day = s.Day; any = true; }
                    }
                    if (!any) break;
                    sb.Clear();
                    sb.Append("{\"t\":\"day\",\"e\":").Append(emp.ToString(Inv)).Append(",\"d\":\"").Append(day.ToString("yyyy-MM-dd", Inv)).Append('"');
                    for (int k = 0; k < sources.Count; k++)
                    {
                        var s = sources[k];
                        if (!s.Has || s.Emp != emp || s.Day != day) continue;
                        sb.Append(",\""); sb.Append(s.Key); sb.Append("\":[");
                        bool firstRow = true;
                        while (s.Has && s.Emp == emp && s.Day == day)
                        {
                            if (!firstRow) sb.Append(','); firstRow = false;
                            sb.Append('[');
                            for (int i = 2; i < s.Reader.FieldCount; i++)
                            {
                                if (i > 2) sb.Append(',');
                                Val(sb, s.Reader.GetValue(i), s.Reader.GetDataTypeName(i));
                            }
                            sb.Append(']');
                            perSource[k]++;
                            s.Next();
                        }
                        sb.Append(']');
                    }
                    sb.Append('}');
                    writer.WriteLine(sb.ToString());
                    days++;
                    if (days % 100000 == 0) Console.WriteLine("  attendance days: " + days.ToString("N0", Inv) + "  (" + (DateTime.Now - started).ToString(@"hh\:mm\:ss") + ")");
                }
                Count("day", days);
                for (int k = 0; k < sources.Count; k++) Count("day:" + sources[k].Key, perSource[k]);
                Console.WriteLine("  attendance days: " + days.ToString("N0", Inv));
            }
            finally
            {
                foreach (var s in sources)
                {
                    try { if (s.Reader != null) s.Reader.Close(); } catch (Exception) { }
                    try { if (s.Conn != null) s.Conn.Close(); } catch (Exception) { }
                }
            }

            // ── footer ──
            sb.Clear();
            sb.Append("{\"t\":\"end\",\"finishedAt\":");
            Str(sb, DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ssK", Inv));
            sb.Append(",\"counts\":{");
            bool firstCount = true;
            foreach (var pair in Counts)
            {
                if (!firstCount) sb.Append(','); firstCount = false;
                Str(sb, pair.Key); sb.Append(':').Append(pair.Value.ToString(Inv));
            }
            sb.Append("}}");
            writer.WriteLine(sb.ToString());
        }
        Console.WriteLine("Finished in " + (DateTime.Now - started).ToString(@"hh\:mm\:ss"));
    }
}
'@

if (-not ('CyberApExporter' -as [type])) {
  Add-Type -TypeDefinition $source -ReferencedAssemblies System.Data, System.Drawing, System.Xml, System.Transactions
}

Write-Host "CyberAP export"
Write-Host "  source : $Server / $Database"
Write-Host "  output : $OutFile"
if ($from) { Write-Host "  from   : $from (attendance days only; masters and employees are always included)" }
if ($NoPhotos) { Write-Host "  photos : skipped" }

# Fail fast with a clear message when the database cannot be reached.
$probe = New-Object System.Data.SqlClient.SqlConnection $builder.ConnectionString
try { $probe.Open() } catch { throw "Cannot connect to $Server / $Database : $($_.Exception.Message)" } finally { $probe.Dispose() }

[CyberApExporter]::Run($builder.ConnectionString, $OutFile, $from, -not $NoPhotos, $ThumbSize, $PhotoSize, $Server, $Database)

$size = (Get-Item $OutFile).Length
Write-Host ("Package written: {0} ({1:N1} MB)" -f $OutFile, ($size / 1MB))
Write-Host "Next: upload it on the Data import page of HR & Payroll (or run scripts/cyberap-import.cjs)."
