import { Hono } from 'hono';
import { createClient } from '@libsql/client';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import * as nodeCrypto from 'node:crypto';

// ─── HTML escape ─────────────────────────────────────────────────────────────
const e = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// ─── Shared snippets ─────────────────────────────────────────────────────────
const favicons = `
  <link rel="apple-touch-icon" sizes="57x57"   href="https://themidnight.in/beta/media/favicon/apple-icon-57x57.png">
  <link rel="apple-touch-icon" sizes="60x60"   href="https://themidnight.in/beta/media/favicon/apple-icon-60x60.png">
  <link rel="apple-touch-icon" sizes="72x72"   href="https://themidnight.in/beta/media/favicon/apple-icon-72x72.png">
  <link rel="apple-touch-icon" sizes="76x76"   href="https://themidnight.in/beta/media/favicon/apple-icon-76x76.png">
  <link rel="apple-touch-icon" sizes="114x114" href="https://themidnight.in/beta/media/favicon/apple-icon-114x114.png">
  <link rel="apple-touch-icon" sizes="120x120" href="https://themidnight.in/beta/media/favicon/apple-icon-120x120.png">
  <link rel="apple-touch-icon" sizes="144x144" href="https://themidnight.in/beta/media/favicon/apple-icon-144x144.png">
  <link rel="apple-touch-icon" sizes="152x152" href="https://themidnight.in/beta/media/favicon/apple-icon-152x152.png">
  <link rel="apple-touch-icon" sizes="180x180" href="https://themidnight.in/beta/media/favicon/apple-icon-180x180.png">
  <link rel="icon" type="image/png" sizes="192x192" href="https://themidnight.in/beta/media/favicon/android-icon-192x192.png">
  <link rel="icon" type="image/png" sizes="32x32"   href="https://themidnight.in/beta/media/favicon/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="96x96"   href="https://themidnight.in/beta/media/favicon/favicon-96x96.png">
  <link rel="icon" type="image/png" sizes="16x16"   href="https://themidnight.in/beta/media/favicon/favicon-16x16.png">`;

const tailwindConfig = `
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: { sans: ['Inter', 'sans-serif'] },
          colors: {
            midnight: { 50:'#f0f0f5', 100:'#e0e0eb', 500:'#3b3b6e', 700:'#1a1a2e', 900:'#0d0d1a' }
          }
        }
      }
    }
  </script>
  <style>body { font-family: 'Inter', sans-serif; }</style>`;

const logoSvg = (gradId) => `
  <svg class="w-10 h-10" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 3L5 9v10c0 9.4 6.4 18.2 15 20 8.6-1.8 15-10.6 15-20V9L20 3z" fill="#1a1a2e"/>
    <path d="M20 3L5 9v10c0 9.4 6.4 18.2 15 20 8.6-1.8 15-10.6 15-20V9L20 3z" fill="url(#${gradId})" opacity="0.85"/>
    <path d="M25 17.5V16a5 5 0 00-10 0v1.5A2.5 2.5 0 0013 20v5a2.5 2.5 0 002.5 2.5h9A2.5 2.5 0 0027 25v-5a2.5 2.5 0 00-2-2.5zm-7-1.5a2 2 0 014 0v1.5h-4V16zm2 8.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" fill="white"/>
    <defs>
      <linearGradient id="${gradId}" x1="5" y1="3" x2="35" y2="35" gradientUnits="userSpaceOnUse">
        <stop stop-color="#3b3b6e"/><stop offset="1" stop-color="#1a1a2e"/>
      </linearGradient>
    </defs>
  </svg>`;

const sharedFooter = `
  <div class="mt-8 text-center">
    <p class="text-xs text-slate-400">Your secrets are encrypted before being stored.</p>
    <p class="text-xs text-slate-400">We never see your unencrypted data.</p>
    <div class="flex flex-wrap items-center justify-center gap-4 mt-3 text-xs text-slate-400">
      <span class="flex items-center gap-1">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
        </svg>
        AES-256-GCM
      </span>
      <span class="flex items-center gap-1">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>
        </svg>
        Split-Key Architecture
      </span>
      <span class="flex items-center gap-1">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        Auto-Expiry
      </span>
      <span class="flex items-center gap-1">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
        </svg>
        Open Source
      </span>
    </div>
  </div>`;

// ─── Templates ───────────────────────────────────────────────────────────────
const indexHtml = ({ error }) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SecureShare \u2014 Secure Secret Sharing</title>
  ${favicons}
  ${tailwindConfig}
