// Creates a sample screenplay project (used for screenshots and tests).
// Usage: node scripts/make-sample-screenplay.mjs <targetDir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('usage: make-sample-screenplay.mjs <dir>'); process.exit(1); }

const scenes = [];
const loc = ['VALLEY ROAD', 'KITCHEN', 'TOWN SQUARE', 'MOUNTAIN PASS', 'HOLLOW MILL', 'MILL - PRESS ROOM'];
for (let i = 0; i < 18; i++) {
  const l = loc[i % loc.length];
  scenes.push(`${i % 3 === 0 ? 'EXT.' : 'INT.'} ${l} - ${i % 2 ? 'NIGHT' : 'DAY'}

= Mara pushes on toward the mill.

Wind worries the shutters. Somewhere a dog barks twice and thinks better of it. MARA (17), wrapped in her father's coat, studies the dark ridge.

MARA
(quietly)
If the lamps stay out another week, nobody will remember how to light them.

TAMSIN (60s)
They'll remember. People always remember the dark.

Mara lifts the lantern. It is still empty.

MARA
Then we'll make them remember the light.${i === 4 ? ' I know how this sounds. I know everyone in the square thinks I am a child with a story. But Grandmother saw it with her own eyes, and her father saw it before her, and there is a mill on the other side of that mountain that has been waiting eleven years for somebody stubborn enough to walk there. I am stubborn enough. I have always been stubborn enough. That is the one thing everybody in this valley agrees about me, so let it be useful for once. Let it carry me over the Pass and back again with enough clear oil to light every lamp from here to the river. And when I come back, and I will come back, I want every one of you standing in this square with your lamps cleaned and your wicks trimmed, because I am not carrying that oil across a mountain so it can sit in a cellar while you argue about whose turn it is. We light them together. Every crossing, every porch, every window that faces the road. So that the next person who walks out into the dark can look back and see the whole valley burning bright behind them, and know the way home.' : ''}
`);
  if (i === 2) scenes.push(`MARA
Are you coming?

TAMSIN ^
Not a chance.
`);
}
const script = `Title: The Lantern Road
Credit: Written by
Author: Eliza Marrow
Source: Based on the novella by Eliza Marrow
Draft date: First Draft — November 10, 2026
Contact:
    Hollow Mill Press
    eliza@example.com

FADE IN:

${scenes.join('\n')}
CUT TO BLACK.

> THE END <
`;
const yaml = `# Lutefisk screenplay manifest. The script lives in script.fountain
format: lutefisk/1
kind: screenplay
title: The Lantern Road
author: Eliza Marrow
uuid: 2d7c5a8e-9b1f-4c3d-8e2a-7f6b5c4d3e21
screenplay:
  format: feature
  sceneNumbers: true
  contd: true
  moreContd: true
preview:
  device: ipad
  fontSize: 100
  font: ""
  theme: light
research: []
goals: {}
sections: []
`;
mkdirSync(join(dir, 'research'), { recursive: true });
writeFileSync(join(dir, 'book.yaml'), yaml);
writeFileSync(join(dir, 'script.fountain'), script);
console.log('Sample screenplay written to', dir);
