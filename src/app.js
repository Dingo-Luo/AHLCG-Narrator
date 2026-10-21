import { createSave, replay, commit, SUPPORTED, playPosition } from './engine.js';
import { moveTo, storyNavigation, browseCard } from './navigation.js';
import { renderBoard } from './board.js';
import { HISTORY_KEY, emptyLibrary, readLibrary, savePlay, deletePlay, restorePlay } from './library.js';
import { localizedCard, investigatorName } from './localization.js';
import { renderMainMenu, renderNewPlayForm } from './menu.js';

const LOCALE_KEY = 'ahlcg-narrator-language';
const root = document.getElementById('app');
const modal = document.getElementById('modal');
let database, save = null, state = null, view = 'home', locale = 'zh-cn', storageProblem = false, corruptSave = false, externalChange = false;
let activeAudio = null;
let library = emptyLibrary();
let resolutionCandidate = null, toastTimer, navigationSave, navigationState;
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const L = (zh, en) => locale === 'en' ? en : zh;
const localText = {
  'Setup': '准备', 'Prologue': '序章', 'Intro': '开场', 'Location Placement': '地点布局',
  'Upgrade investigators': '升级调查员',
  'Record experience spent in the investigator panel before continuing.': '你可以在调查员面板记录升级所花费的经验，然后继续。',
  'No resolution was reached': '未达成结局',
};
const t = text => !text ? '' : locale === 'en' ? text : database.translations[locale]?.[text] || localText[text] || text;
const title = id => t(database.scenarios[id]?.scenario_name || id);
const nameOf = item => investigatorName(database,item,locale);
const button = (text, action, extra = '', style = '') => `<button class="button ${style}" data-action="${action}" ${extra}>${text}</button>`;
function prose(text, translate = true) {
  // Upstream markup is data. Escape first and allow only a small, attribute-free set.
  let value = escape(translate ? t(text) : text);
  value = value.replace(/&lt;(\/?)(b|i|em|strong|blockquote|hr|br)\s*\/?&gt;/gi, '<$1$2>');
  value = value.replace(/\[\[([^\]]+)\]\]/g, '<span class="trait">$1</span>');
  const symbols = { action: '↷', reaction: '⤴', free: '◇', willpower: '意志', intellect: '智力', combat: '战力', agility: '敏捷', per_investigator: '／调查员', elder_thing: '古神', tablet: '石板', skull: '骷髅', cultist: '异教徒', elder_sign: '古印', auto_fail: '触手' };
  value = value.replace(/\[([a-z_]+)\]/g, (_, key) => `<span class="symbol">${escape(locale === 'en' ? key.replaceAll('_', ' ') : symbols[key] || key)}</span>`);
  return `<div class="prose">${value.replaceAll('\n', '<br>')}</div>`;
}
function toast(message) {
  const el = document.getElementById('toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 4500);
}
function loadActivePlay(){
  const candidate=library.plays.find(play=>play.id===library.activeId)?.save;
  save=null;state=null;
  if(candidate){try{state=replay(database,candidate);save=candidate;}catch(error){console.warn(error.message);}}
}
function readStorage() {
  try {
    locale = localStorage.getItem(LOCALE_KEY) === 'en' ? 'en' : 'zh-cn';
    library = readLibrary(localStorage);
  } catch (error) { storageProblem = true; corruptSave = true; console.warn('History could not be loaded:', error.message); return; }
  const candidate = library.plays.find(play => play.id === library.activeId)?.save;
  if (candidate) {
    try { state = replay(database, candidate); save = candidate; }
    catch (error) { console.warn('Previous play is unavailable:', error.message); }
  }
}
function persist(next, options = {}) {
  let nextState = replay(database, next);
  if (!nextState.storyOnly && !replay(database,{...next,cursor:next.events.length}).storyOnly) {
    // Add migration at the end without discarding any retained future history.
    const cursor=next.cursor;
    next=commit(database,{...next,cursor:next.events.length},{type:'story_only'});
    if(cursor!==undefined&&cursor<next.events.length-1)next.cursor=cursor;
    nextState=replay(database,next);
  }
  try { library = savePlay(localStorage, library, next, options); }
  catch (error) { storageProblem = true; if(error.message.includes('另一标签页'))externalChange=true; render(); throw Error(L('无法保存游戏：', 'Could not save game: ')+error.message); }
  save = next; state = nextState; storageProblem = false; corruptSave = false; externalChange = false;
}
function dispatch(event) {
  if (externalChange) throw Error('另一个标签页更新了存档，请刷新后继续，避免覆盖新进度。');
  if (activeAudio) { activeAudio.pause(); activeAudio = null; }
  persist(commit(database, save, event)); resolutionCandidate = null; render();
}
function openModal(heading, body) {
  document.getElementById('modal-content').innerHTML = `<div class="modal-head"><h2>${heading}</h2><button class="close" data-action="close-modal" aria-label="关闭">×</button></div>${body}`;
  if (!modal.open) modal.showModal();
}
function storyNav() {
  if(navigationSave!==save){navigationState=storyNavigation(database,save);navigationSave=save;}
  return navigationState;
}
function goTo(position) {
  if(position===null||position===undefined)return;
  if(externalChange)throw Error(L('请先刷新以载入最新记录。','Reload to load the latest progress.'));
  if(activeAudio){activeAudio.pause();activeAudio=null;}
  let next=moveTo(database,save,position);
  const target=replay(database,next);
  if(target.active?.phase==='setup'){
    const step=database.scenarios[target.active.id].steps.find(item=>item.id===target.active.queue[0]);
    if(step&&step.type!=='story'&&!step.input){
      const earlier=storyNav().stops.filter(stop=>stop.end<=position).at(-1);
      if(earlier)next=moveTo(database,save,earlier.end);
    }
  }
  persist(next);resolutionCandidate=null;render();window.scrollTo(0,0);
}
function pendingEvent() { return save.events[playPosition(save)]; }
function canContinue() {
  if(!state.active)return SUPPORTED.includes(state.nextScenario);
  if(state.active.phase==='ready')return true;
  return Boolean(state.active.queue.length&&!current()?.input?.choices);
}
function navigationBar() {
  const nav=storyNav();
  return `<div class="story-navigation" aria-label="${L('剧情导航','Story navigation')}">${button('← '+L('上一步','Back'),'previous-step',nav.previous===null?'disabled':'','small')}<select aria-label="${L('章节','Chapter')}" data-action="jump-chapter">${!state.active?`<option value="" selected>${escape(title(state.nextScenario)||L('章节','Chapter'))}</option>`:''}${nav.chapters.map(chapter=>`<option value="${chapter.position}" ${state.active?.id===chapter.id?'selected':''}>${escape(title(chapter.id))}</option>`).join('')}</select>${button(L('下一步','Next')+' →','next-step',nav.next===null&&nav.nextAction===null&&!canContinue()?'disabled':'','small')}</div>`;
}
function advanceCurrent() {
  const step=current();let answer;
  if(step?.input?.type==='counter')answer=Number(document.getElementById('counter').value);
  if(step?.effects?.some(item=>item.type==='add_card'))answer={recipient:document.getElementById('recipient').value};
  dispatch({type:'advance',...(answer!==undefined?{answer}:{})});
}
function nextStep() {
  const step=current(),nav=storyNav();
  if(step?.input?.type==='counter'||step?.effects?.some(item=>item.type==='add_card'))advanceCurrent();
  else if(nav.next!==null)goTo(nav.next);
  else if(nav.nextAction!==null)goTo(nav.nextAction);
  else if(!state.active&&SUPPORTED.includes(state.nextScenario))dispatch({type:'start',scenario:state.nextScenario});
  else if(state.active?.phase==='ready')dispatch({type:'finish'});
  else if(state.active?.queue.length&&!step?.input?.choices)advanceCurrent();
}
function nav() {
  return [ ['home', '⌂', L('主菜单', 'Main menu')], ['story', '▤', L('剧情', 'Story')], ['team', '♙', L('调查员', 'Investigators')], ['log', '✎', L('日志', 'Log')] ];
}
function render() {
  document.title=L('诡镇档案 · AHLCG Narrator','AHLCG Narrator');
  document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN';
  const menu = view === 'home';
  const scenario = state?.active && database.scenarios[state.active.id];
  root.innerHTML = `<div class="shell ${menu ? 'menu-shell' : ''}">
    ${menu ? '' : `<aside class="sidebar"><a class="brand" href="#home"><strong>${L('诡镇档案','AHLCG Narrator')}</strong></a><nav class="nav" aria-label="主导航">${nav().map(([id,icon,label])=>`<button data-action="navigate" data-view="${id}" class="${view===id?'active':''}" ${view===id?'aria-current="page"':''}><span class="nav-icon" aria-hidden="true">${icon}</span>${label}</button>`).join('')}</nav></aside>`}
    <div class="workspace"><header class="topbar"><span class="mobile-brand">${L('诡镇档案','AHLCG Narrator')}</span><div class="breadcrumb"><b>${escape(menu ? L('诡镇档案', 'AHLCG Narrator') : scenario ? t(scenario.scenario_name) : L('游戏', 'Game'))}</b></div><div class="top-actions">${menu ? '' : `<span class="save-status ${storageProblem||externalChange?'save-error':''}" role="status">${externalChange?L('请刷新以载入最新记录','Reload to load latest progress'):storageProblem?L('保存失败','Save failed'):L('已自动保存','Saved')}</span>`}<div class="language" aria-label="语言"><button data-action="language" data-lang="zh-cn" class="${locale!=='en'?'selected':''}" aria-pressed="${locale!=='en'}">中文</button><button data-action="language" data-lang="en" class="${locale==='en'?'selected':''}" aria-pressed="${locale==='en'}">EN</button></div></div></header>
      <main class="content ${menu?'menu-content':''}" id="main">${storageProblem||externalChange?`<div class="notice error">${externalChange?L('另一标签页已更新游戏记录，请刷新后继续。','Games changed in another tab. Reload to continue.'):L('无法读取或保存游戏记录，已有数据未被删除。','Game records could not be read or saved. Existing data has not been deleted.')}</div>`:''}${renderView()}</main>
    </div></div>`;
  for(const img of root.querySelectorAll('img'))img.addEventListener('error',()=>{
    img.hidden=true;const message=document.createElement('p');message.className='notice';message.textContent=L('卡图未能加载，仍可阅读下方卡牌文字。','Card image unavailable. The card text remains available.');img.after(message);
  },{once:true});
}
function head(_eyebrow, heading, sub = '', action = '') {
  return `<div class="page-head"><div><h1>${escape(heading)}</h1>${sub?`<p>${escape(sub)}</p>`:''}</div>${action}</div>`;
}

function renderView() {
  if (view === 'home') return home();
  if (!save) return `<div class="paper empty"><div class="eyebrow">YOUR STORY BEGINS HERE</div><h2>${L('先建立你的战役档案', 'Begin a campaign')}</h2><p>${L('加入调查员后，即可记录剧情选择与进度。', 'Add investigators to keep track of choices and progress.')}</p>${button(L('建立战役', 'New campaign'), 'new', '', 'primary')}</div>`;
  if (view === 'team') return team();
  if (view === 'log') return log() + historyPanel();
  if (view === 'agenda' || view === 'act') return story();
  return navigationBar()+story();
}
function home() {
  return renderMainMenu(database,library,{L,t,escape,button,locale,blocked:corruptSave||externalChange});
}

function story() {
  const active = state.active;
  if (!active) {
    const next = state.nextScenario;
    return head('THE NEXT CHAPTER', L('下一段故事', 'The next chapter')) + `<div class="paper"><div class="eyebrow">${Object.keys(state.completed).length ? 'THE STORY CONTINUES' : 'THE BEGINNING'}</div><h2>${escape(title(next))}</h2><p class="muted">${SUPPORTED.includes(next) ? L('继续故事。此前的行动和选择会保留。', 'Continue the story. Your previous actions and choices carry forward.') : L('该章节的数据已导入，交互流程仍在适配中。你可以查看日志或调整调查员记录。', 'This chapter is imported but its interactive flow is not yet available. Review your log or investigator records.')}</p>${SUPPORTED.includes(next) ? button(L('开始这一章', 'Start chapter') + ' →', 'start', '', 'primary') : button(L('查看战役日志', 'View campaign log'), 'navigate', 'data-view="log"')}</div>`;
  }
  const s = database.scenarios[active.id];
  const header = head('THE DUNWICH LEGACY', t(s.scenario_name), '', active.phase === 'play' ? `<div class="actions">${button(L('记录行动', 'Record action'), 'story-actions', '', 'small')}${button(L('结束调查', 'End scenario'), 'resolutions', '', 'small')}</div>` : '');
  if (active.phase === 'play') return header + renderBoard(database, state, {L, escape, button, prose, locale});
  const step = current();
  let body;
  if (active.phase === 'ready') {
    body = `<div class="eyebrow">CHAPTER COMPLETE</div><h2>${L('这一页，即将归档。', 'A chapter ready to be archived.')}</h2><p>${L('剧情选择和结局效果已记录。确认归档后，将根据各调查员的结束状态追加被击败创伤，并开放下一章。', 'Choices and resolution effects are recorded. Archiving adds defeat trauma from each investigator’s end status, then opens the next chapter.')}</p><div class="notice">${L('结局本身带来的创伤已即时记录；被伤害／恐惧击败造成的创伤，会在此处归档时单独结算。', 'Trauma from the resolution is already recorded. Trauma for defeat by damage/horror is added separately on archiving.')}</div>${summaryTeam()}<div class="step-footer">${button('← '+L('上一步', 'Back'), 'previous-step', storyNav().previous===null?'disabled':'', 'small')}${button(L('归档并继续', 'Archive & continue') + ' →', 'finish', '', 'primary')}</div>`;
    if (active.id === 'dwl_prologue') body = `<div class="eyebrow">THE FIRST LEAD</div><h2>${L('线索已经明确', 'Your first lead awaits')}</h2><p>${L('你的选择已记录。下一章将前往：', 'Your choice is recorded. Next destination: ')}<strong>${escape(title(state.nextScenario))}</strong></p><div class="step-footer">${button('← '+L('上一步', 'Back'), 'previous-step', storyNav().previous===null?'disabled':'', 'small')}${button(L('归档并继续', 'Archive & continue')+' →', 'finish', '', 'primary')}</div>`;
  } else if (step) body = stepContent(step);
  else body = '<p>流程暂不可用。</p>';
  return header + `<article class="paper story-paper">${body}</article>`;
}
function current() {
  const ref = state.active?.queue[0];
  if (ref === '$upgrade_decks') return { id: ref, title: 'Upgrade investigators', type: 'upgrade', text: 'Record experience spent in the investigator panel before continuing.' };
  if (ref?.startsWith('@resolution:')) return database.scenarios[state.active.id].resolutions.find(item => item.id === ref.slice(12));
  return database.scenarios[state.active?.id]?.steps.find(item => item.id === ref);
}
function stepContent(step) {
  const phase = state.active.phase;
  const remembered=pendingEvent()?.type==='advance'?pendingEvent().answer:undefined;
  const textTitle = step.title || (step.type === 'story' ? L('故事背景', 'The story') : step.type === 'encounter_sets' ? L('收集遭遇组', 'Gather encounter sets') : step.type === 'location_setup' ? 'Location Placement' : step.input ? L('记录你的选择', 'Record your choice') : L('故事与记录', 'Story & record'));
  let result = `<div class="eyebrow">${phase === 'setup' ? 'THE OPENING STORY' : 'RESOLUTION & CONSEQUENCES'}</div><h2>${escape(t(textTitle))}</h2>`;
  if (step.text) result += prose(step.text);
  if (locale !== 'en' && step.text && !database.translations[locale]?.[step.text] && !localText[step.text]) result += `<p class="subtle">${L('此段暂无中文翻译，显示上游英文原文。', '')}</p>`;
  if (step.effects?.some(item => item.type === 'campaign_log') && !step.text) result += step.effects.filter(item => item.type === 'campaign_log').map(item => `<div class="log-entry">${prose(item.text)}</div>`).join('');
  const assignment = step.effects?.find(item => item.type === 'add_card');
  if (assignment) {
    const card = database.cards[assignment.card];
    result += `<label style="margin-top:20px">${L('剧情卡持有者', 'Story card recipient')} · ${escape(localizedCard(card,locale).name)}<select id="recipient"><option value="">${L('不加入任何调查员', 'Do not add to an investigator')}</option>${state.investigators.map(item=>`<option value="${item.id}" ${remembered?.recipient===item.id?'selected':''}>${escape(nameOf(item))}</option>`).join('')}</select></label>`;
  }
  const input = step.input;
  if (input?.type === 'choose_one') {
    result += `<div class="choice-list">${input.choices.map(choice=>`<button class="choice ${remembered===choice.id?'selected':''}" aria-pressed="${remembered===choice.id}" data-action="answer" data-answer="${escape(choice.id)}"><span>◇</span><span>${prose(choice.text)}${choice.description ? prose(choice.description) : ''}</span><span class="arrow">→</span></button>`).join('')}${input.choices.length === 1 ? `<button class="choice ${remembered==='__none'?'selected':''}" aria-pressed="${remembered==='__none'}" data-action="answer" data-answer="__none">${L('没有／否', 'No')}<span class="arrow">→</span></button>` : ''}</div>`;
  }
  if (input?.type === 'counter') {
    result += `<div class="counter-input"><label>${escape(t(input.text))}<input type="number" id="counter" min="0" max="999" step="1" value="${Number.isSafeInteger(remembered)?remembered:0}" inputmode="numeric"></label></div>`;
    if (input.confirm_text) result += `<div class="notice">${prose(input.confirm_text)}</div>`;
  }
  if (step.type === 'upgrade') result += button(L('打开调查员面板', 'Open investigators'), 'navigate', 'data-view="team"');
  if (step.type === 'story' || step.narration) result += `<p><button class="button small" disabled title="${L('配音将在后续加入', 'Narration will be added later')}">▷ ${L('配音待加入', 'Voice soon')}</button></p>`;
  result += `<div class="step-footer"><span class="step-index">${button('← '+L('上一步', 'Back'), 'previous-step', storyNav().previous===null?'disabled':'', 'small')}</span>${button(L('下一步','Next')+' →','next-step',input?.type==='choose_one'&&storyNav().next===null?'disabled':'','primary')}</div>`;
  return result;
}
function summaryTeam() {
  return `<div style="margin:25px 0">${state.investigators.map(item=>`<div class="list-item"><span>${escape(nameOf(item))}</span><span class="subtle">${L('经验', 'XP')} ${item.earned - item.spent} · ${L('肉体', 'Physical')} ${item.physical} · ${L('精神', 'Mental')} ${item.mental}</span></div>`).join('')}</div>`;
}
function showResolutions() {
  const scenario = database.scenarios[state.active.id];
  openModal(L('结束这场调查', 'End this investigation'), `<p class="subtle">${L('按游戏指示选择结局；确认前不显示结局故事。', 'Choose the resolution instructed by the game. Its story stays hidden until confirmed.')}</p><div class="choice-list">${scenario.resolutions.map(item => `<button class="choice" data-action="choose-resolution" data-id="${escape(item.id)}"><span>${escape(t(item.title))}</span><span class="arrow">→</span></button>`).join('')}</div>`);
}
function showStoryActions() {
  if (state.active.id !== 'the_house_always_wins') { showResolutions(); return; }
  const answer = state.active.actions.cheated;
  openModal(L('记录行动', 'Record an action'), `<h3>${L('你们是否使用了“作弊”？', 'Did any investigator cheat?')}</h3><p class="subtle">${L('按你们在实体游戏中的行动记录；结局时会使用这项选择。', 'Record what happened at the table. This choice will carry into the resolution.')}</p>${answer !== undefined ? `<p class="subtle">${L('已记录：', 'Recorded: ')}${answer ? L('是', 'Yes') : L('否', 'No')}</p>` : ''}<div class="choice-list">${button(L('是，曾经作弊', 'Yes, we cheated'), 'record-cheat', 'data-value="yes"', 'primary')}${button(L('否，没有作弊', 'No, we did not'), 'record-cheat', 'data-value="no"')}</div>`);
}
function team() {
  const stats = [['physical', L('肉体创伤', 'Physical trauma')], ['mental', L('精神创伤', 'Mental trauma')], ['earned', L('累计获得经验', 'Total XP earned')], ['spent', L('已使用经验', 'XP spent')]];
  return head('THE PEOPLE WHO ENDURE', L('调查员记录', 'Your investigators'), L('结局奖励自动计入；升级消耗与额外变化可在这里记录。', 'Resolution rewards are automatic. Record upgrades and other adjustments here.')) + `<div class="team-grid">${state.investigators.map(item=>`<section class="investigator"><div class="investigator-head">${classIcon(database.cards[item.card] || {})}<div><h3>${escape(nameOf(item))}</h3><small>${item.card || L('自定义调查员', 'Custom investigator')}</small></div></div><div class="stats">${stats.map(([field,label])=>`<div class="stat"><span>${label}</span><div class="number-controls"><button data-action="adjust" data-investigator="${item.id}" data-field="${field}" data-delta="-1" aria-label="${escape(nameOf(item)+' '+label+' -1')}" ${item[field] <= 0 || field === 'earned' && item.earned <= item.spent ? 'disabled' : ''}>−</button><strong>${item[field]}</strong><button data-action="adjust" data-investigator="${item.id}" data-field="${field}" data-delta="1" aria-label="${escape(nameOf(item)+' '+label+' +1')}" ${field === 'spent' && item.spent >= item.earned || item[field] >= 999 ? 'disabled' : ''}>+</button></div></div>`).join('')}</div>${item.storyCards.length ? `<p class="subtle" style="margin-top:22px">${L('剧情卡', 'Story cards')}：${item.storyCards.map(code=>escape(localizedCard(database.cards[code],locale).name||code)).join(' · ')}</p>` : ''}<div class="xp-balance"><span>${L('可用经验', 'AVAILABLE XP')}</span><strong>${item.earned-item.spent} <small>XP</small></strong></div></section>`).join('')}</div><div class="notice">${L('此处记录的是长期创伤，并非本局的伤害／恐惧。误操作可在战役日志撤销最近一次操作。', 'These are permanent trauma totals, not current damage or horror. Undo the latest action from the campaign log.')}</div>${button(L('回到剧情流程', 'Return to story')+' →','navigate','data-view="story"')}`;
}
function log() {
  const entries=Object.values(state.log).filter(item=>item.section!=='hidden');
  return head('',L('战役日志','Campaign log'),'',`<div class="actions">${button(L('撤销','Undo'),'undo',storyNav().previousAction===null?'disabled':'','small')}${button(L('重做','Redo'),'redo',storyNav().nextAction===null?'disabled':'','small')}</div>`)+`<article class="paper">${entries.length?entries.map(item=>`<div class="log-entry" ${item.crossed?'style="text-decoration:line-through"':''}>${prose(item.text||item.id)}</div>`).join(''):`<p class="muted">${L('暂无战役记录','No campaign notes')}</p>`}${state.tokens.length?`<div class="notice">${L('加入的混乱标记','Added chaos tokens')}：${state.tokens.map(token=>prose(`[${token}]`,false)).join(' ')}</div>`:''}</article><div class="section-title"><h2>${L('进度','Progress')}</h2></div><div class="paper">${Object.entries(state.completed).map(([id,result])=>`<div class="list-item"><span>${escape(title(id))}</span><span class="pill">${result.resolution?escape(t(result.resolution.replace('R','Resolution '))):L('已完成','Complete')}</span></div>`).join('')}${state.active?`<div class="list-item"><span>${escape(title(state.active.id))}</span><span class="pill amber">${L('进行中','In progress')}</span></div>`:''}</div>`;
}

async function newCampaign() {
  if(externalChange)throw Error(L('请刷新以载入最新游戏记录。','Reload to load the latest games.'));
  if(corruptSave)throw Error(L('暂时无法读取游戏历史，已有数据未被删除。','Game history could not be loaded. Existing data has not been deleted.'));
  openModal(L('开始新游戏','New game'),renderNewPlayForm(database,{L,t,escape,button},rosterRow()));
}
function rosterRow() {
  const investigators=Object.values(database.cards).filter(card=>card.type_code==='investigator'&&/^(01|02)\d{3}$/.test(card.code));
  return `<div class="roster-row"><input type="hidden" name="investigator" value=""><details class="investigator-picker"><summary>${L('选择调查员','Choose investigator')}</summary><div class="investigator-options" role="group" aria-label="${L('调查员','Investigators')}">${investigators.map(card=>`<button type="button" data-action="choose-investigator" data-code="${card.code}">${classIcon(card)}<span>${escape(localizedCard(card,locale).name)}</span></button>`).join('')}</div></details><button type="button" data-action="remove-roster" aria-label="${L('移除调查员','Remove investigator')}">×</button></div>`;
}
function classIcon(card) {
  const faction=['guardian','seeker','rogue','mystic','survivor'].includes(card.faction_code)?card.faction_code:'neutral';
  return `<span class="class-icon ${faction}" aria-hidden="true">${faction==='neutral'?'◇':`<span style="mask-image:url('assets/classes/${faction}.svg');-webkit-mask-image:url('assets/classes/${faction}.svg')"></span>`}</span>`;
}

function chooseResolution(id) {
  const s = database.scenarios[state.active.id], res = s.resolutions.find(item=>item.id===id);
  const remembered=pendingEvent()?.type==='resolution'&&pendingEvent().id===id?pendingEvent().statuses:{};
  resolutionCandidate = id;
  openModal(L('确认进入结局', 'Confirm resolution'), `<p>${escape(t(s.scenario_name))} · <strong>${escape(t(res.title))}</strong></p>${res.description ? `<div class="notice">${prose(res.description)}</div>` : ''}<p class="subtle">${L('请按实体游戏结果记录每位调查员的状态。被伤害／恐惧击败产生的创伤将在本章归档时结算。', 'Record each investigator’s actual end status. Defeat trauma is added when the chapter is archived.')}</p><form id="resolution-form"><div class="resolution-form">${state.investigators.map(item=>`<label class="status-row"><span>${escape(nameOf(item))}</span><select name="${item.id}" required><option value="">${L('选择结束状态', 'Choose end status')}</option>${[['survived',L('存活／完成目标','Survived / objective complete')],['resigned',L('撤退','Resigned')],['physical',L('伤害击败（+1 肉体创伤）','Defeated by damage (+1 physical)')],['mental',L('恐惧击败（+1 精神创伤）','Defeated by horror (+1 mental)')],['both',L('同时被伤害与恐惧击败（两种创伤各 +1）','Defeated by both (+1 each)')],['eliminated',L('其他方式退场（请按卡牌另记创伤）','Other elimination (record card effects separately)')]].map(([value,text])=>`<option value="${value}" ${remembered[item.id]===value?'selected':''}>${text}</option>`).join('')}</select></label>`).join('')}</div><div class="form-actions"><button type="button" class="button" data-action="close-modal">${L('取消', 'Cancel')}</button><button class="button primary" type="submit">${L('确认并揭示结局', 'Confirm & reveal')} →</button></div></form>`);
}
function historyPanel() {
  const entries = state.history.filter(item => ['step','action'].includes(item.type) && item.answer !== undefined);
  return `<div class="section-title"><h2>${L('选择与结算记录', 'Choices & settlement history')}</h2></div><div class="paper">${entries.length ? entries.map(item => {
    const step=database.scenarios[item.scenario]?.steps.find(step=>step.id===item.step);
    const choice=step?.input?.choices?.find(choice=>choice.id===item.answer);
    const answer=choice?.text || (item.answer==='__none'?L('没有／否','No'):typeof item.answer==='boolean'?L(item.answer?'是，曾经作弊':'否，没有作弊',item.answer?'Yes, we cheated':'No, we did not'):typeof item.answer==='number'?String(item.answer):item.answer?.recipient?nameOf(state.investigators.find(i=>i.id===item.answer.recipient)||{name:''}):L('不加入','Not added'));
    return `<div class="history-item"><small>${escape(title(item.scenario))} · ${escape(t(step?.input?.text || step?.title || L('剧情选择','Story choice')))}</small>${prose(answer)}</div>`;
  }).join('') : `<p class="muted">${L('尚未记录选择或结算。','No choices or settlements recorded yet.')}</p>`}</div>`;
}
document.addEventListener('click',async event=>{
  const el=event.target.closest('[data-action]');if(!el)return;
  try {
    switch(el.dataset.action) {
      case 'navigate': view=el.dataset.view;render();window.scrollTo(0,0);break;
      case 'language': locale=el.dataset.lang;try{localStorage.setItem(LOCALE_KEY,locale)}catch{}render();break;
      case 'new': if(modal.open)modal.close();await newCampaign();break;
      case 'close-modal':modal.close();resolutionCandidate=null;break;
      case 'previous-step':goTo(storyNav().previous);break;
      case 'next-step':nextStep();break;
      case 'redo':goTo(storyNav().nextAction);break;
      case 'resume-play': {
        if(externalChange)throw Error(L('请刷新以载入最新游戏记录。','Reload to load the latest games.'));
        const play=library.plays.find(play=>play.id===el.dataset.id);
        if(!play)throw Error(L('找不到这场游戏。','Game not found.'));
        persist(play.save,{playId:play.id});view='story';render();window.scrollTo(0,0);break;
      }
      case 'delete-play':case 'restore-play': {
        if(externalChange)throw Error(L('请先刷新以载入最新记录。','Reload to load the latest games.'));
        if(activeAudio){activeAudio.pause();activeAudio=null;}
        const deleting=el.dataset.action==='delete-play';
        library=deleting?deletePlay(localStorage,library,el.dataset.id):restorePlay(localStorage,library,el.dataset.id);
        loadActivePlay();view='home';render();
        break;
      }
      case 'start':dispatch({type:'start',scenario:state.nextScenario});break;
      case 'advance': {
        const step=current();let answer;
        if(step.input?.type==='counter')answer=Number(document.getElementById('counter').value);
        if(step.effects?.some(item=>item.type==='add_card'))answer={recipient:document.getElementById('recipient').value};
        dispatch({type:'advance',...(answer !== undefined ? {answer}: {})});window.scrollTo(0,0);break;
      }
      case 'answer':dispatch({type:'advance',answer:el.dataset.answer});window.scrollTo(0,0);break;
      case 'finish':dispatch({type:'finish'});break;
      case 'choose-resolution':chooseResolution(el.dataset.id);break;
      case 'adjust':dispatch({type:'adjust',investigator:el.dataset.investigator,field:el.dataset.field,delta:Number(el.dataset.delta)});break;
      case 'next-card':case 'previous-card':case 'flip-card': {
        if(externalChange)throw Error('请先刷新以载入最新记录。');
        if(activeAudio){activeAudio.pause();activeAudio=null;}
        const action=el.dataset.action==='flip-card'?'flip':el.dataset.action==='previous-card'?'previous':'next';
        persist(browseCard(database,save,el.dataset.deck,action));render();break;
      }
      case 'resolutions':showResolutions();break;
      case 'story-actions':showStoryActions();break;
      case 'record-cheat':dispatch({type:'record_action',id:'cheated',value:el.dataset.value==='yes'});modal.close();break;
      case 'narrate':
        if(activeAudio){activeAudio.pause();activeAudio=null;break}
        activeAudio=new Audio(el.dataset.audio);await activeAudio.play();break;
      case 'reveal-card': {
        dispatch({type:'reveal',card:el.dataset.card,side:el.dataset.side});break;
      }
      case 'undo':goTo(storyNav().previousAction);break;
      case 'add-roster':if(document.querySelectorAll('.roster-row').length<4)document.getElementById('roster').insertAdjacentHTML('beforeend',rosterRow());break;
      case 'choose-investigator': {
        const row=el.closest('.roster-row'),card=database.cards[el.dataset.code];
        row.querySelector('input[name="investigator"]').value=card.code;
        row.querySelector('summary').innerHTML=classIcon(card)+`<span>${escape(localizedCard(card,locale).name)}</span>`;
        row.querySelectorAll('[data-action="choose-investigator"]').forEach(option=>option.setAttribute('aria-pressed',String(option===el)));
        row.querySelector('details').open=false;row.querySelector('summary').focus();break;
      }
      case 'remove-roster':if(document.querySelectorAll('.roster-row').length>1)el.closest('.roster-row').remove();break;

    }
  } catch(error){toast(error.message)}
});
document.addEventListener('submit',event=>{
  if(!['new-form','resolution-form'].includes(event.target.id))return;
  event.preventDefault();
  try{
    const form=new FormData(event.target);
    if(event.target.id==='new-form'){
      if(form.get('expansion')!=='dwl')throw Error('无效扩展');
      const codes=form.getAll('investigator');
      if(new Set(codes).size!==codes.length)throw Error(L('调查员不能重复','Investigators must be different'));
      const investigators=codes.map(code=>{
        const card=database.cards[code];
        if(!card||card.type_code!=='investigator'||!/^(01|02)\d{3}$/.test(code))throw Error('请选择有效调查员');
        return {name:localizedCard(card,locale).name,card:card.code};
      });
      let next=createSave(investigators,t(database.campaign.name),database.sources[0].commit);
      next=commit(database,next,{type:'difficulty',value:form.get('difficulty')});
      next=commit(database,next,{type:'start',scenario:'dwl_prologue'});
      persist(next,{create:true});view='story';modal.close();render();
    }else{
      const id=resolutionCandidate;
      const statuses=Object.fromEntries(form.entries());
      dispatch({type:'resolution',id,statuses});modal.close();
    }
    window.scrollTo(0,0);
  }catch(error){toast(error.message)}
});
window.addEventListener('hashchange',()=>{if(location.hash==='#home'){view='home';render()}});
document.addEventListener('change',event=>{if(event.target.matches('[data-action="jump-chapter"]')&&event.target.value){try{goTo(Number(event.target.value))}catch(error){toast(error.message)}}});
window.addEventListener('storage',event=>{if(event.key===HISTORY_KEY){externalChange=true;render();toast(L('另一标签页更新了存档，请刷新后继续。','The save changed in another tab. Reload to continue.'))}});
async function init(){
  try{const response=await fetch('data/dwl.json');if(!response.ok)throw Error('数据加载失败');database=await response.json();readStorage();render()}
  catch(error){root.innerHTML=`<main class="content"><div class="paper"><h1>档案暂时无法打开</h1><p>请通过本地服务器打开网站，并确认 data/dwl.json 存在。</p><p>${escape(error.message)}</p></div></main>`}
}
await init();
