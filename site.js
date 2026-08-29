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

  var cibles = document.querySelectorAll('.anim, .zoom');
  if(doux || !('IntersectionObserver' in window)){
    cibles.forEach(function(el){ el.classList.add('vu'); });
  } else {
    var obs = new IntersectionObserver(function(entrees){
      entrees.forEach(function(e){
        if(e.isIntersecting){
          e.target.classList.add('vu');
          obs.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
    cibles.forEach(function(el){ obs.observe(el); });
  }

  document.querySelectorAll('.galerie').forEach(function(galerie){
    var piste = galerie.querySelector('.piste');
    var prec = galerie.querySelector('.fleche.prec');
    var suiv = galerie.querySelector('.fleche.suiv');
    if(!piste || !prec || !suiv) return;

    function pas(){
      var vue = piste.querySelector('.vue');
      return vue ? vue.offsetWidth + 22 : 220;
    }
    function etat(){
      var max = piste.scrollWidth - piste.clientWidth - 2;
      prec.disabled = piste.scrollLeft <= 2;
      suiv.disabled = piste.scrollLeft >= max;
      prec.parentNode.style.visibility = max <= 2 ? 'hidden' : 'visible';
    }
    prec.addEventListener('click', function(){
      piste.scrollBy({ left: -pas(), behavior: doux ? 'auto' : 'smooth' });
    });
    suiv.addEventListener('click', function(){
      piste.scrollBy({ left: pas(), behavior: doux ? 'auto' : 'smooth' });
    });
    piste.addEventListener('scroll', etat, { passive: true });
    window.addEventListener('resize', etat);
    etat();
  });

});
