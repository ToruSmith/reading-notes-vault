/**
 * search.js — 擁有者的全文搜尋索引
 * 記憶體＋瀏覽器 IndexedDB 快取（P3）：下次開啟時先從本機讀回，再只補抓「updatedAt 與索引不同」的筆記，
 * 不必每次重讀全部內文。快取只存在這個瀏覽器、只在擁有者身分下建立；以訪客身分載入時會清掉。
 * IndexedDB 不可用（私密視窗、被封鎖）時自動退回只用記憶體。訪客不建立索引，維持只搜標題、標籤、主題。
 */
(function () {
  'use strict';
  var U = window.VaultUI,
    L = VaultLogic,
    S = U.S,
    api = U.api;
  var FT = (U.FT = {
    bodies: {},
    stamp: {},
    building: false,
    done: 0,
    total: 0,
    failed: false,
    cached: 0,
    cacheOk: false
  });
  var FULL_BUILD_OVER = 60; // 需要補抓的筆記超過這個數量，改用 exportBatch 整批重建（比逐篇快）
  U.bodies = null;

  /* ───── IndexedDB 快取（任何一步失敗都只是沒有快取，不影響功能） ───── */
  var dbp = null;
  function openDb() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve) {
      try {
        var idb = window.indexedDB;
        if (!idb) return resolve(null);
        var r = idb.open('vault-ft', 1);
        r.onupgradeneeded = function () {
          r.result.createObjectStore('bodies', { keyPath: 'id' });
        };
        r.onsuccess = function () {
          resolve(r.result);
        };
        r.onerror = r.onblocked = function () {
          resolve(null);
        };
      } catch (e) {
        resolve(null);
      }
    });
    return dbp;
  }
  function tx(mode, fn) {
    return openDb().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve) {
        try {
          var t = db.transaction('bodies', mode),
            st = t.objectStore('bodies'),
            out = fn(st);
          t.oncomplete = function () {
            resolve(out && out.result !== undefined ? out.result : true);
          };
          t.onerror = t.onabort = function () {
            resolve(null);
          };
        } catch (e) {
          resolve(null);
        }
      });
    });
  }
  function cacheLoad() {
    return tx('readonly', function (st) {
      return st.getAll();
    }).then(function (rows) {
      return Array.isArray(rows) ? rows : [];
    });
  }
  function cachePut(rows) {
    return rows.length
      ? tx('readwrite', function (st) {
          rows.forEach(function (r) {
            st.put(r);
          });
        })
      : Promise.resolve();
  }
  function cacheDel(ids) {
    return ids.length
      ? tx('readwrite', function (st) {
          ids.forEach(function (id) {
            st.delete(id);
          });
        })
      : Promise.resolve();
  }
  function cacheClear() {
    return tx('readwrite', function (st) {
      st.clear();
    });
  }
  U.ftCacheClear = function () {
    FT.bodies = {};
    FT.stamp = {};
    FT.cached = 0;
    return cacheClear();
  };

  var pend = {},
    flushT = null;
  function persist(id) {
    pend[id] = 1;
    if (flushT) return;
    flushT = setTimeout(function () {
      flushT = null;
      var ids = Object.keys(pend);
      pend = {};
      cachePut(
        ids
          .filter(function (i) {
            return FT.bodies[i] !== undefined;
          })
          .map(function (i) {
            return { id: i, body: FT.bodies[i], updatedAt: FT.stamp[i] };
          })
      );
    }, 300);
  }

  function ingest(id, text, updatedAt) {
    FT.bodies[id] = L.plainBody(text);
    FT.stamp[id] = updatedAt;
    persist(id);
  }
  function repaint() {
    if (S.f.q && !S.note && !S.edit && !S.up && !S.zip && !S.canvas) U.render();
  }
  U.ftStatus = function () {
    if (!S.me.isOwner) return '';
    if (FT.building) return T('全文索引建立中 {1} / {2}', FT.done, FT.total);
    return FT.failed ? T('全文索引未完整載入，目前只搜標題與標籤') : '';
  };

  function fullBuild() {
    if (FT.building) return Promise.resolve();
    FT.building = true;
    FT.done = 0;
    FT.failed = false;
    function pull(cursor) {
      return api('exportBatch', { cursor: cursor, limit: 50 }).then(function (r) {
        if (!r.ok) throw new Error(T(r.error || '讀取失敗'));
        r.notes.forEach(function (n) {
          ingest(n.id, n.text, n.updatedAt);
        });
        FT.done += r.notes.length;
        FT.total = r.total;
        repaint();
        return r.cursor ? pull(r.cursor) : null;
      });
    }
    return pull(undefined)
      .catch(function () {
        FT.failed = true;
      })
      .then(function () {
        FT.building = false;
        repaint();
      });
  }

  /** 逐篇補抓有變動的筆記，最多 4 個同時進行。 */
  function patch(stale) {
    var i = 0,
      running = 0;
    FT.building = true;
    FT.done = 0;
    FT.total = stale.length;
    return new Promise(function (resolve) {
      function next() {
        if (i >= stale.length && running === 0) {
          FT.building = false;
          repaint();
          return resolve();
        }
        while (running < 4 && i < stale.length) {
          (function (it) {
            running++;
            api('getNote', { id: it.id })
              .then(function (r) {
                if (r.ok) ingest(it.id, r.text, r.updatedAt);
                else FT.failed = true;
              })
              .catch(function () {
                FT.failed = true;
              })
              .then(function () {
                running--;
                FT.done++;
                next();
              });
          })(stale[i++]);
        }
      }
      next();
    });
  }

  var cacheReady = null;
  function loadCache() {
    if (cacheReady) return cacheReady;
    cacheReady = cacheLoad().then(function (rows) {
      rows.forEach(function (r) {
        if (r && typeof r.id === 'string' && typeof r.body === 'string' && FT.bodies[r.id] === undefined) {
          FT.bodies[r.id] = r.body;
          FT.stamp[r.id] = r.updatedAt;
        }
      });
      FT.cached = rows.length;
      FT.cacheOk = rows.length > 0;
    });
    return cacheReady;
  }

  /** 每次載入索引後呼叫：先讀本機快取，清掉已刪除的、補抓有變動的；變動太多就整個重建。 */
  U.onData = function () {
    if (!S.me.isOwner) {
      // 訪客：不留任何全文，也清掉這個瀏覽器上之前的快取
      var had = Object.keys(FT.bodies).length > 0 || FT.cached > 0;
      FT.bodies = {};
      FT.stamp = {};
      U.bodies = null;
      cacheReady = null;
      if (had || !FT.visitorCleared) {
        FT.visitorCleared = true;
        cacheClear();
      }
      return;
    }
    U.bodies = FT.bodies;
    loadCache().then(function () {
      if (!S.me.isOwner) return;
      var gone = Object.keys(FT.bodies).filter(function (id) {
        return !S.byId[id];
      });
      gone.forEach(function (id) {
        delete FT.bodies[id];
        delete FT.stamp[id];
      });
      cacheDel(gone);
      if (S.f.q) repaint(); // 快取一讀回來就能搜全文，不必等網路
      var stale = S.items.filter(function (it) {
        return FT.stamp[it.id] !== it.updatedAt;
      });
      if (!stale.length || FT.building) return;
      if (stale.length > FULL_BUILD_OVER || !Object.keys(FT.bodies).length) {
        setTimeout(fullBuild, 50);
        return;
      }
      patch(stale);
    });
  };
})();
