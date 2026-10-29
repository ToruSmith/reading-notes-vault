/**
 * Sync.gs — P5：自動備份與公開內容同步到 GitHub（規劃書 7.1 階段二）
 *
 * 一、備份
 *  - 結構與前端 ZIP 完全相同（notes/、assets/、topics/、boards/、manifest.json），可直接用「備份 → 還原」匯入。
 *  - 一次做不完也沒關係：分「列出 → 分段讀取 → 壓縮」三段，狀態存在指令碼屬性，可由計時器接力。
 *  - 壓縮後會重新打開 ZIP 核對檔案數；只保留最近 N 份（預設 12）。
 *
 * 二、同步網站內容
 *  - 只推送「訪客看得到的內容」（與訪客呼叫同一段程式），私人內容不會離開 Drive。
 *  - 用 GitHub Git Data API：只送有變動的檔，一次提交；沒變動就不提交（不浪費 Cloudflare 的建置次數）。
 *  - token 只存在指令碼屬性，不會回傳到前端，也不會出現在任何錯誤訊息裡。
 */

var BACKUP_KEEP_DEFAULT_ = 12;
var BACKUP_READ_CHUNK_ = 40;
var BACKUP_BUDGET_MS_ = 150000; // 網頁呼叫一次最多做 2.5 分鐘；計時器接力時用 270000
var GH_CHUNK_ = 40;
var GH_REPO_RE_ = /^(?!\.)[A-Za-z0-9_.-]{1,100}\/(?!\.)[A-Za-z0-9_.-]{1,100}$/; // 不允許以 . 開頭（排除 ../）
var GH_BRANCH_RE_ = /^[A-Za-z0-9._\/-]{1,100}$/;
var GH_API_ = 'https://api.github.com';

function readJson_(text, fallback) {
  try {
    const v = JSON.parse(text);
    return v === null || v === undefined ? fallback : v;
  } catch (e) {
    return fallback;
  }
}
function stampOf_(iso) {
  return String(iso).slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
}

/* ═════════════ 備份 ═════════════ */

function pubJob_(job) {
  if (!job) return null;
  return {
    stage: job.stage,
    done: job.idx || 0,
    total: job.total || 0,
    stamp: job.stamp,
    error: job.error || '',
    result: job.result || null,
    missing: (job.missing || []).length,
    missingList: (job.missing || []).slice(0, 5).map(function (m, i) {
      return m + '：' + ((job.why || [])[i] || '');
    })
  };
}

function backupFileList_(store) {
  const items = [];
  store
    .getIndexRows()
    .sort(function (a, b) {
      return a.id < b.id ? -1 : 1;
    })
    .forEach(function (r) {
      items.push({ path: 'notes/' + r.id + '.md', fileId: r.driveFileId, id: r.id });
    });
  [
    ['assets', '.svg', 'assets/'],
    ['assets', '.img', 'assets/'],
    ['assets', '.html', 'assets/'],
    ['boards', '.json', 'boards/']
  ].forEach(function (g) {
    let cursor = null;
    do {
      const pg = store.listFilesPage(g[0], cursor, 100, g[1]);
      pg.files.forEach(function (f) {
        items.push({ path: g[2] + f.name, fileId: f.fileId, id: f.name });
      });
      cursor = pg.cursor;
    } while (cursor);
  });
  store.getTopics().forEach(function (t) {
    items.push({
      path: 'topics/' + t.id + '.json',
      id: t.id,
      text: JSON.stringify(
        {
          id: t.id,
          title: t.title,
          category: t.category || '',
          status: t.status || '',
          defaultPublic: t.defaultPublic === true
        },
        null,
        2
      )
    });
  });
  return items;
}

