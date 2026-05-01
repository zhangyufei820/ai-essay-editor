import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.join(__dirname, '..', 'app/admin/page.tsx'), 'utf8')

describe('admin dashboard source contract', () => {
  it('contains operator-friendly loading, empty, and failure copy', () => {
    expect(source).toContain('正在加载后台数据')
    expect(source).toContain('暂无用户数据')
    expect(source).toContain('暂无订单')
    expect(source).toContain('加载失败')
    expect(source).toContain('后台数据暂时不可用')
  })

  it('shows operations fields needed for daily support', () => {
    expect(source).toContain('订单号')
    expect(source).toContain('用户 ID')
    expect(source).toContain('支付方式')
    expect(source).toContain('支付/更新时间')
    expect(source).toContain('积分')
  })

  it('uses schema-safe derived fields in the client view', () => {
    expect(source).toContain('credits_amount')
    expect(source).toContain('updated_at')
    expect(source).not.toContain('membership_status')
    expect(source).not.toContain('paid_at')
  })
})
