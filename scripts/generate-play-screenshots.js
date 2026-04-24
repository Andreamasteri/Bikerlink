#!/usr/bin/env node
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

// ===== SCREEN GENERATORS =====

function screenMappa(w, h) {
  const mapY=114, mapH=h-114-80;
  const pins=[
    {cx:w*0.22,cy:mapY+mapH*0.22,label:'MotoRider42',color:C.blue},
    {cx:w*0.55,cy:mapY+mapH*0.38,label:'DucatiGuy',color:C.blue},
    {cx:w*0.72,cy:mapY+mapH*0.58,label:'SofiaR.',color:C.pink},
    {cx:w*0.32,cy:mapY+mapH*0.62,label:'AlpiRider',color:C.blue},
    {cx:w*0.80,cy:mapY+mapH*0.28,label:'VespaRm.',color:C.accent},
    {cx:w*0.48,cy:mapY+mapH*0.78,label:null,color:C.blue},
  ];
  const cx=w/2, cy=mapY+mapH*0.48;
  return svg(w, h, `
    ${mapBg(0, mapY, w, mapH)}
    ${pins.map(p=>bikerPin(p.cx, p.cy, p.label, p.color)).join('')}
    ${circle(cx, cy, 80, C.accent, 0.06)}
    <circle cx="${cx}" cy="${cy}" r="80" fill="none" stroke="${C.accent}" stroke-width="1.5" stroke-dasharray="8 5" opacity="0.4"/>
    ${circle(cx, cy, 8, C.blue, 0.95)}
    ${circle(cx, cy, 18, C.blue, 0.2)}
    ${card(12, h-168, w-24, 78, 14)}
    ${text(28, h-138, '6 biker nelle vicinanze', 16, C.text, 'start', '700')}
    ${text(28, h-116, 'Raggio: 50 km  |  Aggiornato adesso', 13, C.textSec)}
    ${pill(28, h-102, 110, 24, 'Espandi raggio', C.accent, 12)}
    ${statusBar(w)}
    ${header(w, 'BikerLink', 'Mappa biker vicini')}
    ${tabBar(w, h, 0)}
  `);
}

function screenMatch(w, h) {
  const cw=(w-40)/2, cardY=128, ch=290;
  return svg(w, h, `
    ${card(12, cardY, cw, ch)}
    ${avatar(12+cw/2, cardY+60, 40, C.blue, 'M')}
    ${text(12+cw/2, cardY+118, 'MotoRider42', 16, C.text, 'middle', '700')}
    ${text(12+cw/2, cardY+140, 'Biker - Roma', 13, C.textSec, 'middle')}
    ${pill(12+cw/2-40, cardY+156, 80, 24, 'Naked', C.blue)}
    ${pill(12+cw/2-45, cardY+188, 90, 24, 'Mozzafiato', C.accent)}
    ${text(12+cw/2, cardY+232, 'Ducati 821', 13, C.textSec, 'middle')}
    ${text(12+cw/2, cardY+254, '12 km da te', 13, C.accent, 'middle', '600')}
    ${card(28+cw, cardY, cw, ch)}
    ${avatar(28+cw+cw/2, cardY+60, 40, C.pink, 'S')}
    ${text(28+cw+cw/2, cardY+118, 'SofiaRider', 16, C.text, 'middle', '700')}
    ${text(28+cw+cw/2, cardY+140, 'Zavorrina - MI', 13, C.pink, 'middle')}
    ${pill(28+cw+cw/2-38, cardY+156, 76, 24, 'Touring', C.pink)}
    ${pill(28+cw+cw/2-35, cardY+188, 70, 24, 'Allegra', C.warning)}
    ${text(28+cw+cw/2, cardY+232, 'Honda CB500F', 13, C.textSec, 'middle')}
    ${text(28+cw+cw/2, cardY+254, '8 km da te', 13, C.accent, 'middle', '600')}
    ${text(w/2, cardY+310, 'Compatibilita\'', 14, C.textSec, 'middle')}
    ${rect(w*0.1, cardY+322, w*0.8, 6, C.surfaceL, 3)}
    ${rect(w*0.1, cardY+322, w*0.8*0.87, 6, C.accent, 3)}
    ${text(w/2, cardY+358, '87% compatibili', 22, C.accent, 'middle', '800')}
    ${rect(20, cardY+378, w-40, 54, C.accent, 27)}
    ${text(w/2, cardY+412, 'Invia Match', 18, '#fff', 'middle', '700')}
    ${rect(20, cardY+444, w-40, 44, C.surfaceL, 22)}
    ${text(w/2, cardY+472, 'Salta', 15, C.textSec, 'middle')}
    ${statusBar(w)}
    ${header(w, 'Match', 'Trova il tuo compagno di viaggio')}
    ${tabBar(w, h, 1)}
  `);
}

