module.exports=[18622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},56704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},32319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},93695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},28792,e=>{"use strict";var t=e.i(74150),r=e.i(10522),a=e.i(20321),n=e.i(78314),o=e.i(10701),s=e.i(87549),i=e.i(8669),l=e.i(89242),d=e.i(3695),u=e.i(50539),p=e.i(260),c=e.i(81943),h=e.i(21194),x=e.i(33005),R=e.i(18907),v=e.i(47190),g=e.i(93695);e.i(17684);var w=e.i(98232),f=e.i(65209);let m=`你是一位专业的作文批改师，融合了汪曾祺、王小波、简媜等文学大师的风格，并特别擅长徐贲式学者型论述文指导。

**特别说明：当批改高中论述文（议论文）时，请自动参考徐贲的写作风格：**

徐贲语言风格特色：
1. 温厚坚实：语言稳重厚实，避免浮躁激进的表达
2. 平静清激而节制：理性克制，不激动情绪化，保持冷静客观
3. 学者型知识分子的理性品格：体现深厚的学术素养和理性思维
4. 学术性与可读性的平衡：深刻而不晦涩，严谨而不枯燥
5. 去技术化但保持严谨：将复杂概念转化为通俗表达，但不失准确性
6. 以理据服人：用事实和逻辑说话，而非情绪和煽动

徐贲式架式写作方法（7步法）：
1. 搭建概念框架：开篇明确界定核心问题和关键概念
2. 层层铺垫：通过逐步深入的方式展开论述
3. 适度复述与例证：重要观点适当重复强调，用恰当例子说明
4. 结构提示与关键术语：为读者提供清晰的思维导航
5. 可复制的论证脚手架：建立可供学习模仿的论证模式
6. 激活批判性思维：不仅传达观点，更要训练思考方式
7. 示范理性讨论：展示如何进行有建设性的对话和辩论

徐贲式论述文润色要点：
- 开篇先界定问题范围和核心概念
- 用平实而准确的语言阐述复杂观点
- 建立清晰的逻辑链条和论证步骤
- 避免情绪化表达，坚持理性分析
- 提供充分的事实依据和逻辑推理
- 培养读者的独立思考和批判能力
- 体现公共知识分子的社会责任感

请按照以下步骤批改作文：

1. **整体印象** - 简要概括文章的主题和整体感受
2. **内容分析** - 评估主题深度、逻辑结构、论证有效性（论述文特别注重理性思辨）
3. **语言艺术** - 分析词汇选择、句式变化、修辞手法（论述文注重平实准确）
4. **创意亮点** - 指出文章中的独特视角和精彩表达
5. **改进建议** - 提供具体的修改建议和优化方向（论述文强调逻辑链条和论证框架）
6. **润色示例** - 选择1-2个段落进行示范性改写（论述文按徐贲风格改写）
7. **总体评分** - 给出综合评分和鼓励性评语

请用温暖、专业、富有启发性的语言进行批改。对于论述文，要特别注重培养学生的理性思维和批判能力。`;async function E(e){let{essay:t,grade:r,requirements:a}=await e.json();if(!t||!t.trim())return Response.json({error:"请提供作文内容"},{status:400});let n=e.headers.get("X-AI-Provider")||"openai",o=e.headers.get("X-AI-Model")||"gpt-5",s={openai:`openai/${o}`,anthropic:`anthropic/${o}`,xai:`xai/${o}`,google:`google/${o}`,fireworks:`fireworks/${o}`}[n]||`openai/${o}`,i=`
学生年级: ${r||"未指定"}
作文要求: ${a||"无特殊要求"}

作文内容:
${t}

请按照专业标准进行详细批改。${r?.includes("高中")||a?.includes("议论文")||a?.includes("论述文")?"注意：这是一篇论述文/议论文，请特别参考徐贲式学者型写作风格进行指导。":""}
`,{text:l,usage:d}=await (0,f.generateText)({model:s,prompt:[{role:"system",content:m},{role:"user",content:i}],maxOutputTokens:4e3,temperature:.7});return Response.json({review:l,usage:d,model:s})}e.s(["POST",()=>E,"maxDuration",0,60],23185);var y=e.i(23185);let C=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/essay-review/route",pathname:"/api/essay-review",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/app/api/essay-review/route.ts",nextConfigOutput:"standalone",userland:y}),{workAsyncStorage:A,workUnitAsyncStorage:b,serverHooks:T}=C;function P(){return(0,a.patchFetch)({workAsyncStorage:A,workUnitAsyncStorage:b})}async function N(e,t,a){C.isDev&&(0,n.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let f="/api/essay-review/route";f=f.replace(/\/index$/,"")||"/";let m=await C.prepare(e,t,{srcPage:f,multiZoneDraftMode:!1});if(!m)return t.statusCode=400,t.end("Bad Request"),null==a.waitUntil||a.waitUntil.call(a,Promise.resolve()),null;let{buildId:E,params:y,nextConfig:A,parsedUrl:b,isDraftMode:T,prerenderManifest:P,routerServerContext:N,isOnDemandRevalidate:O,revalidateOnlyGenerated:k,resolvedPathname:S,clientReferenceManifest:_,serverActionsManifest:$}=m,j=(0,l.normalizeAppPath)(f),q=!!(P.dynamicRoutes[j]||P.routes[S]),H=async()=>((null==N?void 0:N.render404)?await N.render404(e,t,b,!1):t.end("This page could not be found"),null);if(q&&!T){let e=!!P.routes[S],t=P.dynamicRoutes[j];if(t&&!1===t.fallback&&!e){if(A.experimental.adapterPath)return await H();throw new g.NoFallbackError}}let I=null;!q||C.isDev||T||(I="/index"===(I=S)?"/":I);let M=!0===C.isDev||!q,U=q&&!M;$&&_&&(0,s.setReferenceManifestsSingleton)({page:f,clientReferenceManifest:_,serverActionsManifest:$,serverModuleMap:(0,i.createServerModuleMap)({serverActionsManifest:$})});let D=e.method||"GET",F=(0,o.getTracer)(),K=F.getActiveScopeSpan(),B={params:y,prerenderManifest:P,renderOpts:{experimental:{authInterrupts:!!A.experimental.authInterrupts},cacheComponents:!!A.cacheComponents,supportsDynamicResponse:M,incrementalCache:(0,n.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:A.cacheLife,waitUntil:a.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,a)=>C.onRequestError(e,t,a,N)},sharedContext:{buildId:E}},L=new d.NodeNextRequest(e),X=new d.NodeNextResponse(t),G=u.NextRequestAdapter.fromNodeNextRequest(L,(0,u.signalFromNodeResponse)(t));try{let s=async e=>C.handle(G,B).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let r=F.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==p.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let a=r.get("next.route");if(a){let t=`${D} ${a}`;e.setAttributes({"next.route":a,"http.route":a,"next.span_name":t}),e.updateName(t)}else e.updateName(`${D} ${f}`)}),i=!!(0,n.getRequestMeta)(e,"minimalMode"),l=async n=>{var o,l;let d=async({previousCacheEntry:r})=>{try{if(!i&&O&&k&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let o=await s(n);e.fetchMetrics=B.renderOpts.fetchMetrics;let l=B.renderOpts.pendingWaitUntil;l&&a.waitUntil&&(a.waitUntil(l),l=void 0);let d=B.renderOpts.collectedTags;if(!q)return await (0,h.sendResponse)(L,X,o,B.renderOpts.pendingWaitUntil),null;{let e=await o.blob(),t=(0,x.toNodeOutgoingHttpHeaders)(o.headers);d&&(t[v.NEXT_CACHE_TAGS_HEADER]=d),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==B.renderOpts.collectedRevalidate&&!(B.renderOpts.collectedRevalidate>=v.INFINITE_CACHE)&&B.renderOpts.collectedRevalidate,a=void 0===B.renderOpts.collectedExpire||B.renderOpts.collectedExpire>=v.INFINITE_CACHE?void 0:B.renderOpts.collectedExpire;return{value:{kind:w.CachedRouteKind.APP_ROUTE,status:o.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:a}}}}catch(t){throw(null==r?void 0:r.isStale)&&await C.onRequestError(e,t,{routerKind:"App Router",routePath:f,routeType:"route",revalidateReason:(0,c.getRevalidateReason)({isStaticGeneration:U,isOnDemandRevalidate:O})},N),t}},u=await C.handleResponse({req:e,nextConfig:A,cacheKey:I,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:P,isRoutePPREnabled:!1,isOnDemandRevalidate:O,revalidateOnlyGenerated:k,responseGenerator:d,waitUntil:a.waitUntil,isMinimalMode:i});if(!q)return null;if((null==u||null==(o=u.value)?void 0:o.kind)!==w.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==u||null==(l=u.value)?void 0:l.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});i||t.setHeader("x-nextjs-cache",O?"REVALIDATED":u.isMiss?"MISS":u.isStale?"STALE":"HIT"),T&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let p=(0,x.fromNodeOutgoingHttpHeaders)(u.value.headers);return i&&q||p.delete(v.NEXT_CACHE_TAGS_HEADER),!u.cacheControl||t.getHeader("Cache-Control")||p.get("Cache-Control")||p.set("Cache-Control",(0,R.getCacheControlHeader)(u.cacheControl)),await (0,h.sendResponse)(L,X,new Response(u.value.body,{headers:p,status:u.value.status||200})),null};K?await l(K):await F.withPropagatedContext(e.headers,()=>F.trace(p.BaseServerSpan.handleRequest,{spanName:`${D} ${f}`,kind:o.SpanKind.SERVER,attributes:{"http.method":D,"http.target":e.url}},l))}catch(t){if(t instanceof g.NoFallbackError||await C.onRequestError(e,t,{routerKind:"App Router",routePath:j,routeType:"route",revalidateReason:(0,c.getRevalidateReason)({isStaticGeneration:U,isOnDemandRevalidate:O})}),q)throw t;return await (0,h.sendResponse)(L,X,new Response(null,{status:500})),null}}e.s(["handler",()=>N,"patchFetch",()=>P,"routeModule",()=>C,"serverHooks",()=>T,"workAsyncStorage",()=>A,"workUnitAsyncStorage",()=>b],28792)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__4073e31e._.js.map