import type { PageMeta } from "./render";
import { breadcrumbsJsonLd, organizationJsonLd } from "./render";

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  displayDate: string;
  readingTime: string;
  category: string;
  body: string;
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "perche-esiste-bikerlink",
    title: "Perché esiste BikerLink",
    description: "Una community costruita attorno a ciò che conta davvero quando si va in moto: persone, strade e presenza reciproca.",
    publishedAt: "2026-09-06",
    displayDate: "6 settembre 2026",
    readingTime: "4 min",
    category: "BikerLink",
    body: `
      <p>Andare in moto è una cosa personale. Ma una strada bella, una pausa improvvisata e una persona giusta incontrata al momento possono trasformare un giro normale in qualcosa che resta.</p>
      <p>BikerLink nasce per tenere insieme questi pezzi: sapere chi c'è vicino, trovare compagni compatibili, organizzarsi con il proprio MotoClub e avere una rete reale quando serve una mano.</p>
      <h2>Non un social generico</h2>
      <p>Una community di motociclisti ha esigenze diverse: capire chi vuole uscire, condividere un percorso, incontrare persone che guidano con un ritmo simile e avere un riferimento in caso di necessità. Per questo BikerLink è costruita attorno alla moto, non adattata dopo.</p>
      <h2>La tecnologia deve restare sullo sfondo</h2>
      <p>Mappa live, GPS, telemetria e matching servono a rendere più semplice la vita prima, durante e dopo il giro. Il punto non è riempire lo schermo di dati: è arrivare a una strada migliore, una compagnia migliore o un aiuto più veloce.</p>
      <p>È un progetto in evoluzione, ma la direzione è semplice: fare in modo che nessun biker debba partire davvero da solo.</p>
    `,
  },
  {
    slug: "un-giro-comincia-prima-di-partire",
    title: "Un giro comincia prima di partire",
    description: "Un buon giro non è solo una traccia sul navigatore: è anche il modo in cui scegli chi portarti dietro e cosa vuoi vivere.",
    publishedAt: "2026-09-06",
    displayDate: "6 settembre 2026",
    readingTime: "5 min",
    category: "Giri e community",
    body: `
      <p>Prima di mettere il casco ci sono sempre alcune domande: dove si va, quanto tempo si ha, che ritmo si vuole tenere e con chi vale la pena condividere la giornata.</p>
      <p>BikerLink mette insieme proposte di giro, MotoClub, chat e mappa live per ridurre la parte più noiosa dell'organizzazione e lasciare spazio alla strada.</p>
      <h2>La compagnia cambia il giro</h2>
      <p>Non serve avere la stessa moto per viaggiare bene insieme. Contano di più disponibilità, stile di guida, distanze che si vogliono fare e il tipo di esperienza cercata. Un giro tranquillo in collina e una giornata di curve serrate non richiedono lo stesso equipaggio.</p>
      <h2>Dal messaggio al punto d'incontro</h2>
      <p>Le proposte permettono di dire chiaramente cosa hai in mente; i MotoClub tengono organizzata la vita del gruppo; la chat evita di disperdere decisioni importanti in dieci conversazioni diverse. La tecnologia deve togliere attrito, non aggiungere un'altra cosa da gestire.</p>
      <p>Il risultato migliore è semplice: meno tempo a rincorrersi e più tempo con la moto accesa.</p>
    `,
  },
  {
    slug: "sos-biker-una-rete-che-risponde",
    title: "SOS Biker: una rete che risponde",
    description: "Quando qualcosa va storto in strada, la differenza la fa chi riesce a sapere subito dove sei e può muoversi davvero.",
    publishedAt: "2026-09-06",
    displayDate: "6 settembre 2026",
    readingTime: "4 min",
    category: "Sicurezza",
    body: `
      <p>Una foratura lontano da casa, un guasto, una caduta senza conseguenze gravi ma con la moto ferma: non tutte le emergenze richiedono gli stessi soccorsi, ma tutte richiedono che qualcuno capisca rapidamente dove sei.</p>
      <p>Il sistema SOS di BikerLink è pensato per avvisare la community vicina con la posizione disponibile, così da rendere più facile chiedere e ricevere una mano.</p>
      <h2>Prima le persone, poi l'app</h2>
      <p>Nessuna funzione sostituisce i servizi di emergenza. In caso di pericolo immediato o feriti bisogna chiamare prima il numero di emergenza locale. Il SOS Biker serve a far entrare in gioco la rete di persone che può raggiungerti o aiutarti a risolvere il problema pratico.</p>
      <h2>Una community utile quando conta</h2>
      <p>Il valore di una community non si vede solo nelle foto dei giri. Si vede quando una persona resta senza benzina, ha bisogno di un attrezzo, deve aspettare un carro attrezzi o semplicemente non vuole rimanere sola sul ciglio della strada.</p>
      <p>È questa l'idea: costruire una presenza concreta, non solo un elenco di profili.</p>
    `,
  },
];

