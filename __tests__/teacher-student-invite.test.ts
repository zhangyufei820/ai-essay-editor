import { signTeacherStudentInvite, verifyTeacherStudentInvite } from "@/lib/teacher-student-invite"

const TEACHER_ID = "11111111-1111-4111-8111-111111111111"
const NOW = 1_800_000_000_000

describe("teacher student consent invites", () => {
  const originalSecret = process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY

  beforeAll(() => {
    process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY = "test-only-teacher-invite-secret-with-enough-entropy"
  })

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
    else process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY = originalSecret
  })

  it("binds the signed invite to the teacher, class, and expiry", () => {
    const token = signTeacherStudentInvite({ teacherId: TEACHER_ID, className: " 初二一班 ", now: NOW })

    expect(verifyTeacherStudentInvite(token, NOW + 1)).toEqual({
      teacherId: TEACHER_ID,
      className: "初二一班",
      expiresAt: NOW + 15 * 60 * 1000,
    })
  })

  it("rejects tampered and expired invites", () => {
    const token = signTeacherStudentInvite({ teacherId: TEACHER_ID, now: NOW })
    const [payload, signature] = token.split(".")

    expect(verifyTeacherStudentInvite(`${payload}x.${signature}`, NOW + 1)).toBeNull()
    expect(verifyTeacherStudentInvite(token, NOW + 15 * 60 * 1000)).toBeNull()
  })
})
