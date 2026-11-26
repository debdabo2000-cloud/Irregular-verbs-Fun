const VocabularyProgress = (() => {
  const storageKey = 'dl_english_workbench_v1';
  const legacyKey = 'dl_workbench_data';
  const quizKey = 'dl_vocabulary_quiz';

  function questions(list) {
    const entries = list.catalog ? vocabularyCatalog[list.catalog] : list.words;
    return Array.isArray(entries) ? entries : [];
  }

  function wordKey(word) {
    const forms = word.type === 'double' ? [word.base, word.past, word.pp] : [word.word];
    return JSON.stringify([...forms.map(form => form.trim().toLowerCase()), word.cn.trim()]);
  }

  function readDB() {
    return JSON.parse(localStorage.getItem(storageKey) || localStorage.getItem(legacyKey) || '{}');
  }

  function writeDB(db) {
    const serialized = JSON.stringify(db);
    localStorage.setItem(storageKey, serialized);
    localStorage.setItem(legacyKey, serialized);
  }

  function loadQuiz() {
    try {
      const { studentId, listId } = JSON.parse(sessionStorage.getItem(quizKey) || '{}');
      const db = readDB();
      const student = db.students?.find(item => item.id === studentId);
      const list = db.vocabularyLists?.find(item => item.id === listId);
      if (!student || !list || student.classId !== list.classId) return null;
      const records = db.vocabularyProgress?.[student.id] || {};
      return { student, list, records };
    } catch {
      return null;
    }
  }

  function launchQuiz(studentId, listId) {
    sessionStorage.setItem(quizKey, JSON.stringify({ studentId, listId }));
    location.href = 'index.html#tracked-quiz';
  }

  function saveQuiz(quiz, answers) {
    try {
      const db = readDB();
      const student = db.students?.find(item => item.id === quiz.student.id);
      const list = db.vocabularyLists?.find(item => item.id === quiz.list.id);
      if (!student || !list || student.classId !== list.classId) return false;
      db.vocabularyProgress ??= {};
      const validWords = new Set(questions(list).map(wordKey));
      const records = db.vocabularyProgress[student.id] ??= {};
      for (const { word, result } of answers) {
        if (!validWords.has(word)) continue;
        const record = records[word] ??= {};
        record.quiz = result;
      }
      writeDB(db);
      return true;
    } catch {
      return false;
    }
  }

  function status(record) {
    if (record?.manual) return record.manual;
    return { correct: 'memorized', aided: 'practiced', incorrect: 'review' }[record?.quiz] || 'assigned';
  }

  function parseWords(text) {
    const words = [];
    const invalid = [];
    const seen = new Set();
    for (const [index, raw] of text.split(/\r?\n/).entries()) {
      const line = raw.trim().replace(/(?<=\p{Script=Han})\s+(?=\p{Script=Han})/gu, '');
      if (!line) continue;
      const separator = line.includes('|') ? '|' : line.includes('\t') ? '\t' : /[,，]/;
      let fields = line.split(separator).map(field => field.trim());
      if (fields.length === 1) {
        // A printed table often comes back as English columns followed by a Chinese gloss.
        const match = line.match(/^(.+?)\s+([\p{Script=Han}].*)$/u);
        if (match) {
          const english = match[1].replace(/^\d+[.)、]?\s+/, '');
          const forms = english.split(/\s+/);
          fields = [...(forms.length === 3 ? forms : [english]), match[2]];
        }
      }
      const english = /^[a-z][a-z .’'/-]*$/i;
      if (![2, 4].includes(fields.length) || !fields.at(-1) ||
          !fields.slice(0, -1).every(field => english.test(field)) ||
          /^(中文|意思|翻譯|meaning)$/i.test(fields.at(-1))) {
        invalid.push(index + 1);
        continue;
      }
      const word = fields.length === 4
        ? { base: fields[0], past: fields[1], pp: fields[2], cn: fields[3], type: 'double' }
        : { word: fields[0], cn: fields[1] };
      const key = wordKey(word);
      if (!seen.has(key)) words.push(word);
      seen.add(key);
    }
    return { words, invalid };
  }

  return { storageKey, readDB, writeDB, questions, wordKey, loadQuiz, launchQuiz, saveQuiz, status, parseWords };
})();
