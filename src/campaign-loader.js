export async function fetchJson(path, {fetcher=fetch, timeout=30000}={}) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try {
    const response=await fetcher(path,{signal:controller.signal});
    if(!response.ok)throw Error('HTTP '+response.status);
    return await response.json();
  } catch(error) {
    throw Error('无法加载 '+path+'（'+(error.name==='AbortError'?'请求超时':error.message)+'）');
  } finally { clearTimeout(timer); }
}

export function createCampaignLoader(catalog, {fetcher=fetch}={}) {
  const cache=new Map();
  return async function load(id) {
    if(cache.has(id))return cache.get(id);
    const path=catalog.bundles[id];
    if(!path)throw Error('找不到战役数据');
    const data=await fetchJson(path,{fetcher});
    for(const field of ['hiddenSetup','physicalInstructions']) {
      data[field]=Object.fromEntries(Object.entries(data[field]).map(([key,ids])=>[key,new Set(ids)]));
    }
    data.scenarios={...catalog.scenarios,...data.scenarios};
    data.cards={...catalog.cards,...data.cards};
    data.campaigns={...catalog.campaigns,...data.campaigns};
    data.bundles=catalog.bundles;
    data.loadedCampaign=id;
    cache.set(id,data);
    return data;
  };
}
