import { mkdir, writeFile, readFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const headers = { 'User-Agent': 'AHLCG-Narrator-local-import' };
const exec = promisify(execFile);
async function downloadImage(url, target) {
  if (process.platform === 'win32') {
    // Use the OS network stack, which observes Windows proxy configuration.
    await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference='Stop'; Invoke-WebRequest -UseBasicParsing -Uri $env:AHLCG_IMAGE_URL -OutFile $env:AHLCG_IMAGE_TARGET"], {
      windowsHide: true, env: { ...process.env, AHLCG_IMAGE_URL: url, AHLCG_IMAGE_TARGET: target }, timeout: 60000,
    });
    const bytes = await readFile(target);
    if (bytes.subarray(0,8).toString('hex') !== '89504e470d0a1a0a' && bytes.subarray(0,3).toString('hex') !== 'ffd8ff') throw Error(`Invalid card image: ${url}`);
    return bytes;
  }
  const response = await fetch(url, { headers });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw Error(`Card image unavailable: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(target, bytes);
  return bytes;
}
async function request(url, json = true) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw Error(`${response.status}: ${url}`);
  return json ? response.json() : response.text();
}
async function save(name, data) {
  const target = path.join(root, name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n');
}
export function parsePO(source) {
  const result = {};
  let id = '', translation = '', mode = '', fuzzy = false;
  function flush() { if (id && translation && !fuzzy) result[id] = translation; id = ''; translation = ''; mode = ''; fuzzy = false; }
  for (const line of (source + '\n\n').split(/\r?\n/)) {
    if (!line.trim()) { flush(); continue; }
    if (line.startsWith('#,') && line.includes('fuzzy')) fuzzy = true;
    const match = line.match(/^(msgid|msgstr)\s+(".*")$/);
    if (match) { mode = match[1]; const value = JSON.parse(match[2]); if (mode === 'msgid') id = value; else translation = value; }
    else if (line.startsWith('"')) { const value = JSON.parse(line); if (mode === 'msgid') id += value; else if (mode === 'msgstr') translation += value; }
  }
  return result;
}
async function main() {
  const records = [];
  const repositories = ['zzorba/arkham-cards-data', 'zzorba/arkhamdb-json-data'];
  const snapshots = [];
  const campaignFiles = {}, translations = {}, cards = [], translatedCards = {zh:[], 'zh-cn':[]};
  for (const repository of repositories) {
    const commit = await request(`https://api.github.com/repos/${repository}/commits/master`);
    snapshots.push({ repository, commit: commit.sha, license: 'No root license identified; upstream game content rights remain with their owners.' });
    const tree = await request(`https://api.github.com/repos/${repository}/git/trees/${commit.sha}?recursive=1`);
    const selected = tree.tree.filter(item => item.type === 'blob' && (repository.endsWith('arkham-cards-data')
      ? /^(campaigns\/dwl\/.*\.json|i18n\/(zh-cn|zh)\/(campaigns\/dwl\/.*|encounter_sets)\.po|schema\/.*\.json)$/.test(item.path) || ['README.md', 'encounter_sets.json'].includes(item.path)
      : /^(pack\/(dwl|core)\/.*\.json|translations\/(zh|zh-cn)\/pack\/(dwl|core)\/.*\.json)$/.test(item.path) || item.path === 'README.md'));
    for (let offset = 0; offset < selected.length; offset += 8) {
      await Promise.all(selected.slice(offset, offset + 8).map(async item => {
        const url = `https://raw.githubusercontent.com/${repository}/${commit.sha}/${item.path}`;
        const source = await request(url, false);
        await save(`data/upstream/${repository.split('/')[1]}/${item.path}`, source);
        records.push({ repository, path: item.path, sha256: createHash('sha256').update(source).digest('hex'), url });
        if (item.path.startsWith('campaigns/dwl/')) campaignFiles[item.path.split('/').at(-1).replace('.json', '')] = JSON.parse(source);
        if (item.path.endsWith('.po')) {
          const locale = item.path.split('/')[1]; translations[locale] ??= {}; Object.assign(translations[locale], parsePO(source));
        }
        if (repository.endsWith('arkhamdb-json-data') && item.path.endsWith('.json')) {
          if (item.path.startsWith('pack/')) cards.push(...JSON.parse(source));
          else if (item.path.startsWith('translations/')) translatedCards[item.path.split('/')[1]].push(...JSON.parse(source));
        }
      }));
    }
  }
  const cardTranslation = Object.fromEntries(Object.entries(translatedCards).map(([locale,cards])=>[locale,Object.fromEntries(cards.map(card=>[card.code,card]))]));
  const catalog = Object.fromEntries(cards.map(card => [card.code, {
    ...card,
    zh: cardTranslation.zh[card.code] || null,
    zh_cn: cardTranslation['zh-cn'][card.code] || null,
    images: {
      front: `https://arkhamdb.com/bundles/cards/${card.code}.png`,
      back: card.double_sided ? `https://arkhamdb.com/bundles/cards/${card.code}b.png` : null,
      language: 'en', downloaded: false,
    },
    audio: { en: null, 'zh-cn': null },
  }]));
  const supported = ['the_house_always_wins', 'extracurricular_activity'];
  const imageCards = Object.values(catalog).filter(card => supported.includes(card.encounter_code) && ['agenda', 'act'].includes(card.type_code));
  const imageChecks = [];
  for (let offset = 0; offset < imageCards.length; offset += 4) {
    await Promise.all(imageCards.slice(offset, offset + 4).map(async card => {
      for (const side of ['front', 'back']) {
        const url = card.images[side];
        if (!url) continue;
        let name = `assets/cards/${card.code}${side === 'back' ? 'b' : ''}.png`;
        await mkdir(path.join(root, 'assets/cards'), { recursive: true });
        const bytes = await downloadImage(url, path.join(root, name));
        if (bytes.subarray(0,3).toString('hex') === 'ffd8ff') {
          const jpegName = name.replace('.png', '.jpg');
          await rename(path.join(root, name), path.join(root, jpegName));
          name = jpegName;
        }
        card.images[side] = name;
        imageChecks.push({ code: card.code, side, url, path: name, sha256: createHash('sha256').update(bytes).digest('hex') });
      }
      card.images.downloaded = true;
    }));
  }
  const database = { version: 1, campaign: campaignFiles.campaign,
    scenarios: Object.fromEntries(Object.values(campaignFiles).filter(item => item.id && item.id !== 'dwl').map(item => [item.id, item])),
    translations, cards: catalog, encounterSets: JSON.parse(await request(`https://raw.githubusercontent.com/zzorba/arkham-cards-data/${snapshots[0].commit}/encounter_sets.json`, false)),
    interactiveScenarios: supported,
    sources: snapshots,
    cardTranslationSources:{'zh-cn':{repository:repositories[1],commit:snapshots[1].commit}},
  };
  await save('data/dwl.json', database);
  await save('data/sources.json', { importedAt: new Date().toISOString(), snapshots, files: records.sort((a,b) => a.path.localeCompare(b.path)), images: imageChecks });
  const report = { scenarios: Object.keys(database.scenarios), interactiveScenarios: supported, cards: cards.length,
    agendaAndActCards: cards.filter(card => ['agenda', 'act'].includes(card.type_code)).length,
    translations: Object.fromEntries(Object.entries(translations).map(([locale, values]) => [locale, Object.keys(values).length])),
    localCardImages: imageChecks.length,
    images: 'English card images for interactive scenarios are stored locally. Cards retain separate upstream zh-cn and zh catalogs; no character conversion is performed.',
  };
  await save('data/import-report.json', report);
  console.log(JSON.stringify(report, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
