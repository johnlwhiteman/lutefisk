// Screenplay exporters: Final Draft (.fdx), Fountain (.fountain), Word (.docx)
// and plain text (.txt). PDF is rendered from the paginated preview.
import {
  Document, Packer, Paragraph, TextRun, AlignmentType, Header, PageNumber, SectionType,
} from 'docx';
import crypto from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';
import { parseFountain, writeFountain, parseInline, plain } from '../shared/fountain.js';
import { layoutScript, scriptText, formatById, SPECS } from '../shared/screenplay.js';

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const FDX_TYPE = {
  scene: 'Scene Heading', action: 'Action', character: 'Character', paren: 'Parenthetical', dialogue: 'Dialogue',
  transition: 'Transition', shot: 'Shot', centered: 'Action', act: 'New Act', lyric: 'Dialogue',
};

function fdxText(text, extraStyle = []) {
  const runs = parseInline(text);
  if (!runs.length) return '<Text></Text>';
  return runs.map((r) => {
    const style = [...extraStyle, r.b && 'Bold', r.i && 'Italic', r.u && 'Underline'].filter(Boolean);
    return `<Text${style.length ? ` Style="${[...new Set(style)].join('+')}"` : ''}>${xml(r.text)}</Text>`;
  }).join('');
}

/** Final Draft 8+ XML document. */
export function buildFdx(src, opts = {}) {
  const { titlePage, elements } = parseFountain(src);
  const layout = layoutScript(elements, opts);
  const out = [];
  const para = (e, extra = '') => {
    const type = FDX_TYPE[e.type] || 'General';
    const align = e.type === 'centered' ? ' Alignment="Center"' : '';
    const num = e.type === 'scene' && opts.sceneNumbers ? ` Number="${xml(layout.sceneNumbers.get(elements.indexOf(e)) || '')}"` : '';
    let inner = fdxText(e.text, e.type === 'lyric' ? ['Italic'] : []);
    if (e.type === 'scene' && e._synopsis) inner += `<SceneProperties Title=""><Summary><Paragraph Type="General"><Text>${xml(e._synopsis)}</Text></Paragraph></Summary></SceneProperties>`;
    return `<Paragraph Type="${type}"${align}${num}${extra}>${inner}</Paragraph>`;
  };
  // attach synopses to their scene headings; drop non-printing sections
  let lastScene = null;
  const printable = [];
  for (const e of elements) {
    if (e.type === 'scene') { lastScene = e; printable.push(e); } else if (e.type === 'synopsis') { if (lastScene && !lastScene._synopsis) lastScene._synopsis = plain(e.text); } else if (e.type !== 'section') printable.push(e);
  }
  for (let i = 0; i < printable.length; i++) {
    const e = printable[i];
    if (e.type === 'pagebreak') { if (out.length) out[out.length - 1] = out[out.length - 1].replace('<Paragraph ', '<Paragraph StartsNewPage="Yes" '); continue; }
    // Dual dialogue: character … then a ^ character …
    if (e.type === 'character') {
      let j = i + 1;
      while (j < printable.length && ['paren', 'dialogue', 'lyric'].includes(printable[j].type)) j++;
      if (printable[j]?.type === 'character' && printable[j].dual) {
        let k = j + 1;
        while (k < printable.length && ['paren', 'dialogue', 'lyric'].includes(printable[k].type)) k++;
        out.push(`<Paragraph><DualDialogue>${printable.slice(i, k).map((x) => para(x)).join('')}</DualDialogue></Paragraph>`);
        i = k - 1;
        continue;
      }
    }
    out.push(para(e));
  }
  const tp = [];
  const center = (t, spaceBefore = 0) => tp.push(`<Paragraph Alignment="Center" Type="Title Page"${spaceBefore ? ` SpaceBefore="${spaceBefore}"` : ''}>${fdxText(t)}</Paragraph>`);
  if (Object.keys(titlePage).length) {
    for (let k = 0; k < 18; k++) tp.push('<Paragraph Type="Title Page"><Text></Text></Paragraph>');
    center((titlePage.Title || '').toUpperCase());
    tp.push('<Paragraph Type="Title Page"><Text></Text></Paragraph>');
    center(titlePage.Credit || 'Written by');
    tp.push('<Paragraph Type="Title Page"><Text></Text></Paragraph>');
    for (const l of String(titlePage.Author || '').split('\n')) center(l);
    if (titlePage.Source) { tp.push('<Paragraph Type="Title Page"><Text></Text></Paragraph>'); for (const l of String(titlePage.Source).split('\n')) center(l); }
    for (let k = 0; k < 16; k++) tp.push('<Paragraph Type="Title Page"><Text></Text></Paragraph>');
    for (const l of String(titlePage.Contact || '').split('\n')) tp.push(`<Paragraph Alignment="Left" Type="Title Page">${fdxText(l)}</Paragraph>`);
    if (titlePage['Draft date']) tp.push(`<Paragraph Alignment="Right" Type="Title Page">${fdxText(titlePage['Draft date'])}</Paragraph>`);
  }
  const fmt = formatById(opts.format);
  const inch = (n) => n.toFixed(2);
  const elementSettings = Object.entries(FDX_TYPE).filter(([k]) => !['centered', 'lyric', 'act'].includes(k)).map(([k, name]) => {
    const s = SPECS[k];
    const left = fmt.left + s.indent / 10;
    const right = fmt.left + (s.indent + s.width) / 10;
    return `<ElementSettings Type="${name}"><FontSpec AdornmentStyle="0" Background="#FFFFFFFFFFFF" Color="#000000000000" Font="Courier Final Draft" RevisionID="0" Size="12" Style="${s.upper ? 'AllCaps' : ''}"/><ParagraphSpec Alignment="${s.align === 'right' ? 'Right' : 'Left'}" FirstIndent="0.00" Leading="Regular" LeftIndent="${inch(left)}" RightIndent="${inch(right)}" SpaceBefore="${s.before * 12}" Spacing="1" StartsNewPage="No"/><Behavior PaginateAs="${name}" ReturnKey="${name}" Shortcut=""/></ElementSettings>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
<Content>
${out.join('\n')}
</Content>
<TitlePage>
<Content>
${tp.join('\n')}
</Content>
</TitlePage>
${elementSettings}
<PageLayout BackgroundColor="#FFFFFFFFFFFF" BottomMargin="72" BreakDialogueAndActionAtSentences="Yes" DocumentLeading="Normal" FooterMargin="36" ForegroundColor="#000000000000" HeaderMargin="36" InvisiblesColor="#808080808080" TopMargin="72" UsesSmartQuotes="Yes">
<AutoCastList AddParentheses="Yes" AutomaticallyGenerate="Yes" CastListElement="Cast List"/>
</PageLayout>
<HeaderAndFooter FooterFirstPage="Yes" FooterVisible="No" HeaderFirstPage="No" HeaderVisible="Yes" StartingPage="1"/>
<SmartType>
<Characters>${[...new Set(elements.filter((e) => e.type === 'character').map((e) => plain(e.text).toUpperCase().replace(/\s*\(.*\)/, '').trim()))].map((c) => `<Character>${xml(c)}</Character>`).join('')}</Characters>
<Extensions><Extension>(V.O.)</Extension><Extension>(O.S.)</Extension><Extension>(O.C.)</Extension><Extension>(CONT'D)</Extension></Extensions>
<SceneIntros><SceneIntro>INT.</SceneIntro><SceneIntro>EXT.</SceneIntro><SceneIntro>INT./EXT.</SceneIntro><SceneIntro>I/E</SceneIntro></SceneIntros>
<TimesOfDay><TimeOfDay>DAY</TimeOfDay><TimeOfDay>NIGHT</TimeOfDay><TimeOfDay>MORNING</TimeOfDay><TimeOfDay>EVENING</TimeOfDay><TimeOfDay>CONTINUOUS</TimeOfDay><TimeOfDay>LATER</TimeOfDay></TimesOfDay>
<Transitions><Transition>CUT TO:</Transition><Transition>DISSOLVE TO:</Transition><Transition>FADE IN:</Transition><Transition>FADE OUT.</Transition><Transition>MATCH CUT TO:</Transition><Transition>SMASH CUT TO:</Transition></Transitions>
</SmartType>
</FinalDraft>
`;
}

/** Fountain text, normalised (title page first). */
export function buildFountain(src) {
  const { titlePage, elements } = parseFountain(src);
  return writeFountain(titlePage, elements);
}

export function buildText(src, opts = {}) {
  const { titlePage, elements } = parseFountain(src);
  return scriptText(layoutScript(elements, opts), titlePage);
}

/** Word document with Final Draft–style paragraph styles. */
export async function buildScriptDocx(src, opts = {}) {
  const { titlePage, elements } = parseFountain(src);
  const fmt = formatById(opts.format);
  const TW = 1440;
  const font = 'Courier Prime';
  const st = (id, name, s, extra = {}) => ({
    id, name, basedOn: 'Normal', quickFormat: true,
    run: { font, size: 24, allCaps: !!s.upper },
    paragraph: {
      indent: { left: Math.round((s.indent / 10) * TW), right: Math.round(((60 - s.indent - s.width) / 10) * TW) },
      spacing: { before: s.before * 240, after: 0, line: 240, lineRule: 'exact' },
      alignment: s.align === 'right' ? AlignmentType.RIGHT : s.align === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT,
      ...extra,
    },
  });
  const styles = [
    st('SceneHeading', 'Scene Heading', SPECS.scene, { keepNext: true }),
    st('Action', 'Action', SPECS.action),
    st('Character', 'Character', SPECS.character, { keepNext: true }),
    st('Parenthetical', 'Parenthetical', SPECS.paren, { keepNext: true }),
    st('Dialogue', 'Dialogue', SPECS.dialogue),
    st('Transition', 'Transition', SPECS.transition),
    st('Shot', 'Shot', SPECS.shot, { keepNext: true }),
    st('Centered', 'Centered', SPECS.centered),
    st('Act', 'Act Break', SPECS.act),
    st('Lyrics', 'Lyrics', SPECS.lyric),
  ];
  const styleOf = { scene: 'SceneHeading', action: 'Action', character: 'Character', paren: 'Parenthetical', dialogue: 'Dialogue', transition: 'Transition', shot: 'Shot', centered: 'Centered', act: 'Act', lyric: 'Lyrics' };
  const runsFor = (text, e) => {
    const out = [];
    for (const r of parseInline(text)) {
      r.text.split('\n').forEach((piece, k) => out.push(new TextRun({ text: piece, bold: r.b, italics: r.i || e.type === 'lyric', underline: r.u || e.type === 'act' ? {} : undefined, break: k ? 1 : 0 })));
    }
    return out;
  };
  const children = [];
  let pendingBreak = false;
  let lastSpeaker = null;
  for (const e of elements) {
    if (e.type === 'section' || e.type === 'synopsis') continue;
    if (e.type === 'pagebreak') { pendingBreak = true; continue; }
    if (e.type === 'scene') lastSpeaker = null;
    let text = e.text;
    if (e.type === 'character') {
      const n = plain(e.text).toUpperCase().replace(/\s*\(.*?\)\s*/g, ' ').trim();
      if (opts.contd !== false && lastSpeaker === n && !/CONT['’]D/i.test(text)) text = `${plain(text).trim()} (CONT'D)`;
      lastSpeaker = n;
    }
    if (e.type === 'paren' && !/^\(/.test(plain(text).trim())) text = `(${text})`;
    children.push(new Paragraph({ style: styleOf[e.type] || 'Action', pageBreakBefore: pendingBreak, children: runsFor(text, e) }));
    pendingBreak = false;
  }
  const page = {
    size: { width: Math.round(fmt.w * TW), height: Math.round(fmt.h * TW) },
    margin: { top: Math.round(fmt.top * TW), bottom: Math.round(fmt.bottom * TW), left: Math.round(fmt.left * TW), right: Math.round(fmt.right * TW), header: Math.round(0.5 * TW) },
  };
  const sections = [];
  if (Object.keys(titlePage).length) {
    const c = (t, before = 0) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before }, children: [new TextRun({ text: t, font, size: 24 })] });
    sections.push({
      properties: { page },
      children: [
        c(plain(titlePage.Title || '').toUpperCase(), 3600), c(titlePage.Credit || 'Written by', 480),
        ...String(titlePage.Author || '').split('\n').map((l, k) => c(l, k ? 0 : 240)),
        ...String(titlePage.Source || '').split('\n').filter(Boolean).map((l, k) => c(l, k ? 0 : 480)),
        new Paragraph({ spacing: { before: 4800 }, children: [] }),
        ...String(titlePage.Contact || '').split('\n').map((l) => new Paragraph({ children: [new TextRun({ text: l, font, size: 24 })] })),
        ...(titlePage['Draft date'] ? [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: titlePage['Draft date'], font, size: 24 })] })] : []),
      ],
    });
  }
  sections.push({
    properties: { page: { ...page, pageNumbers: { start: 1 } }, titlePage: true, type: SectionType.NEXT_PAGE },
    headers: {
      default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [PageNumber.CURRENT, '.'], font, size: 24 })] })] }),
      first: new Header({ children: [new Paragraph({})] }),
    },
    children,
  });
  const doc = new Document({
    title: plain(titlePage.Title || 'Screenplay'),
    creator: plain(titlePage.Author || ''),
    styles: { default: { document: { run: { font, size: 24 } } }, paragraphStyles: styles },
    sections,
  });
  return Packer.toBuffer(doc);
}

/* --------------------------------------------------------------- Fade In */
// Fade In's native .fadein file is a ZIP holding document.xml in the Open
// Screenplay Format (OSF). We write OSF 2.1, which every Fade In version opens.
const OSF_BASE = {
  scene: 'Scene Heading', action: 'Action', character: 'Character', paren: 'Parenthetical', dialogue: 'Dialogue',
  transition: 'Transition', shot: 'Shot', centered: 'Action', act: 'New Act', lyric: 'Lyrics',
};
const tenthMm = (inch) => Math.round(inch * 254);

function osfRuns(text, extra = {}) {
  const runs = parseInline(text);
  if (!runs.length) return '<text></text>';
  return runs.map((r) => {
    const a = { ...extra, ...(r.b ? { bold: 1 } : {}), ...(r.i ? { italic: 1 } : {}), ...(r.u ? { underline: 1 } : {}) };
    return `<text${Object.entries(a).map(([k, v]) => ` ${k}="${v}"`).join('')}>${xml(r.text)}</text>`;
  }).join('');
}

export function buildOsf(src, opts = {}) {
  const { titlePage, elements } = parseFountain(src);
  const layout = layoutScript(elements, opts);
  const fmt = formatById(opts.format);
  const textW = fmt.w - fmt.left - fmt.right;
  const style = (name, k, extra = '') => {
    const s = SPECS[k];
    const left = tenthMm(s.indent / 10);
    const right = tenthMm(Math.max(0, textW - (s.indent + s.width) / 10));
    return `<style name="${name}" baseStyleName="Normal Text" font="Courier Screenplay" size="12" spaceBefore="${s.before}" lineSpacing="1.0" align="${s.align || 'left'}" leftIndent="${left}" rightIndent="${right}"${s.upper ? ' allCaps="1"' : ''}${extra}/>`;
  };
  const styles = [
    `<style name="Normal Text" builtin="1" builtInIndex="0" font="Courier Screenplay" size="12" spaceBefore="0" lineSpacing="1.0" align="left" leftIndent="0" rightIndent="0"/>`,
    style('Scene Heading', 'scene', ' builtin="1" builtInIndex="1" styleEnter="Action" keepWithNext="1"'),
    style('Action', 'action', ' builtin="1" builtInIndex="2" styleEnter="Action" styleTabBefore="Character" styleTabAfter="Character"'),
    style('Character', 'character', ' builtin="1" builtInIndex="3" styleEnter="Dialogue" styleTabBefore="Action" styleTabAfter="Action" keepWithNext="1"'),
    style('Parenthetical', 'paren', ' builtin="1" builtInIndex="4" styleEnter="Dialogue" styleTabBefore="Dialogue" styleTabAfter="Dialogue" keepWithNext="1"'),
    style('Dialogue', 'dialogue', ' builtin="1" builtInIndex="5" styleEnter="Action" styleTabBefore="Parenthetical" styleTabAfter="Parenthetical"'),
    style('Transition', 'transition', ' builtin="1" builtInIndex="6" styleEnter="Scene Heading"'),
    style('Shot', 'shot', ' builtin="1" builtInIndex="7" styleEnter="Action" keepWithNext="1"'),
    style('Lyrics', 'lyric', ' styleEnter="Lyrics" italic="1"'),
    style('New Act', 'act', ' styleEnter="Scene Heading" underline="1" keepWithNext="1"'),
  ];

  const paras = [];
  let lastScene = -1;
  const isSpeech = (t) => ['paren', 'dialogue', 'lyric'].includes(t);
  for (let i = 0; i < elements.length; i++) {
    const e = elements[i];
    if (e.type === 'section' || e.type === 'pagebreak') continue;
    if (e.type === 'synopsis') {
      if (lastScene >= 0 && !paras[lastScene].includes(' synopsis=')) paras[lastScene] = paras[lastScene].replace('<para', `<para synopsis="${xml(plain(e.text))}"`);
      continue;
    }
    const attrs = [];
    if (e.type === 'scene') {
      const n = opts.sceneNumbers && layout.sceneNumbers.get(i);
      if (n) attrs.push(`sceneNumber="${xml(n)}"`);
    }
    const st = [`baseStyleName="${OSF_BASE[e.type] || 'Action'}"`];
    if (e.type === 'centered') st.push('align="center"');
    if (e.type === 'character') {
      // Mark both speakers of a dual-dialogue pair.
      let j = i + 1;
      while (j < elements.length && isSpeech(elements[j].type)) j++;
      if (e.dual || (elements[j]?.type === 'character' && elements[j].dual)) st.push('dualDialogue="1"');
    }
    paras.push(`<para${attrs.length ? ` ${attrs.join(' ')}` : ''}><style ${st.join(' ')}/>${osfRuns(e.text)}</para>`);
    if (e.type === 'scene') lastScene = paras.length - 1;
  }

  const tp = [];
  const blank = () => tp.push('<para><style baseStyleName="Normal Text"/><text></text></para>');
  const line = (bookmark, text, align) => tp.push(`<para${bookmark ? ` bookmark="${bookmark}"` : ''}><style baseStyleName="Normal Text" align="${align}"/>${osfRuns(text)}</para>`);
  if (Object.keys(titlePage).length) {
    for (let k = 0; k < 18; k++) blank();
    line('Title', plain(titlePage.Title || '').toUpperCase(), 'center');
    blank();
    line('', titlePage.Credit || 'Written by', 'center');
    blank();
    String(titlePage.Author || '').split('\n').forEach((l, k) => line(k ? '' : 'Author', l, 'center'));
    if (titlePage.Source) { blank(); String(titlePage.Source).split('\n').forEach((l) => line('', l, 'center')); }
    for (let k = 0; k < 14; k++) blank();
    if (titlePage.Copyright) line('Copyright', titlePage.Copyright, 'left');
    if (titlePage['Draft date']) line('Draft', titlePage['Draft date'], 'left');
    String(titlePage.Contact || '').split('\n').forEach((l, k) => line(k ? '' : 'Contact', l, 'left'));
  }

  const names = [...new Set(elements.filter((e) => e.type === 'character').map((e) => plain(e.text).replace(/\s*\(.*?\)\s*/g, '').replace(/\s*\^$/, '').trim().toUpperCase()).filter(Boolean))];
  const locs = [...new Set(elements.filter((e) => e.type === 'scene').map((e) => plain(e.text).toUpperCase().replace(/^(INT\.\/EXT\.|INT\/EXT|I\/E|INT|EXT|EST)[.\s]+/, '').split(/\s+-\s+/)[0].trim()).filter(Boolean))];
  const list = (tag, item, vals) => `<${tag}>${vals.map((v) => `<${item} name="${xml(v)}"/>`).join('')}</${tag}>`;
  const uuid = crypto.randomUUID().toUpperCase();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<document type="Open Screenplay Format document" version="21">
<info uuid="${uuid}" pageCount="${layout.pages.length}"/>
<settings pageWidth="${tenthMm(fmt.w)}" pageHeight="${tenthMm(fmt.h)}" marginTop="${tenthMm(fmt.top)}" marginBottom="${tenthMm(fmt.bottom)}" marginLeft="${tenthMm(fmt.left)}" marginRight="${tenthMm(fmt.right)}" normalLinesPerInch="6.0" dialogueContinues="true" contText="(CONT'D)" moreText="(MORE)" sceneTimeSeparator=" - " pageNumbering="true" pageNumberFormat="#." pageNumberStart="1" pageNumberFirst="false" sceneNumbering="${opts.sceneNumbers ? 'true' : 'false'}" sceneNumberStart="1"/>
<styles>
${styles.join('\n')}
</styles>
<paragraphs>
${paras.join('\n')}
</paragraphs>
<titlePage>
${tp.join('\n')}
</titlePage>
<lists>
${list('characters', 'character', names)}
${list('locations', 'location', locs)}
${list('sceneIntros', 'sceneIntro', ['INT. ', 'EXT. ', 'INT./EXT. ', 'EST. '])}
${list('sceneTimes', 'sceneTime', ['DAY', 'NIGHT', 'MORNING', 'EVENING', 'CONTINUOUS', 'LATER', 'MOMENTS LATER'])}
${list('extensions', 'extension', ['(V.O.)', '(O.S.)', "(CONT'D)", '(O.C.)'])}
${list('transitions', 'transition', ['CUT TO:', 'DISSOLVE TO:', 'FADE OUT.', 'FADE TO BLACK.', 'MATCH CUT TO:', 'SMASH CUT TO:'])}
</lists>
</document>
`;
}

/** Fade In document: ZIP containing document.xml (OSF). */
export function buildFadeIn(src, opts = {}) {
  return Buffer.from(zipSync({ 'document.xml': strToU8(buildOsf(src, opts)) }, { level: 6 }));
}
