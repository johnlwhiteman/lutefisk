// Special characters for the text editor's Insert Symbol panel. Each entry is
// [character, name]. Accented letters are generated with their names.

const L = (s) => s.trim().split('\n').map((line) => {
  const t = line.trim();
  const i = t.indexOf(' ');
  return [t.slice(0, i), t.slice(i + 1)];
});

const MARKS = {
  '̀': 'grave', '́': 'acute', '̂': 'circumflex', '̃': 'tilde', '̄': 'macron', '̆': 'breve',
  '̇': 'dot above', '̈': 'diaeresis', '̊': 'ring', '̋': 'double acute', '̌': 'caron',
  '̧': 'cedilla', '̨': 'ogonek', '̣': 'dot below', '̦': 'comma below', '̱': 'line below',
};
function accented(from, to) {
  const out = [];
  for (let cp = from; cp <= to; cp++) {
    const ch = String.fromCodePoint(cp);
    const d = ch.normalize('NFD');
    if (d.length < 2 || !/[A-Za-z]/.test(d[0])) continue;
    const marks = [...d.slice(1)].map((m) => MARKS[m]).filter(Boolean);
    if (!marks.length) continue;
    out.push([ch, `${d[0] === d[0].toUpperCase() ? 'capital' : 'small'} ${d[0]} with ${marks.join(' and ')}`]);
  }
  return out;
}

