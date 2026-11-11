// 内容直接使用中文，不再读取多语言目录。
export function localizedCard(card) { return card || {}; }
export function investigatorLabel(card) {
  return (card?.name||'')+(card?.pack_code==='core_2026'?'*':'');
}
export function investigatorName(database, investigator) {
  const card=database.cards[investigator.card];
  return card?investigatorLabel(card):investigator.name;
}
