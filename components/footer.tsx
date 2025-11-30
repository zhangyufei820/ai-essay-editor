export function Footer() {
  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="container px-4 py-12">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              
              <span className="text-xl font-semibold">{""}</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
              {""}
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-4">产品</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="#features" className="hover:text-foreground transition-colors">
                  核心功能
                </a>
              </li>
              <li>
                <a href="#writers" className="hover:text-foreground transition-colors">
                  大师风格
                </a>
              </li>
              <li>
                <a href="#process" className="hover:text-foreground transition-colors">
                  批改流程
                </a>
              </li>
              <li>
                <a href="#pricing" className="hover:text-foreground transition-colors">
                  价格方案
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">支持</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="#" className="hover:text-foreground transition-colors">
                  帮助中心
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-foreground transition-colors">
                  使用指南
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-foreground transition-colors">
                  常见问题
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-foreground transition-colors">
                  联系我们
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-border pt-8 text-center text-sm text-muted-foreground">
          <p>© 2025 沈翔智学保留所有权利.</p>
        </div>
      </div>
    </footer>
  )
}
