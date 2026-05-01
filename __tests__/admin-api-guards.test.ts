import fs from 'fs'
import path from 'path'

const root = path.join(__dirname, '..')
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const adminApiRoutes = [
  'app/api/admin/verify/route.ts',
  'app/api/admin/stats/route.ts',
  'app/api/admin/users/route.ts',
  'app/api/admin/orders/route.ts',
  'app/api/admin/user-details/route.ts',
]

describe('admin API guards', () => {
  it('keeps server-side admin token verification on every admin data route', () => {
    for (const route of adminApiRoutes) {
      const source = read(route)
      expect(source).toContain('verifyAdminToken')
      expect(source).toMatch(/authorization/i)
      expect(source).toMatch(/status:\s*401|status:\s*403/)
    }
  })

  it('does not query removed or unreliable database columns', () => {
    const combined = adminApiRoutes.map(read).join('\n')
    expect(combined).not.toContain('paid_at')
    expect(combined).not.toContain('membership_status')
    expect(combined).not.toContain('created_at: user.updated_at')
  })

  it('uses the real order credits_amount and updated_at fields', () => {
    const ordersRoute = read('app/api/admin/orders/route.ts')
    expect(ordersRoute).toContain('credits_amount')
    expect(ordersRoute).toContain('updated_at')
    expect(ordersRoute).not.toMatch(/credits:\s*order\.credits_amount/)
    expect(ordersRoute).not.toMatch(/paid_at:\s*order\.updated_at/)
  })
})
