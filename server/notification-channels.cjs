// SMS / WhatsApp payslip alerts. Every provider is opt-in through environment variables; nothing is
// sent unless credentials are configured. Messages never contain salary, CNIC or bank details.

const env = name => process.env[name]?.trim() || '';

/** Pakistani mobile numbers only, normalised to E.164 (+923XXXXXXXXX). */
function normalizePakistanMobile(value) {
  const digits = String(value || '').replace(/[^\d+]/g, '');
  const local = digits.startsWith('+92') ? digits.slice(3) : digits.startsWith('0092') ? digits.slice(4) : digits.startsWith('92') ? digits.slice(2) : digits.startsWith('0') ? digits.slice(1) : digits;
  return /^3\d{9}$/.test(local) ? `+92${local}` : null;
}

function configuredChannels() {
  const sms = env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && env('TWILIO_SMS_FROM') ? 'twilio'
    : env('SMS_HTTP_URL') ? 'http' : null;
  const whatsapp = env('WHATSAPP_CLOUD_TOKEN') && env('WHATSAPP_PHONE_NUMBER_ID') && env('WHATSAPP_TEMPLATE_NAME') ? 'whatsapp-cloud'
    : env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && env('TWILIO_WHATSAPP_FROM') ? 'twilio' : null;
  return { sms, whatsapp };
}

function payslipAlertText(run, employee) {
  const period = `${String(run.periodMonth).padStart(2, '0')}/${run.periodYear}`;
  const firstName = String(employee.fullName || '').split(/\s+/)[0] || 'Employee';
  return {
    text: `Dear ${firstName}, your salary for ${period} has been processed. View your payslip in the HR portal. / آپ کی ${period} کی تنخواہ جاری ہو گئی ہے۔ پے سلپ HR پورٹل میں دیکھیں۔`,
    params: [firstName, period],
  };
}

async function postJson(url, body, headers) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(data?.error?.message || data?.message || `Provider returned HTTP ${response.status}`).slice(0, 300));
  return data;
}

async function sendTwilio(to, text, from) {
  const base = env('TWILIO_API_BASE') || 'https://api.twilio.com';
  const sid = env('TWILIO_ACCOUNT_SID');
  const response = await fetch(`${base}/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${env('TWILIO_AUTH_TOKEN')}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: from, Body: text }).toString(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(data?.message || `Twilio returned HTTP ${response.status}`).slice(0, 300));
  return data.sid || null;
}

/** Sends one alert and returns the provider message id. Throws with a provider error message on failure. */
async function sendAlert(channel, to, message) {
  const providers = configuredChannels();
  if (channel === 'sms') {
    if (providers.sms === 'twilio') return sendTwilio(to, message.text, env('TWILIO_SMS_FROM'));
    if (providers.sms === 'http') {
      // Generic gateway for local aggregators: POST {to, from, text} with an optional bearer token.
      const data = await postJson(env('SMS_HTTP_URL'), { to, from: env('SMS_HTTP_SENDER') || undefined, text: message.text }, env('SMS_HTTP_TOKEN') ? { Authorization: `Bearer ${env('SMS_HTTP_TOKEN')}` } : {});
      return data.id || data.messageId || null;
    }
  }
  if (channel === 'whatsapp') {
    if (providers.whatsapp === 'whatsapp-cloud') {
      // Business-initiated WhatsApp messages must use a pre-approved template; params fill {{1}} name and {{2}} period.
      const base = env('WHATSAPP_API_BASE') || 'https://graph.facebook.com/v20.0';
      const data = await postJson(`${base}/${encodeURIComponent(env('WHATSAPP_PHONE_NUMBER_ID'))}/messages`, {
        messaging_product: 'whatsapp', to: to.replace('+', ''), type: 'template',
        template: { name: env('WHATSAPP_TEMPLATE_NAME'), language: { code: env('WHATSAPP_TEMPLATE_LANGUAGE') || 'en' }, components: [{ type: 'body', parameters: message.params.map(text => ({ type: 'text', text })) }] },
      }, { Authorization: `Bearer ${env('WHATSAPP_CLOUD_TOKEN')}` });
      return data.messages?.[0]?.id || null;
    }
    if (providers.whatsapp === 'twilio') return sendTwilio(`whatsapp:${to}`, message.text, `whatsapp:${env('TWILIO_WHATSAPP_FROM')}`);
  }
  throw new Error(`${channel === 'sms' ? 'SMS' : 'WhatsApp'} is not configured on the server.`);
}

module.exports = { configuredChannels, normalizePakistanMobile, payslipAlertText, sendAlert };
