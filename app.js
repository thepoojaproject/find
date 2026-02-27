/**
 * CALENDAR APP - Pure Vanilla JavaScript
 * Features: Month/Week/Day views, Events CRUD, Drag & Drop,
 * Search, Filter, Export/Import, Notifications, Keyboard Shortcuts
 */

'use strict';

/* =============================================
   STATE
   ============================================= */

const state = {
  currentDate: new Date(),
  viewDate: new Date(),
  view: 'month',          // 'month' | 'week' | 'day'
  events: [],
  filterColor: 'all',
  searchQuery: '',
  draggedEventId: null,
  editingEventId: null,
  miniViewDate: new Date(),
  remindersScheduled: new Set(),
};

/* =============================================
   COLORS
   ============================================= */

const EVENT_COLORS = {
  red: '#e85d5d',
  orange: '#e8925d',
  yellow: '#e8c95d',
  green: '#5db87a',
  teal: '#5db8a8',
  blue: '#5d8be8',
  purple: '#8b5de8',
  pink: '#e85db8',
};

/* =============================================
   UTILS
   ============================================= */

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function formatDate(date) {
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function isToday(date) {
  const t = new Date();
  return date.getFullYear() === t.getFullYear() &&
         date.getMonth() === t.getMonth() &&
         date.getDate() === t.getDate();
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getMonthName(month) {
  return ['January','February','March','April','May','June',
          'July','August','September','October','November','December'][month];
}

function getShortDayName(dayIdx) {
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dayIdx];
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2,'0')} ${suffix}`;
}

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function getWeekStart(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function getCountdown(dateStr, timeStr) {
  const eventDate = parseDate(dateStr);
  if (timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    eventDate.setHours(h, m);
  }
  const diff = eventDate - new Date();
  if (diff < 0) return 'Past';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 30) return `${Math.floor(days/30)}mo`;
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${mins}m`;
}

/* =============================================
   STORAGE
   ============================================= */

function loadEvents() {
  try {
    const raw = localStorage.getItem('cal_events');
    state.events = raw ? JSON.parse(raw) : [];
  } catch { state.events = []; }
}

function saveEvents() {
  localStorage.setItem('cal_events', JSON.stringify(state.events));
}

function loadPrefs() {
  const theme = localStorage.getItem('cal_theme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeBtn(theme);

  const view = localStorage.getItem('cal_view') || 'month';
  state.view = view;
}

function savePrefs() {
  localStorage.setItem('cal_view', state.view);
}

/* =============================================
   EVENT CRUD
   ============================================= */

function getEventsForDate(dateStr) {
  return state.events.filter(e => e.date === dateStr);
}

function getFilteredEvents() {
  return state.events.filter(e => {
    if (state.filterColor !== 'all' && e.color !== state.filterColor) return false;
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      return e.title.toLowerCase().includes(q) ||
             (e.description || '').toLowerCase().includes(q);
    }
    return true;
  });
}

function addEvent(data) {
  const event = { id: genId(), ...data };
  state.events.push(event);
  saveEvents();
  scheduleReminder(event);
  return event;
}

function updateEvent(id, data) {
  const idx = state.events.findIndex(e => e.id === id);
  if (idx === -1) return;
  state.events[idx] = { ...state.events[idx], ...data };
  saveEvents();
  scheduleReminder(state.events[idx]);
  return state.events[idx];
}

function deleteEvent(id) {
  state.events = state.events.filter(e => e.id !== id);
  saveEvents();
}

function moveEventToDate(id, newDateStr) {
  updateEvent(id, { date: newDateStr });
}

/* =============================================
   NOTIFICATIONS
   ============================================= */

async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  const perm = await Notification.requestPermission();
  return perm === 'granted';
}

