// configs/gemini.js
// Google Gemini API client setup
import { GoogleGenerativeAI } from "@google/generative-ai";

let _gemini = null;

export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function ensureGemini() {
  if (_gemini) return _gemini;
  const { GEMINI_API_KEY } = process.env;
  if (!GEMINI_API_KEY) {
    throw new Error("Gemini is not configured");
  }
  _gemini = new GoogleGenerativeAI(GEMINI_API_KEY);
  return _gemini;
}

export const gemini = new Proxy({}, {
  get(target, prop) {
    const client = ensureGemini();
    return client[prop];
  }
});
