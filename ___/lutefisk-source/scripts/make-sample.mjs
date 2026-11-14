// Creates a sample book folder (used for the screenshots and tests).
// Usage: node scripts/make-sample.mjs <targetDir> [imagesDir]
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { defaultBook, ensureSections, DEFAULT_CONTENT } from '../src/shared/sections.js';
import { serializeBook } from '../src/main/bookstore.js';

const dir = process.argv[2];
const imgs = process.argv[3];
if (!dir) { console.error('usage: make-sample.mjs <dir> [imagesDir]'); process.exit(1); }

const book = ensureSections(defaultBook({ title: 'The Lantern Road', subtitle: 'A Novella', author: 'Eliza Marrow' }));
book.uuid = '6f0e1c55-8a4b-4a52-9d3e-2b1f7c3a9e10';
book.publisher = 'Hollow Mill Press';
book.description = 'A lamplighter’s daughter walks the old mountain road to bring light back to her valley.';
book.keywords = ['fiction', 'fantasy', 'novella'];
book.template = 'classic';
book.cover = imgs ? 'assets/cover.jpg' : '';
book.authorPhoto = imgs ? 'assets/author.jpg' : '';
book.index = { terms: ['lantern', 'Hollow Mill', 'the Pass'] };
book.bibliography = [
  { id: 'ref-1', kind: 'book', authors: [{ family: 'Bringhurst', given: 'Robert' }], title: 'The Elements of Typographic Style', publisher: 'Hartley & Marks', date: '2004', edition: '3rd', accessed: '2026-11-09' },
  { id: 'ref-2', kind: 'webpage', authors: [{ literal: 'Smithsonian Institution' }], title: 'History of street lighting', container: 'Smithsonian Magazine', date: '2021-03-14', url: 'https://www.example.org/history-of-street-lighting', accessed: '2026-11-09' },
  { id: 'ref-3', kind: 'journal', authors: [{ family: 'Okafor', given: 'Amara N.' }, { family: 'Lind', given: 'Peter' }], title: 'Night, light, and rural memory', container: 'Journal of Folklore Studies', volume: '12', issue: '3', pages: '45–67', date: '2019', doi: '10.1234/jfs.2019.0345', accessed: '2026-11-09' },
];
const S = (type) => book.sections.find((s) => s.type === type);
for (const t of ['dedication', 'epigraph', 'prologue', 'epilogue', 'acknowledgments', 'bibliography', 'index', 'about-author']) S(t).enabled = true;
S('prologue').title = 'Prologue';
const ch1 = S('chapter');
ch1.title = 'The Last Lamp';
const ch2 = { id: 'cha-2b7d91e0', type: 'chapter', enabled: true, title: 'Hollow Mill' };
const ch3 = { id: 'cha-3c8ea2f1', type: 'chapter', enabled: true, title: 'The Pass' };
book.sections.splice(book.sections.indexOf(ch1) + 1, 0, ch2, ch3);

const p = (...xs) => xs.join('\n\n');
const contents = {};
for (const s of book.sections) contents[s.id] = DEFAULT_CONTENT[s.type] || '';
contents[S('dedication').id] = '*For my father, who kept the porch light on.*';
contents[S('epigraph').id] = '*Light thinks it travels faster than anything but it is wrong. No matter how fast light travels, it finds the darkness has always got there first.*\n\n— A traveler’s proverb';
contents[S('prologue').id] = p(
  'Long before the road had a name, the valley had its lamps. They stood at every crossing like patient sentries, iron posts with glass hearts, and every evening someone climbed a ladder to wake them.',
  'Nobody remembered who lit the first one. Everyone remembered who lit the last.');
