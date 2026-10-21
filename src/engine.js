// Original upstream IDs and rules are retained. Only explicitly supported rules execute.
export const SCHEMA_VERSION = 1;
import {campaignOf} from './content.js';
export const SUPPORTED = ['dwl_prologue','the_house_always_wins','extracurricular_activity','armitages_fate','the_miskatonic_museum','essex_county_express','blood_on_the_altar','dwl_interlude2','undimensioned_and_unseen','where_doom_awaits','lost_in_time_and_space','dwl_epilogue','core_prologue','torch','arkham','tentacles','ptc_prologue','curtain_call','the_last_king','ptc_interlude1','ptc_interlude1_reprint','echoes_of_the_past','the_unspeakable_oath','ptc_interlude2','a_phantom_of_truth','the_pallid_mask','black_stars_rise','dim_carcosa','ptc_epilogue'];
const copy = value => structuredClone(value);
const number = (value, label = '数值') => {
  if (!Number.isSafeInteger(value) || value < 0 || value > 999) throw Error(`${label}必须为 0–999 的整数`);
  return value;
};
export function createSave(investigators, name = '敦威治调查', sourceRevision = null, campaignId='dwl') {
  if(!['dwl','core','ptc'].includes(campaignId))throw Error('无效战役');
  if (!Array.isArray(investigators) || !investigators.length || investigators.length > 4) throw Error('请选择 1–4 位调查员');
  return { version: SCHEMA_VERSION, campaignId, name: String(name).slice(0, 80),
    flow: 'story', sourceRevision, createdAt: new Date().toISOString(), investigators: investigators.map((item, index) => ({ id: `i${index + 1}`, name: String(item.name).trim().slice(0, 60), card: item.card || null })), events: [] };
}
export function cardDeck(database, state, type) {
  if (!['agenda', 'act'].includes(type)) throw Error('无效卡牌类型');
  if(state.active?.id==='black_stars_rise')return (type==='agenda'?['03275','03276a','03276b','03277','03281']:['03278','03279a','03279b','03280','03282']).map(code=>database.cards[code]).filter(Boolean);
  let cards = Object.values(database.cards).filter(card => card.encounter_code === state.active?.id && card.type_code === type);
  if (state.active?.id === 'the_house_always_wins' && type === 'act') cards = cards.filter(card => card.stage !== 3 || card.code === (state.completed.extracurricular_activity ? '02069' : '02068'));
  return cards.sort((a,b) => a.stage - b.stage || a.code.localeCompare(b.code));
}
export function boardCard(database, state, type) {
  const deck = cardDeck(database, state, type);
  const position = state.active?.board?.[type];
  const card = deck.find(card => card.code === position?.code) || deck[0];
  return card ? { card, side: position?.code === card.code ? position.side : 'front', first: card.stage===deck[0].stage&&card.type_code===deck[0].type_code, last:card.stage===deck.at(-1).stage&&card.type_code===deck.at(-1).type_code } : null;
}
export function cultistCards(database,state,input){
  if(state.active.id==='arkham')return Object.values(database.cards).filter(card=>card.is_unique&&card.type_code==='enemy'&&['arkham','cultists'].includes(card.encounter_code)&&card.traits?.includes('Cultist.')&&(!input.campaign_log_condition||!state.log[`cultists_interrogated:${card.code}`]));
  return Object.values(database.cards).filter(card=>(input.query||[]).some(q=>{
    if(q.code&&!q.code.includes(card.code)||q.exclude_code?.includes(card.code)||q.unique&&!card.is_unique)return false;
    if(q.traits&&!q.traits.every(t=>card.traits?.toLowerCase().split('.').map(s=>s.trim()).includes(t.toLowerCase())))return false;
    if(q.source==='deck'&&!['asset','event','skill'].includes(card.type_code))return false;
    return true;
  }));
}
export function storyActions(database,state){
  const play=database.scenarios[state.active?.id]?.steps.find(s=>s.id==='$play_scenario');
  return (play?.input?.branches||[]).filter(b=>b.id!=='randomize_locations'&&(!b.condition||b.condition.options.some(o=>matchesOption(branchValue(state,b.condition),o))));
}
export function allowedStatuses(resolution){
  const statuses=['survived','resigned','physical','mental','both','eliminated'];
  const allowed=resolution.investigator_status;
  return allowed?statuses.filter(value=>value==='survived'?allowed.includes('alive'):value==='both'?allowed.includes('physical')&&allowed.includes('mental'):allowed.includes(value)):statuses;
}
function targets(state, effect,answer) {
  if (!effect.investigator || effect.investigator === 'all') return state.investigators;
  if(effect.investigator==='not_resigned')return state.investigators.filter(i=>state.active.statuses[i.id]!=='resigned');
  if(effect.investigator==='defeated')return state.investigators.filter(i=>['physical','mental','both','eliminated'].includes(state.active.statuses[i.id]));
  if(/^i[1-4]$/.test(effect.investigator))return state.investigators.filter(i=>i.id===effect.investigator);
  if(effect.investigator==='lead_investigator'){
    const id=state.active.leadId;
    const investigator=state.investigators.find(i=>i.id===id&&!i.killed);
    if(!investigator)throw Error('请选择本关的调查队长');
    return [investigator];
  }
  throw Error(`尚未支持自动处理调查员目标：${effect.investigator}`);
}
function applyEffects(state, effects = [], answer) {
  for (const effect of effects) {
    switch (effect.type) {
      case 'campaign_log': {
        const key = `${effect.section}:${effect.id}`;
        if (effect.operation === 'cross_out'||effect.cross_out) state.log[key] = { ...state.log[key],...effect, crossed: true };
        else state.log[key] = copy(effect);
        break;
      }
      case 'campaign_data':
        if (effect.setting === 'next_scenario') state.nextScenario = effect.scenario;
        else if (effect.setting === 'difficulty') state.difficulty = effect.value;
        else if (effect.setting === 'result') state.result=effect.value;
        else if(effect.setting==='skip_scenario'){state.skipped??=[];state.skipped.push(effect.scenario);}
        else if(effect.setting==='set_scenarios')state.scenarioOrder=copy(effect.scenarios);
        else throw Error(`尚未支持自动处理战役设置：${effect.setting}`);
        break;
      case 'earn_xp':
        for (const investigator of targets(state, effect,answer)) investigator.earned += (typeof answer==='number'?number(answer,'胜利经验'):0) + (effect.bonus || 0);
        break;
      case 'trauma':
        for (const investigator of targets(state, effect,answer)) {
          investigator.physical += effect.physical || 0;
          investigator.mental += effect.mental || 0;
          if(effect.killed||effect.insane){investigator.killed=Boolean(effect.killed);investigator.insane=Boolean(effect.insane);state.active.killedIds??=[];state.active.killedIds.push(investigator.id);}
        }
        break;
      case 'add_chaos_token': state.tokens.push(...effect.tokens); break;
      case 'add_card': {
        // Keep only the story assignment needed by the campaign; no deck builder.
        if(effect.investigator==='defeated'){
          for(const investigator of targets(state,effect,answer))investigator.storyCards=[...new Set([...investigator.storyCards,effect.card])];break;
        }
        if (answer?.recipient) {
          const recipient = state.investigators.find(item => item.id === answer.recipient);
          if (!recipient) throw Error('请选择有效的调查员');
          if(effect.investigator==='lead_investigator'){
            if(state.active.leadId&&recipient.id!==state.active.leadId)throw Error('这张卡应交给本关调查队长');
            state.active.leadId=recipient.id;
          }
          recipient.storyCards = [...new Set([...recipient.storyCards, effect.card])];
        } else if (answer?.recipient !== ''||effect.investigator==='lead_investigator'&&!effect.optional) throw Error('请选择剧情卡持有者，或选择不加入');
        break;
      }
      case 'remove_card':for(const investigator of state.investigators)investigator.storyCards=investigator.storyCards.filter(code=>code!==effect.card);break;
      case 'add_weakness':
        // Physical deck handling stays with the player; preserve the rule in the log.
        state.log[`weakness:${state.active.id}:${effect.investigator}`]={section:'campaign_notes',text:`${effect.weakness_traits?.join(' / ')||'Random basic weakness'}`,investigator:effect.investigator};break;
      case 'campaign_log_cards':
        state.log[`${effect.section}:${effect.id}${effect.cards?':'+effect.cards:''}`]={...effect,card:effect.cards||effect.id};break;
      case 'campaign_log_count':{
        const key=`${effect.section}:${effect.id||'$count'}`,current=state.log[key]?.value||0;
        const delta=['add_input','set_input'].includes(effect.operation)?number(answer):number(effect.value);
        const value=effect.operation==='set_input'?delta:current+delta;
        state.log[key]={...effect,value,text:effect.text?.replaceAll('#X#',String(value))||effect.section};break;
      }
      case 'remove_chaos_token':for(const token of effect.tokens){const index=state.tokens.indexOf(token);if(index>=0)state.tokens.splice(index,1);}break;
      default: throw Error(`尚未支持自动处理效果：${effect.type}`);
    }
  }
}
function branchValue(state, condition) {
  if (condition.type === 'campaign_data' && condition.campaign_data === 'scenario_completed') return Boolean(state.completed[condition.scenario]);
  if(condition.type==='campaign_log'){const item=state.log[`${condition.section}:${condition.id}`];return Boolean(item&&!item.crossed);}
  if(condition.type==='trauma'&&condition.trauma==='killed')return Boolean(state.active.killedIds?.includes(state.active.leadId));
  if(condition.type==='campaign_log_cards')return Boolean(state.log[`${condition.section}:${condition.id}`]);
  if(condition.type==='has_card')return (condition.investigator==='defeated'?targets(state,condition):state.investigators).some(i=>i.storyCards.includes(condition.card));
  if(condition.type==='campaign_log_count')return condition.id==='$num_entries'?Object.values(state.log).filter(i=>i.section===condition.section&&!i.crossed).length:state.log[`${condition.section}:${condition.id||'$count'}`]?.value||0;
  if(condition.type==='constant')return condition.value;
  if(condition.type==='math'){const a=branchValue(state,condition.opA),b=branchValue(state,condition.opB);return condition.operation==='compare'?Math.sign(a-b):a+b;}
  if(condition.type==='multi')return condition.conditions.filter(c=>matchesOption(branchValue(state,c),c.options?.[0])).length>=condition.count;
  if(condition.type==='campaign_data'&&condition.campaign_data==='version')return state.campaignVersion>=condition.min_version;
  if(condition.type==='campaign_data'&&condition.campaign_data==='difficulty')return state.difficulty;
  if(condition.type==='campaign_data'&&condition.campaign_data==='investigator')return state.investigators.map(i=>i.card);
  if(condition.type==='scenario_data'&&condition.scenario_data==='player_count')return state.investigators.length;
  throw Error(`尚未支持自动判断条件：${condition.type}/${condition.campaign_data || ''}`);
}
function matchesOption(value,option){if(!option)return false;if(Array.isArray(value))return value.includes(option.condition);return option.boolCondition===value||option.numCondition===value||option.condition===value;}
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
    if(step.input?.type==='scenario_investigators'&&!state.investigators.some(i=>i.killed||i.insane)){active.queue.shift();continue;}
    // New story-only flow omits physical setup instructions, retaining story and choices.
    // Legacy events still replay against their original flow until story_only is applied.
    if (state.storyOnly && active.phase === 'setup' && !database.scenarios[active.id].storySetup && step.type !== 'story' && !step.input && !(active.id==='arkham'&&step.id==='lita_condition')) { active.queue.shift(); continue; }
    if (state.storyOnly && active.phase === 'resolution' && step.id === 'cheated' && Object.hasOwn(active.actions, 'cheated')) {
      active.queue.shift();
      if (active.actions.cheated) active.queue.unshift(...(step.input.choices.find(choice => choice.id === 'cheat')?.steps || []));
      continue;
    }
    if (step.type === 'branch') {
      const value = branchValue(state, step.condition);
      const option = step.condition.options.find(item => matchesOption(value,item))||step.condition.default_option;
      active.queue.shift();
      if (option) { applyEffects(state, option.effects); active.queue.unshift(...(option.steps || [])); }
      continue;
    }
    if (step.type === 'resolution') {
      active.queue.shift(); active.queue.unshift(`@resolution:${step.resolution}`); continue;
    }
    return;
  }
  if (active.phase === 'setup') active.phase = ['dwl_prologue','core_prologue'].includes(active.id)||database.scenarios[active.id].storyChapter ? 'ready' : 'play';
  else if (active.phase === 'resolution') active.phase = 'ready';
  else if(active.phase==='action')active.phase='play';
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
  const campaign=campaignOf(database,save.campaignId);
  if(campaign.id!==save.campaignId)throw Error('战役内容尚未载入');
  if (save.sourceRevision && save.sourceRevision !== (database.campaignSources?.[save.campaignId]||database.sources[0].commit)) throw Error('存档使用的剧情数据版本与当前版本不同，请保留备份并完成版本迁移后导入。');
  const state = { investigators: save.investigators.map(item => ({ ...item, earned: 0, spent: 0, physical: 0, mental: 0, storyCards: [] })),
    storyOnly: save.flow === 'story', difficulty: 'standard',campaignVersion:campaign.version||1, log: {}, tokens: [], completed: {}, nextScenario: campaign.scenarios[0], active: null, history: [] };
  if(campaign.initialLog)applyEffects(state,campaign.initialLog);
  const limit = playPosition(save);
  for (let index = 0; index < limit; index++) {
    const event = save.events[index];
    if (event.type === 'start') {
      if (state.active) throw Error('请先结束当前剧本');
      if (event.scenario !== state.nextScenario || !SUPPORTED.includes(event.scenario)) throw Error('该剧本尚未开放交互，或不在当前剧情流程中');
      const scenario = database.scenarios[event.scenario];
      state.nextScenario = null;
      state.active = { id: scenario.id, phase: 'setup', queue: [...(state.storyOnly&&scenario.storySetup||scenario.setup)], card: null, board: {}, actions: {}, revealed: [], resolution: null, statuses: {} };
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
        } else if (input.type === 'counter') {
          const value=number(event.answer,'记录数值');
          if(input.max?.type==='constant'&&value>input.max.value)throw Error('数值超过本步骤上限');
          applyEffects(state,input.effects,value);
        }
        else if(input.type==='card_choice'){
          const allowed=cultistCards(database,state,input);
          if(!Array.isArray(event.answer)||new Set(event.answer).size!==event.answer.length||event.answer.some(code=>!allowed.some(c=>c.code===code)))throw Error('请选择有效的邪教徒');
          for(const code of event.answer){
            const effects=JSON.parse(JSON.stringify(input.choices[0].effects).replaceAll('$input_value',code));
            applyEffects(state,effects);
            for(const effect of effects.filter(e=>e.type==='campaign_log_cards'))state.log[`${effect.section}:${effect.id}`]={...effect,card:code,text:database.cards[code].name};
          }
        }else if(input.type==='investigator_counter'){
          if(!event.answer||typeof event.answer!=='object')throw Error('请记录每位调查员的数值');
          const values=state.investigators.map(i=>number(event.answer[i.id]));if(Math.max(...values)-Math.min(...values)>1)throw Error('额外经验必须尽可能平均分配');
          for(const investigator of state.investigators)applyEffects(state,input.effects.map(effect=>({...effect,investigator:investigator.id})),number(event.answer[investigator.id]));
        }else if(input.type==='investigator_choice'){
          const ids=event.answer;
          if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(id=>!state.investigators.some(i=>i.id===id))||step.id==='read_act_2_choice'&&!ids.length)throw Error('请选择有效调查员');
          for(const id of ids){
            const investigator=state.investigators.find(i=>i.id===id);
            const effects=input.choices[0].effects.map(effect=>({...effect,...(effect.investigator==='$input_value'?{investigator:id}:{}),...(effect.cards==='$input_value'?{cards:investigator.card}: {})}));
            applyEffects(state,effects);
          }
          if(ids.length)follow=[...follow,...(input.choices[0].steps||[])];
        }else if(input.type==='scenario_investigators'){
          const killed=state.investigators.filter(i=>i.killed||i.insane),selected=event.answer?.replacements||{};
          if(event.answer?.endCampaign){
            if(killed.length!==state.investigators.length)throw Error('仍有调查员可以继续战役');
            state.result='lose';state.active.queue=[];follow=[];
          }else{
          if(killed.some(i=>!selected[i.id]))throw Error('请为每位阵亡调查员选择继任者');
          const codes=state.investigators.map(i=>i.killed||i.insane?selected[i.id]:i.card);
          if(new Set(codes).size!==codes.length)throw Error('调查员不能重复');
          for(const investigator of killed){const card=database.cards[selected[investigator.id]];
            if(!card||card.type_code!=='investigator'||!/^0[123]\d{3}$/.test(card.code)||state.retired?.includes(card.code)||killed.some(i=>i.card===card.code))throw Error('请选择有效的继任调查员');
            state.retired??=[];state.retired.push(investigator.card);
            Object.assign(investigator,{card:card.code,name:card.name,earned:0,spent:0,physical:0,mental:0,storyCards:[],killed:false,insane:false});
            state.active.statuses[investigator.id]='survived';
          }
          }
        }
        else throw Error(`尚未支持输入：${input.type}`);
      }
      applyEffects(state, step.effects, event.answer);
      state.active.queue.unshift(...follow);
      state.history.push({ type: 'step', scenario: state.active.id, step: step.id, text: step.title || step.text || step.id, answer: event.answer });
    } else if (event.type === 'resolution') {
      if (state.active?.phase !== 'play') throw Error('请先读完开场故事');
      const resolution = database.scenarios[state.active.id].resolutions.find(item => item.id === event.id);
      if (!resolution) throw Error('无效结局');
      if(save.campaignId==='core'||save.campaignId==='ptc'){
        if(!state.investigators.some(i=>i.id===event.lead))throw Error('请选择本关的调查队长');
        state.active.leadId=event.lead;
      }
      for (const investigator of state.investigators) {
        if (!['survived', 'resigned', 'physical', 'mental', 'both', 'eliminated'].includes(event.statuses?.[investigator.id])) throw Error('请记录每位调查员的结束状态');
        if (!allowedStatuses(resolution).includes(event.statuses[investigator.id])) throw Error('该结局下的调查员结束状态无效；请按实体游戏记录撤退或退场状态。');
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
        const order = state.scenarioOrder||campaign.scenarios;
        state.nextScenario = order.slice(order.indexOf(active.id) + 1).find(id => !state.completed[id]&&!state.skipped?.includes(id)) || null;
        if(state.result&&!(database.scenarios[state.nextScenario]?.type==='epilogue'))state.nextScenario=null;
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
    } else if(event.type==='story_action'){
      if(state.active?.phase!=='play')throw Error('请先回到卡牌桌面');
      const action=storyActions(database,state).find(a=>a.id===event.id);if(!action)throw Error('无效故事行动');
      state.active.phase='action';state.active.queue=[...(action.steps||[])];applyEffects(state,action.effects);
      state.history.push({type:'action',scenario:state.active.id,step:event.id,text:action.text});
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
  if (!save || save.version !== SCHEMA_VERSION || !['dwl','core','ptc'].includes(save.campaignId) || typeof save.name !== 'string' || save.name.length > 80 || !Array.isArray(save.events) || save.events.length > 10000) throw Error('存档格式或版本不正确');
  if (save.cursor !== undefined && (!Number.isSafeInteger(save.cursor) || save.cursor < 0 || save.cursor > save.events.length)) throw Error('无效的剧情位置');
  if (save.cardViews !== undefined) {
    if (!save.cardViews || typeof save.cardViews !== 'object' || Array.isArray(save.cardViews)) throw Error('无效的卡牌查看记录');
    for (const views of Object.values(save.cardViews)) {
      if (!views || typeof views !== 'object' || Array.isArray(views)) throw Error('无效的卡牌查看记录');
      for (const [type, position] of Object.entries(views)) {
        if (!['agenda','act'].includes(type) || !position || !/^\d{5}[ab]?$/.test(position.code) || !['front','back'].includes(position.side)) throw Error('无效的卡牌查看记录');
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
