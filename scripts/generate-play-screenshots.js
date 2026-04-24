#!/usr/bin/env node
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const C = {
  bg: '#0D0D0D', surface: '#1E1E1E', surfaceL: '#2A2A2A',
  accent: '#FF6600', accentD: '#CC5200',
  text: '#FFFFFF', textSec: '#9A9A9A', textMut: '#666666',
  blue: '#4A90D9', pink: '#E91E8C', green: '#4CAF50',
  red: '#E63946', border: '#2A2A2A', warning: '#FF8C00',
};

function statusBar(w) {
  return `
    <rect x="0" y="0" width="${w}" height="44" fill="${C.surface}"/>
    <text x="28" y="28" font-family="system-ui,sans-serif" font-size="16" font-weight="600" fill="${C.text}">9:41</text>
    <text x="${w-28}" y="28" font-family="system-ui,sans-serif" font-size="12" fill="${C.text}" text-anchor="end">●●● WiFi 🔋</text>
  `;
}

function tabBar(w, h, active) {
  const tabs = [
    { icon: '🗺', label: 'Mappa' },
    { icon: '⚡', label: 'Match' },
    { icon: '📢', label: 'Proposte' },
    { icon: '💬', label: 'Chat' },
    { icon: '👤', label: 'Profilo' },
  ];
  const tw = w / tabs.length;
  const by = h - 80;
  let out = `<rect x="0" y="${by}" width="${w}" height="80" fill="${C.surface}"/>
    <line x1="0" y1="${by}" x2="${w}" y2="${by}" stroke="${C.border}" stroke-width="1"/>`;
  tabs.forEach((t, i) => {
    const cx = tw * i + tw / 2;
    const color = i === active ? C.accent : C.textMut;
    out += `
      <text x="${cx}" y="${by + 28}" font-family="system-ui,sans-serif" font-size="22" text-anchor="middle">${t.icon}</text>
      <text x="${cx}" y="${by + 52}" font-family="system-ui,sans-serif" font-size="14" fill="${color}" text-anchor="middle" font-weight="${i===active?'700':'400'}">${t.label}</text>
    `;
  });
  return out;
}

function header(w, title, subtitle) {
  return `
    <rect x="0" y="44" width="${w}" height="64" fill="${C.surface}"/>
    <line x1="0" y1="108" x2="${w}" y2="108" stroke="${C.border}" stroke-width="1"/>
    <text x="20" y="84" font-family="system-ui,sans-serif" font-size="22" font-weight="700" fill="${C.text}">${title}</text>
    ${subtitle ? `<text x="20" y="103" font-family="system-ui,sans-serif" font-size="13" fill="${C.textSec}">${subtitle}</text>` : ''}
  `;
}

function card(x, y, w, h, rx=14) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${C.surface}" stroke="${C.border}" stroke-width="1"/>`;
}

function badge(x, y, text, color, bgOpacity=0.15) {
  const pad = 10;
  const bw = text.length * 8 + pad*2;
  return `
    <rect x="${x}" y="${y}" width="${bw}" height="26" rx="13" fill="${color}" opacity="${bgOpacity}"/>
    <text x="${x+bw/2}" y="${y+17}" font-family="system-ui,sans-serif" font-size="12" font-weight="600" fill="${color}" text-anchor="middle">${text}</text>
  `;
}

function avatar(cx, cy, r, color, icon='●') {
  return `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="0.9"/>
    <text x="${cx}" y="${cy+r*0.4}" font-family="system-ui,sans-serif" font-size="${r*1.0}" text-anchor="middle" fill="#fff">${icon}</text>
  `;
}

function mapBg(x, y, w, h) {
  const streets = [];
  for(let i=0; i<8; i++) {
    const x1 = x + Math.floor(Math.random()*100+50)*3;
    const y1 = y + 20;
    streets.push(`<line x1="${x1}" y1="${y}" x2="${x1+Math.floor((Math.random()-0.5)*200)}" y2="${y+h}" stroke="#1A2A1A" stroke-width="8" opacity="0.8"/>`);
  }
  for(let i=0; i<6; i++) {
    const y1 = y + Math.floor(Math.random()*100+50)*2;
    streets.push(`<line x1="${x}" y1="${y1}" x2="${x+w}" y2="${y1+Math.floor((Math.random()-0.5)*100)}" stroke="#1A2A1A" stroke-width="8" opacity="0.8"/>`);
  }
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#0F1A0F"/>
    ${streets.join('')}
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${C.border}" stroke-width="1"/>
  `;
}

function bikerPin(cx, cy, label) {
  return `
    <circle cx="${cx}" cy="${cy}" r="22" fill="${C.accent}" opacity="0.15"/>
    <circle cx="${cx}" cy="${cy}" r="14" fill="${C.accent}"/>
    <text x="${cx}" y="${cy+5}" font-family="system-ui,sans-serif" font-size="13" text-anchor="middle" fill="#fff">🏍</text>
    ${label ? `<rect x="${cx-20}" y="${cy-36}" width="40" height="18" rx="9" fill="${C.surface}"/>
    <text x="${cx}" y="${cy-24}" font-family="system-ui,sans-serif" font-size="10" fill="${C.text}" text-anchor="middle">${label}</text>` : ''}
  `;
}

// ======= SCREEN 1: MAPPA =======
function screenMappa(w, h) {
  const mapY = 108, mapH = h - 108 - 80;
  const pins = [
    {cx: w*0.25, cy: mapY+mapH*0.25, label:'MotoRider42'},
    {cx: w*0.55, cy: mapY+mapH*0.4, label:'DucatiGuy'},
    {cx: w*0.7, cy: mapY+mapH*0.6, label:'VespaRoma'},
    {cx: w*0.3, cy: mapY+mapH*0.65, label:'BitoBiker'},
    {cx: w*0.8, cy: mapY+mapH*0.3, label:'AlpiRider'},
    {cx: w*0.45, cy: mapY+mapH*0.75, label:null},
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="${C.bg}"/>
    ${statusBar(w)}
    ${header(w, 'BikerLink', '🏍 Mappa Biker vicini a te')}
    ${mapBg(0, mapY, w, mapH)}
    ${pins.map(p => bikerPin(p.cx, p.cy, p.label)).join('')}
    <circle cx="${w/2}" cy="${mapY+mapH/2}" r="60" fill="none" stroke="${C.accent}" stroke-width="1.5" opacity="0.3" stroke-dasharray="8 4"/>
    <circle cx="${w/2}" cy="${mapY+mapH/2}" r="120" fill="none" stroke="${C.accent}" stroke-width="1" opacity="0.15" stroke-dasharray="8 4"/>
    <circle cx="${w/2}" cy="${mapY+mapH/2}" r="8" fill="${C.blue}"/>
    <circle cx="${w/2}" cy="${mapY+mapH/2}" r="20" fill="${C.blue}" opacity="0.2"/>
    ${card(12, h-168, w-24, 72, 14)}
    <text x="28" y="${h-140}" font-family="system-ui,sans-serif" font-size="15" font-weight="600" fill="${C.text}">6 biker trovati nelle vicinanze</text>
    <text x="28" y="${h-120}" font-family="system-ui,sans-serif" font-size="13" fill="${C.textSec}">Raggio attivo: 50 km · Aggiornato ora</text>
    ${tabBar(w, h, 0)}
  </svg>`;
}

