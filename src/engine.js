// Original upstream IDs and rules are retained. Only explicitly supported rules execute.
export const SCHEMA_VERSION = 1;
export const SUPPORTED = ['dwl_prologue', 'the_house_always_wins', 'extracurricular_activity'];
const copy = value => structuredClone(value);
const number = (value, label = '数值') => {
  if (!Number.isSafeInteger(value) || value < 0 || value > 999) throw Error(`${label}必须为 0–999 的整数`);
  return value;
};
export function createSave(investigators, name = '敦威治调查', sourceRevision = null) {
  if (!Array.isArray(investigators) || !investigators.length || investigators.length > 4) throw Error('请选择 1–4 位调查员');
  return { version: SCHEMA_VERSION, campaignId: 'dwl', name: String(name).slice(0, 80),
    flow: 'story', sourceRevision, createdAt: new Date().toISOString(), investigators: investigators.map((item, index) => ({ id: `i${index + 1}`, name: String(item.name).trim().slice(0, 60), card: item.card || null })), events: [] };
}
export function cardDeck(database, state, type) {
  if (!['agenda', 'act'].includes(type)) throw Error('无效卡牌类型');
  let cards = Object.values(database.cards).filter(card => card.encounter_code === state.active?.id && card.type_code === type);
  if (state.active?.id === 'the_house_always_wins' && type === 'act') cards = cards.filter(card => card.stage !== 3 || card.code === (state.completed.extracurricular_activity ? '02069' : '02068'));
  return cards.sort((a,b) => a.stage - b.stage || a.code.localeCompare(b.code));
}
export function boardCard(database, state, type) {
  const deck = cardDeck(database, state, type);
  const position = state.active?.board?.[type];
  const card = deck.find(card => card.code === position?.code) || deck[0];
  return card ? { card, side: position?.code === card.code ? position.side : 'front', first: card.code === deck[0].code, last: card.code === deck.at(-1).code } : null;
}
function targets(state, effect) {
  if (!effect.investigator || effect.investigator === 'all') return state.investigators;
  throw Error(`尚未支持自动处理调查员目标：${effect.investigator}`);
}
function applyEffects(state, effects = [], answer) {
  for (const effect of effects) {
    switch (effect.type) {
      case 'campaign_log': {
        const key = `${effect.section}:${effect.id}`;
        if (effect.operation === 'cross_out') state.log[key] = { ...effect, crossed: true };
        else state.log[key] = copy(effect);
        break;
      }
      case 'campaign_data':
        if (effect.setting === 'next_scenario') state.nextScenario = effect.scenario;
        else if (effect.setting === 'difficulty') state.difficulty = effect.value;
        else throw Error(`尚未支持自动处理战役设置：${effect.setting}`);
        break;
      case 'earn_xp':
        for (const investigator of targets(state, effect)) investigator.earned += number(answer, '胜利经验') + (effect.bonus || 0);
        break;
      case 'trauma':
        for (const investigator of targets(state, effect)) {
          investigator.physical += effect.physical || 0;
          investigator.mental += effect.mental || 0;
        }
        break;
      case 'add_chaos_token': state.tokens.push(...effect.tokens); break;
      case 'add_card': {
        // Keep only the story assignment needed by the campaign; no deck builder.
        if (answer?.recipient) {
          const recipient = state.investigators.find(item => item.id === answer.recipient);
          if (!recipient) throw Error('请选择有效的调查员');
          recipient.storyCards = [...new Set([...recipient.storyCards, effect.card])];
        } else if (answer?.recipient !== '') throw Error('请选择剧情卡持有者，或选择不加入');
        break;
      }
      default: throw Error(`尚未支持自动处理效果：${effect.type}`);
    }
  }
}
function branchValue(state, condition) {
  if (condition.type === 'campaign_data' && condition.campaign_data === 'scenario_completed') return Boolean(state.completed[condition.scenario]);
  throw Error(`尚未支持自动判断条件：${condition.type}/${condition.campaign_data || ''}`);
}
function lookup(database, scenarioId, ref) {
  if (ref.startsWith('@resolution:')) return database.scenarios[scenarioId].resolutions.find(item => item.id === ref.slice(12));
  return database.scenarios[scenarioId]?.steps.find(item => item.id === ref);
}
function normalize(database, state) {
  const active = state.active;
  if (!active) return;
  let limit = 0;
  while (active.queue.length) {
    if (++limit > 200) throw Error('剧情流程出现循环');
    const ref = active.queue[0];
    if (ref === '$check_tarot_reading') { active.queue.shift(); continue; } // Optional tarot expansion is disabled in this MVP.
    if (ref === '$play_scenario') { active.queue.shift(); active.phase = 'play'; return; }
    if (ref === '$upgrade_decks') return;
    const step = lookup(database, active.id, ref);
    if (!step) throw Error(`缺少上游步骤：${active.id}/${ref}`);
    // New story-only flow omits physical setup instructions, retaining story and choices.
    // Legacy events still replay against their original flow until story_only is applied.
    if (state.storyOnly && active.phase === 'setup' && step.type !== 'story' && !step.input) { active.queue.shift(); continue; }
    if (state.storyOnly && active.phase === 'resolution' && step.id === 'cheated' && Object.hasOwn(active.actions, 'cheated')) {
      active.queue.shift();
      if (active.actions.cheated) active.queue.unshift(...(step.input.choices.find(choice => choice.id === 'cheat')?.steps || []));
      continue;
    }
    if (step.type === 'branch') {
      const value = branchValue(state, step.condition);
      const option = step.condition.options.find(item => item.boolCondition === value);
      active.queue.shift();
      if (option) { applyEffects(state, option.effects); active.queue.unshift(...(option.steps || [])); }
      continue;
    }
    if (step.type === 'resolution') {
      active.queue.shift(); active.queue.unshift(`@resolution:${step.resolution}`); continue;
    }
    return;
  }
  if (active.phase === 'setup') active.phase = active.id === 'dwl_prologue' ? 'ready' : 'play';
  else if (active.phase === 'resolution') active.phase = 'ready';
}
export function currentStep(database, state) {
  const active = state.active;
  if (!active?.queue.length) return null;
  const ref = active.queue[0];
  if (ref === '$upgrade_decks') return { id: ref, type: 'upgrade', title: 'Upgrade investigators', text: 'Record experience spent in the investigator panel before continuing.' };
  return lookup(database, active.id, ref);
}
export function playPosition(save) { return save.cursor ?? save.events.length; }
export function replay(database, save, { onStep } = {}) {
  validateSaveShape(save);
  if (save.sourceRevision && save.sourceRevision !== database.sources[0].commit) throw Error('存档使用的剧情数据版本与当前版本不同，请保留备份并完成版本迁移后导入。');
  const state = { investigators: save.investigators.map(item => ({ ...item, earned: 0, spent: 0, physical: 0, mental: 0, storyCards: [] })),
    storyOnly: save.flow === 'story', difficulty: 'standard', log: {}, tokens: [], completed: {}, nextScenario: 'dwl_prologue', active: null, history: [] };
  const limit = playPosition(save);
  for (let index = 0; index < limit; index++) {
    const event = save.events[index];
    if (event.type === 'start') {
      if (state.active) throw Error('请先结束当前剧本');
      if (event.scenario !== state.nextScenario || !SUPPORTED.includes(event.scenario)) throw Error('该剧本尚未开放交互，或不在当前剧情流程中');
      const scenario = database.scenarios[event.scenario];
      state.nextScenario = null;
      state.active = { id: scenario.id, phase: 'setup', queue: [...scenario.setup], card: null, board: {}, actions: {}, revealed: [], resolution: null, statuses: {} };
      state.history.push({ text: scenario.scenario_name, type: 'start' });
    } else if (event.type === 'story_only') {
      state.storyOnly = true;
    } else if (event.type === 'difficulty') {
      if (state.active || Object.keys(state.completed).length) throw Error('战役开始后不可修改难度');
      if (!['easy', 'standard', 'hard', 'expert'].includes(event.value)) throw Error('无效难度');
      state.difficulty = event.value;
    } else if (event.type === 'advance') {
      if (!state.active || !state.active.queue.length) throw Error('没有可继续的步骤');
      const step = currentStep(database, state);
      const input = step.input;
      state.active.queue.shift();
      let follow = step.steps || [];
      if (input) {
        if (input.type === 'choose_one') {
          const choice = input.choices.find(item => item.id === event.answer);
          // Single optional checkbox in upstream is shown as yes/no, not forced yes.
          if (!choice && !(input.choices.length === 1 && event.answer === '__none')) throw Error('请选择一个有效选项');
          if (choice) { applyEffects(state, choice.effects, event.answer); follow = [...follow, ...(choice.steps || [])]; }
        } else if (input.type === 'counter') applyEffects(state, input.effects, number(event.answer, '胜利经验'));
        else throw Error(`尚未支持输入：${input.type}`);
      }
      applyEffects(state, step.effects, event.answer);
      state.active.queue.unshift(...follow);
      state.history.push({ type: 'step', scenario: state.active.id, step: step.id, text: step.title || step.text || step.id, answer: event.answer });
    } else if (event.type === 'resolution') {
      if (state.active?.phase !== 'play') throw Error('请先读完开场故事');
      const resolution = database.scenarios[state.active.id].resolutions.find(item => item.id === event.id);
      if (!resolution) throw Error('无效结局');
      for (const investigator of state.investigators) {
        if (!['survived', 'resigned', 'physical', 'mental', 'both', 'eliminated'].includes(event.statuses?.[investigator.id])) throw Error('请记录每位调查员的结束状态');
        if (resolution.investigator_status && event.statuses[investigator.id] === 'survived') throw Error('未达成结局时，调查员应已撤退或退场。');
      }
      state.active.resolution = event.id;
      state.active.statuses = copy(event.statuses);
      state.active.phase = 'resolution'; state.active.queue = [`@resolution:${event.id}`];
      state.history.push({ type: 'resolution', text: event.id, scenario: state.active.id });
    } else if (event.type === 'finish') {
      if (state.active?.phase !== 'ready') throw Error('请先完成当前流程');
      const active = state.active;
      for (const investigator of state.investigators) {
        const status = active.statuses[investigator.id];
        if (['physical', 'both'].includes(status)) investigator.physical++;
        if (['mental', 'both'].includes(status)) investigator.mental++;
      }
      state.completed[active.id] = { resolution: active.resolution, statuses: copy(active.statuses) };
      if (!state.nextScenario) {
        const order = database.campaign.scenarios;
        state.nextScenario = order.slice(order.indexOf(active.id) + 1).find(id => !state.completed[id]) || null;
      }
      state.active = null;
    } else if (event.type === 'adjust') {
      const investigator = state.investigators.find(item => item.id === event.investigator);
      if (!investigator || !['earned', 'spent', 'physical', 'mental'].includes(event.field)) throw Error('无效调查员记录');
      const value = investigator[event.field] + event.delta;
      number(value);
      if (!Number.isSafeInteger(event.delta)) throw Error('调整值必须是整数');
      if (event.field === 'spent' && value > investigator.earned || event.field === 'earned' && value < investigator.spent) throw Error('已使用经验不能超过累计经验');
      investigator[event.field] = value;
    } else if (event.type === 'record_action') {
      if (state.active?.phase !== 'play' || state.active.id !== 'the_house_always_wins' || event.id !== 'cheated' || typeof event.value !== 'boolean') throw Error('无效故事行动');
      state.active.actions[event.id] = event.value;
      state.history.push({ type: 'action', scenario: state.active.id, step: event.id, answer: event.value });
    } else if (event.type === 'next_card') {
      if (state.active?.phase !== 'play') throw Error('请先读完开场故事');
      const current = boardCard(database, state, event.deck);
      if (!current || current.last) throw Error('已经是最后一张卡');
      const deck = cardDeck(database, state, event.deck);
      const next = deck[deck.findIndex(card => card.code === current.card.code) + 1];
      const side = current.card.code === '02063' && state.completed.extracurricular_activity ? 'back' : 'front';
      state.active.board[event.deck] = { code: next.code, side };
      state.active.revealed.push(`${next.code}:${side}`);
    } else if (event.type === 'reveal') {
      if (state.active?.phase !== 'play') throw Error('请先读完开场故事');
      const card = database.cards[event.card];
      if (!card || card.encounter_code !== state.active.id || !['agenda', 'act'].includes(card.type_code)) throw Error('无效剧情卡');
      if (!['front', 'back'].includes(event.side)) throw Error('无效卡面');
      state.active.card = { code: event.card, side: event.side };
      state.active.board[card.type_code] = { code: event.card, side: event.side };
      const key = `${event.card}:${event.side}`;
      if (!state.active.revealed.includes(key)) state.active.revealed.push(key);
    } else throw Error(`无效记录类型：${event.type}`);
    normalize(database, state);
    onStep?.(state, index + 1);
  }
  if (state.active?.phase === 'play' && save.cardViews?.[state.active.id]) {
    for (const [type, position] of Object.entries(save.cardViews[state.active.id])) {
      if (cardDeck(database, state, type).some(card => card.code === position.code)) state.active.board[type] = copy(position);
    }
  }
  return state;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
export function commit(database, save, event) {
  const next = copy(save), position = playPosition(save);
  if (position < next.events.length && JSON.stringify(canonical(event)) === JSON.stringify(canonical(next.events[position]))) {
    next.cursor = position + 1;
  } else {
    if (position < next.events.length) { next.events = next.events.slice(0, position); delete next.cardViews; }
    next.events.push(copy(event));
    if (save.cursor !== undefined) next.cursor = next.events.length;
  }
  replay(database, next); return next;
}
export function validateSaveShape(save) {
  if (!save || save.version !== SCHEMA_VERSION || save.campaignId !== 'dwl' || typeof save.name !== 'string' || save.name.length > 80 || !Array.isArray(save.events) || save.events.length > 10000) throw Error('存档格式或版本不正确');
  if (save.cursor !== undefined && (!Number.isSafeInteger(save.cursor) || save.cursor < 0 || save.cursor > save.events.length)) throw Error('无效的剧情位置');
  if (save.cardViews !== undefined) {
    if (!save.cardViews || typeof save.cardViews !== 'object' || Array.isArray(save.cardViews)) throw Error('无效的卡牌查看记录');
    for (const views of Object.values(save.cardViews)) {
      if (!views || typeof views !== 'object' || Array.isArray(views)) throw Error('无效的卡牌查看记录');
      for (const [type, position] of Object.entries(views)) {
        if (!['agenda','act'].includes(type) || !position || !/^\d{5}$/.test(position.code) || !['front','back'].includes(position.side)) throw Error('无效的卡牌查看记录');
      }
    }
  }
  if (!Array.isArray(save.investigators) || !save.investigators.length || save.investigators.length > 4) throw Error('存档调查员数量不正确');
  const ids = new Set();
  for (const item of save.investigators) {
    if (!item || !/^i[1-4]$/.test(item.id) || ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 60) throw Error('存档调查员资料不正确');
    ids.add(item.id);
  }
}