function scheduleReminder(event) {
  if (!event.reminder) return;
  if (state.remindersScheduled.has(event.id)) return;
  if (!('Notification' in window)) return;

  const eventDate = parseDate(event.date);
  if (event.startTime) {
    const [h, m] = event.startTime.split(':').map(Number);
    eventDate.setHours(h, m, 0, 0);
  }

  const reminderMs = event.reminderMinutes ? parseInt(event.reminderMinutes) * 60000 : 0;
  const notifyAt = eventDate.getTime() - reminderMs;
  const delay = notifyAt - Date.now();

  if (delay < 0) return;

  state.remindersScheduled.add(event.id);

  setTimeout(() => {
    if (Notification.permission === 'granted') {
      new Notification(`📅 ${event.title}`, {
        body: event.startTime
          ? `Starting at ${formatTime(event.startTime)}${event.description ? ' · ' + event.description : ''}`
          : event.description || 'Event reminder',
        icon: 'https://emojicdn.elk.sh/📅?style=apple',
      });
    }
  }, delay);
}

function scheduleAllReminders() {
  state.events.forEach(scheduleReminder);
}

/* =============================================
   RENDER ENGINE
   ============================================= */

function render() {
  updateHeaderPeriod();
  updateViewButtons();
  renderMiniCalendar();
  renderUpcoming();
  renderStats();

  const container = $('.calendar-view-container');
  container.innerHTML = '';

  if (state.view === 'month') renderMonthView(container);
  else if (state.view === 'week') renderWeekView(container);
  else renderDayView(container);
}

function updateHeaderPeriod() {
  const el = $('#current-period');
  const d = state.viewDate;
  if (state.view === 'month') {
    el.textContent = `${getMonthName(d.getMonth())} ${d.getFullYear()}`;
  } else if (state.view === 'week') {
    const start = getWeekStart(d);
    const end = new Date(start); end.setDate(end.getDate() + 6);
    if (start.getMonth() === end.getMonth()) {
      el.textContent = `${getMonthName(start.getMonth())} ${start.getFullYear()}`;
    } else {
      el.textContent = `${getMonthName(start.getMonth())} – ${getMonthName(end.getMonth())} ${end.getFullYear()}`;
    }
  } else {
    el.textContent = `${getMonthName(d.getMonth())} ${d.getDate()}, ${d.getFullYear()}`;
  }
}

function updateViewButtons() {
  $$('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === state.view);
  });
}

/* ---- Month View ---- */
function renderMonthView(container) {
  const div = document.createElement('div');
  div.className = 'month-view';

  // Day names header
  const namesRow = document.createElement('div');
  namesRow.className = 'day-names';
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(n => {
    const el = document.createElement('div');
    el.className = 'day-name';
    el.textContent = n;
    namesRow.appendChild(el);
  });
  div.appendChild(namesRow);

  // Grid
  const grid = document.createElement('div');
  grid.className = 'days-grid';

  const year = state.viewDate.getFullYear();
  const month = state.viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = getDaysInMonth(year, month);
  const prevDays = getDaysInMonth(year, month - 1);

  // Filtered events
  const filtered = getFilteredEvents();
  const eventsByDate = {};
  filtered.forEach(e => {
    if (!eventsByDate[e.date]) eventsByDate[e.date] = [];
    eventsByDate[e.date].push(e);
  });

  // Total cells: start of week to end
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    let day, cellDate, isOther = false;

    if (i < firstDay) {
      day = prevDays - firstDay + i + 1;
      cellDate = new Date(year, month - 1, day);
      isOther = true;
    } else if (i - firstDay < daysInMonth) {
      day = i - firstDay + 1;
      cellDate = new Date(year, month, day);
    } else {
      day = i - firstDay - daysInMonth + 1;
      cellDate = new Date(year, month + 1, day);
      isOther = true;
    }

    const cell = document.createElement('div');
    cell.className = 'day-cell' + (isOther ? ' other-month' : '') + (isToday(cellDate) ? ' today' : '');
    cell.dataset.date = formatDate(cellDate);

    // Day number
    const num = document.createElement('div');
    num.className = 'day-number';
    num.textContent = day;
    cell.appendChild(num);

    // Events
    const dateStr = formatDate(cellDate);
    const dayEvents = eventsByDate[dateStr] || [];
    const eventsContainer = document.createElement('div');
    eventsContainer.className = 'day-events';

    const maxShow = 3;
    dayEvents.slice(0, maxShow).forEach(ev => {
      const chip = createEventChip(ev);
      eventsContainer.appendChild(chip);
    });

    if (dayEvents.length > maxShow) {
      const more = document.createElement('div');
      more.className = 'more-events';
      more.textContent = `+${dayEvents.length - maxShow} more`;
      more.addEventListener('click', e => { e.stopPropagation(); openDayView(cellDate); });
      eventsContainer.appendChild(more);
    }

    cell.appendChild(eventsContainer);

    // Click to add event
    cell.addEventListener('click', (e) => {
      if (e.target.closest('.event-chip')) return;
      openModal(null, dateStr);
    });

    // Drag & drop target
    cell.addEventListener('dragover', e => {
      e.preventDefault();
      cell.classList.add('drag-over');
    });
    cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
    cell.addEventListener('drop', e => {
      e.preventDefault();
      cell.classList.remove('drag-over');
      if (state.draggedEventId) {
        moveEventToDate(state.draggedEventId, dateStr);
        state.draggedEventId = null;
        render();
        showToast('Event moved', 'success');
      }
    });

    grid.appendChild(cell);
  }

  div.appendChild(grid);
  container.appendChild(div);
  container.className = 'calendar-view-container slide-left-enter';
}

