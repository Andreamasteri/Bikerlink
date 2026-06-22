// BikerLink Play Store Screenshots - SVG+sharp, no emoji, DejaVu Sans font
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

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
function circle(cx, cy, r, fill, opacity=1) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="${opacity}"/>`;
}
function line(x1, y1, x2, y2, stroke, sw=1, opacity=1) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}"/>`;
}
function text(x, y, content, size, fill, anchor='start', weight='400', opacity=1) {
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" opacity="${opacity}">${content}</text>`;
}
function textBox(x, y, w, h, label, labelColor, bgColor, rx=12) {
  return `${rect(x, y, w, h, bgColor, rx)}${text(x+w/2, y+h/2+5, label, 12, labelColor, 'middle', '600')}`;
}

// Icon shapes (pure SVG paths)
function iconMotorcycle(cx, cy, size, color) {
  // Simplified moto: two circles (wheels) + body shape
  const s = size/24;
  const r = 8*s;
  const lx = cx-14*s, rx2 = cx+14*s, wh = cy+6*s;
  return `
    ${circle(lx, wh, r, 'none')}
    <circle cx="${lx}" cy="${wh}" r="${r}" fill="none" stroke="${color}" stroke-width="${2*s}"/>
    <circle cx="${rx2}" cy="${wh}" r="${r}" fill="none" stroke="${color}" stroke-width="${2*s}"/>
    <path d="M${lx+r} ${wh} L${cx-4*s} ${cy-4*s} L${cx+8*s} ${cy-4*s} L${rx2-r} ${wh}" fill="none" stroke="${color}" stroke-width="${2*s}" stroke-linecap="round"/>
    <circle cx="${cx+2*s}" cy="${cy-4*s}" r="${4*s}" fill="${color}" opacity="0.8"/>
  `;
}
function iconPerson(cx, cy, size, color) {
  const s = size/24;
  return `
    ${circle(cx, cy-6*s, 6*s, color, 0.9)}
    <path d="M${cx-9*s} ${cy+12*s} Q${cx-9*s} ${cy+2*s} ${cx} ${cy+2*s} Q${cx+9*s} ${cy+2*s} ${cx+9*s} ${cy+12*s}" fill="${color}" opacity="0.8"/>
  `;
}
function iconShield(cx, cy, size, color) {
  const s = size/24;
  return `<path d="M${cx} ${cy-11*s} L${cx+9*s} ${cy-7*s} L${cx+9*s} ${cy+1*s} Q${cx+9*s} ${cy+7*s} ${cx} ${cy+11*s} Q${cx-9*s} ${cy+7*s} ${cx-9*s} ${cy+1*s} L${cx-9*s} ${cy-7*s} Z" fill="${color}" opacity="0.85"/>
    ${text(cx, cy+5, 'B', size*0.4, '#fff', 'middle', '700')}`;
}
function iconPin(cx, cy, size, color) {
  const s = size/24;
  return `<path d="M${cx} ${cy+10*s} Q${cx-8*s} ${cy+2*s} ${cx-8*s} ${cy-3*s} A${8*s} ${8*s} 0 1 1 ${cx+8*s} ${cy-3*s} Q${cx+8*s} ${cy+2*s} ${cx} ${cy+10*s} Z" fill="${color}"/>
    ${circle(cx, cy-3*s, 4*s, '#fff', 0.6)}`;
}
function iconChat(cx, cy, size, color) {
  const s = size/24;
  return `<rect x="${cx-9*s}" y="${cy-8*s}" width="${18*s}" height="${13*s}" rx="${4*s}" fill="${color}" opacity="0.85"/>
    <path d="M${cx-4*s} ${cy+5*s} L${cx-7*s} ${cy+9*s} L${cx+2*s} ${cy+5*s} Z" fill="${color}" opacity="0.85"/>`;
}
function iconStar(cx, cy, size, color) {
  const s = size/24;
  return `<polygon points="${cx},${cy-9*s} ${cx+2.5*s},${cy-3*s} ${cx+9*s},${cy-3*s} ${cx+4*s},${cy+1*s} ${cx+6*s},${cy+8*s} ${cx},${cy+4*s} ${cx-6*s},${cy+8*s} ${cx-4*s},${cy+1*s} ${cx-9*s},${cy-3*s} ${cx-2.5*s},${cy-3*s}" fill="${color}"/>`;
}
function iconMegaphone(cx, cy, size, color) {
  const s = size/24;
  return `<path d="M${cx-9*s} ${cy-3*s} L${cx+4*s} ${cy-8*s} L${cx+4*s} ${cy+8*s} L${cx-9*s} ${cy+3*s} Z" fill="${color}" opacity="0.85"/>
    <rect x="${cx-9*s}" y="${cy-3*s}" width="${8*s}" height="${6*s}" rx="2" fill="${color}" opacity="0.6"/>`;
}
function iconMap(cx, cy, size, color) {
  const s = size/24;
  return `<path d="M${cx-9*s} ${cy-8*s} L${cx-3*s} ${cy-5*s} L${cx+3*s} ${cy-8*s} L${cx+9*s} ${cy-5*s} L${cx+9*s} ${cy+8*s} L${cx+3*s} ${cy+5*s} L${cx-3*s} ${cy+8*s} L${cx-9*s} ${cy+5*s} Z" fill="${color}" opacity="0.85"/>`;
}
function iconGear(cx, cy, size, color) {
  const s = size/24;
  return `${circle(cx, cy, 8*s, color, 0.85)}${circle(cx, cy, 4*s, C.bg)}`;
}

