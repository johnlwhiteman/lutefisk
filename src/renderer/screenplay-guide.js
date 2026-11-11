// Screenplay Guide: the parts of a screenplay, an annotated sample page, a
// step-by-step tutorial for Lutefisk, format conventions and shortcuts.
import { h, icon } from './ui.js';
import { layoutScript, pageHtml, SCRIPT_CSS, ELEMENT_LABELS } from '../shared/screenplay.js';

/** One-line explanations, also shown in the status bar while writing. */
export const ELEMENT_HELP = {
  scene: 'Where and when the scene happens — INT./EXT., LOCATION - DAY/NIGHT.',
  action: 'What the audience sees and hears, in present tense.',
  character: 'Who is speaking, in capitals. Add (V.O.) or (O.S.) when needed.',
  paren: 'A brief note on how a line is said, or a tiny action mid-speech.',
  dialogue: 'The words the character speaks.',
  transition: 'How we move to the next scene — CUT TO:, DISSOLVE TO:. Use sparingly.',
  shot: 'Points the camera at something specific — CLOSE ON, ANGLE ON. Use sparingly.',
  centered: 'Centered text such as THE END or an on-screen title.',
  act: 'Act break for TV scripts (TEASER, ACT ONE, END OF ACT ONE).',
  lyric: 'Song lyrics, in italics.',
  synopsis: 'A private summary of the scene. Never printed.',
  section: 'A private outline heading (Act One, Midpoint…). Never printed.',
  pagebreak: 'Forces a new page.',
};

const EX = (type, text, extra = {}) => ({ type, text, ...extra });
const SAMPLE = [
  EX('transition', 'FADE IN:'),
  EX('scene', 'EXT. LIGHTHOUSE - NIGHT'),
  EX('action', 'Waves hammer the rocks. A beam of light sweeps the fog.'),
  EX('action', 'NORA (40s), soaked, climbs the iron stairs with a toolbox.'),
  EX('character', 'NORA'),
  EX('paren', '(to herself)'),
  EX('dialogue', 'One bulb. Forty ships. No pressure.'),
  EX('character', 'RADIO (V.O.)'),
  EX('dialogue', 'Harbor to lighthouse. Do you copy?'),
  EX('shot', 'CLOSE ON THE LAMP'),
  EX('action', 'It flickers. Dies.'),
  EX('transition', 'CUT TO:'),
];

