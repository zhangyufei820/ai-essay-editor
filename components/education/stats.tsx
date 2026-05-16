export function Stats() {
  const stats = [
    { value: "作文", label: "逐段批改" },
    { value: "错题", label: "归因诊断" },
    { value: "答疑", label: "分步讲解" },
    { value: "复习", label: "闪卡沉淀" },
  ]

  return (
    <section className="border-y bg-gradient-to-r from-card via-muted/20 to-card py-16 shadow-inner">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {stats.map((stat) => (
            <div 
              key={stat.label} 
              className="group text-center transition-transform duration-300 hover:scale-110"
            >
              <div className="mb-3 text-5xl font-bold bg-gradient-to-br from-primary to-primary/60 bg-clip-text text-transparent transition-all duration-300 group-hover:scale-110">
                {stat.value}
              </div>
              <div className="text-sm font-medium text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