// Status bar
function statusBar(w) {
  return `${rect(0, 0, w, 44, C.surface)}
    ${text(24, 29, '9:41', 15, C.text, 'start', '600')}
    ${line(0, 44, w, 44, C.border)}
    ${text(w-16, 29, '100%', 13, C.textSec, 'end')}
    ${rect(w-72, 14, 54, 16, C.textSec, 4, 0.6)}
    ${rect(w-72, 14, 52, 16, C.green, 4, 0.7)}
    ${text(w-76, 27, 'WiFi', 11, C.textSec, 'end')}`;
}

// Bottom tab bar
function tabBar(w, h, active) {
  const tabs = [
    { label: 'Mappa', iconFn: (cx,cy)=>iconMap(cx,cy,22,active===0?C.accent:C.textMut) },
    { label: 'Match', iconFn: (cx,cy)=>`${iconPerson(cx-7,cy,18,C.blue)}${iconPerson(cx+7,cy,18,C.pink)}` },
    { label: 'Proposte', iconFn: (cx,cy)=>iconMegaphone(cx,cy,22,active===2?C.accent:C.textMut) },
    { label: 'Chat', iconFn: (cx,cy)=>iconChat(cx,cy,22,active===3?C.accent:C.textMut) },
    { label: 'Profilo', iconFn: (cx,cy)=>iconPerson(cx,cy,22,active===4?C.accent:C.textMut) },
  ];
  const tw = w / tabs.length;
  const by = h - 80;
  let out = `${rect(0, by, w, 80, C.surface)}${line(0, by, w, by, C.border)}`;
  tabs.forEach((t, i) => {
    const cx = tw * i + tw / 2;
    const color = i === active ? C.accent : C.textMut;
    const fw = i === active ? '700' : '400';
    out += t.iconFn(cx, by+24);
    out += text(cx, by+54, t.label, 12, color, 'middle', fw);
    if (i === active) out += `${circle(cx, by+64, 3, C.accent)}`;
  });
  return out;
}

// Header bar
function header(w, title, subtitle, y=44) {
  const hh = subtitle ? 70 : 58;
  return `${rect(0, y, w, hh, C.surface)}
    ${line(0, y+hh, w, y+hh, C.border)}
    ${text(24, y+(subtitle?36:38), title, subtitle?21:22, C.text, 'start', '700')}
    ${subtitle ? text(24, y+56, subtitle, 13, C.textSec) : ''}`;
}

// Card container
function card(x, y, w, h, rx=12) {
  return `${rect(x, y, w, h, C.surface, rx)}${rect(x, y, w, h, C.border, rx, 0)}
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="none" stroke="${C.border}" stroke-width="1"/>`;
}

