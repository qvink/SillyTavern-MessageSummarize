export const MODULE_NAME = 'qvink_memory';
export const MODULE_NAME_FANCY = 'Qvink Memory';
export const PROGRESS_BAR_ID = `${MODULE_NAME}_progress_bar`;
export const REQUIRE_ST_VERSION = "1.13.2";

// CSS classes
export const css_message_div = `qvink_memory_display`;
export const css_short_memory = `qvink_short_memory`;
export const css_long_memory = `qvink_long_memory`;
export const css_remember_memory = `qvink_old_memory`;
export const css_exclude_memory = `qvink_exclude_memory`;
export const css_lagging_memory = `qvink_lagging_memory`;
export const css_removed_message = `qvink_removed_message`;
export const summary_div_class = `qvink_memory_text`;
export const summary_reasoning_class = 'qvink_memory_reasoning';
export const css_button_separator = `qvink_memory_button_separator`;
export const css_edit_textarea = `qvink_memory_edit_textarea`;
export const settings_div_id = `qvink_memory_settings`;
export const settings_content_class = `qvink_memory_settings_content`;
export const group_member_enable_button = `qvink_memory_group_member_enable`;
export const group_member_enable_button_highlight = `qvink_memory_group_member_enabled`;

// Macros
export const long_memory_macro = `qm-long-term-memory`;
export const short_memory_macro = `qm-short-term-memory`;
export const generic_memories_macro = `memories`;

// message button classes
export const remember_button_class = `${MODULE_NAME}_remember_button`;
export const summarize_button_class = `${MODULE_NAME}_summarize_button`;
export const edit_button_class = `${MODULE_NAME}_edit_button`;
export const forget_button_class = `${MODULE_NAME}_forget_button`;

// Default prompts and templates
export const default_prompt = `You are a summarization assistant. Summarize the given fictional narrative in a single, very short and concise statement of fact.
Responses should be no more than {{words}} words.
Include names when possible.
Response must be in the past tense.
Your response must ONLY contain the summary.

{{#if history}}
Following is a history of messages for context:
{{history}}
{{/if}}

Following is the message to summarize:
{{message}}
`;
export const default_long_template = `[Following is a list of events that occurred in the past]:\n{{${generic_memories_macro}}}\n`;
export const default_short_template = `[Following is a list of recent events]:\n{{${generic_memories_macro}}}\n`;

// Default macros for the summary prompt
export const default_summary_macros = {
    "message": {name: "message", default: true, enabled: true,  type: "special", instruct_template: false, apply_regex: true, description: "The message being summarized"},
    "words":   {name: "words",   default: true, enabled: true,  type: "custom",  instruct_template: false, apply_regex: false, command: "/qm-max-summary-tokens", description: "Max response tokens defined by the chosen completion preset"},
    "history": {name: "history", default: true, enabled: false, type: "preset",  instruct_template: true, apply_regex: true, start: 1, end: 6, bot_messages: true, user_messages: true, bot_summaries: false, user_summaries: false},
};