/** 做一小段備份（最多 budgetMs 毫秒）。fresh=true 時，若上一份已結束就開新的一份。 */
function backupStep_(store, budgetMs, fresh) {
  const t0 = store.nowMs();
  let job = readJson_(store.getProp('BACKUP_JOB'), null);
  const live = job && job.stage !== 'done' && job.stage !== 'failed';
  if (live && job.running && t0 - job.touchedMs < 10 * 60 * 1000)
    return { ok: true, busy: true, job: pubJob_(job) };
  if (!live) {
    if (!fresh && job) return { ok: true, job: pubJob_(job) };
    job = {
      stamp: stampOf_(store.now()),
      stage: 'list',
      idx: 0,
      total: 0,
      parts: 0,
      missing: [],
      counts: { notes: 0, assets: 0, topics: 0, boards: 0 }
    };
  }
  job.running = true;
  job.touchedMs = t0;
  const save = function () {
    job.touchedMs = store.nowMs();
    store.setProp('BACKUP_JOB', JSON.stringify(job));
  };
  const left = function () {
    return budgetMs - (store.nowMs() - t0);
  };
  try {
    if (job.stage === 'list') {
      const items = backupFileList_(store);
      job.itemsFile = store.createText(
        '_backup',
        'work-' + job.stamp + '-items.json',
        JSON.stringify(items)
      ).fileId;
      job.total = items.length;
      job.stage = 'read';
      save();
    }
    if (job.stage === 'read') {
      const items = readJson_(store.readText(job.itemsFile), []);
      while (job.idx < items.length && left() > 0) {
        const part = [],
          end = Math.min(items.length, job.idx + BACKUP_READ_CHUNK_);
        for (let i = job.idx; i < end; i++) {
          const it = items[i];
          try {
            const text = it.text !== undefined ? it.text : store.readText(it.fileId);
            part.push({ path: it.path, text: text });
            const kind = it.path.split('/')[0];
            job.counts[kind] = (job.counts[kind] || 0) + 1;
          } catch (e) {
            if (job.missing.length < 50) {
              job.missing.push(it.id || it.path);
              (job.why = job.why || []).push(String((e && e.message) || e).slice(0, 120));
            }
          }
          if (left() <= 0 && i + 1 < end) {
            job.idx = i + 1;
            break;
          }
          job.idx = i + 1;
        }
        job.parts++;
        store.createText('_backup', 'work-' + job.stamp + '-p' + job.parts + '.json', JSON.stringify(part));
        save();
      }
      if (job.idx >= items.length) {
        job.stage = 'zip';
        save();
      }
    }
    if (job.stage === 'zip' && left() > 0) {
      const files = [];
      for (let k = 1; k <= job.parts; k++) {
        const f = store.findFileByName('_backup', 'work-' + job.stamp + '-p' + k + '.json');
        if (!f) throw new Error('暫存檔遺失：第 ' + k + ' 段');
        readJson_(store.readText(f.fileId), []).forEach(function (x) {
          files.push(x);
        });
      }
      files.push({
        path: 'manifest.json',
        text: JSON.stringify(
          {
            format: 'vault-backup',
            version: 1,
            exportedAt: store.now(),
            counts: job.counts,
            missing: job.missing,
            auto: true
          },
          null,
          2
        )
      });
      const name = 'vault-backup-' + job.stamp + '.zip';
      const z = store.createZip('_backup', name, files);
      const v = store.verifyZip(
        z.fileId,
        files.map(function (x) {
          return x.path;
        })
      );
      if (!v.ok) {
        job.stage = 'failed';
        job.error = '備份檔核對失敗：預期 ' + files.length + ' 個檔案，實際 ' + v.count + ' 個';
        store.trash(z.fileId);
        save();
        return { ok: false, error: job.error, job: pubJob_(job) };
      }
      job.result = {
        name: name,
        fileId: z.fileId,
        size: z.size,
        counts: job.counts,
        missing: job.missing.length,
        missingList: job.missing.slice(0, 5).map(function (m, i) {
          return m + '：' + ((job.why || [])[i] || '');
        }),
        verified: true,
        at: store.now()
      };
      store.setProp('LAST_BACKUP', JSON.stringify(job.result));
      backupCleanup_(store, job);
      job.stage = 'done';
      save();
    }
  } catch (e) {
    job.stage = 'failed';
    job.error = String((e && e.message) || e).slice(0, 200);
    job.running = false;
    store.setProp('BACKUP_JOB', JSON.stringify(job));
    return { ok: false, error: '備份失敗：' + job.error, job: pubJob_(job) };
  }
  job.running = false;
  store.setProp('BACKUP_JOB', JSON.stringify(job));
  return { ok: true, job: pubJob_(job) };
}

/** 清掉暫存檔，並只保留最近 N 份備份。 */
function backupCleanup_(store, job) {
  const keep = Math.max(1, parseInt(store.config().BACKUP_KEEP, 10) || BACKUP_KEEP_DEFAULT_);
  store.listFolder('_backup').forEach(function (f) {
    if (f.name.indexOf('work-' + job.stamp + '-') === 0) store.trash(f.fileId);
  });
  const zips = store
    .listFolder('_backup')
    .filter(function (f) {
      return /^vault-backup-\d{8}-\d{6}\.zip$/.test(f.name);
    })
    .sort(function (a, b) {
      return a.name < b.name ? 1 : -1;
    });
  zips.slice(keep).forEach(function (f) {
    store.trash(f.fileId);
  });
}