</head>
<body class="min-h-screen bg-slate-100 flex flex-col items-center justify-center px-4 py-12">

  <div class="mb-8 text-center">
    <div class="flex items-center justify-center gap-3 mb-1">
      ${logoSvg('shield-grad')}
      <div class="text-left">
        <h1 class="text-2xl font-bold text-midnight-700 leading-tight">Secure<span class="text-midnight-500">Share</span></h1>
        <p class="text-xs text-slate-400 leading-none">by The Midnight Digital</p>
      </div>
    </div>
    <p class="text-sm text-slate-500 mt-4 mb-4">Share one-time secrets with self-destructing links</p>
    <div class="flex flex-wrap items-center justify-center gap-2">
      <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-slate-300 bg-white text-xs font-medium text-slate-500">
        <svg class="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
        </svg>
        AES-256 ENCRYPTED
      </span>
      <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-slate-300 bg-white text-xs font-medium text-slate-500">
        <svg class="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>
        </svg>
        END-TO-END
      </span>
      <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-slate-300 bg-white text-xs font-medium text-slate-500">
        <svg class="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
        </svg>
        ONE-TIME VIEW
      </span>
    </div>
  </div>

  <div class="w-full max-w-xl bg-white rounded-2xl shadow border border-slate-200">
    <div class="p-8">
      ${error ? `
      <div class="mb-5 flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
        <svg class="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
        </svg>
        <span>${e(error)}</span>
      </div>` : ''}

      <form action="/secret" method="POST" id="secretForm">
        <div class="mb-5">
          <label for="secret" class="block text-sm font-medium text-slate-700 mb-1.5">Your Secret</label>
          <textarea id="secret" name="secret" rows="5" required maxlength="50000"
            placeholder="Paste your secret here..."
            class="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm placeholder-slate-400
                   focus:outline-none focus:ring-2 focus:ring-midnight-500/30 focus:border-midnight-500 resize-none transition"
          ></textarea>
          <p class="mt-1 text-xs text-slate-400 text-right"><span id="charCount">0</span> / 50,000</p>
        </div>

        <div class="mb-5">
          <label for="expiration" class="block text-sm font-medium text-slate-700 mb-1.5">Expires After</label>
          <div class="relative">
            <select id="expiration" name="expiration"
              class="w-full appearance-none px-4 py-3 pr-10 rounded-xl border border-slate-200 text-slate-800 text-sm
                     bg-white focus:outline-none focus:ring-2 focus:ring-midnight-500/30 focus:border-midnight-500 transition">
              <option value="1h">1 Hour</option>
              <option value="24h">24 Hours</option>
              <option value="7d">7 Days</option>
              <option value="30d" selected>30 Days</option>
            </select>
            <div class="pointer-events-none absolute inset-y-0 right-3 flex items-center">
              <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
              </svg>
            </div>
          </div>
        </div>

        <div class="relative flex items-center my-6">
          <div class="flex-grow border-t border-slate-200"></div>
          <span class="mx-4 text-xs font-semibold text-slate-400 tracking-widest">OPTIONAL SECURITY</span>
          <div class="flex-grow border-t border-slate-200"></div>
        </div>

        <div class="mb-6">
          <label for="password" class="block text-sm font-medium text-slate-700 mb-1.5">
            Password <span class="text-slate-400 font-normal">(optional)</span>
          </label>
          <div class="relative">
            <input type="password" id="password" name="password" autocomplete="new-password"
              placeholder="Add a password for extra protection..."
              class="w-full px-4 py-3 pr-12 rounded-xl border border-slate-200 text-slate-800 text-sm placeholder-slate-400
                     focus:outline-none focus:ring-2 focus:ring-midnight-500/30 focus:border-midnight-500 transition"/>
            <button type="button" id="togglePwd"
              class="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600 transition">
              <svg id="eyeOpen" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
              </svg>
              <svg id="eyeClosed" class="w-5 h-5 hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
              </svg>
            </button>
          </div>
        </div>

        <button type="submit" id="submitBtn"
          class="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-semibold text-white text-sm
                 bg-midnight-700 hover:bg-midnight-900 active:scale-[0.98] transition-all duration-150 shadow-sm">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          </svg>
          <span id="btnText">Create Secret Link</span>
        </button>
      </form>
    </div>
  </div>

  ${sharedFooter}

  <script>
    const textarea = document.getElementById('secret');
    const charCount = document.getElementById('charCount');
    textarea.addEventListener('input', () => { charCount.textContent = textarea.value.length.toLocaleString(); });

    const pwdInput = document.getElementById('password');
    const eyeOpen = document.getElementById('eyeOpen');
    const eyeClosed = document.getElementById('eyeClosed');
    document.getElementById('togglePwd').addEventListener('click', () => {
      const show = pwdInput.type === 'password';
      pwdInput.type = show ? 'text' : 'password';
      eyeOpen.classList.toggle('hidden', show);
      eyeClosed.classList.toggle('hidden', !show);
    });

    document.getElementById('secretForm').addEventListener('submit', () => {
      const btn = document.getElementById('submitBtn');
      const txt = document.getElementById('btnText');
      btn.disabled = true;
      btn.classList.add('opacity-75', 'cursor-not-allowed');
      txt.textContent = 'Encrypting\u2026';
    });
  </script>
