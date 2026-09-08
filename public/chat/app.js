const DEFAULT_MODELS = {
  gemini: 'gemini-flash-latest',
  openai: 'gpt-4o-mini',
  'openai-compat': 'gpt-4o-mini',
};

let history = [];

const providerSelect = document.getElementById('provider-select');
const modelInput = document.getElementById('model-input');
const chatContainer = document.getElementById('chat-container');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');

function updateDefaultModel() {
  const provider = providerSelect.value;
  modelInput.value = DEFAULT_MODELS[provider] || '';
}

providerSelect.addEventListener('change', updateDefaultModel);
updateDefaultModel();

function appendMessage(role, text) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.textContent = text;
  chatContainer.appendChild(div);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  return div;
}

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;

  const provider = providerSelect.value;
  const model = modelInput.value.trim();

  appendMessage('user', text);
  messageInput.value = '';
  sendBtn.disabled = true;

  const loadingMsg = appendMessage('system', 'กำลังคิด...');

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: text,
        history,
        provider,
        model: model || undefined,
      }),
    });

    chatContainer.removeChild(loadingMsg);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'เกิดข้อผิดพลาดในการส่งข้อความ' }));
      appendMessage('assistant', `Error (${res.status}): ${err.error || 'Server error'}`);
      return;
    }

    const data = await res.json();
    appendMessage('assistant', data.reply || '(ไม่มีข้อความตอบกลับ)');

    // Update local client history
    history.push({ role: 'user', content: text });
    history.push({ role: 'assistant', content: data.reply || '' });
  } catch (err) {
    chatContainer.removeChild(loadingMsg);
    appendMessage('assistant', `เกิดข้อผิดพลาดในการเชื่อมต่อ: ${err.message}`);
  } finally {
    sendBtn.disabled = false;
    messageInput.focus();
  }
});