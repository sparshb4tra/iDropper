document.addEventListener('DOMContentLoaded', async () => {
  const pick = document.getElementById('pick');
  const block = document.getElementById('block');
  const values = document.getElementById('values');
  const history = document.getElementById('history');
  const clear = document.getElementById('clear');
  const toast = document.getElementById('toast');
  const expanded = document.getElementById('expanded');
  const expandedColor = document.getElementById('expandedColor');
  const closeExpanded = document.getElementById('closeExpanded');
  const sliderR = document.getElementById('sliderR');
  const sliderG = document.getElementById('sliderG');
  const sliderB = document.getElementById('sliderB');
  const sliderA = document.getElementById('sliderA');
  const valR = document.getElementById('valR');
  const valG = document.getElementById('valG');
  const valB = document.getElementById('valB');
  const valA = document.getElementById('valA');
  const rgbaOutput = document.getElementById('rgbaOutput');
  const rgbaVal = document.getElementById('rgbaVal');

  let currentRgb = { r: 128, g: 128, b: 128 };

  async function load() {
    const data = await chrome.runtime.sendMessage({ action: 'getHistory' });
    if (data?.current) showColor(data.current);
    showHistory(data?.history || []);
  }

  function parseRgb(str) {
    const m = str.match(/(\d+)/g);
    if (m && m.length >= 3) {
      return { r: parseInt(m[0]), g: parseInt(m[1]), b: parseInt(m[2]) };
    }
    return null;
  }

  function showColor(c) {
    block.style.background = c.hex;
    block.classList.add('has-color');
    values.querySelector('[data-key="hex"] .val').textContent = c.hex;
    values.querySelector('[data-key="rgb"] .val').textContent = c.rgb;
    values.querySelector('[data-key="hsl"] .val').textContent = c.hsl;
    values.querySelector('[data-key="hsb"] .val').textContent = c.hsb;
    values.querySelector('[data-key="cmyk"] .val').textContent = c.cmyk;
    
    const rgb = parseRgb(c.rgb);
    if (rgb) {
      currentRgb = rgb;
      sliderR.value = rgb.r;
      sliderG.value = rgb.g;
      sliderB.value = rgb.b;
      valR.textContent = rgb.r;
      valG.textContent = rgb.g;
      valB.textContent = rgb.b;
      updateExpandedColor();
    }
  }

  function updateExpandedColor() {
    const r = parseInt(sliderR.value);
    const g = parseInt(sliderG.value);
    const b = parseInt(sliderB.value);
    const a = parseInt(sliderA.value) / 100;
    
    valR.textContent = r;
    valG.textContent = g;
    valB.textContent = b;
    valA.textContent = sliderA.value + '%';
    
    const rgba = `rgba(${r}, ${g}, ${b}, ${a})`;
    expandedColor.style.background = rgba;
    rgbaVal.textContent = rgba;
    
    sliderA.style.setProperty('--current-color', `rgb(${r}, ${g}, ${b})`);
  }

  function showHistory(h) {
    if (!h.length) {
      history.innerHTML = '<div class="empty">No colors yet</div>';
      return;
    }
    history.innerHTML = h.map(c => 
      `<div class="history-item" style="background:${c.hex}" data-color='${JSON.stringify(c)}'></div>`
    ).join('');
    history.querySelectorAll('.history-item').forEach(el => {
      el.onclick = () => {
        const c = JSON.parse(el.dataset.color);
        showColor(c);
        copy(c.hex);
      };
    });
  }

  function copy(text) {
    navigator.clipboard.writeText(text);
    toast.textContent = 'Copied: ' + text;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1500);
  }

  // Color block click - toggle expanded panel
  block.onclick = () => {
    if (expanded.classList.contains('show')) {
      expanded.classList.remove('show');
    } else {
      expanded.classList.add('show');
      updateExpandedColor();
    }
  };

  closeExpanded.onclick = (e) => {
    e.stopPropagation();
    expanded.classList.remove('show');
  };

  // Sliders
  sliderR.oninput = updateExpandedColor;
  sliderG.oninput = updateExpandedColor;
  sliderB.oninput = updateExpandedColor;
  sliderA.oninput = updateExpandedColor;

  // Copy RGBA
  rgbaOutput.onclick = () => {
    copy(rgbaVal.textContent);
  };

  pick.onclick = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    chrome.tabs.sendMessage(tab.id, { action: 'pick' });
    window.close();
  };

  values.querySelectorAll('.row').forEach(row => {
    row.onclick = () => {
      const val = row.querySelector('.val').textContent;
      if (val !== '-') copy(val);
    };
  });

  clear.onclick = () => {
    chrome.runtime.sendMessage({ action: 'clearHistory' });
    showHistory([]);
  };

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.current) showColor(changes.current.newValue);
    if (changes.history) showHistory(changes.history.newValue);
  });

  load();
});
