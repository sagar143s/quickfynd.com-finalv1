// lib/emailjs.js
import emailjs from '@emailjs/nodejs';

const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;
const EMAILJS_TEMPLATE_AUTO_REPLY = process.env.EMAILJS_TEMPLATE_AUTO_REPLY;
const EMAILJS_TEMPLATE_WELCOME = process.env.EMAILJS_TEMPLATE_WELCOME;
const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID || 'service_4omzenc';

export async function sendAutoReplyEmail({ to, name }) {
  console.log('EmailJS sendAutoReplyEmail called:', {
    EMAILJS_SERVICE_ID,
    EMAILJS_PUBLIC_KEY,
    EMAILJS_TEMPLATE_AUTO_REPLY,
    to,
    name,
    EMAILJS_PRIVATE_KEY
  });
  try {
    const result = await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_AUTO_REPLY,
      { to_email: to, to_name: name },
      EMAILJS_PUBLIC_KEY,
      EMAILJS_PRIVATE_KEY
    );
    console.log('EmailJS send result:', result);
    return result;
  } catch (error) {
    console.error('EmailJS send error:', error);
    throw error;
  }
}

export async function sendWelcomeEmail({ to, name }) {
  return emailjs.send(
    EMAILJS_PUBLIC_KEY,
    EMAILJS_TEMPLATE_WELCOME,
    { to_email: to, to_name: name },
    EMAILJS_PRIVATE_KEY
  );
}