function screenMotoclub(w, h) {
  const clubs = [
    {name:'Ducati Club Roma', members:'142', events:'3', color:C.red},
    {name:'Vespa Riders Milano', members:'89', events:'7', color:C.accent},
    {name:'BMW Motorrad Nord', members:'213', events:'2', color:C.blue},
    {name:'Honda Club Italia', members:'67', events:'1', color:C.green},
    {name:'KTM Adventure Crew', members:'55', events:'4', color:C.warning},
  ];
  let content = `${rect(12, 118, w-24, 36, C.surfaceL, 10)}${text(36, 141, 'Cerca un club...', 14, C.textMut)}`;
  clubs.forEach((cl, i) => {
    const cy = 168 + i*106;
    content += `${card(12, cy, w-24, 94)}
      ${circle(52, cy+47, 26, cl.color, 0.15)}
      ${iconShield(52, cy+47, 28, cl.color)}
      ${text(90, cy+32, cl.name, 16, C.text, 'start', '700')}
      ${text(90, cy+54, members(cl.members)+' membri', 13, C.textSec)}
      ${text(90, cy+72, cl.events+' eventi in programma', 13, C.textSec)}
      ${rect(w-90, cy+30, 70, 28, cl.color, 14, 0.12)}
      ${text(w-55, cy+49, 'Unisciti', 12, cl.color, 'middle', '600')}`;
  });
  function members(n){ return n; }
  return svg(w, h, `${content}
    ${statusBar(w)}
    ${header(w, 'Motoclub', 'Directory club motociclistici')}
    ${tabBar(w, h, 2)}
  `);
}

function screenChat(w, h) {
  const convs = [
    {name:'Ducati Club Roma', last:'Chi viene sabato al giro?', time:'10:42', unread:5, color:C.accent, icon:'C'},
    {name:'MotoRider42', last:'Sei disponibile domenica?', time:'09:15', unread:2, color:C.blue, icon:'M'},
    {name:'SofiaRider', last:'Ho trovato un percorso top!', time:'Ieri', unread:0, color:C.pink, icon:'S'},
    {name:'BMW Club Nord', last:'Foto del giro di ieri', time:'Ieri', unread:1, color:C.blue, icon:'B'},
    {name:'DucatiGuy', last:'Grazie del consiglio!', time:'Lun', unread:0, color:C.blue, icon:'D'},
    {name:'Vespa Riders', last:'Nuovo raduno a Firenze', time:'Dom', unread:3, color:C.warning, icon:'V'},
  ];
  let rows = `${rect(0, 114, w, 44, C.surface)}
    ${text(20, 142, 'Amici (3)', 13, C.textSec, 'start', '600')}
    ${rect(w-120, 118, 108, 32, C.accent, 16)}
    ${text(w-66, 139, '+ Nuova Chat', 12, '#fff', 'middle', '600')}`;
  // Friend bubbles
  ['M','S','D'].forEach((l,i)=>{
    const fcx = 24 + i*58;
    rows += `${circle(fcx, 188, 22, i===1?C.pink:C.blue, 0.9)}${text(fcx, 194, l, 16, '#fff', 'middle', '700')}`;
  });
  let startY = 224;
  convs.forEach((c, i) => {
    const cy = startY + i*84;
    rows += `${line(60, cy+83, w-12, cy+83, C.border, 0.5)}
      ${avatar(36, cy+42, 20, c.color, c.icon)}
      ${text(66, cy+28, c.name, 15, C.text, 'start', c.unread>0?'700':'500')}
      ${text(66, cy+50, c.last.substring(0,36)+(c.last.length>36?'...':''), 13, C.textSec)}
      ${text(w-14, cy+28, c.time, 12, C.textMut, 'end')}`;
    if(c.unread>0) rows += `${circle(w-22, cy+52, 12, C.accent, 0.9)}${text(w-22, cy+57, String(c.unread), 11, '#fff', 'middle', '700')}`;
  });
  return svg(w, h, `${rows}
    ${statusBar(w)}
    ${header(w, 'Chat', '')}
    ${tabBar(w, h, 3)}
  `);
}

