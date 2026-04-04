"use strict";
const { deepGet } = require("../../utils");

function normalizePattern(p) {
  return String(p ?? "").replace(/\\\\/g, "\\");
}

module.exports = function(rule, ctx) {
  try {
    const got = ctx.get(rule.field);
    if (!got.ok) return { status: "FALSE" };
    const s = String(got.value ?? "");
    const pattern = normalizePattern(rule.value);
    const flags = typeof rule.flags === "string" ? rule.flags : "";
    const re = new RegExp(pattern, flags);
    return { status: re.test(s) ? "TRUE" : "FALSE" };
  } catch (e) { return { status: "EXCEPTION", error: e }; }
};