const BLOG_CSS = `<style>
.blog-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.blog-card{display:flex;flex-direction:column;min-height:300px;background:linear-gradient(145deg,#171717 0%,#101010 68%);border:1px solid var(--border);border-radius:var(--radius);padding:26px;transition:transform .2s,border-color .2s}.blog-card:hover{transform:translateY(-3px);border-color:rgba(255,59,48,.5);opacity:1}.blog-card-category,.blog-article-meta{font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--accent)}.blog-card h2{font-family:var(--font-display);font-size:32px;line-height:1.02;letter-spacing:1px;text-transform:uppercase;margin:18px 0 12px;color:var(--text)}.blog-card p{font-size:15px;line-height:1.7;color:var(--text2);margin-bottom:20px}.blog-card-footer{margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--text3);font-size:13px}.blog-read{font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text)}.blog-article{max-width:780px;margin:0 auto}.blog-article header{padding:28px 0 38px;border-bottom:1px solid var(--border);margin-bottom:38px}.blog-article h1{font-family:var(--font-display);font-size:clamp(44px,7vw,76px);line-height:.98;letter-spacing:2px;text-transform:uppercase;margin:14px 0 18px}.blog-article .blog-deck{font-size:19px;line-height:1.65;color:var(--text2);max-width:680px}.blog-article .blog-article-meta{display:flex;gap:12px;flex-wrap:wrap;color:var(--text3)}.blog-article .blog-article-meta span:first-child{color:var(--accent)}.blog-article .prose{max-width:none}.blog-back{display:inline-flex;align-items:center;gap:8px;margin-bottom:28px;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text2)}.blog-back:hover{color:var(--accent);opacity:1}@media(max-width:900px){.blog-grid{grid-template-columns:1fr 1fr}}@media(max-width:600px){.blog-grid{grid-template-columns:1fr}.blog-card{min-height:250px}.blog-article header{padding-top:8px}.blog-article .blog-deck{font-size:17px}}
</style>`;

function postUrl(post: BlogPost): string {
  return `/blog/${post.slug}`;
}

function blogPostingJsonLd(baseUrl: string, post: BlogPost) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.publishedAt,
    mainEntityOfPage: `${baseUrl}${postUrl(post)}`,
    author: { "@type": "Organization", name: "BikerLink" },
    publisher: { "@type": "Organization", name: "BikerLink" },
  };
}

export function findBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((post) => post.slug === slug);
}

export function buildBlogIndex(baseUrl: string): { meta: PageMeta; body: string } {
  const cards = BLOG_POSTS.map(
    (post) => `
      <a class="blog-card" href="${postUrl(post)}" aria-label="Leggi: ${post.title}">
        <span class="blog-card-category">${post.category}</span>
        <h2>${post.title}</h2>
        <p>${post.description}</p>
        <span class="blog-card-footer"><span>${post.displayDate} · ${post.readingTime}</span><span class="blog-read">Leggi →</span></span>
      </a>`,
  ).join("");

  return {
    meta: {
      path: "/blog",
      title: "Blog BikerLink — Strade, community e vita in moto",
      description: "Storie, idee e aggiornamenti da BikerLink: community, giri, sicurezza e tutto ciò che rende la moto più condivisa.",
      headExtras: BLOG_CSS,
      jsonld: [
        organizationJsonLd(baseUrl),
        { "@context": "https://schema.org", "@type": "Blog", name: "Blog BikerLink", url: `${baseUrl}/blog`, description: "Strade, community e vita in moto." },
      ],
    },
    body: `
      <section class="page-hero"><div class="section-inner"><div class="breadcrumb"><a href="/">BikerLink</a> / Blog</div><h1>Strade, persone,<br/><span class="accent">moto.</span></h1><p class="lead">Il blog di BikerLink: quello che succede prima, durante e dopo un giro.</p></div></section>
      <section class="section"><div class="section-inner"><div class="blog-grid">${cards}</div></div></section>`,
  };
}

export function buildBlogPost(baseUrl: string, post: BlogPost): { meta: PageMeta; body: string } {
  const path = postUrl(post);
  return {
    meta: {
      path,
      title: `${post.title} — Blog BikerLink`,
      description: post.description,
      headExtras: BLOG_CSS,
      jsonld: [
        organizationJsonLd(baseUrl),
        breadcrumbsJsonLd(baseUrl, [{ name: "BikerLink", path: "/" }, { name: "Blog", path: "/blog" }, { name: post.title, path }]),
        blogPostingJsonLd(baseUrl, post),
      ],
    },
    body: `
      <section class="section"><article class="blog-article"><a class="blog-back" href="/blog">← Tutti gli articoli</a><header><div class="blog-article-meta"><span>${post.category}</span><span>${post.displayDate}</span><span>${post.readingTime} di lettura</span></div><h1>${post.title}</h1><p class="blog-deck">${post.description}</p></header><div class="prose">${post.body}</div></article></section>`,
  };
}
