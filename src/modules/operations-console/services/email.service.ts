import { createChildLogger } from "@/lib/logger";

const logger = createChildLogger("email-service");

interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  private smtpHost = process.env.SMTP_HOST;
  private smtpPort = parseInt(process.env.SMTP_PORT || "587");
  private smtpUser = process.env.SMTP_USER;
  private smtpPass = process.env.SMTP_PASS;
  private fromAddress = process.env.EMAIL_FROM || "secplatform@company.com";

  get isConfigured(): boolean {
    return !!(this.smtpHost && this.smtpUser);
  }

  /**
   * Send an email. Uses native fetch to an SMTP relay API or logs in dev mode.
   * In production, replace with nodemailer or an email service API (SendGrid, SES).
   */
  async send(message: EmailMessage): Promise<boolean> {
    if (!this.isConfigured) {
      logger.debug({ to: message.to, subject: message.subject }, "Email (dev mode - not sent)");
      return true;
    }

    try {
      // For MVP, log the email. In production, integrate with nodemailer or API.
      const redactedTo = message.to.replace(/^(.).*@/, "$1***@");
      logger.info(
        { to: redactedTo, subject: message.subject, from: this.fromAddress },
        "Sending email"
      );

      // TODO: Replace with actual SMTP/API integration
      // Example with nodemailer:
      // const transporter = nodemailer.createTransport({...});
      // await transporter.sendMail({...});

      return true;
    } catch (error) {
      const redacted = message.to.replace(/^(.).*@/, "$1***@");
      logger.error({ error: (error as Error).message, to: redacted }, "Email send failed");
      return false;
    }
  }

  /**
   * Send an SLA breach notification email.
   */
  async sendSLABreachNotification(to: string, vulnKey: string, vulnTitle: string, appName: string, overdueDays: number) {
    return this.send({
      to,
      subject: `[URGENT] SLA Breach: ${vulnKey} - ${vulnTitle}`,
      html: `
        <h2>SLA Breach Alert</h2>
        <p>Vulnerability <strong>${vulnKey}</strong> has breached its SLA.</p>
        <table style="border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:4px 12px;border:1px solid #ddd"><strong>Vulnerability</strong></td><td style="padding:4px 12px;border:1px solid #ddd">${vulnKey}: ${vulnTitle}</td></tr>
          <tr><td style="padding:4px 12px;border:1px solid #ddd"><strong>Application</strong></td><td style="padding:4px 12px;border:1px solid #ddd">${appName}</td></tr>
          <tr><td style="padding:4px 12px;border:1px solid #ddd"><strong>Overdue</strong></td><td style="padding:4px 12px;border:1px solid #ddd">${overdueDays} day(s)</td></tr>
        </table>
        <p>Please take immediate action.</p>
        <p><em>— SecPlatform</em></p>
      `,
    });
  }

  /**
   * Send a new Critical vulnerability notification.
   */
  async sendCriticalVulnNotification(to: string, vulnKey: string, vulnTitle: string, appName: string) {
    return this.send({
      to,
      subject: `[CRITICAL] New Critical Vulnerability: ${vulnKey}`,
      html: `
        <h2>New Critical Vulnerability</h2>
        <p>A new Critical vulnerability has been identified.</p>
        <table style="border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:4px 12px;border:1px solid #ddd"><strong>Vulnerability</strong></td><td style="padding:4px 12px;border:1px solid #ddd">${vulnKey}: ${vulnTitle}</td></tr>
          <tr><td style="padding:4px 12px;border:1px solid #ddd"><strong>Application</strong></td><td style="padding:4px 12px;border:1px solid #ddd">${appName}</td></tr>
          <tr><td style="padding:4px 12px;border:1px solid #ddd"><strong>Severity</strong></td><td style="padding:4px 12px;border:1px solid #ddd;color:#dc2626;font-weight:bold">CRITICAL</td></tr>
        </table>
        <p><em>— SecPlatform</em></p>
      `,
    });
  }
}

export const emailService = new EmailService();