export const UNICODE_SYMBOLS = [
  { id: 'punct', label: 'Punctuation & typography', items: L(`
— em dash
– en dash
‐ hyphen
‑ non-breaking hyphen
‒ figure dash
― horizontal bar
… ellipsis
‘ left single quote
’ right single quote, apostrophe
“ left double quote
” right double quote
‚ low single quote
„ low double quote
‹ single left guillemet
› single right guillemet
« left guillemet
» right guillemet
′ prime, feet, minutes
″ double prime, inches, seconds
‴ triple prime
· middle dot, interpunct
• bullet
‣ triangular bullet
◦ white bullet
⁃ hyphen bullet
¡ inverted exclamation
¿ inverted question
‽ interrobang
§ section
¶ pilcrow, paragraph
† dagger
‡ double dagger
※ reference mark
⁂ asterism
⁎ low asterisk
⁑ two asterisks
⸺ two-em dash
⸻ three-em dash
〃 ditto mark
‰ per mille
‱ per ten thousand
° degree
№ numero
℗ sound recording copyright
© copyright
® registered
™ trademark
℠ service mark
℅ care of
℮ estimated
¦ broken bar
⁄ fraction slash
〜 wave dash`) },
  { id: 'spaces', label: 'Spaces & invisible', items: [
    [' ', 'no-break space (keeps two words together)'], [' ', 'thin space'], [' ', 'hair space'], [' ', 'narrow no-break space'],
    [' ', 'en space'], [' ', 'em space'], [' ', 'figure space'], [' ', 'punctuation space'],
    ['­', 'soft hyphen (hyphenation point)'], ['​', 'zero-width space (line break opportunity)'], ['⁠', 'word joiner (prevents a break)'], ['‍', 'zero-width joiner'],
  ] },
  { id: 'currency', label: 'Currency', items: L(`
$ dollar
¢ cent
€ euro
£ pound sterling
¥ yen, yuan
₹ Indian rupee
₽ ruble
₩ won
₪ new shekel
₫ dong
₱ peso
₺ Turkish lira
₴ hryvnia
₦ naira
₿ bitcoin
¤ currency sign
₣ franc
₤ lira
₥ mill
₧ peseta
₸ tenge
₼ manat
฿ baht
﷼ rial`) },
  { id: 'math', label: 'Math', items: L(`
± plus-minus
∓ minus-plus
× multiplication
÷ division
− minus sign
∕ division slash
⋅ dot operator
√ square root
∛ cube root
∜ fourth root
∞ infinity
≈ almost equal
≠ not equal
≡ identical to
≤ less than or equal
≥ greater than or equal
≪ much less than
≫ much greater than
∝ proportional to
∼ tilde operator
≅ approximately equal
∑ summation
∏ product
∫ integral
∬ double integral
∮ contour integral
∂ partial differential
∆ increment, delta
∇ nabla
∈ element of
∉ not an element of
∋ contains
⊂ subset
⊃ superset
⊆ subset or equal
⊇ superset or equal
∪ union
∩ intersection
∅ empty set
∀ for all
∃ there exists
∄ there does not exist
¬ not
∧ logical and
∨ logical or
⊕ circled plus
⊗ circled times
⊥ perpendicular, up tack
∥ parallel
∠ angle
∡ measured angle
△ triangle
∴ therefore
∵ because
ℕ natural numbers
ℤ integers
ℚ rational numbers
ℝ real numbers
ℂ complex numbers
ℵ alef
ℏ Planck constant over 2π
‰ per mille
¼ one quarter
½ one half
¾ three quarters
⅓ one third
⅔ two thirds
⅕ one fifth
⅙ one sixth
⅛ one eighth
⅜ three eighths
⅝ five eighths
⅞ seven eighths
⁰ superscript zero
¹ superscript one
² superscript two
³ superscript three
⁴ superscript four
⁵ superscript five
⁶ superscript six
⁷ superscript seven
⁸ superscript eight
⁹ superscript nine
⁺ superscript plus
⁻ superscript minus
⁼ superscript equals
⁽ superscript left parenthesis
⁾ superscript right parenthesis
ⁿ superscript n
ⁱ superscript i
₀ subscript zero
₁ subscript one
₂ subscript two
₃ subscript three
₄ subscript four
₅ subscript five
₆ subscript six
₇ subscript seven
₈ subscript eight
₉ subscript nine
₊ subscript plus
₋ subscript minus
₌ subscript equals
ℓ script small l, litre
µ micro
Ω ohm
℧ mho
Å angstrom
℃ degree Celsius
℉ degree Fahrenheit`) },
  { id: 'arrows', label: 'Arrows', items: L(`
← leftwards arrow
→ rightwards arrow
↑ upwards arrow
↓ downwards arrow
↔ left right arrow
↕ up down arrow
↖ north west arrow
↗ north east arrow
↘ south east arrow
↙ south west arrow
⇐ leftwards double arrow
⇒ rightwards double arrow, implies
⇑ upwards double arrow
⇓ downwards double arrow
⇔ left right double arrow, iff
↩ leftwards arrow with hook
↪ rightwards arrow with hook
↺ anticlockwise open circle arrow
↻ clockwise open circle arrow
⇄ right arrow over left arrow
⇆ left arrow over right arrow
⟵ long leftwards arrow
⟶ long rightwards arrow
⟷ long left right arrow
➔ heavy wide-headed arrow
➜ heavy round-tipped arrow
➝ triangle-headed arrow
➞ heavy triangle-headed arrow
➤ arrowhead
▶ black right-pointing triangle
◀ black left-pointing triangle
▲ black up-pointing triangle
▼ black down-pointing triangle
▸ small right-pointing triangle
◂ small left-pointing triangle
☛ black right pointing index
☞ white right pointing index`) },
  { id: 'greek', label: 'Greek', items: L(`
Α capital alpha
Β capital beta
Γ capital gamma
Δ capital delta
Ε capital epsilon
Ζ capital zeta
Η capital eta
Θ capital theta
Ι capital iota
Κ capital kappa
Λ capital lambda
Μ capital mu
Ν capital nu
Ξ capital xi
Ο capital omicron
Π capital pi
Ρ capital rho
Σ capital sigma
Τ capital tau
Υ capital upsilon
Φ capital phi
Χ capital chi
Ψ capital psi
Ω capital omega
α small alpha
β small beta
γ small gamma
δ small delta
ε small epsilon
ζ small zeta
η small eta
θ small theta
ι small iota
κ small kappa
λ small lambda
μ small mu
ν small nu
ξ small xi
ο small omicron
π small pi
ρ small rho
σ small sigma
ς final sigma
τ small tau
υ small upsilon
φ small phi
χ small chi
ψ small psi
ω small omega
ϑ theta symbol
ϕ phi symbol
ϖ pi symbol`) },
  { id: 'latin', label: 'Accented letters', items: [...accented(0xC0, 0xFF), ...accented(0x100, 0x17F), ...accented(0x1E00, 0x1EFF)] },
  { id: 'ligatures', label: 'Ligatures & special letters', items: L(`
Æ capital ae
æ small ae
Œ capital oe
œ small oe
ß sharp s, eszett
ẞ capital sharp s
Ð capital eth
ð small eth
Þ capital thorn
þ small thorn
Ø capital o with stroke
ø small o with stroke
Ł capital l with stroke
ł small l with stroke
Đ capital d with stroke
đ small d with stroke
Ħ capital h with stroke
ħ small h with stroke
ı dotless i
ȷ dotless j
ĸ kra
ŉ n preceded by apostrophe
Ŋ capital eng
ŋ small eng
ſ long s
ﬀ ff ligature
ﬁ fi ligature
ﬂ fl ligature
ﬃ ffi ligature
ﬄ ffl ligature
ª feminine ordinal
º masculine ordinal`) },
  { id: 'ornaments', label: 'Ornaments & dingbats', items: L(`
❦ floral heart, hedera
❧ rotated floral heart
☙ reversed rotated floral heart
✦ black four-pointed star
✧ white four-pointed star
★ black star
☆ white star
✶ six-pointed black star
✷ eight-pointed rectilinear star
✸ heavy eight-pointed star
✹ twelve-pointed star
❀ white florette
✿ black florette
❁ eight-petalled outlined florette
✾ six-petalled florette
❃ heavy teardrop-spoked asterisk
❋ heavy eight-teardrop asterisk
✣ four balloon-spoked asterisk
✤ heavy four balloon-spoked asterisk
✥ four club-spoked asterisk
✠ Maltese cross
✝ Latin cross
☩ cross of Jerusalem
⚜ fleur-de-lis
☾ last quarter moon
☽ first quarter moon
☼ sun with rays
☀ black sun
❄ snowflake
⚘ flower
☘ shamrock
♠ spade
♣ club
♥ heart
♦ diamond
♤ white spade
♧ white club
♡ white heart
♢ white diamond
◆ black diamond
◇ white diamond
❖ black diamond minus white X
■ black square
□ white square
▪ small black square
▫ small white square
● black circle
○ white circle
◉ fisheye
◎ bullseye
⁕ flower punctuation
⁘ four dot punctuation
⁙ five dot punctuation
∴ three dots
✓ check mark
✔ heavy check mark
✗ ballot X
✘ heavy ballot X
☐ ballot box
☑ ballot box with check
☒ ballot box with X
✉ envelope
✎ pencil
✂ scissors
☎ telephone
⌘ command key
⌥ option key
⇧ shift
⏎ return
⌫ delete`) },
  { id: 'music', label: 'Music & games', items: L(`
♩ quarter note
♪ eighth note
♫ beamed eighth notes
♬ beamed sixteenth notes
♭ flat
♮ natural
♯ sharp
𝄞 treble clef
𝄢 bass clef
♔ white chess king
♕ white chess queen
♖ white chess rook
♗ white chess bishop
♘ white chess knight
♙ white chess pawn
♚ black chess king
♛ black chess queen
♜ black chess rook
♝ black chess bishop
♞ black chess knight
♟ black chess pawn
⚀ die face one
⚁ die face two
⚂ die face three
⚃ die face four
⚄ die face five
⚅ die face six`) },
  { id: 'roman', label: 'Numbers & numerals', items: L(`
Ⅰ Roman numeral one
Ⅱ Roman numeral two
Ⅲ Roman numeral three
Ⅳ Roman numeral four
Ⅴ Roman numeral five
Ⅵ Roman numeral six
Ⅶ Roman numeral seven
Ⅷ Roman numeral eight
Ⅸ Roman numeral nine
Ⅹ Roman numeral ten
Ⅺ Roman numeral eleven
Ⅻ Roman numeral twelve
Ⅼ Roman numeral fifty
Ⅽ Roman numeral one hundred
Ⅾ Roman numeral five hundred
Ⅿ Roman numeral one thousand
ⅰ small Roman numeral one
ⅱ small Roman numeral two
ⅲ small Roman numeral three
ⅳ small Roman numeral four
ⅴ small Roman numeral five
ⅵ small Roman numeral six
① circled one
② circled two
③ circled three
④ circled four
⑤ circled five
⑥ circled six
⑦ circled seven
⑧ circled eight
⑨ circled nine
⑩ circled ten
❶ negative circled one
❷ negative circled two
❸ negative circled three
❹ negative circled four
❺ negative circled five`) },
];

/** Every symbol with its category, for search. */
export const ALL_UNICODE_SYMBOLS = UNICODE_SYMBOLS.flatMap((c) => c.items.map(([ch, name]) => ({ ch, name, cat: c.label })));

export const codeOf = (ch) => `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
