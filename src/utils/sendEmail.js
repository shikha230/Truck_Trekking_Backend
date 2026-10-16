const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  console.log('process.envprocess.env',process.env)
  // Transporter setup (Aap apna Gmail ya custom SMTP use kar sakte hain)
  const transporter = nodemailer.createTransport({
    service: 'gmail', // ya host: 'smtp.gmail.com', port: 587
    auth: {
      user: process.env.EMAIL_USER, // Aapki email (e.g., admin@trucktrak.com)
      pass: process.env.EMAIL_PASS  // Gmail App Password (Normal password nahi, App password dalna hota hai)
    }
  });

  const mailOptions = {
    from: `"Truck-Trak Security" <${process.env.EMAIL_USER}>`,
    to: options.email,
    subject: options.subject,
    html: options.message,
  };

  await transporter.sendMail(mailOptions);
};

module.exports = sendEmail;