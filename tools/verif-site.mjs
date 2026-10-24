import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

// Suite de verification du site vitrine. Depuis un clone du depot :
//   npm i playwright && npx playwright install chromium   (une fois)
//   node tools/verif-site.mjs <chemin du clone>            (sinon le dossier courant)
const root = process.argv[2] || process.cwd();
const mime = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.svg':'image/svg+xml', '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg', '.json':'application/json', '.woff2':'font/woff2', '.txt':'text/plain', '.xml':'application/xml', '.txt':'text/plain' };
const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  if (!path.extname(p)) p += '.html';
  const f = path.join(root, p);
  if (fs.existsSync(f)) { res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); }
  else { res.writeHead(404); res.end(fs.readFileSync(path.join(root, '404.html'))); }
});
await new Promise(r => server.listen(8099, r));
const chromiumConteneur = '/opt/pw-browsers/chromium';
const b = await chromium.launch(fs.existsSync(chromiumConteneur) ? { executablePath: chromiumConteneur } : {});
let echecs = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ECHEC') + '  ' + m); if (!c) echecs++; };

// 1. Le contenu du premier ecran ne depend PAS de JavaScript.
for (const js of [true, false]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: js });
  const p = await ctx.newPage();
  await p.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
  const vis = await p.evaluate(() => {
    const h1 = document.querySelector('h1');
    const s = getComputedStyle(h1);
    return { op: s.opacity, txt: h1.textContent.trim().slice(0, 30) };
  });
  ok(vis.op === '1', `hero visible avec JS=${js} (opacity=${vis.op})`);
  await ctx.close();
}

