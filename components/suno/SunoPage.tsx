"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  AlertCircle,
  CheckCircle2,
  Clipboard,
  Download,
  FileAudio,
  History,
  Loader2,
  Music4,
  PlayCircle,
  Search,
  Settings2,
  Upload,
  Wand2,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useForm, type UseFormReturn } from "react-hook-form"
import { z } from "zod"
import {
  AlertV2 as Alert,
  AlertV2Description as AlertDescription,
  BadgeV2 as Badge,
  ButtonV2 as Button,
  CardV2 as Card,
  CardV2Content as CardContent,
  CardV2Description as CardDescription,
  CardV2Header as CardHeader,
  CardV2Title as CardTitle,
  DialogV2 as Dialog,
  DialogV2Content as DialogContent,
  DialogV2Description as DialogDescription,
  DialogV2Footer as DialogFooter,
  DialogV2Header as DialogHeader,
  DialogV2Title as DialogTitle,
  InputV2 as Input,
  LabelV2 as Label,
  SelectV2 as Select,
  SelectV2Content as SelectContent,
  SelectV2Item as SelectItem,
  SelectV2Trigger as SelectTrigger,
  SelectV2Value as SelectValue,
  SwitchV2 as Switch,
  TabsV2 as Tabs,
  TabsV2Content as TabsContent,
  TabsV2List as TabsList,
  TabsV2Trigger as TabsTrigger,
  TextareaV2 as Textarea,
} from "@/components/ui/v2"
import {
  SUNO_COST_OPERATIONS,
  SUNO_MAX_UPLOAD_BYTES,
  SUNO_MODEL_OPTIONS,
  buildDifyInputs,
  parseDifyResult,
  validateOperationInput,
  type SunoOperation,
  type SunoWorkflowResult,
} from "@/lib/suno-workflow-schema"
import { cn } from "@/lib/utils"

type MainTab = "create" | "extend" | "upload" | "lyrics" | "query" | "debug"
type RecentTask = SunoWorkflowResult & {
  id: string
  operation: string
  createdAt: string
}

const formSchema = z.record(z.unknown())
type FormValues = Record<string, unknown>

const DEFAULT_VALUES: FormValues = {
  operation: "music_custom",
  prompt: "",
  gpt_description_prompt: "",
  title: "",
  tags: "",
  negative_tags: "",
  mv: "chirp-v5",
  custom_mv: "",
  make_instrumental: "false",
  generation_type: "TEXT",
  vocal_gender: "",
  continue_clip_id: "",
  continue_at: "10",
  persona_id: "",
  artist_clip_id: "",
  cover_clip_id: "",
  clip_id: "",
  task_id: "",
  upload_id: "",
  timing_id: "",
  ids: "",
  extension: "mp3",
  upload_type: "file_upload",
  upload_filename: "",
  wait_complete: "true",
  poll_interval_seconds: "3",
  poll_timeout_seconds: "180",
  is_infill: "false",
  infill_start_s: "",
  infill_end_s: "",
  continued_aligned_prompt: "",
  notify_hook: "",
  s3_url: "",
  s3_fields_json: "{}",
  raw_method: "POST",
  raw_path: "/suno/submit/music",
  raw_body_json: "{}",
  extra_json: "{}",
}

const OPERATION_LABELS: Record<string, string> = {
  health: "检查网关状态",
  music_inspiration: "生成灵感歌曲",
  music_custom: "生成自定义歌曲",
  music_extend: "续写歌曲",
  music_persona: "生成歌手风格",
  music_upload_extend: "基于 clip_id 二创",
  music_cover: "生成 Cover",
  music_stitch_submit: "拼接提交",
  lyrics: "生成歌词",
  concat: "歌曲拼接",
  upload_authorize: "请求上传授权",
  upload_s3: "调试 S3 上传",
  upload_finish: "报告上传完成",
  upload_status: "查询上传状态",
  initialize_clip: "初始化 Clip",
  upload_full: "上传生成 Clip",
  upload_full_and_create: "上传并二创",
  generate_inspiration: "Generate 灵感",
  generate_custom: "Generate 自定义",
  generate_instrumental: "生成纯音乐",
  tasks_batch: "批量查询任务",
  fetch_task: "查询任务",
  wav: "获取 WAV",
  timing: "获取 Timing",
  feed: "获取 Feed",
  callbacks_recent: "查看最近回调",
  raw: "Raw 调试",
}