</body>
</html>`;

const successHtml = ({ secretUrl, expiryLabel, hasPassword }) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Secret Link Created \u2014 SecureShare</title>
  ${favicons}
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  ${tailwindConfig}
  <style>#qrcode canvas, #qrcode img { margin: 0 auto; border-radius: 0.5rem; }</style>
</head>
<body class="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-12">

  <div class="mb-8 text-center">
    <div class="flex items-center justify-center gap-3 mb-1">
      ${logoSvg('sg2')}
      <div class="text-left">
        <h1 class="text-2xl font-bold text-midnight-700 leading-tight">Secure<span class="text-midnight-500">Share</span></h1>
        <p class="text-xs text-slate-400 leading-none">by The Midnight Digital</p>
      </div>
    </div>
  </div>

  <div class="w-full max-w-xl bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
    <div class="h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-midnight-500"></div>
    <div class="p-8">

      <div class="flex flex-col items-center text-center mb-7">
        <div class="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-4 ring-4 ring-emerald-100">
          <svg class="w-7 h-7 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <h2 class="text-xl font-bold text-slate-800 mb-1">Secret Link Created</h2>
        <p class="text-sm text-slate-500">
          Share the link below. It expires in <strong class="text-slate-700">${e(expiryLabel)}</strong>${hasPassword ? ' and is password-protected' : ''}.
        </p>
      </div>

      <div class="mb-4">
        <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Your Secret Link</label>
        <div class="flex gap-2">
          <input id="secretUrl" type="text" readonly value="${e(secretUrl)}"
            class="flex-1 min-w-0 px-3.5 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-700
                   text-sm font-mono focus:outline-none truncate"/>
          <button id="copyBtn" onclick="copyLink()"
            class="shrink-0 inline-flex items-center gap-1.5 px-4 py-3 rounded-xl text-sm font-semibold
                   bg-midnight-700 hover:bg-midnight-900 text-white transition-all active:scale-95">
            <svg id="copyIcon" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
            <svg id="checkIcon" class="w-4 h-4 hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
            </svg>
            <span id="copyText">Copy</span>
          </button>
        </div>
      </div>

      <div class="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3.5 mb-6">
        <svg class="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
        </svg>
        <div>
          <p class="text-sm font-semibold text-amber-800">One-Time Access Only</p>
          <p class="text-xs text-amber-700 mt-0.5">This link can only be viewed <strong>once</strong>. After viewing, it is permanently and irreversibly deleted from our servers.</p>
        </div>
      </div>

      <div class="border border-slate-100 rounded-2xl p-5 mb-6 text-center">
        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Scan QR Code</p>
        <div id="qrcode" class="flex justify-center"></div>
        <p class="text-xs text-slate-400 mt-3">Scan with any camera or QR reader app</p>
      </div>

      <div class="flex flex-col sm:flex-row gap-3">
        <a href="/" class="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-slate-200
               text-slate-600 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-all">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          Create Another Secret
        </a>
      </div>
    </div>

    <div class="px-8 pb-6">
      <div class="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-400 border-t border-slate-100 pt-5">
        <span class="flex items-center gap-1">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
          </svg>
          AES-256-GCM Encrypted
        </span>
        <span class="flex items-center gap-1">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          Expires in ${e(expiryLabel)}
        </span>
      </div>
    </div>
  </div>

  ${sharedFooter}

  <script>
    const secretUrl = ${JSON.stringify(secretUrl)};
    new QRCode(document.getElementById('qrcode'), {
      text: secretUrl, width: 192, height: 192,
      colorDark: '#1a1a2e', colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H,
    });

    function copyLink() {
      const url = document.getElementById('secretUrl').value;
      const btn = document.getElementById('copyBtn');
      const copyIcon = document.getElementById('copyIcon');
      const checkIcon = document.getElementById('checkIcon');
      const copyText = document.getElementById('copyText');
      navigator.clipboard.writeText(url).then(() => {
        copyIcon.classList.add('hidden');
        checkIcon.classList.remove('hidden');
        copyText.textContent = 'Copied!';
        btn.classList.replace('bg-midnight-700', 'bg-emerald-600');
        btn.classList.replace('hover:bg-midnight-900', 'hover:bg-emerald-700');
        setTimeout(() => {
          copyIcon.classList.remove('hidden');
          checkIcon.classList.add('hidden');
          copyText.textContent = 'Copy';
          btn.classList.replace('bg-emerald-600', 'bg-midnight-700');
          btn.classList.replace('hover:bg-emerald-700', 'hover:bg-midnight-900');
        }, 2000);
      }).catch(() => {
        const input = document.getElementById('secretUrl');
        input.select();
        document.execCommand('copy');
        copyText.textContent = 'Copied!';
        setTimeout(() => { copyText.textContent = 'Copy'; }, 2000);
      });
    }
  </script>
</body>
</html>`;

