const app = document.querySelector('#app');
const api = window.todoApi;

const weekdayNames = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const isHistoryView = new URLSearchParams(window.location.search).get('view') === 'history';

let state = { today: toDateKey(new Date()), tasksByDate: {} };
let selectedMonth = firstDayOfMonth(new Date());
let selectedDate = state.today;

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromDateKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function firstDayOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatDateTitle(key) {
  const date = fromDateKey(key);
  return `${key} ${weekdayNames[date.getDay()]}`;
}

function sortedTasks(tasks = []) {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) {
      return Number(a.completed) - Number(b.completed);
    }
    return (a.createdAt || 0) - (b.createdAt || 0);
  });
}

function completionStatus(dateKey) {
  const tasks = state.tasksByDate[dateKey] || [];
  if (!tasks.length) {
    return { className: 'empty', label: '无任务' };
  }
  const completed = tasks.filter((task) => task.completed).length;
  if (completed === tasks.length) {
    return { className: 'done', label: '全部完成' };
  }
  if (completed > 0) {
    return { className: 'partial', label: '部分完成' };
  }
  return { className: 'pending', label: '未完成' };
}

function createButton(label, className, title) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  if (title) {
    button.title = title;
  }
  return button;
}

function renderToday() {
  const tasks = sortedTasks(state.tasksByDate[state.today]);
  app.className = 'app-shell today-shell';
  app.innerHTML = '';

  const header = document.createElement('header');
  header.className = 'titlebar drag-region';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'title-group';
  titleGroup.innerHTML = `<span class="eyebrow">Today</span><h1>${formatDateTitle(state.today)}</h1>`;

  const actions = document.createElement('div');
  actions.className = 'window-actions no-drag';
  const historyButton = createButton('历史', 'text-button', '查看历史记录');
  const minimizeButton = createButton('−', 'icon-button', '最小化到托盘');
  actions.append(historyButton, minimizeButton);
  header.append(titleGroup, actions);

  const list = document.createElement('section');
  list.className = 'task-list no-drag';

  if (!tasks.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = '暂无任务，点击下方添加';
    list.append(empty);
  } else {
    for (const task of tasks) {
      list.append(renderEditableTask(task));
    }
  }

  const form = document.createElement('form');
  form.className = 'add-form no-drag';
  form.innerHTML = `
    <input name="task" type="text" autocomplete="off" maxlength="120" placeholder="添加新的待办事项">
    <button type="submit" class="add-button" title="添加任务">+</button>
  `;

  app.append(header, list, form);

  historyButton.addEventListener('click', () => api.openHistory());
  minimizeButton.addEventListener('click', () => api.minimizeToTray());
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = form.elements.task;
    const text = input.value.trim();
    if (!text) {
      return;
    }
    await api.addTask(text, state.today);
    input.value = '';
  });
}

function renderEditableTask(task) {
  const item = document.createElement('article');
  item.className = `task-item ${task.completed ? 'is-complete' : ''}`;

  const checkbox = document.createElement('button');
  checkbox.type = 'button';
  checkbox.className = 'check-button';
  checkbox.setAttribute('aria-label', task.completed ? '标记为未完成' : '标记为完成');
  checkbox.textContent = task.completed ? '✓' : '';

  const text = document.createElement('p');
  text.className = 'task-text';
  text.textContent = task.text;

  const deleteButton = createButton('×', 'delete-button', '删除任务');

  item.append(checkbox, text, deleteButton);
  checkbox.addEventListener('click', () => api.toggleTask(task.id, state.today));
  deleteButton.addEventListener('click', () => api.deleteTask(task.id, state.today));
  return item;
}

