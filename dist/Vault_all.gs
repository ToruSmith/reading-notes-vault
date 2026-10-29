/**
 * Vault_all.gs — 讀書筆記 Vault 後端，由 Yaml、Svg、Core、Sync、Store、Code 六個檔案合併而成。
 * 專案裡只保留這一個檔案；不要同時保留其他 .gs 檔，否則函式會重複定義。
 * 請勿直接修改，修改請改原始檔後重新合併。
 */
// ═══════════════ Yaml.gs ═══════════════
/**
 * Yaml.gs — 內嵌 js-yaml（MIT 授權，https://github.com/nodeca/js-yaml）。
 * 原樣收錄官方 dist/js-yaml.min.js，不要手動修改。解析 front matter 一律用它，不用字串切割。
 */
/*! js-yaml 4.1.1 https://github.com/nodeca/js-yaml @license MIT */
!(function (e, t) {
  'object' == typeof exports && 'undefined' != typeof module
    ? t(exports)
    : 'function' == typeof define && define.amd
      ? define(['exports'], t)
      : t(((e = 'undefined' != typeof globalThis ? globalThis : e || self).jsyaml = {}));
})(this, function (e) {
  'use strict';
  function t(e) {
    return null == e;
  }
  var n = {
    isNothing: t,
    isObject: function (e) {
      return 'object' == typeof e && null !== e;
    },
    toArray: function (e) {
      return Array.isArray(e) ? e : t(e) ? [] : [e];
    },
    repeat: function (e, t) {
      var n,
        i = '';
      for (n = 0; n < t; n += 1) i += e;
      return i;
    },
    isNegativeZero: function (e) {
      return 0 === e && Number.NEGATIVE_INFINITY === 1 / e;
    },
    extend: function (e, t) {
      var n, i, r, o;
      if (t) for (n = 0, i = (o = Object.keys(t)).length; n < i; n += 1) e[(r = o[n])] = t[r];
      return e;
    }
  };
  function i(e, t) {
    var n = '',
      i = e.reason || '(unknown reason)';
    return e.mark
      ? (e.mark.name && (n += 'in "' + e.mark.name + '" '),
        (n += '(' + (e.mark.line + 1) + ':' + (e.mark.column + 1) + ')'),
        !t && e.mark.snippet && (n += '\n\n' + e.mark.snippet),
        i + ' ' + n)
      : i;
  }
  function r(e, t) {
    (Error.call(this),
      (this.name = 'YAMLException'),
      (this.reason = e),
      (this.mark = t),
      (this.message = i(this, !1)),
      Error.captureStackTrace
        ? Error.captureStackTrace(this, this.constructor)
        : (this.stack = new Error().stack || ''));
  }
  ((r.prototype = Object.create(Error.prototype)),
    (r.prototype.constructor = r),
    (r.prototype.toString = function (e) {
      return this.name + ': ' + i(this, e);
    }));
  var o = r;
  function a(e, t, n, i, r) {
    var o = '',
      a = '',
      l = Math.floor(r / 2) - 1;
    return (
      i - t > l && (t = i - l + (o = ' ... ').length),
      n - i > l && (n = i + l - (a = ' ...').length),
      { str: o + e.slice(t, n).replace(/\t/g, '→') + a, pos: i - t + o.length }
    );
  }
  function l(e, t) {
    return n.repeat(' ', t - e.length) + e;
  }
  var c = function (e, t) {
      if (((t = Object.create(t || null)), !e.buffer)) return null;
      (t.maxLength || (t.maxLength = 79),
        'number' != typeof t.indent && (t.indent = 1),
        'number' != typeof t.linesBefore && (t.linesBefore = 3),
        'number' != typeof t.linesAfter && (t.linesAfter = 2));
      for (var i, r = /\r?\n|\r|\0/g, o = [0], c = [], s = -1; (i = r.exec(e.buffer)); )
        (c.push(i.index),
          o.push(i.index + i[0].length),
          e.position <= i.index && s < 0 && (s = o.length - 2));
      s < 0 && (s = o.length - 1);
      var u,
        p,
        f = '',
        d = Math.min(e.line + t.linesAfter, c.length).toString().length,
        h = t.maxLength - (t.indent + d + 3);
      for (u = 1; u <= t.linesBefore && !(s - u < 0); u++)
        ((p = a(e.buffer, o[s - u], c[s - u], e.position - (o[s] - o[s - u]), h)),
          (f = n.repeat(' ', t.indent) + l((e.line - u + 1).toString(), d) + ' | ' + p.str + '\n' + f));
      for (
        p = a(e.buffer, o[s], c[s], e.position, h),
          f += n.repeat(' ', t.indent) + l((e.line + 1).toString(), d) + ' | ' + p.str + '\n',
          f += n.repeat('-', t.indent + d + 3 + p.pos) + '^\n',
          u = 1;
        u <= t.linesAfter && !(s + u >= c.length);
        u++
      )
        ((p = a(e.buffer, o[s + u], c[s + u], e.position - (o[s] - o[s + u]), h)),
          (f += n.repeat(' ', t.indent) + l((e.line + u + 1).toString(), d) + ' | ' + p.str + '\n'));
      return f.replace(/\n$/, '');
    },
    s = [
      'kind',
      'multi',
      'resolve',
      'construct',
      'instanceOf',
      'predicate',
      'represent',
      'representName',
      'defaultStyle',
      'styleAliases'
    ],
    u = ['scalar', 'sequence', 'mapping'];
  var p = function (e, t) {
    if (
      ((t = t || {}),
      Object.keys(t).forEach(function (t) {
        if (-1 === s.indexOf(t))
          throw new o('Unknown option "' + t + '" is met in definition of "' + e + '" YAML type.');
      }),
      (this.options = t),
      (this.tag = e),
      (this.kind = t.kind || null),
      (this.resolve =
        t.resolve ||
        function () {
          return !0;
        }),
      (this.construct =
        t.construct ||
        function (e) {
          return e;
        }),
      (this.instanceOf = t.instanceOf || null),
      (this.predicate = t.predicate || null),
      (this.represent = t.represent || null),
      (this.representName = t.representName || null),
      (this.defaultStyle = t.defaultStyle || null),
      (this.multi = t.multi || !1),
      (this.styleAliases = (function (e) {
        var t = {};
        return (
          null !== e &&
            Object.keys(e).forEach(function (n) {
              e[n].forEach(function (e) {
                t[String(e)] = n;
              });
            }),
          t
        );
      })(t.styleAliases || null)),
      -1 === u.indexOf(this.kind))
    )
      throw new o('Unknown kind "' + this.kind + '" is specified for "' + e + '" YAML type.');
  };
  function f(e, t) {
    var n = [];
    return (
      e[t].forEach(function (e) {
        var t = n.length;
        (n.forEach(function (n, i) {
          n.tag === e.tag && n.kind === e.kind && n.multi === e.multi && (t = i);
        }),
          (n[t] = e));
      }),
      n
    );
  }
  function d(e) {
    return this.extend(e);
  }
  d.prototype.extend = function (e) {
    var t = [],
      n = [];
    if (e instanceof p) n.push(e);
    else if (Array.isArray(e)) n = n.concat(e);
    else {
      if (!e || (!Array.isArray(e.implicit) && !Array.isArray(e.explicit)))
        throw new o(
          'Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })'
        );
      (e.implicit && (t = t.concat(e.implicit)), e.explicit && (n = n.concat(e.explicit)));
    }
    (t.forEach(function (e) {
      if (!(e instanceof p))
        throw new o('Specified list of YAML types (or a single Type object) contains a non-Type object.');
      if (e.loadKind && 'scalar' !== e.loadKind)
        throw new o(
          'There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.'
        );
      if (e.multi)
        throw new o(
          'There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.'
        );
    }),
      n.forEach(function (e) {
        if (!(e instanceof p))
          throw new o('Specified list of YAML types (or a single Type object) contains a non-Type object.');
      }));
    var i = Object.create(d.prototype);
    return (
      (i.implicit = (this.implicit || []).concat(t)),
      (i.explicit = (this.explicit || []).concat(n)),
      (i.compiledImplicit = f(i, 'implicit')),
      (i.compiledExplicit = f(i, 'explicit')),
      (i.compiledTypeMap = (function () {
        var e,
          t,
          n = {
            scalar: {},
            sequence: {},
            mapping: {},
            fallback: {},
            multi: { scalar: [], sequence: [], mapping: [], fallback: [] }
          };
        function i(e) {
          e.multi
            ? (n.multi[e.kind].push(e), n.multi.fallback.push(e))
            : (n[e.kind][e.tag] = n.fallback[e.tag] = e);
        }
        for (e = 0, t = arguments.length; e < t; e += 1) arguments[e].forEach(i);
        return n;
      })(i.compiledImplicit, i.compiledExplicit)),
      i
    );
  };
  var h = d,
    g = new p('tag:yaml.org,2002:str', {
      kind: 'scalar',
      construct: function (e) {
        return null !== e ? e : '';
      }
    }),
    m = new p('tag:yaml.org,2002:seq', {
      kind: 'sequence',
      construct: function (e) {
        return null !== e ? e : [];
      }
    }),
    y = new p('tag:yaml.org,2002:map', {
      kind: 'mapping',
      construct: function (e) {
        return null !== e ? e : {};
      }
    }),
    b = new h({ explicit: [g, m, y] });
  var A = new p('tag:yaml.org,2002:null', {
    kind: 'scalar',
    resolve: function (e) {
      if (null === e) return !0;
      var t = e.length;
      return (1 === t && '~' === e) || (4 === t && ('null' === e || 'Null' === e || 'NULL' === e));
    },
    construct: function () {
      return null;
    },
    predicate: function (e) {
      return null === e;
    },
    represent: {
      canonical: function () {
        return '~';
      },
      lowercase: function () {
        return 'null';
      },
      uppercase: function () {
        return 'NULL';
      },
      camelcase: function () {
        return 'Null';
      },
      empty: function () {
        return '';
      }
    },
    defaultStyle: 'lowercase'
  });
  var v = new p('tag:yaml.org,2002:bool', {
    kind: 'scalar',
    resolve: function (e) {
      if (null === e) return !1;
      var t = e.length;
      return (
        (4 === t && ('true' === e || 'True' === e || 'TRUE' === e)) ||
        (5 === t && ('false' === e || 'False' === e || 'FALSE' === e))
      );
    },
    construct: function (e) {
      return 'true' === e || 'True' === e || 'TRUE' === e;
    },
    predicate: function (e) {
      return '[object Boolean]' === Object.prototype.toString.call(e);
    },
    represent: {
      lowercase: function (e) {
        return e ? 'true' : 'false';
      },
      uppercase: function (e) {
        return e ? 'TRUE' : 'FALSE';
      },
      camelcase: function (e) {
        return e ? 'True' : 'False';
      }
    },
    defaultStyle: 'lowercase'
  });
  function w(e) {
    return (48 <= e && e <= 57) || (65 <= e && e <= 70) || (97 <= e && e <= 102);
  }
  function k(e) {
    return 48 <= e && e <= 55;
  }
  function C(e) {
    return 48 <= e && e <= 57;
  }
  var x = new p('tag:yaml.org,2002:int', {
      kind: 'scalar',
      resolve: function (e) {
        if (null === e) return !1;
        var t,
          n = e.length,
          i = 0,
          r = !1;
        if (!n) return !1;
        if ((('-' !== (t = e[i]) && '+' !== t) || (t = e[++i]), '0' === t)) {
          if (i + 1 === n) return !0;
          if ('b' === (t = e[++i])) {
            for (i++; i < n; i++)
              if ('_' !== (t = e[i])) {
                if ('0' !== t && '1' !== t) return !1;
                r = !0;
              }
            return r && '_' !== t;
          }
          if ('x' === t) {
            for (i++; i < n; i++)
              if ('_' !== (t = e[i])) {
                if (!w(e.charCodeAt(i))) return !1;
                r = !0;
              }
            return r && '_' !== t;
          }
          if ('o' === t) {
            for (i++; i < n; i++)
              if ('_' !== (t = e[i])) {
                if (!k(e.charCodeAt(i))) return !1;
                r = !0;
              }
            return r && '_' !== t;
          }
        }
        if ('_' === t) return !1;
        for (; i < n; i++)
          if ('_' !== (t = e[i])) {
            if (!C(e.charCodeAt(i))) return !1;
            r = !0;
          }
        return !(!r || '_' === t);
      },
      construct: function (e) {
        var t,
          n = e,
          i = 1;
        if (
          (-1 !== n.indexOf('_') && (n = n.replace(/_/g, '')),
          ('-' !== (t = n[0]) && '+' !== t) || ('-' === t && (i = -1), (t = (n = n.slice(1))[0])),
          '0' === n)
        )
          return 0;
        if ('0' === t) {
          if ('b' === n[1]) return i * parseInt(n.slice(2), 2);
          if ('x' === n[1]) return i * parseInt(n.slice(2), 16);
          if ('o' === n[1]) return i * parseInt(n.slice(2), 8);
        }
        return i * parseInt(n, 10);
      },
      predicate: function (e) {
        return '[object Number]' === Object.prototype.toString.call(e) && e % 1 == 0 && !n.isNegativeZero(e);
      },
      represent: {
        binary: function (e) {
          return e >= 0 ? '0b' + e.toString(2) : '-0b' + e.toString(2).slice(1);
        },
        octal: function (e) {
          return e >= 0 ? '0o' + e.toString(8) : '-0o' + e.toString(8).slice(1);
        },
        decimal: function (e) {
          return e.toString(10);
        },
        hexadecimal: function (e) {
          return e >= 0 ? '0x' + e.toString(16).toUpperCase() : '-0x' + e.toString(16).toUpperCase().slice(1);
        }
      },
      defaultStyle: 'decimal',
      styleAliases: { binary: [2, 'bin'], octal: [8, 'oct'], decimal: [10, 'dec'], hexadecimal: [16, 'hex'] }
    }),
    I = new RegExp(
      '^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$'
    );
  var S = /^[-+]?[0-9]+e/;
  var O = new p('tag:yaml.org,2002:float', {
      kind: 'scalar',
      resolve: function (e) {
        return null !== e && !(!I.test(e) || '_' === e[e.length - 1]);
      },
      construct: function (e) {
        var t, n;
        return (
          (n = '-' === (t = e.replace(/_/g, '').toLowerCase())[0] ? -1 : 1),
          '+-'.indexOf(t[0]) >= 0 && (t = t.slice(1)),
          '.inf' === t
            ? 1 === n
              ? Number.POSITIVE_INFINITY
              : Number.NEGATIVE_INFINITY
            : '.nan' === t
              ? NaN
              : n * parseFloat(t, 10)
        );
      },
      predicate: function (e) {
        return '[object Number]' === Object.prototype.toString.call(e) && (e % 1 != 0 || n.isNegativeZero(e));
      },
      represent: function (e, t) {
        var i;
        if (isNaN(e))
          switch (t) {
            case 'lowercase':
              return '.nan';
            case 'uppercase':
              return '.NAN';
            case 'camelcase':
              return '.NaN';
          }
        else if (Number.POSITIVE_INFINITY === e)
          switch (t) {
            case 'lowercase':
              return '.inf';
            case 'uppercase':
              return '.INF';
            case 'camelcase':
              return '.Inf';
          }
        else if (Number.NEGATIVE_INFINITY === e)
          switch (t) {
            case 'lowercase':
              return '-.inf';
            case 'uppercase':
              return '-.INF';
            case 'camelcase':
              return '-.Inf';
          }
        else if (n.isNegativeZero(e)) return '-0.0';
        return ((i = e.toString(10)), S.test(i) ? i.replace('e', '.e') : i);
      },
      defaultStyle: 'lowercase'
    }),
    j = b.extend({ implicit: [A, v, x, O] }),
    T = j,
    N = new RegExp('^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$'),
    F = new RegExp(
      '^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$'
    );
  var E = new p('tag:yaml.org,2002:timestamp', {
    kind: 'scalar',
    resolve: function (e) {
      return null !== e && (null !== N.exec(e) || null !== F.exec(e));
    },
    construct: function (e) {
      var t,
        n,
        i,
        r,
        o,
        a,
        l,
        c,
        s = 0,
        u = null;
      if ((null === (t = N.exec(e)) && (t = F.exec(e)), null === t)) throw new Error('Date resolve error');
      if (((n = +t[1]), (i = +t[2] - 1), (r = +t[3]), !t[4])) return new Date(Date.UTC(n, i, r));
      if (((o = +t[4]), (a = +t[5]), (l = +t[6]), t[7])) {
        for (s = t[7].slice(0, 3); s.length < 3; ) s += '0';
        s = +s;
      }
      return (
        t[9] && ((u = 6e4 * (60 * +t[10] + +(t[11] || 0))), '-' === t[9] && (u = -u)),
        (c = new Date(Date.UTC(n, i, r, o, a, l, s))),
        u && c.setTime(c.getTime() - u),
        c
      );
    },
    instanceOf: Date,
    represent: function (e) {
      return e.toISOString();
    }
  });
  var M = new p('tag:yaml.org,2002:merge', {
      kind: 'scalar',
      resolve: function (e) {
        return '<<' === e || null === e;
      }
    }),
    L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r';
  var _ = new p('tag:yaml.org,2002:binary', {
      kind: 'scalar',
      resolve: function (e) {
        if (null === e) return !1;
        var t,
          n,
          i = 0,
          r = e.length,
          o = L;
        for (n = 0; n < r; n++)
          if (!((t = o.indexOf(e.charAt(n))) > 64)) {
            if (t < 0) return !1;
            i += 6;
          }
        return i % 8 == 0;
      },
      construct: function (e) {
        var t,
          n,
          i = e.replace(/[\r\n=]/g, ''),
          r = i.length,
          o = L,
          a = 0,
          l = [];
        for (t = 0; t < r; t++)
          (t % 4 == 0 && t && (l.push((a >> 16) & 255), l.push((a >> 8) & 255), l.push(255 & a)),
            (a = (a << 6) | o.indexOf(i.charAt(t))));
        return (
          0 === (n = (r % 4) * 6)
            ? (l.push((a >> 16) & 255), l.push((a >> 8) & 255), l.push(255 & a))
            : 18 === n
              ? (l.push((a >> 10) & 255), l.push((a >> 2) & 255))
              : 12 === n && l.push((a >> 4) & 255),
          new Uint8Array(l)
        );
      },
      predicate: function (e) {
        return '[object Uint8Array]' === Object.prototype.toString.call(e);
      },
      represent: function (e) {
        var t,
          n,
          i = '',
          r = 0,
          o = e.length,
          a = L;
        for (t = 0; t < o; t++)
          (t % 3 == 0 &&
            t &&
            ((i += a[(r >> 18) & 63]), (i += a[(r >> 12) & 63]), (i += a[(r >> 6) & 63]), (i += a[63 & r])),
            (r = (r << 8) + e[t]));
        return (
          0 === (n = o % 3)
            ? ((i += a[(r >> 18) & 63]), (i += a[(r >> 12) & 63]), (i += a[(r >> 6) & 63]), (i += a[63 & r]))
            : 2 === n
              ? ((i += a[(r >> 10) & 63]), (i += a[(r >> 4) & 63]), (i += a[(r << 2) & 63]), (i += a[64]))
              : 1 === n && ((i += a[(r >> 2) & 63]), (i += a[(r << 4) & 63]), (i += a[64]), (i += a[64])),
          i
        );
      }
    }),
    D = Object.prototype.hasOwnProperty,
    U = Object.prototype.toString;
  var q = new p('tag:yaml.org,2002:omap', {
      kind: 'sequence',
      resolve: function (e) {
        if (null === e) return !0;
        var t,
          n,
          i,
          r,
          o,
          a = [],
          l = e;
        for (t = 0, n = l.length; t < n; t += 1) {
          if (((i = l[t]), (o = !1), '[object Object]' !== U.call(i))) return !1;
          for (r in i)
            if (D.call(i, r)) {
              if (o) return !1;
              o = !0;
            }
          if (!o) return !1;
          if (-1 !== a.indexOf(r)) return !1;
          a.push(r);
        }
        return !0;
      },
      construct: function (e) {
        return null !== e ? e : [];
      }
    }),
    Y = Object.prototype.toString;
  var R = new p('tag:yaml.org,2002:pairs', {
      kind: 'sequence',
      resolve: function (e) {
        if (null === e) return !0;
        var t,
          n,
          i,
          r,
          o,
          a = e;
        for (o = new Array(a.length), t = 0, n = a.length; t < n; t += 1) {
          if (((i = a[t]), '[object Object]' !== Y.call(i))) return !1;
          if (1 !== (r = Object.keys(i)).length) return !1;
          o[t] = [r[0], i[r[0]]];
        }
        return !0;
      },
      construct: function (e) {
        if (null === e) return [];
        var t,
          n,
          i,
          r,
          o,
          a = e;
        for (o = new Array(a.length), t = 0, n = a.length; t < n; t += 1)
          ((i = a[t]), (r = Object.keys(i)), (o[t] = [r[0], i[r[0]]]));
        return o;
      }
    }),
    B = Object.prototype.hasOwnProperty;
  var K = new p('tag:yaml.org,2002:set', {
      kind: 'mapping',
      resolve: function (e) {
        if (null === e) return !0;
        var t,
          n = e;
        for (t in n) if (B.call(n, t) && null !== n[t]) return !1;
        return !0;
      },
      construct: function (e) {
        return null !== e ? e : {};
      }
    }),
    P = T.extend({ implicit: [E, M], explicit: [_, q, R, K] }),
    W = Object.prototype.hasOwnProperty,
    H =
      /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/,
    $ = /[\x85\u2028\u2029]/,
    G = /[,\[\]\{\}]/,
    V = /^(?:!|!!|![a-z\-]+!)$/i,
    Z = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
  function J(e) {
    return Object.prototype.toString.call(e);
  }
  function Q(e) {
    return 10 === e || 13 === e;
  }
  function z(e) {
    return 9 === e || 32 === e;
  }
  function X(e) {
    return 9 === e || 32 === e || 10 === e || 13 === e;
  }
  function ee(e) {
    return 44 === e || 91 === e || 93 === e || 123 === e || 125 === e;
  }
  function te(e) {
    var t;
    return 48 <= e && e <= 57 ? e - 48 : 97 <= (t = 32 | e) && t <= 102 ? t - 97 + 10 : -1;
  }
  function ne(e) {
    return 120 === e ? 2 : 117 === e ? 4 : 85 === e ? 8 : 0;
  }
  function ie(e) {
    return 48 <= e && e <= 57 ? e - 48 : -1;
  }
  function re(e) {
    return 48 === e
      ? '\0'
      : 97 === e
        ? ''
        : 98 === e
          ? '\b'
          : 116 === e || 9 === e
            ? '\t'
            : 110 === e
              ? '\n'
              : 118 === e
                ? '\v'
                : 102 === e
                  ? '\f'
                  : 114 === e
                    ? '\r'
                    : 101 === e
                      ? ''
                      : 32 === e
                        ? ' '
                        : 34 === e
                          ? '"'
                          : 47 === e
                            ? '/'
                            : 92 === e
                              ? '\\'
                              : 78 === e
                                ? ''
                                : 95 === e
                                  ? ' '
                                  : 76 === e
                                    ? '\u2028'
                                    : 80 === e
                                      ? '\u2029'
                                      : '';
  }
  function oe(e) {
    return e <= 65535
      ? String.fromCharCode(e)
      : String.fromCharCode(55296 + ((e - 65536) >> 10), 56320 + ((e - 65536) & 1023));
  }
  function ae(e, t, n) {
    '__proto__' === t
      ? Object.defineProperty(e, t, { configurable: !0, enumerable: !0, writable: !0, value: n })
      : (e[t] = n);
  }
  for (var le = new Array(256), ce = new Array(256), se = 0; se < 256; se++)
    ((le[se] = re(se) ? 1 : 0), (ce[se] = re(se)));
  function ue(e, t) {
    ((this.input = e),
      (this.filename = t.filename || null),
      (this.schema = t.schema || P),
      (this.onWarning = t.onWarning || null),
      (this.legacy = t.legacy || !1),
      (this.json = t.json || !1),
      (this.listener = t.listener || null),
      (this.implicitTypes = this.schema.compiledImplicit),
      (this.typeMap = this.schema.compiledTypeMap),
      (this.length = e.length),
      (this.position = 0),
      (this.line = 0),
      (this.lineStart = 0),
      (this.lineIndent = 0),
      (this.firstTabInLine = -1),
      (this.documents = []));
  }
  function pe(e, t) {
    var n = {
      name: e.filename,
      buffer: e.input.slice(0, -1),
      position: e.position,
      line: e.line,
      column: e.position - e.lineStart
    };
    return ((n.snippet = c(n)), new o(t, n));
  }
  function fe(e, t) {
    throw pe(e, t);
  }
  function de(e, t) {
    e.onWarning && e.onWarning.call(null, pe(e, t));
  }
  var he = {
    YAML: function (e, t, n) {
      var i, r, o;
      (null !== e.version && fe(e, 'duplication of %YAML directive'),
        1 !== n.length && fe(e, 'YAML directive accepts exactly one argument'),
        null === (i = /^([0-9]+)\.([0-9]+)$/.exec(n[0])) &&
          fe(e, 'ill-formed argument of the YAML directive'),
        (r = parseInt(i[1], 10)),
        (o = parseInt(i[2], 10)),
        1 !== r && fe(e, 'unacceptable YAML version of the document'),
        (e.version = n[0]),
        (e.checkLineBreaks = o < 2),
        1 !== o && 2 !== o && de(e, 'unsupported YAML version of the document'));
    },
    TAG: function (e, t, n) {
      var i, r;
      (2 !== n.length && fe(e, 'TAG directive accepts exactly two arguments'),
        (i = n[0]),
        (r = n[1]),
        V.test(i) || fe(e, 'ill-formed tag handle (first argument) of the TAG directive'),
        W.call(e.tagMap, i) && fe(e, 'there is a previously declared suffix for "' + i + '" tag handle'),
        Z.test(r) || fe(e, 'ill-formed tag prefix (second argument) of the TAG directive'));
      try {
        r = decodeURIComponent(r);
      } catch (t) {
        fe(e, 'tag prefix is malformed: ' + r);
      }
      e.tagMap[i] = r;
    }
  };
  function ge(e, t, n, i) {
    var r, o, a, l;
    if (t < n) {
      if (((l = e.input.slice(t, n)), i))
        for (r = 0, o = l.length; r < o; r += 1)
          9 === (a = l.charCodeAt(r)) || (32 <= a && a <= 1114111) || fe(e, 'expected valid JSON character');
      else H.test(l) && fe(e, 'the stream contains non-printable characters');
      e.result += l;
    }
  }
  function me(e, t, i, r) {
    var o, a, l, c;
    for (
      n.isObject(i) || fe(e, 'cannot merge mappings; the provided source object is unacceptable'),
        l = 0,
        c = (o = Object.keys(i)).length;
      l < c;
      l += 1
    )
      ((a = o[l]), W.call(t, a) || (ae(t, a, i[a]), (r[a] = !0)));
  }
  function ye(e, t, n, i, r, o, a, l, c) {
    var s, u;
    if (Array.isArray(r))
      for (s = 0, u = (r = Array.prototype.slice.call(r)).length; s < u; s += 1)
        (Array.isArray(r[s]) && fe(e, 'nested arrays are not supported inside keys'),
          'object' == typeof r && '[object Object]' === J(r[s]) && (r[s] = '[object Object]'));
    if (
      ('object' == typeof r && '[object Object]' === J(r) && (r = '[object Object]'),
      (r = String(r)),
      null === t && (t = {}),
      'tag:yaml.org,2002:merge' === i)
    )
      if (Array.isArray(o)) for (s = 0, u = o.length; s < u; s += 1) me(e, t, o[s], n);
      else me(e, t, o, n);
    else
      (e.json ||
        W.call(n, r) ||
        !W.call(t, r) ||
        ((e.line = a || e.line),
        (e.lineStart = l || e.lineStart),
        (e.position = c || e.position),
        fe(e, 'duplicated mapping key')),
        ae(t, r, o),
        delete n[r]);
    return t;
  }
  function be(e) {
    var t;
    (10 === (t = e.input.charCodeAt(e.position))
      ? e.position++
      : 13 === t
        ? (e.position++, 10 === e.input.charCodeAt(e.position) && e.position++)
        : fe(e, 'a line break is expected'),
      (e.line += 1),
      (e.lineStart = e.position),
      (e.firstTabInLine = -1));
  }
  function Ae(e, t, n) {
    for (var i = 0, r = e.input.charCodeAt(e.position); 0 !== r; ) {
      for (; z(r); )
        (9 === r && -1 === e.firstTabInLine && (e.firstTabInLine = e.position),
          (r = e.input.charCodeAt(++e.position)));
      if (t && 35 === r)
        do {
          r = e.input.charCodeAt(++e.position);
        } while (10 !== r && 13 !== r && 0 !== r);
      if (!Q(r)) break;
      for (be(e), r = e.input.charCodeAt(e.position), i++, e.lineIndent = 0; 32 === r; )
        (e.lineIndent++, (r = e.input.charCodeAt(++e.position)));
    }
    return (-1 !== n && 0 !== i && e.lineIndent < n && de(e, 'deficient indentation'), i);
  }
  function ve(e) {
    var t,
      n = e.position;
    return !(
      (45 !== (t = e.input.charCodeAt(n)) && 46 !== t) ||
      t !== e.input.charCodeAt(n + 1) ||
      t !== e.input.charCodeAt(n + 2) ||
      ((n += 3), 0 !== (t = e.input.charCodeAt(n)) && !X(t))
    );
  }
  function we(e, t) {
    1 === t ? (e.result += ' ') : t > 1 && (e.result += n.repeat('\n', t - 1));
  }
  function ke(e, t) {
    var n,
      i,
      r = e.tag,
      o = e.anchor,
      a = [],
      l = !1;
    if (-1 !== e.firstTabInLine) return !1;
    for (
      null !== e.anchor && (e.anchorMap[e.anchor] = a), i = e.input.charCodeAt(e.position);
      0 !== i &&
      (-1 !== e.firstTabInLine &&
        ((e.position = e.firstTabInLine), fe(e, 'tab characters must not be used in indentation')),
      45 === i) &&
      X(e.input.charCodeAt(e.position + 1));
    )
      if (((l = !0), e.position++, Ae(e, !0, -1) && e.lineIndent <= t))
        (a.push(null), (i = e.input.charCodeAt(e.position)));
      else if (
        ((n = e.line),
        Ie(e, t, 3, !1, !0),
        a.push(e.result),
        Ae(e, !0, -1),
        (i = e.input.charCodeAt(e.position)),
        (e.line === n || e.lineIndent > t) && 0 !== i)
      )
        fe(e, 'bad indentation of a sequence entry');
      else if (e.lineIndent < t) break;
    return !!l && ((e.tag = r), (e.anchor = o), (e.kind = 'sequence'), (e.result = a), !0);
  }
  function Ce(e) {
    var t,
      n,
      i,
      r,
      o = !1,
      a = !1;
    if (33 !== (r = e.input.charCodeAt(e.position))) return !1;
    if (
      (null !== e.tag && fe(e, 'duplication of a tag property'),
      60 === (r = e.input.charCodeAt(++e.position))
        ? ((o = !0), (r = e.input.charCodeAt(++e.position)))
        : 33 === r
          ? ((a = !0), (n = '!!'), (r = e.input.charCodeAt(++e.position)))
          : (n = '!'),
      (t = e.position),
      o)
    ) {
      do {
        r = e.input.charCodeAt(++e.position);
      } while (0 !== r && 62 !== r);
      e.position < e.length
        ? ((i = e.input.slice(t, e.position)), (r = e.input.charCodeAt(++e.position)))
        : fe(e, 'unexpected end of the stream within a verbatim tag');
    } else {
      for (; 0 !== r && !X(r); )
        (33 === r &&
          (a
            ? fe(e, 'tag suffix cannot contain exclamation marks')
            : ((n = e.input.slice(t - 1, e.position + 1)),
              V.test(n) || fe(e, 'named tag handle cannot contain such characters'),
              (a = !0),
              (t = e.position + 1))),
          (r = e.input.charCodeAt(++e.position)));
      ((i = e.input.slice(t, e.position)),
        G.test(i) && fe(e, 'tag suffix cannot contain flow indicator characters'));
    }
    i && !Z.test(i) && fe(e, 'tag name cannot contain such characters: ' + i);
    try {
      i = decodeURIComponent(i);
    } catch (t) {
      fe(e, 'tag name is malformed: ' + i);
    }
    return (
      o
        ? (e.tag = i)
        : W.call(e.tagMap, n)
          ? (e.tag = e.tagMap[n] + i)
          : '!' === n
            ? (e.tag = '!' + i)
            : '!!' === n
              ? (e.tag = 'tag:yaml.org,2002:' + i)
              : fe(e, 'undeclared tag handle "' + n + '"'),
      !0
    );
  }
  function xe(e) {
    var t, n;
    if (38 !== (n = e.input.charCodeAt(e.position))) return !1;
    for (
      null !== e.anchor && fe(e, 'duplication of an anchor property'),
        n = e.input.charCodeAt(++e.position),
        t = e.position;
      0 !== n && !X(n) && !ee(n);
    )
      n = e.input.charCodeAt(++e.position);
    return (
      e.position === t && fe(e, 'name of an anchor node must contain at least one character'),
      (e.anchor = e.input.slice(t, e.position)),
      !0
    );
  }
  function Ie(e, t, i, r, o) {
    var a,
      l,
      c,
      s,
      u,
      p,
      f,
      d,
      h,
      g = 1,
      m = !1,
      y = !1;
    if (
      (null !== e.listener && e.listener('open', e),
      (e.tag = null),
      (e.anchor = null),
      (e.kind = null),
      (e.result = null),
      (a = l = c = 4 === i || 3 === i),
      r &&
        Ae(e, !0, -1) &&
        ((m = !0), e.lineIndent > t ? (g = 1) : e.lineIndent === t ? (g = 0) : e.lineIndent < t && (g = -1)),
      1 === g)
    )
      for (; Ce(e) || xe(e); )
        Ae(e, !0, -1)
          ? ((m = !0),
            (c = a),
            e.lineIndent > t ? (g = 1) : e.lineIndent === t ? (g = 0) : e.lineIndent < t && (g = -1))
          : (c = !1);
    if (
      (c && (c = m || o),
      (1 !== g && 4 !== i) ||
        ((d = 1 === i || 2 === i ? t : t + 1),
        (h = e.position - e.lineStart),
        1 === g
          ? (c &&
              (ke(e, h) ||
                (function (e, t, n) {
                  var i,
                    r,
                    o,
                    a,
                    l,
                    c,
                    s,
                    u = e.tag,
                    p = e.anchor,
                    f = {},
                    d = Object.create(null),
                    h = null,
                    g = null,
                    m = null,
                    y = !1,
                    b = !1;
                  if (-1 !== e.firstTabInLine) return !1;
                  for (
                    null !== e.anchor && (e.anchorMap[e.anchor] = f), s = e.input.charCodeAt(e.position);
                    0 !== s;
                  ) {
                    if (
                      (y ||
                        -1 === e.firstTabInLine ||
                        ((e.position = e.firstTabInLine),
                        fe(e, 'tab characters must not be used in indentation')),
                      (i = e.input.charCodeAt(e.position + 1)),
                      (o = e.line),
                      (63 !== s && 58 !== s) || !X(i))
                    ) {
                      if (((a = e.line), (l = e.lineStart), (c = e.position), !Ie(e, n, 2, !1, !0))) break;
                      if (e.line === o) {
                        for (s = e.input.charCodeAt(e.position); z(s); ) s = e.input.charCodeAt(++e.position);
                        if (58 === s)
                          (X((s = e.input.charCodeAt(++e.position))) ||
                            fe(
                              e,
                              'a whitespace character is expected after the key-value separator within a block mapping'
                            ),
                            y && (ye(e, f, d, h, g, null, a, l, c), (h = g = m = null)),
                            (b = !0),
                            (y = !1),
                            (r = !1),
                            (h = e.tag),
                            (g = e.result));
                        else {
                          if (!b) return ((e.tag = u), (e.anchor = p), !0);
                          fe(e, 'can not read an implicit mapping pair; a colon is missed');
                        }
                      } else {
                        if (!b) return ((e.tag = u), (e.anchor = p), !0);
                        fe(
                          e,
                          'can not read a block mapping entry; a multiline key may not be an implicit key'
                        );
                      }
                    } else
                      (63 === s
                        ? (y && (ye(e, f, d, h, g, null, a, l, c), (h = g = m = null)),
                          (b = !0),
                          (y = !0),
                          (r = !0))
                        : y
                          ? ((y = !1), (r = !0))
                          : fe(
                              e,
                              'incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line'
                            ),
                        (e.position += 1),
                        (s = i));
                    if (
                      ((e.line === o || e.lineIndent > t) &&
                        (y && ((a = e.line), (l = e.lineStart), (c = e.position)),
                        Ie(e, t, 4, !0, r) && (y ? (g = e.result) : (m = e.result)),
                        y || (ye(e, f, d, h, g, m, a, l, c), (h = g = m = null)),
                        Ae(e, !0, -1),
                        (s = e.input.charCodeAt(e.position))),
                      (e.line === o || e.lineIndent > t) && 0 !== s)
                    )
                      fe(e, 'bad indentation of a mapping entry');
                    else if (e.lineIndent < t) break;
                  }
                  return (
                    y && ye(e, f, d, h, g, null, a, l, c),
                    b && ((e.tag = u), (e.anchor = p), (e.kind = 'mapping'), (e.result = f)),
                    b
                  );
                })(e, h, d))) ||
            (function (e, t) {
              var n,
                i,
                r,
                o,
                a,
                l,
                c,
                s,
                u,
                p,
                f,
                d,
                h = !0,
                g = e.tag,
                m = e.anchor,
                y = Object.create(null);
              if (91 === (d = e.input.charCodeAt(e.position))) ((a = 93), (s = !1), (o = []));
              else {
                if (123 !== d) return !1;
                ((a = 125), (s = !0), (o = {}));
              }
              for (
                null !== e.anchor && (e.anchorMap[e.anchor] = o), d = e.input.charCodeAt(++e.position);
                0 !== d;
              ) {
                if ((Ae(e, !0, t), (d = e.input.charCodeAt(e.position)) === a))
                  return (
                    e.position++,
                    (e.tag = g),
                    (e.anchor = m),
                    (e.kind = s ? 'mapping' : 'sequence'),
                    (e.result = o),
                    !0
                  );
                (h
                  ? 44 === d && fe(e, "expected the node content, but found ','")
                  : fe(e, 'missed comma between flow collection entries'),
                  (f = null),
                  (l = c = !1),
                  63 === d &&
                    X(e.input.charCodeAt(e.position + 1)) &&
                    ((l = c = !0), e.position++, Ae(e, !0, t)),
                  (n = e.line),
                  (i = e.lineStart),
                  (r = e.position),
                  Ie(e, t, 1, !1, !0),
                  (p = e.tag),
                  (u = e.result),
                  Ae(e, !0, t),
                  (d = e.input.charCodeAt(e.position)),
                  (!c && e.line !== n) ||
                    58 !== d ||
                    ((l = !0),
                    (d = e.input.charCodeAt(++e.position)),
                    Ae(e, !0, t),
                    Ie(e, t, 1, !1, !0),
                    (f = e.result)),
                  s
                    ? ye(e, o, y, p, u, f, n, i, r)
                    : l
                      ? o.push(ye(e, null, y, p, u, f, n, i, r))
                      : o.push(u),
                  Ae(e, !0, t),
                  44 === (d = e.input.charCodeAt(e.position))
                    ? ((h = !0), (d = e.input.charCodeAt(++e.position)))
                    : (h = !1));
              }
              fe(e, 'unexpected end of the stream within a flow collection');
            })(e, d)
            ? (y = !0)
            : ((l &&
                (function (e, t) {
                  var i,
                    r,
                    o,
                    a,
                    l = 1,
                    c = !1,
                    s = !1,
                    u = t,
                    p = 0,
                    f = !1;
                  if (124 === (a = e.input.charCodeAt(e.position))) r = !1;
                  else {
                    if (62 !== a) return !1;
                    r = !0;
                  }
                  for (e.kind = 'scalar', e.result = ''; 0 !== a; )
                    if (43 === (a = e.input.charCodeAt(++e.position)) || 45 === a)
                      1 === l ? (l = 43 === a ? 3 : 2) : fe(e, 'repeat of a chomping mode identifier');
                    else {
                      if (!((o = ie(a)) >= 0)) break;
                      0 === o
                        ? fe(
                            e,
                            'bad explicit indentation width of a block scalar; it cannot be less than one'
                          )
                        : s
                          ? fe(e, 'repeat of an indentation width identifier')
                          : ((u = t + o - 1), (s = !0));
                    }
                  if (z(a)) {
                    do {
                      a = e.input.charCodeAt(++e.position);
                    } while (z(a));
                    if (35 === a)
                      do {
                        a = e.input.charCodeAt(++e.position);
                      } while (!Q(a) && 0 !== a);
                  }
                  for (; 0 !== a; ) {
                    for (
                      be(e), e.lineIndent = 0, a = e.input.charCodeAt(e.position);
                      (!s || e.lineIndent < u) && 32 === a;
                    )
                      (e.lineIndent++, (a = e.input.charCodeAt(++e.position)));
                    if ((!s && e.lineIndent > u && (u = e.lineIndent), Q(a))) p++;
                    else {
                      if (e.lineIndent < u) {
                        3 === l
                          ? (e.result += n.repeat('\n', c ? 1 + p : p))
                          : 1 === l && c && (e.result += '\n');
                        break;
                      }
                      for (
                        r
                          ? z(a)
                            ? ((f = !0), (e.result += n.repeat('\n', c ? 1 + p : p)))
                            : f
                              ? ((f = !1), (e.result += n.repeat('\n', p + 1)))
                              : 0 === p
                                ? c && (e.result += ' ')
                                : (e.result += n.repeat('\n', p))
                          : (e.result += n.repeat('\n', c ? 1 + p : p)),
                          c = !0,
                          s = !0,
                          p = 0,
                          i = e.position;
                        !Q(a) && 0 !== a;
                      )
                        a = e.input.charCodeAt(++e.position);
                      ge(e, i, e.position, !1);
                    }
                  }
                  return !0;
                })(e, d)) ||
              (function (e, t) {
                var n, i, r;
                if (39 !== (n = e.input.charCodeAt(e.position))) return !1;
                for (
                  e.kind = 'scalar', e.result = '', e.position++, i = r = e.position;
                  0 !== (n = e.input.charCodeAt(e.position));
                )
                  if (39 === n) {
                    if ((ge(e, i, e.position, !0), 39 !== (n = e.input.charCodeAt(++e.position)))) return !0;
                    ((i = e.position), e.position++, (r = e.position));
                  } else
                    Q(n)
                      ? (ge(e, i, r, !0), we(e, Ae(e, !1, t)), (i = r = e.position))
                      : e.position === e.lineStart && ve(e)
                        ? fe(e, 'unexpected end of the document within a single quoted scalar')
                        : (e.position++, (r = e.position));
                fe(e, 'unexpected end of the stream within a single quoted scalar');
              })(e, d) ||
              (function (e, t) {
                var n, i, r, o, a, l;
                if (34 !== (l = e.input.charCodeAt(e.position))) return !1;
                for (
                  e.kind = 'scalar', e.result = '', e.position++, n = i = e.position;
                  0 !== (l = e.input.charCodeAt(e.position));
                ) {
                  if (34 === l) return (ge(e, n, e.position, !0), e.position++, !0);
                  if (92 === l) {
                    if ((ge(e, n, e.position, !0), Q((l = e.input.charCodeAt(++e.position))))) Ae(e, !1, t);
                    else if (l < 256 && le[l]) ((e.result += ce[l]), e.position++);
                    else if ((a = ne(l)) > 0) {
                      for (r = a, o = 0; r > 0; r--)
                        (a = te((l = e.input.charCodeAt(++e.position)))) >= 0
                          ? (o = (o << 4) + a)
                          : fe(e, 'expected hexadecimal character');
                      ((e.result += oe(o)), e.position++);
                    } else fe(e, 'unknown escape sequence');
                    n = i = e.position;
                  } else
                    Q(l)
                      ? (ge(e, n, i, !0), we(e, Ae(e, !1, t)), (n = i = e.position))
                      : e.position === e.lineStart && ve(e)
                        ? fe(e, 'unexpected end of the document within a double quoted scalar')
                        : (e.position++, (i = e.position));
                }
                fe(e, 'unexpected end of the stream within a double quoted scalar');
              })(e, d)
                ? (y = !0)
                : !(function (e) {
                      var t, n, i;
                      if (42 !== (i = e.input.charCodeAt(e.position))) return !1;
                      for (i = e.input.charCodeAt(++e.position), t = e.position; 0 !== i && !X(i) && !ee(i); )
                        i = e.input.charCodeAt(++e.position);
                      return (
                        e.position === t &&
                          fe(e, 'name of an alias node must contain at least one character'),
                        (n = e.input.slice(t, e.position)),
                        W.call(e.anchorMap, n) || fe(e, 'unidentified alias "' + n + '"'),
                        (e.result = e.anchorMap[n]),
                        Ae(e, !0, -1),
                        !0
                      );
                    })(e)
                  ? (function (e, t, n) {
                      var i,
                        r,
                        o,
                        a,
                        l,
                        c,
                        s,
                        u,
                        p = e.kind,
                        f = e.result;
                      if (
                        X((u = e.input.charCodeAt(e.position))) ||
                        ee(u) ||
                        35 === u ||
                        38 === u ||
                        42 === u ||
                        33 === u ||
                        124 === u ||
                        62 === u ||
                        39 === u ||
                        34 === u ||
                        37 === u ||
                        64 === u ||
                        96 === u
                      )
                        return !1;
                      if (
                        (63 === u || 45 === u) &&
                        (X((i = e.input.charCodeAt(e.position + 1))) || (n && ee(i)))
                      )
                        return !1;
                      for (e.kind = 'scalar', e.result = '', r = o = e.position, a = !1; 0 !== u; ) {
                        if (58 === u) {
                          if (X((i = e.input.charCodeAt(e.position + 1))) || (n && ee(i))) break;
                        } else if (35 === u) {
                          if (X(e.input.charCodeAt(e.position - 1))) break;
                        } else {
                          if ((e.position === e.lineStart && ve(e)) || (n && ee(u))) break;
                          if (Q(u)) {
                            if (
                              ((l = e.line),
                              (c = e.lineStart),
                              (s = e.lineIndent),
                              Ae(e, !1, -1),
                              e.lineIndent >= t)
                            ) {
                              ((a = !0), (u = e.input.charCodeAt(e.position)));
                              continue;
                            }
                            ((e.position = o), (e.line = l), (e.lineStart = c), (e.lineIndent = s));
                            break;
                          }
                        }
                        (a && (ge(e, r, o, !1), we(e, e.line - l), (r = o = e.position), (a = !1)),
                          z(u) || (o = e.position + 1),
                          (u = e.input.charCodeAt(++e.position)));
                      }
                      return (ge(e, r, o, !1), !!e.result || ((e.kind = p), (e.result = f), !1));
                    })(e, d, 1 === i) && ((y = !0), null === e.tag && (e.tag = '?'))
                  : ((y = !0),
                    (null === e.tag && null === e.anchor) ||
                      fe(e, 'alias node should not have any properties')),
              null !== e.anchor && (e.anchorMap[e.anchor] = e.result))
          : 0 === g && (y = c && ke(e, h))),
      null === e.tag)
    )
      null !== e.anchor && (e.anchorMap[e.anchor] = e.result);
    else if ('?' === e.tag) {
      for (
        null !== e.result &&
          'scalar' !== e.kind &&
          fe(e, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + e.kind + '"'),
          s = 0,
          u = e.implicitTypes.length;
        s < u;
        s += 1
      )
        if ((f = e.implicitTypes[s]).resolve(e.result)) {
          ((e.result = f.construct(e.result)),
            (e.tag = f.tag),
            null !== e.anchor && (e.anchorMap[e.anchor] = e.result));
          break;
        }
    } else if ('!' !== e.tag) {
      if (W.call(e.typeMap[e.kind || 'fallback'], e.tag)) f = e.typeMap[e.kind || 'fallback'][e.tag];
      else
        for (f = null, s = 0, u = (p = e.typeMap.multi[e.kind || 'fallback']).length; s < u; s += 1)
          if (e.tag.slice(0, p[s].tag.length) === p[s].tag) {
            f = p[s];
            break;
          }
      (f || fe(e, 'unknown tag !<' + e.tag + '>'),
        null !== e.result &&
          f.kind !== e.kind &&
          fe(
            e,
            'unacceptable node kind for !<' +
              e.tag +
              '> tag; it should be "' +
              f.kind +
              '", not "' +
              e.kind +
              '"'
          ),
        f.resolve(e.result, e.tag)
          ? ((e.result = f.construct(e.result, e.tag)),
            null !== e.anchor && (e.anchorMap[e.anchor] = e.result))
          : fe(e, 'cannot resolve a node with !<' + e.tag + '> explicit tag'));
    }
    return (null !== e.listener && e.listener('close', e), null !== e.tag || null !== e.anchor || y);
  }
  function Se(e) {
    var t,
      n,
      i,
      r,
      o = e.position,
      a = !1;
    for (
      e.version = null,
        e.checkLineBreaks = e.legacy,
        e.tagMap = Object.create(null),
        e.anchorMap = Object.create(null);
      0 !== (r = e.input.charCodeAt(e.position)) &&
      (Ae(e, !0, -1), (r = e.input.charCodeAt(e.position)), !(e.lineIndent > 0 || 37 !== r));
    ) {
      for (a = !0, r = e.input.charCodeAt(++e.position), t = e.position; 0 !== r && !X(r); )
        r = e.input.charCodeAt(++e.position);
      for (
        i = [],
          (n = e.input.slice(t, e.position)).length < 1 &&
            fe(e, 'directive name must not be less than one character in length');
        0 !== r;
      ) {
        for (; z(r); ) r = e.input.charCodeAt(++e.position);
        if (35 === r) {
          do {
            r = e.input.charCodeAt(++e.position);
          } while (0 !== r && !Q(r));
          break;
        }
        if (Q(r)) break;
        for (t = e.position; 0 !== r && !X(r); ) r = e.input.charCodeAt(++e.position);
        i.push(e.input.slice(t, e.position));
      }
      (0 !== r && be(e), W.call(he, n) ? he[n](e, n, i) : de(e, 'unknown document directive "' + n + '"'));
    }
    (Ae(e, !0, -1),
      0 === e.lineIndent &&
      45 === e.input.charCodeAt(e.position) &&
      45 === e.input.charCodeAt(e.position + 1) &&
      45 === e.input.charCodeAt(e.position + 2)
        ? ((e.position += 3), Ae(e, !0, -1))
        : a && fe(e, 'directives end mark is expected'),
      Ie(e, e.lineIndent - 1, 4, !1, !0),
      Ae(e, !0, -1),
      e.checkLineBreaks &&
        $.test(e.input.slice(o, e.position)) &&
        de(e, 'non-ASCII line breaks are interpreted as content'),
      e.documents.push(e.result),
      e.position === e.lineStart && ve(e)
        ? 46 === e.input.charCodeAt(e.position) && ((e.position += 3), Ae(e, !0, -1))
        : e.position < e.length - 1 && fe(e, 'end of the stream or a document separator is expected'));
  }
  function Oe(e, t) {
    ((t = t || {}),
      0 !== (e = String(e)).length &&
        (10 !== e.charCodeAt(e.length - 1) && 13 !== e.charCodeAt(e.length - 1) && (e += '\n'),
        65279 === e.charCodeAt(0) && (e = e.slice(1))));
    var n = new ue(e, t),
      i = e.indexOf('\0');
    for (
      -1 !== i && ((n.position = i), fe(n, 'null byte is not allowed in input')), n.input += '\0';
      32 === n.input.charCodeAt(n.position);
    )
      ((n.lineIndent += 1), (n.position += 1));
    for (; n.position < n.length - 1; ) Se(n);
    return n.documents;
  }
  var je = {
      loadAll: function (e, t, n) {
        null !== t && 'object' == typeof t && void 0 === n && ((n = t), (t = null));
        var i = Oe(e, n);
        if ('function' != typeof t) return i;
        for (var r = 0, o = i.length; r < o; r += 1) t(i[r]);
      },
      load: function (e, t) {
        var n = Oe(e, t);
        if (0 !== n.length) {
          if (1 === n.length) return n[0];
          throw new o('expected a single document in the stream, but found more');
        }
      }
    },
    Te = Object.prototype.toString,
    Ne = Object.prototype.hasOwnProperty,
    Fe = 65279,
    Ee = {
      0: '\\0',
      7: '\\a',
      8: '\\b',
      9: '\\t',
      10: '\\n',
      11: '\\v',
      12: '\\f',
      13: '\\r',
      27: '\\e',
      34: '\\"',
      92: '\\\\',
      133: '\\N',
      160: '\\_',
      8232: '\\L',
      8233: '\\P'
    },
    Me = ['y', 'Y', 'yes', 'Yes', 'YES', 'on', 'On', 'ON', 'n', 'N', 'no', 'No', 'NO', 'off', 'Off', 'OFF'],
    Le = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
  function _e(e) {
    var t, i, r;
    if (((t = e.toString(16).toUpperCase()), e <= 255)) ((i = 'x'), (r = 2));
    else if (e <= 65535) ((i = 'u'), (r = 4));
    else {
      if (!(e <= 4294967295)) throw new o('code point within a string may not be greater than 0xFFFFFFFF');
      ((i = 'U'), (r = 8));
    }
    return '\\' + i + n.repeat('0', r - t.length) + t;
  }
  function De(e) {
    ((this.schema = e.schema || P),
      (this.indent = Math.max(1, e.indent || 2)),
      (this.noArrayIndent = e.noArrayIndent || !1),
      (this.skipInvalid = e.skipInvalid || !1),
      (this.flowLevel = n.isNothing(e.flowLevel) ? -1 : e.flowLevel),
      (this.styleMap = (function (e, t) {
        var n, i, r, o, a, l, c;
        if (null === t) return {};
        for (n = {}, r = 0, o = (i = Object.keys(t)).length; r < o; r += 1)
          ((a = i[r]),
            (l = String(t[a])),
            '!!' === a.slice(0, 2) && (a = 'tag:yaml.org,2002:' + a.slice(2)),
            (c = e.compiledTypeMap.fallback[a]) && Ne.call(c.styleAliases, l) && (l = c.styleAliases[l]),
            (n[a] = l));
        return n;
      })(this.schema, e.styles || null)),
      (this.sortKeys = e.sortKeys || !1),
      (this.lineWidth = e.lineWidth || 80),
      (this.noRefs = e.noRefs || !1),
      (this.noCompatMode = e.noCompatMode || !1),
      (this.condenseFlow = e.condenseFlow || !1),
      (this.quotingType = '"' === e.quotingType ? 2 : 1),
      (this.forceQuotes = e.forceQuotes || !1),
      (this.replacer = 'function' == typeof e.replacer ? e.replacer : null),
      (this.implicitTypes = this.schema.compiledImplicit),
      (this.explicitTypes = this.schema.compiledExplicit),
      (this.tag = null),
      (this.result = ''),
      (this.duplicates = []),
      (this.usedDuplicates = null));
  }
  function Ue(e, t) {
    for (var i, r = n.repeat(' ', t), o = 0, a = -1, l = '', c = e.length; o < c; )
      (-1 === (a = e.indexOf('\n', o)) ? ((i = e.slice(o)), (o = c)) : ((i = e.slice(o, a + 1)), (o = a + 1)),
        i.length && '\n' !== i && (l += r),
        (l += i));
    return l;
  }
  function qe(e, t) {
    return '\n' + n.repeat(' ', e.indent * t);
  }
  function Ye(e) {
    return 32 === e || 9 === e;
  }
  function Re(e) {
    return (
      (32 <= e && e <= 126) ||
      (161 <= e && e <= 55295 && 8232 !== e && 8233 !== e) ||
      (57344 <= e && e <= 65533 && e !== Fe) ||
      (65536 <= e && e <= 1114111)
    );
  }
  function Be(e) {
    return Re(e) && e !== Fe && 13 !== e && 10 !== e;
  }
  function Ke(e, t, n) {
    var i = Be(e),
      r = i && !Ye(e);
    return (
      ((n ? i : i && 44 !== e && 91 !== e && 93 !== e && 123 !== e && 125 !== e) &&
        35 !== e &&
        !(58 === t && !r)) ||
      (Be(t) && !Ye(t) && 35 === e) ||
      (58 === t && r)
    );
  }
  function Pe(e, t) {
    var n,
      i = e.charCodeAt(t);
    return i >= 55296 && i <= 56319 && t + 1 < e.length && (n = e.charCodeAt(t + 1)) >= 56320 && n <= 57343
      ? 1024 * (i - 55296) + n - 56320 + 65536
      : i;
  }
  function We(e) {
    return /^\n* /.test(e);
  }
  function He(e, t, n, i, r, o, a, l) {
    var c,
      s,
      u = 0,
      p = null,
      f = !1,
      d = !1,
      h = -1 !== i,
      g = -1,
      m =
        Re((s = Pe(e, 0))) &&
        s !== Fe &&
        !Ye(s) &&
        45 !== s &&
        63 !== s &&
        58 !== s &&
        44 !== s &&
        91 !== s &&
        93 !== s &&
        123 !== s &&
        125 !== s &&
        35 !== s &&
        38 !== s &&
        42 !== s &&
        33 !== s &&
        124 !== s &&
        61 !== s &&
        62 !== s &&
        39 !== s &&
        34 !== s &&
        37 !== s &&
        64 !== s &&
        96 !== s &&
        (function (e) {
          return !Ye(e) && 58 !== e;
        })(Pe(e, e.length - 1));
    if (t || a)
      for (c = 0; c < e.length; u >= 65536 ? (c += 2) : c++) {
        if (!Re((u = Pe(e, c)))) return 5;
        ((m = m && Ke(u, p, l)), (p = u));
      }
    else {
      for (c = 0; c < e.length; u >= 65536 ? (c += 2) : c++) {
        if (10 === (u = Pe(e, c))) ((f = !0), h && ((d = d || (c - g - 1 > i && ' ' !== e[g + 1])), (g = c)));
        else if (!Re(u)) return 5;
        ((m = m && Ke(u, p, l)), (p = u));
      }
      d = d || (h && c - g - 1 > i && ' ' !== e[g + 1]);
    }
    return f || d
      ? n > 9 && We(e)
        ? 5
        : a
          ? 2 === o
            ? 5
            : 2
          : d
            ? 4
            : 3
      : !m || a || r(e)
        ? 2 === o
          ? 5
          : 2
        : 1;
  }
  function $e(e, t, n, i, r) {
    e.dump = (function () {
      if (0 === t.length) return 2 === e.quotingType ? '""' : "''";
      if (!e.noCompatMode && (-1 !== Me.indexOf(t) || Le.test(t)))
        return 2 === e.quotingType ? '"' + t + '"' : "'" + t + "'";
      var a = e.indent * Math.max(1, n),
        l = -1 === e.lineWidth ? -1 : Math.max(Math.min(e.lineWidth, 40), e.lineWidth - a),
        c = i || (e.flowLevel > -1 && n >= e.flowLevel);
      switch (
        He(
          t,
          c,
          e.indent,
          l,
          function (t) {
            return (function (e, t) {
              var n, i;
              for (n = 0, i = e.implicitTypes.length; n < i; n += 1)
                if (e.implicitTypes[n].resolve(t)) return !0;
              return !1;
            })(e, t);
          },
          e.quotingType,
          e.forceQuotes && !i,
          r
        )
      ) {
        case 1:
          return t;
        case 2:
          return "'" + t.replace(/'/g, "''") + "'";
        case 3:
          return '|' + Ge(t, e.indent) + Ve(Ue(t, a));
        case 4:
          return (
            '>' +
            Ge(t, e.indent) +
            Ve(
              Ue(
                (function (e, t) {
                  var n,
                    i,
                    r = /(\n+)([^\n]*)/g,
                    o =
                      ((l = e.indexOf('\n')),
                      (l = -1 !== l ? l : e.length),
                      (r.lastIndex = l),
                      Ze(e.slice(0, l), t)),
                    a = '\n' === e[0] || ' ' === e[0];
                  var l;
                  for (; (i = r.exec(e)); ) {
                    var c = i[1],
                      s = i[2];
                    ((n = ' ' === s[0]), (o += c + (a || n || '' === s ? '' : '\n') + Ze(s, t)), (a = n));
                  }
                  return o;
                })(t, l),
                a
              )
            )
          );
        case 5:
          return (
            '"' +
            (function (e) {
              for (var t, n = '', i = 0, r = 0; r < e.length; i >= 65536 ? (r += 2) : r++)
                ((i = Pe(e, r)),
                  !(t = Ee[i]) && Re(i) ? ((n += e[r]), i >= 65536 && (n += e[r + 1])) : (n += t || _e(i)));
              return n;
            })(t) +
            '"'
          );
        default:
          throw new o('impossible error: invalid scalar style');
      }
    })();
  }
  function Ge(e, t) {
    var n = We(e) ? String(t) : '',
      i = '\n' === e[e.length - 1];
    return n + (i && ('\n' === e[e.length - 2] || '\n' === e) ? '+' : i ? '' : '-') + '\n';
  }
  function Ve(e) {
    return '\n' === e[e.length - 1] ? e.slice(0, -1) : e;
  }
  function Ze(e, t) {
    if ('' === e || ' ' === e[0]) return e;
    for (var n, i, r = / [^ ]/g, o = 0, a = 0, l = 0, c = ''; (n = r.exec(e)); )
      ((l = n.index) - o > t && ((i = a > o ? a : l), (c += '\n' + e.slice(o, i)), (o = i + 1)), (a = l));
    return (
      (c += '\n'),
      e.length - o > t && a > o ? (c += e.slice(o, a) + '\n' + e.slice(a + 1)) : (c += e.slice(o)),
      c.slice(1)
    );
  }
  function Je(e, t, n, i) {
    var r,
      o,
      a,
      l = '',
      c = e.tag;
    for (r = 0, o = n.length; r < o; r += 1)
      ((a = n[r]),
        e.replacer && (a = e.replacer.call(n, String(r), a)),
        (ze(e, t + 1, a, !0, !0, !1, !0) || (void 0 === a && ze(e, t + 1, null, !0, !0, !1, !0))) &&
          ((i && '' === l) || (l += qe(e, t)),
          e.dump && 10 === e.dump.charCodeAt(0) ? (l += '-') : (l += '- '),
          (l += e.dump)));
    ((e.tag = c), (e.dump = l || '[]'));
  }
  function Qe(e, t, n) {
    var i, r, a, l, c, s;
    for (a = 0, l = (r = n ? e.explicitTypes : e.implicitTypes).length; a < l; a += 1)
      if (
        ((c = r[a]).instanceOf || c.predicate) &&
        (!c.instanceOf || ('object' == typeof t && t instanceof c.instanceOf)) &&
        (!c.predicate || c.predicate(t))
      ) {
        if (
          (n ? (c.multi && c.representName ? (e.tag = c.representName(t)) : (e.tag = c.tag)) : (e.tag = '?'),
          c.represent)
        ) {
          if (((s = e.styleMap[c.tag] || c.defaultStyle), '[object Function]' === Te.call(c.represent)))
            i = c.represent(t, s);
          else {
            if (!Ne.call(c.represent, s))
              throw new o('!<' + c.tag + '> tag resolver accepts not "' + s + '" style');
            i = c.represent[s](t, s);
          }
          e.dump = i;
        }
        return !0;
      }
    return !1;
  }
  function ze(e, t, n, i, r, a, l) {
    ((e.tag = null), (e.dump = n), Qe(e, n, !1) || Qe(e, n, !0));
    var c,
      s = Te.call(e.dump),
      u = i;
    i && (i = e.flowLevel < 0 || e.flowLevel > t);
    var p,
      f,
      d = '[object Object]' === s || '[object Array]' === s;
    if (
      (d && (f = -1 !== (p = e.duplicates.indexOf(n))),
      ((null !== e.tag && '?' !== e.tag) || f || (2 !== e.indent && t > 0)) && (r = !1),
      f && e.usedDuplicates[p])
    )
      e.dump = '*ref_' + p;
    else {
      if ((d && f && !e.usedDuplicates[p] && (e.usedDuplicates[p] = !0), '[object Object]' === s))
        i && 0 !== Object.keys(e.dump).length
          ? (!(function (e, t, n, i) {
              var r,
                a,
                l,
                c,
                s,
                u,
                p = '',
                f = e.tag,
                d = Object.keys(n);
              if (!0 === e.sortKeys) d.sort();
              else if ('function' == typeof e.sortKeys) d.sort(e.sortKeys);
              else if (e.sortKeys) throw new o('sortKeys must be a boolean or a function');
              for (r = 0, a = d.length; r < a; r += 1)
                ((u = ''),
                  (i && '' === p) || (u += qe(e, t)),
                  (c = n[(l = d[r])]),
                  e.replacer && (c = e.replacer.call(n, l, c)),
                  ze(e, t + 1, l, !0, !0, !0) &&
                    ((s = (null !== e.tag && '?' !== e.tag) || (e.dump && e.dump.length > 1024)) &&
                      (e.dump && 10 === e.dump.charCodeAt(0) ? (u += '?') : (u += '? ')),
                    (u += e.dump),
                    s && (u += qe(e, t)),
                    ze(e, t + 1, c, !0, s) &&
                      (e.dump && 10 === e.dump.charCodeAt(0) ? (u += ':') : (u += ': '),
                      (p += u += e.dump))));
              ((e.tag = f), (e.dump = p || '{}'));
            })(e, t, e.dump, r),
            f && (e.dump = '&ref_' + p + e.dump))
          : (!(function (e, t, n) {
              var i,
                r,
                o,
                a,
                l,
                c = '',
                s = e.tag,
                u = Object.keys(n);
              for (i = 0, r = u.length; i < r; i += 1)
                ((l = ''),
                  '' !== c && (l += ', '),
                  e.condenseFlow && (l += '"'),
                  (a = n[(o = u[i])]),
                  e.replacer && (a = e.replacer.call(n, o, a)),
                  ze(e, t, o, !1, !1) &&
                    (e.dump.length > 1024 && (l += '? '),
                    (l += e.dump + (e.condenseFlow ? '"' : '') + ':' + (e.condenseFlow ? '' : ' ')),
                    ze(e, t, a, !1, !1) && (c += l += e.dump)));
              ((e.tag = s), (e.dump = '{' + c + '}'));
            })(e, t, e.dump),
            f && (e.dump = '&ref_' + p + ' ' + e.dump));
      else if ('[object Array]' === s)
        i && 0 !== e.dump.length
          ? (e.noArrayIndent && !l && t > 0 ? Je(e, t - 1, e.dump, r) : Je(e, t, e.dump, r),
            f && (e.dump = '&ref_' + p + e.dump))
          : (!(function (e, t, n) {
              var i,
                r,
                o,
                a = '',
                l = e.tag;
              for (i = 0, r = n.length; i < r; i += 1)
                ((o = n[i]),
                  e.replacer && (o = e.replacer.call(n, String(i), o)),
                  (ze(e, t, o, !1, !1) || (void 0 === o && ze(e, t, null, !1, !1))) &&
                    ('' !== a && (a += ',' + (e.condenseFlow ? '' : ' ')), (a += e.dump)));
              ((e.tag = l), (e.dump = '[' + a + ']'));
            })(e, t, e.dump),
            f && (e.dump = '&ref_' + p + ' ' + e.dump));
      else {
        if ('[object String]' !== s) {
          if ('[object Undefined]' === s) return !1;
          if (e.skipInvalid) return !1;
          throw new o('unacceptable kind of an object to dump ' + s);
        }
        '?' !== e.tag && $e(e, e.dump, t, a, u);
      }
      null !== e.tag &&
        '?' !== e.tag &&
        ((c = encodeURI('!' === e.tag[0] ? e.tag.slice(1) : e.tag).replace(/!/g, '%21')),
        (c =
          '!' === e.tag[0]
            ? '!' + c
            : 'tag:yaml.org,2002:' === c.slice(0, 18)
              ? '!!' + c.slice(18)
              : '!<' + c + '>'),
        (e.dump = c + ' ' + e.dump));
    }
    return !0;
  }
  function Xe(e, t) {
    var n,
      i,
      r = [],
      o = [];
    for (et(e, r, o), n = 0, i = o.length; n < i; n += 1) t.duplicates.push(r[o[n]]);
    t.usedDuplicates = new Array(i);
  }
  function et(e, t, n) {
    var i, r, o;
    if (null !== e && 'object' == typeof e)
      if (-1 !== (r = t.indexOf(e))) -1 === n.indexOf(r) && n.push(r);
      else if ((t.push(e), Array.isArray(e))) for (r = 0, o = e.length; r < o; r += 1) et(e[r], t, n);
      else for (r = 0, o = (i = Object.keys(e)).length; r < o; r += 1) et(e[i[r]], t, n);
  }
  function tt(e, t) {
    return function () {
      throw new Error(
        'Function yaml.' +
          e +
          ' is removed in js-yaml 4. Use yaml.' +
          t +
          ' instead, which is now safe by default.'
      );
    };
  }
  var nt = p,
    it = h,
    rt = b,
    ot = j,
    at = T,
    lt = P,
    ct = je.load,
    st = je.loadAll,
    ut = {
      dump: function (e, t) {
        var n = new De((t = t || {}));
        n.noRefs || Xe(e, n);
        var i = e;
        return (
          n.replacer && (i = n.replacer.call({ '': i }, '', i)),
          ze(n, 0, i, !0, !0) ? n.dump + '\n' : ''
        );
      }
    }.dump,
    pt = o,
    ft = {
      binary: _,
      float: O,
      map: y,
      null: A,
      pairs: R,
      set: K,
      timestamp: E,
      bool: v,
      int: x,
      merge: M,
      omap: q,
      seq: m,
      str: g
    },
    dt = tt('safeLoad', 'load'),
    ht = tt('safeLoadAll', 'loadAll'),
    gt = tt('safeDump', 'dump'),
    mt = {
      Type: nt,
      Schema: it,
      FAILSAFE_SCHEMA: rt,
      JSON_SCHEMA: ot,
      CORE_SCHEMA: at,
      DEFAULT_SCHEMA: lt,
      load: ct,
      loadAll: st,
      dump: ut,
      YAMLException: pt,
      types: ft,
      safeLoad: dt,
      safeLoadAll: ht,
      safeDump: gt
    };
  ((e.CORE_SCHEMA = at),
    (e.DEFAULT_SCHEMA = lt),
    (e.FAILSAFE_SCHEMA = rt),
    (e.JSON_SCHEMA = ot),
    (e.Schema = it),
    (e.Type = nt),
    (e.YAMLException = pt),
    (e.default = mt),
    (e.dump = ut),
    (e.load = ct),
    (e.loadAll = st),
    (e.safeDump = gt),
    (e.safeLoad = dt),
    (e.safeLoadAll = ht),
    (e.types = ft),
    Object.defineProperty(e, '__esModule', { value: !0 }));
});
;

// ═══════════════ Svg.gs ═══════════════
/**
 * Svg.gs — SVG 上傳清除（規劃書 5.3、風險表）
 *
 * 做法：把 SVG 逐字切成「標籤、文字、註解」權杖，再重新組出安全版本。
 * 不用正規表示式整段取代，因為那種做法很容易被大小寫、換行、實體編碼繞過。
 *
 * 清除項目
 *  - 元素：script、foreignObject（含其底下所有子孫）
 *  - 屬性：所有 on 開頭的事件屬性
 *  - 連結：href、xlink:href 等的值若為 javascript:、vbscript:、data:text/html，或任何外部網址（http(s)、//…），移除該屬性
 *  - 動畫：animate／set 若要改 href 或 on* 屬性，整個元素移除
 *  - CSS：<style> 與 style 屬性內的 @import、expression()、javascript:、指向外部的 url() 一律中和
 *  - CDATA：樣式表以外的位置轉成純文字
 *  - 註解、處理指令、DOCTYPE（含實體宣告）一律移除
 * 格式不合法（標籤沒配對、不是 svg 根元素、有 <!ENTITY）則直接拒絕，不嘗試修補。
 *
 * 已知限制：顯示一律用 <img>，瀏覽器在該模式下本來就不執行腳本、不載入外部資源，
 * 這裡是第二層防線。<style> 只中和已知的危險寫法，不做完整 CSS 解析。
 */

var SVG_BLOCKED_ELEMENTS_ = { script: 1, foreignobject: 1 };
var SVG_URL_ATTRS_ = { href: 1, 'xlink:href': 1, src: 1, action: 1, formaction: 1 };

function svgLocalName_(name) {
  const i = name.indexOf(':');
  return (i >= 0 ? name.slice(i + 1) : name).toLowerCase();
}

/** 還原數字實體與常見具名實體後，去掉控制字元與空白，用來偵測被編碼藏起來的 javascript: */
function svgNormalizeUrl_(v) {
  let s = String(v)
    .replace(/&#x([0-9a-f]+);?/gi, function (m, h) {
      return String.fromCharCode(parseInt(h, 16));
    })
    .replace(/&#(\d+);?/g, function (m, d) {
      return String.fromCharCode(parseInt(d, 10));
    })
    .replace(/&colon;/gi, ':')
    .replace(/&tab;/gi, '')
    .replace(/&newline;/gi, '');
  return s.replace(/[\u0000-\u0020\u007f-\u009f]+/g, '').toLowerCase();
}

