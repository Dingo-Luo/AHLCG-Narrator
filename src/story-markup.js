// Discard upstream presentation wrappers; preserve ordinary inline/rule markup.
export function storyMarkup(text,escape) {
  return escape(String(text??'').replace(/<\/?(?:right|center|fancy|cite)\b[^>]*>/gi,''))
    .replace(/&lt;(\/?)(b|i|em|strong|blockquote|hr|br)\s*\/?&gt;/gi,'<$1$2>');
}
