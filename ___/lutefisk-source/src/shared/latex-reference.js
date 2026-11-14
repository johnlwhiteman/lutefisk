// LaTeX reference for the equation editor: a categorized symbol palette and a
// searchable how-to reference. Every entry is checked by the unit tests to
// render with Temml, so nothing listed here produces an error.

const syms = (list) => list.trim().split(/\s+/).map((s) => {
  const [tex, ...name] = s.split('|');
  return { tex, name: (name.join(' ') || tex.replace(/^\\/, '')).replace(/_/g, ' ') };
});

/** Symbol palette: [{ id, label, items: [{ tex, name }] }] */
export const LATEX_SYMBOLS = [
  { id: 'greek-lower', label: 'Greek (lowercase)', items: syms(`
\\alpha \\beta \\gamma \\delta \\epsilon \\varepsilon \\zeta \\eta \\theta \\vartheta \\iota \\kappa \\varkappa \\lambda \\mu \\nu \\xi o|omicron \\pi \\varpi \\rho \\varrho \\sigma \\varsigma \\tau \\upsilon \\phi \\varphi \\chi \\psi \\omega \\digamma`) },
  { id: 'greek-upper', label: 'Greek (uppercase)', items: syms(`
\\Gamma \\Delta \\Theta \\Lambda \\Xi \\Pi \\Sigma \\Upsilon \\Phi \\Psi \\Omega \\varGamma \\varDelta \\varTheta \\varLambda \\varXi \\varPi \\varSigma \\varUpsilon \\varPhi \\varPsi \\varOmega`) },
  { id: 'operators', label: 'Operators', items: syms(`
+|plus -|minus \\pm|plus_or_minus \\mp|minus_or_plus \\times|times \\div|divide \\cdot|dot \\ast|asterisk \\star \\circ|ring \\bullet \\oplus \\ominus \\otimes \\oslash \\odot \\cap|intersection \\cup|union \\sqcap \\sqcup \\vee|or \\wedge|and \\setminus \\wr \\diamond \\bigtriangleup \\bigtriangledown \\triangleleft \\triangleright \\dagger \\ddagger \\amalg \\uplus \\boxplus \\boxminus \\boxtimes \\ltimes \\rtimes`) },
  { id: 'relations', label: 'Relations', items: syms(`
=|equals \\ne|not_equal <|less_than >|greater_than \\le|less_or_equal \\ge|greater_or_equal \\leqslant \\geqslant \\ll|much_less \\gg|much_greater \\equiv|equivalent \\approx|approximately \\sim|similar \\simeq \\cong|congruent \\propto|proportional \\doteq \\asymp \\prec \\succ \\preceq \\succeq \\subset|subset \\supset|superset \\subseteq \\supseteq \\subsetneq \\supsetneq \\in|element_of \\notin|not_element_of \\ni \\mid|divides \\nmid \\parallel \\nparallel \\perp|perpendicular \\vdash \\models \\bowtie \\lessgtr \\lesssim \\gtrsim \\triangleq \\coloneqq|defined_as`) },
  { id: 'arrows', label: 'Arrows', items: syms(`
\\to|to \\gets \\leftarrow \\rightarrow \\leftrightarrow \\Leftarrow \\Rightarrow \\Leftrightarrow \\implies \\impliedby \\iff \\mapsto \\longmapsto \\longleftarrow \\longrightarrow \\longleftrightarrow \\Longleftarrow \\Longrightarrow \\Longleftrightarrow \\uparrow \\downarrow \\updownarrow \\Uparrow \\Downarrow \\Updownarrow \\nearrow \\searrow \\swarrow \\nwarrow \\hookleftarrow \\hookrightarrow \\leftharpoonup \\rightharpoonup \\leftharpoondown \\rightharpoondown \\rightleftharpoons \\leftrightarrows \\rightrightarrows \\twoheadrightarrow \\leadsto \\circlearrowleft \\circlearrowright \\curvearrowleft \\curvearrowright`) },
  { id: 'logic', label: 'Logic & sets', items: syms(`
\\forall|for_all \\exists|exists \\nexists|does_not_exist \\neg|not \\land|and \\lor|or \\top|true \\bot|false \\emptyset|empty_set \\varnothing \\infty|infinity \\aleph \\beth \\complement \\therefore \\because \\mathbb{N}|natural_numbers \\mathbb{Z}|integers \\mathbb{Q}|rationals \\mathbb{R}|reals \\mathbb{C}|complex_numbers \\mathbb{P}|primes`) },
  { id: 'big', label: 'Big operators', items: syms(`
\\sum|sum \\prod|product \\coprod \\int|integral \\iint|double_integral \\iiint|triple_integral \\oint|contour_integral \\bigcup \\bigcap \\bigoplus \\bigotimes \\bigodot \\bigvee \\bigwedge \\bigsqcup \\biguplus`) },
  { id: 'calculus', label: 'Calculus & analysis', items: syms(`
\\partial|partial \\nabla|nabla \\Delta|Laplacian \\infty|infinity \\lim|limit \\limsup \\liminf \\sup \\inf \\max \\min \\arg \\det \\dim \\ker \\deg \\gcd \\Pr|probability \\exp \\log \\ln \\lg \\sin \\cos \\tan \\cot \\sec \\csc \\arcsin \\arccos \\arctan \\sinh \\cosh \\tanh \\coth`) },
  { id: 'misc', label: 'Miscellaneous', items: syms(`
\\hbar \\ell \\Re \\Im \\wp \\eth \\angle \\measuredangle \\sphericalangle \\triangle \\square \\blacksquare \\Box \\Diamond \\lozenge \\checkmark \\prime|prime \\backprime \\ldots|ellipsis \\cdots|centered_dots \\vdots|vertical_dots \\ddots|diagonal_dots \\clubsuit \\diamondsuit \\heartsuit \\spadesuit \\flat \\natural \\sharp \\S|section \\P|paragraph \\copyright \\circledR \\dagger \\ddagger \\degree|degree \\pounds \\yen \\euro \\%|percent \\$|dollar \\#|hash \\&|ampersand \\_|underscore \\backslash`) },
  { id: 'delims', label: 'Brackets', items: syms(`
(|parenthesis )|close_parenthesis [|bracket ]|close_bracket \\{|brace \\}|close_brace \\langle|angle_bracket \\rangle \\lfloor|floor \\rfloor \\lceil|ceiling \\rceil \\vert|vertical_bar \\Vert|double_bar \\lVert \\rVert \\ulcorner \\urcorner \\llcorner \\lrcorner`) },
  { id: 'accents', label: 'Accents', items: syms(`
\\hat{a}|hat \\bar{a}|bar \\vec{a}|vector \\dot{a}|dot \\ddot{a}|double_dot \\tilde{a}|tilde \\acute{a}|acute \\grave{a}|grave \\breve{a}|breve \\check{a}|caron \\mathring{a}|ring \\widehat{ab}|wide_hat \\widetilde{ab}|wide_tilde \\overline{ab}|overline \\underline{ab}|underline \\overrightarrow{AB}|arrow_over \\overleftarrow{AB} \\overleftrightarrow{AB} \\overbrace{a+b}|overbrace \\underbrace{a+b}|underbrace`) },
  { id: 'fonts', label: 'Letter styles', items: syms(`
\\mathbf{A}|bold \\boldsymbol{\\alpha}|bold_symbol \\mathit{A}|italic \\mathrm{A}|upright \\mathsf{A}|sans_serif \\mathtt{A}|typewriter \\mathcal{A}|calligraphic \\mathscr{A}|script \\mathfrak{A}|fraktur \\mathbb{A}|blackboard_bold`) },
  { id: 'structures', label: 'Structures', items: syms(`
\\frac{a}{b}|fraction \\dfrac{a}{b}|display_fraction \\tfrac{a}{b}|small_fraction \\sqrt{x}|square_root \\sqrt[n]{x}|nth_root x^{n}|power x_{i}|subscript x_{i}^{n}|sub_and_super \\binom{n}{k}|binomial \\overset{!}{=}|over_symbol \\underset{x}{\\min}|under_symbol \\xrightarrow{f}|labelled_arrow \\boxed{x}|box \\cancel{x}|cancel`) },
];

