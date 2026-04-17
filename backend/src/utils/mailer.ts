// ===== Brevo (Sendinblue) Transactional Email Utility =====

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

/**
 * Send an email via Brevo's transactional email API.
 * Requires BREVO_API_KEY and BREVO_SENDER_EMAIL in .env
 */
export async function sendBrevoEmail(options: {
  to: { email: string; name?: string }[];
  subject: string;
  htmlContent: string;
}) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'noreply@theledger.edu';
  const senderName = process.env.BREVO_SENDER_NAME || 'The Ledger';

  if (!apiKey) {
    console.warn('[Mailer] BREVO_API_KEY not set — skipping email send.');
    return null;
  }

  const payload = {
    sender: { name: senderName, email: senderEmail },
    to: options.to,
    subject: options.subject,
    htmlContent: options.htmlContent,
  };

  try {
    const res = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('[Mailer] Brevo API error:', data);
      return null;
    }
    console.log('[Mailer] Email sent successfully. MessageId:', data.messageId);
    return data;
  } catch (err) {
    console.error('[Mailer] Failed to send email:', err);
    return null;
  }
}

/**
 * Send login credentials to a newly created HOD or Admin user.
 */
export async function sendCredentialsEmail(options: {
  recipientEmail: string;
  recipientName: string;
  role: 'HOD' | 'ADMIN';
  password: string;
  departmentName?: string;
}) {
  const { recipientEmail, recipientName, role, password, departmentName } = options;
  const loginUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const roleBadge = role === 'HOD' ? 'Head of Department' : 'Event Admin';

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#0f1117;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f1117;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#1a1d2e 0%,#12141f 100%);border-radius:16px;border:1px solid rgba(99,102,241,0.2);overflow:hidden;">
          
          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid rgba(255,255,255,0.06);">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <h1 style="margin:0;font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">📋 The Ledger</h1>
                    <p style="margin:4px 0 0;font-size:13px;color:#6366f1;font-weight:500;letter-spacing:0.5px;">ACADEMIC EVENT MANAGEMENT</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <h2 style="margin:0 0 8px;font-size:20px;color:#e2e8f0;">Welcome aboard, ${recipientName}! 🎉</h2>
              <p style="margin:0 0 24px;font-size:14px;color:#94a3b8;line-height:1.6;">
                You've been registered as a <strong style="color:#818cf8;">${roleBadge}</strong>${departmentName ? ` for the <strong style="color:#818cf8;">${departmentName}</strong> department` : ''} on The Ledger platform.
              </p>
              
              <!-- Credentials Card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.15);border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td style="padding:24px;">
                    <p style="margin:0 0 16px;font-size:12px;font-weight:600;color:#6366f1;text-transform:uppercase;letter-spacing:1px;">Your Login Credentials</p>
                    
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:8px 0;">
                          <span style="font-size:12px;color:#64748b;">Email</span><br/>
                          <span style="font-size:15px;color:#f1f5f9;font-weight:500;">${recipientEmail}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;">
                          <span style="font-size:12px;color:#64748b;">Password</span><br/>
                          <code style="font-size:15px;color:#34d399;background:rgba(52,211,153,0.1);padding:4px 10px;border-radius:6px;font-family:'Courier New',monospace;letter-spacing:1px;">${password}</code>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;">
                          <span style="font-size:12px;color:#64748b;">Role</span><br/>
                          <span style="font-size:15px;color:#f1f5f9;font-weight:500;">${roleBadge}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 24px;">
                    <a href="${loginUrl}" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#6366f1,#818cf8);color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;letter-spacing:0.3px;">
                      Login to The Ledger →
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Security Note -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.15);border-radius:8px;">
                <tr>
                  <td style="padding:16px;">
                    <p style="margin:0;font-size:13px;color:#fbbf24;line-height:1.5;">
                      ⚠️ <strong>Security Reminder:</strong> Please change your password after your first login by visiting Settings → Change Password.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;font-size:12px;color:#475569;text-align:center;">
                This is an automated message from The Ledger. Do not reply to this email.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return sendBrevoEmail({
    to: [{ email: recipientEmail, name: recipientName }],
    subject: `🔐 Your ${roleBadge} Account – The Ledger`,
    htmlContent,
  });
}