function renderHistory() {
  const monthTitle = `${selectedMonth.getFullYear()} 年 ${selectedMonth.getMonth() + 1} 月`;
  const selectedTasks = sortedTasks(state.tasksByDate[selectedDate]);
  app.className = 'app-shell history-shell';
  app.innerHTML = '';

  const header = document.createElement('header');
  header.className = 'history-header drag-region';
  header.innerHTML = `
    <div class="title-group">
      <span class="eyebrow">History</span>
      <h1>历史记录</h1>
    </div>
  `;

  const actions = document.createElement('div');
  actions.className = 'window-actions no-drag';
  const todayButton = createButton('回到今天', 'text-button', '跳转到今天');
  const closeButton = createButton('×', 'icon-button', '关闭历史窗口');
  actions.append(todayButton, closeButton);
  header.append(actions);

  const layout = document.createElement('section');
  layout.className = 'history-layout no-drag';

  const calendarPanel = document.createElement('div');
  calendarPanel.className = 'calendar-panel';

  const calendarNav = document.createElement('div');
  calendarNav.className = 'calendar-nav';
  const prevButton = createButton('‹', 'icon-button', '上个月');
  const nextButton = createButton('›', 'icon-button', '下个月');
  const month = document.createElement('h2');
  month.textContent = monthTitle;
  calendarNav.append(prevButton, month, nextButton);

  const calendar = document.createElement('div');
  calendar.className = 'calendar-grid';
  for (const name of ['日', '一', '二', '三', '四', '五', '六']) {
    const cell = document.createElement('div');
    cell.className = 'weekday';
    cell.textContent = name;
    calendar.append(cell);
  }
  for (const day of calendarDays(selectedMonth)) {
    calendar.append(renderDayCell(day));
  }

  const legend = document.createElement('div');
  legend.className = 'legend';
  legend.innerHTML = `
    <span><i class="dot done"></i>全部完成</span>
    <span><i class="dot partial"></i>部分完成</span>
    <span><i class="dot pending"></i>未完成</span>
    <span><i class="dot empty"></i>无任务</span>
  `;

  calendarPanel.append(calendarNav, calendar, legend);

  const detail = document.createElement('aside');
  detail.className = 'history-detail';
  const status = completionStatus(selectedDate);
  detail.innerHTML = `
    <div>
      <span class="eyebrow">Selected</span>
      <h2>${formatDateTitle(selectedDate)}</h2>
      <p class="status-line"><i class="dot ${status.className}"></i>${status.label}</p>
    </div>
  `;

  const detailList = document.createElement('div');
  detailList.className = 'readonly-list';
  if (!selectedTasks.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state compact';
    empty.textContent = '当天没有任务记录';
    detailList.append(empty);
  } else {
    for (const task of selectedTasks) {
      const row = document.createElement('div');
      row.className = `readonly-task ${task.completed ? 'is-complete' : ''}`;
      row.innerHTML = `<span>${task.completed ? '✓' : ''}</span><p></p>`;
      row.querySelector('p').textContent = task.text;
      detailList.append(row);
    }
  }
  detail.append(detailList);

  layout.append(calendarPanel, detail);
  app.append(header, layout);

  prevButton.addEventListener('click', () => {
    selectedMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1);
    renderHistory();
  });
  nextButton.addEventListener('click', () => {
    selectedMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1);
    renderHistory();
  });
  todayButton.addEventListener('click', () => {
    selectedDate = state.today;
    selectedMonth = firstDayOfMonth(fromDateKey(state.today));
    renderHistory();
  });
  closeButton.addEventListener('click', () => api.closeHistory());
}

function calendarDays(monthDate) {
  const first = firstDayOfMonth(monthDate);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_item, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function renderDayCell(date) {
  const key = toDateKey(date);
  const status = completionStatus(key);
  const cell = document.createElement('button');
  cell.type = 'button';
  cell.className = [
    'day-cell',
    date.getMonth() === selectedMonth.getMonth() ? '' : 'muted',
    key === selectedDate ? 'selected' : '',
    key === state.today ? 'today' : ''
  ].filter(Boolean).join(' ');
  cell.innerHTML = `<span>${date.getDate()}</span><i class="dot ${status.className}"></i>`;
  cell.title = `${key} ${status.label}`;
  cell.addEventListener('click', () => {
    selectedDate = key;
    selectedMonth = firstDayOfMonth(date);
    renderHistory();
  });
  return cell;
}

async function init() {
  state = await api.getState();
  selectedDate = state.today;
  selectedMonth = firstDayOfMonth(fromDateKey(state.today));
  isHistoryView ? renderHistory() : renderToday();

  api.onTasksUpdated((nextState) => {
    state = nextState;
    if (!isHistoryView) {
      renderToday();
    } else {
      renderHistory();
    }
  });
}

init();