const OPERATION_BUTTONS: Record<string, string> = {
  music_inspiration: "生成歌曲",
  music_custom: "生成歌曲",
  generate_instrumental: "生成纯音乐",
  music_extend: "续写歌曲",
  music_persona: "生成风格歌曲",
  music_cover: "生成 Cover",
  upload_full_and_create: "上传并二创",
  upload_full: "上传生成 Clip",
  music_upload_extend: "基于 Clip 二创",
  fetch_task: "查询任务",
  tasks_batch: "批量查询",
  wav: "获取 WAV",
  timing: "获取 Timing",
  feed: "获取 Feed",
}

function getButtonText(operation: string) {
  return OPERATION_BUTTONS[operation] || OPERATION_LABELS[operation] || "提交"
}

function getOperationTab(operation: string): MainTab {
  if (["music_extend", "music_persona", "music_cover"].includes(operation)) return "extend"
  if (["upload_full_and_create", "upload_full", "music_upload_extend", "upload_authorize", "upload_s3", "upload_finish", "upload_status", "initialize_clip"].includes(operation)) return "upload"
  if (["lyrics", "concat", "music_stitch_submit"].includes(operation)) return "lyrics"
  if (["tasks_batch", "fetch_task", "wav", "timing", "feed"].includes(operation)) return "query"
  if (["callbacks_recent", "raw", "health"].includes(operation)) return "debug"
  return "create"
}

function usePersistentForm(form: UseFormReturn<FormValues>) {
  useEffect(() => {
    const raw = window.localStorage.getItem("suno-form-draft")
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      form.reset({ ...DEFAULT_VALUES, ...parsed, audio_file: undefined })
    } catch {
      window.localStorage.removeItem("suno-form-draft")
    }
  }, [form])

  useEffect(() => {
    const subscription = form.watch((value) => {
      const safeValue = { ...value, audio_file: undefined }
      window.localStorage.setItem("suno-form-draft", JSON.stringify(safeValue))
    })
    return () => subscription.unsubscribe()
  }, [form])
}

function setOperation(form: UseFormReturn<FormValues>, operation: SunoOperation | string) {
  form.setValue("operation", operation, { shouldDirty: true, shouldValidate: false })
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="mt-1 text-xs font-medium text-[var(--seal-600)]">{message}</p>
}

function TextField({
  form,
  name,
  label,
  placeholder,
  type = "text",
  errors,
}: {
  form: UseFormReturn<FormValues>
  name: string
  label: string
  placeholder?: string
  type?: string
  errors?: Record<string, string>
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} type={type} placeholder={placeholder} {...form.register(name)} />
      <FieldError message={errors?.[name]} />
    </div>
  )
}

function TextAreaField({
  form,
  name,
  label,
  placeholder,
  rows = 4,
  errors,
}: {
  form: UseFormReturn<FormValues>
  name: string
  label: string
  placeholder?: string
  rows?: number
  errors?: Record<string, string>
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Textarea id={name} rows={rows} placeholder={placeholder} {...form.register(name)} />
      <FieldError message={errors?.[name]} />
    </div>
  )
}

function BooleanSwitch({
  form,
  name,
  label,
}: {
  form: UseFormReturn<FormValues>
  name: string
  label: string
}) {
  const value = String(form.watch(name) || "false") === "true"
  return (
    <div className="flex items-center justify-between gap-4 rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-100)]/60 px-3 py-2">
      <Label htmlFor={name}>{label}</Label>
      <Switch
        id={name}
        checked={value}
        onCheckedChange={(checked) => form.setValue(name, checked ? "true" : "false", { shouldDirty: true })}
      />
    </div>
  )
}

export function ModelSelector({ form }: { form: UseFormReturn<FormValues> }) {
  const mv = String(form.watch("mv") || "chirp-v5")
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label>模型</Label>
        <Select value={mv} onValueChange={(value) => form.setValue("mv", value, { shouldDirty: true })}>
          <SelectTrigger>
            <SelectValue placeholder="选择模型" />
          </SelectTrigger>
          <SelectContent>
            {SUNO_MODEL_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {mv === "custom" ? (
        <TextField form={form} name="custom_mv" label="自定义模型" placeholder="输入模型名" />
      ) : null}
    </div>
  )
}

export function JsonTextarea({
  form,
  name,
  label,
  errors,
}: {
  form: UseFormReturn<FormValues>
  name: string
  label: string
  errors?: Record<string, string>
}) {
  return <TextAreaField form={form} name={name} label={label} rows={5} errors={errors} placeholder='{"key":"value"}' />
}

