import { replay } from './engine.js';
import { investigatorName } from './localization.js';
import {campaignOf} from './content.js';

export function renderMainMenu(database, library, { L, t, escape, button, blocked = false }) {
  const date = value => new Date(value).toLocaleString('zh-CN', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
  const plays = [...library.plays].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  return `<div class="menu-heading"><h1>${L('游戏')}</h1>${button(L('开始新游戏'), 'new', blocked ? 'disabled' : '', 'primary')}</div>
    <section class="play-history" aria-label="${L('历史游戏')}">${plays.length ? plays.map(play => {
      let progress, unavailable = false,roster=play.save.investigators;
      try {
        const state = replay(database, play.save);
        roster=state.investigators;
        const id = state.active?.id || state.nextScenario;
        progress = t(database.scenarios[id]?.scenario_name || L('已完成'));
      } catch { unavailable = true; progress = L('此记录暂时无法打开'); }
      return `<article class="play-row"><div class="play-info"><h2>${escape(t(campaignOf(database,play.save.campaignId).name))}</h2><p>${escape(roster.map(item=>investigatorName(database,item)).join('、'))}</p><p class="play-meta"><time datetime="${escape(play.updatedAt)}">${escape(date(play.updatedAt))}</time><span>·</span>${escape(progress)}</p></div><div class="play-actions">${button(L('继续'), 'resume-play', `data-id="${escape(play.id)}" ${unavailable || blocked ? 'disabled' : ''}`)}${button(L('删除'),'delete-play',`data-id="${escape(play.id)}" ${blocked?'disabled':''}`,'danger small')}</div></article>`;
    }).join('') : `<p class="empty-history">${L('暂无历史游戏')}</p>`}</section>${library.deleted?.length?`<button class="text-button restore-deletion" data-action="restore-play" data-id="${escape(library.deleted.at(-1).id)}" ${blocked?'disabled':''}>${L('撤销上次删除')}</button>`:''}`;
}

export function renderNewPlayForm(database, { L, t, escape, button }, row) {
  return `<form id="new-form"><label>${L('扩展')}<select name="expansion" required>${Object.entries(database.campaigns||{dwl:database.campaign}).map(([id,campaign])=>`<option value="${id}">${escape(t(campaign.name))}</option>`).join('')}</select></label>
    <div class="section-title"><h2>${L('调查员')}</h2></div><div id="roster">${row}</div>
    ${button('+ '+L('加入调查员'), 'add-roster', 'type="button"', 'small')}
    <div class="form-actions"><button class="button" type="button" data-action="close-modal">${L('取消')}</button><button class="button primary" type="submit">${L('开始游戏')}</button></div></form>`;
}
