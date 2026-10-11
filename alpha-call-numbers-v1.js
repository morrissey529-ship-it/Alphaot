/* Alpha OT — display-only call numbers.
   Source: Alpha Crew call-number list supplied October 11, 2026.
   Does not alter personnel records, OT events, permissions or rotation. */
(function () {
  'use strict';

  const callNumbers = Object.freeze({
    'Morrissey, C': 117,
    'Boggetto': 16,
    'Sprys, C': 40,
    'Kent, C': 96,
    'Slattery': 222,
    'Stoops': 175,
    'Pantoja-Toledo': 11,
    'Kimak': 7,
    'Akre, A': 48,
    'Alvarado, D': 19,
    'Esparza, S': 81,
    'Juarez': 118,
    'Marchetti': 185,
    'Foley': 226,
    'Camacho': 78,
    'Ruiz-Garcia': 76,
    'Engelman': 54,
    'Stockman, R': 122,
    'Leadingham': 211,
    'Pettyjohn': 131,
    'Luttrell': 50,
    'Urbano': 88,
    'Reigh': 181,
    'Haberkorn': 62
  });

  const style = document.createElement('style');
  style.id = 'alphaCallNumberStyles';
  style.textContent = `
    #alphaListPanel .card .main{
      position:relative;
      padding-bottom:43px;
    }
    #alphaListPanel .card .alpha-call-number{
      position:absolute;
      bottom:10px;
      right:13px;
      display:inline-flex;
      align-items:center;
      gap:6px;
      max-width:calc(100% - 28px);
      padding:5px 9px;
      border:1px solid var(--line);
      background:var(--raised,#f3f6fa);
      border-radius:6px;
      color:var(--muted);
      white-space:nowrap;
      font-size:11px;
      line-height:1.1;
      font-weight:650;
      letter-spacing:.01em;
      font-variant-numeric:tabular-nums;
    }
    #alphaListPanel .card .alpha-call-number strong{
      color:var(--text);
      font-size:13px;
      font-weight:800;
      letter-spacing:0;
    }
  `;
  document.head.appendChild(style);

  function displayCallNumbers() {
    if (!Array.isArray(officers)) return;
    for (const officer of officers) {
      const num = callNumbers[officer.name];
      if (!Number.isInteger(num)) continue;
      const card = document.getElementById('c-' + officer.id);
      const main = card && card.querySelector('.main');
      if (!main) continue;
      let badge = main.querySelector('.alpha-call-number');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'alpha-call-number';
        badge.setAttribute('aria-label', 'Call number ' + num);
        const label = document.createElement('span');
        label.textContent = 'Call #';
        const value = document.createElement('strong');
        value.textContent = String(num);
        badge.append(label, value);
        main.appendChild(badge);
      }
    }
  }

  const previousRender = render;
  render = function () {
    const result = previousRender.apply(this, arguments);
    displayCallNumbers();
    return result;
  };
  displayCallNumbers();
})();