export function TagsInput({ form, name = "tags", label = "风格标签" }: { form: UseFormReturn<FormValues>; name?: string; label?: string }) {
  return <TextField form={form} name={name} label={label} placeholder="pop, emotional, piano" />
}

export function FileUploadBox({
  form,
  errors,
}: {
  form: UseFormReturn<FormValues>
  errors?: Record<string, string>
}) {
  const file = form.watch("audio_file") as File | undefined
  const [localError, setLocalError] = useState("")

  return (
    <div>
      <Label htmlFor="audio_file">音频文件</Label>
      <div className="mt-2 rounded-[var(--radius-sharp)] border border-dashed border-[var(--ink-300)] bg-[var(--paper-100)]/60 p-4">
        <Input
          id="audio_file"
          type="file"
          accept=".mp3,.wav,.m4a,.aac,.ogg,.flac,audio/*"
          onChange={(event) => {
            const selected = event.target.files?.[0]
            setLocalError("")
            if (!selected) return
            if (selected.size > SUNO_MAX_UPLOAD_BYTES) {
              setLocalError("文件不能超过 200MB")
              event.target.value = ""
              return
            }
            const extension = selected.name.split(".").pop()?.toLowerCase() || "mp3"
            form.setValue("audio_file", selected, { shouldDirty: true })
            form.setValue("upload_filename", selected.name, { shouldDirty: true })
            form.setValue("extension", extension, { shouldDirty: true })
          }}
        />
        {file ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-[var(--ink-700)]">
            <FileAudio className="h-4 w-4" />
            <span>{file.name}</span>
            <span className="text-[var(--ink-400)]">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--ink-500)]">支持 mp3、wav、m4a、aac、ogg、flac。</p>
        )}
      </div>
      <FieldError message={localError || errors?.audio_file} />
    </div>
  )
}

function OperationPicker({
  value,
  options,
  onChange,
}: {
  value: string
  options: Array<{ value: SunoOperation; label: string }>
  onChange: (value: SunoOperation) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          variant={value === option.value ? "primary" : "outline"}
          size="sm"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  )
}