function createEventChip(event) {
  const chip = document.createElement('div');
  chip.className = 'event-chip';
  chip.draggable = true;
  const color = EVENT_COLORS[event.color] || event.color;
  chip.style.background = color;
  chip.style.color = 'white';
  chip.dataset.eventId = event.id;

  const dot = document.createElement('div');
  dot.className = 'event-chip-dot';
  chip.appendChild(dot);

  const text = document.createElement('span');
  text.className = 'event-chip-text';
  text.textContent = event.title;
  chip.appendChild(text);

  // Click to edit
  chip.addEventListener('click', e => {
    e.stopPropagation();
    openModal(event.id);
  });

  // Drag
  chip.addEventListener('dragstart', e => {
    state.draggedEventId = event.id;
    chip.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  chip.addEventListener('dragend', () => chip.classList.remove('dragging'));

  return chip;
}

/* ---- Week View ---- */
function renderWeekView(container) {
  const weekStart = getWeekStart(state.viewDate);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d;
  });

  const div = document.createElement('div');
  div.className = 'week-view';

  // Header
  const header = document.createElement('div');
  header.className = 'week-header';

  const gutter = document.createElement('div');
  gutter.className = 'week-time-gutter';
  header.appendChild(gutter);

  days.forEach(d => {
    const col = document.createElement('div');
    col.className = 'week-day-header' + (isToday(d) ? ' today' : '');
    col.innerHTML = `<div class="week-day-name">${getShortDayName(d.getDay())}</div>
                     <div class="week-day-number">${d.getDate()}</div>`;
    col.style.cursor = 'pointer';
    col.addEventListener('click', () => { openDayView(d); });
    header.appendChild(col);
  });
  div.appendChild(header);

  // Body
  const body = document.createElement('div');
  body.className = 'week-body';

  // Time column
  const timeCol = document.createElement('div');
  timeCol.className = 'week-time-col';
  for (let h = 0; h < 24; h++) {
    const label = document.createElement('div');
    label.className = 'week-hour-label';
    label.textContent = h === 0 ? '' : formatTime(`${h}:00`);
    timeCol.appendChild(label);
  }
  body.appendChild(timeCol);

  // Day columns
  const filtered = getFilteredEvents();

  days.forEach(d => {
    const dateStr = formatDate(d);
    const col = document.createElement('div');
    col.className = 'week-day-col';

    for (let h = 0; h < 24; h++) {
      const row = document.createElement('div');
      row.className = 'week-hour-line';
      row.addEventListener('click', () => openModal(null, dateStr, `${h.toString().padStart(2,'0')}:00`));
      col.appendChild(row);
    }

    // Events for this day
    const dayEvents = filtered.filter(e => e.date === dateStr && e.startTime);
    dayEvents.forEach(ev => {
      const start = timeToMinutes(ev.startTime);
      const end = ev.endTime ? timeToMinutes(ev.endTime) : start + 60;
      const duration = Math.max(end - start, 30);
      const top = (start / 60) * 60;
      const height = (duration / 60) * 60;

      const eventEl = document.createElement('div');
      eventEl.className = 'week-event';
      eventEl.style.top = `${top}px`;
      eventEl.style.height = `${height}px`;
      eventEl.style.background = EVENT_COLORS[ev.color] || ev.color;
      eventEl.innerHTML = `<strong>${ev.title}</strong>${ev.startTime ? `<br>${formatTime(ev.startTime)}` : ''}`;
      eventEl.addEventListener('click', e => { e.stopPropagation(); openModal(ev.id); });
      col.appendChild(eventEl);
    });

    // Current time line
    if (isToday(d)) {
      const now = new Date();
      const mins = now.getHours() * 60 + now.getMinutes();
      const top = (mins / 60) * 60;
      const line = document.createElement('div');
      line.className = 'current-time-line';
      line.style.top = `${top}px`;
      line.innerHTML = `<div class="time-line-dot"></div><div class="time-line-bar"></div>`;
      col.appendChild(line);
    }

    body.appendChild(col);
  });

  div.appendChild(body);
  container.appendChild(div);
}

