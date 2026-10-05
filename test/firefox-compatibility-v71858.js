const fs=require('fs'), path=require('path');
const root=path.join(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const reader=fs.readFileSync(path.join(root,'reader','reader.js'),'utf8');
const runtime=fs.readFileSync(path.join(root,'reader','readest-runtime.js'),'utf8');
function assert(c,m){if(!c)throw new Error(m)}
assert(manifest.manifest_version===2,'Firefox baseline must remain Manifest V2');
assert(manifest.browser_specific_settings&&manifest.browser_specific_settings.gecko,'gecko settings missing');
assert(manifest.browser_specific_settings.gecko.strict_min_version==='115.0','Firefox minimum must be 115.0 ESR');
assert(manifest.browser_specific_settings.gecko.data_collection_permissions.required[0]==='none','offline data declaration missing');
assert(!manifest.browser_specific_settings.gecko.strict_max_version,'Do not cap future Firefox versions');
assert(reader.includes('position:existing&&existing.position?existing.position:buildIndependentPosition(s),positionVersion:3,'),'content annotation write path still uses v2');
assert(runtime.includes('if(annotationMode)return null;'),'annotation restore must fail closed');
assert(runtime.includes('if(annotationMode)return null;') && reader.includes('{annotation:true}'),'annotation calls must use strict mode');
assert(reader.includes('positionVersion:3'),'highlight/bookmark/note writes must use v3');
console.log('Firefox compatibility + annotation contract v7.18.58: PASS');
