import { extension_prompt_roles, extension_prompt_types } from '../../../../script.js';
import { default_prompt, default_summary_macros, default_long_template, default_short_template } from './constants.js';

// Global flags and whatnot
export let STOP_SUMMARIZATION = false;
export let SUMMARIZATION_DELAY_TIMEOUT = null;
export let SUMMARIZATION_DELAY_RESOLVE = null;

export function setStopSummarization(value) {
    STOP_SUMMARIZATION = value;
}

export function setSummarizationDelayTimeout(value) {
    SUMMARIZATION_DELAY_TIMEOUT = value;
}

export function setSummarizationDelayResolve(value) {
    SUMMARIZATION_DELAY_RESOLVE = value;
}


// Default settings
export const default_settings = {
    // inclusion criteria
    message_length_threshold: 10,
    include_user_messages: false,
    include_system_messages: false,
    include_narrator_messages: false,
    include_thought_messages: false,

    // summarization settings
    prompt: default_prompt,
    summary_prompt_macros: default_summary_macros,
    prompt_role: extension_prompt_roles.USER,
    prefill: "",
    show_prefill: false,
    completion_preset: "",
    connection_profile: "",

    auto_summarize: true,
    summarization_delay: 0,
    summarization_time_delay: 0,
    summarization_time_delay_skip_first: false,
    auto_summarize_batch_size: 1,
    auto_summarize_message_limit: 10,
    auto_summarize_on_edit: false,
    auto_summarize_on_swipe: true,
    auto_summarize_on_continue: false,
    auto_summarize_progress: true,
    auto_summarize_on_send: false,
    block_chat: true,

    // injection settings
    separate_long_term: false,
    summary_injection_separator: "\n* ",
    summary_injection_threshold: 0,
    exclude_messages_after_threshold: false,
    keep_last_user_message: true,

    long_template: default_long_template,
    long_term_context_limit: 10,
    long_term_context_type: 'percent',
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
    debug_mode: false,
    display_memories: true,
    default_chat_enabled: true,
    use_global_toggle_state: false,
};

export const global_settings = {
    profiles: {},
    character_profiles: {},
    chat_profiles: {},
    profile: 'Default',
    notify_on_profile_switch: false,
    chats_enabled: {},
    global_toggle_state: true,
    disabled_group_characters: {},
    memory_edit_interface_settings: {},
};

export const settings_ui_map = {};
