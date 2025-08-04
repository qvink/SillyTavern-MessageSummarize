export const state = {
    STOP_SUMMARIZATION: false,
    SUMMARIZATION_DELAY_TIMEOUT: null,
    SUMMARIZATION_DELAY_RESOLVE: null,
    last_message_swiped: null,
    last_message: null,
    memoryEditInterface: null,
    summaryPromptEditInterface: null,
    POPOUT_VISIBLE: false,
    settings_element: null,
    original_settings_parent: null,
    popout: null,
};

export function setStopSummarization(value) {
    state.STOP_SUMMARIZATION = value;
}

export function setSummarizationDelayTimeout(value) {
    state.SUMMARIZATION_DELAY_TIMEOUT = value;
}

export function setSummarizationDelayResolve(value) {
    state.SUMMARIZATION_DELAY_RESOLVE = value;
}