function screenTracking(w, h) {
  const mapY=114, mapH=h*0.44;
  const pts=[];
  for(let i=0;i<=20;i++){
    pts.push([w*0.1+(w*0.8)*(i/20)+Math.sin(i*0.7)*18, mapY+mapH*0.18+(mapH*0.64)*(i/20)+Math.cos(i*0.5)*14]);
  }
  const sx=pts[pts.length-1][0], sy=pts[pts.length-1][1];
  const statsY=mapY+mapH+16;
  const statsH=h-mapY-mapH-80-20;
  return svg(w, h, `
    ${mapBg(0, mapY, w, mapH)}
    ${routePath(pts, C.accent, 4)}
    ${circle(pts[0][0], pts[0][1], 8, C.green, 0.95)}
    ${circle(sx, sy, 10, C.blue, 0.95)}
    ${circle(sx, sy, 22, C.blue, 0.2)}
    ${card(12, statsY, w-24, Math.min(statsH, 420))}
    ${text(w/2, statsY+58, '87', 54, C.accent, 'middle', '800')}
    ${text(w/2, statsY+84, 'km/h velocita\'', 15, C.textSec, 'middle')}
    ${line(12, statsY+100, w-12, statsY+100, C.border)}
    ${line(w/3, statsY+110, w/3, statsY+182, C.border)}
    ${line(w*2/3, statsY+110, w*2/3, statsY+182, C.border)}
    ${text(w/6, statsY+138, '67.4 km', 20, C.text, 'middle', '700')}
    ${text(w/6, statsY+162, 'percorsi', 13, C.textSec, 'middle')}
    ${text(w/2, statsY+138, '1h 23m', 20, C.text, 'middle', '700')}
    ${text(w/2, statsY+162, 'durata', 13, C.textSec, 'middle')}
    ${text(w*5/6, statsY+138, '+450 m', 20, C.text, 'middle', '700')}
    ${text(w*5/6, statsY+162, 'dislivello', 13, C.textSec, 'middle')}
    ${line(12, statsY+188, w-12, statsY+188, C.border)}
    ${text(24, statsY+218, 'Velocita\' massima', 14, C.textSec)}
    ${text(w-24, statsY+218, '118 km/h', 16, C.accent, 'end', '700')}
    ${text(24, statsY+252, 'Moto: Ducati Monster 821', 14, C.textSec)}
    ${text(w-24, statsY+252, 'Naked', 13, C.blue, 'end', '600')}
    ${text(24, statsY+286, 'Partenza: Piazza Venezia, Roma', 14, C.textSec)}
    ${rect(20, statsY+310, w-40, 52, C.red, 26, 0.9)}
    ${text(w/2, statsY+343, 'Termina Giro', 17, '#fff', 'middle', '700')}
    ${statusBar(w)}
    ${header(w, 'Tracking GPS', 'Giro in corso - Live')}
    ${tabBar(w, h, 0)}
  `);
}

