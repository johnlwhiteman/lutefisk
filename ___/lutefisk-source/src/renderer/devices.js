// Device catalog. Physical sizes (mm) and screen resolutions come from the
// manufacturers' published specifications so the frames render to scale.
// res = logical CSS pixels of the reading viewport (portrait).
// Frames are drawn with CSS only; no brand logos are reproduced.

const D = (o) => ({ grip: null, buttons: [], camera: null, eink: false, recessed: false, rim: null, ...o });

export const DEVICES = [
  // ------------------------------------------------------------------ Apple
  // iPad (A16, 2025): 179.5 × 248.6 mm, 11-inch 2360 × 1640 Liquid Retina.
  D({ id: 'ipad', name: 'iPad', group: 'Apple', kind: 'tablet', ui: 'ios', body: [179.5, 248.6], radius: 13,
    screen: [158.0, 227.4], screenRadius: 6.5, res: [820, 1180], bezel: '#0a0a0b', rim: 'linear-gradient(135deg,#e6e7ea,#b6b9bf 40%,#f1f2f4 65%,#a9acb2)',
    camera: { type: 'dot', side: 'right', at: 0.5, d: 1.8 },
    buttons: [{ side: 'top', at: 0.82, len: 0.09 }, { side: 'right', at: 0.12, len: 0.07 }, { side: 'right', at: 0.2, len: 0.07 }] }),
  // iPhone 17 (2025): 71.5 × 149.6 mm, 6.3-inch 1206 × 2622 (402 × 874 points).
  D({ id: 'iphone', name: 'iPhone', group: 'Apple', kind: 'phone', ui: 'ios', body: [71.5, 149.6], radius: 11.5,
    screen: [66.6, 144.7], screenRadius: 9.8, res: [402, 874], bezel: '#050505', rim: 'linear-gradient(135deg,#c9c5d8,#8e8a9c 40%,#d8d4e4 65%,#8a8698)',
    camera: { type: 'island', x: 0.5, y: 0.016, w: 0.29, h: 0.026 },
    buttons: [{ side: 'left', at: 0.16, len: 0.05 }, { side: 'left', at: 0.25, len: 0.09 }, { side: 'left', at: 0.36, len: 0.09 }, { side: 'right', at: 0.27, len: 0.13 }, { side: 'right', at: 0.62, len: 0.06 }] }),
  // ---------------------------------------------------------------- Android
  // Galaxy S26 (2026): 71.7 × 149.6 mm, 6.3-inch 1080 × 2340.
  D({ id: 'galaxy-s26', name: 'Galaxy S26', group: 'Android', kind: 'phone', ui: 'android', body: [71.7, 149.6], radius: 10,
    screen: [67.1, 145.3], screenRadius: 8, res: [360, 780], bezel: '#0b0b0c', rim: 'linear-gradient(135deg,#d6d8dc,#9a9da3 45%,#e4e6e9 70%,#a0a3a8)',
    camera: { type: 'punch', x: 0.5, y: 0.02, d: 3.0 },
    buttons: [{ side: 'right', at: 0.27, len: 0.13 }, { side: 'right', at: 0.44, len: 0.07 }] }),
  // Galaxy Tab S11 (2025): 165.3 × 253.8 mm, 11-inch 1600 × 2560.
  D({ id: 'galaxy-tab-s11', name: 'Galaxy Tab S11', group: 'Android', kind: 'tablet', ui: 'android', body: [165.3, 253.8], radius: 9,
    screen: [148.1, 236.9], screenRadius: 3, res: [800, 1280], bezel: '#0d0d0f', rim: 'linear-gradient(135deg,#5b5f66,#2e3136 40%,#6b7078 70%,#33363b)',
    camera: { type: 'punch', side: 'right', at: 0.5, d: 1.8 },
    buttons: [{ side: 'top', at: 0.72, len: 0.1 }, { side: 'top', at: 0.86, len: 0.06 }] }),
  // ----------------------------------------------------------------- Kindle
  // Kindle (2024): 108.6 × 157.8 mm, 6-inch 1072 × 1448 at 300 ppi, recessed screen.
  D({ id: 'kindle-basic', name: 'Kindle Basic', group: 'Kindle', kind: 'ereader', ui: 'kindle', eink: true, recessed: true, body: [108.6, 157.8], radius: 6.5,
    screen: [90.8, 122.6], screenOffset: [8.9, 14.6], screenRadius: 0.3, res: [536, 724], bezel: '#1a1b1d',
    rim: 'linear-gradient(135deg,#2c2d30,#151618)' }),
  // Kindle Paperwhite (2024): 127.6 × 176.7 mm, 7-inch 1264 × 1680 at 300 ppi, flush front.
  D({ id: 'kindle-paperwhite', name: 'Kindle Paperwhite', group: 'Kindle', kind: 'ereader', ui: 'kindle', eink: true, body: [127.6, 176.7], radius: 7,
    screen: [107.0, 142.2], screenOffset: [10.3, 11.5], screenRadius: 0.6, res: [632, 840], bezel: '#16171a',
    rim: 'linear-gradient(135deg,#232427,#101113)' }),
  // Kindle Scribe (2025): 189 × 245 mm, 11-inch 300 ppi, even borders.
  D({ id: 'kindle-scribe', name: 'Kindle Scribe', group: 'Kindle', kind: 'ereader', ui: 'kindle', eink: true, body: [189, 245], radius: 8,
    screen: [168.1, 224.2], screenOffset: [10.45, 10.4], screenRadius: 0.6, res: [993, 1324], bezel: '#2a2b2e',
    rim: 'linear-gradient(135deg,#4a4c50,#2a2b2e 45%,#55575b 70%,#2c2d30)' }),
];

/** Old device choices map to the nearest device still offered. */
const RENAMED = { 'galaxy-s21': 'galaxy-s26', 'galaxy-tab-s7': 'galaxy-tab-s11', 'kindle-fire': 'galaxy-tab-s11', 'kindle-oasis': 'kindle-paperwhite', 'kobo-clara': 'kindle-basic', 'kobo-nia': 'kindle-basic', 'kobo-forma': 'kindle-scribe', 'kobo-libra-h2o': 'kindle-paperwhite', 'nook-glowlight-3': 'kindle-basic', 'nook-glowlight-plus': 'kindle-paperwhite' };

export const deviceById = (id) => DEVICES.find((d) => d.id === (RENAMED[id] || id)) || DEVICES.find((d) => d.id === 'kindle-paperwhite');

export const DEVICE_GROUPS = [...new Set(DEVICES.map((d) => d.group))];