/* ---- Day View ---- */
function renderDayView(container) {
  const d = state.viewDate;
  const dateStr = formatDate(d);

  const div = document.createElement('div');
  div.className = 'day-view';

  const hdr = document.createElement('div');
  hdr.className = 'day-view-header';

  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  hdr.innerHTML = `
    <div class="day-view-title">${dayNames[d.getDay()]}, ${getMonthName(d.getMonth())} ${d.getDate()}</div>
    <div class="day-view-subtitle">${d.getFullYear()}${isToday(d) ? ' · Today' : ''}</div>`;
  div.appendChild(hdr);

  const body = document.createElement('div');
  body.className = 'day-view-body';

  const timeCol = document.createElement('div');
  timeCol.className = 'day-time-col';
  for (let h = 0; h < 24; h++) {
    const label = document.createElement('div');
    label.className = 'day-hour-label';
    label.textContent = h === 0 ? '' : formatTime(`${h}:00`);
    timeCol.appendChild(label);
  }
  body.appendChild(timeCol);

  const eventsCol = document.createElement('div');
  eventsCol.className = 'day-events-col';

  for (let h = 0; h < 24; h++) {
    const row = document.createElement('div');
    row.className = 'day-hour-row';
    row.addEventListener('click', () => openModal(null, dateStr, `${h.toString().padStart(2,'0')}:00`));
    eventsCol.appendChild(row);
  }

  const filtered = getFilteredEvents().filter(e => e.date === dateStr);

  filtered.forEach(ev => {
    if (!ev.startTime) {
      const chip = createEventChip(ev);
      chip.style.position = 'relative';
      chip.style.margin = '2px 8px';
      eventsCol.appendChild(chip);
      return;
    }
    const start = timeToMinutes(ev.startTime);
    const end = ev.endTime ? timeToMinutes(ev.endTime) : start + 60;
    const duration = Math.max(end - start, 30);
    const top = (start / 60) * 60;
    const height = (duration / 60) * 60;

    const eventEl = document.createElement('div');
    eventEl.className = 'day-event';
    eventEl.style.top = `${top}px`;
    eventEl.style.height = `${height}px`;
    eventEl.style.background = EVENT_COLORS[ev.color] || ev.color;
    eventEl.innerHTML = `<strong>${ev.title}</strong><br>${formatTime(ev.startTime)}${ev.endTime ? ' – ' + formatTime(ev.endTime) : ''}${ev.description ? '<br>' + ev.description : ''}`;
    eventEl.addEventListener('click', e => { e.stopPropagation(); openModal(ev.id); });
    eventsCol.appendChild(eventEl);
  });

  // Current time
  if (isToday(d)) {
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const top = (mins / 60) * 60;
    const line = document.createElement('div');
    line.className = 'current-time-line';
    line.style.top = `${top}px`;
    line.innerHTML = `<div class="time-line-dot"></div><div class="time-line-bar"></div>`;
    eventsCol.appendChild(line);
  }

  body.appendChild(eventsCol);
  div.appendChild(body);
  container.appendChild(div);
}

