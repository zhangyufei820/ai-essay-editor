module.exports = [
"[project]/app/login/page.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>LoginPage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-ssr] (ecmascript)");
'use client';
;
;
;
function AuthingLoginComponent() {
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRouter"])();
    const searchParams = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSearchParams"])();
    // 这是你之前提供的 Authing App ID
    const appId = '692b0bd30de159be78db726b';
    const guardRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [isLoaded, setIsLoaded] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        // 1. 检查是否已经登录
        // 如果已经有用户信息，直接跳转，不再显示登录框
        const user = localStorage.getItem('currentUser');
        if (user) {
            const redirectPath = searchParams.get('redirect');
            router.replace(redirectPath || '/');
            return;
        }
        if (guardRef.current) return;
        // 2. 动态加载 Authing 样式
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdn.authing.co/packages/guard/latest/guard.min.css';
        document.head.appendChild(link);
        // 3. 加载 Authing 组件
        __turbopack_context__.A("[project]/node_modules/@authing/guard/dist/esm/guard.min.js [app-ssr] (ecmascript, async loader)").then((module)=>{
            const Guard = module.Guard;
            if (guardRef.current) return;
            const guard = new Guard({
                appId,
                mode: 'normal'
            });
            // ✅ 登录成功的处理逻辑
            guard.on('login', async (userInfo)=>{
                console.log('登录成功:', userInfo);
                // [关键] 保存用户信息到浏览器，以便支付页面能看到
                const finalUser = userInfo.data || userInfo;
                localStorage.setItem('currentUser', JSON.stringify(finalUser));
                // 可选：同步到你的后端数据库 (保留了你之前的逻辑)
                try {
                    await fetch('/api/auth/sync', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            user_id: finalUser.id || finalUser.sub,
                            email: finalUser.email,
                            nickname: finalUser.nickname || finalUser.username,
                            avatar: finalUser.photo
                        })
                    });
                } catch (e) {
                    console.error('同步失败', e);
                }
                // [关键] 登录后跳转回刚才的页面（比如支付页）
                const redirectPath = searchParams.get('redirect');
                if (redirectPath) {
                    console.log('正在返回之前的页面:', redirectPath);
                    // 使用 decodeURIComponent 确保网址格式正确
                    router.replace(decodeURIComponent(redirectPath));
                } else {
                    router.replace('/');
                }
            });
            guard.start('#authing-guard-container');
            guardRef.current = guard;
            setIsLoaded(true);
        });
    }, [
        appId,
        router,
        searchParams
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        style: {
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: '#f5f5f5'
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                id: "authing-guard-container",
                style: {
                    minHeight: '500px'
                }
            }, void 0, false, {
                fileName: "[project]/app/login/page.tsx",
                lineNumber: 95,
                columnNumber: 7
            }, this),
            !isLoaded && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                style: {
                    color: '#666',
                    marginTop: '20px'
                },
                children: "正在加载安全登录组件..."
            }, void 0, false, {
                fileName: "[project]/app/login/page.tsx",
                lineNumber: 98,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/login/page.tsx",
        lineNumber: 86,
        columnNumber: 5
    }, this);
}
function LoginPage() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Suspense"], {
        fallback: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            style: {
                height: '100vh',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
            },
            children: "加载中..."
        }, void 0, false, {
            fileName: "[project]/app/login/page.tsx",
            lineNumber: 109,
            columnNumber: 25
        }, void 0),
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(AuthingLoginComponent, {}, void 0, false, {
            fileName: "[project]/app/login/page.tsx",
            lineNumber: 110,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/app/login/page.tsx",
        lineNumber: 109,
        columnNumber: 5
    }, this);
}
}),
];

//# sourceMappingURL=app_login_page_tsx_ccc0019b._.js.map