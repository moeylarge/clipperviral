type SendCvEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

type ResendSendResponse = {
  id?: string;
  error?: {
    message?: string;
    name?: string;
  };
};

export async function sendCvEmail({ to, subject, html, text }: SendCvEmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  if (!from) {
    throw new Error("RESEND_FROM_EMAIL is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      text,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as ResendSendResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message || `Resend email failed with status ${response.status}.`);
  }

  return payload.id || null;
}