const viewHtml = ({ secret, needsPassword, id, error }) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>View Secret \u2014 SecureShare</title>
  ${favicons}
  ${tailwindConfig}
  <style>.secret-text { word-break: break-all; white-space: pre-wrap; }</style>
</head>
<body class="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-12">

  <div class="mb-8 text-center">
    <div class="flex items-center justify-center gap-3 mb-1">
      ${logoSvg('sg3')}
      <div class="text-left">
        <h1 class="text-2xl font-bold text-midnight-700 leading-tight">Secure<span class="text-midnight-500">Share</span></h1>
        <p class="text-xs text-slate-400 leading-none">by The Midnight Digital</p>
      </div>
    </div>
  </div>

  ${needsPassword ? `
  <div class="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
    <div class="h-1.5 bg-gradient-to-r from-midnight-700 via-midnight-500 to-indigo-500"></div>
    <div class="p-8">
      <div class="flex flex-col items-center text-center mb-7">
        <div class="w-14 h-14 rounded-full bg-midnight-50 flex items-center justify-center mb-4 ring-4 ring-midnight-100">
          <svg class="w-7 h-7 text-midnight-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
          </svg>
        </div>
        <h2 class="text-xl font-bold text-slate-800 mb-1">Password Required</h2>
        <p class="text-sm text-slate-500">This secret is password-protected. Enter the passphrase to unlock it.</p>
      </div>
      ${error ? `
      <div class="mb-5 flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
        <svg class="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
        </svg>
        <span>${e(error)}</span>
      </div>` : ''}
      <form action="/secret/${e(id)}" method="POST" id="pwdForm">
        <div class="mb-5">
          <label for="password" class="block text-sm font-medium text-slate-700 mb-1.5">Passphrase</label>
          <div class="relative">
            <input type="password" id="password" name="password" required autofocus
              placeholder="Enter the secret passphrase"
              class="w-full px-4 py-3 pr-12 rounded-xl border border-slate-200 text-slate-800 text-sm placeholder-slate-400
                     focus:outline-none focus:ring-2 focus:ring-midnight-500/30 focus:border-midnight-500 transition"/>
            <button type="button" id="togglePwd"
              class="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600 transition">
              <svg id="eyeOpen" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
              </svg>
              <svg id="eyeClosed" class="w-5 h-5 hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
              </svg>
            </button>
          </div>
        </div>
        <button type="submit" id="unlockBtn"
          class="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-white text-sm
                 bg-midnight-700 hover:bg-midnight-900 active:scale-[0.98] transition-all shadow-sm">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"/>
          </svg>
          <span id="unlockText">Unlock Secret</span>
        </button>
      </form>
    </div>
  </div>
  ` : secret ? `
  <div class="w-full max-w-xl bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
    <div class="h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-midnight-500"></div>
    <div class="p-8">
      <div class="flex flex-col items-center text-center mb-7">
        <div class="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-4 ring-4 ring-emerald-100">
          <svg class="w-7 h-7 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"/>
          </svg>
        </div>
        <h2 class="text-xl font-bold text-slate-800 mb-1">Secret Unlocked</h2>
        <p class="text-sm text-slate-500">Copy it now. This page cannot be refreshed \u2014 the secret is gone.</p>
      </div>

      <div class="mb-4">
        <div class="flex items-center justify-between mb-2">
          <label class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Your Secret</label>
          <button onclick="copySecret()" id="copySecretBtn"
            class="inline-flex items-center gap-1.5 text-xs font-medium text-midnight-700 hover:text-midnight-900
                   border border-slate-200 hover:border-midnight-300 rounded-lg px-3 py-1.5 transition-all">
            <svg id="copySecretIcon" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
            <svg id="copySecretCheck" class="w-3.5 h-3.5 hidden text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
            </svg>
            <span id="copySecretText">Copy Secret</span>
          </button>
        </div>
        <pre id="secretContent"
          class="secret-text w-full px-4 py-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-800
                 text-sm font-mono leading-relaxed max-h-80 overflow-y-auto">${e(secret)}</pre>
      </div>

      <div class="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3.5 mb-6">
        <svg class="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
        </svg>
        <div>
          <p class="text-sm font-semibold text-red-800">Permanently Deleted</p>
          <p class="text-xs text-red-700 mt-0.5">This secret has been permanently deleted from our servers. Refreshing this page will not restore it.</p>
        </div>
      </div>

      <a href="/" class="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border border-slate-200
             text-slate-600 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-all">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        Create a New Secret
      </a>
    </div>
  </div>
  ` : `
  <div class="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
    <div class="h-1.5 bg-gradient-to-r from-red-400 via-orange-400 to-amber-400"></div>
    <div class="p-8">
      <div class="flex flex-col items-center text-center mb-6">
        <div class="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-4 ring-4 ring-slate-200">
          <svg class="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <h2 class="text-xl font-bold text-slate-800 mb-1">Secret Unavailable</h2>
        <p class="text-sm text-slate-500 leading-relaxed">${error ? e(error) : 'This secret does not exist, has already been viewed, or has expired.'}</p>
      </div>
      <div class="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 mb-6 text-xs text-slate-500 space-y-1.5">
        <p class="flex items-center gap-2">
          <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          Secrets are deleted immediately after the first successful view.
        </p>
        <p class="flex items-center gap-2">
          <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          Secrets also expire automatically based on the chosen duration.
        </p>
      </div>
      <a href="/" class="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-white text-sm
             bg-midnight-700 hover:bg-midnight-900 active:scale-[0.98] transition-all shadow-sm">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        Create a New Secret
      </a>
    </div>
  </div>
  `}

  ${sharedFooter}

  <script>
    const toggleBtn = document.getElementById('togglePwd');
    if (toggleBtn) {
      const pwdInput = document.getElementById('password');
      const eyeOpen = document.getElementById('eyeOpen');
      const eyeClosed = document.getElementById('eyeClosed');
      toggleBtn.addEventListener('click', () => {
        const show = pwdInput.type === 'password';
        pwdInput.type = show ? 'text' : 'password';
        eyeOpen.classList.toggle('hidden', show);
        eyeClosed.classList.toggle('hidden', !show);
      });
    }

    const pwdForm = document.getElementById('pwdForm');
    if (pwdForm) {
      pwdForm.addEventListener('submit', () => {
        const btn = document.getElementById('unlockBtn');
        const txt = document.getElementById('unlockText');
        btn.disabled = true;
        btn.classList.add('opacity-75', 'cursor-not-allowed');
        txt.textContent = 'Unlocking\u2026';
      });
    }

    function copySecret() {
      const content = document.getElementById('secretContent');
      const icon = document.getElementById('copySecretIcon');
      const checkIcon = document.getElementById('copySecretCheck');
      const label = document.getElementById('copySecretText');
      if (!content) return;
      navigator.clipboard.writeText(content.textContent.trim()).then(() => {
        icon.classList.add('hidden');
        checkIcon.classList.remove('hidden');
        label.textContent = 'Copied!';
        setTimeout(() => {
          icon.classList.remove('hidden');
          checkIcon.classList.add('hidden');
          label.textContent = 'Copy Secret';
        }, 2000);
      }).catch(() => {
        const range = document.createRange();
        range.selectNode(content);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        document.execCommand('copy');
        window.getSelection().removeAllRanges();
        label.textContent = 'Copied!';
        setTimeout(() => { label.textContent = 'Copy Secret'; }, 2000);
      });
    }
  </script>
