// 記憶體版 GitHub（只實作 Sync.gs 用到的 Git Data API），用來離線驗證同步流程
module.exports = function makeFakeGitHub(opts) {
  opts = Object.assign(
    { repo: 'me/vault-site', branch: 'main', token: 'ghp_TESTTOKEN', dir: 'content' },
    opts || {}
  );
  let n = 0;
  const sha = () => ('0000000' + (++n).toString(16)).slice(-7).padEnd(40, 'a');
  const trees = {},
    commits = {},
    refs = {};
  const log = [];
  const t0 = sha();
  trees[t0] = { 'README.md': '# init' };
  const c0 = sha();
  commits[c0] = { tree: t0, parents: [] };
  refs[opts.branch] = c0;
  const R = (code, obj) => ({ code, body: typeof obj === 'string' ? obj : JSON.stringify(obj) });
  const base = '/repos/' + opts.repo;
  const gh = {
    opts,
    log,
    trees,
    commits,
    refs,
    head: () => trees[commits[refs[opts.branch]].tree],
    files: () => Object.assign({}, trees[commits[refs[opts.branch]].tree]),
    commitCount: () => Object.keys(commits).length - 1,
    fail: null, // 例如 { match: /git\/trees/, code: 403 }
    http(req) {
      const u = new URL(req.url),
        p = u.pathname;
      log.push(req.method.toUpperCase() + ' ' + p + (req.body ? ' ' + req.body.length : ''));
      if ((req.headers || {}).Authorization !== 'Bearer ' + opts.token)
        return R(401, { message: 'Bad credentials' });
      if (gh.fail && gh.fail.match.test(p)) return R(gh.fail.code, { message: 'fail' });
      if (p.indexOf(base + '/') !== 0) return R(404, { message: 'Not Found' });
      const rest = p.slice(base.length),
        m = req.method.toUpperCase(),
        body = req.body ? JSON.parse(req.body) : null;
      let x;
      if (m === 'GET' && (x = /^\/git\/ref\/heads\/(.+)$/.exec(rest)))
        return refs[x[1]] ? R(200, { object: { sha: refs[x[1]] } }) : R(404, {});
      if (m === 'GET' && (x = /^\/git\/commits\/(.+)$/.exec(rest)))
        return commits[x[1]] ? R(200, { sha: x[1], tree: { sha: commits[x[1]].tree } }) : R(404, {});
      if (m === 'GET' && (x = /^\/contents\/(.+)$/.exec(rest))) {
        const f = gh.head()[decodeURIComponent(x[1])];
        return f === undefined ? R(404, {}) : R(200, f);
      }
      if (m === 'POST' && rest === '/git/trees') {
        const baseTree = trees[body.base_tree];
        if (!baseTree) return R(422, {});
        const t = Object.assign({}, baseTree);
        for (const e of body.tree) {
          if (e.sha === null) {
            if (!(e.path in t)) return R(422, { message: 'nonexistent' });
            delete t[e.path];
          } else if (typeof e.content === 'string') t[e.path] = e.content;
          else return R(422, {});
        }
        const id = sha();
        trees[id] = t;
        return R(201, { sha: id });
      }
      if (m === 'POST' && rest === '/git/commits') {
        if (!trees[body.tree]) return R(422, {});
        const id = sha();
        commits[id] = { tree: body.tree, parents: body.parents, message: body.message };
        return R(201, { sha: id });
      }
      if (m === 'PATCH' && (x = /^\/git\/refs\/heads\/(.+)$/.exec(rest))) {
        if (!refs[x[1]]) return R(404, {});
        if (!commits[body.sha]) return R(422, {});
        if (!body.force && commits[body.sha].parents[0] !== refs[x[1]])
          return R(422, { message: 'Update is not a fast forward' });
        refs[x[1]] = body.sha;
        return R(200, { object: { sha: body.sha } });
      }
      return R(404, { message: 'unhandled ' + m + ' ' + rest });
    }
  };
  return gh;
};
