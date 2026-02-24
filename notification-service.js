// notification-service.js — RideOps Notification Dispatch Service
const nodemailer = require('nodemailer');

// ── Configuration ──

let transporter = null;

function initTransporter() {
  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
    console.log('[Notifications] SMTP configured:', process.env.SMTP_HOST);
  } else {
    console.log('[Notifications] No SMTP configured — emails will be logged to console');
    transporter = null;
  }
}

const FROM_ADDRESS = process.env.NOTIFICATION_FROM || 'noreply@ride-ops.com';
const FROM_NAME = process.env.NOTIFICATION_FROM_NAME || 'RideOps';

// ── Core send function ──

async function sendEmail(to, subject, htmlBody, textBody) {
  const msg = {
    from: `"${FROM_NAME}" <${FROM_ADDRESS}>`,
    to,
    subject,
    html: htmlBody,
    text: textBody || htmlBody.replace(/<[^>]*>/g, '')
  };

  if (!transporter) {
    console.log('[Notifications] EMAIL (console mode):');
    console.log('  To:', to);
    console.log('  Subject:', subject);
    console.log('  Body:', (textBody || htmlBody.replace(/<[^>]*>/g, '')).substring(0, 200));
    return { logged: true };
  }

  try {
    const info = await transporter.sendMail(msg);
    console.log('[Notifications] Email sent:', info.messageId, 'to:', to);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error('[Notifications] Email failed:', err.message);
    return { sent: false, error: err.message };
  }
}

// ── Email templates ──

