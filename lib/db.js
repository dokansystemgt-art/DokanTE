'use strict';
// Capa fina sobre @libsql/client con la misma forma que usaba node:sqlite, pero ASÍNCRONA:
//   await db.prepare(sql).get(...args) / .all(...args) / .run(...args)
//   await db.exec(sqlConVariasSentencias)
//   await db.tx(async (t) => { await t.prepare(...).run(...); ... })   // transacción de escritura
// Si TURSO_DATABASE_URL no está definida, usa el archivo local data/dokan.db (útil para desarrollar).
const { createClient } = require('@libsql/client');

const norm = (args) => args.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
const toObj = (rs, row) => { const o = {}; rs.columns.forEach((c, i) => { o[c] = row[i]; }); return o; };

function api(runner) {
  return {
    prepare(sql) {
      return {
        async get(...a) { const rs = await runner.execute({ sql, args: norm(a) }); return rs.rows.length ? toObj(rs, rs.rows[0]) : undefined; },
        async all(...a) { const rs = await runner.execute({ sql, args: norm(a) }); return rs.rows.map((r) => toObj(rs, r)); },
        async run(...a) { const rs = await runner.execute({ sql, args: norm(a) }); return { changes: rs.rowsAffected, lastInsertRowid: rs.lastInsertRowid }; },
      };
    },
  };
}

function createDb({ url, authToken }) {
  const client = createClient({ url, authToken: authToken || undefined });
  return {
    ...api(client),
    exec: (sql) => client.executeMultiple(sql),
    async tx(fn) {
      const t = await client.transaction('write');
      try {
        const r = await fn(api(t));
        await t.commit();
        return r;
      } catch (e) {
        try { await t.rollback(); } catch { /* ya cerrada */ }
        throw e;
      } finally { t.close(); }
    },
    client,
  };
}
module.exports = { createDb };
