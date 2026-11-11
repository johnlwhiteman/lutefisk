// Device catalogue. Physical sizes (mm) and screen resolutions come from the
// manufacturers' published specifications so the frames render to scale.
// res = logical CSS pixels of the reading viewport (portrait).
// Frames are drawn with CSS only; no brand logos are reproduced.

const D = (o) => ({ grip: null, buttons: [], camera: null, eink: false, recessed: false, rim: null, ...o });

export const DEVICES = [
  // ---------------------------------------------------------------- Android
  D({ id: 'galaxy-s21', name: 'Galaxy S21', group: 'Android', kind: 'phone', ui: 'android', body: [71.2, 151.7], radius: 9.5,
    screen: [64.6, 143.6], screenRadius: 7.5, res: [360, 800], bezel: '#0b0b0c', rim: 'linear-gradient(135deg,#bfb6c9,#8c8496 45%,#d8d0e0 70%,#8e869a)',
    camera: { type: 'punch', x: 0.5, y: 0.018, d: 3.2 },
    buttons: [{ side: 'right', at: 0.33, len: 0.16 }, { side: 'right', at: 0.52, len: 0.08 }] }),
  D({ id: 'galaxy-tab-s7', name: 'Galaxy Tab S7', group: 'Android', kind: 'tablet', ui: 'android', body: [165.3, 253.8], radius: 9,
    screen: [148.1, 236.9], screenRadius: 2.5, res: [800, 1280], bezel: '#0d0d0f', rim: 'linear-gradient(135deg,#5b5f66,#2e3136 40%,#6b7078 70%,#33363b)',
    camera: { type: 'dot', side: 'right', at: 0.5, d: 1.6 },
    buttons: [{ side: 'right', at: 0.08, len: 0.06, edge: 'top' }, { side: 'top', at: 0.72, len: 0.1 }] }),
  // ------------------------------------------------------------------ Apple
  D({ id: 'ipad', name: 'iPad', group: 'Apple', kind: 'tablet', ui: 'ios', body: [179.5, 248.6], radius: 13,
    screen: [158.0, 227.4], screenRadius: 6.5, res: [820, 1180], bezel: '#0a0a0b', rim: 'linear-gradient(135deg,#e6e7ea,#b6b9bf 40%,#f1f2f4 65%,#a9acb2)',
    camera: { type: 'dot', side: 'right', at: 0.5, d: 1.8 },
    buttons: [{ side: 'top', at: 0.82, len: 0.09 }, { side: 'right', at: 0.12, len: 0.07 }, { side: 'right', at: 0.2, len: 0.07 }] }),
  D({ id: 'iphone', name: 'iPhone', group: 'Apple', kind: 'phone', ui: 'ios', body: [71.6, 147.6], radius: 11.5,
    screen: [64.9, 140.7], screenRadius: 9.6, res: [393, 852], bezel: '#050505', rim: 'linear-gradient(135deg,#8d8a86,#4b4946 40%,#a29e98 65%,#55524e)',
    camera: { type: 'island', x: 0.5, y: 0.016, w: 0.29, h: 0.026 },
    buttons: [{ side: 'left', at: 0.16, len: 0.05 }, { side: 'left', at: 0.25, len: 0.09 }, { side: 'left', at: 0.36, len: 0.09 }, { side: 'right', at: 0.27, len: 0.13 }] }),
  // ----------------------------------------------------------------- Kindle
  D({ id: 'kindle-fire', name: 'Kindle Fire', group: 'Kindle', kind: 'tablet', ui: 'fire', body: [164.8, 246], radius: 9,
    screen: [135.9, 217.5], screenRadius: 1, res: [800, 1280], bezel: '#111214', rim: 'linear-gradient(135deg,#2b2c2f,#151618)',
    camera: { type: 'dot', x: 0.5, y: 0.035, d: 2.2 },
    buttons: [{ side: 'top', at: 0.2, len: 0.06 }, { side: 'top', at: 0.3, len: 0.09 }] }),
  D({ id: 'kindle-oasis', name: 'Kindle Oasis', group: 'Kindle', kind: 'ereader', ui: 'kindle', eink: true, body: [141, 159], radius: 6,
    screen: [106.9, 142.1], screenOffset: [6.5, 8.4], screenRadius: 0.6, res: [632, 840], bezel: '#151617',
    rim: 'linear-gradient(135deg,#6a6c70,#3a3c40 45%,#76787d 70%,#3d3f43)',
    grip: { side: 'right', color: 'linear-gradient(90deg,#45474b,#5a5c60 40%,#3c3e42)', width: 27.6, buttons: 2 } }),
  D({ id: 'kindle-paperwhite', name: 'Kindle Paperwhite', group: 'Kindle', kind: 'ereader', ui: 'kindle', eink: true, body: [127.6, 176.7], radius: 7,
    screen: [106.9, 142.1], screenOffset: [10.35, 11.5], screenRadius: 0.6, res: [632, 840], bezel: '#16171a',
    rim: 'linear-gradient(135deg,#232427,#101113)' }),
  // ------------------------------------------------------------------- Kobo
  D({ id: 'kobo-clara', name: 'Kobo Clara', group: 'Kobo', kind: 'ereader', ui: 'kobo', eink: true, body: [112, 159], radius: 6,
    screen: [90.65, 122.5], screenOffset: [10.7, 11.5], screenRadius: 0.6, res: [536, 724], bezel: '#18191b',
    rim: 'linear-gradient(135deg,#2a2b2e,#141517)', texture: 'dots' }),
  D({ id: 'kobo-forma', name: 'Kobo Forma', group: 'Kobo', kind: 'ereader', ui: 'kobo', eink: true, body: [160, 177.7], radius: 7,
    screen: [121.9, 162.6], screenOffset: [7.3, 7.6], screenRadius: 0.6, res: [720, 960], bezel: '#141517',
    rim: 'linear-gradient(135deg,#26272a,#121315)',
    grip: { side: 'right', color: 'linear-gradient(90deg,#1b1c1f,#2a2b2f 50%,#18191c)', width: 30.8, buttons: 2, ridge: true } }),
  D({ id: 'kobo-libra-h2o', name: 'Kobo Libra H2O', group: 'Kobo', kind: 'ereader', ui: 'kobo', eink: true, body: [144, 159], radius: 7,
    screen: [106.9, 142.1], screenOffset: [7.2, 8.4], screenRadius: 0.6, res: [632, 840], bezel: '#ecebe7',
    rim: 'linear-gradient(135deg,#ffffff,#d9d8d3)', light: true,
    grip: { side: 'right', color: 'linear-gradient(90deg,#e4e3de,#f4f3ef 50%,#dddcd6)', width: 29.9, buttons: 2 } }),
  D({ id: 'kobo-nia', name: 'Kobo Nia', group: 'Kobo', kind: 'ereader', ui: 'kobo', eink: true, recessed: true, body: [112.4, 159.3], radius: 6.5,
    screen: [90.65, 122.5], screenOffset: [10.9, 11], screenRadius: 0.3, res: [379, 512], bezel: '#1a1a1c',
    rim: 'linear-gradient(135deg,#2c2c2f,#161618)' }),
  // ------------------------------------------------------------------- Nook
  D({ id: 'nook-glowlight-3', name: 'Nook GlowLight 3', group: 'Nook', kind: 'ereader', ui: 'nook', eink: true, recessed: true, body: [127, 175.8], radius: 8,
    screen: [90.65, 122.5], screenOffset: [18.2, 17.5], screenRadius: 0.3, res: [536, 724], bezel: '#3f4042',
    rim: 'linear-gradient(135deg,#55575a,#2f3032)', sideButtons: true, home: true }),
  D({ id: 'nook-glowlight-plus', name: 'Nook GlowLight Plus', group: 'Nook', kind: 'ereader', ui: 'nook', eink: true, recessed: true, body: [145.5, 195.8], radius: 8,
    screen: [118.9, 158.5], screenOffset: [13.3, 13], screenRadius: 0.3, res: [702, 936], bezel: '#2a2b2d',
    rim: 'linear-gradient(135deg,#3b3c3f,#1f2022)', sideButtons: true, home: true }),
];

export const deviceById = (id) => DEVICES.find((d) => d.id === id) || DEVICES.find((d) => d.id === 'kindle-paperwhite');

export const DEVICE_GROUPS = [...new Set(DEVICES.map((d) => d.group))];