</body>
</html>`;

// ─── DB ──────────────────────────────────────────────────────────────────────
const getDB = (env) => createClient({
  url: env.TURSO_DATABASE_URL,
  authToken: env.TURSO_AUTH_TOKEN,
});

const initDB = async (db) => {
  await db.execute('CREATE TABLE IF NOT EXISTS secrets (id TEXT PRIMARY KEY, encrypted_secret TEXT NOT NULL, iv TEXT NOT NULL, encryption_key TEXT NOT NULL, auth_tag TEXT NOT NULL, password_hash TEXT, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)');
};

// ─── App ─────────────────────────────────────────────────────────────────────
const app = new Hono();

app.get('/', (c) => c.html(indexHtml({ error: null })));

app.post('/secret', async (c) => {
  const { secret, expiration, password } = await c.req.parseBody();
  if (!secret?.trim()) {
    return c.html(indexHtml({ error: 'Secret cannot be empty.' }), 400);
  }

  const id = uuidv4();
  const db = getDB(c.env);
  await initDB(db);

  const nodeKey = nodeCrypto.randomBytes(32);
  const nodeIv = nodeCrypto.randomBytes(12);
  const cipher = nodeCrypto.createCipheriv('aes-256-gcm', nodeKey, nodeIv);
  let encryptedHex = cipher.update(secret.trim(), 'utf8', 'hex');
  encryptedHex += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  const passwordHash = password?.trim() ? await bcrypt.hash(password.trim(), 10) : null;
  const EXPIRY_MAP = { '1h': 3600, '24h': 86400, '7d': 604800, '30d': 2592000 };
  const expiresAt = Math.floor(Date.now() / 1000) + (EXPIRY_MAP[expiration] || 86400);

  await db.execute({
    sql: 'INSERT INTO secrets VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    args: [id, encryptedHex, nodeIv.toString('hex'), nodeKey.toString('hex'), authTag, passwordHash, expiresAt, Math.floor(Date.now() / 1000)]
  });

  const url = new URL(c.req.url);
  const secretUrl = `${url.protocol}//${url.host}/secret/${id}`;
  const expiryLabel = { '1h': '1 hour', '24h': '24 hours', '7d': '7 days', '30d': '30 days' }[expiration] || '24 hours';
  return c.html(successHtml({ secretUrl, expiryLabel, hasPassword: !!passwordHash }));
});

