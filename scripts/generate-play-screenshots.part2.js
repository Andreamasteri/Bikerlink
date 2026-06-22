const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Re-import or redefine constants as needed for part2
const C = {
  bg: '#0D0D0D', surface: '#1E1E1E', surfaceL: '#2A2A2A', surfaceXL: '#363636',
  accent: '#FF6600', accentD: '#CC5200', accentFaded: '#FF660020',
  text: '#FFFFFF', textSec: '#9A9A9A', textMut: '#555555',
  blue: '#4A90D9', blueFaded: '#4A90D920',
  pink: '#E91E8C', pinkFaded: '#E91E8C20',
  green: '#4CAF50', red: '#E63946', redFaded: '#E6394620',
  border: '#2D2D2D', warning: '#FF8C00',
};
const FONT = 'DejaVu Sans';

function rect(x, y, w, h, fill, rx=0, opacity=1) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" opacity="${opacity}"/>`;
}
function text(x, y, content, size, fill, anchor='start', weight='400', opacity=1) {
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" opacity="${opacity}">${content}</text>`;
}
function line(x1, y1, x2, y2, stroke, sw=1, opacity=1) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}"/>`;
}

// ===== CHROMEBOOK LANDSCAPE =====

function cbStatusBar(w) {
  return `${rect(0, 0, w, 36, C.surface)}
    ${line(0, 36, w, 36, C.border)}
    ${text(16, 24, 'BikerLink', 14, C.accent, 'start', '700')}
    ${text(w/2, 24, 'Mappa  |  Motoclub  |  Proposte  |  Chat  |  Profilo', 13, C.textMut, 'middle')}
    ${text(w-16, 24, '9:41  100%', 13, C.textSec, 'end')}`;
}

module.exports = {
  cbStatusBar,
  // Other chromebook functions...
};
