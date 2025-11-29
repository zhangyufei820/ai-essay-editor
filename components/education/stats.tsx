export function Stats() {
  const stats = [
    { value: "10万+", label: "活跃学生" },
    { value: "5000+", label: "认证教师" },
    { value: "100万+", label: "批改作业" },
    { value: "98%", label: "满意度" },
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