function backupStatus_(store) {
  const zips = store
    .listFolder('_backup')
    .filter(function (f) {
      return /^vault-backup-\d{8}-\d{6}\.zip$/.test(f.name);
    })
    .sort(function (a, b) {
      return a.name < b.name ? 1 : -1;
    });
  return {
    ok: true,
    job: pubJob_(readJson_(store.getProp('BACKUP_JOB'), null)),
    last: readJson_(store.getProp('LAST_BACKUP'), null),
    backups: zips.map(function (f) {
      return {
        name: f.name,
        fileId: f.fileId,
        size: f.size,
        at: f.updatedAt,
        url: 'https://drive.google.com/file/d/' + f.fileId + '/view'
      };
    }),
    keep: Math.max(1, parseInt(store.config().BACKUP_KEEP, 10) || BACKUP_KEEP_DEFAULT_),
    monthly: store.triggerList().indexOf('scheduledBackup') >= 0
  };
}

function backupRun_(payload, store) {
  const r = backupStep_(store, BACKUP_BUDGET_MS_, payload.fresh === true);
  return r;
}

function triggerToggle_(payload, store, handler, spec) {
  if (payload.enable === true) store.triggerEnsure(handler, spec);
  else if (payload.enable === false) store.triggerRemove(handler);
  else return { ok: false, error: '內容不符規則', reasons: ['enable 必須是 true 或 false'] };
  return { ok: true, enabled: store.triggerList().indexOf(handler) >= 0 };
}

/** 計時器入口（由 Code.gs 的 scheduledBackup／backupContinue 呼叫）；做不完就排一個一分鐘後的接力。 */
function backupScheduled_(store, fresh) {
  const r = backupStep_(store, 270000, fresh);
  if (r.ok && !r.busy && r.job && r.job.stage !== 'done' && r.job.stage !== 'failed')
    store.scheduleOnce('backupContinue', 60000);
  return r;
}

/* ═════════════ 同步到 GitHub ═════════════ */

function ghConfig_(store) {
  const c = store.config(),
    repo = String(c.GITHUB_REPO || '').trim(),
    branch = String(c.GITHUB_BRANCH || 'main').trim();
  const dir = String(c.GITHUB_DIR || 'content')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  return {
    token: String(c.GITHUB_TOKEN || ''),
    repo: repo,
    branch: branch,
    dir: dir,
    ok:
      !!c.GITHUB_TOKEN &&
      GH_REPO_RE_.test(repo) &&
      GH_BRANCH_RE_.test(branch) &&
      /^[A-Za-z0-9._\/-]{1,60}$/.test(dir) &&
      dir.indexOf('..') < 0
  };
}

function gh_(store, cfg, method, path, body, accept) {
  if (path.indexOf('/repos/' + cfg.repo + '/') !== 0) throw new Error('不允許的路徑'); // 只能打自己設定的 repo
  const r = store.http({
    method: method,
    url: GH_API_ + path,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      Authorization: 'Bearer ' + cfg.token,
      Accept: accept || 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'vault-sync'
    }
  });
  return { code: r.code, text: r.body, json: readJson_(r.body, null) };
}

function ghError_(res, what) {
  const c = res.code;
  if (c === 401) return what + '：GitHub 不接受這個 token（可能過期或貼錯）';
  if (c === 403 || c === 429)
    return (
      what + '：GitHub 拒絕或限流（token 需要此 repo 的「Contents：Read and write」權限；若是限流請稍後再試）'
    );
  if (c === 404)
    return (
      what +
      '：找不到 repo 或分支（請確認 GITHUB_REPO、GITHUB_BRANCH，且 token 有權限存取這個私人 repo；repo 需已有至少一個提交）'
    );
  if (c === 409 || c === 422) return what + '：repo 內容在同步期間被改動，請再按一次';
  return what + '：GitHub 回應 ' + c;
}