// 2. Reflow 320 px sur les six pages.
for (const pg of ['', 'decouvrir', 'a-propos', 'confidentialite', 'cgu', '404']) {
  const ctx = await b.newContext({ viewport: { width: 320, height: 700 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.goto('http://localhost:8099/' + pg, { waitUntil: 'networkidle' });
  const o = await p.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
  ok(o.s <= o.c + 1, `320px sans débordement : /${pg || 'accueil'} (${o.s}/${o.c})`);
  await ctx.close();
}

// 3. Menu mobile : ouverture, Échap, retour du focus.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
  await p.locator('.burger').click();
  const ouvert = await p.locator('#menu').evaluate(el => el.classList.contains('ouvert'));
  const exp = await p.locator('.burger').getAttribute('aria-expanded');
  ok(ouvert && exp === 'true', 'menu mobile ouvert, aria-expanded=true');
  const nomOuvert = await p.locator('.burger').getAttribute('aria-label');
  ok(nomOuvert === 'Fermer le menu', `le bouton annonce l'action à venir une fois ouvert (« ${nomOuvert} »)`);
  const inerte = await p.evaluate(() => document.querySelector('main').inert === true && document.querySelector('footer').inert === true);
  ok(inerte, "l'arrière-plan est inerte pendant l'ouverture");
  await p.keyboard.press('Shift+Tab');
  const surBurger = await p.evaluate(() => document.activeElement.className.includes('burger'));
  ok(surBurger, 'Maj+Tab depuis le premier lien atteint le bouton de fermeture');
  await p.locator('.menu-cta').focus();
  await p.keyboard.press('Tab');
  const surLogo = await p.evaluate(() => document.activeElement.className.includes('logo'));
  ok(surLogo, 'Tab depuis le dernier lien reboucle sur la barre');
  await p.keyboard.press('Escape');
  const ferme = await p.locator('#menu').evaluate(el => !el.classList.contains('ouvert'));
  const focus = await p.evaluate(() => document.activeElement.className.includes('burger'));
  const nomFerme = await p.locator('.burger').getAttribute('aria-label');
  ok(ferme, 'Échap ferme le menu');
  ok(focus, 'le focus revient au bouton');
  ok(nomFerme === 'Ouvrir le menu', `le bouton reprend son nom après fermeture (« ${nomFerme} »)`);
  const libere = await p.evaluate(() => !document.querySelector('main').inert && !document.querySelector('footer').inert);
  ok(libere, "l'arrière-plan est libéré après fermeture");
  await ctx.close();
}

// 3 bis. Un lien de la barre activé menu ouvert referme le panneau : entre 421
// et 760 px le bouton d'essai reste visible et navigue par ancre sur l'accueil.
{
  const ctx = await b.newContext({ viewport: { width: 430, height: 800 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
  await p.locator('.burger').click();
  await p.locator('.barre nav .cta').click();
  await p.waitForTimeout(150);
  const etat = await p.evaluate(() => ({
    ouvert: document.getElementById('menu').classList.contains('ouvert'),
    exp: document.querySelector('.burger').getAttribute('aria-expanded'),
    inerte: document.querySelector('main').inert,
    defile: document.body.style.overflow,
  }));
  ok(!etat.ouvert && etat.exp === 'false' && !etat.inerte && etat.defile === '',
     `le bouton d'essai de la barre referme le menu (ouvert=${etat.ouvert}, inert=${etat.inerte}, overflow="${etat.defile}")`);
  await ctx.close();
}

// 4. Catégories : quatre visibles, treize après ouverture.
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
  const avant = await p.locator('.cat:visible').count();
  await p.locator('.plus-cat').click();
  await p.waitForTimeout(200);
  const apres = await p.locator('.cat:visible').count();
  const exp = await p.locator('.plus-cat').getAttribute('aria-expanded');
  ok(avant === 4, `quatre catégories visibles au départ (${avant})`);
  ok(apres === 13 && exp === 'true', `treize après ouverture (${apres}), aria-expanded=${exp}`);
  await ctx.close();
}

// 5. Carrousel : compteur juste au repos, flèches utiles seulement si ça défile.
{
  // Mobile : la piste déborde, les flèches sont visibles et actives.
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.goto('http://localhost:8099/decouvrir', { waitUntil: 'networkidle' });
  const t0 = (await p.locator('.compteur').textContent()).trim();
  ok(t0 === '1 sur 3', `compteur initial « ${t0} »`);
  await p.locator('.fleche.suiv').click();
  await p.waitForTimeout(600);
  const t1 = (await p.locator('.compteur').textContent()).trim();
  ok(t1 === '2 sur 3', `une flèche avance d'une vue (${t0} -> ${t1})`);
  await p.locator('.piste').evaluate(el => el.scrollLeft = el.scrollWidth);
  await p.waitForTimeout(400);
  const t2 = (await p.locator('.compteur').textContent()).trim();
  const finDesactivee = await p.locator('.fleche.suiv').isDisabled();
  ok(t2 === '3 sur 3', `fin de piste annoncée (${t2})`);
  ok(finDesactivee, 'la flèche suivante est désactivée en fin de piste');
  await ctx.close();
}
{
  // Grand écran : les trois vues tiennent, plus de commandes ni de compteur.
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.goto('http://localhost:8099/decouvrir', { waitUntil: 'networkidle' });
  const vues = await p.locator('.vue:visible').count();
  const cmd = await p.locator('.fleches').isVisible();
  const cpt = await p.locator('.compteur').isVisible();
  ok(vues === 3 && !cmd && !cpt, `piste fixe en 1280 : ${vues} vues, flèches=${cmd}, compteur=${cpt}`);
  await ctx.close();
}

// 5 bis. La barre d'en-tete tient a toutes les largeurs, sans jamais ecraser
// l'embleme qui sert de retour a l'accueil.
{
  const largeurs = [];
  for (let w = 320; w <= 1440; w += 20) largeurs.push(w);
  const mauvaises = [];
  const ctx = await b.newContext({ viewport: { width: 320, height: 800 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
  for (const w of largeurs) {
    await p.setViewportSize({ width: w, height: 800 });
    const o = await p.evaluate(() => ({
      s: document.documentElement.scrollWidth,
      c: document.documentElement.clientWidth,
      logo: Math.round(document.querySelector('.logo').getBoundingClientRect().width),
    }));
    if (o.s > o.c + 1 || o.logo < 24) mauvaises.push(`${w}px(${o.s}/${o.c},logo=${o.logo})`);
  }
  ok(mauvaises.length === 0, `en-tête stable de 320 à 1440 px${mauvaises.length ? ' : ' + mauvaises.join(' ') : ''}`);
  await ctx.close();
}

// 5 ter. Le titre d'accueil : jamais plus de trois lignes sur grand ecran,
// jamais de ligne orpheline. Calibre sur Newsreader, pas sur la police de repli.
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  const mauvaises = [];
  for (const w of [1440, 1280, 1100, 960, 900, 768, 560, 390, 320]) {
    await p.setViewportSize({ width: w, height: 900 });
    await p.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    const blocs = await p.evaluate(() => [document.querySelector('.hero-grille h1')].map(n => {
      const r = document.createRange(); r.selectNodeContents(n);
      return [...r.getClientRects()].map(x => Math.round(x.width));
    }));
    const total = blocs.reduce((n, b) => n + b.length, 0);
    if (w >= 960 && total > 3) mauvaises.push(`${w}px:${total} lignes`);
    for (const bloc of blocs) {
      const max = Math.max(...bloc);
      if (bloc.length > 1 && Math.min(...bloc) < max * 0.35) mauvaises.push(`${w}px:orpheline ${JSON.stringify(bloc)}`);
    }
  }
  ok(mauvaises.length === 0, `titre d'accueil bien coupé de 320 à 1440 px${mauvaises.length ? ' : ' + mauvaises.join(' ') : ''}`);
  await ctx.close();
}

// 5 quater. Les polices viennent du site, pas de Google.
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  const externes = [];
  p.on('request', r => { const u = r.url(); if (!u.startsWith('http://localhost:8099') && !u.includes('plausible.io')) externes.push(u); });
  await p.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  const chargee = await p.evaluate(() => document.fonts.check('500 58px Newsreader'));
  ok(chargee, 'Newsreader chargée depuis le site');
  ok(externes.length === 0, `aucune requête tierce hors Plausible${externes.length ? ' : ' + externes.join(' ') : ''}`);
  await ctx.close();
}

// 5 quinquies. La fiche exemple se deplie, au clic et au clavier.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
  const d = p.locator('.exemple details');
  ok(await d.count() === 1 && !(await d.evaluate(el => el.open)), 'fiche exemple : repli fermé au départ');
  await p.locator('.exemple summary').click();
  ok(await d.evaluate(el => el.open), 'fiche exemple : s\'ouvre au clic');
  ok(await p.locator('.exemple details .src a').isVisible(), 'la source est dans le repli ouvert');
  await p.locator('.exemple summary').focus();
  await p.keyboard.press('Enter');
  ok(!(await d.evaluate(el => el.open)), 'fiche exemple : se referme au clavier (Entrée)');
  await ctx.close();
}

// 5 sexies. Captures en grand : fenetre native, Echap, retour du focus.
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.goto('http://localhost:8099/decouvrir', { waitUntil: 'networkidle' });
  const nb = await p.locator('.agrandir').count();
  ok(nb === 7, `sept captures consultables en grand (${nb})`);
  const premier = p.locator('.agrandir').first();
  await premier.click();
  const ouvert = await p.locator('#loupe').evaluate(el => el.open);
  const focusFermer = await p.evaluate(() => document.activeElement.classList.contains('loupe-fermer'));
  const src = await p.locator('#loupe img').getAttribute('src');
  ok(ouvert && src.includes('ios-accueil'), 'la loupe s\'ouvre sur la bonne image');
  ok(focusFermer, 'le focus arrive sur le bouton Fermer');
  await p.keyboard.press('Escape');
  const ferme = await p.locator('#loupe').evaluate(el => !el.open);
  const retour = await p.evaluate(() => document.activeElement.classList.contains('agrandir'));
  ok(ferme && retour, 'Échap ferme la loupe et rend le focus au déclencheur');
  await ctx.close();
}

// 5 septies. Sans JavaScript : tout le contenu, la navigation et les boutiques,
// et aucune commande inerte a l'ecran.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  const p = await ctx.newPage();
  await p.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
  const e = await p.evaluate(() => {
    const vis = sel => [...document.querySelectorAll(sel)].filter(x => x.getClientRects().length > 0).length;
    return {
      cats: vis('.cat'), plus: vis('.plus-cat'), burger: vis('.burger'), bascule: vis('.bascule'),
      nav: vis('.barre nav .lien-nav'), stores: vis('footer a[href*="apps.apple.com"], footer a[href*="play.google.com"]'),
      s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth,
    };
  });
  ok(e.cats === 13, `sans JS : treize catégories visibles (${e.cats})`);
  ok(e.plus === 0 && e.burger === 0 && e.bascule === 0, `sans JS : aucune commande inerte affichée (bouton=${e.plus}, burger=${e.burger}, bascule=${e.bascule})`);
  ok(e.nav === 5 && e.stores === 2, `sans JS : navigation (${e.nav} liens) et boutiques (${e.stores}) accessibles`);
  ok(e.s <= e.c + 1, `sans JS : pas de débordement à 390 px (${e.s}/${e.c})`);
  await p.goto('http://localhost:8099/decouvrir', { waitUntil: 'networkidle' });
  const liens = await p.evaluate(() => [...document.querySelectorAll('.agrandir')].every(a => a.getAttribute('href').endsWith('.webp')));
  const cmd = await p.evaluate(() => [...document.querySelectorAll('.fleches, .compteur')].filter(x => x.getClientRects().length > 0).length);
  ok(liens && cmd === 0, 'sans JS : les captures mènent à l\'image, flèches et compteur absents');
  await ctx.close();
}

// 5 nonies. Sur grand ecran le hero occupe la fenetre sans la remplir : une
// lisiere de la section suivante reste visible, mais jamais une large bande vide.
{
  const mauvaises = [];
  for (const [w, h] of [[2000, 1060], [1512, 860], [1440, 900], [1280, 800], [1024, 1366]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    await p.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    const o = await p.evaluate(() => ({
      bas: Math.round(document.querySelector('.hero').getBoundingClientRect().bottom),
      deborde: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }));
    const reste = h - o.bas;
    // Une lisiere est voulue (affordance de defilement), une bande vide non.
    if (reste < 0 || reste > 200 && h < 1200 || o.deborde) mauvaises.push(`${w}x${h}: ${reste} px sous le hero`);
    await ctx.close();
  }
  ok(mauvaises.length === 0, `hero cadré sur grand écran${mauvaises.length ? ' : ' + mauvaises.join(' ') : ''}`);
}

// 5 octies. L'accueil est plus court, sans perte des essentiels.
{
  const ctx = await b.newContext({ viewport: { width: 360, height: 800 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
  const h = await p.evaluate(() => document.documentElement.scrollHeight);
  // Seuil de garde, pas de mesure au pixel : l'accueil doit rester nettement
  // sous les 9 597 px de l'audit, sans interdire une precision qui allonge.
  ok(h < 8400, `accueil à 360 px : ${h} px de haut (référence de l'audit : 9 597)`);
  for (const id of ['exemple', 'categories', 'methode', 'tarifs', 'questions', 'obtenir']) {
    ok(await p.locator('#' + id).count() === 1, `ancre #${id} présente`);
  }
  await ctx.close();
}

// 5 decies. Aucun cookie : la politique le dit, le navigateur le confirme.
// Et la barre porte le lien À propos sur les six pages.
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  for (const pg of ['', 'decouvrir', 'a-propos', 'confidentialite', 'cgu', '404']) {
    await p.goto('http://localhost:8099/' + pg, { waitUntil: 'networkidle' });
    await p.locator('.bascule').click();
    await p.locator('details').first().click().catch(() => {});
  }
  const cookies = await ctx.cookies();
  ok(cookies.length === 0, `aucun cookie posé après visite des six pages et bascule du thème (${cookies.length})`);
  let liens = 0;
  for (const pg of ['', 'decouvrir', 'a-propos', 'confidentialite', 'cgu', '404']) {
    await p.goto('http://localhost:8099/' + pg, { waitUntil: 'networkidle' });
    liens += await p.locator('.barre nav .lien-nav[href="/a-propos"]').count();
  }
  ok(liens === 6, `lien À propos dans la barre des six pages (${liens})`);
  await p.goto('http://localhost:8099/a-propos', { waitUntil: 'networkidle' });
  const courant = await p.locator('.barre nav .lien-nav[href="/a-propos"]').getAttribute('aria-current');
  ok(courant === 'page', 'À propos marqué page courante dans la barre');
  await ctx.close();
}

// 5 undecies. Le mode sombre est le creme inverse : meme teinte chaude, pas un
// bleu-noir. Mesure sur la teinte du fond.
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
  await p.locator('.bascule').click();
  const fond = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const m = fond.match(/\d+/g).map(Number);
  // Chaud = rouge >= vert >= bleu. Le bleu-noir d'avant avait bleu > rouge.
  ok(m[0] >= m[1] && m[1] >= m[2], `fond sombre chaud (${fond})`);
  const meta = await p.locator('meta[name="theme-color"]').getAttribute('content');
  ok(meta.toUpperCase() === '#16130E', `theme-color sombre aligné (${meta})`);
  await ctx.close();
}

// 5 duodecies. Un seul bord gauche par page : logo de la barre, premier titre,
// fiche exemple, premiere vue de la galerie, texte des pages longues, 404 et
// pied de page partent du meme pixel, et le bord droit de la barre est celui
// de la capture du hero. Mesure a trois largeurs, sur les six pages.
{
  const cibles = ['.logo img', 'main h1', 'main h2', '.exemple', '.vue', '.page p', '.fil', '.liens', '.portrait', '.err h1', '.fleches', 'footer .pied'];
  for (const w of [1440, 1024, 390]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    const ecarts = [];
    for (const pg of ['', 'decouvrir', 'a-propos', 'confidentialite', 'cgu', '404']) {
      await p.goto(`http://localhost:8099/${pg}`, { waitUntil: 'networkidle' });
      const r = await p.evaluate((cibles) => {
        const vw = document.documentElement.clientWidth;
        const gauche = Math.round(document.querySelector('.logo img').getBoundingClientRect().left);
        const mauvais = [];
        for (const s of cibles) {
          const el = [...document.querySelectorAll(s)].find(e => e.getBoundingClientRect().width > 0);
          if (!el) continue;
          const l = Math.round(el.getBoundingClientRect().left);
          if (l !== gauche) mauvais.push(`${s}=${l}`);
        }
        const nav = document.querySelector('.barre nav').getBoundingClientRect().right;
        if (Math.abs(nav - (vw - gauche)) > 1) mauvais.push(`barre droite=${Math.round(nav)} attendu=${vw - gauche}`);
        const tel = document.querySelector('.hero .tel');
        const droit = tel && vw > 900 ? Math.round(tel.getBoundingClientRect().right) : null;
        if (droit !== null && Math.abs(droit - nav) > 1) mauvais.push(`hero .tel droite=${droit} barre=${Math.round(nav)}`);
        return { gauche, mauvais };
      }, cibles);
      if (r.mauvais.length) ecarts.push(`${pg || 'accueil'} (bord ${r.gauche}) : ${r.mauvais.join(', ')}`);
    }
    ok(ecarts.length === 0, `un seul bord gauche a ${w} px` + (ecarts.length ? ' : ' + ecarts.join(' | ') : ''));
    await ctx.close();
  }
}

// 6. Fichiers SEO et 404.
{
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  for (const [u, motif] of [['/robots.txt', 'Sitemap'], ['/sitemap.xml', 'grainedeculture.ch/decouvrir'], ['/inexistant', 'Page introuvable']]) {
    const r = await p.goto('http://localhost:8099' + u);
    const t = await r.text();
    ok(t.includes(motif), `${u} sert le bon contenu`);
  }
  await ctx.close();
}

// 7. Aucune trace des contradictions corrigées.
{
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  const interdits = [
    ['/', 'jamais approximatif'], ['/', 'Une source, ou rien'], ['/', '0 donnée personnelle'],
    ['/', 'parfaitement avéré'], ['/decouvrir', 'après une réinstallation'],
    ['/cgu', "Chaque fiche s'appuie sur une source citée"],
    // Passe editoriale : les formules retirees ne doivent pas revenir.
    ['/', 'nourrir votre curiosité'], ['/', 'jamais un quatrième'], ['/', 'Aucune pression'],
    ['/', "on n'en reparle plus"], ['/', "c'est prévu"], ['/', 'déjà tirée'],
    ['/', 'décidez d’acheter'], ['/', 'le registre vous parle'], ['/', 'Rien de plus long'],
    ['/a-propos', 'envie simple'], ['/a-propos', 'pépite'], ['/a-propos', 'sans effort'],
    ['/a-propos', 'guichets de contact'], ['/a-propos', 'face caméra'],
    ['/decouvrir', 'pour ceux qui veulent creuser'], ['/decouvrir', 'à portée de main'],
    // Affirmations trop absolues, retirees le 31 aout : les sauvegardes systeme
    // echappent a l'application, et une fiche longue existe.
    ['/confidentialite', 'ne quittent jamais votre téléphone'],
    // Audit du 1er septembre : boutique suisse, portee des achats, promesse exacte.
    ['/', 'apps.apple.com/fr/'], ['/decouvrir', 'apps.apple.com/fr/'],
    ['/a-propos', 'apps.apple.com/fr/'], ['/confidentialite', 'apps.apple.com/fr/'],
    ['/cgu', 'apps.apple.com/fr/'], ['/404', 'apps.apple.com/fr/'],
    ['/', 'liés au même compte'],
    // Audit du 3 septembre : lecture plutot que memorisation, plus de jargon,
    // telechargement dit avant le clic.
    ['/', 'Une minute pour la retenir'], ['/', 'Essayer gratuitement'], ['/', 'repli «'],
    // Mesure du 4 septembre sur les treize corpus : Wikipedia fournit 72 pour
    // cent des liens. Le site ne doit plus annoncer l'exception comme la regle.
    ['/', 'Dictionnaire, revue, institution ou musée'],
    ['/', 'dictionnaires de référence, travaux scientifiques'],
    ['/', 'Quelques dizaines de fiches'],
    ['/', 'métadonnées'], ['/', 'révéler le vrai'], ['/', 'sens réels'], ['/', 'Comment ça marche'],
    ['/decouvrir', 'métadonnées'], ['/decouvrir', 'dans le repli'], ['/decouvrir', 'À gauche le repli'],
    ['/decouvrir', 'Essayer gratuitement'], ['/a-propos', 'Essayer gratuitement'],
    ['/confidentialite', 'Essayer gratuitement'], ['/cgu', 'Essayer gratuitement'], ['/404', 'Essayer gratuitement'],
    ['/confidentialite', 'ne collecte, ne transmet'],
    ['/confidentialite', "Elles disparaissent lorsque vous"],
    ['/', "Aucune n'est plus longue"], ['/', 'identique sur Android'],
    ['/decouvrir', 'identique sur Android'],
    // 16 septembre : la 404 ne rassure plus sur « le reste du site ».
    ['/404', 'Le reste du site est intact'],
  ];
  for (const [u, mot] of interdits) {
    const r = await p.goto('http://localhost:8099' + u);
    const t = await r.text();
    ok(!t.includes(mot), `« ${mot} » retiré de ${u}`);
  }
  // Le Monde Parallèle doit être annoncé comme fiction.
  const r = await p.goto('http://localhost:8099/');
  const t = await r.text();
  ok(/Monde Parallèle[\s\S]{0,200}fiction/.test(t), 'Le Monde Parallèle annoncé comme fiction');
  ok(t.includes('6,00&nbsp;CHF'), "prix de l'offre groupée affiché");
  ok(!/<p class="sous">Chaque fiche va/.test(t), 'hero sans sous-titre : « fiche » n\'est pas encore défini à ce stade');
  ok(!t.includes('class="filet'), 'plus de filet décoratif répété');
  ok(!t.includes('bande claire'), "plus d'alternance de fond entre les sections");
  ok(t.includes('Comment les sources sont indiquées'), 'nouveau titre de la méthode en place');
  const ra = await p.goto('http://localhost:8099/a-propos');
  const ta = await ra.text();
  ok(ta.includes('Je suis Arnaud Clavien'), 'page À propos à la première personne');
  const rc = await p.goto('http://localhost:8099/confidentialite');
  const tc = await rc.text();
  ok(tc.includes('restent gérées par la plateforme concernée'), 'sauvegardes système annoncées comme telles');
  ok(tc.includes('ne reçoit, ne conserve et ne revend'), 'confidentialité centrée sur ce que reçoit le développeur');
  ok(t.includes("Un achat ne se transfère pas d'une boutique à l'autre"), 'portée des achats précisée');
  ok(t.includes('Application pour iPhone et Android') && t.includes('Télécharger gratuitement'), 'nature du produit et téléchargement dits avant le clic');
  ok(t.replace(/&nbsp;/g, ' ').includes('Une découverte culturelle par jour, à lire en une minute.'), 'titre sur la lecture');
  ok(tc.includes('Courriels adressés au développeur'), 'courriels au support décrits dans la politique');
  ok((t.match(/Wikipédia/g) || []).length >= 2, 'Wikipédia nommée dans la méthode et dans la FAQ');
  ok(t.includes('Vingt-trois fiches nomment leur source'), 'nombre exact de fiches sans lien');
  ok(t.includes("Nous n'avons pas trouvé de source en ligne vérifiable") && t.includes('Récit original imaginé pour Graine de Culture'),
     "libellés de l'application cités verbatim");
  ok(t.includes('stylitês') && t.includes('Trévoux'), 'repli de la fiche exemple rempli avec le corpus réel');
  await ctx.close();
}

// 8. Coherences de fichiers : boutique suisse partout, blocs globaux identiques,
// description courte, Plausible sur la 404.
{
  const fs = await import('fs');
  const pages = ['index.html','decouvrir.html','a-propos.html','confidentialite.html','cgu.html','404.html'];
  const contenus = Object.fromEntries(pages.map(f => [f, fs.readFileSync(root + '/' + f, 'utf8')]));
  const js = fs.readFileSync(root + '/site.js', 'utf8');
  const cible = 'apps.apple.com/ch/app/graine-de-culture/id6761060784?l=fr-FR';
  const totalCh = pages.reduce((n, f) => n + contenus[f].split(cible).length - 1, 0) + (js.split(cible).length - 1);
  const totalFr = pages.reduce((n, f) => n + contenus[f].split('apps.apple.com/fr').length - 1, 0) + (js.split('apps.apple.com/fr').length - 1);
  ok(totalCh === 13 && totalFr === 0, `boutique suisse sur les 13 liens Apple (ch=${totalCh}, fr=${totalFr})`);
  const bloc = (t, motif) => { const m = t.match(motif); return m ? m[0].replace(/ aria-current="page"/g, '') : null; };
  const pieds = pages.map(f => bloc(contenus[f], /<footer>[\s\S]*?<\/footer>/));
  const menus = pages.map(f => bloc(contenus[f], /<div class="menu"[\s\S]*?<\/div>/));
  ok(pieds.every(x => x && x === pieds[0]), 'pied de page identique sur les six pages');
  ok(menus.every(x => x && x === menus[0]), 'menu identique sur les six pages, état courant à part');
  const desc = contenus['index.html'].match(/<meta name="description" content="([^"]+)"/)[1];
  ok(desc.length <= 160, `description de l'accueil sous 160 caractères (${desc.length})`);
  ok(contenus['404.html'].includes('plausible.io') && contenus['404.html'].includes('plausible.init()'), 'la 404 charge et initialise Plausible');
  const initIndex = contenus['index.html'].match(/<script>\s*window\.plausible[\s\S]*?<\/script>/)[0];
  const init404 = (contenus['404.html'].match(/<script>\s*window\.plausible[\s\S]*?<\/script>/) || [null])[0];
  ok(init404 === initIndex, "le bloc d'initialisation Plausible de la 404 est identique à celui de l'accueil");
  ok(contenus['a-propos.html'].includes('content="summary"'), 'carte X de la page À propos au format simple');
}

// 9. Chiffres annonces : une seule valeur par fait, sur les six pages et dans les
// donnees structurees. Seul endroit de la suite a modifier quand un chiffre bouge
// (montee de prix du cliquet, vague de contenu ou de categories).
{
  const fs = await import('fs');
  const ATTENDU = { unite: '1,50', bundle: '6,00', fiches: '5 052', categories: '13' };
  const pages = ['index.html','decouvrir.html','a-propos.html','confidentialite.html','cgu.html','404.html'];
  const norm = s => s.replace(/&nbsp;|&#160;|&#xa0;/gi, ' ').replace(/[  ]/g, ' ');
  const tout = pages.map(f => norm(fs.readFileSync(root + '/' + f, 'utf8'))).join('\n');
  const prix = [...tout.matchAll(/(\d+[,.]\d{2}) ?CHF/g)].map(m => m[1]);
  const autres = prix.filter(p => p !== ATTENDU.unite && p !== ATTENDU.bundle);
  ok(prix.includes(ATTENDU.unite) && prix.includes(ATTENDU.bundle) && autres.length === 0,
     `prix en CHF : seulement ${ATTENDU.unite} et ${ATTENDU.bundle} (${prix.join(' ; ')})`);
  const index = norm(fs.readFileSync(root + '/index.html', 'utf8'));
  const ld = JSON.parse(index.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const ldPrix = (ld.offers || []).map(o => o.price);
  const ldAttendu = ['0', ATTENDU.unite.replace(',', '.'), ATTENDU.bundle.replace(',', '.')];
  ok(JSON.stringify(ldPrix) === JSON.stringify(ldAttendu), `prix des donnees structurees (${ldPrix.join(' ; ')})`);
  const fiches = [...tout.matchAll(/\b(\d{1,3}(?: \d{3})+|\d{4,}) fiches/g)].map(m => m[1]);
  ok(fiches.length > 0 && fiches.every(n => n === ATTENDU.fiches), `nombre de fiches : ${ATTENDU.fiches} partout (${fiches.join(' ; ')})`);
  const cats = [...tout.matchAll(/\b(\d+) catégories/g)].map(m => m[1]);
  const cartes = (index.match(/class="cat[ "]/g) || []).length;
  ok(cats.length > 0 && cats.every(n => n === ATTENDU.categories) && String(cartes) === ATTENDU.categories,
     `nombre de catégories : ${ATTENDU.categories} partout (${cats.join(' ; ')}, ${cartes} cartes)`);
}
await b.close();
server.close();
console.log(echecs === 0 ? '\nTOUT PASSE' : `\n${echecs} ECHEC(S)`);
process.exit(echecs === 0 ? 0 : 1);
