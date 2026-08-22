const form = document.querySelector('#downloadForm');
const input = document.querySelector('#urlInput');
const clearBtn = document.querySelector('#clearBtn');
const pasteBtn = document.querySelector('#pasteBtn');
const analyzeBtn = document.querySelector('#analyzeBtn');
const status = document.querySelector('#status');
const result = document.querySelector('#result');
const thumb = document.querySelector('#thumb');
const title = document.querySelector('#videoTitle');
const meta = document.querySelector('#videoMeta');
const list = document.querySelector('#formatList');
let currentData = null;
let activeTab = 'video';

function setStatus(text, type = '') {
  status.textContent = text;
  status.className = `status ${type}`;
}

function formatDuration(seconds) {
  if (!seconds) return '';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`;
}

function escapeHtml(value = '') {
  return value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
}

function renderFormats() {
  const formats = currentData?.formats?.[activeTab] || [];
  if (!formats.length) {
    list.innerHTML = `<div class="format-row"><span class="format-meta">No ${activeTab} formats were returned for this video.</span></div>`;
    return;
  }

  list.innerHTML = formats.map((f, index) => {
    const quality = activeTab === 'audio' ? `${Math.round(f.abr || 0) || 'Best'} kbps` : (f.resolution || `${f.height}p`);
    const detail = [f.ext.toUpperCase(), f.size, f.fps ? `${Math.round(f.fps)} FPS` : ''].filter(Boolean).join(' · ');
    return `<div class="format-row">
      <div class="format-left"><div class="quality">${escapeHtml(quality)}</div><div class="format-meta">${escapeHtml(detail)}</div></div>
      <button class="row-download" data-index="${index}">Download</button>
    </div>`;
  }).join('');

  list.querySelectorAll('.row-download').forEach(button => {
    button.addEventListener('click', () => downloadFormat(formats[Number(button.dataset.index)]));
  });
}

async function downloadFormat(format) {
  const button = event?.currentTarget;
  if (button) { button.disabled = true; button.textContent = 'Preparing...'; }
  try {
    const response = await fetch('/api/download', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ url: input.value.trim(), format: format.id, mode: activeTab, title: currentData.title })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Download failed.');
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const filename = match?.[1] || `${currentData.title || 'youtube-video'}.${activeTab === 'audio' ? 'mp3' : 'mp4'}`;
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = objectUrl; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    setStatus('Download ready.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (button) { button.disabled = false; button.textContent = 'Download'; }
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const url = input.value.trim();
  if (!url) return setStatus('Paste a YouTube URL first.', 'error');
  analyzeBtn.disabled = true;
  analyzeBtn.innerHTML = '<span>Analyzing...</span><span>◌</span>';
  result.classList.add('hidden');
  setStatus('Checking the video and available formats...');
  try {
    const response = await fetch('/api/analyze', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({url})});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not analyze the link.');
    currentData = data;
    thumb.src = data.thumbnail || '';
    title.textContent = data.title || 'YouTube video';
    meta.textContent = [data.uploader, formatDuration(data.duration)].filter(Boolean).join(' · ');
    activeTab = 'video';
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === activeTab));
    renderFormats();
    result.classList.remove('hidden');
    result.scrollIntoView({behavior:'smooth', block:'center'});
    setStatus('Video analyzed. Choose a format below.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.innerHTML = '<span>Download</span><span>↓</span>';
  }
});

document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
  activeTab = tab.dataset.tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
  renderFormats();
}));

input.addEventListener('input', () => { clearBtn.hidden = !input.value; });
clearBtn.addEventListener('click', () => { input.value = ''; clearBtn.hidden = true; input.focus(); });
pasteBtn.addEventListener('click', async () => {
  try {
    input.value = await navigator.clipboard.readText();
    clearBtn.hidden = !input.value;
    input.focus();
    setStatus('Link pasted. Press Download to analyze it.');
  } catch {
    input.focus();
    setStatus('Clipboard access was blocked. Paste the link manually.');
  }
});
