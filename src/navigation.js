import { replay, currentStep, playPosition, cardDeck, boardCard } from './engine.js';

export function moveTo(database, save, position) {
  if (!Number.isSafeInteger(position) || position < 1 || position > save.events.length) throw Error('无效的剧情位置');
  const next = structuredClone(save); next.cursor = position;
  replay(database,next); return next;
}

export function storyNavigation(database, save) {
  const stops = [], chapters = [];
  let lastKey = null;
  replay(database, { ...save, cursor:save.events.length }, { onStep(state, position) {
    const active = state.active;
    if (!active && !Object.keys(state.completed).length) return;
    const step = active?.phase === 'setup' ? currentStep(database,state) : null;
    if (step && step.type !== 'story' && !step.input) return; // Legacy physical setup is never a navigation destination.
    const key = active ? `${active.id}:${active.phase}:${active.queue[0] || ''}` : `next:${state.nextScenario || ''}`;
    if (key !== lastKey) {
      stops.push({ position, end:position, key, scenario:active?.id || state.nextScenario });
      lastKey = key;
    } else stops.at(-1).end = position;
    if (save.events[position-1].type === 'start') chapters.push({ id:active.id, position });
  }});
  const position = playPosition(save);
  let index = -1;
  for (let i=0;i<stops.length;i++) if (stops[i].position<=position) index=i;
  return { stops, chapters, previous:index>0?stops[index-1].end:null, next:index>=0&&index<stops.length-1?stops[index+1].end:null,
    previousAction:position>1?position-1:null, nextAction:position<save.events.length?position+1:null };
}

export function browseCard(database, save, type, action) {
  const state = replay(database,save);
  if(state.active?.phase!=='play') throw Error('请先读完开场故事');
  const current=boardCard(database,state,type);
  if(!current)throw Error('找不到这叠卡牌');
  let code=current.card.code,side=current.side;
  if(action==='flip')side=side==='front'?'back':'front';
  else if(action==='previous'||action==='next'){
    const deck=cardDeck(database,state,type),index=deck.findIndex(card=>card.code===code);
    const target=deck[index+(action==='next'?1:-1)];
    if(!target)throw Error('已经到达卡组边界');
    side=action==='next'&&code==='02063'&&state.completed.extracurricular_activity?'back':'front';
    code=target.code;
  }else throw Error('无效卡牌操作');
  const next=structuredClone(save);
  next.cardViews??={};next.cardViews[state.active.id]??={};
  next.cardViews[state.active.id][type]={code,side};
  replay(database,next);return next;
}
