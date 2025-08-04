import { extension_prompt_roles, extension_prompt_types } from '../../../../script.js';
import { default_prompt, default_summary_macros, default_long_template, default_short_template } from './constants.js';

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

export const default_settings = {
    // inclusion criteria
    message_length_threshold: 10,  // minimum message token length for summarization
    include_user_messages: false,  // include user messages in summarization
    include_system_messages: false,  // include system messages in summarization (hidden messages)
    include_narrator_messages: false,  // include narrator messages in summarization (like from the /sys command)
    include_thought_messages: false,  // include thought messages in summarization (Stepped Thinking extension)

    // summarization settings
    prompt: default_prompt,
    summary_prompt_macros: default_summary_macros,  // macros for the summary prompt interface
    prompt_role: extension_prompt_roles.USER,
    prefill: "",   // summary prompt prefill
    show_prefill: false, // whether to show the prefill when memories are displayed
    completion_preset: "",  // completion preset to use for summarization. Empty ("") indicates the same as currently selected.
    connection_profile: "",

    auto_summarize: true,   // whether to automatically summarize new chat messages
    summarization_delay: 0,  // delay auto-summarization by this many messages (0 summarizes immediately after sending, 1 waits for one message, etc)
    summarization_time_delay: 0, // time in seconds to delay between summarizations
    summarization_time_delay_skip_first: false,  // skip the first delay after a character message
    auto_summarize_batch_size: 1,  // number of messages to summarize at once when auto-summarizing
    auto_summarize_message_limit: 10,  // maximum number of messages to go back for auto-summarization.
    auto_summarize_on_edit: false,  // whether to automatically re-summarize edited chat messages
    auto_summarize_on_swipe: true,  // whether to automatically summarize new message swipes
    auto_summarize_on_continue: false, // whether automatically re-summarize after a continue
    auto_summarize_progress: true,  // display a progress bar for auto-summarization
    auto_summarize_on_send: false,  // trigger auto-summarization right before a new message is sent
    block_chat: true,  // block input when summarizing

    // injection settings
    separate_long_term: false,  // whether to keep memories marked for long-term separate from short-term
    summary_injection_separator: "\n* ",  // separator when concatenating summaries
    summary_injection_threshold: 0,            // start injecting summaries after this many messages
    exclude_messages_after_threshold: false,   // remove messages from context after the summary injection threshold
    keep_last_user_message: true,  // keep the most recent user message in context

    long_template: default_long_template,
    long_term_context_limit: 10,  // context size to use as long-term memory limit
    long_term_context_type: 'percent',  // percent or tokens
    long_term_position: extension_prompt_types.IN_PROMPT,
    long_term_role: extension_prompt_roles.SYSTEM,
    long_term_depth: 2,
    long_term_scan: false,

    short_template: default_short_template,
    short_term_context_limit: 10,
    short_term_context_type: 'percent',
    short_term_position: extension_prompt_types.IN_PROMPT,
    short_term_depth: 2,
    short_term_role: extension_prompt_roles.SYSTEM,
    short_term_scan: false,

    // misc
    debug_mode: false,  // enable debug mode
    display_memories: true,  // display memories in the chat below each message
    default_chat_enabled: true,  // whether memory is enabled by default for new chats
    use_global_toggle_state: false,  // whether the on/off state for this profile uses the global state
};
export const global_settings = {
    profiles: {},  // dict of profiles by name
    character_profiles: {},  // dict of character identifiers to profile names
    chat_profiles: {},  // dict of chat identifiers to profile names
    profile: 'Default', // Current profile
    notify_on_profile_switch: false,
    chats_enabled: {},  // dict of chat IDs to whether memory is enabled
    global_toggle_state: true,  // global state of memory (used when a profile uses the global state)
    disabled_group_characters: {},  // group chat IDs mapped to a list of disabled character keys
    memory_edit_interface_settings: {},  // settings last used in the memory edit interface
}
export const settings_ui_map = {}  // map of settings to UI elements
