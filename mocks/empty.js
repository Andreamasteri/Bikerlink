"use strict";
// Universal no-op proxy — sostituisce i pacchetti server-only (drizzle-orm, pg, ecc.)
// nel bundle React Native. Deve essere callable (pgTable("users",{})) e accessibile
// come oggetto (drizzle.sql`...`) senza crashare.
const _p = new Proxy(function _mock() { return _p; }, {
  get: function(_, k) {
    if (k === "__esModule") return false;
    if (k === "default")    return _p;
    if (typeof k === "symbol") return undefined;
    return _p;
  },
  apply:     function() { return _p; },
  construct: function() { return _p; },
  set:       function() { return true; },
  has:       function() { return false; },
});
module.exports = _p;
module.exports.default = _p;
