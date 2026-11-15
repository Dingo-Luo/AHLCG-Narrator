import { adaptExtended } from './extended.js';
const physicalSetup = new Set(['encounter_sets', 'location_setup', 'rule_reminder']);
const physicalEffects = new Set(['add_chaos_token', 'remove_chaos_token']);

// These upstream steps contain board, deck or token instructions in interludes,
// resolutions or in-game branches, where the opening filter cannot reach them.
const physicalSteps = new Set([
  'extra_doom_on_entryway', 'no_mulligan', 'fewer_resources', 'start_with_clue',
  'forbidden_name', 'note_about_chaos_token', 'save_decks', 'maybe_save_decks',
  'maybe_upgrade_decks', 'choose_random_location', 'choose_random_location_branch',
  'choose_random_location_carl', 'choose_random_location_anette',
  'oriab_locations', 'oriab_enemies', 'minar_locations', 'forbidden_lands_locations',
  'timeless_realm_locations', 'timeless_realm_encounter_deck', 'timeless_realm_enemies',
  'remove_everything_except_great_hall', 'shuffle_nyarlathotep',
  'shuffle_more_encounter_cards', 'randomize_forsaken_tower',
  'remove_each_location', 'shuffle_spinner_of_darkness', 'attached_locations_to_victory_display',
  'gather_elites', 'look_at_encounter_card', 'sacrifice_all', 'remove_infestation_bag',
  'oriab_xp', 'oriab_act', 'minar_xp', 'minar_enemies', 'minar_act',
  'forbidden_lands_xp', 'forbidden_lands_enemies', 'forbidden_lands_more_enemies', 'forbidden_lands_act',
  'timeless_realm_xp', 'timeless_realm_act', 'reveal_onyx_castle',
  'forsaken_tower_explanation', 'forsaken_tower_locations', 'assemble_atlach_nacha',
  'layout_atlach_nacha', 'read_atlach_nacha_rules', 'atlach_nacha_rule',
  'david_effect', 'earl_effect', 'codex_skull_effect', 'codex_cultist_effect',
  'codex_blood_effect', 'codex_elder_sign_effect_2', 'release_priscilla_tokens', 'test_priscilla_horror',
  'codex_b_3_effect',
]);
const physicalDifficultyChecks = new Set([
  'cob_cob_prologue:check_hard_or_expert',
  'tdeb_weaver_of_the_cosmos:add_chaos_token',
]);

function physicalInstruction(scenario, step) {
  if (physicalSetup.has(step.type)) return true;
  if (step.type === 'story' || step.narration) return false;
  if (physicalSteps.has(step.id) || physicalDifficultyChecks.has(`${scenario.id}:${step.id}`)) return true;
  const text = step.text?.replace(/<[^>]*>/g, '').trim() || '';
  return !step.input && !step.effects?.some(effect => !physicalEffects.has(effect.type)) &&
    /^(?:(?:因为.*难度[，,])?将.*标记加入混乱袋|在.*混乱袋.*加入.*标记|从混乱袋中移除.*标记)/.test(text);
}

function hiddenSetupSteps(scenario) {
  const byId = new Map(scenario.steps.map(step => [step.id, step]));
  const storyChapter = scenario.storyChapter || !scenario.resolutions?.length;
  const visibleStory = step => step.type === 'story' || step.narration;
  const storyEffects = effects => effects?.some(effect => !physicalEffects.has(effect.type));
  function affectsStory(id, seen) {
    const step = byId.get(id);
    if (!step || step.skip || seen.has(id) || physicalInstruction(scenario, step)) return false;
    if (visibleStory(step) || step.type === 'resolution' || storyEffects(step.effects) || storyEffects(step.input?.effects) ||
        ['scenario_investigators', 'receive_campaign_link'].includes(step.input?.type)) return true;
    seen.add(id);
    const routes = [...(step.input?.choices || []), ...(step.condition?.options || []), step.condition?.default_option].filter(Boolean);
    return (step.steps || []).some(ref => affectsStory(ref, seen)) ||
      routes.some(route => storyEffects(route.effects) || route.steps?.some(ref => affectsStory(ref, seen)));
  }
  return new Set(scenario.steps.filter(step => {
    if (storyChapter || visibleStory(step)) return false;
    if (step.effects?.some(effect => effect.type === 'add_card')) return false;
    // Setup-only choices lead solely to physical instructions, with no story consequences.
    return !step.input || !affectsStory(step.id, new Set());
  }).map(step => step.id));
}

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
    scenarios,physicalInstructions:Object.fromEntries(Object.values(scenarios).map(scenario=>[
      scenario.id,new Set(scenario.steps.filter(step=>physicalInstruction(scenario,step)).map(step=>step.id)),
    ])),hiddenSetup:Object.fromEntries(Object.values(scenarios).map(scenario=>[scenario.id,hiddenSetupSteps(scenario)])),cards:{...dunwich.cards,...core.cards,...carcosa?.cards,...carcosa?.dwlCards,...extra.cards}};
}
export const campaignOf=(database,id)=>database.campaigns?.[id]||database.campaign;