function screenGarage(w, h) {
  const motos=[
    {brand:'Ducati', model:'Monster 821', cc:'821cc', type:'Naked', style:'Mozzafiato', def:true},
    {brand:'Honda', model:'CB500F', cc:'500cc', type:'Naked', style:'Allegra', def:false},
  ];
  let content = `${rect(12, 118, w-24, 36, C.surfaceL, 10)}${text(36, 141, 'Cerca moto...', 14, C.textMut)}
    ${rect(w-76, 52, 64, 34, C.accent, 17)}
    ${text(w-44, 74, '+ Aggiungi', 11, '#fff', 'middle', '700')}`;
  motos.forEach((m, i) => {
    const cy = 168 + i*200;
    content += `${card(12, cy, w-24, 184)}`;
    if(m.def) content += `${pill(22, cy+10, 100, 24, '  Principale', C.accent, 12)}${iconStar(82, cy+22, 16, C.accent)}`;
    content += `
      ${iconMotorcycle(66, cy+72, 44, C.accent)}
      ${text(110, cy+52, m.brand+' '+m.model, 19, C.text, 'start', '700')}
      ${text(110, cy+76, m.cc+' - '+m.type, 14, C.textSec)}
      ${pill(110, cy+88, 70, 24, m.type, C.accent)}
      ${pill(188, cy+88, 80, 24, m.style, C.blue)}
      ${line(12, cy+128, w-12, cy+128, C.border)}
      ${rect(20, cy+142, (w-52)/2, 34, C.surfaceL, 10)}
      ${text(20+(w-52)/4, cy+164, 'Modifica', 13, C.text, 'middle')}
      ${rect(28+(w-52)/2, cy+142, (w-52)/2, 34, C.red, 10, 0.1)}
      ${text(28+(w-52)/2+(w-52)/4, cy+164, 'Elimina', 13, C.red, 'middle')}`;
  });
  return svg(w, h, `${content}
    ${text(w/2, h-100, 'Aggiungi fino a 5 moto al tuo garage', 13, C.textSec, 'middle')}
    ${statusBar(w)}
    ${header(w, 'Il mio Garage', 'Le tue moto')}
    ${tabBar(w, h, 0)}
  `);
}

function screenProposte(w, h) {
  const proposals=[
    {type:'Giro', icon:'GIRO', color:C.blue, title:'Giro sulle Dolomiti', creator:'MotoRider42', loc:'Bolzano', date:'Dom 28 Apr', km:'120 km', count:'5/8'},
    {type:'Con Zavorrina', icon:'Z+B', color:C.pink, title:'Weekend a Firenze', creator:'AlpiRider', loc:'Firenze', date:'Sab 4 Mag', km:'80 km', count:'2/4'},
    {type:'Passaggio', icon:'PASS', color:C.green, title:'Passaggio verso Roma', creator:'SofiaRider', loc:'Roma', date:'Ven 26 Apr', km:'45 km', count:'1/2'},
    {type:'Giro', icon:'GIRO', color:C.blue, title:'Costa Amalfitana Tour', creator:'DucatiGuy', loc:'Salerno', date:'Sab 11 Mag', km:'200 km', count:'7/10'},
  ];
  const filterKeys=['Tutti','Giro','Con Zav.','Passaggio','Richieste'];
  let content = '';
  let fx = 12;
  filterKeys.forEach((f,i)=>{
    const fw=f.length*8+18;
    content += `${rect(fx, 116, fw, 28, i===0?C.accent:C.surfaceL, 14, i===0?0.15:1)}${text(fx+fw/2, 134, f, 12, i===0?C.accent:C.textSec, 'middle', i===0?'700':'400')}`;
    fx += fw + 8;
  });
  proposals.forEach((p, i) => {
    const cy = 158 + i*126;
    content += `${card(12, cy, w-24, 114)}
      ${pill(20, cy+10, p.icon.length*9+16, 24, p.icon, p.color)}
      ${text(20+p.icon.length*9+24, cy+26, p.creator, 14, C.text, 'start', '700')}
      ${text(w-20, cy+26, p.type, 12, p.color, 'end', '600')}
      ${text(20, cy+50, p.title, 16, C.text, 'start', '600')}
      ${iconPin(18+8, cy+74, 14, C.textSec)}${text(34, cy+78, p.loc, 13, C.textSec)}
      ${text(20, cy+78, '', 13, C.textSec)}
      ${text(w/2, cy+78, p.date, 13, C.textSec, 'middle')}
      ${text(w-20, cy+78, p.km+' - '+p.count+' part.', 12, C.accent, 'end', '600')}`;
  });
  return svg(w, h, `${content}
    ${circle(w-36, h-108, 28, C.accent, 0.95)}
    ${text(w-36, h-100, '+', 32, '#fff', 'middle', '300')}
    ${statusBar(w)}
    ${header(w, 'Proposte', 'Giri ed eventi vicini')}
    ${tabBar(w, h, 2)}
  `);
}

