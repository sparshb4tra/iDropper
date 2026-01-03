(function() {
  if (window._iDropper) return;
  window._iDropper = true;

  // ===== CONSTANTS =====
  const MAG_SIZE = 143;      // Magnifier diameter
  const GRID = 11;           // 11x11 cells
  const CELL = 13;           // Each cell is 13px
  const CENTER = 5;          // Center cell index

  // ===== STATE =====
  let active = false;
  let pixels = null;         // ImageData pixels array
  let imgW = 0, imgH = 0;    // Screenshot dimensions
  let scaleX = 1, scaleY = 1;

  // ===== DOM =====
  let overlay, mag, tip, cvs, ctx, cross, style;

  // ===== STYLES =====
  const CSS = `
    .idrop-overlay {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      z-index: 2147483646 !important;
      cursor: none !important;
    }
    .idrop-mag {
      position: fixed !important;
      width: 143px !important;
      height: 143px !important;
      border-radius: 50% !important;
      border: 3px solid #fff !important;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.25), 0 8px 24px rgba(0,0,0,0.35) !important;
      pointer-events: none !important;
      z-index: 2147483647 !important;
      overflow: hidden !important;
      background: #111 !important;
    }
    .idrop-mag canvas {
      display: block !important;
      border-radius: 50% !important;
    }
    .idrop-cross {
      position: absolute !important;
      top: 50% !important;
      left: 50% !important;
      width: 13px !important;
      height: 13px !important;
      margin: -6.5px 0 0 -6.5px !important;
      border: 2px solid #fff !important;
      box-shadow: inset 0 0 0 1px rgba(0,0,0,0.4), 0 0 0 1px rgba(0,0,0,0.4) !important;
      box-sizing: border-box !important;
      pointer-events: none !important;
    }
    .idrop-tip {
      position: fixed !important;
      padding: 5px 10px !important;
      background: rgba(20,20,20,0.9) !important;
      color: #fff !important;
      font: bold 11px Helvetica, Arial, sans-serif !important;
      border-radius: 4px !important;
      pointer-events: none !important;
      z-index: 2147483647 !important;
      display: flex !important;
      align-items: center !important;
      gap: 6px !important;
    }
    .idrop-tip-swatch {
      width: 12px !important;
      height: 12px !important;
      border-radius: 2px !important;
      border: 1px solid rgba(255,255,255,0.3) !important;
    }
    .idrop-hide-cursor, .idrop-hide-cursor * {
      cursor: none !important;
    }
  `;

  // ===== COLOR UTILS =====
  function hex(r, g, b) {
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  function hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  function hsb(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = max === 0 ? 0 : (max - min) / max;
    if (max !== min) {
      const d = max - min;
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), b: Math.round(max * 100) };
  }

  function cmyk(r, g, b) {
    if (r === 0 && g === 0 && b === 0) return { c: 0, m: 0, y: 0, k: 100 };
    const c = 1 - r / 255, m = 1 - g / 255, y = 1 - b / 255;
    const k = Math.min(c, m, y);
    return {
      c: Math.round((c - k) / (1 - k) * 100),
      m: Math.round((m - k) / (1 - k) * 100),
      y: Math.round((y - k) / (1 - k) * 100),
      k: Math.round(k * 100)
    };
  }

  // ===== PIXEL SAMPLING =====
  function sample(screenX, screenY) {
    // Map screen coords to image coords
    const ix = Math.round(screenX * scaleX);
    const iy = Math.round(screenY * scaleY);
    
    // Bounds check
    if (ix < 0 || iy < 0 || ix >= imgW || iy >= imgH) {
      return { r: 0, g: 0, b: 0 };
    }
    
    // Read from pixel array (RGBA format, 4 bytes per pixel)
    const i = (iy * imgW + ix) * 4;
    return { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] };
  }

  // ===== RENDERING =====
  function render(mx, my) {
    // Clear
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, MAG_SIZE, MAG_SIZE);

    // Circular clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(MAG_SIZE / 2, MAG_SIZE / 2, MAG_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();

    // Draw pixel grid
    let centerColor = { r: 0, g: 0, b: 0 };
    
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        // Calculate screen position for this cell
        // Center cell (5,5) = cursor position
        // Cell (0,0) = cursor position - 5 pixels
        const sx = mx + (col - CENTER);
        const sy = my + (row - CENTER);
        
        const c = sample(sx, sy);
        
        // Draw cell
        ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
        ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
        
        // Save center color
        if (col === CENTER && row === CENTER) {
          centerColor = c;
        }
      }
    }

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID; i++) {
      const p = i * CELL + 0.5;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, MAG_SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(MAG_SIZE, p);
      ctx.stroke();
    }

    ctx.restore();
    return centerColor;
  }

  // ===== POSITIONING =====
  function position(e) {
    const mx = e.clientX;
    const my = e.clientY;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const r = MAG_SIZE / 2;
    const gap = 25;

    // Default: bottom-right of cursor
    let x = mx + gap + r;
    let y = my + gap + r;

    // Flip if near edges
    if (x + r > vw - 5) x = mx - gap - r;
    if (y + r > vh - 5) y = my - gap - r;
    if (x - r < 5) x = r + 5;
    if (y - r < 5) y = r + 5;

    mag.style.left = (x - r) + 'px';
    mag.style.top = (y - r) + 'px';

    // Render magnifier and get center color
    const c = render(mx, my);
    const h = hex(c.r, c.g, c.b);

    // Update crosshair contrast
    const brightness = (c.r * 299 + c.g * 587 + c.b * 114) / 1000;
    cross.style.borderColor = brightness > 128 ? '#000' : '#fff';

    // Position tooltip below magnifier
    tip.innerHTML = `<span class="idrop-tip-swatch" style="background:${h}"></span>${h}`;
    tip.style.left = mx + 'px';
    tip.style.top = (y + r + 8) + 'px';
    tip.style.transform = 'translateX(-50%)';
  }

  // ===== EVENT HANDLERS =====
  function onMove(e) {
    position(e);
  }

  function onClick(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const c = sample(e.clientX, e.clientY);
    const h = hex(c.r, c.g, c.b);
    const hs = hsl(c.r, c.g, c.b);
    const hb = hsb(c.r, c.g, c.b);
    const cm = cmyk(c.r, c.g, c.b);

    chrome.runtime.sendMessage({
      action: 'saveColor',
      color: {
        hex: h,
        rgb: `rgb(${c.r}, ${c.g}, ${c.b})`,
        hsl: `hsl(${hs.h}, ${hs.s}%, ${hs.l}%)`,
        hsb: `hsb(${hb.h}, ${hb.s}%, ${hb.b}%)`,
        cmyk: `cmyk(${cm.c}%, ${cm.m}%, ${cm.y}%, ${cm.k}%)`
      }
    });

    destroy();
  }

  function onKey(e) {
    if (e.key === 'Escape') destroy();
  }

  // ===== LIFECYCLE =====
  function createUI() {
    style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    overlay = document.createElement('div');
    overlay.className = 'idrop-overlay';

    mag = document.createElement('div');
    mag.className = 'idrop-mag';

    cvs = document.createElement('canvas');
    cvs.width = MAG_SIZE;
    cvs.height = MAG_SIZE;
    ctx = cvs.getContext('2d');

    cross = document.createElement('div');
    cross.className = 'idrop-cross';

    tip = document.createElement('div');
    tip.className = 'idrop-tip';

    mag.appendChild(cvs);
    mag.appendChild(cross);
    document.body.appendChild(overlay);
    document.body.appendChild(mag);
    document.body.appendChild(tip);
    document.body.classList.add('idrop-hide-cursor');

    overlay.addEventListener('mousemove', onMove);
    overlay.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
  }

  function destroy() {
    if (!active) return;
    active = false;

    overlay?.removeEventListener('mousemove', onMove);
    overlay?.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKey);

    overlay?.remove();
    mag?.remove();
    tip?.remove();
    style?.remove();
    document.body.classList.remove('idrop-hide-cursor');

    pixels = null;
    overlay = mag = tip = cvs = ctx = cross = style = null;
  }

  async function start() {
    if (active) return;
    active = true;

    // Capture visible tab
    const dataUrl = await new Promise(r => 
      chrome.runtime.sendMessage({ action: 'captureTab' }, r)
    );

    // Load image
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = dataUrl; });

    // Store dimensions
    imgW = img.width;
    imgH = img.height;

    // Calculate scale: image pixels per screen pixel
    scaleX = imgW / window.innerWidth;
    scaleY = imgH / window.innerHeight;

    // Extract raw pixel data for fast access
    const tmp = document.createElement('canvas');
    tmp.width = imgW;
    tmp.height = imgH;
    const tctx = tmp.getContext('2d', { willReadFrequently: true });
    tctx.drawImage(img, 0, 0);
    pixels = tctx.getImageData(0, 0, imgW, imgH).data;

    // Create UI
    createUI();
  }

  // ===== MESSAGE LISTENER =====
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'pick') start();
  });
})();
