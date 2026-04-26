import { buildGridWaveDots } from '@/components/chat/GridWaveLoader'

describe('buildGridWaveDots', () => {
  it('uses diagonal delay from row and column indexes', () => {
    const dots = buildGridWaveDots(4)

    expect(dots[0]).toMatchObject({ row: 0, col: 0, delay: 0 })
    expect(dots[1]).toMatchObject({ row: 0, col: 1, delay: 0.08 })
    expect(dots[4]).toMatchObject({ row: 1, col: 0, delay: 0.08 })
    expect(dots[15]).toMatchObject({ row: 3, col: 3, delay: 0.48 })
  })

  it('creates a dense square matrix', () => {
    expect(buildGridWaveDots(14)).toHaveLength(196)
  })
})