function screenProfilo(w, h) {
  return svg(w, h, `
    ${rect(0, 114, w, 170, C.surface)}
    ${line(0, 284, w, 284, C.border)}
    ${circle(w/2, 196, 52, C.blue, 0.15)}
    ${circle(w/2, 196, 44, C.blue, 0.9)}
    ${iconPerson(w/2, 198, 40, '#fff')}
    ${text(w/2, 278, 'MotoRider42', 20, C.text, 'middle', '700')}
    ${text(w/2, 300, 'Biker - Roma, Italia', 14, C.textSec, 'middle')}
    ${card(12, 318, (w-36)/3, 78)}
    ${text(12+(w-36)/6, 354, '12.4k', 20, C.accent, 'middle', '700')}
    ${text(12+(w-36)/6, 376, 'km totali', 12, C.textSec, 'middle')}
    ${card(24+(w-36)/3, 318, (w-36)/3, 78)}
    ${text(24+(w-36)/3+(w-36)/6, 354, '89', 20, C.accent, 'middle', '700')}
    ${text(24+(w-36)/3+(w-36)/6, 376, 'giri fatti', 12, C.textSec, 'middle')}
    ${card(36+(w-36)*2/3, 318, (w-36)/3, 78)}
    ${text(36+(w-36)*2/3+(w-36)/6, 354, '7', 20, C.accent, 'middle', '700')}
    ${text(36+(w-36)*2/3+(w-36)/6, 376, 'trofei', 12, C.textSec, 'middle')}
    ${[
      {label:'Ducati Monster 821', sub:'Naked - Mozzafiato', icon:'moto'},
      {label:'Privacy e Posizione', sub:'Nascondi dalla mappa', icon:'lock'},
      {label:'Tema: Asfalto', sub:'Personalizza i colori', icon:'color'},
      {label:'Lingua e Unita\'', sub:'Italiano - km/h', icon:'globe'},
      {label:'Documenti', sub:'Manuale - EULA - Privacy', icon:'doc'},
    ].map((row,i)=>{
      const ry=410+i*66;
      return `${card(12, ry, w-24, 54)}
        ${circle(42, ry+27, 16, C.accent, 0.1)}
        ${text(42, ry+32, row.icon==='moto'?'M':row.icon==='lock'?'L':row.icon==='color'?'C':row.icon==='globe'?'G':'D', 13, C.accent, 'middle', '700')}
        ${text(68, ry+22, row.label, 15, C.text, 'start', '600')}
        ${text(68, ry+40, row.sub, 12, C.textSec)}
        ${text(w-20, ry+30, '>', 18, C.textSec, 'end')}`;
    }).join('')}
    ${rect(20, h-154, w-40, 50, C.red, 25, 0.1)}
    ${text(w/2, h-122, 'Esci dall\'account', 16, C.red, 'middle', '600')}
    ${statusBar(w)}
    ${header(w, 'Profilo', 'Il tuo account BikerLink')}
    ${tabBar(w, h, 4)}
  `);
}

// ===== CHROMEBOOK LANDSCAPE =====

function cbStatusBar(w) {
  return `${rect(0, 0, w, 36, C.surface)}
    ${line(0, 36, w, 36, C.border)}
    ${text(16, 24, 'BikerLink', 14, C.accent, 'start', '700')}
    ${text(w/2, 24, 'Mappa  |  Motoclub  |  Proposte  |  Chat  |  Profilo', 13, C.textMut, 'middle')}
    ${text(w-16, 24, '9:41  100%', 13, C.textSec, 'end')}`;
}

