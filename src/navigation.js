import { replay, currentStep, playPosition, isHiddenSetup, commit, cardDeck, boardCard } from './engine.js';

export function moveTo(database, save, position) {
  if (!Number.isSafeInteger(position) || position < 1 || position > save.events.length) throw Error('无效的剧情位置');
  const next = structuredClone(save); next.cursor = position;
  replay(database,next); return next;
}

// Replay recorded setup answers when revisiting old saves. Only append skips at the tip.
export function skipSetupPages(database, save) {
  let next = save;
  let state = replay(database, next);
  while (isHiddenSetup(database, state)) {
    const position = playPosition(next);
    if (position < next.events.length) next = { ...next, cursor: position + 1 };
    else {
      const step = currentStep(database, state);
      next = commit(database, next, { type: 'advance', ...(step.input ? { answer: '__skip_setup' } : {}) });
    }
    state = replay(database, next);
  }
  return { save: next, state };
}

export function storyNavigation(database, save) {
  const stops = [], chapters = [];
  let lastKey = null, pendingChapter = null;
  const visiblePositions = [];
  replay(database, { ...save, cursor:save.events.length }, { onStep(state, position) {
    const active = state.active;
    if (!active && !Object.keys(state.completed).length) return;
    if (save.events[position-1].type === 'start') pendingChapter = active.id;
    if (isHiddenSetup(database, state)) return;
    visiblePositions.push(position);
    if (pendingChapter) {
      chapters.push({ id:pendingChapter, position });
      pendingChapter = null;
    }
    const key = active ? `${active.id}:${active.phase}:${active.queue[0] || ''}` : `next:${state.nextScenario || ''}`;
    if (key !== lastKey) {
      stops.push({ position, end:position, key, scenario:active?.id || state.nextScenario });
      lastKey = key;
    } else stops.at(-1).end = position;

  }});
  const position = playPosition(save);
  let index = -1;
  for (let i=0;i<stops.length;i++) if (stops[i].position<=position) index=i;
  return { stops, chapters, previous:index>0?stops[index-1].end:null, next:index>=0&&index<stops.length-1?stops[index+1].end:null,
    previousAction:visiblePositions.findLast(i=>i<position)??null, nextAction:visiblePositions.find(i=>i>position)??null };
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
    const other=action==='next'?deck.slice(index+1):deck.slice(0,index).reverse();
    const target=other.find(card=>card.stage!==current.card.stage||card.type_code!==current.card.type_code);
    if(!target)throw Error('已经到达卡组边界');
    side=action==='next'&&code==='02063'&&state.completed.extracurricular_activity?'back':'front';
    code=target.code;
  }else throw Error('无效卡牌操作');
  const next=structuredClone(save);
  next.cardViews??={};next.cardViews[state.active.id]??={};
  next.cardViews[state.active.id][type]={code,side};
  replay(database,next);return next;
}
export function chooseCardVersion(database,save,type,code){
  const state=replay(database,save),current=boardCard(database,state,type);
  if(state.active?.phase!=='play'||!current)throw Error('请先回到卡牌桌面');
  const card=cardDeck(database,state,type).find(card=>card.code===code&&card.stage===current.card.stage&&card.type_code===current.card.type_code);
  if(!card)throw Error('无效卡牌版本');
  const next=structuredClone(save);next.cardViews??={};next.cardViews[state.active.id]??={};next.cardViews[state.active.id][type]={code,side:'front'};
  replay(database,next);return next;
}
