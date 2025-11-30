export function Stats() {
  const stats = [
    { value: "10万+", label: "活跃学生" },
    { value: "5000+", label: "认证教师" },
    { value: "100万+", label: "批改作业" },
    { value: "98%", label: "满意度" },
  ]

  return (
    <section className="border-y bg-card py-12">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="mb-2 text-4xl font-bold text-primary">{stat.value}</div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
