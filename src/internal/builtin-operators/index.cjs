const pred_equals = require("./predicate/equals.cjs");
const pred_not_equals = require("./predicate/not_equals.cjs");
const pred_not_empty = require("./predicate/not_empty.cjs");
const pred_is_empty = require("./predicate/is_empty.cjs");
const pred_matches_regex = require("./predicate/matches_regex.cjs");
const pred_in_dictionary = require("./predicate/in_dictionary.cjs");
const pred_contains = require("./predicate/contains.cjs");
const pred_greater_than = require("./predicate/greater_than.cjs");
const pred_less_than = require("./predicate/less_than.cjs");

const chk_not_empty = require("./check/not_empty.cjs");
const chk_is_empty = require("./check/is_empty.cjs");
const chk_length_equals = require("./check/length_equals.cjs");
const chk_length_max = require("./check/length_max.cjs");
const chk_matches_regex = require("./check/matches_regex.cjs");
const chk_in_dictionary = require("./check/in_dictionary.cjs");
const chk_equals = require("./check/equals.cjs");
const chk_not_equals = require("./check/not_equals.cjs");
const chk_contains = require("./check/contains.cjs");
const chk_greater_than = require("./check/greater_than.cjs");
const chk_less_than = require("./check/less_than.cjs");
const chk_field_less_than_field = require("./check/field_less_than_field.cjs");
const chk_field_greater_than_field = require("./check/field_greater_than_field.cjs");
const chk_any_filled = require("./check/any_filled.cjs");

const pred_field_equals_field = require("./predicate/field_equals_field.cjs");
const pred_field_not_equals_field = require("./predicate/field_not_equals_field.cjs");
const pred_field_less_or_equal_than_field = require("./predicate/field_less_or_equal_than_field.cjs");
const pred_field_greater_or_equal_than_field = require("./predicate/field_greater_or_equal_than_field.cjs");

const chk_field_equals_field = require("./check/field_equals_field.cjs");
const chk_field_not_equals_field = require("./check/field_not_equals_field.cjs");
const chk_field_less_or_equal_than_field = require("./check/field_less_or_equal_than_field.cjs");
const chk_field_greater_or_equal_than_field = require("./check/field_greater_or_equal_than_field.cjs");

const Operators = {
  predicate: {
    equals: pred_equals,
    not_equals: pred_not_equals,
    not_empty: pred_not_empty,
    is_empty: pred_is_empty,
    matches_regex: pred_matches_regex,
    in_dictionary: pred_in_dictionary,
    contains: pred_contains,
    greater_than: pred_greater_than,
    less_than: pred_less_than,
    field_equals_field: pred_field_equals_field,
    field_not_equals_field: pred_field_not_equals_field,
    field_less_or_equal_than_field: pred_field_less_or_equal_than_field,
    field_greater_or_equal_than_field: pred_field_greater_or_equal_than_field,
  },
  check: {
    not_empty: chk_not_empty,
    is_empty: chk_is_empty,
    length_equals: chk_length_equals,
    length_max: chk_length_max,
    matches_regex: chk_matches_regex,
    in_dictionary: chk_in_dictionary,
    equals: chk_equals,
    not_equals: chk_not_equals,
    contains: chk_contains,
    greater_than: chk_greater_than,
    less_than: chk_less_than,
    field_less_than_field: chk_field_less_than_field,
    field_greater_than_field: chk_field_greater_than_field,
    field_equals_field: chk_field_equals_field,
    field_not_equals_field: chk_field_not_equals_field,
    field_less_or_equal_than_field: chk_field_less_or_equal_than_field,
    field_greater_or_equal_than_field: chk_field_greater_or_equal_than_field,
    any_filled: chk_any_filled,
  },
};

module.exports = { Operators };
