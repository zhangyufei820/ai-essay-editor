BEGIN;

ALTER TABLE public.teacher_students
  ADD COLUMN IF NOT EXISTS student_consented_at TIMESTAMPTZ;

COMMENT ON COLUMN public.teacher_students.student_consented_at IS
  '学生主动接受教师邀请码的时间；为空的历史绑定不授予教师访问权限。';

CREATE INDEX IF NOT EXISTS idx_teacher_students_consented_teacher
  ON public.teacher_students(teacher_id, joined_at DESC)
  WHERE student_consented_at IS NOT NULL;

DROP POLICY IF EXISTS "Teachers manage own class" ON public.teacher_students;
DROP POLICY IF EXISTS "Teachers view consented class" ON public.teacher_students;
DROP POLICY IF EXISTS "Teachers remove consented class" ON public.teacher_students;
DROP POLICY IF EXISTS "Students revoke own binding" ON public.teacher_students;

CREATE POLICY "Teachers view consented class"
  ON public.teacher_students FOR SELECT
  USING (auth.uid() = teacher_id AND student_consented_at IS NOT NULL);

CREATE POLICY "Teachers remove consented class"
  ON public.teacher_students FOR DELETE
  USING (auth.uid() = teacher_id AND student_consented_at IS NOT NULL);

CREATE POLICY "Students revoke own binding"
  ON public.teacher_students FOR DELETE
  USING (auth.uid() = student_id);

COMMIT;
