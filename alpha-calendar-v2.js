/* Calendar-only Tactical schedule. No database calls or OT mutations. */
(function () {
  'use strict';
  const app = document.querySelector('.app');
  const header = app && app.querySelector('header');
  if (!app || !header || !document.getElementById('list') ||
      typeof alphaWorks !== 'function' || document.getElementById('alphaCalendarPanel')) return;

  // Transcribed from the supplied Tactical schedule, Rev-2 (10/1/2026).
  // Only names matched to the current Alpha officer roster are included.
  // These are calendar annotations, not ot_events or attendance records.
  const tactical = Object.freeze({
    '2026-10-05': Object.freeze(['Stockman, R', 'Marchetti', 'Esparza, S', 'Morrissey, C', 'Pantoja-Toledo']),
    '2026-10-14': Object.freeze(['Leadingham', 'Luttrell', 'Kent, C', 'Boggetto', 'Engelman', 'Reigh']),
    '2026-10-19': Object.freeze(['Akre, A', 'Pettyjohn']),
    '2026-10-28': Object.freeze(['Alvarado, D', 'Camacho', 'Urbano', 'Sprys, C', 'Foley', 'Slattery', 'Juarez'])
  });
  const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const styles = document.createElement('style');
  styles.id = 'alphaCalendarStyles';
  styles.textContent = `
    .alpha-tabs{display:flex;gap:6px;margin-top:14px;padding:4px;background:var(--bg);border:1px solid var(--line);border-radius:10px}
    .alpha-tabs [role="tab"]{flex:1;min-height:44px;padding:10px 8px;background:transparent;color:var(--muted);font-size:14px;border-radius:7px}
    .alpha-tabs [role="tab"][aria-selected="true"]{background:var(--primary,#315f8e);color:#fff}
    .alpha-panel[hidden]{display:none!important}
    .alpha-panel:focus-visible{outline:3px solid #a0d4ff;outline-offset:3px}
    .alpha-calendar{margin-top:20px;padding:16px;background:var(--surface);border:1px solid var(--line);border-radius:12px}
    .alpha-calendar-kicker{margin:0 0 12px;color:var(--muted);font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
    .alpha-calendar-nav{display:grid;grid-template-columns:44px minmax(0,1fr) 44px;gap:8px;align-items:center}
    .alpha-calendar-nav button{min-width:44px;min-height:44px;padding:6px;font-size:24px;line-height:1}
    .alpha-calendar-nav h2{margin:0;text-align:center;color:var(--text);font-size:22px;line-height:1.25;letter-spacing:-.025em}
    .alpha-calendar-tools{display:flex;gap:12px;align-items:center;justify-content:space-between;margin:13px 0 15px}
    .alpha-calendar-tools p{margin:0;color:var(--muted);font-size:12px}
    .alpha-calendar-tools button{min-height:44px}
    .alpha-calendar-table{width:100%;border-collapse:collapse;table-layout:fixed}
    .alpha-calendar-table th{padding:10px 0;color:var(--muted);font-size:12px;font-weight:700;text-align:center}
    .alpha-calendar-table th abbr{border:0;text-decoration:none}
    .alpha-calendar-table td{padding:0;vertical-align:top;border:1px solid var(--line);background:var(--surface)}
    .alpha-calendar-table td.alpha-workday{background:var(--blue-soft)}
    .alpha-calendar-day{display:flex;flex-direction:column;align-items:center;gap:6px;min-height:94px;padding:9px 2px}
    .alpha-calendar-date{display:grid;place-items:center;width:29px;height:29px;border:2px solid transparent;border-radius:50%;font-size:15px;font-weight:650;color:var(--text);font-variant-numeric:tabular-nums}
    .alpha-calendar-table td[aria-current="date"] .alpha-calendar-date{border-color:var(--blue);color:var(--blue);font-weight:800}
    .alpha-calendar-duty{font-size:11px;line-height:1.2;color:var(--muted)}
    .alpha-workday .alpha-calendar-duty{color:var(--blue);font-weight:750}
    .alpha-calendar-outside .alpha-calendar-date,.alpha-calendar-outside .alpha-calendar-duty{opacity:.48}
    .alpha-calendar-training{width:calc(100% - 4px);min-height:40px;padding:5px 1px;border:1px solid #8c733f;border-radius:5px;background:var(--amber-soft);color:var(--amber);font-size:11px;line-height:1.25}
    .alpha-calendar-training span{display:block;font-size:10px;font-weight:500;margin-top:2px}
    .alpha-calendar-training:hover{background:#594829}
    .alpha-calendar-ot{width:calc(100% - 4px);min-height:40px;padding:5px 1px;border:1px solid #477da9;border-radius:5px;background:#18354e;color:#b6dfff;font-size:11px;font-weight:750;line-height:1.25}
    .alpha-calendar-ot span{display:block;font-size:10px;font-weight:500;margin-top:2px}
    .alpha-calendar-ot:hover{background:#234c6d}
        .alpha-ot-code{display:inline-block;margin-left:3px;padding:0 4px;border-radius:3px;color:#fff;background:#376796;font-size:10px;font-weight:800;line-height:1.5}
    .alpha-ot-code.required{background:#934452}
    .alpha-ot-card{border-left-color:#477da9}
    .alpha-ot-card .alpha-training-heading .badge{background:#193b57;color:#b6dfff}
        .alpha-calendar-legend{display:flex;gap:15px;flex-wrap:wrap;margin-top:16px;color:var(--muted);font-size:12px}
    .alpha-calendar-legend span{display:inline-flex;align-items:center;gap:7px}
    .alpha-calendar-swatch{display:inline-block;width:14px;height:14px;border:1px solid var(--line);border-radius:3px;background:var(--surface)}
    .alpha-calendar-swatch.work{background:var(--blue-soft);border-color:#4c769e}
    .alpha-calendar-swatch.training{background:var(--amber-soft);border-color:#8c733f}
    .alpha-calendar-swatch.ot{background:#18354e;border-color:#477da9}
    .alpha-calendar-swatch.today{border:2px solid var(--blue);border-radius:50%}
    .alpha-calendar-note{margin:15px 0 0;padding-top:13px;border-top:1px solid var(--line);font-size:12px;line-height:1.5;color:var(--muted)}
    .alpha-training-roster{margin-top:20px}
    .alpha-training-roster h3{margin:0 0 10px;font-size:14px;color:var(--text)}
    .alpha-training-card{padding:14px;margin-bottom:10px;background:var(--surface);border:1px solid var(--line);border-left:3px solid #b69655;border-radius:9px}
    .alpha-training-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
    .alpha-training-heading h4{margin:0;color:var(--text);font-size:14px}
    .alpha-training-heading .badge{background:var(--amber-soft);color:var(--amber)}
    .alpha-training-names{list-style:none;display:flex;gap:7px;flex-wrap:wrap;padding:0;margin:0}
    .alpha-training-names li{padding:5px 9px;background:var(--raised,#1c2a3a);border:1px solid var(--line);border-radius:5px;font-size:13px;color:var(--text)}
    .alpha-training-empty,.alpha-training-source{color:var(--muted);font-size:12px;line-height:1.5}
    .alpha-training-modal-head{display:flex;justify-content:space-between;align-items:start;gap:10px;margin-bottom:15px}
    .alpha-training-modal-head h2{margin:0 0 4px;font-size:19px}
    .alpha-training-modal-head p{margin:0;color:var(--muted);font-size:13px}
    .alpha-training-modal-head button{flex:0 0 auto}
    @media(min-width:650px){.alpha-calendar-training,.alpha-calendar-ot{font-size:12px}}
    @media(max-width:460px){.alpha-calendar{padding:10px;margin-top:14px}.alpha-calendar-nav h2{font-size:20px}.alpha-calendar-day{min-height:83px;padding:7px 0;gap:4px}.alpha-calendar-date{width:27px;height:27px;font-size:14px}.alpha-calendar-duty{font-size:10px}.alpha-calendar-legend{gap:12px}.alpha-calendar-training,.alpha-calendar-ot{font-size:10px}.alpha-calendar-training span,.alpha-calendar-ot>span{font-size:9px}.alpha-ot-code{font-size:9px}}
    @media(max-width:345px){.alpha-calendar{padding:7px}.alpha-calendar-nav h2{font-size:18px}.alpha-calendar-table th{font-size:10px}.alpha-calendar-legend{gap:9px;font-size:11px}.alpha-tabs [role="tab"]{font-size:13px}.alpha-calendar-training{font-size:9px}}
  `;
  document.head.appendChild(styles);

  const listNodes = Array.from(app.children).filter(node => node !== header);
  const listPanel = document.createElement('section');
  listPanel.id = 'alphaListPanel';
  listPanel.className = 'alpha-panel';
  listPanel.setAttribute('role', 'tabpanel');
  listPanel.setAttribute('aria-labelledby', 'alphaListTab');
  listPanel.tabIndex = 0;
  listNodes.forEach(node => listPanel.appendChild(node));
  app.appendChild(listPanel);
  const calendarPanel = document.createElement('section');
  calendarPanel.id = 'alphaCalendarPanel';
  calendarPanel.className = 'alpha-panel';
  calendarPanel.setAttribute('role', 'tabpanel');
  calendarPanel.setAttribute('aria-labelledby', 'alphaCalendarTab');
  calendarPanel.hidden = true;
  calendarPanel.innerHTML = `
    <div class="alpha-calendar">
      <p class="alpha-calendar-kicker">Alpha Crew schedule &amp; Training</p>
      <div class="alpha-calendar-nav">
        <button type="button" class="dark" id="alphaPreviousMonth" aria-label="Previous month">&#8249;</button>
        <h2 id="alphaCalendarMonth" aria-live="polite" aria-atomic="true"></h2>
        <button type="button" class="dark" id="alphaNextMonth" aria-label="Next month">&#8250;</button>
      </div>
      <div class="alpha-calendar-tools"><p>Regular rotation &middot; Central Time</p><button type="button" class="dark" id="alphaCalendarToday">Today</button></div>
      <table class="alpha-calendar-table" aria-labelledby="alphaCalendarMonth" aria-describedby="alphaCalendarLegend alphaCalendarNote">
        <thead><tr>${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map(day => `<th scope="col"><abbr title="${day}">${day.slice(0,3)}</abbr></th>`).join('')}</tr></thead>
        <tbody id="alphaCalendarDays"></tbody>
      </table>
      <div class="alpha-calendar-legend" id="alphaCalendarLegend">
        <span><i class="alpha-calendar-swatch work" aria-hidden="true"></i>Alpha working</span>
        <span><i class="alpha-calendar-swatch" aria-hidden="true"></i>Off</span>
        <span><i class="alpha-calendar-swatch training" aria-hidden="true"></i>Training</span>
        <span><i class="alpha-calendar-swatch ot" aria-hidden="true"></i>OT (V = Volunteer, R = Required)</span>
        <span><i class="alpha-calendar-swatch today" aria-hidden="true"></i>Today</span>
      </div>
      <p class="alpha-calendar-note" id="alphaCalendarNote">Blue highlights show Alpha's regular workdays. Tap Training or OT to see officers for that date. V = Volunteer OT, R = Required OT. Calendar display does not change the rotation.</p>
    </div>
    <section class="alpha-training-roster" aria-labelledby="alphaOTHeading"><h3 id="alphaOTHeading">OT this month</h3><div id="alphaOTDates" aria-live="polite"></div></section>
    <section class="alpha-training-roster" aria-labelledby="alphaTrainingHeading"><h3 id="alphaTrainingHeading">Training this month</h3><div id="alphaTrainingDates"></div></section>`;
  app.appendChild(calendarPanel);
  const detail = document.createElement('dialog');
  detail.id = 'alphaTacticalDialog';
  detail.setAttribute('aria-labelledby', 'alphaTacticalTitle');
  detail.innerHTML = '<div class="modal"><div class="alpha-training-modal-head"><div><h2 id="alphaTacticalTitle">Training</h2><p id="alphaTacticalDate"></p></div><button type="button" class="dark" id="alphaTacticalClose">Close</button></div><ul class="alpha-training-names" id="alphaTacticalNames"></ul><p class="alpha-training-source">Calendar-only schedule. No OT assignment, drop, or attendance record is created.</p></div>';
  document.body.appendChild(detail);
  document.getElementById('alphaTacticalClose').addEventListener('click', () => detail.close());
  const otDetail = document.createElement('dialog');
  otDetail.id = 'alphaOTDialog';
  otDetail.setAttribute('aria-labelledby', 'alphaOTTitle');
  otDetail.innerHTML = '<div class="modal"><div class="alpha-training-modal-head"><div><h2 id="alphaOTTitle">Overtime</h2><p id="alphaOTDate"></p></div><button type="button" class="dark" id="alphaOTClose">Close</button></div><ul class="alpha-training-names" id="alphaOTNames"></ul><p class="alpha-training-source">V = Volunteer OT · R = Required OT. Shows valid recorded assignments; canceled entries are excluded.</p></div>';
  document.body.appendChild(otDetail);
  document.getElementById('alphaOTClose').addEventListener('click', () => otDetail.close());
  const tabs = document.createElement('div');
  tabs.className = 'alpha-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Alpha OT views');
  tabs.innerHTML = '<button type="button" role="tab" id="alphaListTab" aria-controls="alphaListPanel" aria-selected="true">OT List</button><button type="button" role="tab" id="alphaCalendarTab" aria-controls="alphaCalendarPanel" aria-selected="false" tabindex="-1">Calendar/Training</button>';
  header.appendChild(tabs);
  const tabButtons = Array.from(tabs.querySelectorAll('[role="tab"]'));
  const calendarDays = document.getElementById('alphaCalendarDays');
  const calendarMonth = document.getElementById('alphaCalendarMonth');
  const centralFormatter = new Intl.DateTimeFormat('en-US', {timeZone:'America/Chicago', year:'numeric', month:'2-digit', day:'2-digit'});
  const monthFormatter = new Intl.DateTimeFormat('en-US', {timeZone:'UTC', month:'long', year:'numeric'});
  const dayFormatter = new Intl.DateTimeFormat('en-US', {timeZone:'UTC', weekday:'long', month:'long', day:'numeric', year:'numeric'});
  const shortFormatter = new Intl.DateTimeFormat('en-US', {timeZone:'UTC', weekday:'short', month:'short', day:'numeric'});
  function centralToday() {
    const parts = Object.fromEntries(centralFormatter.formatToParts(new Date()).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  function monthOf(iso) {
    const [year, month] = iso.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, 1));
  }
  function namesHTML(names) { return names.map(name => `<li>${escapeHTML(name)}</li>`).join(''); }
  function otNamesHTML(entries) { return entries.map(item => `<li>${escapeHTML(item.name)} <span class="alpha-ot-code ${item.code === 'R' ? 'required' : ''}" aria-label="${item.code === 'R' ? 'Required' : 'Volunteer'} OT">${item.code}</span></li>`).join(''); }
  let month = monthOf(centralToday());
  let renderedToday = '';
  let otByDate = Object.create(null);
  let otRequest = 0;
  let otLoading = false;
  let otError = '';
  function renderCalendar() {
    const todayISO = centralToday();
    renderedToday = todayISO;
    calendarMonth.textContent = monthFormatter.format(month);
    const year = month.getUTCFullYear(), monthIndex = month.getUTCMonth();
    const offset = month.getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    const cellCount = Math.ceil((offset + daysInMonth) / 7) * 7;
    let html = '';
    for (let index = 0; index < cellCount; index++) {
      if (index % 7 === 0) html += '<tr>';
      const date = new Date(Date.UTC(year, monthIndex, index - offset + 1));
      const iso = date.toISOString().slice(0, 10);
      const workday = alphaWorks(iso);
      const outside = date.getUTCMonth() !== monthIndex;
      const isToday = iso === todayISO;
      const names = tactical[iso];
      const otEntries = otByDate[iso] || [];
      const classes = [workday ? 'alpha-workday' : '', outside ? 'alpha-calendar-outside' : ''].filter(Boolean).join(' ');
      const label = `${dayFormatter.format(date)}: ${workday ? 'Alpha working' : 'Alpha off'}${isToday ? '; Today' : ''}`;
      const trainingHTML = names ? `<button type="button" class="alpha-calendar-training" data-training-date="${iso}" aria-label="Training on ${escapeHTML(dayFormatter.format(date))}, ${names.length} Alpha officers; show names">Training</button>` : '';
      const otHTML = otEntries.length ? `<button type="button" class="alpha-calendar-ot" data-ot-date="${iso}" aria-label="Overtime on ${escapeHTML(dayFormatter.format(date))}, ${otEntries.length} recorded assignments; show names">OT</button>` : '';
      html += `<td class="${classes}" data-date="${iso}" data-workday="${workday}" aria-label="${escapeHTML(label)}"${isToday ? ' aria-current="date"' : ''}><div class="alpha-calendar-day"><span class="alpha-calendar-date">${date.getUTCDate()}</span><span class="alpha-calendar-duty">${workday ? 'Work' : 'Off'}</span>${trainingHTML}${otHTML}</div></td>`;
      if (index % 7 === 6) html += '</tr>';
    }
    calendarDays.innerHTML = html;
    const prefix = month.toISOString().slice(0, 7);
    const dates = Object.keys(tactical).filter(iso => iso.startsWith(prefix)).sort();
    document.getElementById('alphaTrainingHeading').textContent = `Training · ${monthFormatter.format(month)}`;
    document.getElementById('alphaTrainingDates').innerHTML = dates.length ? dates.map(iso => `<article class="alpha-training-card" data-training-roster="${iso}"><div class="alpha-training-heading"><h4>${escapeHTML(shortFormatter.format(new Date(iso + 'T00:00:00Z')))}</h4><span class="badge">Training · ${tactical[iso].length}</span></div><ul class="alpha-training-names">${namesHTML(tactical[iso])}</ul></article>`).join('') + '<p class="alpha-training-source">Alpha roster matches only · Supplied Training schedule, Rev-2 (Oct. 1, 2026). Names without an assigned date are not placed on the calendar.</p>' : '<p class="alpha-training-empty">No Alpha Training dates have been added for this month.</p>';
    const otDates = Object.keys(otByDate).filter(iso => iso.startsWith(prefix)).sort();
    document.getElementById('alphaOTHeading').textContent = `OT · ${monthFormatter.format(month)}`;
    document.getElementById('alphaOTDates').innerHTML = otLoading
      ? '<p class="alpha-training-empty">Loading OT assignments…</p>'
      : otError
        ? `<p class="alpha-training-empty" role="alert">${escapeHTML(otError)}</p>`
        : otDates.length
          ? otDates.map(iso => `<article class="alpha-training-card alpha-ot-card"><div class="alpha-training-heading"><h4>${escapeHTML(shortFormatter.format(new Date(iso + 'T00:00:00Z')))}</h4><span class="badge">OT · ${otByDate[iso].length}</span></div><ul class="alpha-training-names">${otNamesHTML(otByDate[iso])}</ul></article>`).join('') + '<p class="alpha-training-source">Current recorded OT assignments only. Called-off and reversed assignments are excluded. R = Required; V = Volunteer.</p>'
          : '<p class="alpha-training-empty">No recorded OT assignments for this month.</p>';
  }

  // Read-only monthly OT lookup. This never inserts/edits events or touches rotation.
  async function loadCalendarOT() {
    const request = ++otRequest;
    const year = month.getUTCFullYear(), mi = month.getUTCMonth();
    const offset = month.getUTCDay();
    const dayCount = new Date(Date.UTC(year, mi+1, 0)).getUTCDate();
    const cellCount = Math.ceil((offset + dayCount) / 7) * 7;
    const from = new Date(Date.UTC(year, mi, 1-offset)).toISOString().slice(0,10);
    const through = new Date(Date.UTC(year, mi, cellCount-offset)).toISOString().slice(0,10);
    otByDate = Object.create(null);
    otLoading = true;
    otError = '';
    renderCalendar();
    try {
      const records = await api('/rest/v1/rpc/alpha_calendar_ot', {
        method: 'POST', auth: false,
        body: JSON.stringify({p_from:from, p_through:through})
      });
      if (request !== otRequest || calendarPanel.hidden) return;
      if (!Array.isArray(records)) throw new Error('Invalid calendar response');
      const grouped = Object.create(null);
      for (const item of records) {
        if (!item || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || typeof item.name !== 'string' || !['V','R'].includes(item.code)) continue;
        (grouped[item.date] ||= []).push({name:item.name,code:item.code});
      }
      otByDate = grouped;
      otError = '';
    } catch (error) {
      if (request !== otRequest || calendarPanel.hidden) return;
      otError = 'Unable to load OT assignments. Select Calendar/Training again to retry.';
    }
    otLoading = false;
    renderCalendar();
  }
  calendarDays.addEventListener('click', event => {
    const otButton = event.target.closest('[data-ot-date]');
    if (otButton) {
      const iso = otButton.dataset.otDate;
      const entries = otByDate[iso];
      if (!entries || !entries.length) return;
      document.getElementById('alphaOTDate').textContent = dayFormatter.format(new Date(iso + 'T00:00:00Z'));
      document.getElementById('alphaOTNames').innerHTML = otNamesHTML(entries);
      otDetail.showModal();
      return;
    }
    const button = event.target.closest('[data-training-date]');
    if (!button) return;
    const iso = button.dataset.trainingDate, names = tactical[iso];
    if (!names) return;
    document.getElementById('alphaTacticalDate').textContent = dayFormatter.format(new Date(iso + 'T00:00:00Z'));
    document.getElementById('alphaTacticalNames').innerHTML = namesHTML(names);
    detail.showModal();
  });
  function selectTab(index, focus) {
    if ((typeof reorderBusy !== 'undefined' && reorderBusy) || (typeof drag !== 'undefined' && drag)) return;
    if (index === 1) loadCalendarOT(); else otRequest++;
    tabButtons.forEach((button, i) => {
      button.setAttribute('aria-selected', String(i === index));
      button.tabIndex = i === index ? 0 : -1;
    });
    listPanel.hidden = index !== 0;
    calendarPanel.hidden = index !== 1;
    if (focus) tabButtons[index].focus();
  }
  tabButtons.forEach((button, index) => button.addEventListener('click', () => selectTab(index, false)));
  tabs.addEventListener('keydown', event => {
    const index = tabButtons.indexOf(document.activeElement);
    if (index < 0) return;
    let next;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = (index + 1) % 2;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = 1;
    else return;
    event.preventDefault();
    selectTab(next, true);
  });
  document.getElementById('alphaPreviousMonth').addEventListener('click', () => {
    month = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1));
    loadCalendarOT();
  });
  document.getElementById('alphaNextMonth').addEventListener('click', () => {
    month = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
    loadCalendarOT();
  });
  document.getElementById('alphaCalendarToday').addEventListener('click', () => {
    month = monthOf(centralToday());
    loadCalendarOT();
  });
  function refreshToday() {
    if (!document.hidden && !calendarPanel.hidden && renderedToday !== centralToday()) renderCalendar();
  }
  document.addEventListener('visibilitychange', refreshToday);
  setInterval(refreshToday, 60000);
  // Keep the open calendar current when supervisors record/call off OT.
  setInterval(() => { if (!calendarPanel.hidden && document.visibilityState === 'visible' && !otLoading) loadCalendarOT(); }, 60000);
})();