function openDayView(date) {
  state.view = 'day';
  state.viewDate = date;
  savePrefs();
  render();
}

/* ---- Mini Calendar ---- */
function renderMiniCalendar() {
  const d = state.miniViewDate;
  const year = d.getFullYear();
  const month = d.getMonth();

  $('#mini-cal-title').textContent = `${getMonthName(month).slice(0,3)} ${year}`;

  const grid = $('#mini-grid');
  grid.innerHTML = '';

  // Day names
  ['S','M','T','W','T','F','S'].forEach(n => {
    const el = document.createElement('div');
    el.className = 'mini-day-name';
    el.textContent = n;
    grid.appendChild(el);
  });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = getDaysInMonth(year, month);
  const prevDays = getDaysInMonth(year, month - 1);
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  // Dates with events
  const eventDates = new Set(state.events.map(e => e.date));

  for (let i = 0; i < totalCells; i++) {
    let day, cellDate, isOther = false;
    if (i < firstDay) {
      day = prevDays - firstDay + i + 1;
      cellDate = new Date(year, month - 1, day);
      isOther = true;
    } else if (i - firstDay < daysInMonth) {
      day = i - firstDay + 1;
      cellDate = new Date(year, month, day);
    } else {
      day = i - firstDay - daysInMonth + 1;
      cellDate = new Date(year, month + 1, day);
      isOther = true;
    }

    const el = document.createElement('div');
    el.className = 'mini-day' +
      (isOther ? ' other-month' : '') +
      (isToday(cellDate) ? ' today' : '') +
      (isSameDay(cellDate, state.viewDate) ? ' selected' : '') +
      (eventDates.has(formatDate(cellDate)) ? ' has-events' : '');
    el.textContent = day;
    el.addEventListener('click', () => {
      state.viewDate = cellDate;
      if (state.view === 'day' || state.view === 'month') {
        if (state.view === 'month') {
          state.viewDate = new Date(cellDate.getFullYear(), cellDate.getMonth(), 1);
        }
        render();
      }
    });
    grid.appendChild(el);
  }
}

/* ---- Upcoming Events ---- */
function renderUpcoming() {
  const list = $('#upcoming-list');
  list.innerHTML = '';

  const today = formatDate(new Date());
  const upcoming = state.events
    .filter(e => e.date >= today)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.startTime || '').localeCompare(b.startTime || '');
    })
    .slice(0, 10);

  if (!upcoming.length) {
    list.innerHTML = `<div style="font-size:0.8rem;color:var(--text-muted);text-align:center;padding:16px">No upcoming events</div>`;
    return;
  }

  upcoming.forEach(ev => {
    const item = document.createElement('div');
    item.className = 'upcoming-item';

    const colorBar = document.createElement('div');
    colorBar.className = 'upcoming-color';
    colorBar.style.background = EVENT_COLORS[ev.color] || ev.color;
    item.appendChild(colorBar);

    const info = document.createElement('div');
    info.className = 'upcoming-info';
    const d = parseDate(ev.date);
    info.innerHTML = `
      <div class="upcoming-title">${ev.title}</div>
      <div class="upcoming-date">${getMonthName(d.getMonth()).slice(0,3)} ${d.getDate()}${ev.startTime ? ' · ' + formatTime(ev.startTime) : ''}</div>`;
    item.appendChild(info);

    const countdown = document.createElement('div');
    countdown.className = 'upcoming-countdown';
    countdown.textContent = getCountdown(ev.date, ev.startTime);
    item.appendChild(countdown);

    item.addEventListener('click', () => openModal(ev.id));
    list.appendChild(item);
  });
}

