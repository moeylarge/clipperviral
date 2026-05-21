import { NextResponse } from "next/server";

import { sendCvEmail } from "@/lib/cv/email";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type TrialEndingSubscriber = {
  id: string;
  auth_user_id: string;
  email: string;
  trial_ends_at: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildTrialEndingEmail() {
  const pricingUrl = "https://www.clipperviral.com/pricing";
  const text = `Hey there,

Your 7-day free trial of ClipperViral ends in 24 hours.

If you're enjoying it — lock in your subscription before the lights go out:

• Monthly — $19/mo
• Annual — $190/yr (save $38 — 2 months free)

Subscribe to ClipperViral: ${pricingUrl}

No pressure. Cancel anytime after subscribing — you keep access until the end of the billing period.

Built by clippers, for clippers.
ClipperViral

If you didn't sign up, ignore this email.`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#fbf7ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#171021;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fbf7ff;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #eadcf2;border-radius:24px;overflow:hidden;box-shadow:0 24px 70px rgba(23,16,33,0.10);">
            <tr>
              <td style="padding:28px 28px 10px;">
                <div style="display:inline-block;border-radius:16px;background:linear-gradient(135deg,#4f22f2,#eb34b8);color:#ffffff;font-weight:900;font-size:20px;line-height:44px;text-align:center;width:44px;height:44px;">CV</div>
                <div style="margin-top:18px;color:#b81bc9;font-size:12px;font-weight:900;letter-spacing:0.14em;text-transform:uppercase;">Trial ending tomorrow</div>
                <h1 style="margin:10px 0 0;font-size:30px;line-height:1.08;letter-spacing:-0.02em;color:#171021;">Your ClipperViral trial ends in 24 hours</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 28px;color:#5d5364;font-size:16px;line-height:1.6;font-weight:600;">
                <p style="margin:0 0 16px;">Hey there,</p>
                <p style="margin:0 0 16px;">Your 7-day free trial of ClipperViral ends in 24 hours.</p>
                <p style="margin:0 0 16px;">If you're enjoying it — lock in your subscription before the lights go out:</p>
                <ul style="margin:0 0 22px;padding-left:22px;">
                  <li>Monthly — $19/mo</li>
                  <li>Annual — $190/yr (save $38 — 2 months free)</li>
                </ul>
                <a href="${escapeHtml(pricingUrl)}" style="display:inline-block;border-radius:999px;background:linear-gradient(135deg,#e35de0,#d63bdc 48%,#c423e3);color:#ffffff;text-decoration:none;font-size:15px;font-weight:900;padding:14px 22px;box-shadow:0 18px 42px rgba(227,93,224,0.26);">Subscribe to ClipperViral</a>
                <p style="margin:24px 0 0;">No pressure. Cancel anytime after subscribing — you keep access until the end of the billing period.</p>
                <p style="margin:18px 0 0;color:#171021;font-weight:800;">Built by clippers, for clippers.<br />ClipperViral</p>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #eadcf2;padding:18px 28px;color:#8a8090;font-size:12px;line-height:1.5;font-weight:600;">
                If you didn't sign up, ignore this email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject: "Your ClipperViral trial ends tomorrow", html, text };
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const startsAfter = new Date(now + 23 * 60 * 60 * 1000).toISOString();
  const endsBefore = new Date(now + 25 * 60 * 60 * 1000).toISOString();
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("cv_subscribers")
    .select("id, auth_user_id, email, trial_ends_at")
    .eq("status", "trialing")
    .not("email", "is", null)
    .gt("trial_ends_at", startsAfter)
    .lt("trial_ends_at", endsBefore)
    .is("trial_ending_email_sent_at", null)
    .limit(500);

  if (error) {
    return NextResponse.json(
      { error: "Trial-ending query failed.", details: error.message },
      { status: 500 },
    );
  }

  const email = buildTrialEndingEmail();
  const processedIds: string[] = [];
  const sendErrors: Array<{ id: string; email: string; error: string }> = [];
  const rows = (data || []) as TrialEndingSubscriber[];

  for (const row of rows) {
    const recipient = row.email?.trim();
    if (!recipient) continue;

    try {
      await sendCvEmail({
        to: recipient,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });

      const { error: updateError } = await supabase
        .from("cv_subscribers")
        .update({ trial_ending_email_sent_at: new Date().toISOString() })
        .eq("id", row.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      processedIds.push(row.id);
    } catch (sendError) {
      sendErrors.push({
        id: row.id,
        email: recipient,
        error: sendError instanceof Error ? sendError.message : "Unknown email error.",
      });
    }
  }

  return NextResponse.json({
    sent: processedIds.length,
    errors: sendErrors.length,
    processed_ids: processedIds,
    ...(sendErrors.length ? { error_details: sendErrors } : {}),
  });
}
