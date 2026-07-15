import { navbar } from "./render/navbar";
import { SHARED_CSS } from "./render/styles";
import type { Request } from "express";

export interface PageMeta {
  path: string;
  title: string;
  description: string;
  h1?: string;
  ogImage?: string;
  jsonld?: object | object[];
  noindex?: boolean;
  /** Extra <link>/<meta> tags appended to <head> for page-specific hints
   *  (e.g. preconnect for third-party origins used only on that page). */
  headExtras?: string;
}

export function getBaseUrl(req: Request): string {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host") || "bikerlink.replit.app";
  return `${protocol}://${host}`;
}

// Minify the inline stylesheet: strip CSS comments, collapse newlines and
// consecutive spaces. Keeps semantics unchanged.
const SHARED_CSS_MIN = SHARED_CSS
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\s*\n\s*/g, "")
  .replace(/\s{2,}/g, " ")
  .replace(/\s*([{}:;,>])\s*/g, "$1")
  .trim();

function jsonldScript(jsonld?: object | object[]): string {
  if (!jsonld) return "";
  const arr = Array.isArray(jsonld) ? jsonld : [jsonld];
  return arr
    .map(
      (o) =>
        `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`,
    )
    .join("");
}

function footer(): string {
  const year = new Date().getFullYear();
  return `
<footer class="footer" role="contentinfo">
  <div class="footer-inner">
    <div>
      <div class="footer-brand">BIKER<span class="dot">·</span>LINK</div>
      <p class="footer-tag" data-i18n="footer.tag">La prima piattaforma verticale per motociclisti. Community, GPS live, MotoClub, SOS — gratis per sempre.</p>
      <div class="btn-row" style="margin-top:8px">
        <a class="btn btn-primary" href="/download" data-i18n="footer.dl-btn">Scarica l'app</a>
      </div>
      <div style="margin-top:14px;display:flex;align-items:center;gap:16px">
        <a href="https://www.youtube.com/@Bikerlink-f4k" target="_blank" rel="noopener" aria-label="Canale YouTube BikerLink" style="display:inline-flex;align-items:center;color:var(--text3);text-decoration:none;transition:color .2s" onmouseover="this.style.color='#FF0000'" onmouseout="this.style.color='var(--text3)'">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
        </a>
        <a href="https://www.instagram.com/bikerlink.app" target="_blank" rel="noopener" aria-label="Instagram BikerLink" style="display:inline-flex;align-items:center;color:var(--text3);text-decoration:none;transition:color .2s" onmouseover="this.style.color='#E1306C'" onmouseout="this.style.color='var(--text3)'">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
        </a>
        <a href="https://www.facebook.com/bikerlink" target="_blank" rel="noopener" aria-label="Pagina Facebook BikerLink" style="display:inline-flex;align-items:center;color:var(--text3);text-decoration:none;transition:color .2s" onmouseover="this.style.color='#1877F2'" onmouseout="this.style.color='var(--text3)'">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.532-4.697 1.313 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
        </a>
        <a href="https://t.me/bikerlink" target="_blank" rel="noopener" aria-label="Canale Telegram BikerLink" style="display:inline-flex;align-items:center;color:var(--text3);text-decoration:none;transition:color .2s" onmouseover="this.style.color='#2AABEE'" onmouseout="this.style.color='var(--text3)'">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
        </a>
        <a href="https://www.tiktok.com/@bikerlink" target="_blank" rel="noopener" aria-label="TikTok BikerLink" style="display:inline-flex;align-items:center;color:var(--text3);text-decoration:none;transition:color .2s" onmouseover="this.style.color='#010101'" onmouseout="this.style.color='var(--text3)'">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.27 8.27 0 0 0 4.84 1.55V6.79a4.85 4.85 0 0 1-1.07-.1z"/></svg>
        </a>
        <a href="https://www.linkedin.com/company/bikerlink" target="_blank" rel="noopener" aria-label="LinkedIn BikerLink" style="display:inline-flex;align-items:center;color:var(--text3);text-decoration:none;transition:color .2s" onmouseover="this.style.color='#0A66C2'" onmouseout="this.style.color='var(--text3)'">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
        </a>
      </div>
    </div>
    <div>
      <h2 style="font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text);margin-bottom:14px" data-i18n="footer.product">Prodotto</h2>
      <ul>
        <li><a href="/features" data-i18n="footer.features">Funzionalità</a></li>
        <li><a href="/matching" data-i18n="footer.matching">Matching</a></li>
        <li><a href="/sos" data-i18n="footer.sos">SOS Biker</a></li>
        <li><a href="/motoclub" data-i18n="footer.motoclub">MotoClub</a></li>
        <li><a href="/community" data-i18n="footer.community">Community</a></li>
        <li><a href="/download" data-i18n="footer.dl">Scarica l'app</a></li>
      </ul>
    </div>
    <div>
      <h2 style="font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text);margin-bottom:14px" data-i18n="footer.company">Azienda</h2>
      <ul>
        <li><a href="/about" data-i18n="footer.about">Chi siamo</a></li>
        <li><a href="/faq" data-i18n="footer.faq">Domande frequenti</a></li>
        <li><a href="/contact" data-i18n="footer.contact">Contatti</a></li>
        <li><a href="/matching/per-investitori" data-i18n="footer.investors">Investitori</a></li>
      </ul>
    </div>
    <div>
      <h2 style="font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text);margin-bottom:14px" data-i18n="footer.legal">Legale</h2>
      <ul>
        <li><a href="/privacy" data-i18n="footer.privacy">Privacy Policy</a></li>
        <li><a href="/terms" data-i18n="footer.terms">Termini di Servizio</a></li>
        <li><a href="/delete-account" data-i18n="footer.delete">Elimina account</a></li>
      </ul>
    </div>
  </div>
  <div class="footer-bottom">
    <span>© ${year} BikerLink. <span data-i18n="footer.rights">Tutti i diritti riservati.</span></span>
    <span data-i18n="footer.tagline">Made for riders, by riders.</span>
  </div>
</footer>`;
}

