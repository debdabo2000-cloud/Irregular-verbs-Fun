const StudentOverview = (() => {
  const get = id => document.getElementById('overview' + id);
  const canonical = value => String(value ?? '').normalize('NFKC').trim().toLowerCase();
  const labels = { assigned: '已指派', practiced: '已練習', review: '需複習', memorized: '已記熟' };

  function match(record, student, group, allowClass) {
    if (record.studentId) return record.studentId === student.id ? 'student' : '';
    if (record.classId && record.classId !== student.classId) return '';
    const name = canonical(record.studentName || record.targetName || record.target);
    if (!name) return '';
    const candidates = db.students.filter(person => canonical(person.name) === name &&
      (!record.classId || person.classId === record.classId));
    if (candidates.length) return candidates.length === 1 && candidates[0].id === student.id ? 'student' : '';
    if (allowClass && group && name === canonical(group.name) &&
        (record.classId === group.id || db.classes.filter(item => canonical(item.name) === name).length === 1)) {
      return 'class';
    }
    return '';
  }

  function sections(student, group) {
    const row = (title, ...details) => ({ title: String(title ?? '（未填寫）'), detail: details.filter(Boolean).join(' · ') });
    const sections = [
      ['教學內容', 'lessons', true, item => row(item.topic, item.date, item.version)],
      ['功課追蹤', 'homeworks', true, item => row(item.title, item.status, item.type, item.startDate && '指派 ' + item.startDate, item.due && '到期 ' + item.due)],
      ['錯題追蹤', 'mistakes', false, item => row(item.content, item.point, item.status, item.date)],
      ['成績與補考', 'exams', false, item => row(item.title, item.date, item.score != null && item.score !== '' && '成績 ' + item.score, item.status)],
      ['應做事項', 'todos', true, item => row(item.text, item.date, item.tag, item.done ? '已完成' : '待完成')],
      ['課程計畫', 'plans', true, item => row(item.content, item.date)],
      ['收費紀錄', 'billings', false, item => row(item.note || '收費', item.paid ? '已繳費' : '未繳費',
        item.rate != null && item.count != null && `${item.rate} × ${item.count} = ${item.rate * item.count}`)],
      ['請假與補課', 'makeups', false, item => row(item.reason || '補課', item.date, item.status)],
      ['教材', 'materials', true, item => row(item.title || item.name || item.content, item.date, item.note, item.url)],
    ].map(([label, key, allowClass, format]) => [label, db[key].flatMap(record => {
      if (!record) return [];
      const scope = match(record, student, group, allowClass);
      if (!scope) return [];
      const entry = format(record);
      if (scope === 'class') entry.detail = ['全班', entry.detail].filter(Boolean).join(' · ');
      return [entry];
    })]);

    const progress = db.vocabularyProgress[student.id] || {};
    const known = new Set();
    const words = db.vocabularyLists.filter(list => list.classId === student.classId).map(list => {
      const unique = new Map(VocabularyProgress.questions(list).map(word => [VocabularyProgress.wordKey(word), word]));
      const entries = [];
      let memorized = 0;
      for (const [key, word] of unique) {
        known.add(key);
        const title = word.type === 'double' ? [word.base, word.past, word.pp].join(' / ') : word.word;
        const status = VocabularyProgress.status(progress[key]);
        if (status === 'memorized') memorized++;
        entries.push(row(title, word.cn, labels[status]));
      }
      return { ...row(list.name, `已記熟 ${memorized} / ${entries.length}`), entries };
    });
    for (const [key, record] of Object.entries(progress)) {
      if (known.has(key)) continue;
      try {
        const parts = JSON.parse(key);
        if (Array.isArray(parts) && parts.length >= 2 && parts.every(part => typeof part === 'string')) {
          words.push(row(parts.slice(0, -1).join(' / '), parts.at(-1), labels[VocabularyProgress.status(record)], '過往進度'));
        }
      } catch {
        // Older backups may have unrecognized progress keys.
      }
    }
    return [...sections, ['單字與背誦進度', words]];
  }

  function replaceOptions(select, entries, prompt) {
    const previous = select.value;
    const options = [new Option(prompt, ''), ...entries];
    select.replaceChildren(...options);
    if (options.some(option => option.value === previous)) select.value = previous;
  }

  function render() {
    const classSelect = get('Class');
    const studentSelect = get('Student');
    replaceOptions(classSelect, db.classes.map(group => new Option(group.name, group.id)), '全部班級');
    const students = db.students.filter(student => !classSelect.value || student.classId === classSelect.value);
    replaceOptions(studentSelect, students.map(student => {
      const group = db.classes.find(item => item.id === student.classId);
      return new Option([student.name, group?.name].filter(Boolean).join(' · '), student.id);
    }), '請選擇學生');
    const student = students.find(item => item.id === studentSelect.value);
    get('Download').hidden = !student;
    get('Results').replaceChildren();
    get('Status').textContent = student ? '已依學生 ID 或可唯一辨識的姓名整理紀錄；全班紀錄會標示「全班」。'
      : students.length ? '選擇學生後，即可查看各區紀錄。' : '這個篩選範圍沒有學生，可先到「名單/安全」新增。';
    if (!student) return;
    const group = db.classes.find(item => item.id === student.classId);
    const fragment = document.createDocumentFragment();
    for (const [label, records] of sections(student, group)) {
      const card = document.createElement('section');
      card.className = 'card';
      const heading = document.createElement('h2');
      heading.textContent = `${label}（${records.length}）`;
      card.append(heading);
      if (!records.length) {
        const empty = document.createElement('p');
        empty.textContent = '目前沒有紀錄。';
        card.append(empty);
      }
      for (const record of records) {
        const item = document.createElement(record.entries ? 'details' : 'div');
        item.className = 'list-item';
        if (record.entries) item.style.display = 'block';
        const summary = document.createElement(record.entries ? 'summary' : 'span');
        summary.textContent = [record.title, record.detail].filter(Boolean).join(' · ');
        item.append(summary);
        if (record.entries) {
          const list = document.createElement('ul');
          for (const entry of record.entries) {
            const text = document.createElement('li');
            text.textContent = [entry.title, entry.detail].filter(Boolean).join(' · ');
            list.append(text);
          }
          item.append(list);
        }
        card.append(item);
      }
      fragment.append(card);
    }
    get('Results').append(fragment);
  }

  function download() {
    const student = db.students.find(item => item.id === get('Student').value);
    if (!student) return;
    const group = db.classes.find(item => item.id === student.classId);
    const lines = [[student.name, group?.name].filter(Boolean).join(' · ')];
    for (const [label, records] of sections(student, group)) {
      lines.push('', label);
      for (const record of records) {
        lines.push([record.title, record.detail].filter(Boolean).join(' · '));
        for (const entry of record.entries || []) {
          lines.push('  ' + [entry.title, entry.detail].filter(Boolean).join(' · '));
        }
      }
      if (!records.length) lines.push('目前沒有紀錄。');
    }
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = student.name + '－學生紀錄.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function init() {
    get('Class').addEventListener('change', render);
    get('Student').addEventListener('change', render);
    get('Download').addEventListener('click', download);
  }

  return { init, render };
})();
