const VocabularyWorkbench = (() => {
  const labels = {
    assigned: '已指派',
    practiced: '已練習',
    review: '需複習',
    memorized: '已記熟'
  };
  const get = id => document.getElementById('vocab' + id);
  let photoURL;
  let page = 0;
  let editingId;
  const pageSize = 30;

  function options(select, entries, first) {
    const previous = select.value;
    const choices = first ? [new Option(first, ''), ...entries] : entries;
    select.replaceChildren(...choices);
    if (choices.some(option => option.value === previous)) select.value = previous;
  }

  function wordTitle(word) {
    return word.type === 'double' ? [word.base, word.past, word.pp].join(' / ') : word.word;
  }

  function render() {
    options(get('Class'), db.classes.map(item => new Option(item.name, item.id)));
    const classId = get('Class').value;
    const lists = db.vocabularyLists.filter(item => item.classId === classId);
    const students = db.students.filter(item => item.classId === classId);
    options(get('List'), lists.map(item => new Option(item.name, item.id)));
    options(get('Student'), students.map(item => new Option(item.name, item.id)), '全班');
    const list = lists.find(item => item.id === get('List').value);
    const student = students.find(item => item.id === get('Student').value);
    const words = list ? VocabularyProgress.questions(list) : [];
    const unique = new Map(words.map(word => [VocabularyProgress.wordKey(word), word]));
    const audience = student ? [student] : students;
    const rows = Array.from(unique, ([key, word]) => {
      const records = audience.map(member => db.vocabularyProgress[member.id]?.[key]);
      const count = records.filter(record => VocabularyProgress.status(record) === 'memorized').length;
      return { key, word, count, record: records[0] };
    });
    const completed = rows.filter(row => audience.length && row.count === audience.length).length;
    get('Summary').textContent = !list ? '請先為這個班級指派單字清單。'
      : !audience.length ? '請先在「名單/安全」為這個班級新增學生。'
      : student ? `已記熟 ${completed} / ${rows.length} 個單字`
      : `${audience.length} 位學生 · 全班已記熟 ${completed} / ${rows.length} 個單字`;
    get('Quiz').hidden = !student || !words.length;
    get('Edit').hidden = !list || Boolean(list.catalog);
    const filter = get('Filter').value;
    const visible = rows.filter(row => {
      const memorized = audience.length > 0 && row.count === audience.length;
      return filter === 'all' || (filter === 'memorized' ? memorized : !memorized);
    });
    page = Math.min(page, Math.max(0, Math.ceil(visible.length / pageSize) - 1));

    const results = get('Results');
    results.replaceChildren();
    for (const row of visible.slice(page * pageSize, (page + 1) * pageSize)) {
      const item = document.createElement('div');
      item.className = 'list-item';
      const info = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = wordTitle(row.word);
      const detail = document.createElement('div');
      const summary = student ? labels[VocabularyProgress.status(row.record)]
        : `${row.count} / ${audience.length} 人已記熟`;
      const quizResult = { correct: '獨立答對', aided: '提示後答對', incorrect: '答錯或超時' }[row.record?.quiz];
      detail.textContent = [row.word.cn, summary, student && quizResult && `最近測驗：${quizResult}`]
        .filter(Boolean).join(' · ');
      info.append(title, detail);
      item.append(info);
      if (student) {
        const manual = document.createElement('select');
        manual.style.width = 'auto';
        manual.setAttribute('aria-label', `${title.textContent} 的教師判定`);
        manual.append(new Option('依測驗結果', ''), new Option('標為已記熟', 'memorized'),
          new Option('標為需複習', 'review'));
        manual.value = row.record?.manual || '';
        manual.addEventListener('change', () => {
          const latest = normalizeDB(VocabularyProgress.readDB());
          db.vocabularyProgress = latest.vocabularyProgress;
          const records = db.vocabularyProgress[student.id] ??= {};
          const record = records[row.key] ??= {};
          if (manual.value) record.manual = manual.value;
          else delete record.manual;
          if (!record.quiz && !record.manual) delete records[row.key];
          saveDB();
          render();
        });
        item.append(manual);
      }
      results.append(item);
    }
    if (visible.length > pageSize) {
      for (const [label, step, disabled] of [
        ['上一頁', -1, page === 0],
        ['下一頁', 1, (page + 1) * pageSize >= visible.length]
      ]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.disabled = disabled;
        button.addEventListener('click', () => {
          page += step;
          render();
          get('Filter').focus();
        });
        results.append(button);
      }
    }
    if (rows.length && !visible.length) results.textContent = '沒有符合目前篩選的單字。';
  }

  function addList(list) {
    const classId = get('Class').value;
    if (!classId) return false;
    const existing = list.catalog && db.vocabularyLists.find(item => item.classId === classId && item.catalog === list.catalog);
    const id = existing?.id || crypto.randomUUID();
    if (!existing) db.vocabularyLists.push({ ...list, id, classId });
    page = 0;
    saveDB();
    render();
    get('List').value = id;
    render();
    return true;
  }

  function preview() {
    const { words, invalid } = VocabularyProgress.parseWords(get('Text').value);
    get('Text').setCustomValidity(invalid.length ? `請修正第 ${invalid.join('、')} 行。`
      : words.length ? '' : '請輸入至少一筆單字。');
    get('ImportStatus').textContent = invalid.length ? `請修正第 ${invalid.join('、')} 行。`
      : words.length ? `已辨識 ${words.length} 筆，可檢查後儲存。` : '';
    get('Preview').replaceChildren(...words.slice(0, 8).map(word => {
      const item = document.createElement('li');
      item.textContent = `${wordTitle(word)} · ${word.cn}`;
      return item;
    }));
    return words;
  }

  async function scanPhoto() {
    const photo = get('Photo').files[0];
    if (!photo) {
      get('ImportStatus').textContent = '請先選擇一張照片。';
      return;
    }
    const controls = ['Scan', 'Photo', 'Save', 'Text', 'Edit', 'CancelEdit'].map(get);
    controls.forEach(control => control.disabled = true);
    get('ImportStatus').textContent = '正在載入英文及繁體中文辨識工具…';
    try {
      const text = await WorkbenchOCR.read(photo, percent => {
        get('ImportStatus').textContent = `辨識照片中 ${percent}%`;
      });
      get('Text').value = text;
      preview();
      if (!text) get('ImportStatus').textContent = '沒有辨識到文字，請試試清晰的照片或手動輸入。';
    } catch {
      get('ImportStatus').textContent = '辨識失敗。請確認網路連線、試另一張照片，或手動輸入。';
    } finally {
      controls.forEach(control => control.disabled = false);
    }
  }

  function resetImport() {
    editingId = undefined;
    get('Text').value = '';
    get('Name').value = '';
    get('Editing').hidden = true;
    get('CancelEdit').hidden = true;
    get('Save').textContent = '儲存並指派給選取的班級';
    get('Photo').value = '';
    get('Photo').dispatchEvent(new Event('change'));
    preview();
  }

  function restoreSelection() {
    const quiz = VocabularyProgress.loadQuiz();
    if (!quiz) return;
    get('Class').value = quiz.list.classId;
    render();
    get('List').value = quiz.list.id;
    get('Student').value = quiz.student.id;
    render();
  }

  function init() {
    options(get('Catalog'), Object.keys(vocabularyCatalog).map(key => new Option(vocabularyCatalogNames[key] || key, key)));
    for (const id of ['Class', 'List', 'Student', 'Filter']) {
      get(id).addEventListener('change', () => {
        page = 0;
        render();
      });
    }
    get('Quiz').addEventListener('click', () => VocabularyProgress.launchQuiz(get('Student').value, get('List').value));
    get('Edit').addEventListener('click', () => {
      const list = db.vocabularyLists.find(item => item.id === get('List').value);
      if (!list || list.catalog) return;
      resetImport();
      editingId = list.id;
      get('Name').value = list.name;
      get('Text').value = list.words.map(word => (
        word.type === 'double' ? [word.base, word.past, word.pp, word.cn] : [word.word, word.cn]
      ).join(' | ')).join('\n');
      get('Editing').textContent = `正在編輯「${list.name}」`;
      get('Editing').hidden = false;
      get('CancelEdit').hidden = false;
      get('Save').textContent = '更新這份單字清單';
      preview();
      get('Name').focus();
    });
    get('CancelEdit').addEventListener('click', resetImport);
    get('Assign').addEventListener('submit', event => {
      event.preventDefault();
      const catalog = get('Catalog').value;
      addList({ name: vocabularyCatalogNames[catalog] || catalog, catalog });
    });
    get('Photo').addEventListener('change', () => {
      if (photoURL) URL.revokeObjectURL(photoURL);
      photoURL = undefined;
      const photo = get('Photo').files[0];
      const image = get('PhotoPreview');
      image.hidden = !photo;
      if (photo) {
        photoURL = URL.createObjectURL(photo);
        image.src = photoURL;
      } else {
        image.removeAttribute('src');
      }
    });
    get('Scan').addEventListener('click', scanPhoto);
    get('Text').addEventListener('input', preview);
    get('Import').addEventListener('submit', event => {
      event.preventDefault();
      const words = preview();
      const name = get('Name').value.trim();
      if (!get('Text').checkValidity() || !name) return;
      if (editingId) {
        const list = db.vocabularyLists.find(item => item.id === editingId);
        if (!list) {
          get('ImportStatus').textContent = '找不到這份清單，請重新選取。';
          return;
        }
        Object.assign(list, { name, words });
        saveDB();
        render();
      } else if (!addList({ name, words })) {
        return;
      }
      resetImport();
      get('ImportStatus').textContent = `已儲存「${name}」，共 ${words.length} 筆。`;
    });
  }

  return { init, render, restoreSelection };
})();