function musicBar(): string {
  const tracks = [
    { src: "/music/chill-road-1.mp3", label: "Chill Road #1" },
    { src: "/music/chill-road-2.mp3", label: "Chill Road #2" },
    { src: "/music/chill-road-3.mp3", label: "Chill Road #3" },
    { src: "/music/chill-road-4.mp3", label: "Chill Road #4" },
  ];
  const tracksJson = JSON.stringify(tracks);
  return `
<div class="music-bar" role="region" aria-label="Player musica ambient">
  <span class="music-bar-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
  </span>
  <span class="music-bar-track" id="musicTrackName">Chill Road #1</span>
  <button class="music-bar-btn play-btn" id="musicPlayBtn" aria-label="Play / Pausa" title="Play / Pausa">
    <svg class="icon-play" viewBox="0 0 24 24" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
    <svg class="icon-pause" viewBox="0 0 24 24" aria-hidden="true"><line x1="6" y1="4" x2="6" y2="20"/><line x1="18" y1="4" x2="18" y2="20"/></svg>
  </button>
  <button class="music-bar-btn mute-btn" id="musicMuteBtn" aria-label="Muto / Volume" title="Muto / Volume">
    <svg class="icon-volume" viewBox="0 0 24 24" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
    <svg class="icon-mute" viewBox="0 0 24 24" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
  </button>
</div>
<script>
(function(){
  var TRACKS=${tracksJson};
  var idx=0,playing=false,muted=false;
  var audio=new Audio();
  audio.preload='none';

  var playBtn=document.getElementById('musicPlayBtn');
  var muteBtn=document.getElementById('musicMuteBtn');
  var trackName=document.getElementById('musicTrackName');

  function loadTrack(i){
    idx=i%TRACKS.length;
    audio.src=TRACKS[idx].src;
    if(trackName)trackName.textContent=TRACKS[idx].label;
  }

  function restoreState(){
    try{
      var s=JSON.parse(localStorage.getItem('bl_music')||'{}');
      idx=(s.idx||0)%TRACKS.length;
      muted=!!s.muted;
    }catch(e){idx=0;muted=false;}
    audio.muted=muted;
    if(muteBtn)muteBtn.classList.toggle('muted',muted);
    loadTrack(idx);
  }

  function saveState(){
    try{localStorage.setItem('bl_music',JSON.stringify({idx:idx,muted:muted}));}catch(e){}
  }

  function setPlaying(p){
    playing=p;
    if(playBtn)playBtn.classList.toggle('playing',playing);
  }

  audio.addEventListener('ended',function(){
    loadTrack(idx+1);
    audio.play().then(function(){setPlaying(true);}).catch(function(){setPlaying(false);});
    saveState();
  });

  if(playBtn){
    playBtn.addEventListener('click',function(){
      if(!playing){
        if(!audio.src||audio.src===''){loadTrack(idx);}
        audio.play().then(function(){setPlaying(true);saveState();}).catch(function(){setPlaying(false);});
      }else{
        audio.pause();
        setPlaying(false);
        saveState();
      }
    });
  }

  if(muteBtn){
    muteBtn.addEventListener('click',function(){
      muted=!muted;
      audio.muted=muted;
      muteBtn.classList.toggle('muted',muted);
      saveState();
    });
  }

  restoreState();
})();
</script>`;
}

