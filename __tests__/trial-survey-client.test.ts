describe("trial survey client gate", () => {
  const originalWindow = global.window
  const originalFetch = global.fetch

  function installWindow() {
    const listeners: Record<string, Array<(event: Event) => void>> = {}
    const windowMock = {
      addEventListener: jest.fn((type: string, listener: (event: Event) => void) => {
        listeners[type] = listeners[type] || []
        listeners[type].push(listener)
      }),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn((event: Event) => {
        for (const listener of listeners[event.type] || []) listener(event)
        return true
      }),
    }

    Object.defineProperty(global, "window", { value: windowMock, configurable: true })
    return windowMock
  }

  afterEach(() => {
    jest.resetModules()
    Object.defineProperty(global, "window", { value: originalWindow, configurable: true })
    global.fetch = originalFetch
  })

  it("does not open the survey gate when trial consumption is disabled", async () => {
    const windowMock = installWindow()
    global.fetch = jest.fn(async () => ({
      json: async () => ({
        consumptionEnabled: false,
        autoPromptEnabled: true,
      }),
    })) as jest.Mock

    const { openTrialSurveyGate } = await import("@/lib/trial-survey-client")
    await expect(openTrialSurveyGate({ featureName: "当前功能" })).resolves.toBe(false)

    expect(windowMock.dispatchEvent).not.toHaveBeenCalled()
  })

  it("opens the survey gate when runtime flags allow it", async () => {
    const windowMock = installWindow()
    global.fetch = jest.fn(async () => ({
      json: async () => ({
        consumptionEnabled: true,
        autoPromptEnabled: true,
      }),
    })) as jest.Mock

    const { OPEN_DAILY_SURVEY_EVENT, openTrialSurveyGate } = await import("@/lib/trial-survey-client")
    await expect(openTrialSurveyGate({ featureName: "当前功能" })).resolves.toBe(true)

    expect(windowMock.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: OPEN_DAILY_SURVEY_EVENT }),
    )
  })
})