function chromebookMappa(w, h) {
  const mapW=Math.floor(w*0.62), panelX=mapW;
  const bikers=[
    {name:'MotoRider42',dist:'2 km',type:'Naked',init:'M',color:C.blue},
    {name:'DucatiGuy',dist:'5 km',type:'Touring',init:'D',color:C.blue},
    {name:'SofiaRider',dist:'8 km',type:'Enduro',init:'S',color:C.pink},
    {name:'AlpiRider',dist:'12 km',type:'Naked',init:'A',color:C.blue},
    {name:'VespaRoma',dist:'15 km',type:'Custom',init:'V',color:C.accent},
  ];
  const pins=[{cx:mapW*0.2,cy:h*0.35},{cx:mapW*0.42,cy:h*0.48},{cx:mapW*0.6,cy:h*0.28},
    {cx:mapW*0.28,cy:h*0.68},{cx:mapW*0.72,cy:h*0.72},{cx:mapW*0.52,cy:h*0.78}];
  return svg(w, h, `
    ${mapBg(0, 36, mapW, h-36)}
    ${pins.map(p=>bikerPin(p.cx, p.cy, null, C.blue)).join('')}
    ${circle(mapW*0.5, h*0.52, 8, C.blue, 0.95)}
    ${circle(mapW*0.5, h*0.52, 22, C.blue, 0.2)}
    ${rect(panelX, 36, w-panelX, h-36, C.surface)}
    ${line(panelX, 36, panelX, h, C.border)}
    ${text(panelX+20, 72, 'Biker vicini (6)', 16, C.text, 'start', '700')}
    ${text(panelX+20, 92, 'Nel raggio di 50 km', 13, C.textSec)}
    ${bikers.map((b,i)=>{
      const by=108+i*88;
      return `${card(panelX+10,by,w-panelX-20,76,10)}
        ${avatar(panelX+38, by+38, 18, b.color, b.init)}
        ${text(panelX+66, by+28, b.name, 14, C.text,'start','600')}
        ${text(panelX+66, by+48, b.dist+' - '+b.type, 12, C.textSec)}
        ${rect(w-88, by+24, 70, 28, C.accent, 14, 0.12)}
        ${text(w-53, by+43, 'Contatta', 11, C.accent, 'middle', '600')}`;
    }).join('')}
    ${cbStatusBar(w)}
  `);
}

function chromebookMotoclub(w, h) {
  const lw=Math.floor(w*0.33), rw=w-lw;
  const clubs=[
    {name:'Ducati Club Roma',members:'142',color:C.red,init:'D'},
    {name:'Vespa Riders Milano',members:'89',color:C.accent,init:'V'},
    {name:'BMW Motorrad Nord',members:'213',color:C.blue,init:'B'},
    {name:'Honda Club Italia',members:'67',color:C.green,init:'H'},
    {name:'KTM Adventure Crew',members:'55',color:C.warning,init:'K'},
  ];
  return svg(w, h, `
    ${rect(0, 36, lw, h-36, C.surface)}
    ${line(lw, 36, lw, h, C.border)}
    ${text(16, 70, 'Motoclub', 16, C.text, 'start', '700')}
    ${rect(10, 78, lw-20, 32, C.surfaceL, 10)}
    ${text(28, 99, 'Cerca un club...', 13, C.textMut)}
    ${clubs.map((c,i)=>{
      const cy=120+i*88, active=i===0;
      return `${rect(0, cy, lw, 80, active?C.accent+'18':C.bg)}
        ${line(0, cy+79, lw, cy+79, C.border, 0.5)}
        ${avatar(32, cy+40, 18, c.color, c.init)}
        ${text(58, cy+28, c.name, 13, C.text, 'start', active?'700':'500')}
        ${text(58, cy+48, c.members+' membri', 12, C.textSec)}`;
    }).join('')}
    ${rect(lw, 36, rw, h-36, C.bg)}
    ${text(lw+24, 74, 'Ducati Club Roma', 18, C.text, 'start', '700')}
    ${text(lw+24, 96, '142 membri - Fondato 2008 - Roma, Lazio', 13, C.textSec)}
    ${rect(lw+24, 108, 108, 30, C.accent, 15)}
    ${text(lw+78, 128, '+ Unisciti', 13, '#fff', 'middle', '700')}
    ${rect(lw+140, 108, 110, 30, C.surfaceL, 15)}
    ${text(lw+195, 128, 'Chat Club', 13, C.text, 'middle')}
    ${text(lw+24, 162, 'Prossimi eventi', 14, C.text, 'start', '600')}
    ${[{t:'Giro sul Tuscolo',d:'Dom 28 Apr, 09:00'},{t:'Raduno Primavera',d:'Sab 4 Mag, 10:00'},{t:'Giro Colli Albani',d:'Dom 11 Mag, 08:30'}].map((e,i)=>{
      const ey=178+i*68;
      return `${card(lw+24, ey, rw-48, 58, 10)}
        ${text(lw+44, ey+24, e.t, 14, C.text, 'start', '600')}
        ${text(lw+44, ey+44, e.d, 12, C.textSec)}`;
    }).join('')}
    ${text(lw+24, 396, 'Membri recenti', 14, C.text, 'start', '600')}
    ${[C.blue,C.blue,C.pink,C.blue,C.accent,C.pink,C.blue].map((c,i)=>
      `${avatar(lw+48+i*56, 434, 20, c, ['M','D','S','A','V','L','G'][i])}`
    ).join('')}
    ${cbStatusBar(w)}
  `);
}

