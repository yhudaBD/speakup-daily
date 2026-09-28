// The fixed topics for the "day 1" recording (T5 in ACTION_PLAN.md). None is
// practiced anywhere in the app, so recording them again later measures
// speaking, not rehearsal. Always the same three, in the same order.
export const BASELINE_PROMPTS = [
  { id: "typical-morning", title: "בוקר רגיל שלך", hint: "מתי קמים, ומה עושים עד היציאה מהבית" },
  { id: "memorable-trip", title: "טיול שנשאר לך בזיכרון", hint: "לאן, עם מי, ומה היה הכי מיוחד" },
  { id: "favorite-dish", title: "מאכל שאהוב עליך ואיך מכינים אותו", hint: "מה צריך, ומה עושים שלב אחרי שלב" },
];

// Up to a minute per topic.
export const BASELINE_MAX_MS = 60_000;
