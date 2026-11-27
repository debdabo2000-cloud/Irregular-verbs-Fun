const ClassNotes = (() => {
  const labels = { lessons: '教學內容', homeworks: '功課追蹤', todos: '應做事項' };
  const get = id => document.getElementById('notes' + id);
  let imageURL;

  function dateValue(year, month, day) {
    if (!/^\d{4}$/.test(year)) return '';
    const value = [year, month.padStart(2, '0'), day.padStart(2, '0')].join('-');
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value ? '' : value;
  }

  function targets(data) {
    const entries = [];
    for (const group of data.classes) {
      entries.push({ key: 'class:' + group.id, classId: group.id, name: group.name, label: group.name });
      for (const student of data.students.filter(item => item.classId === group.id)) {
        entries.push({ key: 'student:' + student.id, classId: group.id, studentId: student.id,
          name: student.name, label: group.name + ' · ' + student.name });
      }
    }
    return entries;
  }

  function classify(line) {
    line = line.replace(/(?<=\p{Script=Han})\s+(?=\p{Script=Han})/gu, '');
    const done = /已\s*(?:準備|備妥|印好|完成備課)|\b(?:already prepared|printed and ready)\b/i.test(line);
    if (/^(?:功課|作業|homework|h\s*w)\s*:/i.test(line)) return { kind: 'homeworks' };
    if (/^(?:教學|上課內容|課程|lesson)\s*:/i.test(line)) return { kind: 'lessons' };
    if (done || /下\s*次|下堂|待準備|要準備|備課|待辦|列印|影印|^準備|\b(?:prepare|print|to-do|next class)\b/i.test(line)) {
      return { kind: 'todos', done };
    }
    if (/功\s*課|作\s*業|\b(?:homework|h\s*w)\b/i.test(line)) return { kind: 'homeworks' };
    if (/教學|已教|講解|上課內容|^課程|\b(?:taught|covered|lesson)\b/i.test(line)) return { kind: 'lessons' };
    return { kind: '' };
  }

  function extractDate(line) {
    const numeric = line.match(/^(?:(\d{4})\s*[-/.年]\s*)?(\d{1,2})\s*[/月.-]\s*(\d{1,2})(?:\s*日)?(?=\s|:|$)/);
    if (numeric) return numeric;
    const english = line.match(/^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?(?=\s|:|$)/i);
    if (!english) return null;
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    return [english[0], english[3], String(months.indexOf(english[1].slice(0, 3).toLowerCase()) + 1), english[2]];
  }

  function parse(text, year, people) {
    const rows = [];
    let date = '';
    let dateHint = '';
    let target = '';
    for (const raw of text.normalize('NFKC').split(/\r?\n/)) {
      let line = raw.trim().replace(/^[•●*]+\s*/, '');
      if (!line) continue;
      const heading = extractDate(line);
      if (heading) {
        date = dateValue(heading[1] || year, heading[2], heading[3]);
        dateHint = date ? '' : heading[0];
        target = '';
        line = line.slice(heading[0].length).replace(/^[\s:]+/, '');
      }
      if (!line) continue;

      const label = line.match(/^([^:]+)\s*:\s*/)?.[1]?.trim() || line;
      const matches = people.filter(person => person.name.toLowerCase() === label.toLowerCase());
      if (matches.length === 1) {
        target = matches[0].key;
        if (label === line) continue;
        line = line.slice(line.indexOf(':') + 1).trim();
      } else if (matches.length > 1 || (label !== line && !classify(label).kind)) {
        target = '';
      }
      if (!line) continue;

      const segments = line.split(/\s*[;；]\s*/).filter(Boolean);
      for (const content of segments) {
        const dueMatch = content.match(/(?:到期|截止|\bdue)\s*[:：]?\s*(?:(\d{4})[-/]\s*)?(\d{1,2})[-/月]\s*(\d{1,2})(?:日)?\b/i);
        const due = dueMatch ? dateValue(dueMatch[1] || date.slice(0, 4) || year, dueMatch[2], dueMatch[3]) : '';
        rows.push({ ...classify(content), content, date, dateHint, target, due });
      }
    }
    return rows;
  }

  function createRecord(row, target) {
    if (row.kind === 'lessons') {
      return { classId: target.classId, studentId: target.studentId || '', targetName: target.name,
        date: row.date, version: '', topic: row.content };
    }
    if (row.kind === 'homeworks') {
      return { classId: target.classId, studentId: target.studentId || '', studentName: target.name,
        type: '課堂筆記', title: row.content, startDate: row.date, due: row.due, status: '⏳ 未繳交' };
    }
    return { classId: target.classId, studentId: target.studentId || '', text: row.content,
      tag: '📝 課前準備', target: target.name, date: row.date, done: row.done };
  }

  function field(labelText, control) {
    const label = document.createElement('label');
    label.append(document.createTextNode(labelText), control);
    return label;
  }

  function input(type, name, value = '') {
    const control = document.createElement('input');
    control.type = type;
    control.name = name;
    control.value = value;
    return control;
  }

  function addRow(row = {}) {
    const card = document.createElement('fieldset');
    card.className = 'list-item notes-record';
    const legend = document.createElement('legend');
    legend.textContent = '待確認紀錄';
    card.append(legend);
    if (row.uncertainty) {
      const note = document.createElement('p');
      note.textContent = '請核對：' + row.uncertainty;
      card.append(note);
    }
    const include = input('checkbox', 'include');
    include.checked = true;
    include.style.width = 'auto';
    const content = document.createElement('textarea');
    content.name = 'content';
    content.rows = 2;
    content.value = row.content || '';

    const kind = document.createElement('select');
    kind.name = 'kind';
    kind.append(new Option('待確認', ''), ...Object.entries(labels).map(([key, label]) => new Option(label, key)));
    kind.value = row.kind || '';
    const target = document.createElement('select');
    target.name = 'target';
    target.append(new Option('請選擇班級或學生', ''), ...targets(db).map(person => new Option(person.label, person.key)));
    target.value = row.target || '';
    const date = input('date', 'date', row.date);
    const due = input('date', 'due', row.due);
    const done = input('checkbox', 'done');
    done.checked = Boolean(row.done);
    done.style.width = 'auto';
    const dateLabel = field('', date);
    const dueLabel = field('功課到期日', due);
    const doneLabel = field('準備已完成', done);
    function updateFields() {
      const label = { lessons: '上課日期', homeworks: '指派日期', todos: '準備日期' }[kind.value] || '日期';
      dateLabel.firstChild.textContent = row.dateHint ? `${label}（原文 ${row.dateHint}）` : label;
      dueLabel.style.display = kind.value === 'homeworks' ? '' : 'none';
      doneLabel.style.display = kind.value === 'todos' ? '' : 'none';
      for (const control of [kind, target, content]) control.required = include.checked;
    }
    kind.addEventListener('change', updateFields);
    include.addEventListener('change', updateFields);
    updateFields();

    const fields = document.createElement('div');
    fields.className = 'grid-3';
    fields.append(field('分類', kind), field('班級或學生', target), dateLabel, dueLabel, doneLabel);
    const remove = document.createElement('button');
    remove.className = 'del-btn';
    remove.type = 'button';
    remove.textContent = '移除此筆';
    remove.addEventListener('click', () => {
      card.remove();
      get('Add').focus();
    });
    const includeLabel = field('儲存此筆', include);
    includeLabel.style.display = 'flex';
    includeLabel.style.alignItems = 'center';
    card.append(includeLabel, field('內容', content), fields, remove);
    get('Rows').append(card);
  }

  async function scanPhoto() {
    const photo = get('Photo').files[0];
    if (!photo) {
      get('ScanStatus').textContent = '請先選擇筆記照片。';
      return;
    }
    const controls = ['Photo', 'Scan', 'AIScan', 'Text', 'Generate'].map(get);
    controls.forEach(control => control.disabled = true);
    get('ScanStatus').textContent = '正在載入英文及繁體中文辨識工具…';
    try {
      const text = await WorkbenchOCR.read(photo, percent => {
        get('ScanStatus').textContent = `辨識照片中 ${percent}%`;
      });
      if (text) get('Text').value = text;
      get('ScanStatus').textContent = text ? '請核對或補上漏讀文字，再產生待確認紀錄。'
        : '沒有讀到文字。可換一張照片，或貼上文字。';
    } catch {
      get('ScanStatus').textContent = '辨識失敗。請確認網路連線，或貼上文字。';
    } finally {
      controls.forEach(control => control.disabled = false);
    }
  }

  async function preparePhoto(photo) {
    const bitmap = await createImageBitmap(photo);
    try {
      const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    } finally {
      bitmap.close();
    }
  }

  function aiRows(rows, year) {
    const people = targets(db);
    function parseDate(value, fallback) {
      const match = typeof value === 'string' && value.match(/^(?:(\d{4})-)?(\d{1,2})[-/](\d{1,2})$/);
      return match ? dateValue(match[1] || fallback, match[2], match[3]) : '';
    }

    return rows.filter(row => typeof row?.content === 'string' && row.content.trim()).map(row => {
      const name = typeof row.name === 'string' ? row.name.trim().toLowerCase() : '';
      const matches = name ? people.filter(person => person.name.trim().toLowerCase() === name) : [];
      const date = parseDate(row.date, year);
      const due = parseDate(row.due, date.slice(0, 4) || year);
      const uncertainty = [
        typeof row.uncertainty === 'string' && row.uncertainty,
        name && matches.length !== 1 && '原文對象 ' + row.name,
        row.due && !due && '原文到期日 ' + row.due,
      ].filter(Boolean).join('；');
      return {
        kind: Object.hasOwn(labels, row.kind) ? row.kind : '',
        target: matches.length === 1 ? matches[0].key : '',
        date, due, dateHint: date ? '' : row.date,
        done: row.done === true,
        content: row.content.trim(),
        uncertainty,
      };
    });
  }

  function showRows(rows) {
    get('Rows').replaceChildren();
    rows.forEach(addRow);
    get('Review').hidden = false;
    get('SaveStatus').textContent = '';
    get('Rows').querySelector('textarea').focus();
  }

  async function scanWithAI() {
    const photo = get('Photo').files[0];
    if (!photo) {
      get('ScanStatus').textContent = '請先選擇筆記照片。';
      return;
    }
    if (!get('Year').reportValidity()) return;
    if (get('Rows').children.length && !confirm('辨識成功後會取代目前未儲存的預覽。繼續嗎？')) return;
    const controls = ['Photo', 'Scan', 'AIScan', 'Year', 'Text', 'Generate', 'Add', 'Save'].map(get);
    controls.forEach(control => control.disabled = true);
    try {
      const token = await WorkbenchSync.accessToken();
      if (!token) {
        get('ScanStatus').textContent = '請先到「裝置同步」用電子郵件登入，再回來辨識照片。';
        return;
      }
      get('ScanStatus').textContent = '正在準備照片並辨識手寫筆記…';
      const image = await preparePhoto(photo);
      if (!image || image.size > 4 * 1024 * 1024) {
        get('ScanStatus').textContent = '照片太大或無法轉換。請換一張 JPG 或 PNG 照片。';
        return;
      }
      const result = await fetch(WorkbenchSyncConfig.url + '/functions/v1/read-class-notes', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          apikey: WorkbenchSyncConfig.publishableKey,
          'Content-Type': 'image/jpeg',
        },
        body: image,
        signal: AbortSignal.timeout(75000),
      });
      if (!result.ok) {
        const details = await result.json().catch(() => ({}));
        const causes = {
          configuration: 'Supabase 缺少 AI 設定。請確認已儲存 OPENAI_API_KEY 和 NOTES_AI_ALLOWED_EMAIL。',
          ai_quota_or_key: 'OpenAI 拒絕了這次辨識請求。請檢查 API 帳戶的額度、計費及金鑰權限。',
          ai_key: 'OpenAI 無法驗證 API 金鑰。請在 Supabase Secrets 更新 OPENAI_API_KEY。',
          ai_quota: 'OpenAI API 可用額度不足。請查看 OpenAI Platform 的 API 計費。',
          ai_permission: '這把 OpenAI API 金鑰無法使用辨識所需的 API 或模型。',
          ai_rate_limit: 'OpenAI 暫時限制請求頻率。請稍後再試一次。',
        };
        const messages = {
          401: '登入已失效。請到「裝置同步」重新登入。',
          403: '這個帳號尚未開放 AI 辨識。',
          404: 'AI 辨識服務尚未部署。',
          503: '辨識服務暫時無法回應。',
        };
        const reason = details?.error ?? details?.code;
        const code = typeof reason === 'string' && /^[a-z0-9_]{1,64}$/i.test(reason) ? reason : '';
        const message = Object.hasOwn(causes, code) ? causes[code]
          : messages[result.status] || 'AI 辨識失敗。請稍後再試，或貼上文字。';
        get('ScanStatus').textContent = `${message}（HTTP ${result.status}${code ? ' · ' + code : ''}）`;
        return;
      }
      const { rows } = await result.json();
      const drafts = aiRows(rows, get('Year').value);
      if (!drafts.length) {
        get('ScanStatus').textContent = 'AI 沒有讀到可用的筆記。可以改拍單日區塊再試。';
        return;
      }
      get('ScanStatus').textContent = `已產生 ${drafts.length} 筆草稿，請核對原圖後再儲存。`;
      showRows(drafts);
    } catch {
      get('ScanStatus').textContent = '無法完成 AI 辨識。請確認照片格式與網路連線，或貼上文字。';
    } finally {
      controls.forEach(control => control.disabled = false);
    }
  }

  function commit() {
    const status = get('SaveStatus');
    status.textContent = '';
    const cards = Array.from(get('Rows').children).filter(card => card.elements.include.checked);
    if (!cards.length) {
      status.textContent = '請勾選至少一筆紀錄。';
      return;
    }
    try {
      const next = normalizeDB(VocabularyProgress.readDB());
      const people = new Map(targets(next).map(person => [person.key, person]));
      const batch = [];
      for (const card of cards) {
        const { kind, target, content, date, due, done } = card.elements;
        const person = people.get(target.value);
        if (!person || !content.value.trim() || !Object.hasOwn(labels, kind.value)) {
          status.textContent = '請確認每筆紀錄的分類、對象與內容。若名單有變更，請重新產生紀錄。';
          return;
        }
        if (kind.value === 'homeworks' && date.value && due.value && due.value < date.value) {
          status.textContent = '功課到期日須在指派日期當天或之後。';
          due.focus();
          return;
        }
        const row = { kind: kind.value, content: content.value.trim(), date: date.value, due: due.value, done: done.checked };
        batch.push({ kind: row.kind, record: createRecord(row, person) });
      }
      const counts = {};
      for (const { kind, record } of batch.reverse()) {
        next[kind].unshift({ id: crypto.randomUUID(), ...record });
        counts[kind] = (counts[kind] || 0) + 1;
      }
      // Write the imported batch before removing any editable drafts.
      VocabularyProgress.writeDB(next);
      db = next;
      cards.forEach(card => card.remove());
      get('Review').hidden = !get('Rows').children.length;
      renderAll(false);
      status.textContent = '已儲存 ' + Object.entries(counts).map(([kind, count]) => `${labels[kind]} ${count} 筆`).join('、') + '。';
      status.focus();
    } catch {
      status.textContent = '目前無法儲存，請確認瀏覽器儲存空間後再試。';
    }
  }

  function init() {
    get('Photo').addEventListener('change', () => {
      if (imageURL) URL.revokeObjectURL(imageURL);
      const photo = get('Photo').files[0];
      imageURL = photo ? URL.createObjectURL(photo) : '';
      get('Image').hidden = !imageURL;
      if (imageURL) get('Image').src = imageURL;
      else get('Image').removeAttribute('src');
    });
    get('Scan').addEventListener('click', scanPhoto);
    get('AIScan').addEventListener('click', scanWithAI);
    get('Generate').addEventListener('click', () => {
      if (!get('Year').reportValidity()) return;
      const rows = parse(get('Text').value, get('Year').value, targets(db));
      if (!rows.length) {
        get('ScanStatus').textContent = '請先輸入或辨識筆記文字。';
        return;
      }
      if (get('Rows').children.length && !confirm('重新產生紀錄會取代目前未儲存的預覽。繼續嗎？')) return;
      showRows(rows);
    });
    get('Add').addEventListener('click', () => {
      addRow();
      get('Rows').lastElementChild.querySelector('textarea').focus();
    });
    get('Review').addEventListener('submit', event => {
      event.preventDefault();
      commit();
    });
  }

  return { init };
})();
