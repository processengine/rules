const { deepGet } = require("../../utils");
module.exports = function(rule, ctx) {
  try {
    const got = ctx.get(rule.field);
    if (!got.ok) return { status: "UNDEFINED" };
    return { status: got.value !== rule.value ? "TRUE" : "FALSE" };
  } catch (e) { return { status: "EXCEPTION", error: e }; }
};
