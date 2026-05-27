/*!
 * Embeddable Support Chatbot
 * Usage: <script src="https://your-server.com/chatbot.js" data-company-id="YOUR_ID"></script>
 * Optional overrides via data attributes:
 *   data-bot-name, data-primary-color, data-welcome-message, data-position (left|right)
 */
(function () {
  'use strict';

  // ── Find this script tag ──────────────────────────────────────────────────
  const scriptTag =
    document.currentScript ||
    document.querySelector('script[data-company-id]');

  if (!scriptTag) {
    console.warn('[Chatbot] Could not find script tag. Add data-company-id attribute.');
    return;
  }

  const SERVER_URL = scriptTag.src.replace(/\/chatbot\.js.*$/, '');
  const COMPANY_ID = scriptTag.dataset.companyId;

  if (!COMPANY_ID) {
    console.warn('[Chatbot] Missing data-company-id on script tag.');
    return;
  }

  // ── Config (overridable via data attributes) ──────────────────────────────
  let config = {
    botName: scriptTag.dataset.botName || 'Support',
    primaryColor: scriptTag.dataset.primaryColor || '#6366f1',
    welcomeMessage: scriptTag.dataset.welcomeMessage || 'Hi! How can I help you today?',
    position: scriptTag.dataset.position === 'left' ? 'left' : 'right',
  };

  // ── State ─────────────────────────────────────────────────────────────────
  const messages = []; // { role: 'user'|'assistant', content: string }
  let isOpen = false;
  let isLoading = false;

  // ── Styles ────────────────────────────────────────────────────────────────
  function injectStyles(primaryColor) {
    const existing = document.getElementById('__chatbot_styles__');
    if (existing) existing.remove();

    const style = document.createElement('style');
    style.id = '__chatbot_styles__';
    style.textContent = `
      #__chatbot_root__ * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }

      #__chatbot_btn__ {
        position: fixed;
        ${config.position}: 24px;
        bottom: 24px;
        width: 52px; height: 52px;
        border-radius: 50%;
        background: ${primaryColor};
        border: none;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 12px rgba(0,0,0,0.15);
        transition: opacity 0.2s;
        z-index: 2147483640;
      }
      #__chatbot_btn__:hover { opacity: 0.9; }
      #__chatbot_btn__ svg { fill: white; width: 22px; height: 22px; }

      #__chatbot_window__ {
        position: fixed;
        ${config.position}: 24px;
        bottom: 88px;
        width: 360px;
        max-height: 520px;
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 4px 24px rgba(0,0,0,0.12);
        border: 1px solid #e5e7eb;
        display: flex; flex-direction: column;
        overflow: hidden;
        z-index: 2147483639;
        transform: translateY(8px);
        opacity: 0;
        pointer-events: none;
        transition: transform 0.18s ease, opacity 0.18s ease;
      }
      #__chatbot_window__.open {
        transform: translateY(0);
        opacity: 1;
        pointer-events: all;
      }

      #__chatbot_header__ {
        background: ${primaryColor};
        color: white;
        padding: 12px 14px;
        display: flex; align-items: center; gap: 8px;
        flex-shrink: 0;
      }
      #__chatbot_header__ .cb-dot {
        width: 8px; height: 8px; border-radius: 50%;
        background: rgba(255,255,255,0.6); flex-shrink: 0;
      }
      #__chatbot_header__ .cb-name { font-weight: 600; font-size: 14px; flex: 1; letter-spacing: 0.01em; }
      #__chatbot_close__, #__chatbot_reset__ {
        background: none; border: none; color: white; cursor: pointer;
        padding: 4px; border-radius: 4px; opacity: 0.7; line-height: 1;
        transition: opacity 0.15s;
      }
      #__chatbot_close__:hover, #__chatbot_reset__:hover { opacity: 1; }

      #__chatbot_messages__ {
        flex: 1; overflow-y: auto; padding: 16px 14px;
        display: flex; flex-direction: column; gap: 8px;
        scroll-behavior: smooth;
        background: #fafafa;
      }
      #__chatbot_messages__::-webkit-scrollbar { width: 4px; }
      #__chatbot_messages__::-webkit-scrollbar-thumb { background: #e0e0e0; border-radius: 2px; }

      .cb-msg { display: flex; flex-direction: column; max-width: 80%; }
      .cb-msg.user { align-self: flex-end; align-items: flex-end; }
      .cb-msg.assistant { align-self: flex-start; align-items: flex-start; }

      .cb-bubble {
        padding: 8px 12px; border-radius: 8px;
        font-size: 13.5px; line-height: 1.5; word-break: break-word;
      }
      .cb-msg.user .cb-bubble {
        background: ${primaryColor}; color: white;
      }
      .cb-msg.assistant .cb-bubble {
        background: #ffffff; color: #111827;
        border: 1px solid #e5e7eb;
      }

      .cb-typing {
        display: flex; align-items: center; gap: 3px;
        padding: 8px 12px; background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        width: fit-content;
      }
      .cb-typing span {
        width: 6px; height: 6px; border-radius: 50%;
        background: #9ca3af; display: block;
        animation: cb-bounce 1.2s infinite;
      }
      .cb-typing span:nth-child(2) { animation-delay: 0.2s; }
      .cb-typing span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes cb-bounce {
        0%, 80%, 100% { transform: translateY(0); }
        40% { transform: translateY(-4px); }
      }

      #__chatbot_input_area__ {
        padding: 10px 14px;
        border-top: 1px solid #e5e7eb;
        display: flex; gap: 8px; align-items: flex-end;
        flex-shrink: 0;
        background: #ffffff;
      }
      #__chatbot_input__ {
        flex: 1; border: 1px solid #e5e7eb; border-radius: 6px;
        padding: 8px 12px; font-size: 13.5px;
        resize: none; outline: none; line-height: 1.4;
        max-height: 100px; overflow-y: auto;
        transition: border-color 0.15s;
        font-family: inherit;
        background: #f9fafb;
        color: #111827;
      }
      #__chatbot_input__:focus { border-color: ${primaryColor}; background: #fff; }
      #__chatbot_send__ {
        width: 34px; height: 34px; border-radius: 6px;
        background: ${primaryColor}; border: none;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        flex-shrink: 0; transition: opacity 0.15s;
      }
      #__chatbot_send__:disabled { opacity: 0.35; cursor: default; }
      #__chatbot_send__:not(:disabled):hover { opacity: 0.85; }
      #__chatbot_send__ svg { fill: white; width: 15px; height: 15px; }

      #__chatbot_branding__ {
        text-align: center; font-size: 10.5px; color: #d1d5db;
        padding: 5px 0 7px; flex-shrink: 0;
        background: #ffffff;
        letter-spacing: 0.02em;
      }

      @media (max-width: 420px) {
        #__chatbot_window__ {
          ${config.position}: 0; bottom: 0;
          width: 100vw; max-height: 70vh;
          border-radius: 12px 12px 0 0;
        }
        #__chatbot_btn__ { ${config.position}: 16px; bottom: 16px; }
      }
    `;
    document.head.appendChild(style);
  }

  // ── DOM Construction ──────────────────────────────────────────────────────
  function buildUI() {
    const root = document.createElement('div');
    root.id = '__chatbot_root__';

    // Toggle button
    root.innerHTML = `
      <button id="__chatbot_btn__" aria-label="Open support chat">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 2H4a2 2 0 00-2 2v12a2 2 0 002 2h4l4 4 4-4h4a2 2 0 002-2V4a2 2 0 00-2-2z"/>
        </svg>
      </button>

      <div id="__chatbot_window__" role="dialog" aria-label="Support chat">
        <div id="__chatbot_header__">
          <div class="cb-dot"></div>
          <div class="cb-name">${escapeHtml(config.botName)}</div>
          <button id="__chatbot_reset__" aria-label="New conversation" title="New conversation">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
            </svg>
          </button>
          <button id="__chatbot_close__" aria-label="Close chat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        <div id="__chatbot_messages__"></div>

        <div id="__chatbot_input_area__">
          <textarea
            id="__chatbot_input__"
            placeholder="Type a message…"
            rows="1"
            aria-label="Chat message"
          ></textarea>
          <button id="__chatbot_send__" disabled aria-label="Send message">
            <svg viewBox="0 0 24 24"><path d="M2 12L22 2 12 22l-2-7-8-3z"/></svg>
          </button>
        </div>

        <div id="__chatbot_branding__">Powered by ZM</div>
      </div>
    `;

    document.body.appendChild(root);

    // Wire up events
    document.getElementById('__chatbot_btn__').addEventListener('click', toggleWindow);
    document.getElementById('__chatbot_close__').addEventListener('click', closeWindow);
    document.getElementById('__chatbot_reset__').addEventListener('click', resetConversation);

    const input = document.getElementById('__chatbot_input__');
    const sendBtn = document.getElementById('__chatbot_send__');

    input.addEventListener('input', () => {
      sendBtn.disabled = !input.value.trim() || isLoading;
      // Auto-resize textarea
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!sendBtn.disabled) sendMessage();
      }
    });

    sendBtn.addEventListener('click', sendMessage);
  }

  // ── Window open/close ─────────────────────────────────────────────────────
  function toggleWindow() {
    isOpen ? closeWindow() : openWindow();
  }

  function openWindow() {
    isOpen = true;
    document.getElementById('__chatbot_window__').classList.add('open');
    document.getElementById('__chatbot_btn__').innerHTML = `
      <svg viewBox="0 0 24 24" fill="white" width="22" height="22">
        <path d="M18 6L6 18M6 6l12 12" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
      </svg>`;

    if (messages.length === 0) {
      addMessage('assistant', config.welcomeMessage);
    }

    setTimeout(() => document.getElementById('__chatbot_input__').focus(), 200);
  }

  function closeWindow() {
    isOpen = false;
    document.getElementById('__chatbot_window__').classList.remove('open');
    document.getElementById('__chatbot_btn__').innerHTML = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="white">
        <path d="M20 2H4a2 2 0 00-2 2v12a2 2 0 002 2h4l4 4 4-4h4a2 2 0 002-2V4a2 2 0 00-2-2z"/>
      </svg>`;
  }

  function resetConversation() {
    if (isLoading) return;
    messages.length = 0;
    document.getElementById('__chatbot_messages__').innerHTML = '';
    addMessage('assistant', config.welcomeMessage);
  }

  // ── Message rendering ─────────────────────────────────────────────────────
  function addMessage(role, content) {
    messages.push({ role, content });
    renderMessage(role, content);
  }

  function renderMessage(role, content) {
    const container = document.getElementById('__chatbot_messages__');
    const wrapper = document.createElement('div');
    wrapper.className = `cb-msg ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'cb-bubble';
    bubble.textContent = content;
    wrapper.appendChild(bubble);
    container.appendChild(wrapper);
    scrollToBottom();
    return bubble;
  }

  function showTypingIndicator() {
    const container = document.getElementById('__chatbot_messages__');
    const wrapper = document.createElement('div');
    wrapper.className = 'cb-msg assistant';
    wrapper.id = '__chatbot_typing__';
    wrapper.innerHTML = `<div class="cb-typing"><span></span><span></span><span></span></div>`;
    container.appendChild(wrapper);
    scrollToBottom();
  }

  function removeTypingIndicator() {
    const el = document.getElementById('__chatbot_typing__');
    if (el) el.remove();
  }

  function scrollToBottom() {
    const container = document.getElementById('__chatbot_messages__');
    container.scrollTop = container.scrollHeight;
  }

  // ── Send message & stream response ────────────────────────────────────────
  async function sendMessage() {
    const input = document.getElementById('__chatbot_input__');
    const text = input.value.trim();
    if (!text || isLoading) return;

    input.value = '';
    input.style.height = 'auto';
    document.getElementById('__chatbot_send__').disabled = true;
    isLoading = true;

    addMessage('user', text);
    showTypingIndicator();

    try {
      const response = await fetch(`${SERVER_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: COMPANY_ID, messages }),
      });

      if (!response.ok) throw new Error('Server error');

      removeTypingIndicator();

      // Create an empty assistant bubble and stream text into it
      const bubble = renderMessage('assistant', '');
      let fullText = '';

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete last line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') break;

          try {
            const parsed = JSON.parse(payload);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.text) {
              fullText += parsed.text;
              bubble.textContent = fullText;
              scrollToBottom();
            }
          } catch (e) {
            if (e.message !== 'Unexpected end of JSON input') throw e;
          }
        }
      }

      // Check for handoff trigger and clean it from displayed text
      if (fullText.includes('[HANDOFF]')) {
        const cleanText = fullText.replace('[HANDOFF]', '').replace(/^\n+/, '').trim();
        bubble.textContent = cleanText;
        fullText = cleanText;
        triggerHandoff();
      }

      if (fullText) {
        messages.push({ role: 'assistant', content: fullText });
      }

    } catch (err) {
      removeTypingIndicator();
      addMessage('assistant', 'Sorry, something went wrong. Please try again in a moment.');
      console.error('[Chatbot]', err);
    } finally {
      isLoading = false;
      const inp = document.getElementById('__chatbot_input__');
      if (inp) {
        document.getElementById('__chatbot_send__').disabled = !inp.value.trim();
      }
    }
  }

  // ── Human handoff ─────────────────────────────────────────────────────────
  async function triggerHandoff() {
    try {
      await fetch(`${SERVER_URL}/api/handoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: COMPANY_ID, messages }),
      });
    } catch (e) {
      console.error('[Chatbot] Handoff failed:', e);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Boot sequence ─────────────────────────────────────────────────────────
  async function init() {
    // Fetch server-side public config (bot name, colors, welcome message)
    // Data attributes on the script tag can override these
    try {
      const res = await fetch(`${SERVER_URL}/api/config/${COMPANY_ID}`);
      if (res.ok) {
        const serverConfig = await res.json();
        // Script tag data attributes win over server config for visual settings
        config = {
          botName: scriptTag.dataset.botName || serverConfig.botName || config.botName,
          primaryColor: scriptTag.dataset.primaryColor || serverConfig.primaryColor || config.primaryColor,
          welcomeMessage: scriptTag.dataset.welcomeMessage || serverConfig.welcomeMessage || config.welcomeMessage,
          position: config.position,
        };
      }
    } catch {
      // Continue with defaults if server config fetch fails
    }

    injectStyles(config.primaryColor);
    buildUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