/* ---- Stats ---- */
function renderStats() {
  const now = new Date();
  const weekStart = getWeekStart(now);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);

  const weekEvents = state.events.filter(e => {
    const d = parseDate(e.date);
    return d >= weekStart && d <= weekEnd;
  });

  const monthEvents = state.events.filter(e => {
    const d = parseDate(e.date);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });

  const todayEvents = state.events.filter(e => e.date === formatDate(now));

  $('#stat-week').textContent = weekEvents.length;
  $('#stat-month').textContent = monthEvents.length;
  $('#stat-today').textContent = todayEvents.length;
  $('#stat-total').textContent = state.events.length;
}

/* =============================================
   MODAL
   ============================================= */

function openModal(eventId = null, dateStr = null, timeStr = null) {
  state.editingEventId = eventId;
  const modal = $('#event-modal');
  const overlay = $('#modal-overlay');

  const event = eventId ? state.events.find(e => e.id === eventId) : null;

  $('#modal-title-text').textContent = event ? 'Edit Event' : 'New Event';
  $('#event-title').value = event ? event.title : '';
  $('#event-description').value = event ? (event.description || '') : '';
  $('#event-date').value = event ? event.date : (dateStr || formatDate(new Date()));
  $('#event-start-time').value = event ? (event.startTime || '') : (timeStr || '');
  $('#event-end-time').value = event ? (event.endTime || '') : '';
  $('#event-reminder').checked = event ? !!event.reminder : false;
  $('#reminder-minutes').value = event ? (event.reminderMinutes || '30') : '30';

  // Color selection
  const selectedColor = event ? event.color : 'blue';
  $$('.color-option').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.color === selectedColor);
  });

  // Show/hide delete button
  const deleteBtn = $('#delete-event-btn');
  deleteBtn.style.display = event ? 'block' : 'none';

  overlay.classList.remove('hidden');
  requestAnimationFrame(() => $('#event-title').focus());
}

function closeModal() {
  $('#modal-overlay').classList.add('hidden');
  state.editingEventId = null;
}

function saveModal() {
  const title = $('#event-title').value.trim();
  if (!title) {
    $('#event-title').focus();
    $('#event-title').style.borderColor = 'var(--event-red)';
    setTimeout(() => $('#event-title').style.borderColor = '', 1500);
    return;
  }

  const selectedColor = $('.color-option.selected')?.dataset.color || 'blue';

  const data = {
    title,
    description: $('#event-description').value.trim(),
    date: $('#event-date').value,
    startTime: $('#event-start-time').value,
    endTime: $('#event-end-time').value,
    color: selectedColor,
    reminder: $('#event-reminder').checked,
    reminderMinutes: $('#reminder-minutes').value,
  };

  if (state.editingEventId) {
    updateEvent(state.editingEventId, data);
    showToast('Event updated', 'success');
  } else {
    addEvent(data);
    showToast('Event added', 'success');
  }

  closeModal();
  render();
}

/* =============================================
   NAVIGATION
   ============================================= */

function navigate(dir) {
  // dir: 1 = forward, -1 = back
  const d = state.viewDate;

  if (state.view === 'month') {
    state.viewDate = new Date(d.getFullYear(), d.getMonth() + dir, 1);
    state.miniViewDate = new Date(state.viewDate);
  } else if (state.view === 'week') {
    state.viewDate = new Date(d.getTime() + dir * 7 * 86400000);
  } else {
    state.viewDate = new Date(d.getTime() + dir * 86400000);
  }

  render();
}

function goToToday() {
  state.viewDate = new Date();
  state.miniViewDate = new Date();
  render();
}

/* =============================================
   SEARCH
   ============================================= */

