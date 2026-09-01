document.documentElement.classList.add('js');

document.addEventListener('DOMContentLoaded', function(){

  var doux = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Bascule clair / sombre. Le choix explicite est mémorisé, sinon le thème
  // initial reste celui posé en tête de page (clair par défaut).
  var bascule = document.querySelector('.bascule');
  if(bascule){
    // Le libellé annonce l'action à venir, pas l'état courant.
    var libelle = function(){
      var clair = document.documentElement.getAttribute('data-theme') === 'light';
      bascule.setAttribute('aria-label', clair ? 'Passer au thème sombre' : 'Passer au thème clair');
    };
    libelle();
    bascule.addEventListener('click', function(){
      var racine = document.documentElement;
      var suivant = racine.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      racine.setAttribute('data-theme', suivant);
      var meta = document.querySelector('meta[name="theme-color"]');
      if(meta){ meta.setAttribute('content', suivant === 'light' ? '#F0E9D8' : '#0D0F13'); }
      try{ localStorage.setItem('gdc-theme', suivant); }catch(e){}
      libelle();
    });
  }

  // Menu mobile. Le panneau est piloté au clavier : Échap ferme, le focus
  // revient au bouton, et la tabulation reste dans le panneau tant qu'il est
  // ouvert. Sans JavaScript le bouton reste masqué et les liens du pied de
  // page suffisent à atteindre toutes les destinations.
  var burger = document.querySelector('.burger');
  var menu = document.getElementById('menu');
  if(burger && menu){
    // Pendant l'ouverture, le reste de la page est rendu inerte : la
    // tabulation et les lecteurs d'ecran restent dans la barre et le panneau,
    // bouton de fermeture compris.
    var inertes = function(oui){
      ['main', 'footer'].forEach(function(sel){
        var el = document.querySelector(sel);
        if(el){ el.inert = oui; }
      });
    };
    var fermer = function(rendreFocus){
      menu.classList.remove('ouvert');
      burger.setAttribute('aria-expanded', 'false');
      burger.setAttribute('aria-label', 'Ouvrir le menu');
      document.body.style.overflow = '';
      inertes(false);
      if(rendreFocus){ burger.focus(); }
    };
    var ouvrir = function(){
      menu.classList.add('ouvert');
      burger.setAttribute('aria-expanded', 'true');
      burger.setAttribute('aria-label', 'Fermer le menu');
      document.body.style.overflow = 'hidden';
      inertes(true);
      var premier = menu.querySelector('a');
      if(premier){ premier.focus(); }
    };
    burger.addEventListener('click', function(){
      if(burger.getAttribute('aria-expanded') === 'true'){ fermer(true); } else { ouvrir(); }
    });
    menu.addEventListener('click', function(e){
      if(e.target.closest('a')){ fermer(false); }
    });
    // Les liens de la barre restent cliquables menu ouvert (logo, bouton
    // d'essai entre 421 et 760 px) : eux aussi referment le panneau, sinon
    // la page resterait inerte et bloquee derriere le menu.
    var barreIn = document.querySelector('.barre-in');
    if(barreIn){
      barreIn.addEventListener('click', function(e){
        if(e.target.closest('a') && burger.getAttribute('aria-expanded') === 'true'){ fermer(false); }
      });
    }
    document.addEventListener('keydown', function(e){
      if(burger.getAttribute('aria-expanded') !== 'true') return;
      if(e.key === 'Escape'){ fermer(true); return; }
      if(e.key !== 'Tab') return;
      // La boucle couvre la barre ET le panneau : le bouton de fermeture et la
      // bascule de theme restent atteignables au clavier.
      var focusables = Array.prototype.filter.call(
        document.querySelectorAll('.barre-in a, .barre-in button, #menu a'),
        function(el){ return el.offsetWidth > 0; }
      );
      if(!focusables.length) return;
      var premier = focusables[0];
      var dernier = focusables[focusables.length - 1];
      if(e.shiftKey && document.activeElement === premier){ e.preventDefault(); dernier.focus(); }
      else if(!e.shiftKey && document.activeElement === dernier){ e.preventDefault(); premier.focus(); }
    });
    window.addEventListener('resize', function(){
      if(window.innerWidth > 760 && burger.getAttribute('aria-expanded') === 'true'){ fermer(false); }
    });
  }

  // Apparitions au défilement. Le marquage est posé PAR le script, et
  // seulement sur ce qui se trouve sous la ligne de flottaison : rien de
  // visible au chargement ne dépend donc de JavaScript pour s'afficher.
  var cibles = document.querySelectorAll('.anim, .zoom');
  if(!doux && ('IntersectionObserver' in window)){
    var obs = new IntersectionObserver(function(entrees){
      entrees.forEach(function(e){
        if(e.isIntersecting){
          e.target.classList.add('vu');
          obs.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    cibles.forEach(function(el){
      if(el.getBoundingClientRect().top > window.innerHeight){
        el.setAttribute('data-anim', '');
        obs.observe(el);
      }
    });
  }

  // Carrousels : position courante visible et annoncée aux lecteurs d'écran.
  document.querySelectorAll('.galerie').forEach(function(galerie){
    var piste = galerie.querySelector('.piste');
    var prec = galerie.querySelector('.fleche.prec');
    var suiv = galerie.querySelector('.fleche.suiv');
    var compteur = galerie.querySelector('.compteur');
    if(!piste) return;
    var vues = piste.querySelectorAll('.vue');

    function pas(){
      var vue = piste.querySelector('.vue');
      return vue ? vue.offsetWidth + 22 : 220;
    }
    function courante(){
      // Position lue depuis le défilement plutôt que depuis le centrage : au
      // repos la première vue est annoncée, même quand la piste est centrée.
      var max = piste.scrollWidth - piste.clientWidth;
      if(max <= 2) return 1;
      var ratio = piste.scrollLeft / max;
      var index = Math.round(ratio * (vues.length - 1)) + 1;
      return Math.min(Math.max(index, 1), vues.length);
    }
    function etat(){
      var max = piste.scrollWidth - piste.clientWidth - 2;
      // Quand la piste tient entièrement à l'écran, ni flèches ni compteur :
      // il n'y a rien à faire défiler et rien à annoncer.
      galerie.classList.toggle('fixe', max <= 2);
      if(prec) prec.disabled = piste.scrollLeft <= 2;
      if(suiv) suiv.disabled = piste.scrollLeft >= max;
      if(compteur && vues.length){ compteur.textContent = courante() + ' sur ' + vues.length; }
    }
    if(prec) prec.addEventListener('click', function(){
      piste.scrollBy({ left: -pas(), behavior: doux ? 'auto' : 'smooth' });
    });
    if(suiv) suiv.addEventListener('click', function(){
      piste.scrollBy({ left: pas(), behavior: doux ? 'auto' : 'smooth' });
    });
    piste.addEventListener('scroll', etat, { passive: true });
    window.addEventListener('resize', etat);
    etat();
  });

  // Catégories : quatre visibles, les neuf autres à la demande.
  var plusCat = document.querySelector('.plus-cat');
  var liste = document.getElementById('liste-cat');
  if(plusCat && liste){
    plusCat.addEventListener('click', function(){
      var ouvert = liste.classList.toggle('tout');
      plusCat.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
      plusCat.querySelector('span').textContent = ouvert ? 'Masquer les neuf autres' : 'Voir les treize catégories';
      if(ouvert){
        var premier = liste.querySelector('.cat-cache b');
        if(premier){ premier.setAttribute('tabindex', '-1'); premier.focus(); }
      }
    });
  }

  // Bouton principal adapté à la plateforme du visiteur. Les deux boutiques
  // restent atteignables dans la section de téléchargement, quoi qu'il arrive.
  var principal = document.querySelector('[data-boutique]');
  if(principal){
    var ua = navigator.userAgent || '';
    var android = /Android/i.test(ua);
    var ios = /iPhone|iPad|iPod/i.test(ua);
    if(android){
      principal.setAttribute('href', 'https://play.google.com/store/apps/details?id=com.arnaudclavien.grainedeculture');
      principal.setAttribute('data-plausible-event-name', 'hero-play');
    } else if(ios){
      principal.setAttribute('href', 'https://apps.apple.com/ch/app/graine-de-culture/id6761060784?l=fr-FR');
      principal.setAttribute('data-plausible-event-name', 'hero-appstore');
    }
  }

});