const E = (cat, title, desc, code, display = false, keywords = '') => ({ cat, title, desc, code, display, keywords });

/** How-to reference: searchable entries with the code and its rendering. */
export const LATEX_REFERENCE = [
  // Basics
  E('Basics', 'Inline vs display', 'Inline equations sit inside a sentence. Display equations get their own centered line and larger operators. Choose with the Inline/Display switch.', '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}', true, 'mode block'),
  E('Basics', 'Superscript (power)', 'Use ^ for superscripts. Wrap more than one character in braces.', 'x^2 + y^{10} + e^{i\\pi}', false, 'exponent power raise'),
  E('Basics', 'Subscript', 'Use _ for subscripts. Braces group longer subscripts.', 'a_1, a_{12}, x_{i,j}', false, 'index lower'),
  E('Basics', 'Both together', 'Subscript and superscript can be combined in either order.', 'x_i^2 = x^2_i', false, ''),
  E('Basics', 'Fractions', '\\frac{top}{bottom}. \\dfrac forces full size, \\tfrac forces small size.', '\\frac{a}{b} \\quad \\dfrac{a}{b} \\quad \\tfrac{a}{b}', true, 'divide over'),
  E('Basics', 'Nested fractions', 'Fractions can contain fractions. \\cfrac makes neat continued fractions.', '\\cfrac{1}{1 + \\cfrac{1}{1 + x}}', true, 'continued'),
  E('Basics', 'Roots', '\\sqrt{x} for a square root; \\sqrt[n]{x} for the nth root.', '\\sqrt{2} \\quad \\sqrt[3]{x} \\quad \\sqrt{\\frac{a}{b}}', false, 'square cube radical'),
  E('Basics', 'Binomial coefficient', '\\binom{n}{k} — read “n choose k”.', '\\binom{n}{k} = \\frac{n!}{k!(n-k)!}', true, 'choose combination'),
  E('Basics', 'Special characters', 'These characters have meaning in LaTeX; put a backslash in front to print them.', '\\% \\quad \\$ \\quad \\# \\quad \\& \\quad \\_ \\quad \\{ \\} \\quad \\backslash', false, 'escape percent dollar hash ampersand underscore'),

  // Line breaks & alignment
  E('Lines & alignment', 'New line', 'Type \\\\ (two backslashes) to start a new line. Use Display mode for multi-line equations.', 'a = b + c \\\\ d = e + f', true, 'newline line break linebreak return \\\\'),
  E('Lines & alignment', 'New line (alternative)', '\\newline does the same as \\\\.', 'x + y \\newline z', true, 'newline line break'),
  E('Lines & alignment', 'Align at the = sign', 'Inside aligned, put & before the symbol to line up and \\\\ between lines.', '\\begin{aligned} f(x) &= (x+1)^2 \\\\ &= x^2 + 2x + 1 \\end{aligned}', true, 'aligned align equals line up multiline steps derivation'),
  E('Lines & alignment', 'Numbered lines', 'The align environment numbers each line. Use align* for no numbers.', '\\begin{align} a &= b \\\\ c &= d \\end{align}', true, 'equation numbers align star'),
  E('Lines & alignment', 'Your own equation number', '\\tag{…} labels a display equation with any number or text.', 'E = mc^2 \\tag{1}', true, 'number label tag'),
  E('Lines & alignment', 'Centered lines', 'gathered centers each line without aligning them.', '\\begin{gathered} x + y = 1 \\\\ x - y = 3 \\end{gathered}', true, 'gather center'),
  E('Lines & alignment', 'Long equation over lines', 'multline puts the first line left and the last line right.', '\\begin{multline} a + b + c + d \\\\ + e + f + g \\end{multline}', true, 'multline break long'),
  E('Lines & alignment', 'Two columns of alignment', 'More & marks create more aligned columns.', '\\begin{aligned} x &= 1, & y &= 2 \\\\ z &= 3, & w &= 4 \\end{aligned}', true, 'columns'),

  // Spacing & text
  E('Spacing & text', 'Spaces', 'LaTeX ignores normal spaces in math. Use these: \\, thin, \\: medium, \\; thick, \\quad, \\qquad wide, \\! negative.', 'a\\,b \\quad a\\:b \\quad a\\;b \\quad a\\quad b \\quad a\\qquad b', false, 'space gap thin quad'),
  E('Spacing & text', 'Words inside math', '\\text{…} keeps normal text and spaces.', 'f(x) = 0 \\text{ for all } x > 0', false, 'text words roman'),
  E('Spacing & text', 'Bold and italic text', '\\textbf and \\textit style text inside math.', '\\textbf{bold} \\text{ and } \\textit{italic}', false, 'bold italic'),
  E('Spacing & text', 'Function names', 'Use \\sin, \\log, \\lim… so names are upright. \\operatorname{…} makes new ones.', '\\sin x + \\log y + \\operatorname{sgn}(z)', false, 'operator name upright'),
  E('Spacing & text', 'Ellipses', '\\ldots on the baseline, \\cdots centered, \\vdots vertical, \\ddots diagonal.', '1, 2, \\ldots, n \\quad 1 + 2 + \\cdots + n', false, 'dots ellipsis'),

  // Brackets
  E('Brackets', 'Auto-sized brackets', '\\left and \\right grow the brackets to fit what they contain.', '\\left( \\frac{a}{b} \\right) \\quad \\left[ x^2 \\right] \\quad \\left\\{ y \\right\\}', true, 'parentheses left right size grow'),
  E('Brackets', 'Manual sizes', '\\big, \\Big, \\bigg, \\Bigg set a fixed size.', '\\big( \\Big( \\bigg( \\Bigg(', false, 'big size'),
  E('Brackets', 'One-sided bracket', 'Use a dot for the invisible side.', '\\left. \\frac{df}{dx} \\right|_{x=0}', true, 'evaluated at bar'),
  E('Brackets', 'Absolute value and norm', '\\lvert … \\rvert and \\lVert … \\rVert.', '\\lvert x \\rvert \\quad \\lVert v \\rVert', false, 'abs absolute norm'),
  E('Brackets', 'Floor, ceiling, angle', '', '\\lfloor x \\rfloor \\quad \\lceil x \\rceil \\quad \\langle u, v \\rangle', false, 'floor ceiling inner product'),

  // Sums, integrals, limits
  E('Sums, integrals & limits', 'Sum', 'Limits go below and above in display mode, to the side inline.', '\\sum_{k=1}^{n} k^2', true, 'sigma series'),
  E('Sums, integrals & limits', 'Product', '', '\\prod_{i=1}^{n} x_i', true, 'pi'),
  E('Sums, integrals & limits', 'Integral', 'Add \\, before dx for the conventional small space.', '\\int_{0}^{\\infty} e^{-x}\\,dx = 1', true, 'integrate'),
  E('Sums, integrals & limits', 'Multiple integrals', '', '\\iint_{D} f\\,dA \\quad \\iiint_{V} g\\,dV \\quad \\oint_{C} \\mathbf{F}\\cdot d\\mathbf{r}', true, 'double triple contour'),
  E('Sums, integrals & limits', 'Limit', '', '\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1', true, 'approaches'),
  E('Sums, integrals & limits', 'Limits beside, inline style', '\\limits forces limits above and below; \\nolimits puts them beside.', '\\sum\\nolimits_{i} a_i \\quad \\int\\limits_a^b f', false, 'limits nolimits'),
  E('Sums, integrals & limits', 'Multi-line subscript', '\\substack stacks lines under an operator.', '\\sum_{\\substack{0 < i < m \\\\ 0 < j < n}} P(i, j)', true, 'substack conditions'),

  // Calculus
  E('Calculus', 'Derivatives', '', '\\frac{dy}{dx} \\quad \\frac{d^2 y}{dx^2} \\quad f\'(x) \\quad f\'\'(x)', true, 'differentiate prime'),
  E('Calculus', 'Partial derivatives', '', '\\frac{\\partial f}{\\partial x} \\quad \\frac{\\partial^2 f}{\\partial x \\partial y}', true, 'partial'),
  E('Calculus', 'Dot notation', 'Time derivatives in physics.', '\\dot{x} \\quad \\ddot{x}', false, 'newton'),
  E('Calculus', 'Gradient, divergence, curl', '', '\\nabla f \\quad \\nabla \\cdot \\mathbf{F} \\quad \\nabla \\times \\mathbf{F}', false, 'nabla vector calculus'),

  // Matrices
  E('Matrices & arrays', 'Matrix with parentheses', 'Separate columns with & and rows with \\\\.', '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', true, 'pmatrix'),
  E('Matrices & arrays', 'Other bracket styles', 'bmatrix [ ], Bmatrix { }, vmatrix | | (determinant), Vmatrix ‖ ‖, matrix none.', '\\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix} \\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}', true, 'bmatrix vmatrix determinant'),
  E('Matrices & arrays', 'Large matrix with dots', '', '\\begin{pmatrix} a_{11} & \\cdots & a_{1n} \\\\ \\vdots & \\ddots & \\vdots \\\\ a_{m1} & \\cdots & a_{mn} \\end{pmatrix}', true, 'general matrix'),
  E('Matrices & arrays', 'Small inline matrix', '', '\\left(\\begin{smallmatrix} a & b \\\\ c & d \\end{smallmatrix}\\right)', false, 'smallmatrix'),
  E('Matrices & arrays', 'Array with lines', 'array lets you choose column alignment (l, c, r) and add | lines and \\hline.', '\\begin{array}{c|c} x & y \\\\ \\hline 1 & 2 \\\\ 3 & 4 \\end{array}', true, 'table grid hline'),
  E('Matrices & arrays', 'Piecewise function', 'cases gives a brace with conditions.', 'f(x) = \\begin{cases} x^2 & \\text{if } x \\ge 0 \\\\ -x & \\text{otherwise} \\end{cases}', true, 'cases piecewise conditions'),

  // Decorations
  E('Decorations', 'Accents', '', '\\hat{x} \\quad \\bar{x} \\quad \\vec{v} \\quad \\tilde{n} \\quad \\dot{a}', false, 'hat bar vector'),
  E('Decorations', 'Over and under braces', '', '\\overbrace{a + b + c}^{\\text{sum}} = \\underbrace{x \\cdot y}_{\\text{product}}', true, 'brace annotate'),
  E('Decorations', 'Symbol over or under', '\\overset{top}{base}, \\underset{bottom}{base}.', 'A \\overset{\\text{def}}{=} B \\quad \\underset{x \\in S}{\\arg\\max}\\, f(x)', true, 'stack overset underset stackrel'),
  E('Decorations', 'Labeled arrows', '', 'A \\xrightarrow{f} B \\xleftarrow[g]{} C', true, 'arrow label map'),
  E('Decorations', 'Box and cancel', '', '\\boxed{E = mc^2} \\quad \\cancel{x} \\quad \\bcancel{y}', false, 'boxed strike cross out'),
  E('Decorations', 'Color', 'Colors print in color in the PDF and on color screens.', '\\color{blue} x + \\textcolor{red}{y}', false, 'color color red blue'),

  // Letter styles
  E('Letter styles', 'Bold, calligraphic, blackboard', '', '\\mathbf{v} \\quad \\boldsymbol{\\alpha} \\quad \\mathcal{L} \\quad \\mathbb{R} \\quad \\mathfrak{g} \\quad \\mathscr{F}', false, 'bold font mathbb mathcal'),
  E('Letter styles', 'Upright, sans-serif, typewriter', '', '\\mathrm{d}x \\quad \\mathsf{T} \\quad \\mathtt{code}', false, 'roman sans mono'),

  // Common formulas
  E('Common formulas', 'Quadratic formula', '', 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}', true, 'quadratic'),
  E('Common formulas', 'Pythagorean theorem', '', 'a^2 + b^2 = c^2', false, 'pythagoras triangle'),
  E('Common formulas', 'Euler’s identity', '', 'e^{i\\pi} + 1 = 0', false, 'euler'),
  E('Common formulas', 'Normal distribution', '', 'f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-\\frac{1}{2}\\left(\\frac{x-\\mu}{\\sigma}\\right)^2}', true, 'gaussian bell statistics'),
  E('Common formulas', 'Bayes’ theorem', '', 'P(A \\mid B) = \\frac{P(B \\mid A)\\,P(A)}{P(B)}', true, 'probability conditional'),
  E('Common formulas', 'Taylor series', '', 'f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!}(x-a)^n', true, 'series expansion'),
  E('Common formulas', 'Set builder', '', 'S = \\{\\, x \\in \\mathbb{R} \\mid x > 0 \\,\\}', false, 'set notation'),
  E('Common formulas', 'Modular arithmetic', '', 'a \\equiv b \\pmod{n} \\quad a \\bmod n', false, 'mod congruence'),
  E('Common formulas', 'Degrees and units', 'Use ^\\circ or \\degree for degrees and \\text for units.', '90^\\circ \\quad 37\\,\\text{°C} \\quad 9.8\\,\\text{m/s}^2', false, 'degree units celsius'),
];
