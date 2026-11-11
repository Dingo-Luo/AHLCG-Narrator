import { localizedCard,investigatorLabel } from './localization.js';

export const investigatorClasses = [
  ['guardian','守卫者'],['seeker','探求者'],['rogue','流浪者'],
  ['mystic','潜修者'],['survivor','求生者'],['neutral','中立'],
];
export function playableInvestigator(card) {
  return card?.type_code==='investigator'&&!['04244','05046','05047','05048','05049'].includes(card.code);
}
export function classIcon(card) {
  const faction=investigatorClasses.some(([id])=>id===card.faction_code)?card.faction_code:'neutral';
  return `<span class="class-icon ${faction}" aria-hidden="true"><span style="mask-image:url('assets/classes/${faction}.svg');-webkit-mask-image:url('assets/classes/${faction}.svg')"></span></span>`;
}
export function classChoices(database,escape) {
  return investigatorClasses.filter(([id])=>Object.values(database.cards).some(card=>playableInvestigator(card)&&card.faction_code===id))
    .map(([id,name])=>`<button type="button" data-action="choose-investigator-class" data-class="${id}">${classIcon({faction_code:id})}<span>${escape(name)}</span></button>`).join('');
}
export function investigatorChoices(database,faction,escape,selected='') {
  if(!investigatorClasses.some(([id])=>id===faction))return '';
  return `<button type="button" data-action="investigator-classes">← 返回职业颜色</button>`+
    Object.values(database.cards).filter(card=>playableInvestigator(card)&&card.faction_code===faction)
      .sort((a,b)=>localizedCard(a).name.localeCompare(localizedCard(b).name,'zh-CN'))
      .map(card=>`<button type="button" data-action="choose-investigator" data-code="${card.code}" aria-pressed="${selected===card.code}">${classIcon(card)}<span>${escape(investigatorLabel(card))}</span></button>`).join('');
}
