// frontend/app-src/src/modules/aiMedia.js
// Voice assistant and camera/vision tools (AI photo captions and visual translations).

let isListening = false;
let recognition = null;

export function startVoiceInput({ currentCityName, itin, voiceOn, API, switchToView, addMsg, addTypingIndicator, _formatAiText, escapeHtml, showToast, speak }) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    addMsg('⚠️ Voice input not supported in this browser. Try Chrome!');
    return;
  }

  if (isListening) {
    recognition?.stop();
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'en-IN';
  recognition.continuous = false;
  recognition.interimResults = false;

  const btn = document.getElementById('btn-voice-input');

  recognition.onstart = () => {
    isListening = true;
    if (btn) {
      btn.textContent = '🔴 Listening...';
      btn.style.color = '#fca5a5';
      btn.style.borderColor = 'rgba(239,68,68,.4)';
    }
    showToast('🎤', 'Listening...', 'Speak your question now!', 3000);
  };

  recognition.onresult = async (event) => {
    const transcript = event.results[0][0].transcript;
    switchToView('chat-view', 2);
    addMsg(escapeHtml(transcript), false);
    const typing = addTypingIndicator();

    try {
      const text = await API.aiVoiceChat(
        transcript,
        currentCityName,
        itin.map((i) => i.name),
        ''
      );
      typing.remove();
      const cleaned = text
        ? escapeHtml(text)
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\*/g, '')
            .replace(/\n/g, ' ')
        : null;
      if (cleaned) {
        addMsg(cleaned);
        if (voiceOn && typeof speak === 'function') speak(cleaned);
      }
    } catch (_e) {
      typing.remove();
      addMsg('Sorry, I could not process that. Please try again!');
    }
  };

  recognition.onerror = (e) => {
    addMsg(`🎤 Voice error: ${e.error}. Try again!`);
  };

  recognition.onend = () => {
    isListening = false;
    if (btn) {
      btn.textContent = '🎤 Speak';
      btn.style.color = 'var(--purple)';
      btn.style.borderColor = 'rgba(167,139,250,.25)';
    }
  };

  recognition.start();
}

export async function handleCaption(event, { currentCityName, itin, API, switchToView, addMsg, addTypingIndicator, formatAiText }) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    switchToView('chat-view', 2);
    const src = ev.target.result;
    addMsg(
      `📸 <strong>Generating captions for your photo...</strong><br><img src="${src}" style="width:100%;max-height:200px;object-fit:contain;border-radius:10px;margin-top:6px">`
    );
    const match = src.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return;
    const [, meta, b64] = match;
    const stopName = itin[0]?.name || currentCityName;
    const typing = addTypingIndicator();
    try {
      const text = await API.aiCaption(b64, meta, currentCityName, stopName);
      typing.remove();
      if (text) {
        addMsg(`✨ <strong>Instagram Captions for ${stopName}</strong><br><br>${formatAiText(text)}`);
      }
    } catch (_e) {
      typing.remove();
      addMsg('⚠️ Could not generate captions. Try again!');
    }
  };
  reader.readAsDataURL(file);
}

export async function handleTranslate(event, { currentCityName, API, switchToView, addMsg, addTypingIndicator, formatAiText }) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    switchToView('chat-view', 2);
    const src = ev.target.result;
    addMsg(`🌐 <strong>Translating...</strong><br><img src="${src}" style="width:100%;max-height:180px;object-fit:contain;border-radius:10px;margin-top:6px">`);
    const match = src.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return;
    const [, meta, b64] = match;
    const typing = addTypingIndicator();
    try {
      const text = await API.aiTranslate(b64, meta, currentCityName);
      typing.remove();
      if (text) addMsg(formatAiText(text));
    } catch (_e) {
      typing.remove();
      addMsg('⚠️ Could not translate. Try a clearer photo with visible text!');
    }
  };
  reader.readAsDataURL(file);
}