/** 組出要放進 repo 的檔案（只有訪客看得到的內容）。prev 是 repo 上一份 manifest，用來略過沒變的筆記不重讀。 */
function buildSiteFiles_(store, prev, budgetMs) {
  const t0 = store.nowMs();
  const idx = listIndex_(false, store),
    tmap = topicMap_(store.getTopics()),
    rows = store.getIndexRows();
  const pubSet = publicIdSet_(rows, tmap);
  const sig = store.hash(
    idx.items
      .map(function (i) {
        return i.id + ':' + i.title + ':' + i.updatedAt;
      })
      .sort()
      .join('|') +
      '#' +
      idx.topics
        .map(function (t) {
          return t.id + ':' + t.title;
        })
        .sort()
        .join('|')
  );
  const same = prev && prev.sig === sig;
  const files = [],
    meta = { sig: sig, notes: {}, assets: {}, boards: {} };
  const reuse = function (path) {
    return same && prev.files && prev.files[path] ? prev.files[path] : null;
  };
  const add = function (path, text) {
    files.push({ path: path, text: text, hash: store.hash(text) });
  };
  const keep = function (path, hash) {
    files.push({ path: path, text: null, hash: hash });
  };

  add(
    'index.json',
    JSON.stringify({ items: idx.items, topics: idx.topics, order: readOrder_(store, idx.topics) })
  );
  idx.items.forEach(function (it) {
    if (store.nowMs() - t0 > budgetMs)
      throw new Error('公開內容太多，這次來不及全部讀完；請再按一次（沒變動的筆記會略過）');
    const path = 'notes/' + it.id + '.json',
      old = reuse(path);
    meta.notes[it.id] = it.updatedAt;
    if (old && prev.notes && prev.notes[it.id] === it.updatedAt) {
      keep(path, old);
      return;
    }
    const n = getNote_({ id: it.id }, false, store);
    if (n.ok) add(path, JSON.stringify({ meta: n.meta, body: n.body }));
  });
  let cursor = null;
  do {
    const pg = store.listFilesPage('assets', cursor, 100, '.svg');
    pg.files.forEach(function (f) {
      const id = f.name.replace(/\.svg$/, '');
      if (!ID_RE.test(id)) return;
      if (!isSvgPublic_(id, rows, pubSet, store)) return;
      const path = 'assets/' + id + '.svg',
        old = reuse(path);
      meta.assets[id] = f.updatedAt;
      if (old && prev.assets && prev.assets[id] === f.updatedAt) {
        keep(path, old);
        return;
      }
      const s = getSvg_({ id: id }, false, store);
      if (s.ok) add(path, s.svg);
    });
    cursor = pg.cursor;
  } while (cursor);
  idx.topics.forEach(function (t) {
    const bf = store.findFileByName('boards', t.id + '.canvas.json');
    if (!bf) return;
    const path = 'boards/' + t.id + '.json',
      old = reuse(path);
    meta.boards[t.id] = bf.updatedAt;
    if (old && prev.boards && prev.boards[t.id] === bf.updatedAt) {
      keep(path, old);
      return;
    }
    const b = getBoard_({ topic: t.id }, false, store);
    if (b.ok && b.updatedAt) add(path, JSON.stringify(b.board));
  });
  add(
    'site-meta.json',
    JSON.stringify({
      format: 'vault-site',
      version: 1,
      counts: { notes: idx.items.length, topics: idx.topics.length }
    })
  );
  return { files: files, meta: meta };
}

function siteStatus_(store) {
  const g = ghConfig_(store),
    idx = listIndex_(false, store);
  return {
    ok: true,
    configured: {
      token: !!g.token,
      repo: GH_REPO_RE_.test(g.repo),
      branch: GH_BRANCH_RE_.test(g.branch),
      ready: g.ok
    },
    repo: GH_REPO_RE_.test(g.repo) ? g.repo : '',
    branch: g.branch,
    dir: g.dir,
    publicNotes: idx.items.length,
    last: readJson_(store.getProp('LAST_SYNC'), null),
    daily: store.triggerList().indexOf('scheduledSync') >= 0
  };
}