function chromebookGarage(w, h) {
  const lw=Math.floor(w*0.36), rw=w-lw;
  const motos=[{b:'Ducati',m:'Monster 821',def:true,cc:'821cc',type:'Naked',style:'Mozzafiato'},
               {b:'Honda',m:'CB500F',def:false,cc:'500cc',type:'Naked',style:'Allegra'}];
  return svg(w, h, `
    ${rect(0, 36, lw, h-36, C.surface)}
    ${line(lw, 36, lw, h, C.border)}
    ${text(16, 70, 'Garage', 16, C.text, 'start', '700')}
    ${text(16, 90, 'Le tue moto (2/5)', 13, C.textSec)}
    ${motos.map((m,i)=>{
      const cy=104+i*96, active=m.def;
      return `${rect(0, cy, lw, 88, active?C.accent+'12':C.bg)}
        ${line(0, cy+87, lw, cy+87, C.border, 0.5)}
        ${iconMotorcycle(36, cy+44, 34, active?C.accent:C.textSec)}
        ${text(72, cy+30, m.b+' '+m.m, 14, C.text, 'start', active?'700':'500')}
        ${active?pill(72, cy+38, 80, 22, 'Principale', C.accent, 11):''}
        ${text(72, cy+68, m.cc+' - '+m.type, 12, C.textSec)}`;
    }).join('')}
    ${rect(lw, 36, rw, h-36, C.bg)}
    ${text(lw+24, 74, 'Ducati Monster 821', 20, C.text, 'start', '700')}
    ${text(lw+24, 96, '821cc - Naked - Stile: Mozzafiato - Moto principale', 13, C.textSec)}
    ${iconMotorcycle(lw+rw/4, 180, 80, C.accent)}
    ${[{l:'Cilindrata',v:'821 cc'},{l:'Tipo',v:'Naked'},{l:'Stile guida',v:'Mozzafiato'},{l:'Anno',v:'2019'},{l:'In vendita',v:'No'}].map((row,i)=>{
      const ry=240+i*50;
      return `${card(lw+24, ry, rw-48, 40, 8)}
        ${text(lw+44, ry+26, row.l, 13, C.textSec)}
        ${text(lw+rw-36, ry+26, row.v, 13, C.text, 'end', '600')}`;
    }).join('')}
    ${rect(lw+24, h-68, (rw-52)/2, 42, C.surfaceL, 21)}
    ${text(lw+24+(rw-52)/4, h-40, 'Modifica', 13, C.text, 'middle')}
    ${rect(lw+32+(rw-52)/2, h-68, (rw-52)/2, 42, C.red, 21, 0.1)}
    ${text(lw+32+(rw-52)/2+(rw-52)/4, h-40, 'Elimina', 13, C.red, 'middle')}
    ${cbStatusBar(w)}
  `);
}

