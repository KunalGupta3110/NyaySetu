/* ============================================================
   NyaySetu — AI Chat Assistant (chat.js)
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSendBtn');

  if (chatInput && sendBtn) {
    sendBtn.addEventListener('click', handleSend);
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    // Auto-resize textarea
    chatInput.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = (this.scrollHeight) + 'px';
      if (this.scrollHeight > 150) {
        this.style.overflowY = 'auto';
      } else {
        this.style.overflowY = 'hidden';
      }
    });
  }

  // Pre-fill from session storage if redirected
  const context = sessionStorage.getItem('chat_context');
  if (context && chatInput) {
    chatInput.value = context;
    sessionStorage.removeItem('chat_context');
    setTimeout(handleSend, 500);
  }
  
  // Setup sidebar topics (Suggested questions)
  document.querySelectorAll('.sidebar-topic, .topic-btn, .suggested-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const topic = btn.textContent.trim();
      if(chatInput) {
        chatInput.value = topic;
        handleSend();
      }
    });
  });
});

async function handleSend() {
  const chatInput = document.getElementById('chatInput');
  const chatMessages = document.getElementById('chatMessages');
  if (!chatInput || !chatMessages) return;

  const text = chatInput.value.trim();
  if (!text) return;

  chatInput.value = '';
  chatInput.style.height = 'auto';
  chatInput.disabled = true;
  document.getElementById('chatSendBtn').disabled = true;

  // 1. Add User Message
  appendMessage('user', text);

  // 2. Add AI Thinking State
  const thinkingId = 'thinking-' + Date.now();
  appendThinkingState(thinkingId);
  scrollToBottom();

  try {
    const baseUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:'
      ? 'http://localhost:5000' 
      : '';
      
    let attempts = 0;
    let success = false;
    let data = null;
    let response = null;

    while (attempts < 2 && !success) {
      try {
        response = await fetch(`${baseUrl}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            system: `You are NyaySetu AI, a professional legal assistant specializing in Indian law. Provide accurate, ethical, and helpful legal information while emphasizing that you are not a substitute for qualified legal counsel.

For every user query, structure your response in this exact professional format:

### Legal Analysis
Provide a clear, concise analysis of the legal issue.

### Applicable Laws
- List relevant Indian laws, acts, or sections (e.g., IPC Section 420, Consumer Protection Act 2019)
- Include specific citations where possible

### Recommended Actions
1. Numbered steps for immediate actions
2. Include timelines and priorities

### Available Remedies
- Bullet points of legal options available to the user
- Court procedures, ADR methods, etc.

### Important Considerations
- Time-sensitive aspects (statutes of limitation, notice periods)
- Potential risks or consequences
- When to consult a lawyer

### Disclaimer
This is general information only. Consult a qualified lawyer for personalized advice. NyaySetu is not liable for actions taken based on this information.

### Case Classification
[Legal Category] - [Brief Summary] - [Urgency Level: High/Medium/Low]`
          })
        });
        
        data = await response.json();
        if (!response.ok) throw new Error(data.error || 'API Error');
        success = true;
      } catch (err) {
        attempts++;
        if (attempts < 2) {
          const textEl = document.querySelector(`#${thinkingId} .thinking-text`);
          if (textEl) textEl.textContent = "The legal AI service is taking longer than expected. Retrying securely...";
          await new Promise(r => setTimeout(r, 1500));
        } else {
          throw err;
        }
      }
    }
    
    // Remove thinking state
    removeThinkingState(thinkingId);
    
    // 3. Render AI Response with streaming effect
    if (data.reply) {
      await streamAIResponse(data.reply);
    } else {
      throw new Error('Empty response');
    }

  } catch (err) {
    console.error('Chat Error:', err);
    removeThinkingState(thinkingId);
    appendMessage('ai', 'The legal AI service is experiencing high traffic or taking longer than expected. Please check your connection and try again.', true);
  } finally {
    chatInput.disabled = false;
    document.getElementById('chatSendBtn').disabled = false;
    chatInput.focus();
    scrollToBottom();
  }
}

function appendMessage(role, text, isError = false) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  const placeholder = document.getElementById('chatPlaceholder');
  if (placeholder) placeholder.remove();

  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-message ${role} animate-fade-up`;
  
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  if (role === 'user') {
    msgDiv.innerHTML = `
      <div class="msg-bubble user-bubble">${escHtml(text)}</div>
      <div class="msg-meta">${time}</div>
    `;
  } else {
    msgDiv.innerHTML = `
      <div class="msg-avatar">⚖️</div>
      <div class="msg-content">
        <div class="msg-bubble ai-bubble ${isError ? 'error-bubble' : ''}">
          ${isError ? `<div class="error-content">⚠️ ${text} <button class="btn btn-outline btn-sm mt-2" onclick="handleSend()">Retry</button></div>` : formatMarkdown(text)}
        </div>
        ${!isError ? generateInteractiveButtons() : ''}
        <div class="msg-meta">NyaySetu AI • ${time}</div>
      </div>
    `;
  }
  
  chatMessages.appendChild(msgDiv);
  
  if (role === 'ai' && !isError) {
    if (window.App && App.addActivity) {
      App.addActivity('chat', 'Chat with Legal AI');
      App.stats.chats++;
      App.saveStats();
    }
  }
}

function appendThinkingState(id) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  const placeholder = document.getElementById('chatPlaceholder');
  if (placeholder) placeholder.remove();

  const msgDiv = document.createElement('div');
  msgDiv.id = id;
  msgDiv.className = `chat-message ai animate-fade-in`;
  msgDiv.innerHTML = `
    <div class="msg-avatar">🤖</div>
    <div class="msg-content">
      <div class="msg-bubble ai-bubble thinking-bubble">
        <div class="thinking-text">Analyzing legal issue...</div>
        <div class="typing-dots"><span></span><span></span><span></span></div>
      </div>
    </div>
  `;
  chatMessages.appendChild(msgDiv);
  
  const texts = ["Analyzing legal issue...", "Checking BNS/IPC sections...", "Structuring legal response..."];
  let i = 0;
  msgDiv.thinkingInterval = setInterval(() => {
    i = (i + 1) % texts.length;
    const textEl = msgDiv.querySelector('.thinking-text');
    if (textEl) textEl.textContent = texts[i];
  }, 1500);
}

function removeThinkingState(id) {
  const el = document.getElementById(id);
  if (el) {
    clearInterval(el.thinkingInterval);
    el.remove();
  }
}

async function streamAIResponse(markdownText) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-message ai`;
  msgDiv.innerHTML = `
    <div class="msg-avatar">⚖️</div>
    <div class="msg-content">
      <div class="msg-bubble ai-bubble streaming"></div>
      <div class="msg-actions hidden">${generateInteractiveButtons()}</div>
      <div class="msg-meta">NyaySetu AI • ${time}</div>
    </div>
  `;
  chatMessages.appendChild(msgDiv);
  scrollToBottom();

  const bubble = msgDiv.querySelector('.msg-bubble');
  const actions = msgDiv.querySelector('.msg-actions');

  const tokens = markdownText.match(/\S+|\s+/g) || [];
  let currentHtml = '';
  
  for (let i = 0; i < tokens.length; i++) {
    currentHtml += tokens[i];
    bubble.innerHTML = formatMarkdown(currentHtml);
    if (i % 10 === 0) scrollToBottom();
    await new Promise(r => setTimeout(r, Math.random() * 20 + 10));
  }
  
  bubble.innerHTML = formatMarkdown(markdownText);
  bubble.classList.remove('streaming');
  actions.classList.remove('hidden');
  actions.classList.add('animate-fade-up');
  scrollToBottom();
}

function formatMarkdown(text) {
  let formatted = text.replace(/### \*\*(.*?)\*\*/g, '### $1') // Cleanup injected bold headers
    .replace(/### Smart Alert\s*\n(.*?)(?=\n###|$)/gs, '<div class="smart-alert-strip"><div class="alert-icon">🚨</div><div class="alert-content"><strong>Smart Alert</strong>$1</div><button class="btn btn-primary btn-sm" onclick="window.location.href=\'dashboard.html#lawyerMarketplace\'" style="white-space:nowrap">Protect Rights</button></div>')
    .replace(/### Case Summary\s*\n(.*?)(?=\n###|$)/gs, '<div class="case-summary-strip"><div class="summary-icon">📁</div><div class="summary-content"><strong>Case Summary Generated</strong>$1</div></div>')
    
    // Section Cards
    .replace(/### Simple Explanation/g, '<div class="legal-card-header explanation">✅ Simple Explanation</div>')
    .replace(/### Applicable Law/g, '<div class="legal-card-header law">📜 Applicable Law</div>')
    .replace(/### Step-by-Step Actions/g, '<div class="legal-card-header steps">📋 Step-by-Step Actions</div>')
    .replace(/### Your Options/g, '<div class="legal-card-header options">⚡ Your Options</div>')
    .replace(/### Time Limit/g, '<div class="legal-card-header urgency">⏰ Time Limit & Urgency</div>')
    .replace(/### Important Note/g, '<div class="legal-card-header note">⚠️ Important Note</div>')
    .replace(/### Main Answer/g, '') // Fallback cleanup
    
    // Basic Formatting
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n-\s(.*?)(?=\n|$)/g, '<br>• $1')
    .replace(/\n(\d+\.\s.*?)(?=\n|$)/g, '<br><strong style="color:var(--text-primary)">$1</strong>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>').replace(/$/, '</p>');
    
  return formatted.replace(/<p><\/p>/g, '').replace(/<br><br>/g, '<br>');
}

function generateInteractiveButtons() {
  return `
    <div class="ai-interactive-btns">
      <button class="btn btn-primary btn-sm" onclick="window.location.href='dashboard.html#lawyerMarketplace'"><span style="font-size:14px">👨‍⚖️</span> Connect with a Lawyer</button>
      <button class="btn btn-outline btn-sm" onclick="window.location.href='documents.html'"><span style="font-size:14px">📄</span> Generate Legal Document</button>
      <button class="btn btn-ghost btn-sm" onclick="alert('Secure Evidence Vault opening soon')"><span style="font-size:14px">📤</span> Upload Evidence</button>
    </div>
  `;
}

function scrollToBottom() {
  const chatMessages = document.getElementById('chatMessages');
  if (chatMessages) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag])
  );
}

window.handleSend = handleSend;