function FormSection({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4">{children}</div>
}

export function CreativeSongForm({
  form,
  errors,
}: {
  form: UseFormReturn<FormValues>
  errors: Record<string, string>
}) {
  const operation = String(form.watch("operation") || "music_custom")
  return (
    <FormSection>
      <OperationPicker
        value={operation}
        options={[
          { value: "music_inspiration", label: "灵感生成" },
          { value: "music_custom", label: "自定义歌曲" },
          { value: "generate_instrumental", label: "纯音乐生成" },
        ]}
        onChange={(value) => setOperation(form, value)}
      />
      {operation === "music_inspiration" ? (
        <>
          <TextAreaField form={form} name="gpt_description_prompt" label="灵感描述" placeholder="一首关于夏夜海边的中文流行歌" errors={errors} />
          <BooleanSwitch form={form} name="make_instrumental" label="纯音乐" />
          <ModelSelector form={form} />
          <TextField form={form} name="prompt" label="短标题/提示" placeholder="Cat Dance" />
          <TextField form={form} name="notify_hook" label="回调地址（高级）" placeholder="https://..." />
        </>
      ) : operation === "music_custom" ? (
        <>
          <TextAreaField form={form} name="prompt" label="歌词或创作提示" placeholder="输入歌词，或描述你想要的歌曲" errors={errors} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField form={form} name="title" label="歌曲标题" errors={errors} />
            <TagsInput form={form} />
          </div>
          <TextField form={form} name="negative_tags" label="排除风格" placeholder="noise, low quality" />
          <ModelSelector form={form} />
          <div className="grid gap-4 sm:grid-cols-2">
            <BooleanSwitch form={form} name="make_instrumental" label="纯音乐" />
            <TextField form={form} name="generation_type" label="生成类型" placeholder="TEXT" />
          </div>
          <TextField form={form} name="vocal_gender" label="人声性别（可选）" placeholder="m / f" />
          <TextField form={form} name="notify_hook" label="回调地址（高级）" />
          <JsonTextarea form={form} name="extra_json" label="额外 JSON（高级）" errors={errors} />
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField form={form} name="title" label="标题" errors={errors} />
            <TagsInput form={form} />
          </div>
          <TextAreaField form={form} name="prompt" label="补充提示（可选）" />
          <ModelSelector form={form} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField form={form} name="infill_start_s" label="Infill 开始秒" />
            <TextField form={form} name="infill_end_s" label="Infill 结束秒" />
          </div>
        </>
      )}
    </FormSection>
  )
}

export function ExtendCoverForm({ form, errors }: { form: UseFormReturn<FormValues>; errors: Record<string, string> }) {
  const operation = String(form.watch("operation") || "music_extend")
  return (
    <FormSection>
      <OperationPicker
        value={operation}
        options={[
          { value: "music_extend", label: "续写歌曲" },
          { value: "music_persona", label: "歌手风格" },
          { value: "music_cover", label: "Cover" },
        ]}
        onChange={(value) => setOperation(form, value)}
      />
      {operation === "music_extend" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField form={form} name="continue_clip_id" label="原歌曲 clip_id" errors={errors} />
            <TextField form={form} name="continue_at" label="续写开始秒" type="number" errors={errors} />
          </div>
          <TextAreaField form={form} name="prompt" label="续写歌词或提示" errors={errors} />
        </>
      ) : operation === "music_persona" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField form={form} name="persona_id" label="persona_id" errors={errors} />
            <TextField form={form} name="artist_clip_id" label="artist_clip_id" errors={errors} />
          </div>
          <TextAreaField form={form} name="prompt" label="歌词" errors={errors} />
          <TextField form={form} name="generation_type" label="生成类型" placeholder="TEXT" />
          <TextField form={form} name="vocal_gender" label="人声性别" />
        </>
      ) : (
        <>
          <TextField form={form} name="cover_clip_id" label="cover_clip_id" errors={errors} />
          <TextAreaField form={form} name="prompt" label="提示（可选）" />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField form={form} name="continue_clip_id" label="continue_clip_id（可选）" />
            <TextField form={form} name="continue_at" label="continue_at（可选）" type="number" />
          </div>
          <TextField form={form} name="continued_aligned_prompt" label="对齐提示（可选）" />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField form={form} name="infill_start_s" label="Infill 开始秒" />
            <TextField form={form} name="infill_end_s" label="Infill 结束秒" />
          </div>
        </>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField form={form} name="title" label="标题" />
        <TagsInput form={form} />
      </div>
      <TextField form={form} name="negative_tags" label="排除风格" />
      <ModelSelector form={form} />
      <TextField form={form} name="notify_hook" label="回调地址（可选）" />
    </FormSection>
  )
}

export function UploadRemixForm({ form, errors }: { form: UseFormReturn<FormValues>; errors: Record<string, string> }) {
  const operation = String(form.watch("operation") || "upload_full_and_create")
  const [showAdvanced, setShowAdvanced] = useState(false)
  return (
    <FormSection>
      <OperationPicker
        value={operation}
        options={[
          { value: "upload_full_and_create", label: "上传并二创" },
          { value: "upload_full", label: "只上传生成 clip_id" },
          { value: "music_upload_extend", label: "已有 clip_id 二创" },
        ]}
        onChange={(value) => setOperation(form, value)}
      />
      {operation === "upload_full_and_create" ? (
        <>
          <FileUploadBox form={form} errors={errors} />
          <TextAreaField form={form} name="prompt" label="二创提示" errors={errors} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField form={form} name="title" label="标题" />
            <TagsInput form={form} />
          </div>
          <TextField form={form} name="negative_tags" label="排除风格" />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField form={form} name="continue_at" label="从第几秒开始" type="number" />
            <TextField form={form} name="extension" label="扩展名" />
          </div>
          <ModelSelector form={form} />
          <TextField form={form} name="notify_hook" label="回调地址（可选）" />
        </>
      ) : operation === "upload_full" ? (
        <>
          <FileUploadBox form={form} errors={errors} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField form={form} name="extension" label="扩展名" />
            <BooleanSwitch form={form} name="wait_complete" label="等待上传完成" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField form={form} name="poll_interval_seconds" label="轮询间隔秒" type="number" />
            <TextField form={form} name="poll_timeout_seconds" label="轮询超时秒" type="number" />
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField form={form} name="continue_clip_id" label="上传初始化得到的 clip_id" errors={errors} />
            <TextField form={form} name="continue_at" label="从第几秒开始" type="number" errors={errors} />
          </div>
          <TextAreaField form={form} name="prompt" label="歌词或提示" errors={errors} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField form={form} name="title" label="标题" />
            <TagsInput form={form} />
          </div>
          <TextField form={form} name="negative_tags" label="排除风格" />
          <ModelSelector form={form} />
        </>
      )}
      <Button type="button" variant="ghost" onClick={() => setShowAdvanced((value) => !value)}>
        <Settings2 className="h-4 w-4" />
        高级分步上传
      </Button>
      {showAdvanced ? (
        <Card variant="inset">
          <CardContent className="grid gap-4">
            <OperationPicker
              value={operation}
              options={[
                { value: "upload_authorize", label: "授权" },
                { value: "upload_s3", label: "S3 上传" },
                { value: "upload_finish", label: "完成" },
                { value: "upload_status", label: "状态" },
                { value: "initialize_clip", label: "初始化 Clip" },
              ]}
              onChange={(value) => setOperation(form, value)}
            />
            {operation === "upload_authorize" ? <TextField form={form} name="extension" label="extension" errors={errors} /> : null}
            {operation === "upload_s3" ? (
              <>
                <FileUploadBox form={form} errors={errors} />
                <TextField form={form} name="s3_url" label="S3 URL" errors={errors} />
                <JsonTextarea form={form} name="s3_fields_json" label="S3 fields JSON" errors={errors} />
              </>
            ) : null}
            {["upload_finish", "upload_status", "initialize_clip"].includes(operation) ? (
              <>
                <TextField form={form} name="upload_id" label="upload_id" errors={errors} />
                {operation === "upload_finish" ? (
                  <>
                    <TextField form={form} name="upload_filename" label="文件名" errors={errors} />
                    <TextField form={form} name="upload_type" label="upload_type" />
                  </>
                ) : null}
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </FormSection>
  )
}

export function LyricsConcatForm({ form, errors }: { form: UseFormReturn<FormValues>; errors: Record<string, string> }) {
  const operation = String(form.watch("operation") || "lyrics")
  return (
    <FormSection>
      <OperationPicker
        value={operation}
        options={[
          { value: "lyrics", label: "生成歌词" },
          { value: "concat", label: "歌曲拼接" },
          { value: "music_stitch_submit", label: "拼接提交" },
        ]}
        onChange={(value) => setOperation(form, value)}
      />
      {operation === "lyrics" ? (
        <>
          <TextAreaField form={form} name="prompt" label="歌词提示" errors={errors} />
          <TextAreaField form={form} name="gpt_description_prompt" label="灵感描述（可选）" />
          <TextField form={form} name="notify_hook" label="回调地址（可选）" />
        </>
      ) : (
        <>
          <TextField form={form} name="clip_id" label="clip_id" errors={errors} />
          <BooleanSwitch form={form} name="is_infill" label="是否 Infill" />
        </>
      )}
    </FormSection>
  )
}

export function QueryForm({ form, errors }: { form: UseFormReturn<FormValues>; errors: Record<string, string> }) {
  const operation = String(form.watch("operation") || "fetch_task")
  return (
    <FormSection>
      <OperationPicker
        value={operation}
        options={[
          { value: "fetch_task", label: "单任务" },
          { value: "tasks_batch", label: "批量任务" },
          { value: "wav", label: "WAV" },
          { value: "timing", label: "Timing" },
          { value: "feed", label: "Feed" },
        ]}
        onChange={(value) => setOperation(form, value)}
      />
      {operation === "fetch_task" ? <TextField form={form} name="task_id" label="task_id" errors={errors} /> : null}
      {operation === "tasks_batch" ? <TextAreaField form={form} name="ids" label="任务 IDs" rows={5} errors={errors} placeholder="一行一个，或逗号分隔" /> : null}
      {operation === "wav" ? <TextField form={form} name="clip_id" label="clip_id" errors={errors} /> : null}
      {["timing", "feed"].includes(operation) ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="timing_id" label="timing_id" errors={errors} />
          <TextField form={form} name="clip_id" label="clip_id" errors={errors} />
        </div>
      ) : null}
    </FormSection>
  )
}

export function AdvancedDebugForm({ form, errors }: { form: UseFormReturn<FormValues>; errors: Record<string, string> }) {
  const operation = String(form.watch("operation") || "raw")
  const [enabled, setEnabled] = useState(false)
  return (
    <FormSection>
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>高级调试用于兼容新接口和排障，正式使用优先选择普通功能。</AlertDescription>
      </Alert>
      {!enabled ? (
        <Button type="button" variant="outline" onClick={() => setEnabled(true)}>
          我知道风险，显示高级调试
        </Button>
      ) : (
        <>
          <OperationPicker
            value={operation}
            options={[
              { value: "raw", label: "Raw 透传" },
              { value: "callbacks_recent", label: "最近回调" },
              { value: "health", label: "健康检查" },
            ]}
            onChange={(value) => setOperation(form, value)}
          />
          {operation === "raw" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Raw Method</Label>
                  <Select value={String(form.watch("raw_method") || "POST")} onValueChange={(value) => form.setValue("raw_method", value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="GET">GET</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldError message={errors.raw_method} />
                </div>
                <TextField form={form} name="raw_path" label="Raw Path" errors={errors} />
              </div>
              <JsonTextarea form={form} name="raw_body_json" label="Raw Body JSON" errors={errors} />
              <JsonTextarea form={form} name="extra_json" label="Extra JSON" errors={errors} />
            </>
          ) : (
            <p className="text-sm text-[var(--ink-500)]">此操作无需额外字段。</p>
          )}
        </>
      )}
    </FormSection>
  )
}

export function ConfirmCostDialog({
  open,
  onOpenChange,
  onConfirm,
  operation,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  operation: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认提交音乐生成任务</DialogTitle>
          <DialogDescription>
            {OPERATION_LABELS[operation] || operation} 可能产生上游扣费。确认后将通过 Dify 工作流提交到服务器网关。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button variant="seal" onClick={onConfirm}>确认提交</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CopyButton({ value, label = "复制" }: { value?: string; label?: string }) {
  if (!value) return null
  return (
    <Button type="button" variant="ghost" size="sm" onClick={() => navigator.clipboard?.writeText(value)}>
      <Clipboard className="h-4 w-4" />
      {label}
    </Button>
  )
}

export function ResultPanel({
  result,
  onQueryTask,
  onClipAction,
}: {
  result: SunoWorkflowResult | null
  onQueryTask: (taskId: string) => void
  onClipAction: (operation: "wav" | "timing" | "feed", clipId: string) => void
}) {
  if (!result) {
    return (
      <Card variant="inset">
        <CardContent className="flex min-h-64 items-center justify-center text-center text-sm text-[var(--ink-500)]">
          提交后，任务 ID、音频、封面和原始响应会显示在这里。
        </CardContent>
      </Card>
    )
  }

  const responseJson = result.response_json ?? result
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            {result.success ? <CheckCircle2 className="h-5 w-5 text-[var(--ink-600)]" /> : <AlertCircle className="h-5 w-5 text-[var(--seal-600)]" />}
            {result.success ? "任务已返回" : "任务失败"}
          </CardTitle>
          <Badge variant={result.success ? "ink" : "seal"}>{result.status || result.http_status || "result"}</Badge>
        </div>
        {result.error ? <CardDescription className="text-[var(--seal-600)]">{String(result.error).slice(0, 240)}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid gap-5">
        {result.task_id ? (
          <div className="rounded-[var(--radius-soft)] bg-[var(--paper-100)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-sm">{result.task_id}</span>
              <div className="flex gap-2">
                <CopyButton value={result.task_id} label="复制 task_id" />
                <Button type="button" variant="outline" size="sm" onClick={() => onQueryTask(result.task_id!)}>
                  <Search className="h-4 w-4" />
                  一键查询
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {result.clip_id ? (
          <div className="rounded-[var(--radius-soft)] bg-[var(--paper-100)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-sm">{result.clip_id}</span>
              <div className="flex flex-wrap gap-2">
                <CopyButton value={result.clip_id} label="复制 clip_id" />
                {(["wav", "timing", "feed"] as const).map((operation) => (
                  <Button key={operation} type="button" variant="outline" size="sm" onClick={() => onClipAction(operation, result.clip_id!)}>
                    {operation.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {result.audio_urls?.length ? (
          <div className="grid gap-3">
            {result.audio_urls.map((url) => (
              <div key={url} className="rounded-[var(--radius-soft)] border border-[var(--paper-200)] p-3">
                <audio controls src={url} className="w-full" />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <a href={url} download>
                      <Download className="h-4 w-4" />
                      下载
                    </a>
                  </Button>
                  <CopyButton value={url} label="复制链接" />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {result.image_urls?.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {result.image_urls.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={url} alt="Suno 封面" className="aspect-square w-full rounded-[var(--radius-soft)] object-cover" />
            ))}
          </div>
        ) : null}

        {result.wav_url ? (
          <Button asChild variant="seal" className="w-fit">
            <a href={result.wav_url} download>
              <Download className="h-4 w-4" />
              下载 WAV
            </a>
          </Button>
        ) : null}

        {!result.success ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>排查建议：检查任务 ID、网关状态、Dify Workflow API Key 和服务器环境变量；如果没有 audio_url，通常表示任务还在生成。</AlertDescription>
          </Alert>
        ) : null}

        <details className="rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-100)] p-3">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--ink-700)]">查看 response_json</summary>
          <pre className="mt-3 max-h-96 overflow-auto text-xs leading-5">{JSON.stringify(responseJson, null, 2)}</pre>
        </details>
      </CardContent>
    </Card>
  )
}

export function RecentTasksPanel({
  items,
  onQueryTask,
}: {
  items: RecentTask[]
  onQueryTask: (taskId: string) => void
}) {
  return (
    <Card variant="inset">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" />
          最近任务
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {items.length === 0 ? (
          <p className="text-sm text-[var(--ink-500)]">暂无记录。</p>
        ) : (
          items.slice(0, 20).map((item) => (
            <button
              key={item.id}
              type="button"
              className="rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-50)] p-3 text-left text-sm transition hover:border-[var(--ink-300)]"
              onClick={() => item.task_id && onQueryTask(item.task_id)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[var(--ink-700)]">{OPERATION_LABELS[item.operation] || item.operation}</span>
                <span className="text-xs text-[var(--ink-400)]">{new Date(item.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-1 truncate font-mono text-xs text-[var(--ink-500)]">{item.task_id || item.clip_id || item.upload_id || "无任务 ID"}</p>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  )
}

export function OperationTabs({
  tab,
  onTabChange,
}: {
  tab: MainTab
  onTabChange: (value: MainTab) => void
}) {
  return (
    <Tabs value={tab} onValueChange={(value) => onTabChange(value as MainTab)}>
      <TabsList className="w-full flex-wrap justify-start">
        <TabsTrigger value="create">创作歌曲</TabsTrigger>
        <TabsTrigger value="extend">续写 / Cover</TabsTrigger>
        <TabsTrigger value="upload">上传音频二创</TabsTrigger>
        <TabsTrigger value="lyrics">歌词 / 拼接</TabsTrigger>
        <TabsTrigger value="query">查询结果</TabsTrigger>
        <TabsTrigger value="debug">高级调试</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}

export function SunoPage() {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULT_VALUES,
  })
  const [tab, setTab] = useState<MainTab>("create")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [result, setResult] = useState<SunoWorkflowResult | null>(null)
  const [recent, setRecent] = useState<RecentTask[]>([])
  const [loading, setLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const operation = String(form.watch("operation") || "music_custom")

  usePersistentForm(form)

  useEffect(() => {
    const raw = window.localStorage.getItem("suno-recent-tasks")
    if (!raw) return
    try {
      setRecent(JSON.parse(raw))
    } catch {
      window.localStorage.removeItem("suno-recent-tasks")
    }
  }, [])

  const currentButtonText = useMemo(() => getButtonText(operation), [operation])

  function pushRecent(nextResult: SunoWorkflowResult) {
    const entry: RecentTask = {
      ...nextResult,
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      operation,
      createdAt: new Date().toISOString(),
    }
    const next = [entry, ...recent].slice(0, 20)
    setRecent(next)
    window.localStorage.setItem("suno-recent-tasks", JSON.stringify(next))
  }

  function onQueryTask(taskId: string) {
    setTab("query")
    setOperation(form, "fetch_task")
    form.setValue("task_id", taskId, { shouldDirty: true })
  }

  function onClipAction(nextOperation: "wav" | "timing" | "feed", clipId: string) {
    setTab("query")
    setOperation(form, nextOperation)
    form.setValue("clip_id", clipId, { shouldDirty: true })
    if (nextOperation !== "wav") form.setValue("timing_id", clipId, { shouldDirty: true })
  }

  async function runCurrentOperation() {
    const values = form.getValues()
    const validation = validateOperationInput(values)
    setErrors(validation.errors)
    if (!validation.ok) return

    setLoading(true)
    try {
      const inputs = buildDifyInputs(values)
      const file = values.audio_file as File | undefined
      const hasFile = file instanceof File
      const response = hasFile
        ? await submitMultipart(inputs, file)
        : await fetch("/api/suno/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(inputs),
          })
      const payload = await response.json().catch(() => ({ success: false, error: "响应解析失败" }))
      const parsed = parseDifyResult(payload)
      const nextResult = {
        ...parsed,
        success: Boolean(payload.success ?? parsed.success),
        http_status: payload.http_status ?? response.status,
        response_json: payload.response_json ?? payload,
        error: payload.error ?? parsed.error,
      }
      setResult(nextResult)
      pushRecent(nextResult)
    } catch (error) {
      setResult({ success: false, error: error instanceof Error ? error.message : "请求失败", response_json: null })
    } finally {
      setLoading(false)
      setConfirmOpen(false)
    }
  }

  async function submitMultipart(inputs: Record<string, unknown>, file: File) {
    const formData = new FormData()
    for (const [key, value] of Object.entries(inputs)) {
      if (key === "audio_file" || key === "gateway_base_url" || key === "gateway_api_key") continue
      formData.set(key, typeof value === "string" ? value : JSON.stringify(value ?? ""))
    }
    formData.set("audio_file", file, file.name)
    return fetch("/api/suno/run", { method: "POST", body: formData })
  }

  function onSubmit() {
    if (SUNO_COST_OPERATIONS.has(operation as SunoOperation)) {
      setConfirmOpen(true)
      return
    }
    runCurrentOperation()
  }

  function runHealthCheck() {
    setTab("debug")
    setOperation(form, "health")
    setTimeout(() => runCurrentOperation(), 0)
  }

  return (
    <div className="min-h-screen bg-[var(--paper-50)] px-4 py-8 font-[var(--font-sans-v2)]">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 border-b border-[var(--paper-200)] pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--seal-600)]">
              <Music4 className="h-4 w-4" />
              Dify Workflow: Suno 服务器网关调用器
            </div>
            <h1 className="font-[var(--font-display)] text-3xl font-bold text-[var(--ink-900)] sm:text-4xl">Suno 音乐生成</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ink-500)]">通过 Dify 工作流调用服务器 Suno 网关生成音乐，密钥只保存在服务端。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={runHealthCheck}>
              <PlayCircle className="h-4 w-4" />
              网关状态
            </Button>
            <Button type="button" variant="ghost" onClick={() => document.getElementById("recent-tasks")?.scrollIntoView({ behavior: "smooth" })}>
              <History className="h-4 w-4" />
              最近任务
            </Button>
          </div>
        </header>

        <OperationTabs
          tab={tab}
          onTabChange={(value) => {
            setTab(value)
            const defaultOperation: Record<MainTab, SunoOperation> = {
              create: "music_custom",
              extend: "music_extend",
              upload: "upload_full_and_create",
              lyrics: "lyrics",
              query: "fetch_task",
              debug: "raw",
            }
            setOperation(form, defaultOperation[value])
          }}
        />

        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-5">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wand2 className="h-5 w-5" />
                  {OPERATION_LABELS[operation] || operation}
                </CardTitle>
                <CardDescription>只显示当前功能需要的字段。高级 JSON 仅在调试区出现。</CardDescription>
              </CardHeader>
              <CardContent>
                {tab === "create" ? <CreativeSongForm form={form} errors={errors} /> : null}
                {tab === "extend" ? <ExtendCoverForm form={form} errors={errors} /> : null}
                {tab === "upload" ? <UploadRemixForm form={form} errors={errors} /> : null}
                {tab === "lyrics" ? <LyricsConcatForm form={form} errors={errors} /> : null}
                {tab === "query" ? <QueryForm form={form} errors={errors} /> : null}
                {tab === "debug" ? <AdvancedDebugForm form={form} errors={errors} /> : null}
              </CardContent>
              <div className="with-divider">
                <div className="flex items-center justify-between gap-3 px-5 pb-5 pt-2 sm:px-6 sm:pb-6">
                  <div className="text-xs text-[var(--ink-500)]">
                    operation: <span className="font-mono text-[var(--ink-700)]">{operation}</span>
                  </div>
                  <Button type="submit" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : tab === "upload" ? <Upload className="h-4 w-4" /> : <Music4 className="h-4 w-4" />}
                    {loading ? "处理中..." : currentButtonText}
                  </Button>
                </div>
              </div>
            </Card>
          </form>

          <aside className="grid gap-5">
            <ResultPanel result={result} onQueryTask={onQueryTask} onClipAction={onClipAction} />
            <div id="recent-tasks">
              <RecentTasksPanel items={recent} onQueryTask={onQueryTask} />
            </div>
          </aside>
        </div>
      </div>

      <ConfirmCostDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        operation={operation}
        onConfirm={runCurrentOperation}
      />
    </div>
  )
}

export default SunoPage