app.get('/secret/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDB(c.env);
  await initDB(db);
  const result = await db.execute({ sql: 'SELECT * FROM secrets WHERE id = ?', args: [id] });
  if (!result.rows.length) {
    return c.html(viewHtml({ secret: null, needsPassword: false, id, error: 'Not found or already viewed.' }));
  }
  const row = result.rows[0];
  if (row.expires_at < Math.floor(Date.now() / 1000)) {
    await db.execute({ sql: 'DELETE FROM secrets WHERE id = ?', args: [id] });
    return c.html(viewHtml({ secret: null, needsPassword: false, id, error: 'Expired.' }), 410);
  }
  if (row.password_hash) {
    return c.html(viewHtml({ secret: null, needsPassword: true, id, error: null }));
  }

  const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', Buffer.from(row.encryption_key, 'hex'), Buffer.from(row.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(row.auth_tag, 'hex'));
  let decrypted = decipher.update(row.encrypted_secret, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  await db.execute({ sql: 'DELETE FROM secrets WHERE id = ?', args: [id] });
  return c.html(viewHtml({ secret: decrypted, needsPassword: false, id, error: null }));
});

app.post('/secret/:id', async (c) => {
  const id = c.req.param('id');
  const { password } = await c.req.parseBody();
  const db = getDB(c.env);
  await initDB(db);
  const result = await db.execute({ sql: 'SELECT * FROM secrets WHERE id = ?', args: [id] });
  if (!result.rows.length) {
    return c.html(viewHtml({ secret: null, needsPassword: false, id, error: 'Not found.' }));
  }
  const row = result.rows[0];
  const match = row.password_hash ? await bcrypt.compare(password || '', row.password_hash) : true;
  if (!match) {
    return c.html(viewHtml({ secret: null, needsPassword: true, id, error: 'Incorrect password.' }), 401);
  }

  const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', Buffer.from(row.encryption_key, 'hex'), Buffer.from(row.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(row.auth_tag, 'hex'));
  let decrypted = decipher.update(row.encrypted_secret, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  await db.execute({ sql: 'DELETE FROM secrets WHERE id = ?', args: [id] });
  return c.html(viewHtml({ secret: decrypted, needsPassword: false, id, error: null }));
});

// ─── Export for Cloudflare Workers ───────────────────────────────────────────
export default app;
