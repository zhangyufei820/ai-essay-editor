import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../src-patch/web/classic/src');
const registry=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path.join(root,'constants/billing.constants.js'),'utf8')).toString('base64'));
const utils=fs.readFileSync(path.join(root,'helpers/utils.jsx'),'utf8');
const render=fs.readFileSync(path.join(root,'helpers/render.jsx'),'utf8');
const context=vm.createContext({...registry,getPricingDisplayOverride:()=>null});
vm.runInContext(utils.slice(utils.indexOf('export const calculateModelPrice ='),utils.indexOf('export const getModelPriceItems =')).replace('export const calculateModelPrice =','globalThis.calculateModelPrice ='),context);
vm.runInContext(render.slice(render.indexOf('export function stripExprVersion'),render.indexOf('export const decodeFromBase64')).replace(/^export /gm,''),context);
for (const model of ['gpt-6.2-sol','gpt-6.2-astra']) {
 for (const selectedGroup of ['default','discount','plus','special','all']) {
  const result=context.calculateModelPrice({record:{model_name:model,enable_groups:['discount','plus','default','special'],billing_mode:'tiered_expr',billing_expr:'test'},selectedGroup,groupRatio:{default:1,discount:.25,plus:.5,special:.01}});
  assert.equal(result.usedGroupRatio,1);
  assert.equal(result.isDynamicPricing,true);
 }
}
const tiers=context.parseTiersFromExpr('len <= 272000 ? tier("base", p * 0.27397260274 + c * 1.369863013699 + cr * 0.013698630137 + cc * 0.342465753425 + cc12h * 0.684931506849) : tier("longcontext", p * 0.547945205479 + c * 2.054794520548 + cr * 0.027397260274 + cc * 0.684931506849 + cc12h * 1.369863013699)');
assert.equal(tiers.length,2);
assert.equal(tiers[0].conditions[0].value,272000);
assert.ok(Math.abs(tiers[0].cacheCreate12hPrice*7.3-5)<1e-8);
assert.ok(Math.abs(tiers[1].cacheCreate12hPrice*7.3-10)<1e-8);
assert.ok(registry.BILLING_PRICING_VARS.some(x=>x.key==='cc12h'&&x.shortLabel.includes('12小时')));
console.log('GPT-6.2 pricing UI: fixed 1X, 272000 boundary, 12h price parsing passed');
