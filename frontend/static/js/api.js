/**
 * api.js — Thin fetch wrapper for JSON REST API
 */

const API = (() => {
  async function _req(method, url, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${method} ${url} → ${res.status}: ${text}`);
    }
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return res.text();
  }

  return {
    get:  (url)          => _req('GET',    url),
    post: (url, body)    => _req('POST',   url, body),
    put:  (url, body)    => _req('PUT',    url, body),
    del:  (url)          => _req('DELETE', url),
    patch:(url, body)    => _req('PATCH',  url, body),
  };
})();
