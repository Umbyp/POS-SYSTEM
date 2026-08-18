/**
 * Printable width for an 80mm thermal roll.
 *
 * 80mm is the *paper*, not the print area. A standard 80mm head at 203dpi lays
 * down 576 dots — 72.1mm — leaving about 4mm of unprintable margin on each side.
 * The slip used to render its content across 74.7mm (an 80mm box less 2×10px of
 * padding), so roughly 1.3mm of each edge landed in that dead zone: enough to
 * shave the right-aligned prices and the ends of the dashed rules, or to make
 * the browser silently scale the whole ticket down to fit.
 *
 * 72mm is the safe figure across the common models (Epson TM-T82/T88, Xprinter,
 * WORREX W-P8390 and friends). If a particular printer really does image the
 * full width, this is the one number to raise — the layout is fluid and will
 * simply use the extra millimetres.
 */
export const THERMAL_CONTENT_WIDTH = '72mm';

/** The roll itself, for `@page { size: ... auto }`. */
export const THERMAL_PAPER_WIDTH = '80mm';
