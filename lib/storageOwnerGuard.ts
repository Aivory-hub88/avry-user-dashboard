/**
 * Cross-account localStorage guard.
 *
 * Most dashboard caches live under GLOBAL localStorage keys (deep diagnostic
 * context and progress, n8n credentials, workflow drafts, legacy `user_id` /
 * `user_data` / `auth_token`). The dashboard's own logout sweeps them, but the
 * landing page (same origin, aivory.uk) can sign a different account in, or
 * create a new one, without that sweep. The next dashboard load then showed
 * the previous account's "Report ready", saved progress and n8n URL + API key
 * to the new account (found 2026-11-12 with a fresh free account).
 *
 * This runs as an inline <head> script, before React hydrates, so no reader
 * can see a foreign value first: when the signed-in user (aivory_auth) is not
 * the user who owns the cache (aivory_storage_owner), every account-bound key
 * is removed and ownership passes to the current user. Keys namespaced per
 * user (`…__u_<id>`, lib/userScopedStorage) are kept: they are already safe.
 *
 * Plain ES5 string on purpose: it ships verbatim into the page.
 */

export const STORAGE_OWNER_KEY = 'aivory_storage_owner'

export const STORAGE_OWNER_GUARD_JS = `(function(){try{
var ls=window.localStorage,raw=ls.getItem('aivory_auth'),uid=null;
if(raw){try{var s=JSON.parse(raw);uid=s&&s.user&&typeof s.user.id==='string'&&s.user.id?s.user.id:null}catch(e){}}
if(!uid)return;
var owner=ls.getItem('${STORAGE_OWNER_KEY}');
if(owner===uid)return;
var keep={'aivory_auth':1,'aivory_locale':1,'${STORAGE_OWNER_KEY}':1,'aivory_sidebar_collapsed':1,'aivory_rail_collapsed':1,'aivory_agent_column_collapsed':1,'aivory_fx_rates_v1':1};
var legacy={'auth_token':1,'user_data':1,'user_id':1,'user_tier':1,'pendingWorkflowSpec':1,'hasSeenWorkflowOnboarding':1};
var drop=[];
for(var i=0;i<ls.length;i++){var k=ls.key(i);if(!k||keep[k]||k.indexOf('__u_')!==-1)continue;
if(legacy[k]||k.indexOf('aivory')===0||k.indexOf('settings_')===0)drop.push(k)}
for(var j=0;j<drop.length;j++)ls.removeItem(drop[j]);
ls.setItem('${STORAGE_OWNER_KEY}',uid);
}catch(e){}})();`
