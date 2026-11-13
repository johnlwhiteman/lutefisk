// Common print trim sizes (inches) with margins suited to each size.
// inside = gutter (binding) side, outside = fore-edge side.
const m = (w, h, label, top, bottom, inside, outside) => ({ w, h, label, top, bottom, inside, outside });

export const TRIMS = {
  '5x8': m(5, 8, '5″ × 8″ (Mass-market trade)', 0.7, 0.7, 0.8, 0.55),
  '5.25x8': m(5.25, 8, '5.25″ × 8″', 0.7, 0.7, 0.8, 0.55),
  '5.5x8.5': m(5.5, 8.5, '5.5″ × 8.5″ (Digest)', 0.72, 0.72, 0.85, 0.6),
  '6x9': m(6, 9, '6″ × 9″ (US Trade)', 0.75, 0.75, 0.875, 0.625),
  '7x10': m(7, 10, '7″ × 10″ (Textbook)', 0.8, 0.8, 0.9, 0.7),
  '8.5x11': m(8.5, 11, '8.5″ × 11″ (Letter)', 0.9, 0.9, 1, 0.8),
  a5: m(5.83, 8.27, 'A5 (148 × 210 mm)', 0.72, 0.72, 0.85, 0.6),
  b5: m(6.93, 9.84, 'B5 (176 × 250 mm)', 0.8, 0.8, 0.9, 0.7),
};

export const PX_PER_IN = 96;
