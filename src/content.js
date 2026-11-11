import { adaptExtended } from './extended.js';
export function mergeCampaigns(dunwich,core,carcosa,extended){
  const extra=extended?adaptExtended(extended):{campaigns:{},scenarios:{},cards:{}};
  const campaigns={core:core.campaign,dwl:dunwich.campaign,...(carcosa?{ptc:carcosa.campaign}:{})};
  Object.assign(campaigns,extra.campaigns);
  const scenarios={...dunwich.scenarios,...core.scenarios,...carcosa?.scenarios,...extra.scenarios};
  if(carcosa){
    const edition=carcosa.campaign.steps.find(s=>s.id==='ask_reprint').input.choices.find(c=>c.id==='reprint');
    campaigns.ptc={...carcosa.campaign,edition:'reprint',initialLog:edition.effects.filter(e=>e.type==='campaign_log'),scenarios:edition.effects.find(e=>e.setting==='set_scenarios').scenarios};
  }
  // Compile story setup separately; original source files remain unchanged.
  for(const scenario of Object.values(scenarios)){
    if(scenario.guided)continue;
    if(['dwl_prologue','the_house_always_wins','extracurricular_activity','torch','arkham','tentacles','core_prologue'].includes(scenario.id))continue;
    const steps=new Map(scenario.steps.map(s=>[s.id,s]));
    const narrative=(id,seen=new Set())=>{
      if(seen.has(id))return false;seen.add(id);const s=steps.get(id);if(!s)return false;
      if(s.type==='story')return true;
      return [...(s.steps||[]),...(s.condition?.options||[]).flatMap(o=>o.steps||[]),...(s.input?.choices||[]).flatMap(o=>o.steps||[])].some(ref=>narrative(ref,new Set(seen)));
    };
    scenario.storyChapter=['interlude','epilogue'].includes(scenario.type);
    scenario.storySetup=scenario.storyChapter?scenario.setup:scenario.setup.filter(id=>id==='$play_scenario'||narrative(id));
  }
  return {...dunwich,campaigns,campaignSources:{dwl:dunwich.sources[0].commit,core:core.source.commit,...(carcosa?{ptc:carcosa.source.commit}:{}),...Object.fromEntries(Object.keys(extra.campaigns).map(id=>[id,extended.source.commit]))},
    scenarios,cards:{...dunwich.cards,...core.cards,...carcosa?.cards,...carcosa?.dwlCards,...extra.cards}};
}
export const campaignOf=(database,id)=>database.campaigns?.[id]||database.campaign;