function chromebookTracking(w, h) {
  const mapW=Math.floor(w*0.58), panelW=w-mapW;
  const pts2=[];
  for(let i=0;i<=20;i++) pts2.push([mapW*0.08+(mapW*0.84)*(i/20)+Math.sin(i*0.8)*16, 36+(h-36)*0.14+((h-36)*0.7)*(i/20)+Math.cos(i*0.6)*13]);
  const ep=pts2[pts2.length-1];
  return svg(w, h, `
    ${mapBg(0, 36, mapW, h-36)}
    ${routePath(pts2, C.accent, 4)}
    ${circle(pts2[0][0], pts2[0][1], 8, C.green, 0.95)}
    ${circle(ep[0], ep[1], 10, C.blue, 0.95)}
    ${circle(ep[0], ep[1], 22, C.blue, 0.2)}
    ${rect(mapW, 36, panelW, h-36, C.surface)}
    ${line(mapW, 36, mapW, h, C.border)}
    ${text(mapW+20, 72, 'Tracking Live', 16, C.text, 'start', '700')}
    ${rect(mapW+20, 80, panelW-40, 20, C.green, 10, 0.15)}
    ${text(mapW+panelW/2, 95, 'Giro in corso', 12, C.green, 'middle', '600')}
    ${text(mapW+panelW/2, 148, '87', 50, C.accent, 'middle', '800')}
    ${text(mapW+panelW/2, 172, 'km/h', 14, C.textSec, 'middle')}
    ${line(mapW+20, 188, w-20, 188, C.border)}
    ${[{v:'67.4 km',l:'percorsi'},{v:'1h 23m',l:'durata'},{v:'+450 m',l:'dislivello'},{v:'118 km/h',l:'velocita\' max'}].map((s,i)=>{
      const sy=206+i*72;
      return `${text(mapW+panelW/2, sy, s.v, 22, C.text, 'middle', '700')}
        ${text(mapW+panelW/2, sy+20, s.l, 13, C.textSec, 'middle')}
        ${line(mapW+20, sy+34, w-20, sy+34, C.border, 0.5)}`;
    }).join('')}
    ${rect(mapW+20, h-66, panelW-40, 44, C.red, 22, 0.9)}
    ${text(mapW+panelW/2, h-37, 'Termina Giro', 15, '#fff', 'middle', '700')}
    ${cbStatusBar(w)}
  `);
}

function svg(w, h, content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="${C.bg}"/>
    ${content}
  </svg>`;
}

async function save(svgStr, outPath, w, h) {
  const dir = path.dirname(outPath);
  if(!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive:true});
  await sharp(Buffer.from(svgStr,'utf8'), {density:192})
    .resize(w, h, {fit:'fill'})
    .png({compressionLevel:6})
    .toFile(outPath);
  console.log(`  ok ${outPath} (${w}x${h})`);
}

async function main() {
  const screens=[
    {fn:screenMappa,    n:'01'},
    {fn:screenMatch,    n:'02'},
    {fn:screenMotoclub, n:'03'},
    {fn:screenChat,     n:'04'},
    {fn:screenTracking, n:'05'},
    {fn:screenGarage,   n:'06'},
    {fn:screenProposte, n:'07'},
    {fn:screenProfilo,  n:'08'},
  ];
  console.log('=== Phone 1080x1920 ===');
  for(const s of screens) await save(s.fn(1080,1920), `assets/screenshots/phone/ScreenPhone-${s.n}.png`, 1080, 1920);
  console.log('=== Tablet 7" 1200x1920 ===');
  for(const s of screens) await save(s.fn(1200,1920), `assets/screenshots/tablet7/ScreenTablet7-${s.n}.png`, 1200, 1920);
  console.log('=== Tablet 10" 1600x2560 ===');
  for(const s of screens) await save(s.fn(1600,2560), `assets/screenshots/tablet10/ScreenTablet10-${s.n}.png`, 1600, 2560);
  console.log('=== Chromebook 1280x800 ===');
  await save(chromebookMappa(1280,800),    'assets/screenshots/chromebook/ScreenChromebook-01.png', 1280, 800);
  await save(chromebookMotoclub(1280,800), 'assets/screenshots/chromebook/ScreenChromebook-02.png', 1280, 800);
  await save(chromebookGarage(1280,800),   'assets/screenshots/chromebook/ScreenChromebook-03.png', 1280, 800);
  await save(chromebookTracking(1280,800), 'assets/screenshots/chromebook/ScreenChromebook-04.png', 1280, 800);
  console.log('=== DONE ===');
}
main().catch(console.error);