contents[ch1.id] = p(
  'The lamplighter’s daughter woke before the birds, which was not unusual, and found the house cold, which was. Mara pulled her boots on in the dark and went down to the kitchen where her father’s ladder leaned against the wall like a sleeping animal.',
  '“You’re up early,” said her grandmother from the corner chair. She had not been asleep; she rarely was.',
  '“The lamps went out last night,” Mara said. “All of them. I watched from the window.”',
  'Her grandmother nodded slowly, as if Mara had remarked on the weather. “Then the oil has turned,” she said. “It happens once in a long life. Your great-grandfather saw it.”[^1]',
  'Outside, the valley lay under a darkness so complete that the hills had stopped being hills. Mara could hear the river but not see it. She lifted the old **brass lantern** from its hook and felt the familiar weight of it, the dry rattle of an empty reservoir.',
  '* * *',
  'By noon the village had gathered in the square. They argued in the way people argue when they are frightened: loudly, in circles, about the wrong things. The miller blamed the cold. The schoolteacher blamed the miller. Someone suggested prayer and someone else suggested that prayer had not filled a lamp in living memory.',
  'Mara stood at the edge of the crowd with the lantern at her feet and waited for her moment, which never came. So she made one.',
  '“There’s oil in Hollow Mill,” she said. “Clear oil. The old kind. Grandmother says so.”',
  'The square went quiet. Hollow Mill was three days’ walk over the Pass, and nobody had made the journey since the bridge fell.',
  '[^1]: Family records list the “Great Dimming” in the winter of the comet year; no other written account survives.');
contents[ch2.id] = p(
  'The road to Hollow Mill began politely, with hedges and milestones, and then forgot its manners. By the second morning it was little more than a suggestion through the heather.',
  '![A hand-drawn map of the road from the valley to Hollow Mill and the Pass](assets/map.png "The old road, as Mara remembered it"){width=80%}',
  'Mara walked with the lantern swinging at her hip, though it gave no light. It was company of a sort. She talked to it when the silence got too large: about her father, about the bridge, about whether *clear oil* was a real thing or just one of her grandmother’s stories.',
  'Hollow Mill, when she found it, was not a village at all but a single enormous building, its waterwheel stopped mid-turn as though someone had pressed pause on the world.',
  '“You’ve come for the oil,” said the woman at the door. It was not a question.',
  '* * *',
  'The miller of Hollow Mill was called Tamsin, and she had been waiting, she said, for eleven years.',
  '- Eleven winters of keeping the press clean.',
  '- Eleven springs of pressing seed that nobody came to collect.',
  '- Eleven summers of wondering whether the valley had forgotten.',
  '“We never forgot,” Mara said. “We just stopped believing.”');
contents[ch3.id] = p(
  'They crossed the Pass together, Mara and Tamsin and a mule named Patience who had none. The jars of clear oil clinked in their straw like small bells.',
  '> The mountain does not care who crosses it. That is the only kindness it offers.',
  'Snow came on the last afternoon, soft at first and then sideways. Mara filled the lantern with shaking hands and struck the match three times before it caught.',
  'The light, when it came, was not yellow. It was white, clean and steady, and it reached farther than any lantern had a right to. Below them, far down in the valley, someone saw it and lit a fire in answer.');
contents[S('epilogue').id] = 'Every evening now, someone climbs a ladder at each crossing. They use the clear oil sparingly. And on the longest night of the year, the whole valley walks up to the Pass with lanterns, so that anyone on the other side will know the way.';
contents[S('acknowledgments').id] = 'Thank you to the early readers who told me, kindly, which chapters were too long; to my editor, who told me, less kindly, which sentences were; and to the night-shift baker on Alder Street, whose window light kept me company through the last draft.';
contents[S('about-author').id] = 'Eliza Marrow grew up in a valley much like Mara’s and now lives somewhere with considerably more street lighting. *The Lantern Road* is her first book.';

mkdirSync(join(dir, 'chapters'), { recursive: true });
mkdirSync(join(dir, 'assets'), { recursive: true });
if (imgs) for (const f of ['cover.jpg', 'map.png', 'author.jpg']) if (existsSync(join(imgs, f))) copyFileSync(join(imgs, f), join(dir, 'assets', f));
writeFileSync(join(dir, 'book.yaml'), serializeBook(book));
for (const s of book.sections) writeFileSync(join(dir, 'chapters', `${s.id}.md`), contents[s.id] ?? '');
console.log('Sample book written to', dir);
