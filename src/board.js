import { boardCard,cardDeck } from './engine.js';
import { localizedCard } from './localization.js';

export function renderBoard(database, state, ui) {
  const { L, escape, button, prose } = ui;
  return `<section class="card-board" aria-label="${L('密谋与推进', 'Agenda and act board')}">${['agenda', 'act'].map(type => {
    const position = boardCard(database, state, type);
    if (!position) return '';
    const { card, side, first, last } = position;
    const translated = localizedCard(card,ui.locale);
    const prefix = side === 'back' ? 'back_' : '';
    const suffix=state.active.id==='black_stars_rise'&&type==='act'?(side==='back'?'d':'c'):(side==='back'?'b':'a');
    const label = `${card.type_code === 'agenda' ? L('密谋', 'Agenda') : L('推进', 'Act')} ${card.stage}${suffix}`;
    const variants=cardDeck(database,state,type).filter(c=>c.stage===card.stage&&c.type_code===card.type_code);
    let text = translated[prefix+'text'] || card[prefix+'text'] || '';
    if (card.code === '02067' && side === 'back') {
      const branches = text.split(/<hr\s*\/?\s*>/i);
      if (branches.length === 2) text = branches[state.completed.extracurricular_activity ? 1 : 0];
    }
    const audio = card.audio?.[ui.locale];
    const audioUrl = typeof audio === 'string' && /^(https?:\/\/|assets\/)/.test(audio) ? audio : null;
    const flavor = translated[prefix+'flavor'] || card[prefix+'flavor'];
    return `<article class="board-card" data-deck="${type}"><div class="board-card-heading"><span class="eyebrow">${label}</span><span class="board-side">${L(side === 'front' ? '正面' : '背面', side === 'front' ? 'Front' : 'Reverse')}</span></div>
      ${variants.length>1?`<select class="card-version" aria-label="${escape(label)} · ${L('卡牌版本','Card version')}" data-action="card-version" data-deck="${type}">${variants.map((v,index)=>`<option value="${v.code}" ${v.code===card.code?'selected':''}>${L('版本','Version')} ${index+1} · ${escape(localizedCard(v,ui.locale).name)}</option>`).join('')}</select>`:''}
      <img class="board-image" src="${escape(card.images[side])}" alt="${escape(label)} · ${escape(translated[prefix+'name'] || card[prefix+'name'] || '')}">
      <div class="board-controls">${audioUrl ? button('▷ '+L('配音', 'Narrate'), 'narrate', `data-audio="${escape(audioUrl)}"`, 'small') : `<button class="button small" disabled title="${L('配音将在后续加入', 'Narration will be added later')}">▷ ${L('配音待加入', 'Voice soon')}</button>`}
      ${button('↻ '+L('翻面', 'Flip'), 'flip-card', `data-deck="${type}"`, 'small')}
      ${button('← '+L('上一张','Previous'), 'previous-card', `data-deck="${type}" ${first?'disabled':''}`, 'small')}
      ${button(L(last ? '最后一张' : '下一张', last ? 'Last card' : 'Next')+' →', 'next-card', `data-deck="${type}" ${last ? 'disabled' : ''}`, 'primary small')}</div>
      <details class="card-transcript"><summary>${L('查看文字', 'Read text')}</summary><h3>${escape(translated[prefix+'name'] || card[prefix+'name'] || label)}</h3>${flavor ? `<div class="card-flavor">${prose(flavor, false)}</div>` : ''}${prose(text, false)}</details></article>`;
  }).join('')}</section>`;
}