export function renderPage(
  meta: PageMeta,
  bodyHtml: string,
  baseUrl: string,
): string {
  const url = `${baseUrl}${meta.path}`;
  const ogImage = meta.ogImage || `${baseUrl}/assets/images/playstore-icon.png`;
  const robots = meta.noindex ? "noindex, nofollow" : "index, follow";
  const titleSafe = meta.title.replace(/</g, "&lt;");
  const descSafe = meta.description.replace(/"/g, "&quot;");
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${titleSafe}</title>
<meta name="description" content="${descSafe}" />
<meta name="robots" content="${robots}" />
<meta name="theme-color" content="#0A0A0A" />
<link rel="canonical" href="${url}" />
<link rel="icon" type="image/png" href="/favicon.png" />
<link rel="apple-touch-icon" href="/assets/images/playstore-icon.png" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="BikerLink" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="${titleSafe}" />
<meta property="og:description" content="${descSafe}" />
<meta property="og:image" content="${ogImage}" />
<meta property="og:locale" content="it_IT" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${titleSafe}" />
<meta name="twitter:description" content="${descSafe}" />
<meta name="twitter:image" content="${ogImage}" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800;900&family=Manrope:wght@400;500;600;700&display=swap" />
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800;900&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet" media="print" onload="this.media='all'" />
<noscript><link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800;900&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet" /></noscript>
<style>${SHARED_CSS_MIN}</style>
${meta.headExtras || ""}
${jsonldScript(meta.jsonld)}
</head>
<body>
<a class="skip-link" href="#main-content">Salta al contenuto</a>
${musicBar()}
${navbar(meta.path)}
<main id="main-content" role="main">
${bodyHtml}
</main>
${footer()}
</body>
</html>`;
}

export function organizationJsonLd(baseUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "BikerLink",
    url: baseUrl,
    logo: `${baseUrl}/assets/images/playstore-icon.png`,
    email: "bikerlinkapp@gmail.com",
    sameAs: [],
    description:
      "Piattaforma verticale per motociclisti: community, GPS live, MotoClub, SOS e contest fotografici.",
  };
}

export function breadcrumbsJsonLd(
  baseUrl: string,
  items: { name: string; path: string }[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${baseUrl}${it.path}`,
    })),
  };
}