const ELEMENTS = [
  { t: 'scene', name: 'Scene Heading (slugline)', how: 'Type int. or ext. — Lutefisk turns it into a scene heading. Or press ⌘1.',
    body: ['Every new location or time begins a new scene, and every scene begins with a heading in capitals: INT. (interior) or EXT. (exterior), the location, then the time of day.', 'Keep locations consistent — if it is “MILL - PRESS ROOM” once, use the same words every time. Production schedules are built from these lines.', 'Use INT./EXT. when a scene moves between inside and outside (a car driving, a doorway).'],
    ex: [EX('scene', 'INT. KITCHEN - CONTINUOUS'), EX('scene', 'EXT. MOUNTAIN PASS - DAWN')] },
  { t: 'action', name: 'Action (description)', how: 'Enter after a scene heading. Or press ⌘2.',
    body: ['Describes what we see and hear, in the present tense. Write only what a camera could capture — not thoughts or backstory.', 'Keep paragraphs to three or four lines; white space keeps a script readable.', 'When a speaking character appears for the first time, write their NAME IN CAPITALS with an age: MARA (17).'],
    ex: [EX('action', 'MARA (17) bursts through the door, soaked. She drops the lantern. It does not break.')] },
  { t: 'character', name: 'Character', how: 'Tab from an empty Action line, or press ⌘3. SmartType suggests names you have used.',
    body: ['The name of the speaker, in capitals, centered over the dialogue.', 'Extensions in parentheses: (V.O.) voice-over — narration or a voice not in the scene; (O.S.) off-screen — in the scene but not visible; (CONT’D) — the same character continues after action. Lutefisk adds (CONT’D) automatically.'],
    ex: [EX('character', 'MARA (V.O.)'), EX('dialogue', 'I was seventeen the winter the lamps went out.')] },
  { t: 'paren', name: 'Parenthetical (wryly)', how: 'Type ( at the start of a dialogue line, Tab at the end of a speech, or ⌘4.',
    body: ['A short note under the character name: how a line is delivered, who it is addressed to, or a small action.', 'Use sparingly — actors and directors prefer to interpret the scene themselves. Never put long actions here; use an Action line instead.'],
    ex: [EX('character', 'GRANDMOTHER'), EX('paren', '(not looking up)'), EX('dialogue', 'You’re up early.')] },
  { t: 'dialogue', name: 'Dialogue', how: 'Enter after a Character. Or press ⌘5.',
    body: ['What the character says. It sits in a narrow column in the middle of the page.', 'Long speeches that cross a page break are split automatically with (MORE) at the bottom and NAME (CONT’D) at the top of the next page.'],
    ex: [EX('character', 'TAMSIN'), EX('dialogue', 'Eleven years I’ve kept this press clean. Eleven years nobody came.')] },
  { t: 'transition', name: 'Transition', how: 'Tab twice from an empty Action line, or ⌘6. SmartType lists common transitions.',
    body: ['Right-aligned instructions for moving between scenes: CUT TO:, DISSOLVE TO:, MATCH CUT TO:, SMASH CUT TO:.', 'Modern scripts use them rarely — a new scene heading already implies a cut. FADE IN: opens a script; FADE OUT. or CUT TO BLACK. often ends it.'],
    ex: [EX('transition', 'DISSOLVE TO:')] },
  { t: 'shot', name: 'Shot', how: 'Press ⌘7.',
    body: ['Points the camera at something specific: CLOSE ON, ANGLE ON, INSERT, POV, WIDE ON.', 'Use only when a detail is essential to the story. Choosing shots is the director’s job; too many reads as “directing on the page”.'],
    ex: [EX('shot', 'INSERT - THE LETTER'), EX('action', 'Three words, underlined twice: DON’T COME BACK.')] },
  { t: 'dual', name: 'Dual Dialogue', how: 'Put the cursor on the second Character and press ⌘D (or the dual-dialogue button).',
    body: ['Two characters speaking at the same time are printed side by side.'],
    ex: [EX('character', 'MARA'), EX('dialogue', 'We go tonight.'), EX('character', 'TAMSIN', { dual: true }), EX('dialogue', 'We wait for dawn.')] },
  { t: 'centered', name: 'Centered Text', how: 'Press ⌘8.', body: ['For THE END, on-screen titles, or a chapter-like card.'], ex: [EX('centered', 'THE END')] },
  { t: 'act', name: 'Act Break (TV)', how: 'Press ⌘9. In the TV format each act starts a new page.', body: ['Television scripts are divided into a TEASER (or COLD OPEN) and acts, each ending with END OF ACT ONE, and so on.'], ex: [EX('act', 'ACT ONE')] },
  { t: 'lyric', name: 'Lyrics', how: 'Choose Lyrics from the element menu.', body: ['Song lyrics sung by a character, shown in italics in the dialogue column.'], ex: [EX('character', 'MARA'), EX('lyric', 'Light the lamp and leave the door,')] },
  { t: 'synopsis', name: 'Synopsis & Section (never printed)', how: 'Edit synopses on Index Cards, or choose them from the element menu.', body: ['Private notes for planning: a synopsis summarizes a scene; a section marks a part of your outline. They appear on index cards and in the editor, but never in exports.'], ex: [] },
];

function miniPage(elements, { annotate = false, lines = 30, compact = false } = {}) {
  const lay = layoutScript(elements, { format: 'feature' });
  const page = lay.pages[0];
  const shown = page.lines.slice(0, lines);
  const rows = shown.length ? shown[shown.length - 1].row + 1 : 1;
  const top = compact ? 0.3 : lay.fmt.top;
  const fmt = { ...lay.fmt, top, h: Math.min(lay.fmt.h, top + rows / 6 + (compact ? 0.3 : 0.6)) };
  const wrap = h('div', { class: `guide-page${annotate ? ' annotated' : ''}` });
  wrap.innerHTML = pageHtml({ ...page, number: 1, lines: page.lines.slice(0, lines) }, fmt, { pageNumbers: false }); // trusted renderer
  if (annotate) {
    let prev = null;
    for (const line of page.lines.slice(0, lines)) {
      const p = line.parts[0];
      if (!p || p.type === prev) { prev = p?.type ?? prev; continue; }
      prev = p.type;
      wrap.append(h('div', { class: `guide-tag tag-${p.type}`, style: { top: `calc(${fmt.top}in + ${line.row} * (1in / 6))` } }, ELEMENT_LABELS[p.type] || p.type));
    }
  }
  return wrap;
}

