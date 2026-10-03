/* Alpha OT calendar: display-only; shares the existing alphaWorks rotation. */
(function () {
  'use strict';
  const app = document.querySelector('.app');
  const header = app && app.querySelector('header');
  if (!app || !header || !document.getElementById('list') ||
      typeof alphaWorks !== 'function' || document.getElementById('alphaCalendarPanel')) return;

  const styles = document.createElement('style');
  styles.id = 'alphaCalendarStyles';
  styles.textContent = `
    .alpha-tabs{display:flex;gap:6px;margin-top:14px;padding:4px;background:var(--bg);border:1px solid var(--line);border-radius:10px}
    .alpha-tabs [role="tab"]{flex:1;min-height:44px;padding:10px 12px;background:transparent;color:var(--muted);font-size:14px;border-radius:7px}
    .alpha-tabs [role="tab"][aria-selected="true"]{background:var(--navy);color:#fff;box-shadow:0 1px 3px #17324d20}
    .alpha-panel[hidden]{display:none!important}
    .alpha-panel:focus-visible{outline:3px solid #82b6dd;outline-offset:3px}
    .alpha-calendar{margin-top:20px;padding:16px;background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:0 1px 2px #17324d0a}
    .alpha-calendar-kicker{margin:0 0 12px;color:var(--muted);font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
    .alpha-calendar-nav{display:grid;grid-template-columns:44px minmax(0,1fr) 44px;gap:8px;align-items:center}
    .alpha-calendar-nav button{min-width:44px;min-height:44px;padding:6px;font-size:24px;line-height:1}
    .alpha-calendar-nav h2{margin:0;text-align:center;color:var(--navy);font-size:22px;line-height:1.25;letter-spacing:-.025em}
    .alpha-calendar-tools{display:flex;gap:12px;align-items:center;justify-content:space-between;margin:13px 0 15px}
    .alpha-calendar-tools p{margin:0;color:var(--muted);font-size:12px}
    .alpha-calendar-tools button{min-height:44px}
    .alpha-calendar-table{width:100%;border-collapse:collapse;table-layout:fixed}
    .alpha-calendar-table th{padding:10px 0;color:var(--muted);font-size:12px;font-weight:700;text-align:center}
    .alpha-calendar-table th abbr{border:0;text-decoration:none}
    .alpha-calendar-table td{padding:0;height:83px;vertical-align:top;border:1px solid var(--line);background:var(--surface)}
    .alpha-calendar-table td.alpha-workday{background:var(--blue-soft)}
    .alpha-calendar-day{display:flex;flex-direction:column;align-items:center;gap:8px;min-height:82px;padding:10px 2px}
    .alpha-calendar-date{display:grid;place-items:center;width:29px;height:29px;border:2px solid transparent;border-radius:50%;font-size:15px;font-weight:650;color:var(--text);font-variant-numeric:tabular-nums}
    .alpha-calendar-table td[aria-current="date"] .alpha-calendar-date{border-color:var(--navy);color:var(--navy);font-weight:800}
    .alpha-calendar-duty{font-size:11px;line-height:1.2;color:var(--muted)}
    .alpha-workday .alpha-calendar-duty{color:var(--blue);font-weight:750}
    .alpha-calendar-outside .alpha-calendar-date,.alpha-calendar-outside .alpha-calendar-duty{opacity:.48}
    .alpha-calendar-legend{display:flex;gap:15px;flex-wrap:wrap;margin-top:16px;color:var(--muted);font-size:12px}
    .alpha-calendar-legend span{display:inline-flex;align-items:center;gap:7px}
    .alpha-calendar-swatch{display:inline-block;width:14px;height:14px;border:1px solid var(--line);border-radius:3px;background:var(--surface)}
    .alpha-calendar-swatch.work{background:var(--blue-soft);border-color:#adc9df}
    .alpha-calendar-swatch.today{border:2px solid var(--navy);border-radius:50%}
    .alpha-calendar-note{margin:15px 0 0;padding-top:13px;border-top:1px solid var(--line);font-size:12px;line-height:1.5;color:var(--muted)}
    @media(max-width:460px){.alpha-calendar{padding:12px;margin-top:14px}.alpha-calendar-nav h2{font-size:20px}.alpha-calendar-table td{height:69px}.alpha-calendar-day{min-height:68px;padding:7px 1px;gap:5px}.alpha-calendar-date{width:27px;height:27px;font-size:14px}.alpha-calendar-duty{font-size:10px}.alpha-calendar-legend{gap:12px}}
    @media(max-width:345px){.alpha-calendar{padding:9px}.alpha-calendar-nav h2{font-size:18px}.alpha-calendar-table th{font-size:11px}.alpha-calendar-legend{gap:9px;font-size:11px}}
  `;
  document.head.appendChild(styles);

  // Move the existing list nodes, never clone them or recreate their controls.
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
      <p class="alpha-calendar-kicker">Alpha Crew schedule</p>
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
        <span><i class="alpha-calendar-swatch today" aria-hidden="true"></i>Today</span>
      </div>
      <p class="alpha-calendar-note" id="alphaCalendarNote">Regular Alpha Crew workdays only. Individual overtime, training, and leave do not change this calendar.</p>
    </div>`;
  app.appendChild(calendarPanel);

  const tabs = document.createElement('div');
  tabs.className = 'alpha-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Alpha OT views');
  tabs.innerHTML = '<button type="button" role="tab" id="alphaListTab" aria-controls="alphaListPanel" aria-selected="true">OT List</button><button type="button" role="tab" id="alphaCalendarTab" aria-controls="alphaCalendarPanel" aria-selected="false" tabindex="-1">Calendar</button>';
  header.appendChild(tabs);
  const tabButtons = Array.from(tabs.querySelectorAll('[role="tab"]'));
  const calendarDays = document.getElementById('alphaCalendarDays');
  const calendarMonth = document.getElementById('alphaCalendarMonth');
  const centralFormatter = new Intl.DateTimeFormat('en-US', {timeZone:'America/Chicago', year:'numeric', month:'2-digit', day:'2-digit'});
  const monthFormatter = new Intl.DateTimeFormat('en-US', {timeZone:'UTC', month:'long', year:'numeric'});
  const dayFormatter = new Intl.DateTimeFormat('en-US', {timeZone:'UTC', weekday:'long', month:'long', day:'numeric', year:'numeric'});

  function centralToday() {
    const parts = Object.fromEntries(centralFormatter.formatToParts(new Date()).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  function monthOf(iso) {
    const [year, month] = iso.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, 1));
  }
  let month = monthOf(centralToday());
  let renderedToday = '';

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
      // Date-only UTC arithmetic avoids DST shifting the crew's 14-day cycle.
      const date = new Date(Date.UTC(year, monthIndex, index - offset + 1));
      const iso = date.toISOString().slice(0, 10);
      const workday = alphaWorks(iso);
      const outside = date.getUTCMonth() !== monthIndex;
      const isToday = iso === todayISO;
      const classes = [workday ? 'alpha-workday' : '', outside ? 'alpha-calendar-outside' : ''].filter(Boolean).join(' ');
      const label = `${dayFormatter.format(date)}: ${workday ? 'Alpha working' : 'Alpha off'}${isToday ? '; Today' : ''}`;
      html += `<td class="${classes}" data-date="${iso}" data-workday="${workday}" aria-label="${label}"${isToday ? ' aria-current="date"' : ''}><div class="alpha-calendar-day" aria-hidden="true"><span class="alpha-calendar-date">${date.getUTCDate()}</span><span class="alpha-calendar-duty">${workday ? 'Work' : 'Off'}</span></div></td>`;
      if (index % 7 === 6) html += '</tr>';
    }
    calendarDays.innerHTML = html;
  }

  function selectTab(index, focus) {
    if ((typeof reorderBusy !== 'undefined' && reorderBusy) || (typeof drag !== 'undefined' && drag)) return;
    if (index === 1) renderCalendar();
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
    if (event.key === 'ArrowRight') next = (index + 1) % 2;
    else if (event.key === 'ArrowLeft') next = (index + 1) % 2;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = 1;
    else return;
    event.preventDefault();
    selectTab(next, true);
  });
  document.getElementById('alphaPreviousMonth').addEventListener('click', () => {
    month = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1));
    renderCalendar();
  });
  document.getElementById('alphaNextMonth').addEventListener('click', () => {
    month = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
    renderCalendar();
  });
  document.getElementById('alphaCalendarToday').addEventListener('click', () => {
    month = monthOf(centralToday());
    renderCalendar();
  });
  function refreshToday() {
    if (!document.hidden && !calendarPanel.hidden && renderedToday !== centralToday()) renderCalendar();
  }
  document.addEventListener('visibilitychange', refreshToday);
  setInterval(refreshToday, 60000);
})();
