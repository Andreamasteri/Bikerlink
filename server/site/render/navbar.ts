import { SITE_TRANSLATIONS } from "./translations";

export function navbar(currentPath: string): string {
  const link = (href: string, label: string, key: string) => {
    const active = href === currentPath ? ' aria-current="page"' : "";
    return `<a href="${href}"${active} data-i18n="${key}">${label}</a>`;
  };
  const T_JSON = JSON.stringify(SITE_TRANSLATIONS);
  return `
<header class="navbar" role="banner">
  <div class="nav-inner">
    <a href="/" class="nav-logo" aria-label="BIKER·LINK home">BIKER<span class="dot">·</span>LINK</a>
    <button class="nav-burger" id="navBurger" aria-label="Menu" aria-controls="navLinks" aria-expanded="false"><span aria-hidden="true">☰</span><span class="sr-only">Menu</span></button>
    <nav id="navLinks" class="nav-links" aria-label="Navigazione principale">
      ${link("/features", "Funzionalità", "nav.features")}
      ${link("/matching", "Matching", "nav.matching")}
      ${link("/sos", "SOS", "nav.sos")}
      ${link("/motoclub", "MotoClub", "nav.motoclub")}
      ${link("/community", "Community", "nav.community")}
      ${link("/blog", "Blog", "nav.blog")}
      ${link("/about", "About", "nav.about")}
      ${link("/faq", "FAQ", "nav.faq")}
      <a href="/accedi?next=/pianifica" id="navPlannerLink" class="nav-planner-link" data-i18n="nav.planner">🤖 Pianifica Giro</a>
      <a href="/download" class="nav-cta" aria-label="Scarica app" data-i18n="nav.download">Scarica app</a>
      <div class="lang-toggle nav-lang-mobile" role="group" aria-label="Seleziona lingua">
        <button class="lang-btn" id="langIT_m" aria-pressed="true" onclick="setLang('it')">IT</button>
        <button class="lang-btn" id="langEN_m" aria-pressed="false" onclick="setLang('en')">EN</button>
      </div>
    </nav>
    <div class="lang-toggle" role="group" aria-label="Seleziona lingua">
      <button class="lang-btn" id="langIT" aria-pressed="true" onclick="setLang('it')">IT</button>
      <button class="lang-btn" id="langEN" aria-pressed="false" onclick="setLang('en')">EN</button>
    </div>
  </div>
</header>
<script>
(function(){
  var b=document.getElementById('navBurger'),n=document.getElementById('navLinks');
  function setMenu(open){
    n.classList.toggle('open',open);
    b.setAttribute('aria-expanded',open?'true':'false');
    try{document.body.style.overflow=open?'hidden':'';}catch(e){}
  }
  if(b&&n){
    b.addEventListener('click',function(){
      setMenu(!n.classList.contains('open'));
    });
    n.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click',function(){
        if(n.classList.contains('open')) setMenu(false);
      });
    });
  }

  var T=${T_JSON};

  function applyLang(lang){
    var d=T[lang]||T.it;
    document.querySelectorAll('[data-i18n]').forEach(function(el){
      var k=el.getAttribute('data-i18n');
      if(d[k]!==undefined) el.textContent=d[k];
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function(el){
      var k=el.getAttribute('data-i18n-html');
      if(d[k]!==undefined) el.innerHTML=d[k];
    });
    document.querySelectorAll('[data-lang-block]').forEach(function(el){
      var b=el.getAttribute('data-lang-block');
      el.style.display=(b===lang)?'block':'none';
    });
    var btnIT=document.getElementById('langIT'),btnEN=document.getElementById('langEN');
    if(btnIT&&btnEN){
      btnIT.classList.toggle('active',lang==='it');
      btnEN.classList.toggle('active',lang==='en');
      btnIT.setAttribute('aria-pressed',lang==='it'?'true':'false');
      btnEN.setAttribute('aria-pressed',lang==='en'?'true':'false');
    }
    var btnITm=document.getElementById('langIT_m'),btnENm=document.getElementById('langEN_m');
    if(btnITm&&btnENm){
      btnITm.classList.toggle('active',lang==='it');
      btnENm.classList.toggle('active',lang==='en');
      btnITm.setAttribute('aria-pressed',lang==='it'?'true':'false');
      btnENm.setAttribute('aria-pressed',lang==='en'?'true':'false');
    }
    document.documentElement.lang=lang==='en'?'en':'it';
  }

  window.setLang=function(lang){
    try{localStorage.setItem('bl_lang',lang);}catch(e){}
    applyLang(lang);
  };

  var saved;
  try{saved=localStorage.getItem('bl_lang');}catch(e){}
  applyLang(saved==='en'?'en':'it');

  // Upgrade planner link to /pianifica if already logged in
  var pl=document.getElementById('navPlannerLink');
  if(pl){
    fetch('/api/auth/me',{credentials:'include'}).then(function(r){
      if(r.ok) pl.setAttribute('href','/pianifica');
    }).catch(function(){});
  }
})();
</script>`;
}
