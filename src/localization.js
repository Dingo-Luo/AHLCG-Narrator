// These are separate upstream catalogs. No character conversion is performed.
export function localizedCard(card,locale='zh-cn') {
  if(!card)return {};
  if(locale==='en')return card;
  const result={...card};
  for(const catalog of [card.zh,locale==='zh-cn'?card.zh_cn:null]){
    if(!catalog)continue;
    for(const [field,value] of Object.entries(catalog))if(typeof value==='string'&&value.trim())result[field]=value;
  }
  return result;
}
export function investigatorName(database,investigator,locale='zh-cn') {
  return investigator.card&&database.cards[investigator.card]?localizedCard(database.cards[investigator.card],locale).name:investigator.name;
}