// ======= SCREEN 2: MATCH =======
function screenMatch(w, h) {
  const cw = (w-40)/2;
  const cardY = 128;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="${C.bg}"/>
    ${statusBar(w)}
    ${header(w, 'Match ⚡', 'Trova il tuo compagno di viaggio')}
    ${card(12, cardY, cw, 300)}
    ${avatar(12+cw/2, cardY+64, 44, C.blue, '🏍')}
    <text x="${12+cw/2}" y="${cardY+130}" font-family="system-ui,sans-serif" font-size="17" font-weight="700" fill="${C.text}" text-anchor="middle">MotoRider42</text>
    <text x="${12+cw/2}" y="${cardY+152}" font-family="system-ui,sans-serif" font-size="13" fill="${C.textSec}" text-anchor="middle">Biker · Roma</text>
    ${badge(12+cw/2-30, cardY+170, 'Naked', C.blue)}
    ${badge(12+cw/2-35, cardY+202, 'Mozzafiato', C.accent)}
    <text x="${12+cw/2}" y="${cardY+252}" font-family="system-ui,sans-serif" font-size="13" fill="${C.textSec}" text-anchor="middle">Ducati Monster 821</text>
    <text x="${12+cw/2}" y="${cardY+274}" font-family="system-ui,sans-serif" font-size="13" fill="${C.textSec}" text-anchor="middle">📍 12 km da te</text>
    ${card(28+cw, cardY, cw, 300)}
    ${avatar(28+cw+cw/2, cardY+64, 44, C.pink, '👤')}
    <text x="${28+cw+cw/2}" y="${cardY+130}" font-family="system-ui,sans-serif" font-size="17" font-weight="700" fill="${C.text}" text-anchor="middle">SofiaRider</text>
    <text x="${28+cw+cw/2}" y="${cardY+152}" font-family="system-ui,sans-serif" font-size="13" fill="${C.pink}" text-anchor="middle">Zavorrina · Milano</text>
    ${badge(28+cw+cw/2-30, cardY+170, 'Touring', C.pink)}
    ${badge(28+cw+cw/2-30, cardY+202, 'Allegra', C.warning)}
    <text x="${28+cw+cw/2}" y="${cardY+252}" font-family="system-ui,sans-serif" font-size="13" fill="${C.textSec}" text-anchor="middle">Honda CB500F</text>
    <text x="${28+cw+cw/2}" y="${cardY+274}" font-family="system-ui,sans-serif" font-size="13" fill="${C.textSec}" text-anchor="middle">📍 8 km da te</text>
    <text x="${w/2}" y="${cardY+360}" font-family="system-ui,sans-serif" font-size="15" fill="${C.textSec}" text-anchor="middle">Compatibilità</text>
    <rect x="${w*0.1}" y="${cardY+374}" width="${w*0.8}" height="6" rx="3" fill="${C.surfaceL}"/>
    <rect x="${w*0.1}" y="${cardY+374}" width="${w*0.8*0.87}" height="6" rx="3" fill="${C.accent}"/>
    <text x="${w/2}" y="${cardY+400}" font-family="system-ui,sans-serif" font-size="20" font-weight="700" fill="${C.accent}" text-anchor="middle">87% compatibili</text>
    <rect x="20" y="${cardY+430}" width="${w-40}" height="54" rx="27" fill="${C.accent}"/>
    <text x="${w/2}" y="${cardY+465}" font-family="system-ui,sans-serif" font-size="18" font-weight="700" fill="#fff" text-anchor="middle">⚡ Invia Match</text>
    ${tabBar(w, h, 1)}
  </svg>`;
}

// ======= SCREEN 3: MOTOCLUB =======
function screenMotoclub(w, h) {
  const clubs = [
    {name:'Ducati Club Roma', members:'142', events:'3', color: C.red},
    {name:'Vespa Riders Milano', members:'89', events:'7', color: C.accent},
    {name:'BMW Motorrad Nord', members:'213', events:'2', color: C.blue},
    {name:'Honda Club Italia', members:'67', events:'1', color: C.green},
    {name:'KTM Adventure Crew', members:'55', events:'4', color: C.warning},
  ];
  let clubCards = '';
  clubs.forEach((cl, i) => {
    const cy = 128 + i*108;
    clubCards += `
      ${card(12, cy, w-24, 96)}
      <circle cx="60" cy="${cy+48}" r="30" fill="${cl.color}" opacity="0.15"/>
      <text x="60" y="${cy+56}" font-family="system-ui,sans-serif" font-size="24" text-anchor="middle">🛡</text>
      <text x="104" y="${cy+30}" font-family="system-ui,sans-serif" font-size="16" font-weight="700" fill="${C.text}">${cl.name}</text>
      <text x="104" y="${cy+52}" font-family="system-ui,sans-serif" font-size="13" fill="${C.textSec}">👥 ${cl.members} membri</text>
      <text x="104" y="${cy+72}" font-family="system-ui,sans-serif" font-size="13" fill="${C.textSec}">📅 ${cl.events} eventi in programma</text>
      <rect x="${w-80}" y="${cy+30}" width="60" height="28" rx="14" fill="${cl.color}" opacity="0.15"/>
      <text x="${w-50}" y="${cy+49}" font-family="system-ui,sans-serif" font-size="12" font-weight="600" fill="${cl.color}" text-anchor="middle">Unisciti</text>
    `;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="${C.bg}"/>
    ${statusBar(w)}
    ${header(w, 'Motoclub 🛡', 'Directory club motociclistici')}
    <rect x="12" y="112" width="${w-24}" height="40" rx="10" fill="${C.surfaceL}"/>
    <text x="36" y="137" font-family="system-ui,sans-serif" font-size="14" fill="${C.textMut}">🔍 Cerca un club...</text>
    ${clubCards}
    ${tabBar(w, h, 2)}
  </svg>`;
}