/** 同步：dryRun 只算差異；force 忽略 repo 上的 manifest，整份重送。 */
function syncSite_(payload, store) {
  const g = ghConfig_(store);
  if (!g.ok)
    return {
      ok: false,
      error: '尚未設定 GitHub',
      reasons: ['請在指令碼屬性設定 GITHUB_TOKEN 與 GITHUB_REPO（格式 owner/repo）；GITHUB_BRANCH 預設 main']
    };
  try {
    const base = '/repos/' + g.repo;
    const ref = gh_(store, g, 'GET', base + '/git/ref/heads/' + g.branch);
    if (ref.code !== 200 || !ref.json || !ref.json.object)
      return { ok: false, error: ghError_(ref, '讀取分支') };
    const headSha = ref.json.object.sha;
    const head = gh_(store, g, 'GET', base + '/git/commits/' + headSha);
    if (head.code !== 200 || !head.json) return { ok: false, error: ghError_(head, '讀取提交') };
    let prev = null;
    if (payload.force !== true) {
      const mf = gh_(
        store,
        g,
        'GET',
        base + '/contents/' + g.dir + '/manifest.json?ref=' + encodeURIComponent(g.branch),
        undefined,
        'application/vnd.github.raw+json'
      );
      if (mf.code === 200) prev = readJson_(mf.text, null);
      else if (mf.code !== 404) return { ok: false, error: ghError_(mf, '讀取同步清單') };
    }
    const built = buildSiteFiles_(store, prev, 240000);
    const hashes = {};
    built.files.forEach(function (f) {
      hashes[f.path] = f.hash;
    });
    const manifest = Object.assign({ format: 'vault-site', version: 1 }, built.meta, { files: hashes });
    const manText = JSON.stringify(manifest, null, 1);
    const old = prev && prev.files ? prev.files : {};
    const changed = built.files.filter(function (f) {
      return f.text !== null && old[f.path] !== f.hash;
    });
    const removed = Object.keys(old).filter(function (p) {
      return hashes[p] === undefined;
    });
    const manChanged = !prev || JSON.stringify(prev) !== JSON.stringify(manifest);
    const summary = {
      added: changed.filter(function (f) {
        return old[f.path] === undefined;
      }).length,
      updated: changed.filter(function (f) {
        return old[f.path] !== undefined;
      }).length,
      removed: removed.length,
      unchanged: built.files.length - changed.length
    };
    if (!changed.length && !removed.length && !manChanged) {
      const out = { ok: true, unchanged: true, summary: summary, at: store.now() };
      if (payload.dryRun !== true)
        store.setProp('LAST_SYNC', JSON.stringify({ at: out.at, unchanged: true, summary: summary }));
      return out;
    }
    if (payload.dryRun === true)
      return {
        ok: true,
        dryRun: true,
        summary: summary,
        paths: changed
          .map(function (f) {
            return f.path;
          })
          .slice(0, 50),
        removed: removed.slice(0, 50)
      };

    const entries = changed
      .map(function (f) {
        return { path: g.dir + '/' + f.path, mode: '100644', type: 'blob', content: f.text };
      })
      .concat(
        removed.map(function (p) {
          return { path: g.dir + '/' + p, mode: '100644', type: 'blob', sha: null };
        })
      );
    entries.push({ path: g.dir + '/manifest.json', mode: '100644', type: 'blob', content: manText });
    let treeSha = head.json.tree.sha;
    for (let i = 0; i < entries.length; i += GH_CHUNK_) {
      const t = gh_(store, g, 'POST', base + '/git/trees', {
        base_tree: treeSha,
        tree: entries.slice(i, i + GH_CHUNK_)
      });
      if (t.code !== 201 || !t.json) return { ok: false, error: ghError_(t, '建立檔案樹') };
      treeSha = t.json.sha;
    }
    const msg =
      '同步公開內容：新增 ' + summary.added + '、更新 ' + summary.updated + '、刪除 ' + summary.removed;
    const c = gh_(store, g, 'POST', base + '/git/commits', {
      message: msg,
      tree: treeSha,
      parents: [headSha]
    });
    if (c.code !== 201 || !c.json) return { ok: false, error: ghError_(c, '建立提交') };
    const u = gh_(store, g, 'PATCH', base + '/git/refs/heads/' + g.branch, { sha: c.json.sha, force: false });
    if (u.code !== 200) return { ok: false, error: ghError_(u, '更新分支') };
    const out = {
      ok: true,
      summary: summary,
      commit: c.json.sha,
      url: 'https://github.com/' + g.repo + '/commit/' + c.json.sha,
      at: store.now()
    };
    store.setProp(
      'LAST_SYNC',
      JSON.stringify({ at: out.at, commit: out.commit, summary: summary, url: out.url })
    );
    return out;
  } catch (e) {
    return {
      ok: false,
      error:
        '同步失敗：' +
        String((e && e.message) || e)
          .replace(/Bearer\s+\S+/g, '')
          .slice(0, 200)
    };
  }
}