function setupSearch() {
  const input = $('#search-input');
  const results = $('#search-results');

  input.addEventListener('input', () => {
    state.searchQuery = input.value.trim();

    if (!state.searchQuery) {
      results.classList.add('hidden');
      render();
      return;
    }

    const matches = state.events.filter(e => {
      const q = state.searchQuery.toLowerCase();
      return e.title.toLowerCase().includes(q) || (e.description||'').toLowerCase().includes(q);
    }).slice(0, 8);

    results.innerHTML = '';
    if (matches.length === 0) {
      results.innerHTML = `<div class="search-result-item" style="color:var(--text-muted)">No results found</div>`;
    } else {
      matches.forEach(ev => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        const d = parseDate(ev.date);
        item.innerHTML = `
          <div class="search-result-color" style="background:${EVENT_COLORS[ev.color]||ev.color}"></div>
          <div class="search-result-title">${ev.title}</div>
          <div class="search-result-date">${getMonthName(d.getMonth()).slice(0,3)} ${d.getDate()}, ${d.getFullYear()}</div>`;
        item.addEventListener('click', () => {
          results.classList.add('hidden');
          input.value = '';
          state.searchQuery = '';
          // Navigate to event date
          state.viewDate = new Date(d.getFullYear(), d.getMonth(), 1);
          state.view = 'month';
          render();
          setTimeout(() => openModal(ev.id), 300);
        });
        results.appendChild(item);
      });
    }

    results.classList.remove('hidden');
    render();
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrapper')) {
      results.classList.add('hidden');
    }
  });
}

/* =============================================
   FILTERS
   ============================================= */

function setupFilters() {
  $$('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      $$('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.filterColor = chip.dataset.color;
      render();
    });
  });
}

/* =============================================
   EXPORT / IMPORT
   ============================================= */

