import { createMusicPlayer } from './music.js';
import { createNarrationIndex, renderNarratedText, hasNarratedText } from './narration.js';
import { createNarrationPlayer, narrationClips } from './narration-player.js';
import { chineseText } from './chinese.js';
import { createSave, replay, commit, SUPPORTED, playPosition,cultistCards,storyActions,allowedStatuses } from './engine.js';
import {mergeCampaigns,campaignOf} from './content.js';
import { moveTo, storyNavigation, browseCard,chooseCardVersion } from './navigation.js';
import { renderBoard } from './board.js';
import { HISTORY_KEY, emptyLibrary, readLibrary, savePlay, deletePlay, restorePlay } from './library.js';
import { localizedCard, investigatorName } from './localization.js';
import { renderMainMenu, renderNewPlayForm } from './menu.js';

const root = document.getElementById('app');
const modal = document.getElementById('modal');
let database, save = null, state = null, view = 'home', storageProblem = false, corruptSave = false, externalChange = false;
let activeNarrationButton = null;
let activeNarrationKey = null;
const narrationPlayer = createNarrationPlayer({onStop() {
  if(activeNarrationButton) {
    activeNarrationButton.textContent='▷ 播放配音';
    activeNarrationButton.setAttribute('aria-pressed','false');
  }
  activeNarrationButton=null;
  activeNarrationKey=null;
}});
let musicTracks=[];
const musicPlayer=createMusicPlayer({onChange:syncMusicControls});
let library = emptyLibrary();
let resolutionCandidate = null, toastTimer, navigationSave, navigationState;
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const L = zh => zh;
const t = chineseText;
const title = id => t(database.scenarios[id]?.scenario_name || id);
const nameOf = item => investigatorName(database,item);
const button = (text, action, extra = '', style = '') => `<button class="button ${style}" data-action="${action}" ${extra}>${text}</button>`;
function prose(text, translate = true) {
  // Upstream markup is data. Escape first and allow only a small, attribute-free set.
  let value = escape(translate ? t(text) : text);
  value = value.replace(/&lt;(\/?)(b|i|em|strong|blockquote|hr|br)\s*\/?&gt;/gi, '<$1$2>');
  value = value.replace(/\[\[([^\]]+)\]\]/g, '<span class="trait">$1</span>');
  const symbols = { action: '↷', reaction: '⤴', free: '◇', willpower: '意志', intellect: '智力', combat: '战力', agility: '敏捷', per_investigator: '／调查员', elder_thing: '古神', tablet: '石板', skull: '骷髅', cultist: '异教徒', elder_sign: '古印', auto_fail: '触手' };
  value = value.replace(/\[([a-z_]+)\]/g, (_, key) => `<span class="symbol">${escape(symbols[key] || '未知符号')}</span>`);
  return `<div class="prose">${value.replaceAll('\n', '<br>')}</div>`;
}
function stopNarration() {
  narrationPlayer.stop();
}
function narratedText(raw,key,range) {
  return renderNarratedText(raw,key,database.narrationIndex,{prose,escape},range);
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
  catch (error) { storageProblem = true; if(error.message.includes('另一标签页'))externalChange=true; render(); throw Error(L('无法保存游戏：')+error.message); }
  save = next; state = nextState; storageProblem = false; corruptSave = false; externalChange = false;
}
function dispatch(event) {
  if (externalChange) throw Error('另一个标签页更新了存档，请刷新后继续，避免覆盖新进度。');
  stopNarration();
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
  if(externalChange)throw Error(L('请先刷新以载入最新记录。'));
  stopNarration();
  let next=moveTo(database,save,position);
  const target=replay(database,next);
  if(target.active?.phase==='setup'){
    const step=database.scenarios[target.active.id].steps.find(item=>item.id===target.active.queue[0]);
    if(step&&step.type!=='story'&&!step.input&&!database.scenarios[target.active.id].storySetup){
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
  return Boolean(state.active.queue.length&&current()?.input?.type!=='choose_one');
}
function navigationBar() {
  const nav=storyNav();
  return `<div class="story-navigation" aria-label="${L('剧情导航')}">${button('← '+L('上一步'),'previous-step',nav.previous===null?'disabled':'','small')}<select aria-label="${L('章节')}" data-action="jump-chapter">${!state.active?`<option value="" selected>${escape(title(state.nextScenario)||L('章节'))}</option>`:''}${nav.chapters.map(chapter=>`<option value="${chapter.position}" ${state.active?.id===chapter.id?'selected':''}>${escape(title(chapter.id))}</option>`).join('')}</select>${button(L('下一步')+' →','next-step',nav.next===null&&nav.nextAction===null&&!canContinue()?'disabled':'','small')}</div>`;
}
function advanceCurrent() {
  const step=current();let answer;
  if(step?.input?.type==='counter')answer=Number(document.getElementById('counter').value);
  if(step?.effects?.some(item=>item.type==='add_card'))answer={recipient:document.getElementById('recipient').value};
  if(step?.input?.type==='card_choice')answer=[...document.querySelectorAll('[name="cultist"]:checked')].map(el=>el.value);
  if(step?.input?.type==='scenario_investigators')answer={replacements:Object.fromEntries([...document.querySelectorAll('[data-replacement]')].map(el=>[el.dataset.replacement,el.value]))};
  if(step?.input?.type==='investigator_choice')answer=[...document.querySelectorAll('[name="affected-investigator"]:checked')].map(el=>el.value);
  if(step?.input?.type==='investigator_counter')answer=Object.fromEntries([...document.querySelectorAll('[data-investigator-counter]')].map(el=>[el.dataset.investigatorCounter,Number(el.value)]));
  dispatch({type:'advance',...(answer!==undefined?{answer}:{})});
}
function nextStep() {
  const step=current(),nav=storyNav();
  if(['counter','card_choice','scenario_investigators','investigator_choice','investigator_counter'].includes(step?.input?.type)||step?.effects?.some(item=>item.type==='add_card'))advanceCurrent();
  else if(nav.next!==null)goTo(nav.next);
  else if(nav.nextAction!==null)goTo(nav.nextAction);
  else if(!state.active&&SUPPORTED.includes(state.nextScenario))dispatch({type:'start',scenario:state.nextScenario});
  else if(state.active?.phase==='ready')dispatch({type:'finish'});
  else if(state.active?.queue.length&&step?.input?.type!=='choose_one')advanceCurrent();
}
function nav() {
  return [ ['home', '⌂', L('主菜单')], ['story', '▤', L('剧情')], ['team', '♙', L('调查员')], ['log', '✎', L('日志')], ['music', '♫', L('音乐')] ];
}
function musicControls() {
  const {track,playing,volume}=musicPlayer.snapshot();
  return `<div class="music-controls" role="group" aria-label="背景音乐"><button class="button small" data-action="music-toggle" aria-label="${playing?'暂停背景音乐':'播放背景音乐'}" aria-pressed="${playing}" ${track||musicTracks.some(item=>item.default)?'':'disabled'}>${playing?'Ⅱ 暂停':'▷ 音乐'}</button><span class="music-current" title="${escape(track?.title||'未选择音乐')}">${escape(track?.title||'未选择音乐')}</span><label class="music-volume">音量<input type="range" min="0" max="100" step="1" value="${Math.round(volume*100)}" data-music-volume aria-label="背景音乐音量"><output data-music-volume-value>${Math.round(volume*100)}%</output></label></div>`;
}
function syncMusicControls() {
  const {track,playing,volume}=musicPlayer.snapshot();
  for(const control of document.querySelectorAll('[data-action="music-toggle"]')) {
    control.disabled=!track&&!musicTracks.some(item=>item.default);
    control.setAttribute('aria-pressed',String(playing));
    control.setAttribute('aria-label',playing?'暂停背景音乐':'播放背景音乐');
    control.textContent=playing?'Ⅱ 暂停':'▷ 音乐';
  }
  for(const label of document.querySelectorAll('.music-current')) {
    label.textContent=track?.title||'未选择音乐';label.title=label.textContent;
  }
  for(const input of document.querySelectorAll('[data-music-volume]'))input.value=Math.round(volume*100);
  for(const output of document.querySelectorAll('[data-music-volume-value]'))output.textContent=`${Math.round(volume*100)}%`;
  for(const row of document.querySelectorAll('[data-action="music-select"]')) {
    const selected=row.dataset.track===track?.id;
    row.setAttribute('aria-pressed',String(selected));
    row.classList.toggle('selected',selected);
    row.querySelector('.music-track-state').textContent=selected?(playing?'播放中':'已暂停'):'';
  }
}
function musicPage() {
  const {track,playing}=musicPlayer.snapshot();
  return head('',L('音乐'))+`<div class="music-list">${musicTracks.map(item=>`<button class="music-track ${track?.id===item.id?'selected':''}" data-action="music-select" data-track="${escape(item.id)}" aria-pressed="${track?.id===item.id}"><span class="music-track-name">${escape(item.title)}</span><span class="music-track-state">${track?.id===item.id?(playing?'播放中':'已暂停'):''}</span></button>`).join('')||'<p>暂无音乐。</p>'}</div>`;
}
document.addEventListener('input',event=>{
  if(event.target.matches('[data-music-volume]'))musicPlayer.setVolume(Number(event.target.value)/100);

});
function render({keepNarration=false}={}) {
  if(!keepNarration)stopNarration();
  document.title=L('诡镇档案');
  document.documentElement.lang = 'zh-CN';
  const menu = view === 'home';
  const scenario = state?.active && database.scenarios[state.active.id];
  root.innerHTML = `<div class="shell ${menu ? 'menu-shell' : ''}">
    ${menu ? '' : `<aside class="sidebar"><a class="brand" href="#home"><strong>${L('诡镇档案')}</strong></a><nav class="nav" aria-label="主导航">${nav().map(([id,icon,label])=>`<button data-action="navigate" data-view="${id}" class="${view===id?'active':''}" ${view===id?'aria-current="page"':''}><span class="nav-icon" aria-hidden="true">${icon}</span>${label}</button>`).join('')}</nav></aside>`}
    <div class="workspace"><header class="topbar"><span class="mobile-brand">${L('诡镇档案')}</span><div class="breadcrumb"><b>${escape(menu ? L('诡镇档案') : scenario ? t(scenario.scenario_name) : L('游戏'))}</b></div><div class="top-actions">${menu||!(storageProblem||externalChange) ? '' : `<span class="save-status ${storageProblem||externalChange?'save-error':''}" role="status">${externalChange?L('请刷新以载入最新记录'):L('保存失败')}</span>`}${musicControls()}</div></header>
      <main class="content ${menu?'menu-content':''}" id="main">${storageProblem||externalChange?`<div class="notice error">${externalChange?L('另一标签页已更新游戏记录，请刷新后继续。'):L('无法读取或保存游戏记录，已有数据未被删除。')}</div>`:''}${renderView()}</main>
    </div></div>`;
  for(const img of root.querySelectorAll('img'))img.addEventListener('error',()=>{
    img.hidden=true;const message=document.createElement('p');message.className='notice';message.textContent=L('卡图未能加载，仍可阅读下方卡牌文字。');img.after(message);
  },{once:true});
  if(keepNarration&&activeNarrationKey) {
    activeNarrationButton=null;
    for(const control of root.querySelectorAll('[data-action="narrate"]')) {
      const scope=control.closest('.board-card, .story-paper');
      const key=[...(scope?.querySelectorAll('[data-narration-id]')||[])].map(node=>node.dataset.narrationId).join('|');
      if(key===activeNarrationKey) {
        activeNarrationButton=control;
        control.textContent='■ 停止配音';control.setAttribute('aria-pressed','true');
      }
    }
  }
}
function head(_eyebrow, heading, sub = '', action = '') {
  return `<div class="page-head"><div><h1>${escape(heading)}</h1>${sub?`<p>${escape(sub)}</p>`:''}</div>${action}</div>`;
}

function renderView() {
  if (view === 'home') return home();
  if (!save) return `<div class="paper empty"><div class="eyebrow">故事由此开始</div><h2>${L('先建立你的战役档案')}</h2><p>${L('加入调查员后，即可记录剧情选择与进度。')}</p>${button(L('建立战役'), 'new', '', 'primary')}</div>`;
  if (view === 'music') return musicPage();
  if (view === 'team') return team();
  if (view === 'log') return log() + historyPanel();
  if (view === 'agenda' || view === 'act') return story();
  return navigationBar()+story();
}
function home() {
  return renderMainMenu(database,library,{L,t,escape,button,blocked:corruptSave||externalChange});
}

function story() {
  const active = state.active;
  if (!active) {
    const next = state.nextScenario;
    if(!next)return head('',L('战役结束'))+`<article class="paper"><h2>${escape(t(campaignOf(database,save.campaignId).name))}</h2>${summaryTeam()}${button(L('查看战役日志'),'navigate','data-view="log"')}</article>`;
    return head('下一章', L('下一段故事')) + `<div class="paper"><div class="eyebrow">${Object.keys(state.completed).length ? '故事继续' : '故事开端'}</div><h2>${escape(title(next))}</h2><p class="muted">${SUPPORTED.includes(next) ? L('继续故事。此前的行动和选择会保留。') : L('该章节的数据已导入，交互流程仍在适配中。你可以查看日志或调整调查员记录。')}</p>${SUPPORTED.includes(next) ? button(L('开始这一章') + ' →', 'start', '', 'primary') : button(L('查看战役日志'), 'navigate', 'data-view="log"')}</div>`;
  }
  const s = database.scenarios[active.id];
  const header = head('敦威治遗产', t(s.scenario_name), '', active.phase === 'play' ? `<div class="actions">${active.id==='the_house_always_wins'||storyActions(database,state).length?button(L('记录行动'), 'story-actions', '', 'small'):''}${button(L('结束调查'), 'resolutions', '', 'small')}</div>` : '');
  if (active.phase === 'play') return header + renderBoard(database, state, {L, escape, button, prose, narratedText});
  const step = current();
  let body;
  if (active.phase === 'ready') {
    body = `<div class="eyebrow">章节完成</div><h2>${L('这一页，即将归档。')}</h2><p>${L('剧情选择和结局效果已记录。确认归档后，将根据各调查员的结束状态追加被击败创伤，并开放下一章。')}</p><div class="notice">${L('结局本身带来的创伤已即时记录；被伤害／恐惧击败造成的创伤，会在此处归档时单独结算。')}</div>${summaryTeam()}<div class="step-footer">${button('← '+L('上一步'), 'previous-step', storyNav().previous===null?'disabled':'', 'small')}${button(L('归档并继续') + ' →', 'finish', '', 'primary')}</div>`;
    if (['dwl_prologue','core_prologue'].includes(active.id)) body = `<div class="eyebrow">最初的线索</div><h2>${L('线索已经明确')}</h2><p>${L('下一章：')}<strong>${escape(title(state.nextScenario||'torch'))}</strong></p><div class="step-footer">${button('← '+L('上一步'), 'previous-step', storyNav().previous===null?'disabled':'', 'small')}${button(L('归档并继续')+' →', 'finish', '', 'primary')}</div>`;
  } else if (step) body = stepContent(step);
  else body = '<p>流程暂不可用。</p>';
  return header + `<article class="paper story-paper">${body}</article>`;
}
function current() {
  const ref = state.active?.queue[0];
  if (ref === '$upgrade_decks') return { id: ref, title: '升级调查员', type: 'upgrade', text: '你可以在调查员面板记录升级所花费的经验，然后继续。' };
  if (ref?.startsWith('@resolution:')) return database.scenarios[state.active.id].resolutions.find(item => item.id === ref.slice(12));
  return database.scenarios[state.active?.id]?.steps.find(item => item.id === ref);
}
function stepContent(step) {
  const phase = state.active.phase;
  const remembered=pendingEvent()?.type==='advance'?pendingEvent().answer:undefined;
  const textTitle = step.title || (step.type === 'story' ? L('故事背景') : step.type === 'encounter_sets' ? L('收集遭遇组') : step.type === 'location_setup' ? '地点布局' : step.input ? L('记录你的选择') : L('故事与记录'));
  const kind=state.active.queue[0]?.startsWith('@resolution:')?'resolution':'step';
  const narrationKey=`scenario:${state.active.id}:${kind}:${step.id}:text`;
  let result = `<div class="eyebrow">${phase === 'setup' ? '开场故事' : '结局与影响'}</div><h2>${escape(t(textTitle))}</h2>${step.text&&hasNarratedText(step.text,narrationKey,database.narrationIndex)?button('▷ 播放配音','narrate','aria-pressed="false"','small'):''}`;
  if (step.text) {
    result += narratedText(step.text,narrationKey);
  }
  if (step.effects?.some(item => item.type === 'campaign_log') && !step.text) result += step.effects.filter(item => item.type === 'campaign_log').map(item => `<div class="log-entry">${prose(item.text)}</div>`).join('');
  const assignment = step.effects?.find(item => item.type === 'add_card');
  if (assignment) {
    const card = database.cards[assignment.card];
    result += `<label style="margin-top:20px">${L('剧情卡持有者')} · ${escape(localizedCard(card).name)}<select id="recipient"><option value="">${L('不加入任何调查员')}</option>${state.investigators.map(item=>`<option value="${item.id}" ${remembered?.recipient===item.id?'selected':''}>${escape(nameOf(item))}</option>`).join('')}</select></label>`;
  }
  const input = step.input;
  if(input?.type==='card_choice'){
    result+=`<div class="record-options">${cultistCards(database,state,input).map(card=>`<label><input type="checkbox" name="cultist" value="${card.code}" ${remembered?.includes?.(card.code)?'checked':''}>${escape(localizedCard(card).name)}</label>`).join('')}</div>`;
  }
  if(input?.type==='scenario_investigators'){
    const killed=state.investigators.filter(i=>i.killed||i.insane);
    const excluded=[...state.investigators.map(i=>i.card),...(state.retired||[])];
    result+=killed.map(i=>`<label>${escape(nameOf(i))} · ${L('选择继任调查员')}<select data-replacement="${i.id}" required><option value="">${L('选择调查员')}</option>${Object.values(database.cards).filter(c=>c.type_code==='investigator'&&/^0[123]\d{3}$/.test(c.code)&&!excluded.includes(c.code)).map(c=>`<option value="${c.code}">${escape(localizedCard(c).name)}</option>`).join('')}</select></label>`).join('');
    if(killed.length===state.investigators.length)result+=button(L('无人继续，结束战役'),'end-campaign','','danger small');
  }
  if(input?.type==='investigator_choice')result+=`<div class="record-options">${state.investigators.map(i=>`<label><input type="checkbox" name="affected-investigator" value="${i.id}" ${remembered?.includes?.(i.id)?'checked':''}>${escape(nameOf(i))}</label>`).join('')}</div>`;
  if(input?.type==='investigator_counter')result+=state.investigators.map(i=>`<label>${escape(nameOf(i))}<input type="number" min="0" max="999" step="1" data-investigator-counter="${i.id}" value="${Number.isSafeInteger(remembered?.[i.id])?remembered[i.id]:0}"></label>`).join('');
  if (input?.type === 'choose_one') {
    result += `<div class="choice-list">${input.choices.map(choice=>`<button class="choice ${remembered===choice.id?'selected':''}" aria-pressed="${remembered===choice.id}" data-action="answer" data-answer="${escape(choice.id)}"><span>◇</span><span>${prose(choice.text)}${choice.description ? prose(choice.description) : ''}</span><span class="arrow">→</span></button>`).join('')}${input.choices.length === 1 ? `<button class="choice ${remembered==='__none'?'selected':''}" aria-pressed="${remembered==='__none'}" data-action="answer" data-answer="__none">${L('没有／否')}<span class="arrow">→</span></button>` : ''}</div>`;
  }
  if (input?.type === 'counter') {
    result += `<div class="counter-input"><label>${escape(t(input.text))}<input type="number" id="counter" min="0" max="${input.max?.type==='constant'?input.max.value:999}" step="1" value="${Number.isSafeInteger(remembered)?remembered:0}" inputmode="numeric"></label></div>`;
    if (input.confirm_text) result += `<div class="notice">${prose(input.confirm_text)}</div>`;
  }
  if (step.type === 'upgrade') result += button(L('打开调查员面板'), 'navigate', 'data-view="team"');

  result += `<div class="step-footer"><span class="step-index">${button('← '+L('上一步'), 'previous-step', storyNav().previous===null?'disabled':'', 'small')}</span>${button(L('下一步')+' →','next-step',input?.type==='choose_one'&&storyNav().next===null?'disabled':'','primary')}</div>`;
  return result;
}
function summaryTeam() {
  return `<div style="margin:25px 0">${state.investigators.map(item=>`<div class="list-item"><span>${escape(nameOf(item))}</span><span class="subtle">${L('经验')} ${item.earned - item.spent} · ${L('肉体')} ${item.physical} · ${L('精神')} ${item.mental}</span></div>`).join('')}</div>`;
}
function showResolutions() {
  const scenario = database.scenarios[state.active.id];
  openModal(L('结束这场调查'), `<p class="subtle">${L('按游戏指示选择结局；确认前不显示结局故事。')}</p><div class="choice-list">${scenario.resolutions.map(item => `<button class="choice" data-action="choose-resolution" data-id="${escape(item.id)}"><span>${escape(t(item.title))}</span><span class="arrow">→</span></button>`).join('')}</div>`);
}
function showStoryActions() {
  if (state.active.id !== 'the_house_always_wins') {
    const actions=storyActions(database,state);
    openModal(L('记录行动'),`<div class="choice-list">${actions.map(a=>button(prose(a.text),'campaign-action',`data-id="${escape(a.id)}"`)).join('')||L('此时没有可记录的额外行动。')}</div>`);return;
  }
  const answer = state.active.actions.cheated;
  openModal(L('记录行动'), `<h3>${L('你们是否使用了“作弊”？')}</h3><p class="subtle">${L('按你们在实体游戏中的行动记录；结局时会使用这项选择。')}</p>${answer !== undefined ? `<p class="subtle">${L('已记录：')}${answer ? L('是') : L('否')}</p>` : ''}<div class="choice-list">${button(L('是，曾经作弊'), 'record-cheat', 'data-value="yes"', 'primary')}${button(L('否，没有作弊'), 'record-cheat', 'data-value="no"')}</div>`);
}
function team() {
  const stats = [['physical', L('肉体创伤')], ['mental', L('精神创伤')], ['earned', L('累计获得经验')], ['spent', L('已使用经验')]];
  return head('调查员记录', L('调查员记录'), L('结局奖励自动计入；升级消耗与额外变化可在这里记录。')) + `<div class="team-grid">${state.investigators.map(item=>`<section class="investigator"><div class="investigator-head">${classIcon(database.cards[item.card] || {})}<div><h3>${escape(nameOf(item))}</h3><small>${item.card || L('自定义调查员')}</small></div></div><div class="stats">${stats.map(([field,label])=>`<div class="stat"><span>${label}</span><div class="number-controls"><button data-action="adjust" data-investigator="${item.id}" data-field="${field}" data-delta="-1" aria-label="${escape(nameOf(item)+' '+label+' -1')}" ${item[field] <= 0 || field === 'earned' && item.earned <= item.spent ? 'disabled' : ''}>−</button><strong>${item[field]}</strong><button data-action="adjust" data-investigator="${item.id}" data-field="${field}" data-delta="1" aria-label="${escape(nameOf(item)+' '+label+' +1')}" ${field === 'spent' && item.spent >= item.earned || item[field] >= 999 ? 'disabled' : ''}>+</button></div></div>`).join('')}</div>${item.storyCards.length ? `<p class="subtle" style="margin-top:22px">${L('剧情卡')}：${item.storyCards.map(code=>escape(localizedCard(database.cards[code]).name||code)).join(' · ')}</p>` : ''}<div class="xp-balance"><span>${L('可用经验')}</span><strong>${item.earned-item.spent} <small>经验</small></strong></div></section>`).join('')}</div><div class="notice">${L('此处记录的是长期创伤，并非本局的伤害／恐惧。误操作可在战役日志撤销最近一次操作。')}</div>${button(L('回到剧情流程')+' →','navigate','data-view="story"')}`;
}
function logText(item){
  const section=campaignOf(database,save.campaignId).campaign_log?.find(s=>s.id===item.section);
  if(item.value!==undefined)return `${escape(t(section?.title||item.section))} · ${item.id==='brood_escaped'?prose(item.text):item.value}`;
  if(item.card&&database.cards[item.card]){
    const name=localizedCard(database.cards[item.card]).name;
    const template=item.masculine_text;
    return `${section?`<small>${escape(t(section.title))}</small> · `:''}${template?prose(t(template).replaceAll('#name#',name),false):escape(name)}`;
  }
  return prose(item.text||item.id);
}
function log() {
  const entries=Object.values(state.log).filter(item=>item.section!=='hidden');
  return head('',L('战役日志'),'',`<div class="actions">${button(L('撤销'),'undo',storyNav().previousAction===null?'disabled':'','small')}${button(L('重做'),'redo',storyNav().nextAction===null?'disabled':'','small')}</div>`)+`<article class="paper">${entries.length?entries.map(item=>`<div class="log-entry" ${item.crossed?'style="text-decoration:line-through"':''}>${logText(item)}</div>`).join(''):`<p class="muted">${L('暂无战役记录')}</p>`}${state.tokens.length?`<div class="notice">${L('加入的混乱标记')}：${state.tokens.map(token=>prose(`[${token}]`,false)).join(' ')}</div>`:''}</article><div class="section-title"><h2>${L('进度')}</h2></div><div class="paper">${Object.entries(state.completed).map(([id,result])=>`<div class="list-item"><span>${escape(title(id))}</span><span class="pill">${result.resolution?escape(result.resolution.replace(/^R/, '结局 ')):L('已完成')}</span></div>`).join('')}${state.active?`<div class="list-item"><span>${escape(title(state.active.id))}</span><span class="pill amber">${L('进行中')}</span></div>`:''}</div>`;
}

async function newCampaign() {
  if(externalChange)throw Error(L('请刷新以载入最新游戏记录。'));
  if(corruptSave)throw Error(L('暂时无法读取游戏历史，已有数据未被删除。'));
  openModal(L('开始新游戏'),renderNewPlayForm(database,{L,t,escape,button},rosterRow()));
}
function rosterRow() {
  const investigators=Object.values(database.cards).filter(card=>card.type_code==='investigator'&&/^(01|02|03)\d{3}$/.test(card.code));
  return `<div class="roster-row"><input type="hidden" name="investigator" value=""><details class="investigator-picker"><summary>${L('选择调查员')}</summary><div class="investigator-options" role="group" aria-label="${L('调查员')}">${investigators.map(card=>`<button type="button" data-action="choose-investigator" data-code="${card.code}">${classIcon(card)}<span>${escape(localizedCard(card).name)}</span></button>`).join('')}</div></details><button type="button" data-action="remove-roster" aria-label="${L('移除调查员')}">×</button></div>`;
}
function classIcon(card) {
  const faction=['guardian','seeker','rogue','mystic','survivor'].includes(card.faction_code)?card.faction_code:'neutral';
  return `<span class="class-icon ${faction}" aria-hidden="true">${faction==='neutral'?'◇':`<span style="mask-image:url('assets/classes/${faction}.svg');-webkit-mask-image:url('assets/classes/${faction}.svg')"></span>`}</span>`;
}

function chooseResolution(id) {
  const s = database.scenarios[state.active.id], res = s.resolutions.find(item=>item.id===id);
  const remembered=pendingEvent()?.type==='resolution'&&pendingEvent().id===id?pendingEvent().statuses:{};
  resolutionCandidate = id;
  openModal(L('确认进入结局'), `<p>${escape(t(s.scenario_name))} · <strong>${escape(t(res.title))}</strong></p>${res.description ? `<div class="notice">${prose(res.description)}</div>` : ''}<p class="subtle">${L('请按实体游戏结果记录每位调查员的状态。被伤害／恐惧击败产生的创伤将在本章归档时结算。')}</p><form id="resolution-form">${['core','ptc'].includes(save.campaignId)?`<label>${L('本关调查队长')}<select name="lead" required>${state.investigators.map(i=>`<option value="${i.id}">${escape(nameOf(i))}</option>`).join('')}</select></label>`:''}<div class="resolution-form">${state.investigators.map(item=>`<label class="status-row"><span>${escape(nameOf(item))}</span><select name="${item.id}" required><option value="">${L('选择结束状态')}</option>${[['survived',L('存活／完成目标')],['resigned',L('撤退')],['physical',L('伤害击败（+1 肉体创伤）')],['mental',L('恐惧击败（+1 精神创伤）')],['both',L('同时被伤害与恐惧击败（两种创伤各 +1）')],['eliminated',L('其他方式退场（请按卡牌另记创伤）')]].filter(([value])=>allowedStatuses(res).includes(value)).map(([value,text])=>`<option value="${value}" ${remembered[item.id]===value?'selected':''}>${text}</option>`).join('')}</select></label>`).join('')}</div><div class="form-actions"><button type="button" class="button" data-action="close-modal">${L('取消')}</button><button class="button primary" type="submit">${L('确认并揭示结局')} →</button></div></form>`);
}
function historyPanel() {
  const entries = state.history.filter(item => ['step','action'].includes(item.type) && item.answer !== undefined);
  return `<div class="section-title"><h2>${L('选择与结算记录')}</h2></div><div class="paper">${entries.length ? entries.map(item => {
    const step=database.scenarios[item.scenario]?.steps.find(step=>step.id===item.step);
    const choice=step?.input?.choices?.find(choice=>choice.id===item.answer);
    const answer=choice?.text || (item.answer==='__none'?L('没有／否'):typeof item.answer==='boolean'?L(item.answer?'是，曾经作弊':'否，没有作弊'):typeof item.answer==='number'?String(item.answer):item.answer?.recipient?nameOf(state.investigators.find(i=>i.id===item.answer.recipient)||{name:''}):L('不加入'));
    return `<div class="history-item"><small>${escape(title(item.scenario))} · ${escape(t(step?.input?.text || step?.title || L('剧情选择')))}</small>${prose(answer)}</div>`;
  }).join('') : `<p class="muted">${L('尚未记录选择或结算。')}</p>`}</div>`;
}
document.addEventListener('click',async event=>{
  const el=event.target.closest('[data-action]');if(!el)return;
  try {
    switch(el.dataset.action) {
      case 'music-toggle': await musicPlayer.toggle(musicTracks.find(item=>item.default));break;
      case 'music-select': await musicPlayer.select(musicTracks.find(track=>track.id===el.dataset.track));break;
      case 'navigate': view=el.dataset.view;render({keepNarration:view!=='home'});window.scrollTo(0,0);break;
      case 'new': if(modal.open)modal.close();await newCampaign();break;
      case 'close-modal':modal.close();resolutionCandidate=null;break;
      case 'previous-step':goTo(storyNav().previous);break;
      case 'next-step':nextStep();break;
      case 'redo':goTo(storyNav().nextAction);break;
      case 'resume-play': {
        if(externalChange)throw Error(L('请刷新以载入最新游戏记录。'));
        const play=library.plays.find(play=>play.id===el.dataset.id);
        if(!play)throw Error(L('找不到这场游戏。'));
        persist(play.save,{playId:play.id});view='story';render();window.scrollTo(0,0);break;
      }
      case 'delete-play':case 'restore-play': {
        if(externalChange)throw Error(L('请先刷新以载入最新记录。'));
        stopNarration();
        const deleting=el.dataset.action==='delete-play';
        library=deleting?deletePlay(localStorage,library,el.dataset.id):restorePlay(localStorage,library,el.dataset.id);
        loadActivePlay();view='home';render();
        break;
      }
      case 'start':dispatch({type:'start',scenario:state.nextScenario});break;
      case 'end-campaign':dispatch({type:'advance',answer:{endCampaign:true}});break;
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
        stopNarration();
        const action=el.dataset.action==='flip-card'?'flip':el.dataset.action==='previous-card'?'previous':'next';
        persist(browseCard(database,save,el.dataset.deck,action));render();break;
      }
      case 'resolutions':showResolutions();break;
      case 'story-actions':showStoryActions();break;
      case 'campaign-action':dispatch({type:'story_action',id:el.dataset.id});modal.close();break;
      case 'record-cheat':dispatch({type:'record_action',id:'cheated',value:el.dataset.value==='yes'});modal.close();break;
      case 'narrate': {
        const sameButton=activeNarrationButton===el;
        stopNarration();
        if(sameButton)break;
        const scope=el.closest('.board-card, .story-paper');
        const ids=[...(scope?.querySelectorAll('[data-narration-id]')||[])].map(node=>node.dataset.narrationId);
        const clips=narrationClips(database.narrationIndex,ids);
        if(!clips.length)break;
        narrationPlayer.play(clips);
        activeNarrationButton=el;
        activeNarrationKey=ids.join('|');
        el.textContent='■ 停止配音';el.setAttribute('aria-pressed','true');
        break;
      }
      case 'reveal-card': {
        dispatch({type:'reveal',card:el.dataset.card,side:el.dataset.side});break;
      }
      case 'undo':goTo(storyNav().previousAction);break;
      case 'add-roster':if(document.querySelectorAll('.roster-row').length<4)document.getElementById('roster').insertAdjacentHTML('beforeend',rosterRow());break;
      case 'choose-investigator': {
        const row=el.closest('.roster-row'),card=database.cards[el.dataset.code];
        row.querySelector('input[name="investigator"]').value=card.code;
        row.querySelector('summary').innerHTML=classIcon(card)+`<span>${escape(localizedCard(card).name)}</span>`;
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
      const campaignId=form.get('expansion'),campaign=database.campaigns[campaignId];if(!campaign)throw Error('无效扩展');
      const codes=form.getAll('investigator');
      if(new Set(codes).size!==codes.length)throw Error(L('调查员不能重复'));
      const investigators=codes.map(code=>{
        const card=database.cards[code];
        if(!card||card.type_code!=='investigator'||!/^(01|02|03)\d{3}$/.test(code))throw Error('请选择有效调查员');
        return {name:localizedCard(card).name,card:card.code};
      });
      let next=createSave(investigators,t(campaign.name),database.campaignSources[campaignId],campaignId);
      next=commit(database,next,{type:'start',scenario:campaign.scenarios[0]});
      persist(next,{create:true});view='story';modal.close();render();
    }else{
      const id=resolutionCandidate;
      const statuses=Object.fromEntries(form.entries());
      dispatch({type:'resolution',id,statuses,...(['core','ptc'].includes(save.campaignId)?{lead:form.get('lead')}: {})});modal.close();
    }
    window.scrollTo(0,0);
  }catch(error){toast(error.message)}
});
window.addEventListener('hashchange',()=>{if(location.hash==='#home'){view='home';render()}});
document.addEventListener('change',event=>{
  try{
    if(event.target.matches('[data-action="jump-chapter"]')&&event.target.value)goTo(Number(event.target.value));
    if(event.target.matches('[data-action="card-version"]')){
      if(externalChange)throw Error(L('请先刷新以载入最新记录。'));
      persist(chooseCardVersion(database,save,event.target.dataset.deck,event.target.value));render();
    }
  }catch(error){toast(error.message)}
});
window.addEventListener('storage',event=>{if(event.key===HISTORY_KEY){externalChange=true;render();toast(L('另一标签页更新了存档，请刷新后继续。'))}});
async function init(){
  try {
    const [dunwich,core,carcosa,manifest,audio]=await Promise.all(['data/dwl.json','data/core.json','data/ptc.json','data/narration/index.json','data/narration/audio.json'].map(async path=>{
      const response=await fetch(path);if(!response.ok)throw Error(`数据加载失败：${path}`);return response.json();
    }));
    database=mergeCampaigns(dunwich,core,carcosa);
    database.narrationIndex=createNarrationIndex(manifest,audio);
    try { const response=await fetch('data/music.json');if(response.ok)musicTracks=await response.json(); } catch(error) { console.warn('Music list unavailable:',error); }
    readStorage();render();
  } catch(error) {
    root.innerHTML=`<main class="content"><div class="paper"><h1>档案暂时无法打开</h1><p>请通过本地服务器打开网站，并确认内容与配音索引文件存在。</p><p>${escape(error.message)}</p></div></main>`;
  }
}
await init();
