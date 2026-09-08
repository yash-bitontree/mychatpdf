import { Resend } from "resend";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";
const DEFAULT_CONTACT_FROM_EMAIL = "MyPDFChat <onboarding@resend.dev>";
const DEFAULT_CONTACT_TO_EMAIL = "admin@mypdfchat.com";

interface TurnstileVerifyResponse {
  success: boolean;
  "error-codes"?: string[];
}

interface ContactSubmission {
  email: string;
  message: string;
  name: string;
  receivedAt: string;
}

export async function POST(request: Request) {
  let data: Record<string, unknown>;
  try {
    data = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = typeof data.name === "string" ? data.name.trim() : "";
  const email = typeof data.email === "string" ? data.email.trim() : "";
  const message = typeof data.message === "string" ? data.message.trim() : "";
  const turnstileToken = typeof data["cf-turnstile-response"] === "string" ? data["cf-turnstile-response"] : "";

  if (!name || !email || !message) {
    return Response.json({ error: "Name, email, and message are required." }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  const turnstileResult = await verifyTurnstileToken(turnstileToken, getClientIp(request));
  if (!turnstileResult.ok) {
    return Response.json({ error: turnstileResult.error }, { status: turnstileResult.status });
  }

  const submission = { name, email, message, receivedAt: new Date().toISOString() };

  try {
    await sendContactEmail(submission);
  } catch {
    return Response.json({ error: "Could not deliver your message. Please try again later." }, { status: 502 });
  }

  const webhookUrl = process.env.CONTACT_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submission),
      });
      if (!res.ok) {
        throw new Error(`webhook responded ${res.status}`);
      }
    } catch {
      return Response.json({ error: "Could not deliver your message. Please try again later." }, { status: 502 });
    }
  }

  return Response.json({ ok: true });
}

async function sendContactEmail(submission: ContactSubmission) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const resend = new Resend(apiKey);
  const subjectName = submission.name.slice(0, 80);
  const { error } = await resend.emails.send({
    from: process.env.CONTACT_FROM_EMAIL ?? DEFAULT_CONTACT_FROM_EMAIL,
    html: buildContactEmailHtml(submission, subjectName),
    replyTo: submission.email,
    subject: `New contact form message from ${subjectName}`,
    text: [
      `Name: ${submission.name}`,
      `Email: ${submission.email}`,
      `Received: ${submission.receivedAt}`,
      "",
      submission.message,
    ].join("\n"),
    to: [process.env.CONTACT_TO_EMAIL ?? DEFAULT_CONTACT_TO_EMAIL],
  });

  if (error) {
    throw new Error(error.message);
  }
}

function buildContactEmailHtml(submission: ContactSubmission, subjectName: string) {
  const name = escapeHtml(submission.name);
  const email = escapeHtml(submission.email);
  const receivedAt = escapeHtml(formatEmailDate(submission.receivedAt));
  const message = escapeHtml(submission.message).replace(/\r?\n/g, "<br />");
  const replyHref = escapeHtml(
    `mailto:${encodeURIComponent(submission.email)}?subject=${encodeURIComponent(
      `Re: New contact form message from ${subjectName}`
    )}`
  );

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body style="margin:0; padding:0; background:#f4f7fb; color:#0f172a; font-family:Arial, Helvetica, sans-serif;">
        <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">
          New contact form message from ${name}. Reply to this email to respond.
        </div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb; margin:0; padding:28px 12px; width:100%;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px; background:#ffffff; border:1px solid #dbe5f3; border-radius:16px; overflow:hidden; box-shadow:0 16px 36px rgba(15, 23, 42, 0.08);">
                <tr>
                  <td style="background:linear-gradient(135deg, #2563ff 0%, #7447ff 100%); padding:24px 28px;">
                    <div style="font-size:13px; font-weight:700; letter-spacing:1.4px; text-transform:uppercase; color:#dbeafe;">
                      MyPDFChat Contact
                    </div>
                    <h1 style="margin:8px 0 0; color:#ffffff; font-size:24px; line-height:1.25; font-weight:800;">
                      New contact form message
                    </h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px;">
                    <p style="margin:0 0 22px; color:#475569; font-size:15px; line-height:1.6;">
                      A visitor submitted the Contact Us form. Reply directly to this email to respond to ${name}.
                    </p>

                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate; border-spacing:0 10px; margin:0 0 24px;">
                      <tr>
                        <td style="width:120px; color:#64748b; font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.6px; vertical-align:top;">
                          Name
                        </td>
                        <td style="color:#0f172a; font-size:15px; font-weight:700; vertical-align:top;">
                          ${name}
                        </td>
                      </tr>
                      <tr>
                        <td style="width:120px; color:#64748b; font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.6px; vertical-align:top;">
                          Email
                        </td>
                        <td style="color:#0f172a; font-size:15px; vertical-align:top;">
                          <a href="mailto:${email}" style="color:#2563ff; text-decoration:none; font-weight:700;">${email}</a>
                        </td>
                      </tr>
                      <tr>
                        <td style="width:120px; color:#64748b; font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.6px; vertical-align:top;">
                          Received
                        </td>
                        <td style="color:#0f172a; font-size:15px; vertical-align:top;">
                          ${receivedAt}
                        </td>
                      </tr>
                    </table>

                    <div style="background:#f8fbff; border:1px solid #dbeafe; border-radius:12px; padding:18px 20px;">
                      <div style="margin:0 0 10px; color:#64748b; font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:0.7px;">
                        Message
                      </div>
                      <div style="color:#0f172a; font-size:16px; line-height:1.65; word-break:break-word;">
                        ${message}
                      </div>
                    </div>

                    <div style="margin-top:26px;">
                      <a href="${replyHref}" style="display:inline-block; background:#2563ff; border-radius:999px; color:#ffffff; font-size:15px; font-weight:800; padding:12px 18px; text-decoration:none;">
                        Reply to ${name}
                      </a>
                    </div>

                    <p style="margin:24px 0 0; color:#64748b; font-size:13px; line-height:1.6;">
                      This notification was sent by the MyPDFChat website contact form.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

function formatEmailDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date)} UTC`;
}
async function verifyTurnstileToken(token: string, remoteIp: string | null) {
  const secret =
    process.env.TURNSTILE_SECRET_KEY ??
    (process.env.NODE_ENV === "production" ? undefined : TURNSTILE_TEST_SECRET_KEY);
  if (!secret) {
    return { ok: false, status: 500, error: "Contact form protection is not configured." };
  }

  if (!token) {
    return { ok: false, status: 400, error: "Please complete the security check." };
  }

  const formData = new FormData();
  formData.append("secret", secret);
  formData.append("response", token);
  if (remoteIp) {
    formData.append("remoteip", remoteIp);
  }

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      return { ok: false, status: 502, error: "Could not verify the security check. Please try again." };
    }

    const result = (await response.json()) as TurnstileVerifyResponse;
    if (!result.success) {
      return { ok: false, status: 400, error: "Security check failed. Please try again." };
    }

    return { ok: true };
  } catch {
    return { ok: false, status: 502, error: "Could not verify the security check. Please try again." };
  }
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return request.headers.get("cf-connecting-ip") ?? forwardedFor ?? null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