function wrapTemplate(content) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <div style="border-bottom: 2px solid #4682B4; padding-bottom: 12px; margin-bottom: 20px;">
        <span style="font-size: 18px; font-weight: 700; color: #1E2B3A;">RideOps</span>
      </div>
      ${content}
      <div style="margin-top: 24px; padding-top: 12px; border-top: 1px solid #E5E7EB; font-size: 11px; color: #9CA3AF;">
        This is an automated notification from RideOps. Manage your notification preferences in Settings.
      </div>
    </div>
  `;
}

const TEMPLATES = {
  driver_tardy: (data) => ({
    subject: `${data.driverName} clocked in ${data.tardyMinutes}m late`,
    html: wrapTemplate(`
      <h2 style="font-size: 16px; color: #111827; margin: 0 0 8px;">Driver Tardy Alert</h2>
      <p style="color: #6B7280; font-size: 13px; margin: 0 0 16px;">
        <strong>${data.driverName}</strong> clocked in <strong>${data.tardyMinutes} minutes</strong> after their scheduled shift start.
      </p>
      <div style="background: #FEF2F2; border-radius: 8px; padding: 12px 16px; font-size: 13px;">
        <div><strong>Scheduled:</strong> ${data.scheduledStart}</div>
        <div><strong>Clocked in:</strong> ${data.clockInTime}</div>
        <div><strong>Late by:</strong> ${data.tardyMinutes} minutes</div>
      </div>
    `)
  }),

  rider_no_show: (data) => ({
    subject: `Missed ride - ${data.riderName}`,
    html: wrapTemplate(`
      <h2 style="font-size: 16px; color: #111827; margin: 0 0 8px;">Rider No-Show</h2>
      <p style="color: #6B7280; font-size: 13px; margin: 0 0 16px;">
        <strong>${data.riderName}</strong> was marked as a no-show.
      </p>
      <div style="background: #FFF7ED; border-radius: 8px; padding: 12px 16px; font-size: 13px;">
        <div><strong>Route:</strong> ${data.pickup} &rarr; ${data.dropoff}</div>
        <div><strong>Scheduled:</strong> ${data.requestedTime}</div>
        <div><strong>Driver:</strong> ${data.driverName}</div>
        <div><strong>Consecutive misses:</strong> ${data.consecutiveMisses}</div>
      </div>
    `)
  }),

  rider_approaching_termination: (data) => ({
    subject: `${data.riderName} - ${data.missesRemaining} strike(s) remaining`,
    html: wrapTemplate(`
      <h2 style="font-size: 16px; color: #111827; margin: 0 0 8px;">Rider Strike Warning</h2>
      <p style="color: #6B7280; font-size: 13px; margin: 0 0 16px;">
        <strong>${data.riderName}</strong> has <strong>${data.consecutiveMisses}</strong> consecutive no-shows.
        They have <strong>${data.missesRemaining} strike(s)</strong> remaining before automatic service termination.
      </p>
      <div style="background: #FEF2F2; border-radius: 8px; padding: 12px 16px; font-size: 13px;">
        <div><strong>Consecutive no-shows:</strong> ${data.consecutiveMisses} / ${data.maxStrikes}</div>
        <div><strong>Status:</strong> ${data.missesRemaining === 1 ? 'Final warning' : 'Approaching limit'}</div>
      </div>
    `)
  }),

  rider_terminated: (data) => ({
    subject: `${data.riderName} - Service terminated`,
    html: wrapTemplate(`
      <h2 style="font-size: 16px; color: #EF4444; margin: 0 0 8px;">Rider Service Terminated</h2>
      <p style="color: #6B7280; font-size: 13px; margin: 0 0 16px;">
        <strong>${data.riderName}</strong> has reached <strong>${data.maxStrikes} consecutive no-shows</strong> and has been automatically terminated from the service.
      </p>
      <div style="background: #FEF2F2; border-radius: 8px; padding: 12px 16px; font-size: 13px;">
        <div><strong>Consecutive no-shows:</strong> ${data.consecutiveMisses}</div>
        <div><strong>Action taken:</strong> Account deactivated</div>
      </div>
      <p style="color: #6B7280; font-size: 12px; margin-top: 12px;">
        The rider's account can be manually reactivated from the Admin panel if needed.
      </p>
    `)
  }),

  ride_pending_stale: (data) => ({
    subject: `Ride pending for ${data.minutesPending}m - ${data.riderName}`,
    html: wrapTemplate(`
      <h2 style="font-size: 16px; color: #111827; margin: 0 0 8px;">Stale Ride Request</h2>
      <p style="color: #6B7280; font-size: 13px; margin: 0 0 16px;">
        A ride request from <strong>${data.riderName}</strong> has been pending for <strong>${data.minutesPending} minutes</strong> with no action.
      </p>
      <div style="background: #EFF6FF; border-radius: 8px; padding: 12px 16px; font-size: 13px;">
        <div><strong>Route:</strong> ${data.pickup} &rarr; ${data.dropoff}</div>
        <div><strong>Requested:</strong> ${data.requestedTime}</div>
        <div><strong>Pending since:</strong> ${data.minutesPending} minutes</div>
      </div>
    `)
  }),

  new_ride_request: (data) => ({
    subject: `New ride request - ${data.riderName}`,
    html: wrapTemplate(`
      <h2 style="font-size: 16px; color: #111827; margin: 0 0 8px;">New Ride Request</h2>
      <p style="color: #6B7280; font-size: 13px;">
        <strong>${data.riderName}</strong> has requested a ride.
      </p>
      <div style="background: #EFF6FF; border-radius: 8px; padding: 12px 16px; font-size: 13px; margin-top: 12px;">
        <div><strong>From:</strong> ${data.pickup}</div>
        <div><strong>To:</strong> ${data.dropoff}</div>
        <div><strong>When:</strong> ${data.requestedTime}</div>
      </div>
    `)
  }),

  // ── Rider-facing templates ──

  rider_no_show_notice: (data) => ({
    subject: `Missed ride - action may be required`,
    html: wrapTemplate(`
      <h2 style="font-size: 16px; color: #111827; margin: 0 0 8px;">Missed Ride Notice</h2>
      <p style="color: #6B7280; font-size: 13px; margin: 0 0 16px;">
        Hi ${data.riderName}, your scheduled ride was marked as a no-show because you were not at the pickup location when the driver arrived.
      </p>
      <div style="background: #FFF7ED; border-radius: 8px; padding: 12px 16px; font-size: 13px;">
        <div><strong>Pickup:</strong> ${data.pickup}</div>
        <div><strong>Drop-off:</strong> ${data.dropoff}</div>
        <div><strong>Scheduled:</strong> ${data.requestedTime}</div>
      </div>
      <p style="color: #6B7280; font-size: 12px; margin-top: 12px;">
        If you believe this was an error, please contact dispatch. Repeated no-shows may result in service restrictions.
      </p>
    `)
  }),

  rider_strike_warning: (data) => ({
    subject: `Important: ${data.missesRemaining} missed ride(s) remaining before service suspension`,
    html: wrapTemplate(`
      <h2 style="font-size: 16px; color: #EF4444; margin: 0 0 8px;">Service Warning</h2>
      <p style="color: #6B7280; font-size: 13px; margin: 0 0 16px;">
        Hi ${data.riderName}, you have <strong>${data.consecutiveMisses} consecutive missed rides</strong>.
        You have <strong>${data.missesRemaining}</strong> remaining before your service is automatically suspended.
      </p>
      <div style="background: #FEF2F2; border-radius: 8px; padding: 12px 16px; font-size: 13px;">
        <div><strong>Consecutive no-shows:</strong> ${data.consecutiveMisses} / ${data.maxStrikes}</div>
        <div><strong>Remaining:</strong> ${data.missesRemaining}</div>
      </div>
      <p style="color: #6B7280; font-size: 12px; margin-top: 12px;">
        Please ensure you are at the pickup location when your driver arrives. If you need to cancel a ride, please do so in advance through the app.
      </p>
    `)
  }),

  rider_terminated_notice: (data) => ({
    subject: `Your ride service has been suspended`,
    html: wrapTemplate(`
      <h2 style="font-size: 16px; color: #EF4444; margin: 0 0 8px;">Service Suspended</h2>
      <p style="color: #6B7280; font-size: 13px; margin: 0 0 16px;">
        Hi ${data.riderName}, due to <strong>${data.maxStrikes} consecutive missed rides</strong>, your ride service has been automatically suspended.
      </p>
      <div style="background: #FEF2F2; border-radius: 8px; padding: 12px 16px; font-size: 13px;">
        <div><strong>Consecutive no-shows:</strong> ${data.consecutiveMisses}</div>
        <div><strong>Action:</strong> Service suspended</div>
      </div>
      <p style="color: #6B7280; font-size: 12px; margin-top: 12px;">
        If you believe this is an error or would like to request reinstatement, please contact the office directly.
      </p>
    `)
  })
};

// ── Dispatch engine ──

async function dispatchNotification(eventType, data, queryFn) {
  try {
    const result = await queryFn(`
      SELECT np.*, u.email, u.name as user_name
      FROM notification_preferences np
      JOIN users u ON u.id = np.user_id
      WHERE np.event_type = $1 AND np.enabled = true AND np.channel = 'email'
    `, [eventType]);

    if (!result.rowCount) return;

    const template = TEMPLATES[eventType];
    if (!template) {
      console.warn('[Notifications] No template for event:', eventType);
      return;
    }

    for (const pref of result.rows) {
      if (pref.threshold_value && data.thresholdCheck !== undefined) {
        if (data.thresholdCheck < pref.threshold_value) continue;
      }

      const { subject, html } = template(data);
      await sendEmail(pref.email, subject, html);
    }
  } catch (err) {
    console.error('[Notifications] Dispatch error for', eventType, ':', err.message);
  }
}

// ── Direct rider email sender ──

async function sendRiderEmail(eventType, data) {
  if (!data.riderEmail) {
    console.warn('[Notifications] No rider email for', eventType);
    return;
  }
  const template = TEMPLATES[eventType];
  if (!template) {
    console.warn('[Notifications] No template for rider event:', eventType);
    return;
  }
  try {
    const { subject, html } = template(data);
    await sendEmail(data.riderEmail, subject, html);
  } catch (err) {
    console.error('[Notifications] Rider email error for', eventType, ':', err.message);
  }
}

module.exports = { initTransporter, sendEmail, dispatchNotification, sendRiderEmail, TEMPLATES };
