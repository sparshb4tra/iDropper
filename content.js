(function() {
  if (window._iDropper) return;
  window._iDropper = true;

  // ===== STATE =====
  let active = false;
  let pixels = null;
  let imgW = 0, imgH = 0;
  let scaleX = 1, scaleY = 1;

  // ===== DOM =====
  let ui, overlay, hud, swatch, hexText, style;
  let mag, magCanvas, magCtx, magCross, tinyCanvas, tinyCtx, tinyData;
  let rafPending = false, lastX = 0, lastY = 0;

  const CSS = `
    #idrop-ui { position: fixed; inset: 0; z-index: 2147483647; cursor: crosshair !important; pointer-events: none; }
    .idrop-overlay { position: fixed; inset: 0; pointer-events: all; background: transparent; cursor: crosshair !important; }
    
    .idrop-hud {
      position: fixed;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 8px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.4);
      pointer-events: none;
      transform: translate(20px, 20px);
    }

    .idrop-swatch {
      width: 24px;
      height: 24px;
      border-radius: 4px;
      border: 1px solid rgba(255,255,255,0.1);
    }

    .idrop-hex {
      font: bold 14px 'Helvetica Neue', Helvetica, Arial, sans-serif;
      color: #fff;
      letter-spacing: 0.5px;
    }

    /* Magnifier */
    .idrop-mag {
      position: fixed;
      width: 140px;
      height: 140px;
      border-radius: 50%;
      border: 3px solid rgba(255,255,255,0.9);
      background: #111;
      overflow: hidden;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.25), 0 10px 26px rgba(0,0,0,0.35);
      pointer-events: none;
    }
    .idrop-mag canvas {
      width: 100%;
      height: 100%;
      image-rendering: pixelated;
      display: block;
    }
    .idrop-mag-cross {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 13px;
      height: 13px;
      transform: translate(-50%, -50%);
      border: 2px solid #fff;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.55);
      box-sizing: border-box;
      border-radius: 1px;
      pointer-events: none;
    }

    /* Precision Crosshair */
    .idrop-cursor-v, .idrop-cursor-h {
      position: fixed;
      background: #fff;
      pointer-events: none;
      mix-blend-mode: difference;
      box-shadow: 0 0 1px rgba(0,0,0,0.5);
    }
    .idrop-cursor-v { width: 1px; height: 30px; transform: translate(-0.5px, -15px); }
    .idrop-cursor-h { width: 30px; height: 1px; transform: translate(-15px, -0.5px); }

    /* Click Ping Animation */
    @keyframes idrop-ping {
      0% { transform: scale(0.5); opacity: 1; }
      100% { transform: scale(2.5); opacity: 0; }
    }
    .idrop-ping {
      position: fixed;
      width: 40px;
      height: 40px;
      border: 2px solid #E85D4C;
      border-radius: 50%;
      pointer-events: none;
      animation: idrop-ping 0.4s ease-out forwards;
      z-index: 2147483647;
    }
  `;

  // ===== UTILS =====
  function getHex(r, g, b) {
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  function rgbToHsl(r, g, b) {
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

  function rgbToHsb(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const v = max;
    const d = max - min;
    const s = max === 0 ? 0 : d / max;
    let h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), b: Math.round(v * 100) };
  }

  function rgbToCmyk(r, g, b) {
    if (r === 0 && g === 0 && b === 0) return { c: 0, m: 0, y: 0, k: 100 };
    const c = 1 - r / 255, m = 1 - g / 255, y = 1 - b / 255;
    const k = Math.min(c, m, y);
    return {
      c: Math.round(((c - k) / (1 - k)) * 100),
      m: Math.round(((m - k) / (1 - k)) * 100),
      y: Math.round(((y - k) / (1 - k)) * 100),
      k: Math.round(k * 100)
    };
  }

  function pickBestViewportBase(imageW, imageH) {
    const innerW = window.innerWidth;
    const innerH = window.innerHeight;
    const clientW = document.documentElement.clientWidth;
    const clientH = document.documentElement.clientHeight;

    const options = [
      { w: innerW, h: innerH },
      { w: clientW, h: clientH },
      { w: innerW, h: clientH },
      { w: clientW, h: innerH }
    ].filter(o => o.w > 0 && o.h > 0);

    let best = options[0];
    let bestErr = Infinity;
    for (const o of options) {
      const sx = imageW / o.w;
      const sy = imageH / o.h;
      const err = Math.abs(sx - sy);
      if (err < bestErr) {
        bestErr = err;
        best = o;
      }
    }
    return best;
  }

  function clamp(n, lo, hi) {
    return n < lo ? lo : (n > hi ? hi : n);
  }

  function sample(x, y) {
    // Nearest-pixel mapping (avoids half-pixel drift)
    const ix = clamp(Math.floor(x * scaleX + 0.5), 0, imgW - 1);
    const iy = clamp(Math.floor(y * scaleY + 0.5), 0, imgH - 1);
    const i = (iy * imgW + ix) * 4;
    return [pixels[i], pixels[i + 1], pixels[i + 2]];
  }

  // ===== CORE =====
  function drawFrame(mx, my) {
    const [r, g, b] = sample(mx, my);
    const hex = getHex(r, g, b);

    // Update HUD
    hud.style.left = mx + 'px';
    hud.style.top = my + 'px';
    swatch.style.background = hex;
    hexText.textContent = hex;

    // Update Crosshair
    const v = ui.querySelector('.idrop-cursor-v');
    const h = ui.querySelector('.idrop-cursor-h');
    v.style.left = h.style.left = mx + 'px';
    v.style.top = h.style.top = my + 'px';

    // Update magnifier position (avoid covering cursor)
    const gap = 18;
    const radius = 70;
    let magX = mx + gap + radius;
    let magY = my + gap + radius;
    if (magX + radius > window.innerWidth - 6) magX = mx - gap - radius;
    if (magY + radius > window.innerHeight - 6) magY = my - gap - radius;
    if (magX - radius < 6) magX = radius + 6;
    if (magY - radius < 6) magY = radius + 6;
    mag.style.left = (magX - radius) + 'px';
    mag.style.top = (magY - radius) + 'px';

    // Render magnifier pixels (11x11 around cursor)
    // Fill tinyData as raw 11x11 RGB pixels and upscale to 140x140
    let p = 0;
    for (let yy = -5; yy <= 5; yy++) {
      for (let xx = -5; xx <= 5; xx++) {
        const c = sample(mx + xx, my + yy);
        tinyData[p++] = c[0];
        tinyData[p++] = c[1];
        tinyData[p++] = c[2];
        tinyData[p++] = 255;
      }
    }
    tinyCtx.putImageData(tinyCtx.__imgData, 0, 0);
    magCtx.imageSmoothingEnabled = false;
    magCtx.clearRect(0, 0, 140, 140);
    magCtx.drawImage(tinyCanvas, 0, 0, 11, 11, 0, 0, 140, 140);

    // Contrast for center box
    const bright = (r * 299 + g * 587 + b * 114) / 1000;
    magCross.style.borderColor = bright > 128 ? '#000' : '#fff';
  }

  function schedule(mx, my) {
    lastX = mx; lastY = my;
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      if (!active) return;
      drawFrame(lastX, lastY);
    });
  }

  function update(e) {
    schedule(e.clientX, e.clientY);
  }

  function onClick(e) {
    const mx = e.clientX, my = e.clientY;
    const [r, g, b] = sample(mx, my);
    const hex = getHex(r, g, b);
    const hsl = rgbToHsl(r, g, b);
    const hsb = rgbToHsb(r, g, b);
    const cmyk = rgbToCmyk(r, g, b);

    // Visual confirmation
    const ping = document.createElement('div');
    ping.className = 'idrop-ping';
    ping.style.left = (mx - 20) + 'px';
    ping.style.top = (my - 20) + 'px';
    document.body.appendChild(ping);

    chrome.runtime.sendMessage({
      action: 'saveColor',
      color: {
        hex: hex,
        rgb: `rgb(${r}, ${g}, ${b})`,
        hsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
        hsb: `hsb(${hsb.h}, ${hsb.s}%, ${hsb.b}%)`,
        cmyk: `cmyk(${cmyk.c}%, ${cmyk.m}%, ${cmyk.y}%, ${cmyk.k}%)`
      }
    });

    setTimeout(stop, 150);
  }

  function stop() {
    active = false;
    ui?.remove();
    style?.remove();
    pixels = null;
    rafPending = false;
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) { if (e.key === 'Escape') stop(); }

  async function start() {
    if (active) return;
    active = true;

    const dataUrl = await new Promise(r => chrome.runtime.sendMessage({ action: 'captureTab' }, r));
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = dataUrl; });

    imgW = img.width; imgH = img.height;

    // Auto-calibrate mapping (scrollbars/zoom can make inner vs client differ)
    const base = pickBestViewportBase(imgW, imgH);
    scaleX = imgW / base.w;
    scaleY = imgH / base.h;

    const c = document.createElement('canvas');
    c.width = imgW; c.height = imgH;
    const t = c.getContext('2d', { willReadFrequently: true });
    t.drawImage(img, 0, 0);
    pixels = t.getImageData(0, 0, imgW, imgH).data;

    // UI Construction
    ui = document.createElement('div');
    ui.id = 'idrop-ui';
    
    style = document.createElement('style');
    style.textContent = CSS;
    
    overlay = document.createElement('div');
    overlay.className = 'idrop-overlay';
    
    // Magnifier
    mag = document.createElement('div');
    mag.className = 'idrop-mag';
    magCanvas = document.createElement('canvas');
    magCanvas.width = 140;
    magCanvas.height = 140;
    magCtx = magCanvas.getContext('2d');
    magCross = document.createElement('div');
    magCross.className = 'idrop-mag-cross';
    mag.append(magCanvas, magCross);

    // Tiny 11x11 offscreen buffer (reused every frame)
    tinyCanvas = document.createElement('canvas');
    tinyCanvas.width = 11;
    tinyCanvas.height = 11;
    tinyCtx = tinyCanvas.getContext('2d', { willReadFrequently: true });
    tinyCtx.__imgData = tinyCtx.createImageData(11, 11);
    tinyData = tinyCtx.__imgData.data;

    hud = document.createElement('div');
    hud.className = 'idrop-hud';
    swatch = document.createElement('div');
    swatch.className = 'idrop-swatch';
    hexText = document.createElement('div');
    hexText.className = 'idrop-hex';
    
    const cursorV = document.createElement('div');
    cursorV.className = 'idrop-cursor-v';
    const cursorH = document.createElement('div');
    cursorH.className = 'idrop-cursor-h';

    hud.append(swatch, hexText);
    ui.append(style, overlay, mag, hud, cursorV, cursorH);
    document.body.appendChild(ui);

    overlay.onmousemove = update;
    overlay.onclick = onClick;
    document.addEventListener('keydown', onKey);

    // Paint initial frame at center
    schedule(Math.floor(window.innerWidth / 2), Math.floor(window.innerHeight / 2));
  }

  chrome.runtime.onMessage.addListener((msg) => { if (msg.action === 'pick') start(); });
})();
