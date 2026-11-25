// Imported items sometimes arrive with a whole note, alert or report as their title. Show a short title
// (first line or sentence, at most `max` characters, cut at a word); the full text stays in the details.
export function shortTitle(title: string, max = 72) {
  const clean = title.replace(/\s+/g, " ").trim();
  const firstLine = title.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? clean;
  let head = firstLine.replace(/\s+/g, " ");
  const sentence = /^(.{20,}?[.!?])\s/.exec(head);
  if (sentence && head.length > max) head = sentence[1];
  if (head.length <= max) return head;
  const cut = head.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}

// True when the title carries more than the short title shows (so the details hold the rest).
export function isLongTitle(title: string, max = 72) {
  return shortTitle(title, max) !== title.replace(/\s+/g, " ").trim();
}
