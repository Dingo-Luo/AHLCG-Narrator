// Campaign-box story adapters. Physical board/deck operations stay with the player.
const titleOf=(campaign,section)=>campaign.campaign_log?.find(item=>item.id===section)?.title||'战役记录';
function conditionText(condition,campaign,notes) {
  if(!condition)return '请按当前游戏情况选择。';
  if(condition.type==='multi')return condition.conditions.map(c=>conditionText(c,campaign,notes)).join('；');
  if(condition.type==='campaign_log')return notes.get(`${condition.section}:${condition.id}`)||titleOf(campaign,condition.section);
  if(condition.type==='check_supplies')return '检查调查员携带的补给。';
  if(condition.type==='has_card')return '检查是否持有指定剧情卡。';
  if(condition.type==='campaign_data'&&condition.campaign_data==='difficulty')return '按实体游戏难度选择。';
  if(condition.type==='campaign_data'&&condition.campaign_data==='scenario_completed')return '检查此前的冒险是否已经完成。';
  if(condition.type==='campaign_log_count')return `检查${titleOf(campaign,condition.section)}的记录数值。`;
  if(condition.type==='trauma')return '检查调查员的创伤与存活状态。';
  return '请根据实体游戏及冒险日志，选择符合当前情况的一项。';
}
export function adaptExtended(book) {
  const scenarios=structuredClone(book.scenarios),campaigns=structuredClone(book.campaigns);
  for(const [campaignId,campaign] of Object.entries(campaigns)) {
    const notes=new Map();
    const scan=value=>{
      if(!value||typeof value!=='object')return;
      if(value.type==='campaign_log'&&value.text)notes.set(`${value.section}:${value.id}`,value.text);
      Object.values(value).forEach(v=>Array.isArray(v)?v.forEach(scan):scan(v));
    };
    scan(campaign);
    Object.values(scenarios).filter(s=>s.id.startsWith(campaignId+'_')).forEach(scan);
    for(const scenario of Object.values(scenarios).filter(s=>s.id.startsWith(campaignId+'_'))) {
      scenario.storyChapter=!(scenario.resolutions?.length);
      const steps=new Map(scenario.steps.map(step=>[step.id,step]));
      const physical=new Set(['encounter_sets','location_setup','rule_reminder']);
      function adapt(value) {
        if(!value||typeof value!=='object')return value;
        if(Array.isArray(value))return value.map(adapt);
        const result=Object.fromEntries(Object.entries(value).map(([key,item])=>[key,adapt(item)]));
        if(Array.isArray(result.effects)) {
          const follow=result.effects.filter(e=>e.type==='story_step').flatMap(e=>e.steps||[]);
          result.steps=[...(result.steps||[]),...follow];
          result.effects=result.effects.filter(e=>e.type!=='story_step');
          const supported=new Set(['campaign_log','campaign_log_count','campaign_log_cards','campaign_data','earn_xp','trauma','add_card','remove_card','add_chaos_token','remove_chaos_token']);
          if(result.effects.some(e=>!supported.has(e.type)||e.investigator&&!['all','choice','lead_investigator','defeated','not_resigned'].includes(e.investigator)&&!/^i[1-4]$/.test(e.investigator)))result.manualRecord=true;
        }
        return result;
      }
      const converted=scenario.steps.map(raw=>{
        const step=adapt(raw);
        if(step.type==='branch') {
          const condition=step.condition;
          const choices=(condition.options||[]).map((option,index)=>{
            let text=option.text||option.prompt;
            if(!text||text==='此段暂无中文译文。') {
              text=typeof option.boolCondition==='boolean'?(option.boolCondition?'符合上述条件':'不符合上述条件'):
                option.numCondition!==undefined?`记录值：${option.numCondition}`:
                option.condition!==undefined?(typeof option.condition==='string'&&/[A-Za-z]/.test(option.condition)?({easy:'简单',standard:'普通',hard:'困难',expert:'专家'}[option.condition]||`情况 ${index+1}`):Array.isArray(option.condition)?option.condition.join('、'):String(option.condition)):`情况 ${index+1}`;
            }
            return {...option,id:`branch_${index}`,text};
          });
          if(condition.default_option)choices.push({...condition.default_option,id:'otherwise',text:'其他情况'});
          else if(choices.length===1)choices.push({id:'otherwise',text:'不符合上述条件'});
          step.type='input';
          step.text=step.text||conditionText(condition,campaign,notes);
          step.input={type:'choose_one',choices};
          delete step.condition;
        }
        if(step.input&&!['choose_one','counter','investigator_choice','card_choice','scenario_investigators','play_scenario'].includes(step.input.type)) {
          const input=step.input;
          if(input.type==='receive_campaign_link') {
            step.text=step.text||input.manual_prompt||input.linked_prompt||'记录另一条路线传来的情报。';
            step.input={type:'choose_one',choices:(input.choices||[]).map((choice,i)=>({...choice,id:choice.id||`choice_${i}`,text:choice.text||choice.prompt||`选择 ${i+1}`}))};
          } else if(input.type==='use_supplies'||input.type==='investigator_choice_supplies') {
            step.manualRecord=true;
            step.input={type:'choose_one',choices:[{id:'used',text:'已按要求使用补给'},...(input.choices||[]).map((choice,i)=>({...choice,id:`supply_${i}`,text:choice.prompt||choice.text||'未使用所需补给'}))]};
          } else {
            step.manualRecord=true;
            step.text=step.text||input.prompt||input.manual_prompt||'请按实体游戏完成此项记录。';
            if(input.supplies)step.text+='\n'+input.supplies.map(s=>`${s.name}：${s.description||''}`).join('\n');
            step.input=undefined;
          }
        }
        if(step.input?.type==='investigator_choice') {
          const input=step.input;
          input.choices=(input.choices||[]).map((choice,i)=>({...choice,id:choice.id||`investigator_${i}`}));
          if(input.choices.length!==1||input.investigator!=='choice') {
            step.manualRecord=true;
            step.input={type:'choose_one',choices:input.choices.map((choice,i)=>({...choice,id:choice.id||`choice_${i}`,text:choice.text||choice.prompt||`选择 ${i+1}`}))};
            if(!step.input.choices.length)step.input=undefined;
          }
        }
        if(step.input?.type==='choose_one'&&!step.input.choices.length) {step.input=undefined;step.manualRecord=true;}
        return step;
      });
      scenario.steps=converted;
      if(scenario.steps.some(s=>s.steps?.includes('$proceed')||s.input?.choices?.some(c=>c.steps?.includes('$proceed'))))scenario.steps.push({id:'$proceed',type:'input',skip:true,steps:[]});
      scenario.resolutions=adapt(scenario.resolutions);
      // Include all story/choice gates; omit only physical setup and rules reminders.
      scenario.storySetup=(scenario.setup||[]).filter(id=>id==='$play_scenario'||steps.has(id)&&!physical.has(steps.get(id).type)&&!['$check_tarot_reading'].includes(id));
      if(!scenario.storyChapter&&!scenario.storySetup.includes('$play_scenario'))scenario.storySetup.push('$play_scenario');
      // Physical child steps can occur inside a narrative branch; retain references as empty steps.
      for(const step of scenario.steps)if(physical.has(step.type)) {
        step.text='';step.input=undefined;step.effects=[];step.steps=[];step.skip=true;
      }
    }
  }
  return {campaigns,scenarios,cards:book.cards};
}