export function openScreenplayGuide(sheet, { insertExample } = {}) {
  const content = h('div', { class: 'guide-content' });
  const topics = [
    { id: 'anatomy', label: 'Anatomy of a page', icon: 'script' },
    { id: 'elements', label: 'The elements', icon: 'doc' },
    { id: 'start', label: 'Write your first scene', icon: 'focus' },
    { id: 'format', label: 'Format & length', icon: 'print' },
    { id: 'keys', label: 'Keyboard', icon: 'textSize' },
  ];
  const nav = h('nav', { class: 'guide-nav' });
  const show = (id) => {
    for (const b of nav.children) b.classList.toggle('on', b.dataset.id === id);
    content.replaceChildren(...render(id));
    content.scrollTop = 0;
  };
  for (const t of topics) nav.append(h('button', { 'data-id': t.id, onclick: () => show(t.id) }, icon(t.icon, 16), t.label));

  function render(id) {
    switch (id) {
      case 'anatomy': return [
        h('h2', {}, 'Anatomy of a screenplay page'),
        h('p', {}, 'A screenplay is a blueprint for a film or episode. Its strict format lets everyone — actors, director, crew, producers — read it the same way, and makes one page equal roughly one minute of screen time. Lutefisk handles the format; you choose which element each line is.'),
        miniPage(SAMPLE, { annotate: true }),
        h('p', { class: 'hint' }, 'Each colored tag names the element on that line. Open “The elements” to learn what each one is for.'),
      ];
      case 'elements': return [
        h('h2', {}, 'The elements'),
        h('p', {}, 'Every paragraph in a screenplay is one of these elements. The element decides its position on the page and how it reads.'),
        ...ELEMENTS.map((e) => h('section', { class: 'guide-el' },
          h('div', { class: 'guide-el-text' }, h('h3', {}, e.name), ...e.body.map((p) => h('p', {}, p)), h('p', { class: 'guide-how' }, icon('textSize', 14), e.how)),
          e.ex.length ? miniPage(e.ex, { lines: 12, compact: true }) : null)),
      ];
      case 'start': {
        const steps = [
          ['Name it', 'Choose New Project → Screenplay. Fill in the Title Page view later — title, “Written by”, your contact details.'],
          ['Open with FADE IN:', 'New scripts start with FADE IN: already in place. Click the empty line below it.'],
          ['Set the scene', 'Type “int. ” — it becomes a Scene Heading. Pick or type a location, then “ - ” and a time like NIGHT. SmartType suggests both; press Enter or Tab to accept.'],
          ['Describe the action', 'Press Enter. You are now in Action. Describe what we see, in the present tense. Introduce new characters in CAPITALS with their age.'],
          ['Someone speaks', 'Press Enter, then Tab: you are in Character. Type the name (SmartType remembers it next time). Press Enter: you are in Dialogue.'],
          ['How it’s said', 'Need a delivery note? Type “(” at the start of the dialogue line, or press Tab at the end of a speech, for a Parenthetical.'],
          ['Back to action', 'Press Enter after dialogue to return to Action. Press Enter on an empty Character or Dialogue line to jump straight back to Action.'],
          ['Move on', 'Start the next scene with another “int.” or “ext.”. For a transition, press Tab twice on an empty Action line and pick CUT TO:.'],
          ['Shape the story', 'Use Index Cards to see every scene at a glance, write one-line synopses, and drag scenes into a better order.'],
          ['See it and share it', 'Click Preview to see real pages; Export for PDF, Final Draft, Fountain, Word or plain text.'],
        ];
        return [
          h('h2', {}, 'Write your first scene'),
          h('ol', { class: 'guide-steps' }, steps.map(([t, d]) => h('li', {}, h('b', {}, t), h('span', {}, d)))),
          insertExample ? h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', onclick: () => insertExample(SAMPLE.slice(1)) }, 'Insert an Example Scene'), h('span', { class: 'hint' }, 'Adds a short example at the end of your script — delete it any time.')) : null,
        ];
      }
      case 'format': return [
        h('h2', {}, 'Format & length'),
        h('table', { class: 'kv guide-kv' }, [
          ['Font', 'Courier 12 pt (Lutefisk uses Courier Prime) — gives about one minute per page'],
          ['Margins', '1.5″ left (for binding), 1″ right, top and bottom'],
          ['Scene Heading & Action', 'Full width from the left margin'],
          ['Character', 'About 3.5″ from the page edge'],
          ['Dialogue', 'A 3.5″-wide column starting 2.5″ from the edge'],
          ['Parenthetical', 'Starting 3″ from the edge'],
          ['Transition', 'Right-aligned'],
          ['Page numbers', 'Top right, starting on page 2; the title page is not numbered'],
          ['Scene numbers', 'Only in shooting scripts — turn on in Script settings'],
        ].map(([k, v]) => h('tr', {}, h('td', {}, h('b', {}, k)), h('td', {}, v)))),
        h('h3', {}, 'Typical lengths'),
        h('table', { class: 'kv guide-kv' }, [
          ['Feature film', '90–120 pages'], ['One-hour TV drama', '50–65 pages, with a teaser and 4–6 acts'], ['Half-hour comedy (single camera)', '25–35 pages'], ['Short film', '5–20 pages'],
        ].map(([k, v]) => h('tr', {}, h('td', {}, h('b', {}, k)), h('td', {}, v)))),
        h('h3', {}, 'Common conventions'),
        h('ul', { class: 'guide-list' },
          h('li', {}, h('b', {}, 'MONTAGE / SERIES OF SHOTS — '), 'write “MONTAGE - MARA PREPARES” as a scene heading, then short action lines, then “END MONTAGE.”'),
          h('li', {}, h('b', {}, 'INTERCUT — '), 'for phone calls between two places: give both scene headings, then the action line “INTERCUT - MARA / TAMSIN”.'),
          h('li', {}, h('b', {}, 'Sounds — '), 'important sounds are often written in capitals in action: A dog BARKS.'),
          h('li', {}, h('b', {}, 'CONTINUOUS / LATER — '), 'time words in scene headings when action flows directly or time has passed.'),
          h('li', {}, h('b', {}, 'Spec vs. shooting script — '), 'a spec script (written to sell) avoids camera directions and scene numbers; a shooting script adds them.')),
      ];
      default: return [
        h('h2', {}, 'Keyboard'),
        h('table', { class: 'kv guide-kv' }, [
          ['Enter', 'Next element (Scene → Action → … Character → Dialogue → Action)'],
          ['Tab / ⇧Tab', 'Change element (Action → Character → Transition → Scene Heading); at the end of dialogue, add a parenthetical'],
          ['Enter on an empty Character or Dialogue', 'Back to Action'],
          ['⇧Enter', 'Line break inside an element'],
          ['⌘1 … ⌘9', 'Scene Heading, Action, Character, Parenthetical, Dialogue, Transition, Shot, Centered, Act Break'],
          ['⌘D', 'Dual dialogue (on the second character)'],
          ['⌘B / ⌘I / ⌘U', 'Bold, italic, underline'],
          ['SmartType', '↑ ↓ to choose, Enter or Tab to accept, Esc to dismiss'],
          ['⌥⌘P', 'Show or hide the page preview'],
          ['⇧⌘F', 'Focus mode (Esc to exit)'],
          ['⌘+ / ⌘− / ⌘0', 'Text size'],
        ].map(([k, v]) => h('tr', {}, h('td', {}, h('kbd', {}, k)), h('td', {}, v)))),
        h('p', { class: 'hint' }, 'On Windows and Linux, use Ctrl in place of ⌘ and Alt in place of ⌥.'),
      ];
    }
  }
  show('anatomy');
  sheet('Screenplay Guide', h('div', { class: 'guide' }, h('style', {}, SCRIPT_CSS), nav, content), { wide: true });
}