function exportEvents() {
  const data = {
    exported: new Date().toISOString(),
    version: 1,
    events: state.events,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `calendar-export-${formatDate(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Calendar exported!', 'success');
}

function importEvents(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      const events = data.events || data; // support array or object
      if (!Array.isArray(events)) throw new Error('Invalid format');

      const count = events.length;
      events.forEach(ev => {
        if (!state.events.find(e => e.id === ev.id)) {
          state.events.push(ev);
        }
      });
      saveEvents();
      render();
      showToast(`Imported ${count} events`, 'success');
    } catch {
      showToast('Import failed: invalid file', 'error');
    }
  };
  reader.readAsText(file);
}

/* =============================================
   DARK MODE
   ============================================= */

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('cal_theme', next);
  updateThemeBtn(next);
}

function updateThemeBtn(theme) {
  const btn = $('#theme-toggle');
  if (btn) btn.innerHTML = theme === 'dark'
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
}

/* =============================================
   TOAST
   ============================================= */

function showToast(message, type = 'info') {
  const container = $('#toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastIn 0.3s reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* =============================================
   KEYBOARD SHORTCUTS
   ============================================= */

function setupKeyboard() {
  document.addEventListener('keydown', e => {
    const tag = document.activeElement.tagName;
    if (['INPUT','TEXTAREA','SELECT'].includes(tag)) return;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        navigate(-1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        navigate(1);
        break;
      case 't':
      case 'T':
        goToToday();
        break;
      case 'n':
      case 'N':
        openModal();
        break;
      case 'm':
        setView('month');
        break;
      case 'w':
        setView('week');
        break;
      case 'd':
        setView('day');
        break;
      case 'Escape':
        closeModal();
        $('#shortcuts-overlay').classList.add('hidden');
        break;
      case '?':
        $('#shortcuts-overlay').classList.toggle('hidden');
        break;
      case 'e':
      case 'E':
        exportEvents();
        break;
    }
  });
}

function setView(v) {
  state.view = v;
  if (v === 'month') state.viewDate = new Date(state.viewDate.getFullYear(), state.viewDate.getMonth(), 1);
  savePrefs();
  render();
}

/* =============================================
   MINI CALENDAR NAVIGATION
   ============================================= */

function setupMiniCal() {
  $('#mini-prev').addEventListener('click', () => {
    state.miniViewDate = new Date(state.miniViewDate.getFullYear(), state.miniViewDate.getMonth() - 1, 1);
    renderMiniCalendar();
  });
  $('#mini-next').addEventListener('click', () => {
    state.miniViewDate = new Date(state.miniViewDate.getFullYear(), state.miniViewDate.getMonth() + 1, 1);
    renderMiniCalendar();
  });
}

/* =============================================
   COLOR PICKER
   ============================================= */

function setupColorPicker() {
  $$('.color-option').forEach(opt => {
    opt.addEventListener('click', () => {
      $$('.color-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
    });
  });
}

/* =============================================
   CURRENT TIME UPDATE
   ============================================= */

function startTimeUpdater() {
  setInterval(() => {
    if (state.view === 'week' || state.view === 'day') {
      render();
    }
    renderUpcoming(); // Update countdowns
  }, 60000); // Every minute
}

/* =============================================
   BOOTSTRAP SAMPLE DATA
   ============================================= */

function addSampleData() {
  if (state.events.length > 0) return;

  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const dayAfter = new Date(today); dayAfter.setDate(today.getDate() + 3);
  const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);

  const samples = [
    { title: 'Team standup', date: formatDate(today), startTime: '09:00', endTime: '09:30', color: 'blue', description: 'Daily sync with the team', reminder: false, reminderMinutes: '30' },
    { title: 'Design review', date: formatDate(today), startTime: '14:00', endTime: '15:00', color: 'purple', description: 'Review Q1 design assets', reminder: false, reminderMinutes: '30' },
    { title: 'Lunch with Alex', date: formatDate(tomorrow), startTime: '12:30', endTime: '13:30', color: 'green', description: '', reminder: false, reminderMinutes: '30' },
    { title: 'Product launch', date: formatDate(dayAfter), startTime: '10:00', endTime: '11:00', color: 'orange', description: 'Main product launch event', reminder: true, reminderMinutes: '60' },
    { title: 'Weekly review', date: formatDate(nextWeek), startTime: '16:00', endTime: '17:00', color: 'teal', description: 'End of week retrospective', reminder: false, reminderMinutes: '30' },
  ];

  samples.forEach(s => addEvent(s));
}

/* =============================================
   INIT
   ============================================= */

function init() {
  loadPrefs();
  loadEvents();
  addSampleData();
  scheduleAllReminders();

  // Render
  render();

  // Setup
  setupSearch();
  setupFilters();
  setupKeyboard();
  setupMiniCal();
  setupColorPicker();
  startTimeUpdater();

  // Header navigation
  $('#prev-btn').addEventListener('click', () => navigate(-1));
  $('#next-btn').addEventListener('click', () => navigate(1));
  $('#today-btn').addEventListener('click', goToToday);

  // View toggles
  $$('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      if (state.view === 'month') {
        state.viewDate = new Date(state.viewDate.getFullYear(), state.viewDate.getMonth(), 1);
      }
      savePrefs();
      render();
    });
  });

  // Theme toggle
  $('#theme-toggle').addEventListener('click', toggleTheme);

  // Add event button
  $('#add-event-btn').addEventListener('click', () => openModal());

  // Modal controls
  $('#modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
  $('#modal-close').addEventListener('click', closeModal);
  $('#cancel-btn').addEventListener('click', closeModal);
  $('#save-btn').addEventListener('click', saveModal);

  // Delete
  $('#delete-event-btn').addEventListener('click', () => {
    if (state.editingEventId && confirm('Delete this event?')) {
      deleteEvent(state.editingEventId);
      closeModal();
      render();
      showToast('Event deleted', 'info');
    }
  });

  // Modal form submit on enter
  $('#event-modal').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      saveModal();
    }
  });

  // Export / Import
  $('#export-btn').addEventListener('click', exportEvents);
  $('#import-btn').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', e => {
    if (e.target.files[0]) {
      importEvents(e.target.files[0]);
      e.target.value = '';
    }
  });

  // Notification permission
  $('#notify-btn').addEventListener('click', async () => {
    const granted = await requestNotificationPermission();
    showToast(granted ? 'Notifications enabled!' : 'Notifications blocked', granted ? 'success' : 'error');
  });

  // Keyboard shortcuts modal
  $('#shortcuts-btn').addEventListener('click', () => {
    $('#shortcuts-overlay').classList.toggle('hidden');
  });
  $('#shortcuts-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) $('#shortcuts-overlay').classList.add('hidden');
  });

  // Reminder toggle show/hide
  $('#event-reminder').addEventListener('change', e => {
    $('#reminder-row-extra').style.display = e.target.checked ? 'flex' : 'none';
  });
}

document.addEventListener('DOMContentLoaded', init);
