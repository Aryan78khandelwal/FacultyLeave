const nodemailer = require('nodemailer');

let transporter;

// Initialize Transporter
const initTransporter = async () => {
  if (transporter) return transporter;

  const isSmtpConfigured = process.env.SMTP_USER && process.env.SMTP_PASS;

  if (isSmtpConfigured) {
    console.log('Using configured SMTP settings for sending emails.');
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } else {
    console.log('SMTP user/pass not configured. Initializing Ethereal email fallback account...');
    try {
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      console.log(`Ethereal email test account created successfully:`);
      console.log(`User: ${testAccount.user}`);
      console.log(`Pass: ${testAccount.pass}`);
    } catch (error) {
      console.error('Failed to create Ethereal test email account: ', error.message);
    }
  }

  return transporter;
};

// Send email utility function
const sendEmail = async (options) => {
  const mailTransporter = await initTransporter();
  if (!mailTransporter) {
    console.log('Email transporter not initialized. Skipping email send.');
    return;
  }

  const mailOptions = {
    from: process.env.SMTP_FROM || 'Faculty Leave System <noreply@college.edu>',
    to: options.to,
    subject: options.subject,
    html: options.html,
  };

  try {
    const info = await mailTransporter.sendMail(mailOptions);
    console.log(`Email sent: ${info.messageId}`);
    
    // Output Ethereal preview link if applicable
    if (nodemailer.getTestMessageUrl(info)) {
      console.log(`Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
    }
    return info;
  } catch (error) {
    console.error('Error sending email: ', error.message);
  }
};

// Account Created Template
const sendAccountCreatedEmail = async (user, rawPassword) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #2563eb; text-align: center;">Welcome to the Faculty Leave System</h2>
      <p>Hello <strong>${user.name}</strong>,</p>
      <p>Your account has been created by the Administrator. Below are your login credentials:</p>
      <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #cbd5e1;">
        <p style="margin: 5px 0;"><strong>Role:</strong> ${user.role}</p>
        <p style="margin: 5px 0;"><strong>Employee ID:</strong> ${user.employeeId}</p>
        <p style="margin: 5px 0;"><strong>Email:</strong> ${user.email}</p>
        <p style="margin: 5px 0;"><strong>Password:</strong> <span style="font-family: monospace; font-size: 1.1em; color: #dc2626;">${rawPassword}</span></p>
      </div>
      <p style="color: #475569; font-size: 0.9em;">Please log in at your earliest convenience and update your password from your profile settings.</p>
      <div style="text-align: center; margin-top: 30px;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Log In Now</a>
      </div>
    </div>
  `;

  await sendEmail({
    to: user.email,
    subject: 'Welcome! Your Faculty Leave Account is Ready',
    html,
  });
};

// Leave Applied (Notification to HOD)
const sendLeaveAppliedEmail = async (hodEmail, hodName, facultyName, leaveRequest) => {
  const startDateStr = new Date(leaveRequest.startDate).toLocaleDateString();
  const endDateStr = new Date(leaveRequest.endDate).toLocaleDateString();

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #1e3a8a;">New Leave Application Pending</h2>
      <p>Hello HOD <strong>${hodName}</strong>,</p>
      <p>A new leave application has been submitted by a faculty member in your department:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr>
          <td style="padding: 8px 0; font-weight: bold; width: 140px;">Faculty Member:</td>
          <td style="padding: 8px 0;">${facultyName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Leave Type:</td>
          <td style="padding: 8px 0; text-transform: capitalize;">${leaveRequest.leaveType}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Duration:</td>
          <td style="padding: 8px 0;">${startDateStr} to ${endDateStr} (${leaveRequest.totalDays} Day(s))</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Reason:</td>
          <td style="padding: 8px 0;">${leaveRequest.reason}</td>
        </tr>
      </table>
      <p>Please log in to review and respond to this request.</p>
      <div style="text-align: center; margin-top: 30px;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/hod/requests" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Review Leave Request</a>
      </div>
    </div>
  `;

  await sendEmail({
    to: hodEmail,
    subject: `Leave Request Submitted - ${facultyName}`,
    html,
  });
};

// Leave Approved Template
const sendLeaveApprovedEmail = async (facultyEmail, facultyName, leaveRequest, reviewerName) => {
  const startDateStr = new Date(leaveRequest.startDate).toLocaleDateString();
  const endDateStr = new Date(leaveRequest.endDate).toLocaleDateString();

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #16a34a; text-align: center;">Leave Request Approved!</h2>
      <p>Hello <strong>${facultyName}</strong>,</p>
      <p>We are pleased to inform you that your leave request has been approved by <strong>${reviewerName}</strong>.</p>
      <div style="background-color: #f0fdf4; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #bbf7d0;">
        <p style="margin: 5px 0;"><strong>Leave Type:</strong> <span style="text-transform: capitalize;">${leaveRequest.leaveType}</span></p>
        <p style="margin: 5px 0;"><strong>Duration:</strong> ${startDateStr} to ${endDateStr} (${leaveRequest.totalDays} Day(s))</p>
        <p style="margin: 5px 0;"><strong>Status:</strong> Approved</p>
      </div>
      <p>Your leave balance has been updated accordingly.</p>
    </div>
  `;

  await sendEmail({
    to: facultyEmail,
    subject: 'Approved: Your Leave Application has been Approved',
    html,
  });
};

// Leave Rejected Template
const sendLeaveRejectedEmail = async (facultyEmail, facultyName, leaveRequest, reviewerName) => {
  const startDateStr = new Date(leaveRequest.startDate).toLocaleDateString();
  const endDateStr = new Date(leaveRequest.endDate).toLocaleDateString();

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #dc2626; text-align: center;">Leave Request Rejected</h2>
      <p>Hello <strong>${facultyName}</strong>,</p>
      <p>Your leave request has been reviewed by <strong>${reviewerName}</strong> and could not be approved at this time.</p>
      <div style="background-color: #fef2f2; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #fecaca;">
        <p style="margin: 5px 0;"><strong>Leave Type:</strong> <span style="text-transform: capitalize;">${leaveRequest.leaveType}</span></p>
        <p style="margin: 5px 0;"><strong>Duration:</strong> ${startDateStr} to ${endDateStr} (${leaveRequest.totalDays} Day(s))</p>
        <p style="margin: 5px 0;"><strong>Status:</strong> Rejected</p>
        <p style="margin: 5px 0; color: #dc2626;"><strong>Rejection Reason:</strong> ${leaveRequest.rejectionReason || 'No details provided.'}</p>
      </div>
      <p>If you have any questions, please contact your department HOD.</p>
    </div>
  `;

  await sendEmail({
    to: facultyEmail,
    subject: 'Rejected: Your Leave Application Status Update',
    html,
  });
};

// Forgot Password / Password Reset Template
const sendResetPasswordEmail = async (userEmail, userName, resetUrl) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #2563eb; text-align: center;">Password Reset Request</h2>
      <p>Hello <strong>${userName}</strong>,</p>
      <p>You are receiving this email because you (or someone else) requested a password reset for your account in the Faculty Leave Management System.</p>
      <p>Please click the button below to complete the password reset process. This link is valid for 10 minutes:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Reset Password</a>
      </div>
      <p style="color: #64748b; font-size: 0.85em;">If you did not request a password reset, please ignore this email and your password will remain unchanged.</p>
    </div>
  `;

  await sendEmail({
    to: userEmail,
    subject: 'Password Reset Request - Faculty Leave System',
    html,
  });
};

module.exports = {
  sendAccountCreatedEmail,
  sendLeaveAppliedEmail,
  sendLeaveApprovedEmail,
  sendLeaveRejectedEmail,
  sendResetPasswordEmail,
};