function svgIsDangerousUrl_(v) {
  const s = svgNormalizeUrl_(v);
  return s.indexOf('javascript:') === 0 || s.indexOf('vbscript:') === 0 || s.indexOf('data:text/html') === 0;
}

/** 外部參照：任何帶協定（http:、https:、ftp:、file: 等）或 // 開頭的網址。內部錨點（#id）與相對路徑不算。 */
function svgIsExternalUrl_(v) {
  const s = svgNormalizeUrl_(v);
  return /^[a-z][a-z0-9+.-]*:/.test(s) || s.indexOf('//') === 0;
}

/** 清除 CSS 裡會載入外部資源或執行腳本的寫法：@import、expression()、javascript:、指向外部的 url()。 */
function svgCleanCss_(css, removed) {
  let hit = false;
  const NEST = '(?:[^()]|\\([^()]*\\))*'; // 允許括號內再有一層括號，例如 url(javascript:alert(1))
  const out = String(css)
    .replace(/@import[^;{]*;?/gi, function () {
      hit = true;
      return '';
    })
    .replace(new RegExp('expression\\s*\\(' + NEST + '\\)', 'gi'), function () {
      hit = true;
      return 'none';
    })
    .replace(new RegExp('url\\s*\\((' + NEST + ')\\)', 'gi'), function (m, u) {
      if (svgNormalizeUrl_(u.replace(/^\s*['"]|['"]\s*$/g, '')).indexOf('#') === 0) return m;
      hit = true;
      return 'none';
    })
    .replace(/(?:java|vb)script\s*:/gi, function () {
      hit = true;
      return 'blocked:';
    });
  if (hit && removed) removed.push('CSS 外部參照或腳本');
  return out;
}

/** 讀出標籤結尾位置，引號內的 > 不算結尾。回傳 -1 表示沒結尾。 */
function svgFindTagEnd_(src, from) {
  let q = null;
  for (let i = from; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === q) q = null;
    } else if (ch === '"' || ch === "'") q = ch;
    else if (ch === '>') return i;
  }
  return -1;
}

function svgParseAttrs_(inner) {
  const attrs = [];
  const re = /([^\s=\/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>=`]+)))?/g;
  let m;
  while ((m = re.exec(inner)) !== null) {
    const v = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '';
    attrs.push({ name: m[1], value: v });
  }
  return attrs;
}

function sanitizeSvg_(source) {
  if (typeof source !== 'string' || source.trim() === '') return { ok: false, reason: 'SVG 內容是空的' };
  let src = source.replace(/^\uFEFF/, '');
  if (/<!ENTITY/i.test(src)) return { ok: false, reason: 'SVG 含有實體宣告，已拒絕' };

  const out = [];
  const stack = [];
  const removed = [];
  let skipLevel = null; // 正在跳過被封鎖元素時，記錄它的深度
  let rasterFound = false; // 是否出現內嵌點陣圖（data:image/png 等）
  let rootSeen = false,
    rootClosed = false;
  let i = 0;

  while (i < src.length) {
    const lt = src.indexOf('<', i);
    const text = lt === -1 ? src.slice(i) : src.slice(i, lt);
    if (text !== '') {
      if (stack.length === 0 && text.trim() !== '') return { ok: false, reason: 'SVG 根元素之外有多餘文字' };
      if (skipLevel === null && stack.length > 0)
        out.push(svgLocalName_(stack[stack.length - 1]) === 'style' ? svgCleanCss_(text, removed) : text);
    }
    if (lt === -1) break;

    if (src.startsWith('<!--', lt)) {
      const e = src.indexOf('-->', lt + 4);
      if (e === -1) return { ok: false, reason: '註解沒有結尾' };
      i = e + 3;
      continue;
    }
    if (src.startsWith('<![CDATA[', lt)) {
      const e = src.indexOf(']]>', lt + 9);
      if (e === -1) return { ok: false, reason: 'CDATA 沒有結尾' };
      if (skipLevel === null && stack.length > 0) {
        // CDATA：樣式表內清理後保留；其他位置一律轉成純文字，避免夾帶標記
        const raw = src.slice(lt + 9, e);
        if (svgLocalName_(stack[stack.length - 1]) === 'style')
          out.push('<![CDATA[' + svgCleanCss_(raw, removed) + ']]>');
        else out.push(raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
      }
      i = e + 3;
      continue;
    }
    if (src.startsWith('<?', lt)) {
      const e = src.indexOf('?>', lt + 2);
      if (e === -1) return { ok: false, reason: '處理指令沒有結尾' };
      i = e + 2;
      continue;
    }
    if (/^<!doctype/i.test(src.substr(lt, 10))) {
      const e = svgFindTagEnd_(src, lt + 2);
      if (e === -1 || src.slice(lt, e).indexOf('[') !== -1) return { ok: false, reason: 'DOCTYPE 不合法' };
      i = e + 1;
      continue;
    }

    const end = svgFindTagEnd_(src, lt + 1);
    if (end === -1) return { ok: false, reason: '標籤沒有結尾' };
    let inner = src.slice(lt + 1, end);
    i = end + 1;

    if (inner[0] === '/') {
      // 結束標籤
      const name = inner.slice(1).trim();
      if (stack.length === 0 || stack[stack.length - 1] !== name)
        return { ok: false, reason: '標籤沒有正確配對：' + name };
      const wasSkipping = skipLevel !== null;
      stack.pop();
      if (skipLevel !== null && stack.length < skipLevel) skipLevel = null;
      if (!wasSkipping) out.push('</' + name + '>');
      if (stack.length === 0) rootClosed = true;
      continue;
    }

    const selfClose = /\/\s*$/.test(inner);
    if (selfClose) inner = inner.replace(/\/\s*$/, '');
    const nm = /^[^\s\/>]+/.exec(inner);
    if (!nm) return { ok: false, reason: '標籤名稱不合法' };
    const name = nm[0];
    const local = svgLocalName_(name);

    if (stack.length === 0) {
      if (rootClosed) return { ok: false, reason: 'SVG 只能有一個根元素' };
      if (local !== 'svg') return { ok: false, reason: '根元素必須是 svg' };
      rootSeen = true;
    }

    let blocked = SVG_BLOCKED_ELEMENTS_[local] === 1;
    if (!blocked && (local === 'animate' || local === 'set')) {
      // 動畫不得去改連結或事件屬性（animate/set 能把 href 改成 javascript:）
      svgParseAttrs_(inner.slice(name.length)).forEach(function (a) {
        if (a.name.toLowerCase() !== 'attributename') return;
        const v = svgNormalizeUrl_(a.value);
        if (SVG_URL_ATTRS_[v] === 1 || v.indexOf('on') === 0) blocked = true;
      });
    }
    if (skipLevel === null && blocked) {
      removed.push('<' + local + '>');
      if (!selfClose) {
        stack.push(name);
        skipLevel = stack.length;
      }
      continue;
    }
    if (skipLevel !== null) {
      // 仍在被封鎖元素內：只追蹤深度，不輸出
      if (!selfClose) stack.push(name);
      continue;
    }

    let attrs = svgParseAttrs_(inner.slice(name.length));
    const kept = [];
    attrs.forEach(function (a) {
      const an = a.name.toLowerCase();
      if (an.indexOf('on') === 0) {
        removed.push('屬性 ' + an);
        return;
      }
      if (SVG_URL_ATTRS_[an] === 1 && /^data:image\/(?!svg\+xml)/.test(svgNormalizeUrl_(a.value))) {
        rasterFound = true;
        return;
      }
      if (SVG_URL_ATTRS_[an] === 1 && svgIsDangerousUrl_(a.value)) {
        removed.push('危險連結 ' + an);
        return;
      }
      if (SVG_URL_ATTRS_[an] === 1 && svgIsExternalUrl_(a.value)) {
        removed.push('外部連結 ' + an);
        return;
      }
      if (an === 'style') a = { name: a.name, value: svgCleanCss_(a.value, removed) };
      kept.push(a);
    });
    if (rasterFound) return { ok: false, reason: 'SVG 含內嵌點陣圖（base64），已拒絕；本專案不處理點陣圖' };
    if (
      stack.length === 0 &&
      !kept.some(function (a) {
        return a.name.toLowerCase() === 'xmlns';
      })
    ) {
      kept.unshift({ name: 'xmlns', value: 'http://www.w3.org/2000/svg' }); // <img> 顯示需要命名空間
    }
    const attrText = kept
      .map(function (a) {
        return ' ' + a.name + '="' + String(a.value).replace(/"/g, '&quot;') + '"';
      })
      .join('');
    out.push('<' + name + attrText + (selfClose ? '/>' : '>'));
    if (!selfClose) stack.push(name);
    else if (stack.length === 0) rootClosed = true;
  }

  if (!rootSeen) return { ok: false, reason: '找不到 svg 根元素' };
  if (stack.length !== 0) return { ok: false, reason: '標籤沒有全部關閉' };
  return { ok: true, svg: out.join(''), removed: removed };
}
;

// ═══════════════ Core.gs ═══════════════
/**
 * Core.gs — 讀書筆記 Vault 核心邏輯（P1）
 *
 * 所有函式都不直接碰 Drive 或 Sheets，儲存層由參數 store 傳入（正式版見 Store.gs），
 * 因此可在離線環境用假儲存層完整測試。
 *
 * 安全原則（規劃書 4.5、6.2、6.6）
 *  - 公開與否一律在這裡判斷，前端不負責隱藏。
 *  - 寫入類動作先驗證擁有者，再處理內容；失敗只回通用錯誤。
 *  - 訪客讀不到私人筆記時，回應與「不存在」完全相同。
 */

/* ───────── 常數 ───────── */
var NOT_FOUND = { ok: false, error: '找不到' };
var DENY = { ok: false, error: '無法完成' };

/** 大小只做「提醒」，不擋存檔（使用者決定）；HARD_BYTES 是避免單次請求拖垮 Apps Script 的技術防線。 */
var LIMITS = {
  WARN_MD_BYTES: 100 * 1024,
  WARN_SVG_BYTES: 100 * 1024,
  WARN_IMG_BYTES: 1024 * 1024,
  HTML_BYTES: 500 * 1024,
  PDF_BYTES: 5 * 1024 * 1024,
  HARD_BYTES: 5 * 1024 * 1024,
  MAX_TITLE: 200,
  REBUILD_PAGE: 150
};

var ID_RE = /^\d{8}-[a-z0-9]{2,8}$/;
var TOPIC_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
var LANGS = ['zh-Hant', 'en'];
var LINK_RE = /\[\[([^\[\]\n]+?)\]\]/g;
var UNPUBLISHED_TEXT = '（未公開的筆記）';

/* ───────── 小工具 ───────── */
function utf8Bytes_(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

function sizeWarning_(label, bytes, warnBytes) {
  if (bytes <= warnBytes) return null;
  return (
    label +
    '大小約 ' +
    Math.round(bytes / 1024) +
    ' KB，超過建議的 ' +
    Math.round(warnBytes / 1024) +
    ' KB。仍已存檔，建議拆分。'
  );
}

function isRealDate_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function asBool_(v) {
  if (v === true || v === false) return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return undefined;
}

/* ───────── front matter ───────── */
function parseFrontMatter_(text) {
  const t = String(text)
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n');
  const m = /^---\n(?:([\s\S]*?)\n)?---[ \t]*(?:\n|$)/.exec(t);
  if (!m) return { ok: true, meta: {}, body: t, hasFrontMatter: false };
  let obj;
  try {
    obj = jsyaml.load(m[1] || '', { schema: jsyaml.JSON_SCHEMA });
  } catch (e) {
    return { ok: false, reason: 'front matter 不是有效的 YAML：' + String(e.message).split('\n')[0] };
  }
  if (obj === null || obj === undefined) obj = {};
  if (typeof obj !== 'object' || Array.isArray(obj))
    return { ok: false, reason: 'front matter 必須是「鍵: 值」的形式' };
  return { ok: true, meta: obj, body: t.slice(m[0].length), hasFrontMatter: true };
}

/** 正規化已知欄位，未知欄位原樣保留。回傳 {ok, meta} 或 {ok:false, errors}。 */
function normalizeMeta_(raw, ctx) {
  const errors = [];
  const meta = {};
  const str = function (v) {
    return v === undefined || v === null ? '' : String(v).trim();
  };

  const title = str(raw.title);
  if (!title) errors.push('缺少 title');
  else if (title.length > LIMITS.MAX_TITLE) errors.push('title 超過 ' + LIMITS.MAX_TITLE + ' 字');
  meta.title = title;

  const topic = str(raw.topic);
  if (topic) {
    if (!TOPIC_RE.test(topic)) errors.push('topic 必須是主題 id（小寫英數與連字號）：' + topic);
    else if (!ctx.topicIds[topic]) errors.push('找不到主題：' + topic);
  }
  meta.topic = topic;

  let date = str(raw.date);
  if (!date) date = ctx.today;
  else if (!isRealDate_(date)) errors.push('date 必須是 YYYY-MM-DD：' + date);
  meta.date = date;

  let tags = raw.tags;
  if (tags === undefined || tags === null || tags === '') tags = [];
  else if (typeof tags === 'string') tags = tags.split(',');
  if (!Array.isArray(tags)) {
    errors.push('tags 必須是清單');
    tags = [];
  }
  const seen = {};
  meta.tags = tags
    .map(function (x) {
      return str(x);
    })
    .filter(function (x) {
      if (!x || seen[x]) return false;
      seen[x] = true;
      return true;
    });

  const cover = str(raw.cover);
  if (cover && !ID_RE.test(cover)) errors.push('cover 必須是 SVG 的 id：' + cover);
  meta.cover = cover;

  const lang = str(raw.lang);
  if (lang && LANGS.indexOf(lang) === -1) errors.push('lang 只能是 zh-Hant 或 en：' + lang);
  meta.lang = lang;

  if (raw.public !== undefined && raw.public !== null && raw.public !== '') {
    const b = asBool_(raw.public);
    if (b === undefined) errors.push('public 必須是 true 或 false');
    else meta.public = b;
  }

  const source = str(raw.source);
  if (source) meta.source = source.slice(0, 255);

  const tof = str(raw.translation_of); // 另一語言版本的筆記 id（選填）
  if (tof && !ID_RE.test(tof)) errors.push('translation_of 必須是筆記的 id：' + tof);
  else if (tof && ctx.selfId && tof === ctx.selfId) errors.push('translation_of 不能指向自己');
  else if (tof) meta.translation_of = tof;

  const known = {
    id: 1,
    title: 1,
    topic: 1,
    date: 1,
    tags: 1,
    cover: 1,
    lang: 1,
    public: 1,
    source: 1,
    translation_of: 1
  };
  Object.keys(raw).forEach(function (k) {
    if (!known[k] && raw[k] !== undefined) meta[k] = raw[k];
  });

  return errors.length ? { ok: false, errors: errors } : { ok: true, meta: meta };
}

function serializeNote_(id, meta, body) {
  const ordered = { id: id };
  ['title', 'topic', 'date', 'tags', 'cover', 'lang', 'public', 'source', 'translation_of'].forEach(
    function (k) {
      const v = meta[k];
      if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) return; // 空值不寫進 front matter
      ordered[k] = v;
    }
  );
  Object.keys(meta).forEach(function (k) {
    if (!(k in ordered) && meta[k] !== undefined) ordered[k] = meta[k];
  });
  const y = jsyaml.dump(ordered, {
    schema: jsyaml.JSON_SCHEMA,
    lineWidth: -1,
    noRefs: true,
    skipInvalid: true
  });
  return '---\n' + y + '---\n' + body;
}

function extractLinks_(body) {
  const ids = [],
    seen = {};
  let m;
  const re = new RegExp(LINK_RE.source, 'g');
  while ((m = re.exec(body)) !== null) {
    const id = m[1].trim();
    if (ID_RE.test(id) && !seen[id]) {
      seen[id] = true;
      ids.push(id);
    }
  }
  return ids;
}

/** 內文以標準 Markdown 圖片語法引用 SVG：![說明](assets/<id>.svg)。回傳被引用的 SVG id。 */
function extractSvgRefs_(body) {
  const ids = [],
    seen = {};
  const re = /assets\/(\d{8}-[a-z0-9]{2,8})\.svg/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    if (!seen[m[1]]) {
      seen[m[1]] = true;
      ids.push(m[1]);
    }
  }
  return ids;
}

/* ───────── 公開規則（規劃書 4.5） ───────── */
function topicMap_(topics) {
  const m = {};
  topics.forEach(function (t) {
    m[t.id] = t;
  });
  return m;
}
function isTopicPublic_(topic) {
  return !!topic && topic.defaultPublic === true;
}

/** 筆記有 public 就用筆記的；沒填用主題的 defaultPublic；主題也沒設視為私人。 */
function isNotePublic_(row, tmap) {
  if (row.public === true) return true;
  if (row.public === false) return false;
  return isTopicPublic_(tmap[row.topic]);
}

function publicIdSet_(rows, tmap) {
  const s = {};
  rows.forEach(function (r) {
    if (isNotePublic_(r, tmap)) s[r.id] = true;
  });
  return s;
}

/** 訪客看到的列：只含公開欄位；私人主題名稱一律隱藏（D18）；links 只留公開目標。 */
function visitorRow_(row, tmap, pubIds) {
  return {
    id: row.id,
    title: row.title,
    topic: isTopicPublic_(tmap[row.topic]) ? row.topic : '',
    date: row.date,
    tags: row.tags,
    lang: row.lang,
    cover: row.cover,
    public: true,
    updatedAt: row.updatedAt,
    translationOf: row.translationOf && pubIds[row.translationOf] === true ? row.translationOf : '', // 指向私人筆記的翻譯關聯不外洩
    links: row.links.filter(function (id) {
      return pubIds[id] === true;
    })
  };
}

function ownerRow_(row) {
  return {
    id: row.id,
    title: row.title,
    topic: row.topic,
    date: row.date,
    tags: row.tags,
    lang: row.lang,
    cover: row.cover,
    public: row.public,
    updatedAt: row.updatedAt,
    links: row.links,
    source: row.source || '',
    translationOf: row.translationOf || ''
  };
}

function rewriteLinksForVisitor_(body, pubIds) {
  return body.replace(new RegExp(LINK_RE.source, 'g'), function (whole, inner) {
    const id = inner.trim();
    if (!ID_RE.test(id)) return whole;
    return pubIds[id] === true ? whole : UNPUBLISHED_TEXT;
  });
}

/* ───────── 畫布（規劃書 4.4、6.6） ───────── */
function noteIdFromPath_(p) {
  const m = /^notes\/(\d{8}-[a-z0-9]{2,8})\.md$/.exec(String(p || ''));
  return m ? m[1] : null;
}
function isAssetPath_(p) {
  return /^assets\/\d{8}-[a-z0-9]{2,8}\.(svg|img|html|pdf)$/.test(String(p || ''));
}

/**
 * 訪客版畫布：移除指向私人筆記的卡片、連到這些卡片的連線，以及因此變空的群組。
 * 只過濾陣列，不改寫保留下來的節點，所以 x- 自訂欄位與不認得的欄位都原樣保留。
 * 無法辨識的 file 路徑一律移除（失敗即拒絕）。
 */
function filterBoardForVisitor_(board, pubIds) {
  const nodes = Array.isArray(board.nodes) ? board.nodes : [];
  const edges = Array.isArray(board.edges) ? board.edges : [];

  const originalChildren = {};
  nodes.forEach(function (n) {
    const p = n['x-parent'];
    if (p) originalChildren[p] = (originalChildren[p] || 0) + 1;
  });

  let alive = nodes.filter(function (n) {
    if (n.type !== 'file') return true;
    const nid = noteIdFromPath_(n.file);
    if (nid) return pubIds[nid] === true;
    return isAssetPath_(n.file);
  });

  let changed = true;
  while (changed) {
    changed = false;
    const aliveChildren = {};
    alive.forEach(function (n) {
      const p = n['x-parent'];
      if (p) aliveChildren[p] = (aliveChildren[p] || 0) + 1;
    });
    const next = alive.filter(function (n) {
      if (n.type === 'group' && originalChildren[n.id] > 0 && !aliveChildren[n.id]) {
        changed = true;
        return false;
      }
      return true;
    });
    alive = next;
  }

  const ids = {};
  alive.forEach(function (n) {
    ids[n.id] = true;
  });
  const keptEdges = edges.filter(function (e) {
    return ids[e.fromNode] === true && ids[e.toNode] === true;
  });

  const out = {};
  Object.keys(board).forEach(function (k) {
    out[k] = board[k];
  });
  out.nodes = alive;
  out.edges = keptEdges;
  return out;
}

function validateBoard_(board) {
  const errors = [];
  if (!board || typeof board !== 'object' || Array.isArray(board)) return ['畫布必須是 JSON 物件'];
  if (board.nodes !== undefined && !Array.isArray(board.nodes)) errors.push('nodes 必須是陣列');
  if (board.edges !== undefined && !Array.isArray(board.edges)) errors.push('edges 必須是陣列');
  if (errors.length) return errors;
  const ids = {};
  (board.nodes || []).forEach(function (n, i) {
    if (!n || typeof n.id !== 'string' || !n.id || typeof n.type !== 'string') {
      errors.push('第 ' + (i + 1) + ' 個節點缺少 id 或 type');
      return;
    }
    if (ids[n.id]) errors.push('節點 id 重複：' + n.id);
    ids[n.id] = true;
  });
  (board.edges || []).forEach(function (e, i) {
    if (!e || typeof e.id !== 'string' || !ids[e.fromNode] || !ids[e.toNode])
      errors.push('第 ' + (i + 1) + ' 條連線指向不存在的節點');
  });
  return errors;
}

/** PUBLIC_URL（指令碼屬性）→ 分享連結的網址開頭；格式不符一律回空字串。 */
function publicBase_(v) {
  const u = String(v || '').trim();
  return /^https:\/\/script\.google\.com\/[A-Za-z0-9_\/.-]+$/.test(u) ? u : '';
}

/**
 * 網址參數 → 前端的初始路由。只接受格式正確的值（筆記 id、主題 id、語言），其餘一律丟棄；
 * 輸出的 JSON 把 < > & 與行分隔字元跳脫，放進 <script> 內是安全的。
 * 例：?note=20261024-a1&lang=en
 */
function routeJson_(params, baseUrl) {
  params = params || {};
  const r = {
    base: /^https:\/\/script\.google\.com\/[A-Za-z0-9_\/.-]+$/.test(String(baseUrl || ''))
      ? String(baseUrl)
      : ''
  };
  const note = String(params.note || ''),
    topic = String(params.topic || ''),
    lang = String(params.lang || '');
  if (ID_RE.test(note)) r.note = note;
  if (TOPIC_RE.test(topic)) {
    r.topic = topic;
    if (String(params.board || '') === '1') r.board = true;
  } // board=1：直接開啟該主題的畫布
  if (lang === 'zh' || lang === 'en') r.lang = lang;
  return JSON.stringify(r)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/* ───────── 端點分派 ───────── */
/**
 * action 與 payload 來自網路，不可信。
 * method：'GET'（REST，一律以訪客處理）、'POST'、'RUN'（google.script.run，由網頁呼叫）。
 * ctx：{ isOwner, active }。
 */
/** 需要擁有者身分的動作（寫入，以及會一次讀出大量全文的匯出）。訪客與 REST GET 一律拒絕。 */
var WRITE_ACTIONS_ = {
  saveNote: 1,
  saveBoard: 1,
  saveTopic: 1,
  uploadSvg: 1,
  deleteNote: 1,
  deleteTopic: 1,
  updateNotes: 1,
  previewPublic: 1,
  previewNote: 1,
  previewSvg: 1,
  deleteNotes: 1,
  deleteBoard: 1,
  fetchPreview: 1,
  backupStatus: 1,
  backupRun: 1,
  backupTrigger: 1,
  siteStatus: 1,
  syncSite: 1,
  syncTrigger: 1,
  rebuildIndex: 1,
  exportBatch: 1,
  exportAssets: 1,
  uploadImage: 1,
  exportImages: 1,
  saveOrder: 1,
  uploadHtml: 1,
  exportHtml: 1,
  uploadPdf: 1,
  exportPdf: 1,
  scanAssets: 1,
  trashAssets: 1
};

function handle_(action, payload, ctx, method, store) {
  payload = payload || {};
  const isWrite = WRITE_ACTIONS_[action] === 1;
  if (isWrite && (method === 'GET' || ctx.isOwner !== true)) return DENY; // 先驗證，再處理
  const owner = ctx.isOwner === true && method !== 'GET'; // REST 讀取一律當訪客

  switch (action) {
    case 'whoami':
      return {
        ok: true,
        loggedIn: !!ctx.active,
        isOwner: owner,
        serverTime: store.now(),
        publicUrl: publicBase_(store.getProp('PUBLIC_URL'))
      };
    case 'listIndex':
      return listIndex_(owner, store);
    case 'getNote':
      return getNote_(payload, owner, store);
    case 'getBoard':
      return getBoard_(payload, owner, store);
    case 'getSvg':
      return getSvg_(payload, owner, store);
    case 'getImage':
      return getImage_(payload, owner, store);
    case 'uploadImage':
      return uploadImage_(payload, store);
    case 'exportImages':
      return exportImages_(payload, store);
    case 'getHtml':
      return getHtml_(payload, owner, store);
    case 'uploadHtml':
      return uploadHtml_(payload, store);
    case 'exportHtml':
      return exportHtml_(payload, store);
    case 'getPdf':
      return getPdf_(payload, owner, store);
    case 'uploadPdf':
      return uploadPdf_(payload, store);
    case 'exportPdf':
      return exportPdf_(payload, store);
    case 'scanAssets':
      return scanAssets_(payload, store);
    case 'trashAssets':
      return trashAssets_(payload, store);
    case 'saveTopic':
      return saveTopic_(payload, store);
    case 'exportBatch':
      return exportBatch_(payload, store);
    case 'exportAssets':
      return exportAssets_(payload, store);
    case 'saveNote':
      return saveNote_(payload, store);
    case 'saveBoard':
      return saveBoard_(payload, store);
    case 'uploadSvg':
      return uploadSvg_(payload, store);
    case 'deleteNote':
      return deleteNote_(payload, store);
    case 'deleteTopic':
      return deleteTopic_(payload, store);
    case 'saveOrder':
      return saveOrder_(payload, store);
    case 'updateNotes':
      return updateNotes_(payload, store);
    case 'deleteNotes':
      return deleteNotes_(payload, store);
    case 'deleteBoard':
      return deleteBoard_(payload, store);
    case 'fetchPreview':
      return fetchPreview_(payload, store);
    case 'previewPublic':
      return listIndex_(false, store); // 擁有者預覽：與訪客完全相同的程式路徑與結果
    case 'previewNote':
      return getNote_(payload, false, store);
    case 'previewSvg':
      return getSvg_(payload, false, store);
    case 'backupStatus':
      return backupStatus_(store);
    case 'backupRun':
      return backupRun_(payload, store);
    case 'backupTrigger':
      return triggerToggle_(payload, store, 'scheduledBackup', { type: 'monthly', day: 1, hour: 3 });
    case 'siteStatus':
      return siteStatus_(store);
    case 'syncSite':
      return syncSite_(payload, store);
    case 'syncTrigger':
      return triggerToggle_(payload, store, 'scheduledSync', { type: 'daily', hour: 4 });
    case 'rebuildIndex':
      return rebuildIndex_(payload, store);
    default:
      return DENY;
  }
}

function topicOut_(t, owner) {
  const o = { id: t.id, title: t.title, category: t.category, status: t.status };
  if (owner) o.defaultPublic = t.defaultPublic === true;
  return o;
}

/** 回傳索引與主題清單。訪客只拿到公開主題；私人主題的名稱、分類、數量一律不出現（D18）。 */
function listIndex_(owner, store) {
  const rows = store.getIndexRows();
  const topics = store.getTopics();
  if (owner)
    return {
      ok: true,
      items: rows.map(ownerRow_),
      topics: topics.map(function (t) {
        return topicOut_(t, true);
      }),
      order: readOrder_(store, null),
      generatedAt: store.now()
    };
  const tmap = topicMap_(topics);
  const pub = publicIdSet_(rows, tmap);
  const items = rows
    .filter(function (r) {
      return pub[r.id] === true;
    })
    .map(function (r) {
      return visitorRow_(r, tmap, pub);
    });
  const pubTopics = topics.filter(isTopicPublic_).map(function (t) {
    return topicOut_(t, false);
  });
  return {
    ok: true,
    items: items,
    topics: pubTopics,
    order: readOrder_(store, pubTopics),
    generatedAt: store.now()
  };
}

/* ───── 書櫃／分類頁簽的順序（P14）─────
 * 存在 Script Properties 的 VAULT_ORDER：{ cats: [分類名…], topics: [主題 id…] }，兩個部署共用。
 * 沒列到的分類／主題由前端排在後面（依標題）。訪客只拿到公開主題與其分類，私人名稱不外洩。 */
var ORDER_PROP_ = 'VAULT_ORDER';
function readOrder_(store, visibleTopics) {
  let o = { cats: [], topics: [] };
  try {
    const j = JSON.parse(store.getProp(ORDER_PROP_) || '{}');
    if (j && Array.isArray(j.cats) && Array.isArray(j.topics)) o = { cats: j.cats, topics: j.topics };
  } catch (e) {
    /* 壞掉就當沒有 */
  }
  if (!visibleTopics) return o;
  const ids = {},
    cats = {};
  visibleTopics.forEach(function (t) {
    ids[t.id] = true;
    if (t.category) cats[t.category] = true;
  });
  return {
    cats: o.cats.filter(function (c) {
      return cats[c];
    }),
    topics: o.topics.filter(function (i) {
      return ids[i];
    })
  };
}
/** 擁有者儲存順序；格式不對就整份拒絕（不做部分寫入）。 */
function saveOrder_(payload, store) {
  const cats = payload.cats,
    topics = payload.topics;
  if (!Array.isArray(cats) || !Array.isArray(topics) || cats.length > 200 || topics.length > 400)
    return { ok: false, error: '順序格式不符' };
  const okCat = cats.every(function (c) {
    return typeof c === 'string' && c.length > 0 && c.length <= 50;
  });
  const okId = topics.every(function (i) {
    return typeof i === 'string' && TOPIC_RE.test(i);
  });
  if (!okCat || !okId) return { ok: false, error: '順序格式不符' };
  const text = JSON.stringify({ cats: cats, topics: topics });
  if (text.length > 8000) return { ok: false, error: '順序格式不符' };
  store.setProp(ORDER_PROP_, text);
  return { ok: true };
}

function getNote_(payload, owner, store) {
  const id = String(payload.id || '');
  if (!ID_RE.test(id)) return NOT_FOUND;
  const rows = store.getIndexRows();
  const row = rows.filter(function (r) {
    return r.id === id;
  })[0];
  if (!row) return NOT_FOUND;
  const tmap = topicMap_(store.getTopics());
  const pub = publicIdSet_(rows, tmap);
  if (!owner && pub[id] !== true) return NOT_FOUND; // 私人與不存在無法區分

  const text = store.readText(row.driveFileId);
  const fm = parseFrontMatter_(text);
  const body = fm.ok ? fm.body : text;
  if (owner) {
    return {
      ok: true,
      meta: ownerRow_(row),
      source: fm.ok ? fm.meta.source || '' : '',
      body: body,
      text: text,
      updatedAt: row.updatedAt
    };
  }
  return {
    ok: true,
    meta: visitorRow_(row, tmap, pub),
    body: rewriteLinksForVisitor_(body, pub),
    updatedAt: row.updatedAt
  };
}

function getBoard_(payload, owner, store) {
  const topic = String(payload.topic || '');
  if (!TOPIC_RE.test(topic)) return NOT_FOUND;
  const tmap = topicMap_(store.getTopics());
  if (!tmap[topic]) return NOT_FOUND;
  if (!owner && !isTopicPublic_(tmap[topic])) return NOT_FOUND; // 畫布隨主題

  const f = store.findFileByName('boards', topic + '.canvas.json');
  if (!f) return { ok: true, board: { nodes: [], edges: [] }, updatedAt: null };
  let board;
  try {
    board = JSON.parse(store.readText(f.fileId));
  } catch (e) {
    return owner ? { ok: false, error: '畫布檔不是有效的 JSON' } : NOT_FOUND;
  }
  if (owner) return { ok: true, board: board, updatedAt: f.updatedAt };

  const rows = store.getIndexRows();
  const pub = publicIdSet_(rows, tmap);
  return { ok: true, board: filterBoardForVisitor_(board, pub), updatedAt: f.updatedAt };
}

function newId_(datePart, rows, store) {
  const used = {};
  rows.forEach(function (r) {
    used[r.id] = true;
  });
  const d = datePart.replace(/-/g, '');
  for (let k = 0; k < 20; k++) {
    const id = d + '-' + store.newCode();
    if (!used[id]) return id;
  }
  return d + '-' + store.newCode() + store.newCode();
}

function saveNote_(payload, store) {
  const text = payload.text;
  if (typeof text !== 'string') return { ok: false, error: '內容不符規則', reasons: ['text 必須是字串'] };
  const bytes = utf8Bytes_(text);
  if (bytes > LIMITS.HARD_BYTES)
    return { ok: false, error: '內容不符規則', reasons: ['單則筆記超過 5 MB 的技術上限'] };

  const fm = parseFrontMatter_(text);
  if (!fm.ok) return { ok: false, error: '內容不符規則', reasons: [fm.reason] };

  const wanted =
    payload.id !== undefined && payload.id !== null && payload.id !== ''
      ? String(payload.id)
      : fm.meta.id !== undefined
        ? String(fm.meta.id)
        : '';
  if (wanted && !ID_RE.test(wanted))
    return { ok: false, error: '內容不符規則', reasons: ['id 格式必須是「日期-短碼」，例如 20261022-a1'] };

  return store.lock(function () {
    const rows = store.getIndexRows();
    const topics = store.getTopics();
    const topicIds = {};
    topics.forEach(function (t) {
      topicIds[t.id] = true;
    });

    const norm = normalizeMeta_(fm.meta, { topicIds: topicIds, today: store.today(), selfId: wanted });
    if (!norm.ok) return { ok: false, error: '內容不符規則', reasons: norm.errors };

    const existing = wanted
      ? rows.filter(function (r) {
          return r.id === wanted;
        })[0]
      : null;
    const id = wanted || newId_(norm.meta.date, rows, store);
    const finalText = serializeNote_(id, norm.meta, fm.body);

    const warnings = [];
    const w = sizeWarning_('這則筆記', bytes, LIMITS.WARN_MD_BYTES);
    if (w) warnings.push(w);

    const links = extractLinks_(fm.body);
    const row = {
      id: id,
      title: norm.meta.title,
      topic: norm.meta.topic,
      date: norm.meta.date,
      tags: norm.meta.tags,
      lang: norm.meta.lang,
      public: norm.meta.public === undefined ? null : norm.meta.public,
      cover: norm.meta.cover,
      driveFileId: '',
      updatedAt: '',
      links: links,
      svgs: extractSvgRefs_(fm.body),
      source: norm.meta.source || '',
      translationOf: norm.meta.translation_of || ''
    };

    if (existing) {
      if (payload.baseUpdatedAt !== existing.updatedAt) {
        if (store.readText(existing.driveFileId) === finalText) {
          // 重送：內容相同，視為成功，不重複寫入
          return { ok: true, id: id, updatedAt: existing.updatedAt, deduped: true, warnings: warnings };
        }
        return {
          ok: false,
          error: '衝突',
          code: 409,
          server: { updatedAt: existing.updatedAt, text: store.readText(existing.driveFileId) }
        };
      }
      row.driveFileId = existing.driveFileId;
      row.updatedAt = store.updateText(existing.driveFileId, finalText);
    } else {
      if (payload.baseUpdatedAt) return { ok: false, error: '衝突', code: 409, server: null }; // 附了版本卻找不到原筆記
      const created = store.createText('notes', id + '.md', finalText);
      row.driveFileId = created.fileId;
      row.updatedAt = created.updatedAt;
    }
    store.upsertRow(row);
    return { ok: true, id: id, updatedAt: row.updatedAt, created: !existing, warnings: warnings };
  });
}

function deleteNote_(payload, store) {
  const id = String(payload.id || '');
  if (!ID_RE.test(id)) return NOT_FOUND;
  return store.lock(function () {
    const row = store.getIndexRows().filter(function (r) {
      return r.id === id;
    })[0];
    if (!row) return NOT_FOUND;
    store.trash(row.driveFileId); // 移到垃圾桶，不做永久刪除
    store.removeRow(id);
    return { ok: true, id: id };
  });
}

/** 批次刪除：逐則移到垃圾桶（不永久刪除）並移出索引；一次最多 BATCH_MAX 則，逐則回報。 */
function deleteNotes_(payload, store) {
  const ids = [],
    seen = {};
  (Array.isArray(payload.ids) ? payload.ids : []).forEach(function (x) {
    const id = String(x);
    if (!seen[id]) {
      seen[id] = true;
      ids.push(id);
    }
  });
  if (!ids.length) return { ok: false, error: '內容不符規則', reasons: ['沒有指定筆記'] };
  if (ids.length > BATCH_MAX)
    return { ok: false, error: '內容不符規則', reasons: ['一次最多 ' + BATCH_MAX + ' 則'] };
  if (
    !ids.every(function (id) {
      return ID_RE.test(id);
    })
  )
    return { ok: false, error: '內容不符規則', reasons: ['id 格式必須是「日期-短碼」'] };
  return store.lock(function () {
    const byId = {};
    store.getIndexRows().forEach(function (r) {
      byId[r.id] = r;
    });
    const deleted = [],
      failed = [];
    ids.forEach(function (id) {
      const r = byId[id];
      if (!r) {
        failed.push({ id: id, reason: '找不到' });
        return;
      }
      try {
        store.trash(r.driveFileId);
        store.removeRow(id);
        deleted.push(id);
      } catch (e) {
        failed.push({ id: id, reason: '讀不到檔案' });
      }
    });
    return { ok: true, deleted: deleted, failed: failed };
  });
}

/**
 * 批次修改筆記的「主題」與「公開」（只動這兩個欄位，內文與其他欄位原樣保留）。
 * payload：ids（最多 BATCH_MAX 則）、topic（''＝未歸類；省略＝不改）、public（true／false／null＝依主題預設；省略＝不改）。
 * 保守規則：只要這個批次會讓任何一則筆記「實際變成公開」（含移到公開主題），沒附 confirmPublic: true 就整批拒絕、什麼都不改。
 * 逐則處理、逐則回報（updated／unchanged／failed），單則失敗不影響其他則。
 */
var BATCH_MAX = 30;
function updateNotes_(payload, store) {
  const ids = [],
    seen = {};
  (Array.isArray(payload.ids) ? payload.ids : []).forEach(function (x) {
    const id = String(x);
    if (!seen[id]) {
      seen[id] = true;
      ids.push(id);
    }
  });
  if (!ids.length) return { ok: false, error: '內容不符規則', reasons: ['沒有指定筆記'] };
  if (ids.length > BATCH_MAX)
    return { ok: false, error: '內容不符規則', reasons: ['一次最多 ' + BATCH_MAX + ' 則'] };
  if (
    !ids.every(function (id) {
      return ID_RE.test(id);
    })
  )
    return { ok: false, error: '內容不符規則', reasons: ['id 格式必須是「日期-短碼」'] };
  const hasTopic = Object.prototype.hasOwnProperty.call(payload, 'topic');
  const hasPub = Object.prototype.hasOwnProperty.call(payload, 'public');
  if (!hasTopic && !hasPub) return { ok: false, error: '內容不符規則', reasons: ['沒有要修改的欄位'] };
  let newTopic = '';
  if (hasTopic) {
    newTopic = payload.topic === null || payload.topic === undefined ? '' : String(payload.topic);
    if (newTopic && !TOPIC_RE.test(newTopic))
      return { ok: false, error: '內容不符規則', reasons: ['topic 不合法'] };
  }
  let newPub = null;
  if (hasPub) {
    if (payload.public === null) newPub = null;
    else {
      newPub = asBool_(payload.public);
      if (newPub === undefined)
        return { ok: false, error: '內容不符規則', reasons: ['public 必須是 true 或 false'] };
    }
  }

  return store.lock(function () {
    const tmap = topicMap_(store.getTopics());
    if (hasTopic && newTopic && !tmap[newTopic])
      return { ok: false, error: '內容不符規則', reasons: ['找不到主題：' + newTopic] };
    const byId = {};
    store.getIndexRows().forEach(function (r) {
      byId[r.id] = r;
    });
    const after = function (r) {
      return { topic: hasTopic ? newTopic : r.topic, public: hasPub ? newPub : r.public };
    };
    let becoming = 0;
    ids.forEach(function (id) {
      const r = byId[id];
      if (!r) return;
      if (!isNotePublic_(r, tmap) && isNotePublic_(after(r), tmap)) becoming++;
    });
    if (becoming > 0 && payload.confirmPublic !== true) {
      return {
        ok: false,
        error: '需要確認',
        affectedNotes: becoming,
        message: '此批次有 ' + becoming + ' 則筆記會變成公開。確認請附 confirmPublic: true。'
      };
    }
    const updated = [],
      unchanged = [],
      failed = [];
    ids.forEach(function (id) {
      const r = byId[id];
      if (!r) {
        failed.push({ id: id, reason: '找不到' });
        return;
      }
      const a = after(r);
      if ((r.topic || '') === (a.topic || '') && (r.public === undefined ? null : r.public) === a.public) {
        unchanged.push(id);
        return;
      }
      try {
        const fm = parseFrontMatter_(store.readText(r.driveFileId));
        if (!fm.ok) {
          failed.push({ id: id, reason: fm.reason });
          return;
        }
        const meta = fm.meta;
        if (hasTopic) {
          if (newTopic) meta.topic = newTopic;
          else delete meta.topic;
        }
        if (hasPub) {
          if (newPub === null) delete meta.public;
          else meta.public = newPub;
        }
        const updatedAt = store.updateText(r.driveFileId, serializeNote_(id, meta, fm.body));
        const row = Object.assign({}, r, {
          topic: a.topic || '',
          public: a.public === undefined ? null : a.public,
          updatedAt: updatedAt
        });
        store.upsertRow(row);
        updated.push(id);
      } catch (e) {
        failed.push({ id: id, reason: '讀不到檔案' });
      }
    });
    return { ok: true, updated: updated, unchanged: unchanged, failed: failed };
  });
}

/** 刪除主題：只有主題內沒有任何筆記時才允許（避免筆記變成孤兒）；檔案移到垃圾桶。 */
function deleteTopic_(payload, store) {
  const id = String(payload.id || '');
  if (!TOPIC_RE.test(id)) return NOT_FOUND;
  return store.lock(function () {
    if (!topicMap_(store.getTopics())[id]) return NOT_FOUND;
    const n = store.getIndexRows().filter(function (r) {
      return r.topic === id;
    }).length;
    if (n > 0) return { ok: false, error: '主題內還有 ' + n + ' 則筆記，請先移動或刪除', noteCount: n };
    store.removeTopic(id);
    return { ok: true, id: id };
  });
}

/** 刪除某主題的畫布檔（移到垃圾桶，不永久刪除）。主題與筆記不受影響；沒有畫布檔也算成功。 */
function deleteBoard_(payload, store) {
  const topic = String(payload.topic || '');
  if (!TOPIC_RE.test(topic)) return NOT_FOUND;
  return store.lock(function () {
    if (!topicMap_(store.getTopics())[topic]) return NOT_FOUND;
    const f = store.findFileByName('boards', topic + '.canvas.json');
    if (!f) return { ok: true, topic: topic, existed: false };
    const refs = assetRefs_(store.readText(f.fileId));
    store.trash(f.fileId);
    return { ok: true, topic: topic, existed: true, removedAssets: dropAssets_(store, refs, [], f.fileId) };
  });
}

/* ───────── 連結預覽（P6）：擁有者加入連結卡片時由後端代抓一次，結果存進卡片的 x-preview ───────── */
/** 只接受公開網站的 https 網址：不含帳密、不指定連接埠、不是 IP 或內網名稱。 */
function previewUrlOk_(u) {
  u = String(u || '');
  if (u.length > 2000 || /[\s\u0000-\u001f]/.test(u)) return false;
  const m = /^https:\/\/([^\/?#]+)(?:[\/?#].*)?$/i.exec(u);
  if (!m) return false;
  const host = m[1].toLowerCase();
  if (host.indexOf('@') !== -1 || host.indexOf(':') !== -1) return false;
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(host)) return false;
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/.test(host)) return false;
  return true;
}

function htmlDecode_(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, function (all, g) {
    const k = g.toLowerCase();
    if (k === 'amp') return '&';
    if (k === 'lt') return '<';
    if (k === 'gt') return '>';
    if (k === 'quot') return '"';
    if (k === 'apos') return "'";
    if (k === 'nbsp') return ' ';
    const c = k.charAt(1) === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return c > 31 && c < 1114112 && !(c >= 55296 && c <= 57343) ? String.fromCodePoint(c) : '';
  });
}

/** 從 HTML 取出標題、描述、封面圖、站名。純文字處理，不執行任何內容；輸出一律是純文字（前端用 textContent 顯示）。 */
function parsePreview_(html, pageUrl) {
  html = String(html || '').slice(0, 300000);
  const metas = {};
  const re = /<meta\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = {};
    const ar = /([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let a;
    while ((a = ar.exec(m[1])) !== null) attrs[a[1].toLowerCase()] = a[2] !== undefined ? a[2] : a[3];
    const key = String(attrs.property || attrs.name || '').toLowerCase();
    if (key && attrs.content !== undefined && metas[key] === undefined) metas[key] = attrs.content;
  }
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const clean = function (v, n) {
    return htmlDecode_(v)
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, n);
  };
  let image = String(metas['og:image'] || metas['og:image:url'] || metas['twitter:image'] || '').trim();
  image = htmlDecode_(image);
  if (image && !/^https:\/\//i.test(image)) {
    const o = /^(https:\/\/[^\/?#]+)(\/[^?#]*)?/i.exec(pageUrl);
    if (o && /^\/(?!\/)/.test(image)) image = o[1] + image;
    else if (o && /^\/\//.test(image)) image = 'https:' + image;
    else image = '';
  }
  if (!previewUrlOk_(image) || image.length > 500) image = '';
  const out = {
    title: clean(metas['og:title'] || metas['twitter:title'] || (t ? t[1] : ''), 120),
    description: clean(
      metas['og:description'] || metas['twitter:description'] || metas['description'] || '',
      240
    ),
    image: image,
    site: clean(metas['og:site_name'] || '', 60)
  };
  return out;
}

function fetchPreview_(payload, store) {
  const url = String(payload.url || '').trim();
  if (!previewUrlOk_(url)) return { ok: false, error: '只能擷取公開網站的 https 網址' };
  let res;
  try {
    res = store.fetchPage(url);
  } catch (e) {
    return { ok: false, error: '無法連線到這個網址' };
  }
  if (!res || res.code < 200 || res.code >= 300) return { ok: false, error: '網站沒有回應成功' };
  if (res.contentType && !/html|xml/i.test(res.contentType)) return { ok: false, error: '這個網址不是網頁' };
  const p = parsePreview_(res.text, url);
  if (!p.title && !p.description && !p.image) return { ok: false, error: '這個網頁沒有可用的預覽資訊' };
  p.fetchedAt = store.now();
  return { ok: true, preview: p };
}

function uploadSvg_(payload, store) {
  const text = payload.text;
  if (typeof text !== 'string') return { ok: false, error: '內容不符規則', reasons: ['text 必須是字串'] };
  const bytes = utf8Bytes_(text);
  if (bytes > LIMITS.HARD_BYTES)
    return { ok: false, error: '內容不符規則', reasons: ['SVG 超過 5 MB 的技術上限'] };
  const clean = sanitizeSvg_(text);
  if (!clean.ok) return { ok: false, error: '內容不符規則', reasons: [clean.reason] };

  const wanted = payload.id ? String(payload.id) : '';
  if (wanted && !ID_RE.test(wanted))
    return { ok: false, error: '內容不符規則', reasons: ['id 格式必須是「日期-短碼」'] };
  const warnings = [];
  const w = sizeWarning_('這個 SVG', bytes, LIMITS.WARN_SVG_BYTES);
  if (w) warnings.push(w);

  return store.lock(function () {
    const id = wanted || newId_(store.today(), store.getIndexRows(), store);
    const name = id + '.svg';
    const f = store.findFileByName('assets', name);
    if (f)
      store.updateText(f.fileId, clean.svg); // 覆寫同一個檔案
    else store.createText('assets', name, clean.svg);
    return { ok: true, id: id, removed: clean.removed, warnings: warnings, created: !f };
  });
}

function saveBoard_(payload, store) {
  const topic = String(payload.topic || '');
  if (!TOPIC_RE.test(topic)) return { ok: false, error: '內容不符規則', reasons: ['topic 不合法'] };
  let board = payload.board;
  if (typeof board === 'string') {
    try {
      board = JSON.parse(board);
    } catch (e) {
      return { ok: false, error: '內容不符規則', reasons: ['畫布不是有效的 JSON'] };
    }
  }
  const errs = validateBoard_(board);
  if (errs.length) return { ok: false, error: '內容不符規則', reasons: errs };
  if (!board.nodes) board.nodes = [];
  if (!board.edges) board.edges = [];
  const text = JSON.stringify(board);
  const bytes = utf8Bytes_(text);
  if (bytes > LIMITS.HARD_BYTES)
    return { ok: false, error: '內容不符規則', reasons: ['畫布超過 5 MB 的技術上限'] };

  return store.lock(function () {
    if (!topicMap_(store.getTopics())[topic])
      return { ok: false, error: '內容不符規則', reasons: ['找不到主題：' + topic] };
    const name = topic + '.canvas.json';
    const f = store.findFileByName('boards', name);
    if (f) {
      if (payload.baseUpdatedAt !== f.updatedAt) {
        return {
          ok: false,
          error: '衝突',
          code: 409,
          server: { updatedAt: f.updatedAt, board: JSON.parse(store.readText(f.fileId)) }
        };
      }
      const before = assetRefs_(store.readText(f.fileId));
      const after = assetRefs_(text);
      const updatedAt = store.updateText(f.fileId, text);
      restoreAssets_(store, after, before);
      return { ok: true, updatedAt: updatedAt, removedAssets: dropAssets_(store, before, after, f.fileId) };
    }
    if (payload.baseUpdatedAt) return { ok: false, error: '衝突', code: 409, server: null };
    const created = store.createText('boards', name, text);
    restoreAssets_(store, assetRefs_(text), []);
    return { ok: true, updatedAt: created.updatedAt, removedAssets: 0 };
  });
}

/* ───── 畫布刪卡片＝檔案一併移到垃圾桶 ─────
 * 存檔時，這張畫布「原本有、現在沒有」的圖片／HTML，若其他畫布也沒用，就移到 Drive 垃圾桶（30 天可救回）。
 * 另一張畫布讀不了就不動（寧可留著）。只有真的有卡片被移除時才會去讀其他畫布，一般存檔不增加成本。
 * 反過來，存檔時新出現的引用若檔案已在垃圾桶（例如刪除後又「復原」），會自動從垃圾桶救回。 */
function assetRefs_(text) {
  const out = [];
  try {
    (JSON.parse(text).nodes || []).forEach(function (n) {
      const m =
        n && n.type === 'file' && typeof n.file === 'string' ? /^assets\/([^\/]+)$/.exec(n.file) : null;
      if (m && ASSET_NAME_RE.test(m[1]) && out.indexOf(m[1]) === -1) out.push(m[1]);
    });
  } catch (e) {}
  return out;
}
function restoreAssets_(store, now, before) {
  now.forEach(function (nm) {
    if (before.indexOf(nm) === -1 && !store.findFileByName('assets', nm)) store.untrash('assets', nm);
  });
}
/** 回傳移到垃圾桶的檔案數。exceptFileId：這張畫布自己（用新內容判斷，不重讀）。 */
function dropAssets_(store, before, after, exceptFileId) {
  const gone = before.filter(function (nm) {
    return after.indexOf(nm) === -1;
  });
  if (!gone.length) return 0;
  const used = {};
  try {
    store.listFolder('boards').forEach(function (b) {
      if (b.fileId === exceptFileId) return;
      assetRefs_(store.readText(b.fileId)).forEach(function (nm) {
        used[nm] = true;
      });
    });
  } catch (e) {
    return 0;
  }
  let n = 0;
  gone.forEach(function (nm) {
    const f = used[nm] ? null : store.findFileByName('assets', nm);
    if (f) {
      store.trash(f.fileId);
      n++;
    }
  });
  return n;
}

/**
 * 由 Drive 掃描重建索引（規劃書 4.3）。分批、可續傳：回傳 done:false 與 cursor，
 * 呼叫端帶著 cursor 再呼叫，直到 done:true。不修改任何筆記檔。
 */
function rebuildIndex_(payload, store) {
  const cursor = payload.cursor || null;
  if (!cursor) {
    store.beginRebuild();
    store.rebuildTopics();
  }
  const page = store.listFilesPage('notes', cursor, LIMITS.REBUILD_PAGE);
  const rows = [],
    problems = [];
  page.files.forEach(function (f) {
    let fm;
    try {
      fm = parseFrontMatter_(store.readText(f.fileId));
    } catch (e) {
      problems.push({ file: f.name, problem: '讀不到檔案' });
      return;
    }
    if (!fm.ok) {
      problems.push({ file: f.name, problem: fm.reason });
      return;
    }
    const fid = f.name.replace(/\.md$/, '');
    const id = fm.meta.id !== undefined ? String(fm.meta.id) : '';
    if (!ID_RE.test(id)) {
      problems.push({ file: f.name, problem: 'front matter 缺少合法的 id，未收錄' });
      return;
    }
    if (fid !== id)
      problems.push({ file: f.name, problem: '檔名與 front matter 的 id 不一致，以 front matter 為準' });
    const pub = asBool_(fm.meta.public);
    rows.push({
      id: id,
      title: String(fm.meta.title || ''),
      topic: String(fm.meta.topic || ''),
      date: String(fm.meta.date || ''),
      tags: Array.isArray(fm.meta.tags) ? fm.meta.tags.map(String) : [],
      lang: String(fm.meta.lang || ''),
      public: pub === undefined ? null : pub,
      cover: String(fm.meta.cover || ''),
      driveFileId: f.fileId,
      updatedAt: f.updatedAt,
      links: extractLinks_(fm.body),
      svgs: extractSvgRefs_(fm.body),
      source: String(fm.meta.source || ''),
      translationOf: ID_RE.test(String(fm.meta.translation_of || '')) ? String(fm.meta.translation_of) : ''
    });
  });
  const dup = store.appendRebuildRows(rows);
  dup.forEach(function (id) {
    problems.push({ file: id, problem: 'id 重複，已略過後者' });
  });
  if (!page.cursor) {
    store.finishRebuild();
    return { ok: true, done: true, added: rows.length - dup.length, problems: problems };
  }
  return { ok: true, done: false, cursor: page.cursor, added: rows.length - dup.length, problems: problems };
}

/**
 * SVG 沒有自己的開關：被任何公開筆記（封面或內文引用）或公開主題的畫布引用，即視為公開（規劃書 4.5）。
 * 先用索引判斷（不讀檔）；找不到才去讀公開主題的畫布。
 */
function isSvgPublic_(id, rows, pub, store) {
  const viaNote = rows.some(function (r) {
    return pub[r.id] === true && (r.cover === id || (r.svgs || []).indexOf(id) !== -1);
  });
  if (viaNote) return true;
  const target = 'assets/' + id + '.svg';
  return store.getTopics().some(function (t) {
    if (!isTopicPublic_(t)) return false;
    const f = store.findFileByName('boards', t.id + '.canvas.json');
    if (!f) return false;
    try {
      return (JSON.parse(store.readText(f.fileId)).nodes || []).some(function (n) {
        if (!n) return false;
        if (n.type === 'file') return n.file === target;
        if (n.type === 'text' && typeof n.text === 'string')
          return extractSvgRefs_(n.text).indexOf(id) !== -1; // 便利貼內的 ![](assets/…svg)
        return false;
      });
    } catch (e) {
      return false;
    }
  });
}

/** 回傳 SVG 文字，前端用 Blob 或 data URL 放進 <img>，不內嵌進 DOM。私人與不存在無法區分。 */
function getSvg_(payload, owner, store) {
  const id = String(payload.id || '');
  if (!ID_RE.test(id)) return NOT_FOUND;
  const f = store.findFileByName('assets', id + '.svg');
  if (!f) return NOT_FOUND;
  if (!owner) {
    const rows = store.getIndexRows();
    const pub = publicIdSet_(rows, topicMap_(store.getTopics()));
    if (!isSvgPublic_(id, rows, pub, store)) return NOT_FOUND;
  }
  return { ok: true, id: id, svg: store.readText(f.fileId), updatedAt: f.updatedAt };
}

/**
 * 建立或更新主題。把主題由私人改為公開時，所有「未明確設定 public」的筆記會一併公開，
 * 為避免靜默擴大公開範圍，這種情況必須附 confirmPublic: true 才會執行。
 */
function saveTopic_(payload, store) {
  const reasons = [];
  const id = String(payload.id || '');
  if (!TOPIC_RE.test(id)) reasons.push('id 必須是小寫英數與連字號（最多 40 字）');
  const clean = function (v) {
    return v === undefined || v === null ? '' : String(v).trim();
  };
  const title = clean(payload.title),
    category = clean(payload.category),
    status = clean(payload.status);
  if (!title || title.length > 100) reasons.push('title 必須是 1 到 100 字');
  if (category.length > 50) reasons.push('category 最多 50 字');
  if (status.length > 30) reasons.push('status 最多 30 字');
  const dp = payload.defaultPublic === undefined ? false : asBool_(payload.defaultPublic);
  if (dp === undefined) reasons.push('defaultPublic 必須是 true 或 false');
  if (reasons.length) return { ok: false, error: '內容不符規則', reasons: reasons };

  return store.lock(function () {
    const existing = topicMap_(store.getTopics())[id];
    const wasPublic = !!existing && existing.defaultPublic === true;
    if (dp === true && !wasPublic) {
      const affected = store.getIndexRows().filter(function (r) {
        return r.topic === id && r.public === null;
      }).length;
      if (affected > 0 && payload.confirmPublic !== true) {
        return {
          ok: false,
          error: '需要確認',
          affectedNotes: affected,
          message:
            '此主題有 ' +
            affected +
            ' 則筆記沒有明確設定 public，改為公開後它們會一併公開。確認請附 confirmPublic: true。'
        };
      }
    }
    store.saveTopic({ id: id, title: title, category: category, status: status, defaultPublic: dp });
    return { ok: true, id: id, created: !existing };
  });
}

/**
 * 匯出（擁有者專用，分批可續傳）。一次回傳最多 100 則筆記全文，用「最後一個 id」當游標，
 * 匯出期間有新增或刪除也不會漏讀或重複。供 ZIP 備份與全文搜尋使用。
 */
function exportBatch_(payload, store) {
  const limit = Math.max(1, Math.min(100, parseInt(payload.limit, 10) || 50));
  const after = String(payload.cursor || '');
  const all = store.getIndexRows().sort(function (a, b) {
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const rest = all.filter(function (r) {
    return r.id > after;
  });
  const page = rest.slice(0, limit),
    notes = [],
    missing = [];
  page.forEach(function (r) {
    try {
      notes.push({ id: r.id, text: store.readText(r.driveFileId), updatedAt: r.updatedAt });
    } catch (e) {
      missing.push(r.id);
    } // 索引有、檔案讀不到：列出而不中斷
  });
  return {
    ok: true,
    notes: notes,
    missing: missing,
    total: all.length,
    cursor: rest.length > limit ? page[page.length - 1].id : null
  };
}

/** 匯出全部 SVG（含沒被任何筆記引用的孤兒檔）。檔案本來就是清除過的。 */
function exportAssets_(payload, store) {
  const page = store.listFilesPage('assets', payload.cursor || null, 50, '.svg');
  const assets = [];
  page.files.forEach(function (f) {
    const id = f.name.replace(/\.svg$/, '');
    if (ID_RE.test(id)) assets.push({ id: id, svg: store.readText(f.fileId), updatedAt: f.updatedAt });
  });
  return { ok: true, assets: assets, cursor: page.cursor };
}

/**
 * 圖片卡：圖片以 data URL 文字存成 assets/<id>.img（Drive 內為純文字檔，備份與 ZIP 不需特別處理二進位）。
 * 只收 PNG / JPEG / WebP（以檔頭魔術位元組驗證，不信任宣稱的 mime）。大小只提醒，5 MB 為技術上限。
 */
function b64Head_(b64, n) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const out = [];
  let acc = 0,
    bits = 0;
  for (let i = 0; i < b64.length && out.length < n; i++) {
    const v = A.indexOf(b64.charAt(i));
    if (v < 0) break;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 255);
      acc &= (1 << bits) - 1;
    }
  }
  return out;
}
function imageKind_(b64) {
  const h = b64Head_(String(b64), 12);
  const is = function (off, str) {
    for (let i = 0; i < str.length; i++) if (h[off + i] !== str.charCodeAt(i)) return false;
    return true;
  };
  if (h.length >= 8 && h[0] === 0x89 && is(1, 'PNG')) return 'image/png';
  if (h.length >= 3 && h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return 'image/jpeg';
  if (h.length >= 12 && is(0, 'RIFF') && is(8, 'WEBP')) return 'image/webp';
  return null;
}

function uploadImage_(payload, store) {
  const d = payload.data;
  if (typeof d !== 'string') return { ok: false, error: '內容不符規則', reasons: ['data 必須是字串'] };
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+\/]+={0,2})$/.exec(d);
  if (!m) return { ok: false, error: '內容不符規則', reasons: ['只接受 PNG、JPEG、WebP 圖片'] };
  const kind = imageKind_(m[2]);
  if (!kind || kind !== m[1]) return { ok: false, error: '內容不符規則', reasons: ['圖片內容與格式不符'] };
  const bytes = Math.floor((m[2].length * 3) / 4);
  if (bytes > LIMITS.HARD_BYTES)
    return { ok: false, error: '內容不符規則', reasons: ['圖片超過 5 MB 的技術上限'] };
  const wanted = payload.id ? String(payload.id) : '';
  if (wanted && !ID_RE.test(wanted))
    return { ok: false, error: '內容不符規則', reasons: ['id 格式必須是「日期-短碼」'] };
  const warnings = [];
  const w = sizeWarning_('這張圖片', bytes, LIMITS.WARN_IMG_BYTES);
  if (w) warnings.push(w);
  return store.lock(function () {
    const same = wanted ? null : findSameAsset_(store, '.img', d, d.length);
    if (same) return { ok: true, id: same, bytes: bytes, warnings: warnings, created: false, reused: true };
    const id = wanted || newId_(store.today(), store.getIndexRows(), store);
    const name = id + '.img';
    const f = store.findFileByName('assets', name);
    if (f) store.updateText(f.fileId, d);
    else store.createText('assets', name, d);
    return { ok: true, id: id, bytes: bytes, warnings: warnings, created: !f };
  });
}

/** 被公開主題的畫布引用的圖片才算公開（圖片不會出現在筆記內文）。 */
function isImagePublic_(id, store) {
  return isAssetReferencedPublic_('assets/' + id + '.img', store);
}
function isAssetReferencedPublic_(target, store) {
  return store.getTopics().some(function (t) {
    if (!isTopicPublic_(t)) return false;
    const f = store.findFileByName('boards', t.id + '.canvas.json');
    if (!f) return false;
    try {
      return (JSON.parse(store.readText(f.fileId)).nodes || []).some(function (n) {
        return n && n.type === 'file' && n.file === target;
      });
    } catch (e) {
      return false;
    }
  });
}

function getImage_(payload, owner, store) {
  const id = String(payload.id || '');
  if (!ID_RE.test(id)) return NOT_FOUND;
  const f = store.findFileByName('assets', id + '.img');
  if (!f) return NOT_FOUND;
  if (!owner && !isImagePublic_(id, store)) return NOT_FOUND;
  return { ok: true, id: id, data: store.readText(f.fileId), updatedAt: f.updatedAt };
}

/* ───── HTML 卡片（P15）─────
 * HTML 檔以純文字存成 assets/<id>.html。後端不解析、不改寫內容：安全由前端的沙箱 iframe 負責
 * （預設不執行腳本、不給 allow-same-origin）。只有擁有者能上傳；訪客只拿得到公開畫布引用的檔案。 */
function utf8Len_(s) {
  return unescape(encodeURIComponent(s)).length;
}
/**
 * 內容完全相同的圖片／HTML 不重複存：找到就沿用舊檔（並「碰」一下更新時間，讓清理功能的 7 天寬限重新計算）。
 * 先用檔案大小篩選再比對全文，所以平常只多讀少數幾個檔。還原備份（帶指定 id）不走這條。
 */
function findSameAsset_(store, ext, text, bytes) {
  const hit = store.listFolder('assets').filter(function (f) {
    return (
      f.name.slice(-ext.length) === ext &&
      ASSET_NAME_RE.test(f.name) &&
      (f.size === undefined || f.size === bytes || f.size === text.length)
    );
  });
  for (let i = 0; i < hit.length; i++) {
    if (store.readText(hit[i].fileId) === text) {
      store.updateText(hit[i].fileId, text);
      return hit[i].name.slice(0, -ext.length);
    }
  }
  return null;
}
function uploadHtml_(payload, store) {
  const text = payload.text;
  if (typeof text !== 'string' || !text.trim())
    return { ok: false, error: '內容不符規則', reasons: ['HTML 內容不可為空'] };
  if (text.indexOf('\u0000') >= 0)
    return { ok: false, error: '內容不符規則', reasons: ['HTML 含有不合法字元'] };
  const bytes = utf8Len_(text);
  if (bytes > LIMITS.HTML_BYTES)
    return { ok: false, error: '內容不符規則', reasons: ['HTML 檔超過 500 KB 上限'] };
  const wanted = payload.id ? String(payload.id) : '';
  if (wanted && !ID_RE.test(wanted))
    return { ok: false, error: '內容不符規則', reasons: ['id 格式必須是「日期-短碼」'] };
  return store.lock(function () {
    const same = wanted ? null : findSameAsset_(store, '.html', text, bytes);
    if (same) return { ok: true, id: same, bytes: bytes, created: false, reused: true };
    const id = wanted || newId_(store.today(), store.getIndexRows(), store);
    const name = id + '.html';
    const f = store.findFileByName('assets', name);
    if (f) store.updateText(f.fileId, text);
    else store.createText('assets', name, text);
    return { ok: true, id: id, bytes: bytes, created: !f };
  });
}
function getHtml_(payload, owner, store) {
  const id = String(payload.id || '');
  if (!ID_RE.test(id)) return NOT_FOUND;
  const f = store.findFileByName('assets', id + '.html');
  if (!f) return NOT_FOUND;
  if (!owner && !isAssetReferencedPublic_('assets/' + id + '.html', store)) return NOT_FOUND;
  return { ok: true, id: id, text: store.readText(f.fileId), updatedAt: f.updatedAt };
}
function exportHtml_(payload, store) {
  const page = store.listFilesPage('assets', payload.cursor || null, 8, '.html');
  const htmls = [];
  page.files.forEach(function (f) {
    const id = f.name.replace(/\.html$/, '');
    if (ID_RE.test(id)) htmls.push({ id: id, text: store.readText(f.fileId), updatedAt: f.updatedAt });
  });
  return { ok: true, htmls: htmls, cursor: page.cursor };
}

/* ───── PDF 卡片（P17）─────
 * PDF 以資料網址文字（data:application/pdf;base64,…）存成 assets/<id>.pdf，與圖片相同（Drive 內是純文字檔，備份不需特別處理二進位）。
 * 後端只檢查：格式、檔頭是 %PDF-、大小上限。內容不改寫；顯示端用瀏覽器內建檢視器，不執行 PDF 內的任何東西在本站網域。 */
function uploadPdf_(payload, store) {
  const d = payload.data;
  if (typeof d !== 'string') return { ok: false, error: '內容不符規則', reasons: ['data 必須是字串'] };
  const m = /^data:application\/pdf;base64,([A-Za-z0-9+\/]+={0,2})$/.exec(d);
  if (!m) return { ok: false, error: '內容不符規則', reasons: ['只接受 PDF 檔'] };
  if (m[1].indexOf('JVBERi0') !== 0)
    return { ok: false, error: '內容不符規則', reasons: ['PDF 內容與格式不符'] };
  const bytes = Math.floor((m[1].length * 3) / 4);
  if (bytes > LIMITS.PDF_BYTES)
    return { ok: false, error: '內容不符規則', reasons: ['PDF 檔超過 5 MB 上限'] };
  const wanted = payload.id ? String(payload.id) : '';
  if (wanted && !ID_RE.test(wanted))
    return { ok: false, error: '內容不符規則', reasons: ['id 格式必須是「日期-短碼」'] };
  return store.lock(function () {
    const same = wanted ? null : findSameAsset_(store, '.pdf', d, d.length);
    if (same) return { ok: true, id: same, bytes: bytes, created: false, reused: true };
    const id = wanted || newId_(store.today(), store.getIndexRows(), store);
    const name = id + '.pdf';
    const f = store.findFileByName('assets', name);
    if (f) store.updateText(f.fileId, d);
    else store.createText('assets', name, d);
    return { ok: true, id: id, bytes: bytes, created: !f };
  });
}
function getPdf_(payload, owner, store) {
  const id = String(payload.id || '');
  if (!ID_RE.test(id)) return NOT_FOUND;
  const f = store.findFileByName('assets', id + '.pdf');
  if (!f) return NOT_FOUND;
  if (!owner && !isAssetReferencedPublic_('assets/' + id + '.pdf', store)) return NOT_FOUND;
  return { ok: true, id: id, data: store.readText(f.fileId), updatedAt: f.updatedAt };
}
function exportPdf_(payload, store) {
  const page = store.listFilesPage('assets', payload.cursor || null, 2, '.pdf'); // PDF 較大，一次只取 2 個
  const pdfs = [];
  page.files.forEach(function (f) {
    const id = f.name.replace(/\.pdf$/, '');
    if (ID_RE.test(id)) pdfs.push({ id: id, data: store.readText(f.fileId), updatedAt: f.updatedAt });
  });
  return { ok: true, pdfs: pdfs, cursor: page.cursor };
}

function exportImages_(payload, store) {
  const page = store.listFilesPage('assets', payload.cursor || null, 8, '.img');
  const images = [];
  page.files.forEach(function (f) {
    const id = f.name.replace(/\.img$/, '');
    if (ID_RE.test(id)) images.push({ id: id, data: store.readText(f.fileId), updatedAt: f.updatedAt });
  });
  return { ok: true, images: images, cursor: page.cursor };
}

/* ───── 清理未使用的圖片／HTML 檔（P16）─────
 * 「未使用」＝沒有任何一張畫布（公開、私人都算）的卡片引用它，且建立超過 ASSET_GRACE_DAYS 天。
 * 掃描只讀；移除只是移到 Drive 垃圾桶（30 天內可救回）。移除時伺服器會重算一次，
 * 所以過期的清單不可能讓「現在還被引用」的檔案被移走。任何一張畫布讀不了就整個中止（寧可不清）。 */
const ASSET_GRACE_DAYS = 7;
const ASSET_NAME_RE = /^(\d{8}-[a-z0-9]{2,8})\.(img|html|pdf)$/;

function unusedAssets_(store, includeRecent) {
  const used = {};
  store.listFolder('boards').forEach(function (f) {
    let b;
    try {
      b = JSON.parse(store.readText(f.fileId));
    } catch (e) {
      throw new Error('BOARD_UNREADABLE');
    }
    (Array.isArray(b.nodes) ? b.nodes : []).forEach(function (n) {
      if (n && n.type === 'file' && typeof n.file === 'string') used[n.file] = true;
    });
  });
  const limit = Date.parse(store.now()) - ASSET_GRACE_DAYS * 86400000;
  const out = { items: [], recent: 0 };
  store.listFolder('assets').forEach(function (f) {
    if (!ASSET_NAME_RE.test(f.name) || used['assets/' + f.name]) return;
    if (!includeRecent && Date.parse(f.updatedAt) > limit) {
      out.recent++;
      return;
    }
    out.items.push({ fileId: f.fileId, name: f.name, size: f.size || 0, updatedAt: f.updatedAt });
  });
  return out;
}

function scanAssets_(payload, store) {
  let r;
  try {
    r = unusedAssets_(store, payload.includeRecent === true);
  } catch (e) {
    return { ok: false, error: '有畫布讀取失敗，已停止掃描' };
  }
  r.items.sort(function (a, b) {
    return a.updatedAt < b.updatedAt ? -1 : 1;
  });
  return {
    ok: true,
    items: r.items.map(function (x) {
      return { name: x.name, size: x.size, updatedAt: x.updatedAt };
    }),
    recent: r.recent,
    graceDays: ASSET_GRACE_DAYS
  };
}

function trashAssets_(payload, store) {
  const names = Array.isArray(payload.names) ? payload.names : null;
  if (!names || !names.length || names.length > 200) return { ok: false, error: '清單格式不符' };
  let r;
  try {
    r = unusedAssets_(store, payload.includeRecent === true);
  } catch (e) {
    return { ok: false, error: '有畫布讀取失敗，已停止掃描' };
  }
  const ok = {};
  r.items.forEach(function (x) {
    ok[x.name] = x.fileId;
  });
  let trashed = 0;
  names.forEach(function (nm) {
    if (typeof nm === 'string' && ok[nm]) {
      store.trash(ok[nm]);
      delete ok[nm];
      trashed++;
    }
  });
  return { ok: true, trashed: trashed, skipped: names.length - trashed };
}
;

// ═══════════════ Sync.gs ═══════════════
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
    ['assets', '.pdf', 'assets/'],
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
;

// ═══════════════ Store.gs ═══════════════
/**
 * Store.gs — 正式儲存層：Drive 存檔、Sheets 存索引
 *
 * 約定（規劃書 4.1、4.3）
 *  - 檔名一律用 id；更新一律覆寫同一個檔案，檔案 ID 不變。
 *  - 筆記本體是 Drive 內的一般檔案（不轉成 Google 文件）。
 *  - Sheets 只是目錄，損毀時可由 rebuildIndex 從 Drive 重建。
 *  - 指令碼屬性每次請求只讀一次（見 loadConfig_），避免耗盡每日讀寫額度。
 */

var INDEX_HEADERS_ = [
  'id',
  'title',
  'topic',
  'date',
  'tags',
  'lang',
  'public',
  'cover',
  'driveFileId',
  'updatedAt',
  'links',
  'svgs',
  'source',
  'translationOf'
];
var TOPIC_HEADERS_ = ['id', 'title', 'category', 'status', 'defaultPublic', 'driveFileId'];
var VAULT_FOLDERS_ = ['notes', 'assets', 'topics', 'boards', 'themes', '_backup'];

function loadConfig_() {
  return PropertiesService.getScriptProperties().getProperties();
}

function mimeFor_(name) {
  if (/\.md$/.test(name)) return 'text/markdown';
  if (/\.svg$/.test(name)) return 'image/svg+xml';
  if (/\.json$/.test(name)) return 'application/json';
  return 'text/plain';
}

function rowToArray_(r) {
  return [
    r.id,
    r.title,
    r.topic,
    r.date,
    JSON.stringify(r.tags || []),
    r.lang,
    r.public === true ? 'TRUE' : r.public === false ? 'FALSE' : '',
    r.cover,
    r.driveFileId,
    r.updatedAt,
    (r.links || []).join(','),
    (r.svgs || []).join(','),
    r.source || '',
    r.translationOf || ''
  ];
}

function cellText_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'UTC', 'yyyy-MM-dd'); // 防止 Sheets 把日期字串自動轉成日期
  return v === null || v === undefined ? '' : String(v);
}

function arrayToRow_(a) {
  let tags = [];
  try {
    const t = JSON.parse(cellText_(a[4]) || '[]');
    if (Array.isArray(t)) tags = t.map(String);
  } catch (e) {}
  const pub = cellText_(a[6]).toUpperCase();
  return {
    id: cellText_(a[0]),
    title: cellText_(a[1]),
    topic: cellText_(a[2]),
    date: cellText_(a[3]),
    tags: tags,
    lang: cellText_(a[5]),
    public: pub === 'TRUE' ? true : pub === 'FALSE' ? false : null,
    cover: cellText_(a[7]),
    driveFileId: cellText_(a[8]),
    updatedAt: cellText_(a[9]),
    links: cellText_(a[10])
      .split(',')
      .filter(function (x) {
        return x;
      }),
    svgs: cellText_(a[11])
      .split(',')
      .filter(function (x) {
        return x;
      }), // 舊版索引沒有這欄時為空，執行 devRebuild 即可補齊
    source: cellText_(a[12]),
    translationOf: cellText_(a[13]) // 舊版索引沒有這欄時為空
  };
}

function ensureRows_(sheet, n) {
  const max = sheet.getMaxRows();
  if (max < n) sheet.insertRowsAfter(max, n - max);
}

function writeRows_(sheet, startRow, arrays, width) {
  if (!arrays.length) return;
  ensureRows_(sheet, startRow + arrays.length - 1);
  sheet.getRange(startRow, 1, arrays.length, width).setNumberFormat('@').setValues(arrays);
}

function makeStore_(cfg) {
  let rootFolder = null,
    ss = null,
    memoRows = null,
    memoTopics = null;
  const folders = {};

  function root() {
    return rootFolder || (rootFolder = DriveApp.getFolderById(cfg.ROOT_ID));
  }
  function folder(name) {
    if (!folders[name]) {
      const it = root().getFoldersByName(name);
      folders[name] = it.hasNext() ? it.next() : root().createFolder(name);
    }
    return folders[name];
  }
  function sheet(name) {
    ss = ss || SpreadsheetApp.openById(cfg.SHEET_ID);
    const s = ss.getSheetByName(name) || ss.insertSheet(name);
    const w =
      name === 'index' || name === 'index_tmp'
        ? INDEX_HEADERS_.length
        : name === 'topics'
          ? TOPIC_HEADERS_.length
          : 0;
    if (w && s.getMaxColumns() < w) s.insertColumnsAfter(s.getMaxColumns(), w - s.getMaxColumns());
    return s;
  }
  function iso(file) {
    return file.getLastUpdated().toISOString();
  }
  function findRowIndex(id) {
    const s = sheet('index');
    const last = s.getLastRow();
    if (last < 2) return -1;
    const ids = s.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) if (cellText_(ids[i][0]) === id) return i + 2;
    return -1;
  }

  return {
    now: function () {
      return new Date().toISOString();
    },
    today: function () {
      return Utilities.formatDate(new Date(), cfg.TZ || Session.getScriptTimeZone(), 'yyyy-MM-dd');
    },
    newCode: function () {
      return Utilities.getUuid().replace(/-/g, '').slice(0, 4);
    },

    lock: function (fn) {
      const l = LockService.getScriptLock();
      l.waitLock(10000);
      try {
        memoRows = null;
        memoTopics = null;
        return fn();
      } finally {
        l.releaseLock();
      }
    },

    getIndexRows: function () {
      if (memoRows) return memoRows;
      const s = sheet('index');
      const last = s.getLastRow();
      memoRows =
        last < 2
          ? []
          : s
              .getRange(2, 1, last - 1, INDEX_HEADERS_.length)
              .getValues()
              .map(arrayToRow_)
              .filter(function (r) {
                return r.id;
              });
      return memoRows;
    },
    upsertRow: function (row) {
      const s = sheet('index');
      const at = findRowIndex(row.id);
      writeRows_(
        s,
        at === -1 ? Math.max(s.getLastRow(), 1) + 1 : at,
        [rowToArray_(row)],
        INDEX_HEADERS_.length
      );
      memoRows = null;
    },
    removeRow: function (id) {
      const at = findRowIndex(id);
      if (at !== -1) sheet('index').deleteRow(at);
      memoRows = null;
    },

    getTopics: function () {
      if (memoTopics) return memoTopics;
      const s = sheet('topics');
      const last = s.getLastRow();
      memoTopics =
        last < 2
          ? []
          : s
              .getRange(2, 1, last - 1, TOPIC_HEADERS_.length)
              .getValues()
              .map(function (a) {
                return {
                  id: cellText_(a[0]),
                  title: cellText_(a[1]),
                  category: cellText_(a[2]),
                  status: cellText_(a[3]),
                  defaultPublic: cellText_(a[4]).toUpperCase() === 'TRUE',
                  driveFileId: cellText_(a[5])
                };
              })
              .filter(function (t) {
                return t.id;
              });
      return memoTopics;
    },
    /** 建立或更新主題：寫 topics/<id>.json 與 Sheets（規劃書未列對外端點，目前只供編輯器內的維護函式使用）。 */
    saveTopic: function (t) {
      const name = t.id + '.json';
      const text = JSON.stringify(
        {
          id: t.id,
          title: t.title,
          category: t.category || '',
          status: t.status || '',
          defaultPublic: t.defaultPublic === true
        },
        null,
        2
      );
      let f = this.findFileByName('topics', name),
        fileId;
      if (f) {
        this.updateText(f.fileId, text);
        fileId = f.fileId;
      } else {
        fileId = this.createText('topics', name, text).fileId;
      }
      const s = sheet('topics');
      const ids = s.getLastRow() < 2 ? [] : s.getRange(2, 1, s.getLastRow() - 1, 1).getValues();
      let at = -1;
      for (let i = 0; i < ids.length; i++) if (cellText_(ids[i][0]) === t.id) at = i + 2;
      writeRows_(
        s,
        at === -1 ? Math.max(s.getLastRow(), 1) + 1 : at,
        [
          [
            t.id,
            t.title,
            t.category || '',
            t.status || '',
            t.defaultPublic === true ? 'TRUE' : 'FALSE',
            fileId
          ]
        ],
        TOPIC_HEADERS_.length
      );
      memoTopics = null;
    },

    /** 刪除主題：主題檔與該主題的畫布檔移到垃圾桶，並移除 Sheets 列（呼叫前已確認主題內沒有筆記）。 */
    removeTopic: function (id) {
      const f = this.findFileByName('topics', id + '.json');
      if (f) this.trash(f.fileId);
      const b = this.findFileByName('boards', id + '.canvas.json');
      if (b) this.trash(b.fileId);
      const s = sheet('topics'),
        last = s.getLastRow();
      if (last >= 2) {
        const ids = s.getRange(2, 1, last - 1, 1).getValues();
        for (let i = ids.length - 1; i >= 0; i--) if (cellText_(ids[i][0]) === id) s.deleteRow(i + 2);
      }
      memoTopics = null;
    },

    /* ───── P5：備份、同步所需 ───── */
    nowMs: function () {
      return Date.now();
    },
    config: function () {
      return PropertiesService.getScriptProperties().getProperties();
    },
    getProp: function (k) {
      return PropertiesService.getScriptProperties().getProperty(k);
    },
    setProp: function (k, v) {
      PropertiesService.getScriptProperties().setProperty(k, v);
    },
    hash: function (text) {
      return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text, Utilities.Charset.UTF_8)
        .map(function (b) {
          return ('0' + (b & 255).toString(16)).slice(-2);
        })
        .join('');
    },
    http: function (req) {
      if (String(req.url).indexOf('https://api.github.com/') !== 0)
        throw new Error('只允許連線到 api.github.com');
      const o = {
        method: String(req.method || 'get').toLowerCase(),
        headers: req.headers || {},
        muteHttpExceptions: true,
        followRedirects: false
      };
      if (req.body !== undefined) {
        o.payload = req.body;
        o.contentType = 'application/json';
      }
      const r = UrlFetchApp.fetch(req.url, o);
      return { code: r.getResponseCode(), body: r.getContentText() };
    },
    /** 擷取公開網頁（P6 連結預覽）：只讀前 300 KB，視為 UTF-8；呼叫端須先用 previewUrlOk_ 檢查網址。 */
    fetchPage: function (url) {
      const r = UrlFetchApp.fetch(url, {
        method: 'get',
        muteHttpExceptions: true,
        followRedirects: true,
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'Mozilla/5.0 (compatible; VaultPreview/1.0)'
        }
      });
      const bytes = r.getContent();
      const text = Utilities.newBlob(bytes.length > 300000 ? bytes.slice(0, 300000) : bytes).getDataAsString(
        'UTF-8'
      );
      const h = r.getHeaders();
      const ct = String(h['Content-Type'] || h['content-type'] || '');
      return { code: r.getResponseCode(), contentType: ct, text: text };
    },
    listFolder: function (folderName) {
      const it = folder(folderName).getFiles(),
        out = [];
      while (it.hasNext()) {
        const f = it.next();
        if (!f.isTrashed())
          out.push({ fileId: f.getId(), name: f.getName(), updatedAt: iso(f), size: f.getSize() });
      }
      return out;
    },
    createZip: function (folderName, name, files) {
      const blobs = files.map(function (x) {
        return Utilities.newBlob(x.text, 'text/plain', x.path);
      });
      const zip = Utilities.zip(blobs, name),
        f = folder(folderName).createFile(zip);
      return { fileId: f.getId(), size: f.getSize() };
    },
    verifyZip: function (fileId, paths) {
      const names = Utilities.unzip(DriveApp.getFileById(fileId).getBlob()).map(function (b) {
        return b.getName();
      });
      const have = {};
      names.forEach(function (n) {
        have[n] = true;
      });
      return {
        ok:
          names.length === paths.length &&
          paths.every(function (p) {
            return have[p];
          }),
        count: names.length
      };
    },
    triggerList: function () {
      return ScriptApp.getProjectTriggers().map(function (t) {
        return t.getHandlerFunction();
      });
    },
    triggerEnsure: function (handler, spec) {
      if (this.triggerList().indexOf(handler) >= 0) return;
      const b = ScriptApp.newTrigger(handler).timeBased();
      if (spec.type === 'monthly') b.onMonthDay(spec.day).atHour(spec.hour).create();
      else b.everyDays(1).atHour(spec.hour).create();
    },
    triggerRemove: function (handler) {
      ScriptApp.getProjectTriggers().forEach(function (t) {
        if (t.getHandlerFunction() === handler) ScriptApp.deleteTrigger(t);
      });
    },
    scheduleOnce: function (handler, ms) {
      this.triggerRemove(handler);
      ScriptApp.newTrigger(handler).timeBased().after(ms).create();
    },

    readText: function (fileId) {
      return DriveApp.getFileById(fileId).getBlob().getDataAsString('UTF-8');
    },
    createText: function (folderName, name, text) {
      const f = folder(folderName).createFile(name, text, mimeFor_(name));
      return { fileId: f.getId(), updatedAt: iso(f) };
    },
    updateText: function (fileId, text) {
      const f = DriveApp.getFileById(fileId);
      f.setContent(text);
      return iso(f);
    },
    findFileByName: function (folderName, name) {
      const it = folder(folderName).getFilesByName(name);
      while (it.hasNext()) {
        const f = it.next();
        if (!f.isTrashed()) return { fileId: f.getId(), updatedAt: iso(f) };
      }
      return null;
    },
    trash: function (fileId) {
      DriveApp.getFileById(fileId).setTrashed(true);
    },
    /** 把垃圾桶裡同名的檔案救回來（畫布刪卡片後又復原時用）。 */
    untrash: function (folderName, name) {
      const it = folder(folderName).getFilesByName(name);
      while (it.hasNext()) {
        const f = it.next();
        if (f.isTrashed()) {
          f.setTrashed(false);
          return true;
        }
      }
      return false;
    },
    mimeOf: function (fileId) {
      return DriveApp.getFileById(fileId).getMimeType();
    },
    countFiles: function (folderName) {
      const it = folder(folderName).getFiles();
      let n = 0;
      while (it.hasNext()) {
        it.next();
        n++;
      }
      return n;
    },
    /** 效能量測用：一次寫入多列索引、依 id 前綴一次移除多列（只供 devPerf 使用）。 */
    appendRows: function (rows) {
      const s = sheet('index');
      writeRows_(s, Math.max(s.getLastRow(), 1) + 1, rows.map(rowToArray_), INDEX_HEADERS_.length);
      memoRows = null;
    },
    removeRowsByPrefix: function (prefix) {
      const s = sheet('index'),
        last = s.getLastRow();
      if (last < 2) return 0;
      const vals = s.getRange(2, 1, last - 1, INDEX_HEADERS_.length).getValues();
      const keep = vals.filter(function (r) {
        return cellText_(r[0]).indexOf(prefix) !== 0;
      });
      s.getRange(2, 1, last - 1, INDEX_HEADERS_.length).clearContent();
      writeRows_(s, 2, keep, INDEX_HEADERS_.length);
      memoRows = null;
      return vals.length - keep.length;
    },
    clearIndex: function () {
      const s = sheet('index');
      if (s.getLastRow() >= 2) s.getRange(2, 1, s.getLastRow() - 1, INDEX_HEADERS_.length).clearContent();
      memoRows = null;
    },

    /* ───── 重建索引：先寫暫存工作表，完成後一次換上，中斷不會留下半份索引 ───── */
    beginRebuild: function () {
      const s = sheet('index_tmp');
      s.clear();
      s.getRange(1, 1, 1, INDEX_HEADERS_.length).setNumberFormat('@').setValues([INDEX_HEADERS_]);
    },
    listFilesPage: function (folderName, cursor, limit, ext) {
      ext = ext || '.md';
      const it = cursor ? DriveApp.continueFileIterator(cursor) : folder(folderName).getFiles();
      const files = [];
      while (files.length < limit && it.hasNext()) {
        const f = it.next();
        if (f.getName().slice(-ext.length) === ext)
          files.push({ fileId: f.getId(), name: f.getName(), updatedAt: iso(f) });
      }
      return { files: files, cursor: it.hasNext() ? it.getContinuationToken() : null };
    },
    appendRebuildRows: function (rows) {
      const s = sheet('index_tmp');
      const last = s.getLastRow();
      const have = {};
      if (last >= 2)
        s.getRange(2, 1, last - 1, 1)
          .getValues()
          .forEach(function (r) {
            have[cellText_(r[0])] = true;
          });
      const dup = [],
        fresh = [];
      rows.forEach(function (r) {
        if (have[r.id]) dup.push(r.id);
        else {
          have[r.id] = true;
          fresh.push(rowToArray_(r));
        }
      });
      writeRows_(s, last + 1, fresh, INDEX_HEADERS_.length);
      return dup;
    },
    finishRebuild: function () {
      const tmp = sheet('index_tmp'),
        idx = sheet('index');
      const last = tmp.getLastRow();
      const data = last < 2 ? [] : tmp.getRange(2, 1, last - 1, INDEX_HEADERS_.length).getValues();
      if (idx.getLastRow() >= 2)
        idx.getRange(2, 1, idx.getLastRow() - 1, INDEX_HEADERS_.length).clearContent();
      writeRows_(idx, 2, data, INDEX_HEADERS_.length);
      ss.deleteSheet(tmp);
      memoRows = null;
    },
    rebuildTopics: function () {
      const it = folder('topics').getFiles();
      const rows = [];
      while (it.hasNext()) {
        const f = it.next();
        if (!/\.json$/.test(f.getName())) continue;
        try {
          const t = JSON.parse(f.getBlob().getDataAsString('UTF-8'));
          if (t && TOPIC_RE.test(String(t.id)) && f.getName() === t.id + '.json') {
            rows.push([
              t.id,
              String(t.title || ''),
              String(t.category || ''),
              String(t.status || ''),
              t.defaultPublic === true ? 'TRUE' : 'FALSE',
              f.getId()
            ]);
          }
        } catch (e) {
          /* 壞掉的主題檔略過，主題一律預設私人 */
        }
      }
      const s = sheet('topics');
      if (s.getLastRow() >= 2) s.getRange(2, 1, s.getLastRow() - 1, TOPIC_HEADERS_.length).clearContent();
      writeRows_(s, 2, rows, TOPIC_HEADERS_.length);
      memoTopics = null;
    }
  };
}
;

// ═══════════════ Code.gs ═══════════════
/**
 * Code.gs — 讀書筆記 Vault 後端入口（P1）
 *
 * 兩個部署共用這份程式碼（規劃書 D15）
 *   讀取部署：執行身分＝我、任何人可存取   → 只回公開內容
 *   編輯部署：執行身分＝使用者、Google 帳號 → 擁有者可讀全部、可寫入
 *
 * 判斷擁有者只靠「登入者 Email ＝ 指令碼屬性 OWNER_EMAIL」，任一邊為空一律視為非擁有者。
 * REST 的 GET 一律以訪客身分處理，不受登入狀態影響（公開網址永遠只給公開內容）。
 */

/* ───────── 身分 ───────── */
function normEmail_(s) {
  return String(s || '')
    .trim()
    .toLowerCase();
}

function isOwner_(activeEmail, ownerEmail) {
  const a = normEmail_(activeEmail),
    o = normEmail_(ownerEmail);
  return a !== '' && o !== '' && a === o;
}

function buildCtx_(cfg) {
  let active = '';
  try {
    active = Session.getActiveUser().getEmail() || '';
  } catch (e) {}
  return { active: normEmail_(active), isOwner: isOwner_(active, cfg.OWNER_EMAIL) };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function run_(action, payload, method) {
  const cfg = loadConfig_();
  if (!cfg.ROOT_ID || !cfg.SHEET_ID) return { ok: false, error: '尚未完成設定' };
  return handle_(action, payload, buildCtx_(cfg), method, makeStore_(cfg));
}

/* ───────── 入口 ───────── */
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  if (!action) {
    try {
      let base = String(loadConfig_().PUBLIC_URL || '').trim(); // 可在指令碼屬性設 PUBLIC_URL＝唯讀部署的網址，分享連結才不會指到編輯部署
      if (!base) {
        try {
          base = ScriptApp.getService().getUrl() || '';
        } catch (err2) {}
      }
      const raw = HtmlService.createHtmlOutputFromFile('index').getContent();
      // 把網址參數（?note=、?topic=、?lang=）經驗證後交給前端；不用 template，避免前端程式碼裡的 <? 被誤判
      const page = raw.split('/*__ROUTE__*/null').join(routeJson_(e && e.parameter, base));
      return HtmlService.createHtmlOutput(page)
        .setTitle('讀書筆記 Vault')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    } catch (err) {
      return HtmlService.createHtmlOutput('<p>後端已就緒，但專案裡缺少名為 index 的 HTML 檔案。</p>');
    }
  }
  return json_(run_(action, { id: e.parameter.id, topic: e.parameter.topic }, 'GET'));
}

function doPost(e) {
  let body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {}
  return json_(run_(body.action, body, 'POST'));
}

/** 給網頁的 google.script.run 使用（結尾無底線才能被前端呼叫）。 */
function api(action, payload) {
  return run_(action, payload || {}, 'RUN');
}

/* ───────── 計時器入口（P5）：由計時器以擁有者身分執行，不對外開放 ───────── */
function scheduledBackup() {
  backupScheduled_(makeStore_(loadConfig_()), true);
}
function backupContinue() {
  const store = makeStore_(loadConfig_());
  store.triggerRemove('backupContinue'); // 一次性接力用完就刪，避免累積計時器
  backupScheduled_(store, false);
}
function scheduledSync() {
  syncSite_({}, makeStore_(loadConfig_()));
}

/* ───────── P5：編輯器內手動執行的輔助函式 ───────── */
/** 貼上新版程式後，在編輯器執行一次：讓 Google 跳出授權視窗（新增「連線到外部服務」與「管理計時器」兩項權限）。 */
function authorizeP5() {
  ScriptApp.getProjectTriggers();
  try {
    UrlFetchApp.fetch('https://api.github.com/zen', { muteHttpExceptions: true });
  } catch (e) {
    /* 只為觸發授權 */
  }
  Logger.log('授權完成。可以回到網頁使用「同步與備份」。');
}
/** 在編輯器直接跑一段備份（約 4 分鐘預算）並把狀態印到執行記錄；做不完就再執行一次或用網頁按鈕。 */
function devBackupNow() {
  Logger.log(JSON.stringify(backupStep_(makeStore_(loadConfig_()), 240000, true)));
}
/** 預覽同步會改哪些檔（不提交）。 */
function devSyncPreview() {
  Logger.log(JSON.stringify(syncSite_({ dryRun: true }, makeStore_(loadConfig_()))));
}

/** 檢查 PUBLIC_URL：把設定值與判斷結果印到執行記錄（分享連結沒出現完整網址時用）。 */
function devCheckPublicUrl() {
  const raw = loadConfig_().PUBLIC_URL;
  const r = JSON.parse(routeJson_({}, String(raw || '').trim()));
  Logger.log('PUBLIC_URL 原始值（含引號可看出前後空白）：' + JSON.stringify(raw === undefined ? null : raw));
  Logger.log(
    r.base
      ? '判斷：可用。分享連結開頭會是 ' + r.base
      : '判斷：不可用（沒設定，或不是 https://script.google.com/ 開頭的網址）。'
  );
}

/* ───────── 一次性設定：由擁有者在編輯器手動執行 ───────── */
function getOrCreateFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function setupVault() {
  const props = PropertiesService.getScriptProperties();
  const owner = Session.getEffectiveUser().getEmail();
  if (!owner) throw new Error('取不到你的 Email，請確認已授權後再執行 setupVault');

  const root = getOrCreateFolder_(DriveApp.getRootFolder(), 'Vault');
  VAULT_FOLDERS_.forEach(function (n) {
    getOrCreateFolder_(root, n);
  });

  let sheetId = props.getProperty('SHEET_ID');
  if (!sheetId) {
    const created = SpreadsheetApp.create('Vault 索引');
    DriveApp.getFileById(created.getId()).moveTo(root);
    sheetId = created.getId();
  }
  const ss = SpreadsheetApp.openById(sheetId);
  const first = ss.getSheets()[0];
  if (first.getName() !== 'index' && !ss.getSheetByName('index')) first.setName('index');
  [
    ['index', INDEX_HEADERS_],
    ['topics', TOPIC_HEADERS_]
  ].forEach(function (pair) {
    const s = ss.getSheetByName(pair[0]) || ss.insertSheet(pair[0]);
    s.getRange(1, 1, 1, pair[1].length).setNumberFormat('@').setValues([pair[1]]);
  });

  props.setProperties({
    OWNER_EMAIL: owner,
    ROOT_ID: root.getId(),
    SHEET_ID: sheetId,
    TZ: Session.getScriptTimeZone()
  });

  const store = makeStore_(loadConfig_());
  if (
    !store.getTopics().some(function (t) {
      return t.id === 'journal';
    })
  ) {
    store.saveTopic({
      id: 'journal',
      title: '日記',
      category: '日記',
      status: 'active',
      defaultPublic: true
    }); // 規劃書 4.5：journal 預設公開
  }
  Logger.log('設定完成。擁有者：' + owner + '；資料夾：Vault；索引試算表：' + sheetId);
}

/* ───────── 驗收用示範資料（以擁有者身分，走正式的 handle_ 路徑；可重複執行） ───────── */
function devSeed() {
  const cfg = loadConfig_();
  const results = seedVault_(makeStore_(cfg), { isOwner: true, active: normEmail_(cfg.OWNER_EMAIL) });
  Logger.log(
    JSON.stringify(
      results.map(function (r) {
        return r.ok
          ? r.deduped
            ? 'ok(重送)'
            : 'ok'
          : r.error + (r.reasons ? ' ' + r.reasons.join('、') : '');
      })
    )
  );
}

function seedVault_(store, owner) {
  const call = function (action, payload) {
    return handle_(action, payload, owner, 'RUN', store);
  };

  store.saveTopic({
    id: 'db-design',
    title: '資料庫設計',
    category: '資料庫',
    status: 'reading',
    defaultPublic: false
  });
  store.saveTopic({ id: 'journal', title: '日記', category: '日記', status: 'active', defaultPublic: true });

  const results = [];
  const note = function (id, meta, body) {
    const ex = store.getIndexRows().filter(function (r) {
      return r.id === id;
    })[0];
    const y = ['id: ' + id, 'title: ' + meta.title, 'topic: ' + meta.topic, 'date: 2026-10-22'];
    if (meta.public !== undefined) y.push('public: ' + meta.public);
    results.push(
      call('saveNote', {
        id: id,
        baseUpdatedAt: ex ? ex.updatedAt : undefined,
        text: '---\n' + y.join('\n') + '\n---\n' + body
      })
    );
  };
  note(
    '20261022-p001',
    { title: '私人筆記標題', topic: 'db-design' },
    '# 私人\nSECRET-BODY-1\n![](assets/20261022-v002.svg)\n'
  );
  note(
    '20261022-p002',
    { title: '公開筆記（來自私人主題）', topic: 'db-design', public: true },
    '# 公開\nPUBLIC-BODY-1，參考 [[20261022-p001]] 與 [[20261022-j001]]。\n![圖](assets/20261022-v001.svg)\n'
  );
  note('20261022-j001', { title: '日記（公開）', topic: 'journal' }, '# 日記\nPUBLIC-BODY-2\n');
  note(
    '20261022-j002',
    { title: '日記（私人）', topic: 'journal', public: false },
    '# 日記\nSECRET-BODY-2\n'
  );

  results.push(
    call('uploadSvg', {
      id: '20261022-v001',
      text: '<svg viewBox="0 0 10 10"><script>alert(1)</script><rect width="10" height="10" onclick="x()"/></svg>'
    })
  );
  results.push(
    call('uploadSvg', {
      id: '20261022-v002',
      text: '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>'
    })
  );
  results.push(
    call('saveBoard', {
      topic: 'journal',
      baseUpdatedAt: (store.findFileByName('boards', 'journal.canvas.json') || {}).updatedAt,
      board: {
        nodes: [
          {
            id: 'g1',
            type: 'group',
            label: '私人群組',
            x: 0,
            y: 0,
            width: 400,
            height: 300,
            'x-collapsed': false
          },
          {
            id: 'n1',
            type: 'file',
            file: 'notes/20261022-j001.md',
            x: 500,
            y: 0,
            width: 260,
            height: 140,
            'x-custom': 'keep-me'
          },
          {
            id: 'n2',
            type: 'file',
            file: 'notes/20261022-j002.md',
            x: 20,
            y: 30,
            width: 260,
            height: 140,
            'x-parent': 'g1'
          },
          { id: 'n3', type: 'text', text: '便利貼', x: 500, y: 300, width: 200, height: 100 }
        ],
        edges: [
          { id: 'e1', fromNode: 'n1', toNode: 'n2' },
          { id: 'e2', fromNode: 'n1', toNode: 'n3', 'x-style': 'dashed' }
        ],
        'x-unknown-top': { keep: true }
      }
    })
  );
  return results;
}

/** 手動驗收用：清空索引後由 Drive 重建。分批呼叫直到完成。 */
function devRebuild() {
  const cfg = loadConfig_();
  const store = makeStore_(cfg);
  const owner = { isOwner: true, active: normEmail_(cfg.OWNER_EMAIL) };
  let cursor = null,
    rounds = 0,
    added = 0,
    problems = [];
  do {
    const r = handle_('rebuildIndex', { cursor: cursor }, owner, 'RUN', store);
    if (!r.ok) throw new Error(r.error);
    added += r.added;
    problems = problems.concat(r.problems);
    cursor = r.done ? null : r.cursor;
    rounds++;
  } while (cursor);
  Logger.log(
    '重建完成：' +
      added +
      ' 則，分 ' +
      rounds +
      ' 批；待處理 ' +
      problems.length +
      ' 項 ' +
      JSON.stringify(problems)
  );
}

/** 手動驗收用：清空索引內容（保留表頭），用來驗證 devRebuild 能還原。 */
function devClearIndex() {
  const s = SpreadsheetApp.openById(loadConfig_().SHEET_ID).getSheetByName('index');
  if (s.getLastRow() >= 2) s.getRange(2, 1, s.getLastRow() - 1, INDEX_HEADERS_.length).clearContent();
  Logger.log('索引已清空');
}

/** 手動驗收用：試著把 db-design 改為公開但不附確認，應被擋下並回報受影響筆記數；不會改動任何資料。 */
function devTopicDemo() {
  const cfg = loadConfig_();
  const owner = { isOwner: true, active: normEmail_(cfg.OWNER_EMAIL) };
  const r = handle_(
    'saveTopic',
    { id: 'db-design', title: '資料庫設計', category: '資料庫', status: 'reading', defaultPublic: true },
    owner,
    'RUN',
    makeStore_(cfg)
  );
  Logger.log(JSON.stringify(r));
}

/* ───────── 一鍵自我檢查：在編輯器執行 devSelfCheck，只看最後一行 ───────── */
/**
 * 以真實的 Drive 與 Sheets，驗證能在伺服器內自動驗證的所有項目：
 * 示範資料、重複執行不產生重複檔、訪客視角不外洩、清空索引後可重建、檔案是一般檔案、SVG 已清除、主題公開保護。
 * 網頁部署那一層（網址是否跑新版本）不在這裡，要另外用網址測。
 */
function runSelfCheck_(store) {
  const owner = { isOwner: true, active: 'owner@example.com' };
  const visitor = { isOwner: false, active: '' };
  const lines = [];
  let pass = 0,
    fail = 0;
  const check = function (name, cond) {
    if (cond) {
      pass++;
      lines.push('通過  ' + name);
    } else {
      fail++;
      lines.push('失敗  ' + name);
    }
  };
  const V = function (action, payload) {
    return handle_(action, payload || {}, visitor, 'GET', store);
  };
  const O = function (action, payload) {
    return handle_(action, payload || {}, owner, 'RUN', store);
  };
  const J = function (x) {
    return JSON.stringify(x);
  };
  const ids = function (r) {
    return r.items
      .map(function (i) {
        return i.id;
      })
      .sort();
  };

  const seeded = seedVault_(store, owner);
  check(
    '示範資料全部寫入成功',
    seeded.every(function (r) {
      return r.ok;
    })
  );
  const notesBefore = store.countFiles('notes');
  check(
    '重複執行示範資料不會產生重複檔案',
    seedVault_(store, owner).every(function (r) {
      return r.ok;
    }) && store.countFiles('notes') === notesBefore
  );

  const out = [];
  const list = V('listIndex');
  out.push(list);
  check('訪客列表只有 2 則公開筆記', J(ids(list)) === J(['20261022-j001', '20261022-p002']));
  check(
    '訪客主題清單只有公開的 journal',
    J(
      list.topics.map(function (t) {
        return t.id;
      })
    ) === J(['journal'])
  );
  const priv = V('getNote', { id: '20261022-p001' }),
    none = V('getNote', { id: '20261022-zzzz' });
  check('私人筆記與不存在的回應完全相同', J(priv) === J(none) && priv.error === '找不到');
  const p2 = V('getNote', { id: '20261022-p002' });
  out.push(priv, p2);
  check(
    '公開筆記內的私人連結已轉成純文字',
    p2.ok && p2.body.indexOf('（未公開的筆記）') !== -1 && p2.body.indexOf('20261022-p001') === -1
  );
  const jb = V('getBoard', { topic: 'journal' });
  const dbb = V('getBoard', { topic: 'db-design' });
  out.push(jb, dbb);
  check(
    '公開畫布不含私人卡片與其群組，並保留 x- 欄位',
    jb.ok &&
      J(jb).indexOf('j002') === -1 &&
      J(jb).indexOf('私人群組') === -1 &&
      J(jb).indexOf('keep-me') !== -1
  );
  check('私人主題的畫布訪客取不到', dbb.error === '找不到');
  const s1 = V('getSvg', { id: '20261022-v001' }),
    s2 = V('getSvg', { id: '20261022-v002' }),
    s3 = V('getSvg', { id: '20261022-zzzz' });
  out.push(s1, s2);
  check('被公開筆記引用的 SVG 訪客讀得到', s1.ok === true && s1.svg.indexOf('<svg') === 0);
  check('只被私人筆記引用的 SVG 與不存在的回應相同', J(s2) === J(s3));
  const all = J(out);
  [
    '私人筆記標題',
    'SECRET-BODY',
    '日記（私人）',
    '20261022-p001',
    '20261022-j002',
    '20261022-v002',
    'driveFileId',
    '資料庫設計',
    'db-design'
  ].forEach(function (w) {
    check('訪客回應不含：' + w, all.indexOf(w) === -1);
  });
  check(
    '訪客無法執行任何寫入動作',
    ['saveNote', 'saveBoard', 'saveTopic', 'uploadSvg', 'deleteNote', 'rebuildIndex'].every(function (a) {
      return (
        handle_(a, { id: '20261022-j001', text: 'x', topic: 'journal', title: 'x' }, visitor, 'POST', store)
          .ok !== true
      );
    })
  );
  check('擁有者讀得到私人筆記', O('getNote', { id: '20261022-p001' }).body.indexOf('SECRET-BODY-1') !== -1);

  const before = J(
    O('listIndex').items.sort(function (a, b) {
      return a.id < b.id ? -1 : 1;
    })
  );
  store.clearIndex();
  check('清空索引後列表為空', O('listIndex').items.length === 0);
  let cursor = null,
    guard = 0,
    problems = 0;
  do {
    const r = O('rebuildIndex', { cursor: cursor });
    cursor = r.done ? null : r.cursor;
    problems += (r.problems || []).length;
    guard++;
  } while (cursor && guard < 50);
  const after = J(
    O('listIndex').items.sort(function (a, b) {
      return a.id < b.id ? -1 : 1;
    })
  );
  check('由 Drive 重建後索引與原本完全一致', after === before);
  check(
    '重建後 SVG 的公開判斷仍正確',
    V('getSvg', { id: '20261022-v001' }).ok === true && V('getSvg', { id: '20261022-v002' }).ok === false
  );

  const row = O('listIndex').items[0];
  const noteRow = store.getIndexRows().filter(function (r) {
    return r.id === row.id;
  })[0];
  check(
    '筆記是一般檔案，不是 Google 文件',
    String(store.mimeOf(noteRow.driveFileId)).indexOf('application/vnd.google-apps') === -1
  );
  const svgFile = store.findFileByName('assets', '20261022-v001.svg');
  check(
    'Drive 內的 SVG 已清除腳本與事件屬性',
    !!svgFile && !/script|onclick|onload/i.test(store.readText(svgFile.fileId))
  );

  const ex = O('exportBatch', { limit: 100 }),
    exa = O('exportAssets');
  check(
    '匯出：筆記全文與索引筆數一致',
    ex.ok && ex.notes.length === O('listIndex').items.length && ex.missing.length === 0
  );
  check(
    '匯出：SVG 清單含示範圖',
    exa.ok &&
      exa.assets.some(function (a) {
        return a.id === '20261022-v001';
      })
  );
  check('訪客無法匯出', V('exportBatch').ok !== true && V('exportAssets').ok !== true);

  const ask = O('saveTopic', { id: 'db-design', title: '資料庫設計', defaultPublic: true });
  check(
    '私人主題改公開需要確認，且沒確認就不改動',
    ask.error === '需要確認' && V('listIndex').topics.length === 1
  );

  return { pass: pass, fail: fail, lines: lines };
}

function devSelfCheck() {
  const r = runSelfCheck_(makeStore_(loadConfig_()));
  r.lines.forEach(function (l) {
    Logger.log(l);
  });
  const summary = '自我檢查：' + r.pass + ' 項通過，' + r.fail + ' 項失敗';
  Logger.log(summary);
  if (r.fail > 0) throw new Error(summary + '（失敗項目見執行記錄）');
}

/* ───────── 效能量測：在編輯器執行 devPerf，約 2 到 4 分鐘，結束後自動清除測試資料 ───────── */
/**
 * 量測「讀索引」的伺服器端耗時（對應規劃書 8 章「索引載入後 1 秒內可操作」）：
 *  1. 建立 200 則真實筆記檔（每則約 3 KB）→ 量 listIndex、exportBatch
 *  2. 再補到 6,000 列、20,000 列的測試索引列（不建檔）→ 量 listIndex
 *  3. 一律清除（id 以 29990101- 或 29990102- 開頭）。
 * 數字只含伺服器端處理時間，不含網頁應用程式冷啟動與網路傳輸。
 */
function runPerf_(factory, opts) {
  opts = opts || {};
  const REAL = opts.real || 200,
    STEPS = opts.steps || [6000, 20000],
    GUARD_MS = opts.guardMs || 200000;
  const t0 = Date.now(),
    visitor = { isOwner: false, active: '' },
    owner = { isOwner: true, active: 'owner@example.com' };
  const out = { lines: [], ok: true },
    created = [];
  const log = function (s) {
    out.lines.push(s);
  };
  const median = function (a) {
    a = a.slice().sort(function (x, y) {
      return x - y;
    });
    return a[Math.floor(a.length / 2)];
  };
  const measure = function (label, ctx, method, action, payload) {
    const times = [];
    let size = 0,
      n = 0;
    for (let i = 0; i < 3; i++) {
      const store = factory(),
        t = Date.now();
      const r = handle_(action, payload || {}, ctx, method, store);
      times.push(Date.now() - t);
      size = JSON.stringify(r).length;
      n = (r.items || r.notes || []).length;
    }
    log(label + '：' + median(times) + ' ms（回傳 ' + n + ' 列，約 ' + Math.round(size / 1024) + ' KB）');
  };
  const body = new Array(60).join('這是一段用來模擬筆記內容的文字，共約三千位元組。'); // 約 3 KB
  const idOf = function (prefix, i) {
    return prefix + ('00000' + i.toString(36)).slice(-5);
  };
  const row = function (id, fileId, updatedAt) {
    return {
      id: id,
      title: '效能測試筆記 ' + id,
      topic: '',
      date: '2999-01-01',
      tags: ['perf', '測試'],
      lang: '',
      public: null,
      cover: '',
      driveFileId: fileId,
      updatedAt: updatedAt,
      links: [],
      svgs: [],
      source: ''
    };
  };
  const store0 = factory(),
    base = store0.getIndexRows().length;
  try {
    const realRows = [];
    for (let i = 0; i < REAL && Date.now() - t0 < GUARD_MS; i++) {
      const id = idOf('29990101-', i),
        f = store0.createText(
          'notes',
          id + '.md',
          '---\nid: ' + id + '\ntitle: 效能測試筆記 ' + id + '\ndate: 2999-01-01\n---\n' + body
        );
      created.push(f.fileId);
      realRows.push(row(id, f.fileId, f.updatedAt));
    }
    store0.appendRows(realRows);
    log('建立 ' + realRows.length + ' 則真實筆記，用時 ' + (Date.now() - t0) + ' ms');
    measure('訪客 listIndex @ ' + (base + realRows.length) + ' 列', visitor, 'GET', 'listIndex');
    measure('擁有者 listIndex @ ' + (base + realRows.length) + ' 列', owner, 'RUN', 'listIndex');
    measure(
      '擁有者 exportBatch(50) @ ' + (base + realRows.length) + ' 列（含讀 50 個檔）',
      owner,
      'RUN',
      'exportBatch',
      { limit: 50 }
    );
    let have = realRows.length;
    STEPS.forEach(function (target) {
      if (Date.now() - t0 > GUARD_MS + 40000) {
        log('時間不足，略過 ' + target + ' 列');
        return;
      }
      const extra = [];
      for (let i = have; i < target; i++)
        extra.push(row(idOf('29990102-', i), 'x', '2999-01-01T00:00:00.000Z'));
      for (let k = 0; k < extra.length; k += 4000) store0.appendRows(extra.slice(k, k + 4000));
      have = target;
      measure('訪客 listIndex @ ' + (base + target) + ' 列', visitor, 'GET', 'listIndex');
      measure('擁有者 listIndex @ ' + (base + target) + ' 列', owner, 'RUN', 'listIndex');
    });
  } catch (e) {
    out.ok = false;
    log('量測中斷：' + e.message);
  } finally {
    const removed = factory().removeRowsByPrefix('29990101-') + factory().removeRowsByPrefix('29990102-');
    created.forEach(function (id) {
      try {
        store0.trash(id);
      } catch (e) {
        /* 已不存在 */
      }
    });
    const after = factory().getIndexRows().length;
    log(
      '已清除測試資料：移除 ' +
        removed +
        ' 列、' +
        created.length +
        ' 個檔案（移至垃圾桶）；索引列數 ' +
        base +
        ' → ' +
        after
    );
    if (after !== base) {
      out.ok = false;
      log('警告：索引列數與測試前不同，請執行 devRebuild');
    }
  }
  log('總用時 ' + Math.round((Date.now() - t0) / 1000) + ' 秒');
  return out;
}

function devPerf() {
  const cfg = loadConfig_();
  const store = makeStore_(cfg);
  const r = runPerf_(function () {
    return makeStore_(cfg);
  });
  // 除了執行記錄，另外寫一份到 Drive，方便在 Apps Script 編輯器之外讀取結果。
  const stamp = Utilities.formatDate(new Date(), cfg.TZ || Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
  const report = (r.ok ? '[通過]\n' : '[未完整]\n') + r.lines.join('\n') + '\n';
  try {
    store.createText('_backup', 'devPerf-' + stamp + '.txt', report);
  } catch (e) {
    Logger.log('（寫入報告檔失敗，仍可看下方執行記錄）' + e.message);
  }
  r.lines.forEach(function (l) {
    Logger.log(l);
  });
  if (!r.ok) throw new Error('量測未完整（見執行記錄，或 Vault/_backup/devPerf-' + stamp + '.txt）');
}
;
