import {
  buildWorksheetDiagnosisInputs,
  buildWorksheetReportRenderPrompt,
  parseWorksheetDiagnosis,
} from "@/lib/worksheet-diagnosis"
import {
  WORKSHEET_REPORT_IMAGE_CREDITS,
  calculateWorksheetDiagnosisCredits,
} from "@/lib/billing-config"

describe("worksheet diagnosis Dify contract", () => {
  it("builds workflow inputs with Dify image files", () => {
    const inputs = buildWorksheetDiagnosisInputs({
      images: [
        {
          type: "image",
          transfer_method: "local_file",
          upload_file_id: "file-1",
        },
      ],
      subject: "数学",
      grade: "五年级",
      reportStyle: "parent",
      extraContext: "期中卷",
    })

    expect(inputs).toMatchObject({
      worksheet_images: [
        {
          type: "image",
          transfer_method: "local_file",
          upload_file_id: "file-1",
        },
      ],
      subject: "数学",
      grade: "五年级",
      report_style: "parent",
      output_schema_version: "worksheet-diagnosis-v1",
    })
  })

  it("parses fenced JSON from Dify outputs", () => {
    const diagnosis = parseWorksheetDiagnosis({
      diagnosis_json: "```json\n{\"subject\":\"数学\",\"main_issues\":[\"审题漏条件\"],\"training_plan\":[{\"title\":\"审题\",\"action\":\"圈关键词\"}]}\n```",
    })

    expect(diagnosis.subject).toBe("数学")
    expect(diagnosis.main_issues).toEqual(["审题漏条件"])
    expect(diagnosis.training_plan[0].action).toBe("圈关键词")
  })

  it("creates an image render prompt from normalized diagnosis", () => {
    const diagnosis = parseWorksheetDiagnosis({
      diagnosis_json: {
        subject: "数学",
        overall_summary: "基础不差，审题需要加强。",
        main_issues: ["审题不完整"],
      },
    })

    const prompt = buildWorksheetReportRenderPrompt(diagnosis, "parent")
    expect(prompt).toContain("家长沟通版")
    expect(prompt).toContain("审题不完整")
    expect(prompt).toContain("不要编造题目")
    expect(prompt).toContain("1080x1440")
  })

  it("calculates worksheet diagnosis fixed credits by image count", () => {
    expect(calculateWorksheetDiagnosisCredits(1)).toBe(80)
    expect(calculateWorksheetDiagnosisCredits(2)).toBe(110)
    expect(calculateWorksheetDiagnosisCredits(6)).toBe(230)
    expect(calculateWorksheetDiagnosisCredits(20)).toBe(230)
    expect(WORKSHEET_REPORT_IMAGE_CREDITS).toBe(260)
  })
})
