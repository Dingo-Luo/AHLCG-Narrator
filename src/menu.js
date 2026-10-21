import { replay } from './engine.js';
import { investigatorName } from './localization.js';

export function renderMainMenu(database, library, { L, t, escape, button, locale, blocked = false }) {
  const date = value => new Date(value).toLocaleString(locale === 'en' ? 'en-GB' : 'zh-CN', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
  const plays = [...library.plays].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  return `<div class="menu-heading"><h1>${L('游戏', 'Games')}</h1>${button(L('开始新游戏', 'New game'), 'new', blocked ? 'disabled' : '', 'primary')}</div>
    <section class="play-history" aria-label="${L('历史游戏', 'Previous games')}">${plays.length ? plays.map(play => {
      let progress, unavailable = false;
      try {
        const state = replay(database, play.save);
        const id = state.active?.id || state.nextScenario;
        progress = t(database.scenarios[id]?.scenario_name || L('已完成', 'Complete'));
      } catch { unavailable = true; progress = L('此记录暂时无法打开', 'This game is currently unavailable'); }
      return `<article class="play-row"><div class="play-info"><h2>${escape(t(database.campaign.name))}</h2><p>${escape(play.save.investigators.map(item=>investigatorName(database,item,locale)).join('、'))}</p><p class="play-meta"><time datetime="${escape(play.updatedAt)}">${escape(date(play.updatedAt))}</time><span>·</span>${escape(progress)}</p></div><div class="play-actions">${button(L('继续', 'Continue'), 'resume-play', `data-id="${escape(play.id)}" ${unavailable || blocked ? 'disabled' : ''}`)}${button(L('删除','Delete'),'delete-play',`data-id="${escape(play.id)}" ${blocked?'disabled':''}`,'danger small')}</div></article>`;
    }).join('') : `<p class="empty-history">${L('暂无历史游戏', 'No previous games')}</p>`}</section>${library.deleted?.length?`<button class="text-button restore-deletion" data-action="restore-play" data-id="${escape(library.deleted.at(-1).id)}" ${blocked?'disabled':''}>${L('撤销上次删除','Undo last deletion')}</button>`:''}`;
}

export function renderNewPlayForm(database, { L, t, escape, button }, row) {
  return `<form id="new-form"><label>${L('扩展', 'Expansion')}<select name="expansion" required><option value="dwl">${escape(t(database.campaign.name))}</option></select></label>
    <label class="difficulty-field">${L('难度','Difficulty')}<select name="difficulty" required>${[['easy',L('简单','Easy')],['standard',L('标准','Standard')],['hard',L('困难','Hard')],['expert',L('专家','Expert')]].map(([value,label])=>`<option value="${value}" ${value==='standard'?'selected':''}>${label}</option>`).join('')}</select></label>
    <div class="section-title"><h2>${L('调查员', 'Investigators')}</h2></div><div id="roster">${row}</div>
    ${button('+ '+L('加入调查员', 'Add investigator'), 'add-roster', 'type="button"', 'small')}
    <div class="form-actions"><button class="button" type="button" data-action="close-modal">${L('取消', 'Cancel')}</button><button class="button primary" type="submit">${L('开始游戏', 'Start game')}</button></div></form>`;
}
