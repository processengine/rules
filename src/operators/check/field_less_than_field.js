const { deepGet, toComparable } = require("../../utils");
module.exports = function(rule, ctx) {
  try {
    const a = ctx.get(rule.field);
    const b = ctx.get(rule.value_field);
    if (!a.ok || !b.ok) return { status: "FAIL" };
    const left = toComparable(a.value);
    const right = toComparable(b.value);
    if (!left || !right || left.kind !== right.kind) return { status: "FAIL" };
    return { status: left.value < right.value ? "OK" : "FAIL" };
  } catch (e) { return { status: "EXCEPTION", error: e }; }
};
