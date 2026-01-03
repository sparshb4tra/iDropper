# iDropper Check out the live demo [HERE](https://i-dropper.vercel.app/)




Eyedropper and color picker browser extension with magnified preview.

## Features

- Magnified eyedropper (11x11 pixel grid)
- Color formats: HEX, RGB, HSL, HSB, CMYK
- Click any value to copy
- Persistent color history (12 colors)
- Keyboard shortcut: Alt+E opens popup

## Installation

### Chrome / Edge / Brave

1. Go to chrome://extensions/
2. Enable Developer mode
3. Click Load unpacked
4. Select the iDropper folder

## Usage

1. Click iDropper icon or press Alt+E
2. Click Pick Color
3. Move cursor to any element
4. Click to capture color
5. Press Escape to cancel

## Files

```
manifest.json   - Extension manifest
background.js   - Service worker
content.js      - Eyedropper logic + styles
popup.html      - Popup UI + styles
popup.js        - Popup logic
icons/          - Extension icons
```

## License

MIT
