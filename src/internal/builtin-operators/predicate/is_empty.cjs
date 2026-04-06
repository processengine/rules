const { deepGet, isEmptyValue } = require("../../legacy-utils.cjs");
module.exports = function(rule, ctx) {
  try {
    const got = ctx.get(rule.field);
    if (!got.ok) return { status: "UNDEFINED" };
    return { status: isEmptyValue(got.value) ? "TRUE" : "FALSE" };
  } catch (e) { return { status: "EXCEPTION", error: e }; }
};