// ======= SCREEN 4: CHAT =======
function screenChat(w, h) {
  const convs = [
    {name:'Ducati Club Roma 🛡', last:'Chi partecipa sabato al giro?', time:'10:42', unread:5, color:C.accent, icon:'🛡'},
    {name:'MotoRider42', last:'Sei disponibile domenica?', time:'09:15', unread:2, color:C.blue, icon:'🏍'},
    {name:'SofiaRider', last:'Ho trovato un percorso fantastico!', time:'Ieri', unread:0, color:C.pink, icon:'👤'},
    {name:'BMW Club Nord', last:'Foto del giro di ieri', time:'Ieri', unread:1, color:C.blue, icon:'🛡'},
    {name:'DucatiGuy', last:'Grazie per il consiglio!', time:'Lun', unread:0, color:C.blue, icon:'🏍'},
    {name:'Vespa Riders', last:'Nuovo raduno a Firenze', time:'Dom', unread:3, color:C.warning, icon:'🛡'},
  ];
  let rows = '';
  convs.forEach((c, i) => {
    const cy = 128 + i*86;
    rows += `
      <rect x="0" y="${cy}" width="${w}" height="86" fill="${i%2===0?C.bg:C.bg}"/>
      <line x1="60" y1="${cy+85}" x2="${w-12}" y2="${cy+85}" stroke="${C.border}" stroke-width="0.5"/>
      <circle cx="36" cy="${cy+43}" r="22" fill="${c.color}" opacity="0.8"/>
      <text x="36" y="${cy+50}" font-family="system-ui,sans-serif" font-size="16" text-anchor="middle">${c.icon}</text>
      <text x="68" y="${cy+30}" font-family="system-ui,sans-serif" font-size="15" font-weight="${c.unread>0?'700':'500'}" fill="${C.text}">${c.name}</text>
      <text x="68" y="${cy+52}" font-family="system-ui,sans-serif" font-size="13" fill="${C.textSec}" textLength="${w-120}" lengthAdjust="spacingAndGlyphs">${c.last.substring(0,35)}${c.last.length>35?'…':''}</text>
      <text x="${w-12}" y="${cy+30}" font-family="system-ui,sans-serif" font-size="12" fill="${C.textMut}" text-anchor="end">${c.time}</text>
      ${c.unread>0?`<circle cx="${w-20}" cy="${cy+56}" r="11" fill="${C.accent}"/>
      <text x="${w-20}" y="${cy+61}" font-family="system-ui,sans-serif" font-size="11" font-weight="700" fill="#fff" text-anchor="middle">${c.unread}</text>`:''}
    `;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="${C.bg}"/>
    ${statusBar(w)}
    <rect x="0" y="44" width="${w}" height="84" fill="${C.surface}"/>
    <line x1="0" y1="128" x2="${w}" y2="128" stroke="${C.border}" stroke-width="1"/>
    <text x="20" y="76" font-family="system-ui,sans-serif" font-size="22" font-weight="700" fill="${C.text}">Chat 💬</text>
    <rect x="${w-136}" y="52" width="124" height="36" rx="18" fill="${C.accent}"/>
    <text x="${w-74}" y="75" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="#fff" text-anchor="middle">+ Nuova Chat</text>
    ${rows}
    ${tabBar(w, h, 3)}
  </svg>`;
}

// ======= SCREEN 5: TRACKING =======
function screenTracking(w, h) {
  const mapY = 108, mapH = h*0.45;
  const statsY = mapY + mapH + 10;
  const routePoints = [];
  for(let i=0; i<=20; i++) {
    const px = w*0.1 + (w*0.8)*(i/20) + Math.sin(i*0.7)*20;
    const py = mapY+mapH*0.2 + (mapH*0.6)*(i/20) + Math.cos(i*0.5)*15;
    routePoints.push(`${px},${py}`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="${C.bg}"/>
    ${statusBar(w)}
    ${header(w, 'Tracking GPS 📍', 'Giro in corso · Live')}
    ${mapBg(0, mapY, w, mapH)}
    <polyline points="${routePoints.join(' ')}" fill="none" stroke="${C.accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
    <circle cx="${routePoints[0].split(',')[0]}" cy="${routePoints[0].split(',')[1]}" r="8" fill="${C.green}"/>
    <circle cx="${routePoints[routePoints.length-1].split(',')[0]}" cy="${routePoints[routePoints.length-1].split(',')[1]}" r="10" fill="${C.blue}"/>
    <circle cx="${routePoints[routePoints.length-1].split(',')[0]}" cy="${routePoints[routePoints.length-1].split(',')[1]}" r="20" fill="${C.blue}" opacity="0.2"/>
    ${card(12, statsY, w-24, 190)}
    <text x="${w/2}" y="${statsY+60}" font-family="system-ui,sans-serif" font-size="52" font-weight="800" fill="${C.accent}" text-anchor="middle">87</text>
    <text x="${w/2}" y="${statsY+88}" font-family="system-ui,sans-serif" font-size="16" fill="${C.textSec}" text-anchor="middle">km/h</text>
    <line x1="${w/3}" y1="${statsY+106}" x2="${w/3}" y2="${statsY+170}" stroke="${C.border}" stroke-width="1"/>
    <line x1="${w*2/3}" y1="${statsY+106}" x2="${w*2/3}" y2="${statsY+170}" stroke="${C.border}" stroke-width="1"/>
    <text x="${w/6}" y="${statsY+132}" font-family="system-ui,sans-serif" font-size="22" font-weight="700" fill="${C.text}" text-anchor="middle">67.4</text>
    <text x="${w/6}" y="${statsY+154}" font-family="system-ui,sans-serif" font-size="13" fill="${C.textSec}" text-anchor="middle">km percorsi</text>
    <text x="${w/2}" y="${statsY+132}" font-family="system-ui,sans-serif" font-size="22" font-weight="700" fill="${C.text}" text-anchor="middle">1:23</text>
    <text x="${w/2}" y="${statsY+154}" font-family="system-ui,sans-serif" font-size="13" fill="${C.textSec}" text-anchor="middle">durata</text>
    <text x="${w*5/6}" y="${statsY+132}" font-family="system-ui,sans-serif" font-size="22" font-weight="700" fill="${C.text}" text-anchor="middle">+450m</text>
    <text x="${w*5/6}" y="${statsY+154}" font-family="system-ui,sans-serif" font-size="13" fill="${C.textSec}" text-anchor="middle">dislivello</text>
    <rect x="20" y="${statsY+215}" width="${w-40}" height="52" rx="26" fill="${C.red}" opacity="0.9"/>
    <text x="${w/2}" y="${statsY+248}" font-family="system-ui,sans-serif" font-size="17" font-weight="700" fill="#fff" text-anchor="middle">■ Termina Giro</text>
    ${tabBar(w, h, 0)}
  </svg>`;
}

// ======= SCREEN 6: GARAGE =======
function screenGarage(w, h) {
  const motos = [
    {brand:'Ducati', model:'Monster 821', cc:'821cc', type:'Naked', style:'Mozzafiato', default:true},
    {brand:'Honda', model:'CB500F', cc:'500cc', type:'Naked', style:'Allegra', default:false},
  ];
  let motoCards = '';
  motos.forEach((m, i) => {
    const cy = 160 + i*200;
    motoCards += `
      ${card(12, cy, w-24, 184)}
      ${m.default ? `<rect x="20" y="${cy+8}" width="90" height="24" rx="12" fill="${C.accent}" opacity="0.15"/>
      <text x="65" y="${cy+24}" font-family="system-ui,sans-serif" font-size="11" font-weight="700" fill="${C.accent}" text-anchor="middle">⭐ Principale</text>` : ''}
      <text x="26" y="${cy+64}" font-family="system-ui,sans-serif" font-size="42" text-anchor="start">🏍</text>
      <text x="100" y="${cy+52}" font-family="system-ui,sans-serif" font-size="19" font-weight="700" fill="${C.text}">${m.brand} ${m.model}</text>
      <text x="100" y="${cy+76}" font-family="system-ui,sans-serif" font-size="14" fill="${C.textSec}">${m.cc} · ${m.type}</text>
      <rect x="100" y="${cy+88}" width="${m.type.length*8+16}" height="24" rx="12" fill="${C.accent}" opacity="0.12"/>
      <text x="${100+m.type.length*4+8}" y="${cy+104}" font-family="system-ui,sans-serif" font-size="12" fill="${C.accent}" text-anchor="middle">${m.type}</text>
      <rect x="${100+m.type.length*8+24}" y="${cy+88}" width="${m.style.length*8+16}" height="24" rx="12" fill="${C.blue}" opacity="0.12"/>
      <text x="${100+m.type.length*8+24+m.style.length*4+8}" y="${cy+104}" font-family="system-ui,sans-serif" font-size="12" fill="${C.blue}" text-anchor="middle">${m.style}</text>
      <line x1="12" y1="${cy+130}" x2="${w-12}" y2="${cy+130}" stroke="${C.border}" stroke-width="0.8"/>
      <rect x="20" y="${cy+142}" width="${(w-50)/2}" height="34" rx="10" fill="${C.surfaceL}"/>
      <text x="${20+(w-50)/4}" y="${cy+164}" font-family="system-ui,sans-serif" font-size="13" fill="${C.text}" text-anchor="middle">✏️ Modifica</text>
      <rect x="${24+(w-50)/2}" y="${cy+142}" width="${(w-50)/2}" height="34" rx="10" fill="${C.red}" opacity="0.1"/>
      <text x="${24+(w-50)/2+(w-50)/4}" y="${cy+164}" font-family="system-ui,sans-serif" font-size="13" fill="${C.red}" text-anchor="middle">🗑 Elimina</text>
    `;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="${C.bg}"/>
    ${statusBar(w)}
    ${header(w, 'Il mio Garage 🏍', 'Le tue moto')}
    <rect x="${w-76}" y="52" width="64" height="36" rx="18" fill="${C.accent}"/>
    <text x="${w-44}" y="75" font-family="system-ui,sans-serif" font-size="20" font-weight="700" fill="#fff" text-anchor="middle">+</text>
    <rect x="12" y="112" width="${w-24}" height="36" rx="10" fill="${C.surfaceL}"/>
    <text x="30" y="135" font-family="system-ui,sans-serif" font-size="14" fill="${C.textMut}">🔍 Cerca moto...</text>
    ${motoCards}
    <text x="${w/2}" y="${160+motos.length*200+24}" font-family="system-ui,sans-serif" font-size="13" fill="${C.textSec}" text-anchor="middle">Aggiungi fino a 5 moto al tuo garage</text>
    ${tabBar(w, h, 0)}
  </svg>`;
}

// ======= SCREEN 7: PROPOSTE =======
function screenProposte(w, h) {
  const proposals = [
    {type:'Giro', icon:'🏍', color:C.blue, title:'Giro sulle Dolomiti', creator:'MotoRider42', location:'Bolzano', date:'Dom 28 Apr', km:'120km', members:'5/8'},
    {type:'Con Zavorrina', icon:'👫', color:C.pink, title:'Weekend a Firenze', creator:'AlpiRider', location:'Firenze', date:'Sab 4 Mag', km:'80km', members:'2/4'},
    {type:'Passaggio', icon:'🚗', color:C.green, title:'Passaggio verso Roma', creator:'SofiaRider', location:'Roma', date:'Ven 26 Apr', km:'45km', members:'1/2'},
    {type:'Giro', icon:'🏍', color:C.blue, title:'Costa Amalfitana Tour', creator:'DucatiGuy', location:'Salerno', date:'Sab 11 Mag', km:'200km', members:'7/10'},
  ];
  const filterKeys = ['Tutti','Giro','Con Zavorrina','Passaggio','Richieste'];
  let filters = '';
  filterKeys.forEach((f, i) => {
    const fw = f.length*8+20;
    const fx = 12 + filterKeys.slice(0,i).reduce((s,k)=>s+k.length*8+28,0);
    filters += `
      <rect x="${fx}" y="112" width="${fw}" height="30" rx="15" fill="${i===0?C.accent:C.surfaceL}" opacity="${i===0?'0.15':'1'}"/>
      <text x="${fx+fw/2}" y="${112+20}" font-family="system-ui,sans-serif" font-size="12" font-weight="${i===0?'700':'400'}" fill="${i===0?C.accent:C.textSec}" text-anchor="middle">${f}</text>
    `;
  });
  let propCards = '';
  proposals.forEach((p, i) => {
    const cy = 156 + i*128;
    propCards += `
      ${card(12, cy, w-24, 116)}
      <text x="26" y="${cy+24}" font-family="system-ui,sans-serif" font-size="18">${p.icon}</text>
      <text x="50" y="${cy+24}" font-family="system-ui,sans-serif" font-size="15" font-weight="700" fill="${C.text}">${p.creator}</text>
      <rect x="${w-100}" y="${cy+8}" width="${p.type.length*7+16}" height="22" rx="11" fill="${p.color}" opacity="0.15"/>
      <text x="${w-100+(p.type.length*7+16)/2}" y="${cy+23}" font-family="system-ui,sans-serif" font-size="11" fill="${p.color}" text-anchor="middle">${p.type}</text>
      <text x="26" y="${cy+48}" font-family="system-ui,sans-serif" font-size="16" font-weight="600" fill="${C.text}">${p.title}</text>
      <text x="26" y="${cy+70}" font-family="system-ui,sans-serif" font-size="13" fill="${C.textSec}">📍 ${p.location} · 🗓 ${p.date}</text>
      <text x="26" y="${cy+90}" font-family="system-ui,sans-serif" font-size="13" fill="${C.textSec}">🛣 ${p.km} · 👥 ${p.members} partecipanti</text>
    `;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="${C.bg}"/>
    ${statusBar(w)}
    ${header(w, 'Proposte 📢', 'Giri ed eventi vicini a te')}
    ${filters}
    ${propCards}
    <circle cx="${w-36}" cy="${h-116}" r="28" fill="${C.accent}"/>
    <text x="${w-36}" y="${h-108}" font-family="system-ui,sans-serif" font-size="28" font-weight="300" fill="#fff" text-anchor="middle">+</text>
    ${tabBar(w, h, 2)}
  </svg>`;
}

// ======= SCREEN 8: PROFILO =======
function screenProfilo(w, h) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="${C.bg}"/>
    ${statusBar(w)}
    ${header(w, 'Profilo 👤', '')}
    <rect x="0" y="108" width="${w}" height="160" fill="${C.surface}"/>
    <circle cx="${w/2}" cy="190" r="52" fill="${C.accent}" opacity="0.15"/>
    <circle cx="${w/2}" cy="190" r="44" fill="${C.blue}"/>
    <text x="${w/2}" y="206" font-family="system-ui,sans-serif" font-size="36" text-anchor="middle">🏍</text>
    <text x="${w/2}" y="274" font-family="system-ui,sans-serif" font-size="20" font-weight="700" fill="${C.text}" text-anchor="middle">MotoRider42</text>
    <text x="${w/2}" y="298" font-family="system-ui,sans-serif" font-size="14" fill="${C.textSec}" text-anchor="middle">Biker · Roma, Italia</text>
    ${card(12, 322, (w-36)/3, 80)}
    <text x="${12+(w-36)/6}" y="358" font-family="system-ui,sans-serif" font-size="20" font-weight="700" fill="${C.accent}" text-anchor="middle">12.4k</text>
    <text x="${12+(w-36)/6}" y="380" font-family="system-ui,sans-serif" font-size="12" fill="${C.textSec}" text-anchor="middle">km totali</text>
    ${card(24+(w-36)/3, 322, (w-36)/3, 80)}
    <text x="${24+(w-36)/3+(w-36)/6}" y="358" font-family="system-ui,sans-serif" font-size="20" font-weight="700" fill="${C.accent}" text-anchor="middle">89</text>
    <text x="${24+(w-36)/3+(w-36)/6}" y="380" font-family="system-ui,sans-serif" font-size="12" fill="${C.textSec}" text-anchor="middle">giri fatti</text>
    ${card(36+(w-36)*2/3, 322, (w-36)/3, 80)}
    <text x="${36+(w-36)*2/3+(w-36)/6}" y="358" font-family="system-ui,sans-serif" font-size="20" font-weight="700" fill="${C.accent}" text-anchor="middle">7</text>
    <text x="${36+(w-36)*2/3+(w-36)/6}" y="380" font-family="system-ui,sans-serif" font-size="12" fill="${C.textSec}" text-anchor="middle">trofei</text>
    ${card(12, 418, w-24, 56)} 
    <text x="26" y="452" font-family="system-ui,sans-serif" font-size="15" font-weight="600" fill="${C.text}">🏍 Ducati Monster 821</text>
    <text x="${w-20}" y="452" font-family="system-ui,sans-serif" font-size="13" fill="${C.textSec}" text-anchor="end">Naked · Mozzafiato ›</text>
    ${card(12, 486, w-24, 56)}
    <text x="26" y="520" font-family="system-ui,sans-serif" font-size="15" font-weight="600" fill="${C.text}">🔒 Privacy &amp; Posizione</text>
    <text x="${w-20}" y="520" font-family="system-ui,sans-serif" font-size="13" fill="${C.textSec}" text-anchor="end">›</text>
    ${card(12, 554, w-24, 56)}
    <text x="26" y="588" font-family="system-ui,sans-serif" font-size="15" font-weight="600" fill="${C.text}">🎨 Tema Asfalto</text>
    <text x="${w-20}" y="588" font-family="system-ui,sans-serif" font-size="13" fill="${C.textSec}" text-anchor="end">›</text>
    ${card(12, 622, w-24, 56)}
    <text x="26" y="656" font-family="system-ui,sans-serif" font-size="15" font-weight="600" fill="${C.text}">🌍 Lingua &amp; Unità</text>
    <text x="${w-20}" y="656" font-family="system-ui,sans-serif" font-size="13" fill="${C.textSec}" text-anchor="end">Italiano ›</text>
    ${card(12, 690, w-24, 56)}
    <text x="26" y="724" font-family="system-ui,sans-serif" font-size="15" font-weight="600" fill="${C.text}">📖 Manuale &amp; EULA</text>
    <text x="${w-20}" y="724" font-family="system-ui,sans-serif" font-size="13" fill="${C.textSec}" text-anchor="end">›</text>
    <rect x="20" y="762" width="${w-40}" height="52" rx="26" fill="${C.red}" opacity="0.1"/>
    <text x="${w/2}" y="794" font-family="system-ui,sans-serif" font-size="16" font-weight="600" fill="${C.red}" text-anchor="middle">Esci dall'account</text>
    ${tabBar(w, h, 4)}
  </svg>`;
}

// ======= CHROMEBOOK LANDSCAPE VERSIONS =======
function chromebookMappa(w, h) {
  const mapW = Math.floor(w*0.65);
  const panelX = mapW;
  const bikers = [
    {name:'MotoRider42', dist:'2 km', type:'Naked', color:C.blue},
    {name:'DucatiGuy', dist:'5 km', type:'Touring', color:C.blue},
    {name:'SofiaRider', dist:'8 km', type:'Enduro', color:C.pink},
    {name:'AlpiRider', dist:'12 km', type:'Naked', color:C.blue},
    {name:'VespaRoma', dist:'15 km', type:'Custom', color:C.accent},
  ];
  const pins = [
    {cx:mapW*0.2,cy:h*0.3},{cx:mapW*0.45,cy:h*0.45},{cx:mapW*0.6,cy:h*0.25},
    {cx:mapW*0.3,cy:h*0.65},{cx:mapW*0.7,cy:h*0.7},{cx:mapW*0.5,cy:h*0.75},
  ];
  const sbar = `<rect x="0" y="0" width="${w}" height="36" fill="${C.surface}"/>
    <text x="16" y="24" font-family="system-ui,sans-serif" font-size="14" font-weight="700" fill="${C.accent}">BikerLink</text>
    <text x="${w/2}" y="24" font-family="system-ui,sans-serif" font-size="13" fill="${C.textSec}" text-anchor="middle">🗺 Mappa · 🛡 Motoclub · 📢 Proposte · 💬 Chat · 👤 Profilo</text>
    <text x="${w-16}" y="24" font-family="system-ui,sans-serif" font-size="13" fill="${C.text}" text-anchor="end">9:41</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="${C.bg}"/>
    ${sbar}
    ${mapBg(0, 36, mapW, h-36)}
    ${pins.map(p => bikerPin(p.cx, p.cy+36, null)).join('')}
    <circle cx="${mapW*0.5}" cy="${h*0.5}" r="8" fill="${C.blue}"/>
    <circle cx="${mapW*0.5}" cy="${h*0.5}" r="24" fill="${C.blue}" opacity="0.2"/>
    <rect x="${mapW}" y="36" width="${w-mapW}" height="${h-36}" fill="${C.surface}"/>
    <line x1="${mapW}" y1="36" x2="${mapW}" y2="${h}" stroke="${C.border}" stroke-width="1"/>
    <text x="${panelX+20}" y="70" font-family="system-ui,sans-serif" font-size="16" font-weight="700" fill="${C.text}">Biker vicini</text>
    <text x="${panelX+20}" y="90" font-family="system-ui,sans-serif" font-size="13" fill="${C.textSec}">6 motociclisti nel raggio</text>
    ${bikers.map((b,i)=>{
      const by = 108 + i*90;
      return `${card(panelX+10, by, w-mapW-20, 78, 10)}
        <circle cx="${panelX+42}" cy="${by+39}" r="18" fill="${b.color}" opacity="0.8"/>
        <text x="${panelX+42}" y="${by+45}" font-family="system-ui,sans-serif" font-size="14" text-anchor="middle">🏍</text>
        <text x="${panelX+70}" y="${by+28}" font-family="system-ui,sans-serif" font-size="14" font-weight="600" fill="${C.text}">${b.name}</text>
        <text x="${panelX+70}" y="${by+48}" font-family="system-ui,sans-serif" font-size="12" fill="${C.textSec}">📍 ${b.dist} · ${b.type}</text>
        <rect x="${w-80}" y="${by+24}" width="64" height="28" rx="14" fill="${C.accent}" opacity="0.12"/>
        <text x="${w-48}" y="${by+43}" font-family="system-ui,sans-serif" font-size="11" fill="${C.accent}" text-anchor="middle">Contatta</text>`;
    }).join('')}
  </svg>`;
}

function chromebookMotoclub(w, h) {
  const lw = Math.floor(w*0.35);
  const rw = w - lw;
  const clubs = [
    {name:'Ducati Club Roma',members:'142',color:C.red},
    {name:'Vespa Riders Milano',members:'89',color:C.accent},
    {name:'BMW Motorrad Nord',members:'213',color:C.blue},
    {name:'Honda Club Italia',members:'67',color:C.green},
  ];
  const sbar = `<rect x="0" y="0" width="${w}" height="36" fill="${C.surface}"/>
    <text x="16" y="24" font-family="system-ui,sans-serif" font-size="14" font-weight="700" fill="${C.accent}">BikerLink</text>
    <text x="${w/2}" y="24" font-family="system-ui,sans-serif" font-size="13" fill="${C.textSec}" text-anchor="middle">🗺 Mappa · 🛡 Motoclub · 📢 Proposte · 💬 Chat · 👤 Profilo</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="${C.bg}"/>
    ${sbar}
    <rect x="0" y="36" width="${lw}" height="${h-36}" fill="${C.surface}"/>
    <line x1="${lw}" y1="36" x2="${lw}" y2="${h}" stroke="${C.border}" stroke-width="1"/>
    <text x="16" y="70" font-family="system-ui,sans-serif" font-size="16" font-weight="700" fill="${C.text}">Motoclub 🛡</text>
    <rect x="10" y="80" width="${lw-20}" height="32" rx="10" fill="${C.surfaceL}"/>
    <text x="22" y="101" font-family="system-ui,sans-serif" font-size="13" fill="${C.textMut}">🔍 Cerca...</text>
    ${clubs.map((c,i)=>{
      const cy = 126+i*90;
      const isActive = i===0;
      return `<rect x="0" y="${cy}" width="${lw}" height="82" fill="${isActive?C.accent+'18':C.bg}"/>
        <line x1="0" y1="${cy+81}" x2="${lw}" y2="${cy+81}" stroke="${C.border}" stroke-width="0.5"/>
        <circle cx="32" cy="${cy+41}" r="18" fill="${c.color}" opacity="0.8"/>
        <text x="32" y="${cy+47}" font-family="system-ui,sans-serif" font-size="14" text-anchor="middle">🛡</text>
        <text x="58" y="${cy+30}" font-family="system-ui,sans-serif" font-size="13" font-weight="600" fill="${C.text}">${c.name}</text>
        <text x="58" y="${cy+50}" font-family="system-ui,sans-serif" font-size="12" fill="${C.textSec}">👥 ${c.members} membri</text>`;
    }).join('')}
    <rect x="${lw}" y="36" width="${rw}" height="${h-36}" fill="${C.bg}"/>
    <text x="${lw+24}" y="75" font-family="system-ui,sans-serif" font-size="18" font-weight="700" fill="${C.text}">Ducati Club Roma 🛡</text>
    <text x="${lw+24}" y="98" font-family="system-ui,sans-serif" font-size="13" fill="${C.textSec}">142 membri · Fondato nel 2008 · Roma, Lazio</text>
    <rect x="${lw+24}" y="110" width="110" height="30" rx="15" fill="${C.accent}"/>
    <text x="${lw+79}" y="130" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="#fff" text-anchor="middle">+ Unisciti</text>
    <rect x="${lw+144}" y="110" width="110" height="30" rx="15" fill="${C.surfaceL}"/>
    <text x="${lw+199}" y="130" font-family="system-ui,sans-serif" font-size="13" fill="${C.text}" text-anchor="middle">💬 Chat Club</text>
    <text x="${lw+24}" y="162" font-family="system-ui,sans-serif" font-size="14" font-weight="600" fill="${C.text}">Prossimi eventi</text>
    ${[{t:'Giro sul Tuscolo',d:'Dom 28 Apr, 09:00'},{t:'Raduno Natale',d:'Sab 4 Mag, 10:00'},{t:'Giro Colli Albani',d:'Dom 11 Mag, 08:30'}].map((e,i)=>{
      const ey = 174+i*72;
      return `${card(lw+24, ey, rw-48, 60, 10)}
        <text x="${lw+44}" y="${ey+24}" font-family="system-ui,sans-serif" font-size="14" font-weight="600" fill="${C.text}">${e.t}</text>
        <text x="${lw+44}" y="${ey+44}" font-family="system-ui,sans-serif" font-size="12" fill="${C.textSec}">📅 ${e.d}</text>`;
    }).join('')}
    <text x="${lw+24}" y="400" font-family="system-ui,sans-serif" font-size="14" font-weight="600" fill="${C.text}">Membri recenti</text>
    ${[C.blue,C.blue,C.pink,C.blue,C.accent,C.pink,C.blue].map((c,i)=>`
      <circle cx="${lw+48+i*56}" cy="440" r="22" fill="${c}" opacity="0.8"/>
      <text x="${lw+48+i*56}" y="447" font-family="system-ui,sans-serif" font-size="16" text-anchor="middle">🏍</text>
    `).join('')}
  </svg>`;
}

function chromebookGarage(w, h) {
  const lw = Math.floor(w*0.38);
  const sbar = `<rect x="0" y="0" width="${w}" height="36" fill="${C.surface}"/>
    <text x="16" y="24" font-family="system-ui,sans-serif" font-size="14" font-weight="700" fill="${C.accent}">BikerLink</text>
    <text x="${w/2}" y="24" font-family="system-ui,sans-serif" font-size="13" fill="${C.textSec}" text-anchor="middle">🗺 Mappa · 🛡 Motoclub · 📢 Proposte · 💬 Chat · 👤 Profilo</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="${C.bg}"/>
    ${sbar}
    <rect x="0" y="36" width="${lw}" height="${h-36}" fill="${C.surface}"/>
    <line x1="${lw}" y1="36" x2="${lw}" y2="${h}" stroke="${C.border}" stroke-width="1"/>
    <text x="16" y="70" font-family="system-ui,sans-serif" font-size="16" font-weight="700" fill="${C.text}">Garage 🏍</text>
    <text x="16" y="88" font-family="system-ui,sans-serif" font-size="13" fill="${C.textSec}">Le tue moto (2/5)</text>
    ${[{b:'Ducati',m:'Monster 821',active:true},{b:'Honda',m:'CB500F',active:false}].map((mo,i)=>{
      const cy = 102+i*100;
      return `<rect x="0" y="${cy}" width="${lw}" height="92" fill="${mo.active?C.accent+'15':C.bg}"/>
        <line x1="0" y1="${cy+91}" x2="${lw}" y2="${cy+91}" stroke="${C.border}" stroke-width="0.5"/>
        <text x="28" y="${cy+44}" font-family="system-ui,sans-serif" font-size="32">🏍</text>
        <text x="68" y="${cy+30}" font-family="system-ui,sans-serif" font-size="14" font-weight="600" fill="${C.text}">${mo.b} ${mo.m}</text>
        ${mo.active?`<rect x="68" y="${cy+36}" width="68" height="20" rx="10" fill="${C.accent}" opacity="0.15"/>
        <text x="102" y="${cy+50}" font-family="system-ui,sans-serif" font-size="11" fill="${C.accent}" text-anchor="middle">⭐ Principale</text>`:''}
        <text x="68" y="${cy+64}" font-family="system-ui,sans-serif" font-size="12" fill="${C.textSec}">${mo.b==='Ducati'?'821cc · Naked':'500cc · Naked'}</text>`;
    }).join('')}
    <rect x="${lw}" y="36" width="${w-lw}" height="${h-36}" fill="${C.bg}"/>
    <text x="${lw+24}" y="72" font-family="system-ui,sans-serif" font-size="20" font-weight="700" fill="${C.text}">Ducati Monster 821</text>
    <text x="${lw+24}" y="96" font-family="system-ui,sans-serif" font-size="14" fill="${C.textSec}">821cc · Naked · Stile: Mozzafiato · ⭐ Moto principale</text>
    <text x="${lw+24}" y="126" font-family="system-ui,sans-serif" font-size="68">🏍</text>
    ${[
      {label:'Cilindrata', val:'821 cc'},
      {label:'Tipo', val:'Naked'},
      {label:'Stile di guida', val:'Mozzafiato'},
      {label:'Anno', val:'2019'},
      {label:'In vendita', val:'No'},
    ].map((item,i)=>{
      const row = `<rect x="${lw+24}" y="${140+i*50}" width="${w-lw-48}" height="40" rx="8" fill="${C.surface}"/>
        <text x="${lw+44}" y="${140+i*50+26}" font-family="system-ui,sans-serif" font-size="13" fill="${C.textSec}">${item.label}</text>
        <text x="${w-36}" y="${140+i*50+26}" font-family="system-ui,sans-serif" font-size="13" font-weight="600" fill="${C.text}" text-anchor="end">${item.val}</text>`;
      return row;
    }).join('')}
    <rect x="${lw+24}" y="${h-76}" width="${(w-lw-60)/2}" height="44" rx="22" fill="${C.surfaceL}"/>
    <text x="${lw+24+(w-lw-60)/4}" y="${h-47}" font-family="system-ui,sans-serif" font-size="14" fill="${C.text}" text-anchor="middle">✏️ Modifica</text>
    <rect x="${lw+36+(w-lw-60)/2}" y="${h-76}" width="${(w-lw-60)/2}" height="44" rx="22" fill="${C.red}" opacity="0.12"/>
    <text x="${lw+36+(w-lw-60)/2+(w-lw-60)/4}" y="${h-47}" font-family="system-ui,sans-serif" font-size="14" fill="${C.red}" text-anchor="middle">🗑 Elimina</text>
  </svg>`;
}

function chromebookTracking(w, h) {
  const mapW = Math.floor(w*0.6);
  const panelW = w - mapW;
  const sbar = `<rect x="0" y="0" width="${w}" height="36" fill="${C.surface}"/>
    <text x="16" y="24" font-family="system-ui,sans-serif" font-size="14" font-weight="700" fill="${C.accent}">BikerLink</text>
    <text x="${w/2}" y="24" font-family="system-ui,sans-serif" font-size="13" fill="${C.textSec}" text-anchor="middle">🗺 Mappa · 🛡 Motoclub · 📢 Proposte · 💬 Chat · 👤 Profilo</text>`;
  const routePoints2 = [];
  for(let i=0; i<=20; i++) {
    const px = mapW*0.08 + (mapW*0.84)*(i/20) + Math.sin(i*0.8)*18;
    const py = h*0.15 + (h*0.65)*(i/20) + Math.cos(i*0.6)*14;
    routePoints2.push(`${px},${py+36}`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="${C.bg}"/>
    ${sbar}
    ${mapBg(0, 36, mapW, h-36)}
    <polyline points="${routePoints2.join(' ')}" fill="none" stroke="${C.accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${routePoints2[0].split(',')[0]}" cy="${routePoints2[0].split(',')[1]}" r="8" fill="${C.green}"/>
    <circle cx="${routePoints2[routePoints2.length-1].split(',')[0]}" cy="${routePoints2[routePoints2.length-1].split(',')[1]}" r="10" fill="${C.blue}"/>
    <circle cx="${routePoints2[routePoints2.length-1].split(',')[0]}" cy="${routePoints2[routePoints2.length-1].split(',')[1]}" r="24" fill="${C.blue}" opacity="0.2"/>
    <rect x="${mapW}" y="36" width="${panelW}" height="${h-36}" fill="${C.surface}"/>
    <line x1="${mapW}" y1="36" x2="${mapW}" y2="${h}" stroke="${C.border}" stroke-width="1"/>
    <text x="${mapW+20}" y="80" font-family="system-ui,sans-serif" font-size="16" font-weight="700" fill="${C.text}">Tracking Live 📍</text>
    <rect x="${mapW+20}" y="88" width="${panelW-40}" height="20" rx="10" fill="${C.green}" opacity="0.15"/>
    <text x="${mapW+panelW/2}" y="103" font-family="system-ui,sans-serif" font-size="12" fill="${C.green}" text-anchor="middle">● Giro in corso</text>
    <text x="${mapW+panelW/2}" y="152" font-family="system-ui,sans-serif" font-size="48" font-weight="800" fill="${C.accent}" text-anchor="middle">87</text>
    <text x="${mapW+panelW/2}" y="178" font-family="system-ui,sans-serif" font-size="15" fill="${C.textSec}" text-anchor="middle">km/h</text>
    <line x1="${mapW+20}" y1="196" x2="${w-20}" y2="196" stroke="${C.border}" stroke-width="1"/>
    ${[{v:'67.4 km',l:'percorsi'},{v:'1h 23m',l:'durata'},{v:'+450m',l:'dislivello'},{v:'118',l:'km/h max'}].map((s,i)=>{
      const sy = 212 + i*72;
      return `<text x="${mapW+panelW/2}" y="${sy}" font-family="system-ui,sans-serif" font-size="22" font-weight="700" fill="${C.text}" text-anchor="middle">${s.v}</text>
        <text x="${mapW+panelW/2}" y="${sy+22}" font-family="system-ui,sans-serif" font-size="13" fill="${C.textSec}" text-anchor="middle">${s.l}</text>
        <line x1="${mapW+20}" y1="${sy+36}" x2="${w-20}" y2="${sy+36}" stroke="${C.border}" stroke-width="0.5"/>`;
    }).join('')}
    <rect x="${mapW+20}" y="${h-70}" width="${panelW-40}" height="46" rx="23" fill="${C.red}" opacity="0.9"/>
    <text x="${mapW+panelW/2}" y="${h-40}" font-family="system-ui,sans-serif" font-size="15" font-weight="700" fill="#fff" text-anchor="middle">■ Termina Giro</text>
  </svg>`;
}

async function saveSvg(svgStr, outPath, width, height) {
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const buf = Buffer.from(svgStr, 'utf8');
  await sharp(buf, { density: 192 })
    .resize(width, height, { fit: 'fill' })
    .png({ compressionLevel: 6 })
    .toFile(outPath);
  console.log(`  ✓ ${outPath} (${width}x${height})`);
}

async function main() {
  const PW = 1080, PH = 1920;
  const T7W = 1200, T7H = 1920;
  const T10W = 1600, T10H = 2560;
  const CW = 1280, CH = 800;

  const screens = [
    { fn: screenMappa,    name: '01' },
    { fn: screenMatch,    name: '02' },
    { fn: screenMotoclub, name: '03' },
    { fn: screenChat,     name: '04' },
    { fn: screenTracking, name: '05' },
    { fn: screenGarage,   name: '06' },
    { fn: screenProposte, name: '07' },
    { fn: screenProfilo,  name: '08' },
  ];

  console.log('\n=== Generating Phone 1080x1920 ===');
  for (const s of screens) {
    await saveSvg(s.fn(PW, PH), `assets/screenshots/phone/ScreenPhone-${s.name}.png`, PW, PH);
  }

  console.log('\n=== Generating Tablet 7" 1200x1920 ===');
  for (const s of screens) {
    await saveSvg(s.fn(T7W, T7H), `assets/screenshots/tablet7/ScreenTablet7-${s.name}.png`, T7W, T7H);
  }

  console.log('\n=== Generating Tablet 10" 1600x2560 ===');
  for (const s of screens) {
    await saveSvg(s.fn(T10W, T10H), `assets/screenshots/tablet10/ScreenTablet10-${s.name}.png`, T10W, T10H);
  }

  console.log('\n=== Generating Chromebook 1280x800 ===');
  await saveSvg(chromebookMappa(CW, CH),     'assets/screenshots/chromebook/ScreenChromebook-01.png', CW, CH);
  await saveSvg(chromebookMotoclub(CW, CH),  'assets/screenshots/chromebook/ScreenChromebook-02.png', CW, CH);
  await saveSvg(chromebookGarage(CW, CH),    'assets/screenshots/chromebook/ScreenChromebook-03.png', CW, CH);
  await saveSvg(chromebookTracking(CW, CH),  'assets/screenshots/chromebook/ScreenChromebook-04.png', CW, CH);

  console.log('\n=== DONE ===');
}

main().catch(console.error);
