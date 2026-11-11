// New campaigns use explicit branch choices against the physical campaign log.
// Preserve effects outside this app's XP/trauma/story-card scope for manual review.
export function applyExtendedEffect(state,effect,answer) {
  const copy=structuredClone;
  const recordManual=()=>{
    state.manualEffects??=[];
    state.manualEffects.push({scenario:state.active?.id,effect:copy(effect)});
  };
  const recipients=()=>{
    if(!effect.investigator||effect.investigator==='all')return state.investigators;
    if(effect.investigator==='lead_investigator')return state.investigators.filter(i=>i.id===state.active.leadId);
    if(effect.investigator==='defeated')return state.investigators.filter(i=>['physical','mental','both','eliminated'].includes(state.active.statuses[i.id]));
    if(effect.investigator==='not_resigned')return state.investigators.filter(i=>state.active.statuses[i.id]!=='resigned');
    return state.investigators.filter(i=>i.id===effect.investigator||i.card===effect.investigator||i.id===answer?.recipient);
  };
  switch(effect.type) {
    case 'campaign_log': {
      const key=`${effect.section}:${effect.id}`;
      state.log[key]={...state.log[key],...copy(effect),...((effect.cross_out||effect.operation==='cross_out')?{crossed:true}:{})};return;
    }
    case 'campaign_log_count': {
      const key=`${effect.section}:${effect.id||'$count'}`;
      const value=['set_input','add_input'].includes(effect.operation)?Number(answer):Number(effect.value);
      if(!Number.isFinite(value)){recordManual();return;}
      const before=state.log[key]?.value||0;
      state.log[key]={...copy(effect),value:effect.operation.startsWith('set')?value:effect.operation==='subtract'?before-value:before+value};return;
    }
    case 'campaign_log_cards': {
      state.log[`${effect.section}:${effect.id}${effect.cards?':'+effect.cards:''}`]={...copy(effect),card:effect.cards||effect.id};return;
    }
    case 'campaign_data':
      if(effect.setting==='next_scenario')state.nextScenario=effect.scenario;
      else if(effect.setting==='result')state.result=effect.value;
      else if(effect.setting==='set_scenarios')state.scenarioOrder=effect.scenarios;
      else if(effect.setting==='skip_scenario'){state.skipped??=[];state.skipped.push(effect.scenario);}
      else recordManual();
      return;
    case 'earn_xp': {
      const base=typeof answer==='number'?answer:0;
      const amount=base*(effect.input_scale??1)+(typeof effect.bonus==='number'?effect.bonus:0);
      const targets=recipients();
      if(!targets.length){recordManual();return;}
      for(const investigator of targets)if(amount>=0)investigator.earned+=amount;else investigator.spent+=-amount;
      return;
    }
    case 'trauma': {
      const targets=recipients();
      if(!targets.length){recordManual();return;}
      for(const i of targets){
        i.physical+=typeof effect.physical==='number'?effect.physical:0;
        i.mental+=typeof effect.mental==='number'?effect.mental:0;
        if(effect.killed||effect.insane){i.killed=Boolean(effect.killed);i.insane=Boolean(effect.insane);}
      }
      return;
    }
    case 'add_card': {
      const targets=effect.investigator==='choice'?state.investigators.filter(i=>i.id===answer?.recipient):recipients();
      if(!targets.length){recordManual();return;}
      for(const i of targets)i.storyCards=[...new Set([...i.storyCards,effect.card])];return;
    }
    case 'remove_card':
      for(const i of state.investigators)i.storyCards=i.storyCards.filter(code=>code!==effect.card);return;
    case 'add_chaos_token':state.tokens.push(...(effect.tokens||[]));return;
    case 'remove_chaos_token':
      for(const token of effect.tokens||[]){const n=state.tokens.indexOf(token);if(n>=0)state.tokens.splice(n,1);}return;
    default:recordManual();
  }
}
