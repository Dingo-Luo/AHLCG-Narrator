import { boardCard,cardDeck } from './engine.js';
import { localizedCard } from './localization.js';

export function renderBoard(database, state, ui) {
  const { L, escape, button, prose } = ui;
  const renderText=ui.narratedText||((raw,_key,range)=>prose(range?raw.slice(range.start,range.end):raw,false));
  return `<section class="card-board" aria-label="${L('密谋与推进')}">${['agenda', 'act'].map(type => {
    const position = boardCard(database, state, type);
    if (!position) return '';
    const { card, side, first, last } = position;
    const translated = localizedCard(card);
    const prefix = side === 'back' ? 'back_' : '';
    const suffix=state.active.id==='black_stars_rise'&&type==='act'?(side==='back'?'d':'c'):(side==='back'?'b':'a');
    const label = `${card.type_code === 'agenda' ? L('密谋') : L('推进')} ${card.stage}${suffix}`;
    const variants=cardDeck(database,state,type).filter(c=>c.stage===card.stage&&c.type_code===card.type_code);
    const text = translated[prefix+'text'] || '';
    let textRange;
    if (card.code === '02067' && side === 'back') {
      const divider=/<hr\s*\/?\s*>/i.exec(text);
      if(divider)textRange=state.completed.extracurricular_activity?{start:divider.index+divider[0].length,end:text.length}:{start:0,end:divider.index};
    }
    const flavor = translated[prefix+'flavor'];
    return `<article class="board-card" data-deck="${type}"><div class="board-card-heading"><span class="eyebrow">${label}</span><span class="board-side">${L(side === 'front' ? '正面' : '背面')}</span></div>
      ${variants.length>1?`<select class="card-version" aria-label="${escape(label)} · ${L('卡牌版本')}" data-action="card-version" data-deck="${type}">${variants.map((v,index)=>`<option value="${v.code}" ${v.code===card.code?'selected':''}>${L('版本')} ${index+1} · ${escape(localizedCard(v).name)}</option>`).join('')}</select>`:''}
      <img class="board-image" src="${escape(card.images[side])}" alt="${escape(label)} · ${escape(translated[prefix+'name'] || '')}">
      <div class="board-controls">${button('▷ '+L('播放配音'), 'narrate', 'aria-pressed="false"', 'small')}
      ${button('↻ '+L('翻面'), 'flip-card', `data-deck="${type}"`, 'small')}
      ${button('← '+L('上一张'), 'previous-card', `data-deck="${type}" ${first?'disabled':''}`, 'small')}
      ${button(L(last ? '最后一张' : '下一张')+' →', 'next-card', `data-deck="${type}" ${last ? 'disabled' : ''}`, 'primary small')}</div>
      <details class="card-transcript" open><summary>${L('查看文字')}</summary><div class="card-title">${renderText(translated[prefix+'name'] || label,`card:${card.code}:${prefix}name`)}</div>${flavor ? `<div class="card-flavor">${renderText(flavor,`card:${card.code}:${prefix}flavor`)}</div>` : ''}${renderText(text,`card:${card.code}:${prefix}text`,textRange)}</details></article>`;
  }).join('')}</section>`;
}