// Avatar circle with initials
function avatar(cx, cy, r, color, initials) {
  return `${circle(cx, cy, r, color, 0.9)}${text(cx, cy+6, initials, r*0.7, '#fff', 'middle', '700')}`;
}

// Pill badge
function pill(x, y, w, h, label, color, rx=10) {
  return `${rect(x, y, w, h, color, rx, 0.15)}${text(x+w/2, y+h*0.67, label, Math.min(h*0.55,13), color, 'middle', '600')}`;
}

// Simple map background
function mapBg(x, y, w, h) {
  let out = `${rect(x, y, w, h, '#0A120A')}`;
  // Horizontal roads
  const hroads = [0.2,0.4,0.6,0.75,0.9];
  hroads.forEach(p => {
    out += `${rect(x, y+h*p-4, w, 8, '#183018', 0)}`;
    out += `${rect(x, y+h*p-1, w, 2, '#245224', 0, 0.5)}`;
  });
  // Vertical roads
  const vroads = [0.15,0.3,0.5,0.65,0.82];
  vroads.forEach(p => {
    out += `${rect(x+w*p-4, y, 8, h, '#183018', 0)}`;
    out += `${rect(x+w*p-1, y, 2, h, '#245224', 0, 0.5)}`;
  });
  // City blocks
  const blocks = [{x:0.17,y:0.22,w:0.11,h:0.16},{x:0.32,y:0.22,w:0.16,h:0.16},{x:0.52,y:0.22,w:0.11,h:0.16},
    {x:0.17,y:0.42,w:0.11,h:0.30},{x:0.32,y:0.42,w:0.16,h:0.30},{x:0.67,y:0.42,w:0.13,h:0.30}];
  blocks.forEach(b => out += `${rect(x+w*b.x, y+h*b.y, w*b.w, h*b.h, '#152015', 0, 0.8)}`);
  return out;
}

// Biker pin on map
function bikerPin(cx, cy, label, color) {
  return `${circle(cx, cy, 22, color, 0.12)}
    ${circle(cx, cy, 14, color, 0.9)}
    ${iconMotorcycle(cx, cy, 16, '#fff')}
    ${label ? `${rect(cx-20, cy-38, 40, 18, C.surface, 9)}${text(cx, cy-26, label, 10, C.text, 'middle','600')}` : ''}`;
}

// Route polyline (simplified)
function routePath(pts, color, sw=4) {
  const d = pts.map((p,i)=>(i===0?'M':'L')+p[0]+' '+p[1]).join(' ');
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

// SVG wrapper
function svg(w, h, content) {
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    ${rect(0, 0, w, h, C.bg)}
    ${content}
  </svg>`;
}

const part2 = require('./generate-play-screenshots.part2.js');
part2.setup(sharp, fs, path, C, FONT, rect, circle, line, text, textBox, iconMotorcycle, iconPerson, iconShield, iconPin, iconChat, iconStar, iconMegaphone, iconMap, iconGear, statusBar, tabBar, header, card, avatar, pill, mapBg, bikerPin, routePath, svg);

async function main() {
  const OUT = path.join(__dirname, '..', 'play-screenshots');
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

  const phoneW = 1080, phoneH = 1920;
  const tabletW = 2048, tabletH = 2732;
  const cbW = 1920, cbH = 1080;

  const { screensPhone, screensTablet, screensChromebook } = part2.getScreens();

  console.log('Generating screenshots...');
  for (const s of screensPhone) {
    const svgStr = s.fn(phoneW, phoneH);
    await sharp(Buffer.from(svgStr)).toFile(path.join(OUT, `phone_${s.name}.png`));
  }
  for (const s of screensTablet) {
    const svgStr = s.fn(tabletW, tabletH);
    await sharp(Buffer.from(svgStr)).toFile(path.join(OUT, `tablet_${s.name}.png`));
  }
  for (const s of screensChromebook) {
    const svgStr = s.fn(cbW, cbH);
    await sharp(Buffer.from(svgStr)).toFile(path.join(OUT, `cb_${s.name}.png`));
  }
  console.log('Done.');
}

main().catch(console.error);
