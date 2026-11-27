const WorkbenchSync = (() => {
  const { url, publishableKey } = WorkbenchSyncConfig;
  const configured = Boolean(url && publishableKey);
  const stateKey = 'dl_workbench_sync_base';
  const get = id => document.getElementById('sync' + id);
  let client;
  let user;
  let busy = false;
  let pending;
  let timer;
  let previewRequested = false;

  function shared(data) {
    const { pin, ...snapshot } = data;
    return snapshot;
  }

  function equal(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equal(a[key], b[key]));
  }

  function merge(base, local, remote, preference, path = [], conflicts = []) {
    if (equal(local, remote)) return local;
    if (equal(base, local)) return remote;
    if (equal(base, remote)) return local;
    const values = [base, local, remote].filter(value => value !== undefined);
    if (Array.isArray(local) && Array.isArray(remote) &&
        values.every(value => Array.isArray(value) && value.every(item => typeof item?.id === 'string'))) {
      const byId = value => Object.fromEntries((value || []).map(item => [item.id, item]));
      const records = merge(byId(base), byId(local), byId(remote), preference, path, conflicts);
      return Object.values(records);
    }
    if (local && remote && values.every(value => value && typeof value === 'object' && !Array.isArray(value))) {
      const keys = new Set([...Object.keys(remote), ...Object.keys(local)]);
      const entries = [];
      for (const key of keys) {
        const value = merge(base && Object.hasOwn(base, key) ? base[key] : undefined,
          Object.hasOwn(local, key) ? local[key] : undefined, Object.hasOwn(remote, key) ? remote[key] : undefined,
          preference, [...path, key], conflicts);
        if (value !== undefined) entries.push([key, value]);
      }
      return Object.fromEntries(entries);
    }
    conflicts.push(path[0] || 'workbench');
    return preference === 'local' ? local : remote;
  }

  function readBase() {
    try {
      return JSON.parse(localStorage.getItem(stateKey) || 'null');
    } catch {
      return null;
    }
  }

  function status(text) {
    get('Status').textContent = text;
  }

  function queue() {
    if (!user || !readBase() || previewRequested) return;
    clearTimeout(timer);
    timer = setTimeout(() => synchronize(), 800);
  }

  async function synchronize(confirm = false, interactive = false) {
    if (!user || busy || (!interactive && previewRequested)) return;
    const account = user;
    busy = true;
    try {
      const previous = readBase();
      if (previous && previous.userId !== account.id) {
        status('此瀏覽器的工作台已連接其他帳號。請用原帳號登入，或在另一個瀏覽器設定檔使用新帳號。');
        return;
      }
      const { data: remote, error } = await client.from('workbench_snapshots')
        .select('revision,data').eq('user_id', account.id).maybeSingle();
      if (error) throw error;
      if (account !== user) return;
      const current = normalizeDB(VocabularyProgress.readDB());
      const local = shared(current);
      const conflicts = [];
      const data = remote ? merge(previous?.data, local, remote.data, get('Preference').value, [], conflicts) : local;
      const needsReview = !previous || conflicts.length > 0;
      const unchanged = pending && pending.revision === (remote?.revision ?? 0) && equal(pending.local, local);
      if (needsReview && !(confirm && unchanged)) {
        pending = { revision: remote?.revision ?? 0, local };
        previewRequested = true;
        get('Preview').hidden = false;
        get('Choice').hidden = !conflicts.length;
        if (conflicts.length && !unchanged) get('Preference').value = '';
        const total = snapshot => Object.values(snapshot || {}).filter(Array.isArray).reduce((sum, records) => sum + records.length, 0);
        const names = { classes: '班級', students: '學生', lessons: '教學內容', homeworks: '功課', todos: '待辦',
          vocabularyLists: '單字清單', vocabularyProgress: '單字進度', exams: '成績', billings: '收費' };
        status(`此裝置有 ${total(local)} 筆清單紀錄，雲端有 ${total(remote?.data)} 筆。可合併互不衝突的紀錄。` +
          (conflicts.length ? `有衝突的欄位：${[...new Set(conflicts)].map(key => names[key] || key).join('、')}。` : ''));
        return;
      }
      if (conflicts.length && !get('Preference').value) {
        status('請選擇衝突時要保留的版本。');
        return;
      }

      if (!remote || !equal(data, remote.data)) {
        const table = client.from('workbench_snapshots');
        const write = remote
          ? table.update({ data, revision: remote.revision + 1 }).eq('user_id', account.id).eq('revision', remote.revision)
          : table.insert({ user_id: account.id, data });
        const result = await write.select('revision').maybeSingle();
        if (result.error?.code === '23505' || (!result.error && !result.data)) {
          pending = undefined;
          status('另一台裝置同時儲存了紀錄。請重新同步以合併最新資料。');
          return;
        }
        if (result.error) throw result.error;
      }
      if (account !== user) return;

      // Keep edits made while the cloud write was in flight for the next sync.
      const latest = normalizeDB(VocabularyProgress.readDB());
      const merged = merge(local, shared(latest), data, 'local');
      if (!equal(shared(latest), merged)) {
        const next = normalizeDB({ ...merged, pin: latest.pin });
        VocabularyProgress.writeDB(next);
        db = next;
        renderAll(false);
      }
      localStorage.setItem(stateKey, JSON.stringify({ userId: account.id, data }));
      pending = undefined;
      previewRequested = false;
      get('Preview').hidden = true;
      get('Preference').value = '';
      status('已同步 · ' + new Date().toLocaleString('zh-TW'));
      if (!equal(merged, data)) queue();
    } catch {
      status('暫時無法同步。紀錄仍保留在此瀏覽器，請稍後重試。');
    } finally {
      busy = false;
    }
  }

  function setUser(next) {
    if (next?.id !== user?.id) {
      user = next;
      pending = undefined;
      previewRequested = false;
      get('Preview').hidden = true;
      get('Preference').value = '';
    }
    get('Login').hidden = Boolean(user);
    get('Connected').hidden = !user;
    if (user) {
      get('Account').textContent = user.email;
      setTimeout(() => synchronize(), 0);
    } else {
      status('請在兩台裝置使用同一個電子郵件登入。');
    }
  }

  async function init() {
    if (!configured) return;
    try {
      const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.86.0/+esm');
      client = createClient(url, publishableKey, { auth: { storageKey: 'dl_workbench_supabase_auth' } });
      client.auth.onAuthStateChange((_event, session) => setUser(session?.user));
      get('Login').addEventListener('submit', async event => {
        event.preventDefault();
        get('Send').disabled = true;
        try {
          const redirect = new URL(location.pathname, location.origin);
          redirect.searchParams.set('sync', '1');
          const { error } = await client.auth.signInWithOtp({
            email: get('Email').value.trim(),
            options: { emailRedirectTo: redirect.href }
          });
          status(error ? '目前無法寄出登入連結。請確認地址或稍後再試。' : '登入連結已寄出。請在這台裝置的瀏覽器開啟連結。');
        } catch {
          status('目前無法寄出登入連結。請稍後再試。');
        } finally {
          get('Send').disabled = false;
        }
      });
      get('Logout').addEventListener('click', async () => {
        const { error } = await client.auth.signOut({ scope: 'local' });
        if (error) status('無法登出，請稍後重試。');
      });
      get('Now').addEventListener('click', () => synchronize(false, true));
      get('Confirm').addEventListener('click', () => synchronize(true, true));
      window.addEventListener('workbench-data-saved', queue);
      window.addEventListener('storage', event => {
        if (event.key === VocabularyProgress.storageKey) queue();
      });
      window.addEventListener('online', queue);
      window.addEventListener('focus', queue);
      setInterval(() => { if (!document.hidden) queue(); }, 20000);
    } catch {
      status('無法載入同步服務。請稍後重新開啟工作台。');
    }
  }

  return { init };
})();
