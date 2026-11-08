# HR & Payroll - unattended setup settings. Copy to setup.config.psd1, fill in, then (as Administrator):
#   powershell -ExecutionPolicy Bypass -File setup\Install-HRPayroll.ps1 -ConfigFile setup.config.psd1
# Delete the file afterwards: it may hold the administrator password.
@{
  # Company and first administrator
  CompanyName   = 'Bin Ishaq Traders'
  AdminName     = 'HR Administrator'
  AdminEmail    = 'admin@company.com'
  AdminPassword = ''            # empty = generated and shown once at the end (min. 12 characters)
  Edition       = 'full'        # 'full' (FBR, EOBI, PF, gratuity, bank payroll) or 'lite' (small business)
  EnableDataImport = $true      # Data Import screen for moving CyberAP data (switch off after go-live in the vendor console)

  # Folders (data on a separate disk is recommended, e.g. D:\HRPayrollData)
  InstallDir    = 'C:\HRPayroll'
  DataDir       = 'C:\HRPayrollData'

  # Address and ports
  PublicUrl     = ''            # e.g. 'https://hr.company.com'; empty = http://<server name>:<AppPort>
  AppPort       = 8080          # HTTP port (with HTTPS: redirects to HTTPS)
  DbPort        = 5433          # embedded database, localhost only (5433 avoids any other PostgreSQL)

  # HTTPS (optional). Either a PFX file, or PEM certificate + key (e.g. from win-acme)
  HttpsPfxPath  = ''
  HttpsPfxPassphrase = ''
  HttpsCertPath = ''            # e.g. 'C:\HRPayroll\certs\hr.company.com-chain.pem'
  HttpsKeyPath  = ''            # e.g. 'C:\HRPayroll\certs\hr.company.com-key.pem'
  HttpsPort     = 443

  # Nightly backup
  BackupTime    = '01:30'
  BackupCopyTo  = ''            # e.g. '\\NAS01\Backups\HRPayroll' (the server's computer account needs write access)

  # Outgoing mail (payslips, password resets)
  SmtpHost = ''; SmtpPort = '587'; SmtpUser = ''; SmtpPass = ''; SmtpFrom = ''
}
