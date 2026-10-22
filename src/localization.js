// 内容直接使用中文，不再读取多语言目录。
export function localizedCard(card) { return card || {}; }
export function investigatorName(database, investigator) {
  return database.cards[investigator.card]?.name || investigator.name;
}
