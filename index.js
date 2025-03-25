import { getStringHash, debounce, copyText, trimToEndSentence, download, parseJsonFile, waitUntilCondition } from '../../../utils.js';
import { getContext, getApiUrl, extension_settings } from '../../../extensions.js';
import {
    animation_duration,
    scrollChatToBottom,
    extension_prompt_roles,
    extension_prompt_types,
    is_send_press,
    saveSettingsDebounced,
    generateRaw,
    getMaxContextSize,
    streamingProcessor,
    amount_gen,
    system_message_types,
    CONNECT_API_MAP,
    main_api
} from '../../../../script.js';
import { getPresetManager } from '../../../preset-manager.js'
import { formatInstructModeChat } from '../../../instruct-mode.js';
import { is_group_generating, selected_group, openGroupId } from '../../../group-chats.js';
import { loadMovingUIState, renderStoryString, power_user } from '../../../power-user.js';
import { dragElement } from '../../../RossAscends-mods.js';
import { debounce_timeout } from '../../../constants.js';
import { MacrosParser } from '../../../macros.js';
import { commonEnumProviders } from '../../../slash-commands/SlashCommandCommonEnumsProvider.js';
import { getRegexScripts } from '../../../../scripts/extensions/regex/index.js'
import { runRegexScript } from '../../../../scripts/extensions/regex/engine.js'

export { MODULE_NAME };

// THe module name modifies where settings are stored, where information is stored on message objects, macros, etc.
const MODULE_NAME = 'qvink_memory';
const MODULE_NAME_FANCY = 'Qvink Memory';
const PROGRESS_BAR_ID = `${MODULE_NAME}_progress_bar`;

// CSS classes (must match the CSS file because I'm too stupid to figure out how to do this properly)
const css_message_div = "qvink_memory_display"
const css_short_memory = "qvink_short_memory"
const css_long_memory = "qvink_long_memory"
const css_remember_memory = `qvink_old_memory`
const css_exclude_memory = `qvink_exclude_memory`
const summary_div_class = `qvink_memory_text`  // class put on all added summary divs to identify them
const summary_reasoning_class = 'qvink_memory_reasoning'
const css_button_separator = `qvink_memory_button_separator`
const css_edit_textarea = `qvink_memory_edit_textarea`
const settings_div_id = `qvink_memory_settings`  // ID of the main settings div.
const settings_content_class = `qvink_memory_settings_content` // Class for the main settings content div which is transferred to the popup
const group_member_enable_button = `qvink_memory_group_member_enable`
const group_member_enable_button_highlight = `qvink_memory_group_member_enabled`

// Macros for long-term and short-term memory injection
const long_memory_macro = `${MODULE_NAME}_long_memory`;
const short_memory_macro = `${MODULE_NAME}_short_memory`;

// message button classes
const remember_button_class = `${MODULE_NAME}_remember_button`
const summarize_button_class = `${MODULE_NAME}_summarize_button`
const edit_button_class = `${MODULE_NAME}_edit_button`
const forget_button_class = `${MODULE_NAME}_forget_button`
const delete_button_class = `${MODULE_NAME}_delete_button`

// global flags and whatnot
var STOP_SUMMARIZATION = false  // flag toggled when stopping summarization
var SUMMARIZATION_DELAY_TIMEOUT = null  // the set_timeout object for the summarization delay
var SUMMARIZATION_DELAY_RESOLVE = null

// Settings
const default_prompt = `You are a summarization assistant. Summarize the given fictional narrative in a single, very short and concise statement of fact.
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
`
const default_long_template = `{{#if ${long_memory_macro}}}\n[Following is a list of events that occurred in the past]:\n{{${long_memory_macro}}}\n{{/if}}`
const default_short_template = `{{#if ${short_memory_macro}}}\n[Following is a list of recent events]:\n{{${short_memory_macro}}}\n{{/if}}`
const default_settings = {
    // inclusion criteria
    message_length_threshold: 10,  // minimum message token length for summarization
    include_user_messages: false,  // include user messages in summarization
    include_system_messages: false,  // include system messages in summarization (hidden messages)
    include_narrator_messages: false,  // include narrator messages in summarization (like from the /sys command)
    include_thought_messages: false,  // include thought messages in summarization (Stepped Thinking extension)

    // summarization settings
    prompt: default_prompt,
    prefill: "",   // summary prompt prefill
    show_prefill: false, // whether to show the prefill when memories are displayed
    completion_preset: "",  // completion preset to use for summarization. Empty ("") indicates the same as currently selected.
    connection_profile: "",
    auto_summarize: true,   // whether to automatically summarize new chat messages
    summarization_delay: 0,  // delay auto-summarization by this many messages (0 summarizes immediately after sending, 1 waits for one message, etc)
    summarization_time_delay: 0, // time in seconds to delay between summarizations
    auto_summarize_batch_size: 1,  // number of messages to summarize at once when auto-summarizing
    auto_summarize_message_limit: 10,  // maximum number of messages to go back for auto-summarization.
    auto_summarize_on_edit: true,  // whether to automatically re-summarize edited chat messages
    auto_summarize_on_swipe: true,  // whether to automatically summarize new message swipes
    auto_summarize_progress: true,  // display a progress bar for auto-summarization
    auto_summarize_on_send: false,  // trigger auto-summarization right before a new message is sent

    include_world_info: false,  // include world info in context when summarizing
    block_chat: true,  // block input when summarizing
    nest_messages_in_prompt: false,  // nest messages to summarize in the prompt for summarization

    include_message_history: 3,  // include a number of previous messages in the prompt for summarization
    include_message_history_mode: 'none',  // mode for including message history in the prompt
    include_user_messages_in_history: false,  // include previous user message in the summarization prompt when including message history
    include_system_messages_in_history: false,  // include previous system messages in the summarization prompt when including message history
    include_thought_messages_in_history: false,  // include previous thought messages in the summarization prompt when including message history

    // injection settings
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
    limit_injected_messages: -1,  // limit the number of injected messages (-1 for no limit)
    summary_injection_separator: "\n* "  // separator when concatenating summaries
};
const global_settings = {
    profiles: {},  // dict of profiles by name
    character_profiles: {},  // dict of character identifiers to profile names
    chat_profiles: {},  // dict of chat identifiers to profile names
    profile: 'Default', // Current profile
    notify_on_profile_switch: false,
    chats_enabled: {},  // dict of chat IDs to whether memory is enabled
    global_toggle_state: true,  // global state of memory (used when a profile uses the global state)
    disabled_group_characters: {},  // group chat IDs mapped to a list of disabled character keys
    memory_edit_interface_settings: {}  // settings last used in the memory edit interface
}
const settings_ui_map = {}  // map of settings to UI elements


// Utility functions
function log(message) {
    console.log(`[${MODULE_NAME_FANCY}]`, message);
}
function debug(message) {
    if (get_settings('debug_mode')) {
        log("[DEBUG] "+message);
    }
}
function error(message) {
    console.error(`[${MODULE_NAME_FANCY}]`, message);
    toastr.error(message, MODULE_NAME_FANCY);
}

function toast(message, type="info") {
    // debounce the toast messages
    toastr[type](message, MODULE_NAME_FANCY);
}
const toast_debounced = debounce(toast, 500);

const saveChatDebounced = debounce(() => getContext().saveChat(), debounce_timeout.relaxed);
function count_tokens(text, padding = 0) {
    // count the number of tokens in a text
    let ctx = getContext();
    return ctx.getTokenCount(text, padding);
}
function get_context_size() {
    // Get the current context size
    return getMaxContextSize();
}
function get_long_token_limit() {
    // Get the long-term memory token limit, given the current context size and settings
    let long_term_context_limit = get_settings('long_term_context_limit');
    let number_type = get_settings('long_term_context_type')
    if (number_type === "percent") {
        let context_size = get_context_size();
        return Math.floor(context_size * long_term_context_limit / 100);
    } else {
        return long_term_context_limit
    }
}
function get_short_token_limit() {
    // Get the short-term memory token limit, given the current context size and settings
    let short_term_context_limit = get_settings('short_term_context_limit');
    let number_type = get_settings('short_term_context_type')
    if (number_type === "percent") {
        let context_size = get_context_size();
        return Math.floor(context_size * short_term_context_limit / 100);
    } else {
        return short_term_context_limit
    }
}
function get_current_character_identifier() {
    // uniquely identify the current character
    // You have to use the character's avatar image path to uniquely identify them
    let context = getContext();
    if (context.groupId) {
        return  // if a group is selected, return
    }

    // otherwise get the avatar image path of the current character
    let index = context.characterId;
    if (!index) {  // not a character
        return null;
    }

    return context.characters[index].avatar;
}
function get_current_chat_identifier() {
    // uniquely identify the current chat
    let context = getContext();
    if (context.groupId) {
        return context.groupId;
    }
    return context.chatId

}
function get_extension_directory() {
    // get the directory of the extension
    let index_path = new URL(import.meta.url).pathname
    return index_path.substring(0, index_path.lastIndexOf('/'))  // remove the /index.js from the path
}
function clean_string_for_title(text) {
    // clean a given string for use in a div title.
    return text.replace(/["&'<>]/g, function(match) {
        switch (match) {
            case '"': return "&quot;";
            case "&": return "&amp;";
            case "'": return "&apos;";
            case "<": return "&lt;";
            case ">": return "&gt;";
        }
    })
}
function escape_string(text) {
    // escape control characters in the text
    if (!text) return text
    return text.replace(/[\x00-\x1F\x7F]/g, function(match) {
        // Escape control characters
        switch (match) {
          case '\n': return '\\n';
          case '\t': return '\\t';
          case '\r': return '\\r';
          case '\b': return '\\b';
          case '\f': return '\\f';
          default: return '\\x' + match.charCodeAt(0).toString(16).padStart(2, '0');
        }
    });
}
function unescape_string(text) {
    // given a string with escaped characters, unescape them
    if (!text) return text
    return text.replace(/\\[ntrbf0x][0-9a-f]{2}|\\[ntrbf]/g, function(match) {
        switch (match) {
          case '\\n': return '\n';
          case '\\t': return '\t';
          case '\\r': return '\r';
          case '\\b': return '\b';
          case '\\f': return '\f';
          default: {
            // Handle escaped hexadecimal characters like \\xNN
            const hexMatch = match.match(/\\x([0-9a-f]{2})/i);
            if (hexMatch) {
              return String.fromCharCode(parseInt(hexMatch[1], 16));
            }
            return match; // Return as is if no match
          }
        }
    });
}


// Completion presets
function get_current_preset() {
    // get the currently selected completion preset
    return getPresetManager().getSelectedPresetName()
}
async function get_summary_preset() {
    // get the current summary preset OR the default if it isn't valid for the current API
    let preset_name = get_settings('completion_preset');
    if (preset_name === "" || !await verify_preset(preset_name)) {  // none selected or invalid, use the current preset
        preset_name = get_current_preset();
    }
    return preset_name
}
async function set_preset(name) {
    if (name === get_current_preset()) return;  // If already using the current preset, return

    if (!check_preset_valid()) return;  // don't set an invalid preset

    // Set the completion preset
    debug(`Setting completion preset to ${name}`)
    if (get_settings('debug_mode')) {
        toastr.info(`Setting completion preset to ${name}`);
    }
    let ctx = getContext();
    await ctx.executeSlashCommandsWithOptions(`/preset ${name}`)
}
async function get_presets() {
    // Get the list of available completion presets for the selected connection profile API
    let summary_api = await get_connection_profile_api()  // API for the summary connection profile (undefined if not active)
    let { presets, preset_names } = getPresetManager().getPresetList(summary_api)  // presets for the given API (current if undefined)
    // array of names
    if (Array.isArray(preset_names)) return preset_names
    // object of {names: index}
    return Object.keys(preset_names)
}
async function verify_preset(name) {
    // check if the given preset name is valid for the current API
    if (name === "") return true;  // no preset selected, always valid

    let preset_names = await get_presets()

    if (Array.isArray(preset_names)) {  // array of names
        return preset_names.includes(name)
    } else {  // object of {names: index}
        return preset_names[name] !== undefined
    }

}
async function check_preset_valid() {
    // check whether the current preset selected for summarization is valid
    let summary_preset = get_settings('completion_preset')
    let valid_preset = await verify_preset(summary_preset)
    if (!valid_preset) {
        toast_debounced(`Your selected summary preset "${summary_preset}" is not valid for the current API.`, "warning")
        return false
    }
    return true
}
async function get_summary_preset_max_tokens() {
    // get the maximum token length for the chosen summary preset
    let preset_name = await get_summary_preset()
    let preset = getPresetManager().getCompletionPresetByName(preset_name)

    // if the preset doesn't have a genamt (which it may not for some reason), use the current genamt. See https://discord.com/channels/1100685673633153084/1100820587586273343/1341566534908121149
    // Also if you are using chat completion, it's openai_max_tokens instead.
    let max_tokens = preset?.genamt || preset?.openai_max_tokens || amount_gen
    debug("Got summary preset genamt: "+max_tokens)

    return max_tokens
}

// Connection profiles
let connection_profiles_active;
function check_connection_profiles_active() {
    // detect whether the connection profiles extension is active by checking for the UI elements
    if (connection_profiles_active === undefined) {
        connection_profiles_active = $('#sys-settings-button').find('#connection_profiles').length > 0
    }
    return connection_profiles_active;
}
async function get_current_connection_profile() {
    if (!check_connection_profiles_active()) return;  // if the extension isn't active, return
    // get the current connection profile
    let ctx = getContext();
    let result = await ctx.executeSlashCommandsWithOptions(`/profile`)
    return result.pipe
}
async function get_connection_profile_api(name) {
    // Get the API for the given connection profile name. If not given, get the current summary profile.
    if (!check_connection_profiles_active()) return;  // if the extension isn't active, return
    if (name === undefined) name = await get_summary_connection_profile()
    let ctx = getContext();
    let result = await ctx.executeSlashCommandsWithOptions(`/profile-get ${name}`)

    if (!result.pipe) {
        debug(`/profile-get ${name} returned nothing - no connection profile selected`)
        return
    }

    let data;
    try {
        data = JSON.parse(result.pipe)
    } catch {
        error(`Failed to parse JSON from /profile-get for \"${name}\". Result:`)
        error(result)
        return
    }

    // need to map the API type to a completion API
    if (CONNECT_API_MAP[data.api] === undefined) {
        error(`API type "${data.api}" not found in CONNECT_API_MAP - could not identify API.`)
        return
    }
    return CONNECT_API_MAP[data.api].selected
}
async function get_summary_connection_profile() {
    // get the current connection profile OR the default if it isn't valid for the current API
    let name = get_settings('connection_profile');

    // If none selected, invalid, or connection profiles not active, use the current profile
    if (name === "" || !await verify_connection_profile(name) || !check_connection_profiles_active()) {
        name = await get_current_connection_profile();
    }

    return name
}
async function set_connection_profile(name) {
    // Set the connection profile
    if (!check_connection_profiles_active()) return;  // if the extension isn't active, return
    if (name === await get_current_connection_profile()) return;  // If already using the current preset, return
    if (!await check_connection_profile_valid()) return;  // don't set an invalid preset

    // Set the completion preset
    debug(`Setting connection profile to "${name}"`)
    if (get_settings('debug_mode')) {
        toastr.info(`Setting connection profile to "${name}"`);
    }
    let ctx = getContext();
    await ctx.executeSlashCommandsWithOptions(`/profile ${name}`)
}
async function get_connection_profiles() {
    // Get a list of available connection profiles

    if (!check_connection_profiles_active()) return;  // if the extension isn't active, return
    let ctx = getContext();
    let result = await ctx.executeSlashCommandsWithOptions(`/profile-list`)
    try {
        return JSON.parse(result.pipe)
    } catch {
        error("Failed to parse JSON from /profile-list. Result:")
        error(result)
    }

}
async function verify_connection_profile(name) {
    // check if the given connection profile name is valid
    if (!check_connection_profiles_active()) return;  // if the extension isn't active, return
    if (name === "") return true;  // no profile selected, always valid

    let names = await get_connection_profiles()
    return names.includes(name)
}
async function check_connection_profile_valid()  {
    // check whether the current connection profile selected for summarization is valid
    if (!check_connection_profiles_active()) return;  // if the extension isn't active, return
    let summary_connection = get_settings('connection_profile')
    let valid = await verify_connection_profile(summary_connection)
    if (!valid) {
        toast_debounced(`Your selected summary connection profile "${summary_connection}" is not valid.`, "warning")
    }
    return valid
}



// Settings Management
function initialize_settings() {
    if (extension_settings[MODULE_NAME] !== undefined) {  // setting already initialized
        log("Settings already initialized.")
        soft_reset_settings();
    } else {  // no settings present, first time initializing
        log("Extension settings not found. Initializing...")
        hard_reset_settings();
    }

    // load default profile
    load_profile();
}
function hard_reset_settings() {
    // Set the settings to the completely fresh values, deleting all profiles too
    if (global_settings['profiles']['Default'] === undefined) {  // if the default profile doesn't exist, create it
        global_settings['profiles']['Default'] = structuredClone(default_settings);
    }
    extension_settings[MODULE_NAME] = structuredClone({
        ...default_settings,
        ...global_settings
    });
}
function soft_reset_settings() {
    // fix any missing settings without destroying profiles
    extension_settings[MODULE_NAME] = Object.assign(
        structuredClone(default_settings),
        structuredClone(global_settings),
        extension_settings[MODULE_NAME]
    );

    // check for any missing profiles
    let profiles = get_settings('profiles');
    if (Object.keys(profiles).length === 0) {
        log("No profiles found, creating default profile.")
        profiles['Default'] = structuredClone(default_settings);
        set_settings('profiles', profiles);
    } else { // for each existing profile, add any missing default settings without overwriting existing settings
        for (let [profile, settings] of Object.entries(profiles)) {
            profiles[profile] = Object.assign(structuredClone(default_settings), settings);
        }
        set_settings('profiles', profiles);
    }
}
function reset_settings() {
    // reset the current profile-specific settings to default
    Object.assign(extension_settings[MODULE_NAME], structuredClone(default_settings))
    refresh_settings();   // refresh the UI
}
function set_settings(key, value) {
    // Set a setting for the extension and save it
    extension_settings[MODULE_NAME][key] = value;
    saveSettingsDebounced();
}
function get_settings(key) {
    // Get a setting for the extension, or the default value if not set
    return extension_settings[MODULE_NAME]?.[key] ?? default_settings[key];
}
async function get_manifest() {
    // Get the manifest.json for the extension
    let module_dir = get_extension_directory();
    let path = `${module_dir}/manifest.json`
    let response = await fetch(path)
    if (response.ok) {
        return await response.json();
    }
    error(`Error getting manifest.json from "${path}": status: ${response.status}`);
}
async function load_settings_html() {
    // fetch the settings html file and append it to the settings div.
    log("Loading settings.html...")

    let module_dir = get_extension_directory()
    let path = `${module_dir}/settings.html`
    let found = await $.get(path).then(async response => {
        log(`Loaded settings.html at "${path}"`)
        $("#extensions_settings2").append(response);  // load html into the settings div\
        return true
    }).catch((response) => {
        error(`Error getting settings.json from "${path}": status: ${response.status}`);
        return false
    })

    return new Promise(resolve => resolve(found))
}
function chat_enabled() {
    // check if the extension is enabled in the current chat
    let context = getContext();

    // global state
    if (get_settings('use_global_toggle_state')) {
        return get_settings('global_toggle_state')
    }

    // per-chat state
    return get_settings('chats_enabled')?.[context.chatId] ?? get_settings('default_chat_enabled')
}
function toggle_chat_enabled(value=null) {
    // Change the state of the extension. If value is null, toggle. Otherwise, set to the given value
    let current = chat_enabled();

    if (value === null) {  // toggle
        value = !current;
    } else if (value === current) {
        return;  // no change
    }

    // set the new value
    if (get_settings('use_global_toggle_state')) {   // using the global state - update the global state
        set_settings('global_toggle_state', value);
    } else {  // using per-chat state - update the chat state
        let enabled = get_settings('chats_enabled');
        let context = getContext();
        enabled[context.chatId] = value;
        set_settings('chats_enabled', enabled);
    }


    if (value) {
        toastr.info(`Memory is now enabled for this chat`);
    } else {
        toastr.warning(`Memory is now disabled for this chat`);
    }
    refresh_memory()

    // update the message visuals
    update_all_message_visuals()  //not needed? happens in update_message_influsion_flags

    // refresh settings UI
    refresh_settings()

    // scroll to the bottom of the chat
    scrollChatToBottom()
}
function character_enabled(character_key) {
    // check if the given character is enabled for summarization in the current chat
    let group_id = selected_group
    if (selected_group === null) return true;  // not in group chat, always enabled

    let disabled_characters_settings = get_settings('disabled_group_characters')
    let disabled_characters = disabled_characters_settings[group_id]
    if (!disabled_characters) return true;
    return !disabled_characters.includes(character_key)

}
function toggle_character_enabled(character_key) {
    // Toggle whether the given character is enabled for summarization in the current chat
    let group_id = selected_group
    if (group_id === undefined) return true;  // not in group chat, always enabled

    let disabled_characters_settings = get_settings('disabled_group_characters')
    let disabled_characters = disabled_characters_settings[group_id] || []
    let disabled = disabled_characters.includes(character_key)

    if (disabled) {  // if currently disabled, enable by removing it from the disabled set
        disabled_characters.splice(disabled_characters.indexOf(character_key), 1);
    } else {  // if enabled, disable by adding it to the disabled set
        disabled_characters.push(character_key);
    }

    disabled_characters_settings[group_id] = disabled_characters
    set_settings('disabled_group_characters', disabled_characters_settings)
    debug(`${disabled ? "Enabled" : "Disabled"} group character summarization (${character_key})`)
    refresh_memory()
}


/**
 * Bind a UI element to a setting.
 * @param selector {string} jQuery Selector for the UI element
 * @param key {string} Key of the setting
 * @param type {string} Type of the setting (number, boolean)
 * @param callback {function} Callback function to run when the setting is updated
 * @param disable {boolean} Whether to disable the element when chat is disabled
 */
function bind_setting(selector, key, type=null, callback=null, disable=true) {
    // Bind a UI element to a setting, so if the UI element changes, the setting is updated
    selector = `.${settings_content_class} ${selector}`  // add the settings div to the selector
    let element = $(selector)
    settings_ui_map[key] = [element, type]

    // if no elements found, log error
    if (element.length === 0) {
        error(`No element found for selector [${selector}] for setting [${key}]`);
        return;
    }

    // mark as a settings UI function
    if (disable) {
        element.addClass('settings_input');
    }

    // default trigger for a settings update is on a "change" event (as opposed to an input event)
    let trigger = 'change';

    // Set the UI element to the current setting value
    set_setting_ui_element(key, element, type);

    // Make the UI element update the setting when changed
    element.on(trigger, function (event) {
        let value;
        if (type === 'number') {  // number input
            value = Number($(this).val());
        } else if (type === 'boolean') {  // checkbox
            value = Boolean($(this).prop('checked'));
        } else {  // text, dropdown, select2
            value = $(this).val();
            value = unescape_string(value)  // ensures values like "\n" are NOT escaped from input
        }

        // update the setting
        set_settings(key, value)

        // trigger callback if provided, passing the new value
        if (callback !== null) {
            callback(value);
        }

        // update all other settings UI elements
        refresh_settings()

        // refresh memory state (update message inclusion criteria, etc)
        if (trigger === 'change') {
            refresh_memory();
        } else if (trigger === 'input') {
            refresh_memory_debounced();  // debounce the refresh for input elements
        }
    });
}
function bind_function(selector, func, disable=true) {
    // bind a function to an element (typically a button or input)
    // if disable is true, disable the element if chat is disabled
    selector = `.${settings_content_class} ${selector}`
    let element = $(selector);
    if (element.length === 0) {
        error(`No element found for selector [${selector}] when binding function`);
        return;
    }

    // mark as a settings UI element
    if (disable) {
        element.addClass('settings_input');
    }

    // check if it's an input element, and bind a "change" event if so
    if (element.is('input')) {
        element.on('change', function (event) {
            func(event);
        });
    } else {  // otherwise, bind a "click" event
        element.on('click', function (event) {
            func(event);
        });
    }
}
function set_setting_ui_element(key, element, type) {
    // Set a UI element to the current setting value
    let radio = false;
    if (element.is('input[type="radio"]')) {
        radio = true;
    }

    // get the setting value
    let setting_value = get_settings(key);
    if (type === "text") {
        setting_value = escape_string(setting_value)  // escape values like "\n"
    }

    // initialize the UI element with the setting value
    if (radio) {  // if a radio group, select the one that matches the setting value
        let selected = element.filter(`[value="${setting_value}"]`)
        if (selected.length === 0) {
            error(`Error: No radio button found for value [${setting_value}] for setting [${key}]`);
            return;
        }
        selected.prop('checked', true);
    } else {  // otherwise, set the value directly
        if (type === 'boolean') {  // checkbox
            element.prop('checked', setting_value);
        } else {  // text input or dropdown
            element.val(setting_value);
        }
    }
}
function update_save_icon_highlight() {
    // If the current settings are different than the current profile, highlight the save button
    if (detect_settings_difference()) {
        $('#save_profile').addClass('button_highlight');
    } else {
        $('#save_profile').removeClass('button_highlight');
    }
}
function update_profile_section() {
    let context = getContext()

    let current_profile = get_settings('profile')
    let current_character_profile = get_character_profile();
    let current_chat_profile = get_chat_profile();
    let profile_options = Object.keys(get_settings('profiles'));

    let $choose_profile_dropdown = $(`.${settings_content_class} #profile`).empty();
    let $character = $('button#character_profile')
    let $chat = $('button#chat_profile')
    let $character_icon = $character.find('i')
    let $chat_icon = $chat.find('i')


    // Set the profile dropdowns to reflect the available profiles and the currently chosen one
    for (let profile of profile_options) {
        // if the current character/chat has a default profile, indicate as such
        let text = profile
        if (profile === current_character_profile) {
            text = `${profile} (character)`
        } else if (profile === current_chat_profile) {
            text = `${profile} (chat)`
        }
        $choose_profile_dropdown.append(`<option value="${profile}">${text}</option>`);
    }

    // if (current_character_profile) {  // set the current chosen profile in the dropdown
    //     choose_profile_dropdown.val(current_character_profile);
    // }


    // When in a group chat, the character profile lock is disabled
    if (context.groupId) {
        $character.prop('disabled', true)
    }

    // button highlights and icons

    let lock_class = 'fa-lock'
    let unlock_class = 'fa-unlock'
    let highlight_class = 'button_highlight'

    if (current_character_profile === current_profile) {
        $character.addClass(highlight_class);
        $character_icon.removeClass(unlock_class)
        $character_icon.addClass(lock_class)
    } else {
        $character.removeClass(highlight_class)
        $character_icon.removeClass(lock_class)
        $character_icon.addClass(unlock_class)
    }

    if (current_chat_profile === current_profile) {
        $chat.addClass(highlight_class);
        $chat_icon.removeClass(unlock_class)
        $chat_icon.addClass(lock_class)
    } else {
        $chat.removeClass(highlight_class)
        $chat_icon.removeClass(lock_class)
        $chat_icon.addClass(unlock_class)
    }
}
async function update_preset_dropdown() {
    // set the completion preset dropdown
    let $preset_select = $(`.${settings_content_class} #completion_preset`);
    let summary_preset = get_settings('completion_preset')
    let preset_options = await get_presets()
    $preset_select.empty();
    $preset_select.append(`<option value="">Same as Current</option>`)
    for (let option of preset_options) {  // construct the dropdown options
        $preset_select.append(`<option value="${option}">${option}</option>`)
    }
    $preset_select.val(summary_preset)

    // set a click event to refresh the preset dropdown for the currently available presets
    $preset_select.off('click').on('click', () => update_preset_dropdown());

}
async function update_connection_profile_dropdown() {
    // set the completion preset dropdown
    let $connection_select = $(`.${settings_content_class} #connection_profile`);
    let summary_connection = get_settings('connection_profile')
    let connection_options = await get_connection_profiles()
    $connection_select.empty();
    $connection_select.append(`<option value="">Same as Current</option>`)
    for (let option of connection_options) {  // construct the dropdown options
        $connection_select.append(`<option value="${option}">${option}</option>`)
    }
    $connection_select.val(summary_connection)

    // set a click event to refresh the dropdown
    $connection_select.off('click').on('click', () => update_connection_profile_dropdown());
}
function refresh_settings() {
    // Refresh all settings UI elements according to the current settings
    debug("Refreshing settings...")

    // connection profiles
    if (check_connection_profiles_active()) {
        update_connection_profile_dropdown()
        check_connection_profile_valid()
    } else { // if connection profiles extension isn't active, hide the connection profile dropdown
        $(`.${settings_content_class} #connection_profile`).parent().hide()
        debug("Connection profiles extension not active. Hiding connection profile dropdown.")
    }

    // completion presets
    update_preset_dropdown()
    check_preset_valid()

    // if prompt doesn't have {{message}}, insert it
    if (!get_settings('prompt').includes("{{message}}")) {
        set_settings('prompt', get_settings('prompt') + "\n{{message}}")
        debug("{{message}} macro not found in summary prompt. It has been added automatically.")
    }

    // auto_summarize_message_limit must be >= auto_summarize_batch_size
    if (get_settings('auto_summarize_message_limit') < get_settings('auto_summarize_batch_size')) {
        set_settings('auto_summarize_message_limit', get_settings('auto_summarize_batch_size'));
        toast("The auto-summarize message limit must be greater than or equal to the batch size.", "warning")
    }

    // enable or disable settings based on others
    if (chat_enabled()) {
        $(`.${settings_content_class} .settings_input`).prop('disabled', false);  // enable all settings

        // when auto-summarize is disabled, related settings get disabled
        let auto_summarize = get_settings('auto_summarize');
        $('#auto_summarize_on_send').prop('disabled', !auto_summarize)
        $('#auto_summarize_message_limit').prop('disabled', !auto_summarize);
        $('#auto_summarize_batch_size').prop('disabled', !auto_summarize);
        $('#auto_summarize_progress').prop('disabled', !auto_summarize);
        $('#summarization_delay').prop('disabled', !auto_summarize);

        // If message history is disabled, disable the relevant settings
        let history_disabled = get_settings('include_message_history_mode') === "none";
        $('#include_message_history').prop('disabled', history_disabled);
        $('#include_user_messages_in_history').prop('disabled', history_disabled);
        $('#preview_message_history').prop('disabled', history_disabled);
        //$('#include_system_messages_in_history').prop('disabled', disabled);
        //$('#include_thought_messages_in_history').prop('disabled', disabled);
        if (!history_disabled && !get_settings('prompt').includes("{{history}}")) {
            toastr.warning("To include message history, you must use the {{history}} macro in the prompt.")
        }

    } else {  // memory is disabled for this chat
        $(`.${settings_content_class} .settings_input`).prop('disabled', true);  // disable all settings
    }

    // update the save icon highlight
    update_save_icon_highlight();

    // update the profile section
    update_profile_section()

    // iterate through the settings map and set each element to the current setting value
    for (let [key, [element, type]] of Object.entries(settings_ui_map)) {
        set_setting_ui_element(key, element, type);
    }


    //////////////////////
    // Settings not in the config

    // set group chat character enable button state
    set_character_enabled_button_states()

}

// some unused function for a multiselect
function refresh_character_select() {
    // sets the select2 multiselect for choosing a list of characters
    let context = getContext()

    // get all characters present in the current chat
    let char_id = context.characterId;
    let group_id = context.groupId;
    let character_options = []  // {id, name}
    if (char_id !== undefined && char_id !== null) {  // we are in an individual chat, add the character
        let id = context.characters[char_id].avatar
        character_options.push({id: id, name: context.characters[char_id].name})
    } else if (group_id) {   // we are in a group - add all members
        let group = context.groups.find(g => g.id == group_id)  // find the group we are in by ID
        for (let key of group.members) {
            let char = context.characters.find(c => c.avatar == key)
            character_options.push({id: key, name: char.name})  // add all group members to options
        }
    }

    // add the user to the list of options
    character_options.push({id: "user", name: "User (you)"})

    // set the current value (default if empty)
    let current_selection = get_settings('characters_to_summarize')
    log(current_selection)

    // register the element as a select2 widget
    refresh_select2_element('characters_to_summarize', current_selection, character_options,'No characters filtered - all will be summarized.')

}

/*
Use like this:
<div class="flex-container justifySpaceBetween alignItemsCenter">
    <label title="description here">
        <span>label here</span>
        <select id="id_here" multiple="multiple" class="select2_multi_sameline"></select>
    </label>
</div>
 */
function refresh_select2_element(id, selected, options, placeholder="") {
    // Refresh a select2 element with the given ID (a select element) and set the options

    // check whether the dropdown is open. If so, don't update the options (it messes with the widget)
    let $dropdown = $(`#select2-${id}-results`)
    if ($dropdown.length > 0) {
        return
    }

    let $select = $(`#${id}`)
    $select.empty()  // clear current options

    // add the options to the dropdown
    for (let {id, name} of options) {
        let option = $(`<option value="${id}">${name}</option>`)
        $select.append(option);
    }

    // If the select2 widget hasn't been created yet, create it
    let $widget = $(`.${settings_content_class} ul#select2-${id}-container`)
    if ($widget.length === 0) {
        $select.select2({  // register as a select2 element
            width: '100%',
            placeholder: placeholder,
            allowClear: true,
            closeOnSelect: false,
        });

        // select2ChoiceClickSubscribe($select, () => {
        //     log("CLICKED")
        // }, {buttonStyle: true, closeDrawer: true});

        //$select.on('select2:unselect', unselect_callback);
        //$select.on('select2:select', select_callback);
    }

    // set current selection.
    // change.select2 lets the widget update itself, but doesn't trigger the change event (which would cause infinite recursion).
    $select.val(selected)
    $select.trigger('change.select2')
}




// Profile management
function copy_settings(profile=null) {
    // copy the setting from the given profile (or current settings if none provided)
    let settings;

    if (!profile) {  // no profile given, copy current settings
        settings = structuredClone(extension_settings[MODULE_NAME]);
    } else {  // copy from the profile
        let profiles = get_settings('profiles');
        if (profiles[profile] === undefined) {  // profile doesn't exist, return empty
            return {}
        }

        // copy the settings from the profile
        settings = structuredClone(profiles[profile]);
    }

    // remove global settings from the copied settings
    for (let key of Object.keys(global_settings)) {
        delete settings[key];
    }
    return settings;
}
function detect_settings_difference(profile=null) {
    // check if the current settings differ from the given profile
    if (!profile) {  // if none provided, compare to the current profile
        profile = get_settings('profile')
    }
    let current_settings = copy_settings();
    let profile_settings = copy_settings(profile);

    let different = false;
    for (let key of Object.keys(profile_settings)) {
        if (profile_settings[key] !== current_settings[key]) {
            different = true;
            break;
        }
    }
    return different;
}
function save_profile(profile=null) {
    // Save the current settings to the given profile
    if (!profile) {  // if none provided, save to the current profile
        profile = get_settings('profile');
    }
    log("Saving Configuration Profile: "+profile);

    // save the current settings to the profile
    let profiles = get_settings('profiles');
    profiles[profile] = copy_settings();
    set_settings('profiles', profiles);

    // check preset validity
    check_preset_valid()

    // update the button highlight
    update_save_icon_highlight();
}
function load_profile(profile=null) {
    // load a given settings profile
    let current_profile = get_settings('profile')
    if (!profile) {  // if none provided, reload the current profile
        profile = current_profile
    }

    let settings = copy_settings(profile);  // copy the settings from the profile
    if (!settings) {
        error("Profile not found: "+profile);
        return;
    }

    log("Loading Configuration Profile: "+profile);
    Object.assign(extension_settings[MODULE_NAME], settings);  // update the settings
    set_settings('profile', profile);  // set the current profile
    if (get_settings("notify_on_profile_switch") && current_profile !== profile) {
        toast(`Switched to profile "${profile}"`, 'info')
    }
    refresh_settings();
}
function export_profile(profile=null) {
    // export a settings profile
    if (!profile) {  // if none provided, reload the current profile
        profile = get_settings('profile')
    }

    let settings = copy_settings(profile);  // copy the settings from the profile
    if (!settings) {
        error("Profile not found: "+profile);
        return;
    }

    log("Exporting Configuration Profile: "+profile);
    const data = JSON.stringify(settings, null, 4);
    download(data, `${profile}.json`, 'application/json');
}
async function import_profile(e) {
    let file = e.target.files[0];
    if (!file) {
        return;
    }

    const name = file.name.replace('.json', '')
    const data = await parseJsonFile(file);

    // save to the profile
    let profiles = get_settings('profiles');
    profiles[name] = data
    set_settings('profiles', profiles);

    toast(`Qvink Memory profile \"${name}\" imported`, 'success')
    e.target.value = null;

    refresh_settings()
}
async function rename_profile() {
    // Rename the current profile via user input
    let ctx = getContext();
    let old_name = get_settings('profile');
    let new_name = await ctx.Popup.show.input("Rename Configuration Profile", `Enter a new name:`, old_name);

    // if it's the same name or none provided, do nothing
    if (!new_name || old_name === new_name) {
        return;
    }

    let profiles = get_settings('profiles');

    // check if the new name already exists
    if (profiles[new_name]) {
        error(`Profile [${new_name}] already exists`);
        return;
    }

    // rename the profile
    profiles[new_name] = profiles[old_name];
    delete profiles[old_name];
    set_settings('profiles', profiles);
    set_settings('profile', new_name);  // set the current profile to the new name

    // if any characters are using the old profile, update it to the new name
    let character_profiles = get_settings('character_profiles');
    for (let [character_key, character_profile] of Object.entries(character_profiles)) {
        if (character_profile === old_name) {
            character_profiles[character_key] = new_name;
        }
    }

    log(`Renamed profile [${old_name}] to [${new_name}]`);
    refresh_settings()
}
function new_profile() {
    // create a new profile
    let profiles = get_settings('profiles');
    let profile = 'New Profile';
    let i = 1;
    while (profiles[profile]) {
        profile = `New Profile ${i}`;
        i++;
    }
    save_profile(profile);
    load_profile(profile);
}
function delete_profile() {
    // Delete the current profile
    if (get_settings('profiles').length === 1) {
        error("Cannot delete your last profile");
        return;
    }
    let profile = get_settings('profile');
    let profiles = get_settings('profiles');

    // delete the profile
    delete profiles[profile];
    set_settings('profiles', profiles);
    toast(`Deleted Configuration Profile: \"${profile}\"`, "success");

    // remove any references to this profile connected to characters or chats
    let character_profiles = get_settings('character_profiles')
    let chat_profiles = get_settings('chat_profiles')
    for (let [id, name] of Object.entries(character_profiles)) {
        if (name === profile) {
            delete character_profiles[id]
        }
    }
    for (let [id, name] of Object.entries(chat_profiles)) {
        if (name === profile) {
            delete chat_profiles[id]
        }
    }
    set_settings('character_profiles', character_profiles)
    set_settings('chat_profiles', chat_profiles)

    auto_load_profile()
}
function toggle_character_profile() {
    // Toggle whether the current profile is set to the default for the current character
    let key = get_current_character_identifier();  // uniquely identify the current character or group chat
    log("Character Key: "+key)
    if (!key) {  // no character selected
        return;
    }

    // current profile
    let profile = get_settings('profile');

    // if the character profile is already set to the current profile, unset it.
    // otherwise, set it to the current profile.
    set_character_profile(key, profile === get_character_profile() ? null : profile);
}
function toggle_chat_profile() {
    // Toggle whether the current profile is set to the default for the current character
    let key = get_current_chat_identifier();  // uniquely identify the current chat
    log("Chat ID: "+key)
    if (!key) {  // no chat selected
        return;
    }

    // current profile
    let profile = get_settings('profile');

    // if the chat profile is already set to the current profile, unset it.
    // otherwise, set it to the current profile.
    set_chat_profile(key, profile === get_chat_profile() ? null : profile);
}
function get_character_profile(key) {
    // Get the profile for a given character
    if (!key) {  // if none given, assume the current character
        key = get_current_character_identifier();
    }
    let character_profiles = get_settings('character_profiles');
    return character_profiles[key]
}
function set_character_profile(key, profile=null) {
    // Set the profile for a given character (or unset it if no profile provided)
    let character_profiles = get_settings('character_profiles');

    if (profile) {
        character_profiles[key] = profile;
        log(`Set character [${key}] to use profile [${profile}]`);
    } else {
        delete character_profiles[key];
        log(`Unset character [${key}] default profile`);
    }

    set_settings('character_profiles', character_profiles);
    refresh_settings()
}
function get_chat_profile(id) {
    // Get the profile for a given chat
    if (!id) {  // if none given, assume the current character
        id = get_current_chat_identifier();
    }
    let profiles = get_settings('chat_profiles');
    return profiles[id]
}
function set_chat_profile(id, profile=null) {
    // Set the profile for a given chat (or unset it if no profile provided)
    let chat_profiles = get_settings('chat_profiles');

    if (profile) {
        chat_profiles[id] = profile;
        log(`Set chat [${id}] to use profile [${profile}]`);
    } else {
        delete chat_profiles[id];
        log(`Unset chat [${id}] default profile`);
    }

    set_settings('chat_profiles', chat_profiles);
    refresh_settings()
}
function auto_load_profile() {
    // Load the settings profile for the current chat or character
    let profile = get_chat_profile() || get_character_profile();
    load_profile(profile || 'Default');
    refresh_settings()
}



// UI functions
function get_message_div(index) {
    // given a message index, get the div element for that message
    // it will have an attribute "mesid" that is the message index
    let div = $(`div[mesid="${index}"]`);
    if (div.length === 0) {
        return null;
    }
    return div;
}
function get_summary_style_class(message) {
    let include = get_data(message, 'include');
    let remember = get_data(message, 'remember');
    let exclude = get_data(message, 'exclude');  // force-excluded by user

    if (remember && include) {  // marked to be remembered and included in memory anywhere
        return  css_long_memory
    } else if (include === "short") {  // not marked to remember, but included in short-term memory
        return css_short_memory
    } else if (remember) {  // marked to be remembered but not included in memory
        return css_remember_memory
    } else if (exclude) {  // marked as force-excluded
        return css_exclude_memory
    }
}
function update_message_visuals(i, style=true, text=null) {
    // Update the message visuals according to its current memory status
    // Each message div will have a div added to it with the memory for that message.
    // Even if there is no memory, I add the div because otherwise the spacing changes when the memory is added later.

    // div not found (message may not be loaded)
    let div_element = get_message_div(i);
    if (!div_element) {
        return;
    }

    // remove any existing added divs
    div_element.find(`div.${summary_div_class}`).remove();

    // If setting isn't enabled, don't display memories
    if (!get_settings('display_memories') || !chat_enabled()) {
        return;
    }

    let chat = getContext().chat;
    let message = chat[i];
    let error_message = get_data(message, 'error');
    let reasoning = get_data(message, 'reasoning')
    let memory = get_memory(message)

    // get the div holding the main message text
    let message_element = div_element.find('div.mes_text');

    let style_class = "";
    if (style) {
        style_class = get_summary_style_class(message)
    }

    // if no text is provided, use the memory text
    if (!text) {
        text = ""  // default text when no memory
        if (memory) {
            text = clean_string_for_title(`Memory: ${memory}`)
        } else if (error_message) {
            style_class = ''  // clear the style class if there's an error
            text = `Error: ${error_message}`
        }
    }

    // create the div element for the memory and add it to the message div
    let memory_div = $(`<div class="${summary_div_class} ${css_message_div}"><span class="${style_class}">${text}</span></div>`)
    if (reasoning) {
        reasoning = clean_string_for_title(reasoning)
        memory_div.prepend($(`<span class="${summary_reasoning_class}" title="${reasoning}">[Reasoning] </span>`))
    }
    message_element.after(memory_div);

    // add a click event to the memory div to edit the memory
    memory_div.on('click', function () {
        open_edit_memory_input(i);
    })
}
function update_all_message_visuals() {
    // update the message visuals of each visible message, styled according to the inclusion criteria
    let chat = getContext().chat
    let first_displayed_message_id = Number($('#chat').children('.mes').first().attr('mesid'))
    for (let i=chat.length-1; i >= first_displayed_message_id; i--) {
        update_message_visuals(i, true);
    }
}
function open_edit_memory_input(index) {
    // Allow the user to edit a message summary
    let message = getContext().chat[index];
    let memory = get_memory(message)
    memory = memory?.trim() ?? '';  // get the current memory text

    let $message_div = get_message_div(index);  // top level div for this message
    let $message_text_div = $message_div.find('.mes_text')  // holds message text
    let $memory_div = $message_div.find(`div.${summary_div_class}`);  // div holding the memory text

    // Hide the memory div and add the textarea after the main message text
    let $textarea = $(`<textarea class="${css_message_div} ${css_edit_textarea}" rows="1"></textarea>`);
    $memory_div.hide();
    $message_text_div.after($textarea);
    $textarea.focus();  // focus on the textarea
    $textarea.val(memory);  // set the textarea value to the memory text (this is done after focus to keep the cursor at the end)
    $textarea.height($textarea[0].scrollHeight-10);  // set the height of the textarea to fit the text

    function confirm_edit() {
        let new_memory = $textarea.val();
        if (new_memory === memory) {  // no change
            cancel_edit()
            return;
        }
        edit_memory(message, new_memory)
        $textarea.remove();  // remove the textarea
        $memory_div.show();  // show the memory div
        refresh_memory();
    }

    function cancel_edit() {
        $textarea.remove();  // remove the textarea
        $memory_div.show();  // show the memory div
    }

    // save when the textarea loses focus, or when enter is pressed
    $textarea.on('blur', confirm_edit);
    $textarea.on('keydown', function (event) {
        if (event.key === 'Enter') {  // confirm edit
            event.preventDefault();
            confirm_edit();
        } else if (event.key === 'Escape') {  // cancel edit
            event.preventDefault();
            cancel_edit();
        }
    })
}
function display_injection_preview() {
    let text = refresh_memory()
    text = `...\n\n${text}\n\n...`
    display_text_modal("Memory State Preview", text);
}

async function display_text_modal(title, text="") {
    // Display a modal with the given title and text
    // replace newlines in text with <br> for HTML
    let ctx = getContext();
    text = text.replace(/\n/g, '<br>');
    let html = `<h2>${title}</h2><div style="text-align: left; overflow: auto;">${text}</div>`
    //const popupResult = await ctx.callPopup(html, 'text', undefined, { okButton: `Close` });
    let popup = new ctx.Popup(html, ctx.POPUP_TYPE.TEXT, undefined, {okButton: 'Close', allowVerticalScrolling: true});
    await popup.show()
}
async function get_user_setting_text_input(key, title, description="") {
    // Display a modal with a text area input, populated with a given setting value
    let value = get_settings(key) ?? '';

    title = `
<h3>${title}</h3>
<p>${description}</p>
`

    let restore_button = {  // don't specify "result" key do not close the popup
        text: 'Restore Default',
        appendAtEnd: true,
        action: () => { // fill the input with the default value
            popup.mainInput.value = default_settings[key] ?? '';
        }
    }
    let ctx = getContext();
    let popup = new ctx.Popup(title, ctx.POPUP_TYPE.INPUT, value, {rows: 20, customButtons: [restore_button]});

    // Now remove the ".result-control" class to prevent it from submitting when you hit enter.
    // This should have been a configuration option for the popup.
    popup.mainInput.classList.remove('result-control');

    let input = await popup.show();
    if (input) {
        set_settings(key, input);
        refresh_settings()
        refresh_memory()
    }
}
function progress_bar(id, progress, total, title) {
    // Display, update, or remove a progress bar
    id = `${PROGRESS_BAR_ID}_${id}`
    let $existing = $(`.${id}`);
    if ($existing.length > 0) {  // update the progress bar
        if (title) $existing.find('div.title').text(title);
        if (progress) {
            $existing.find('span.progress').text(progress)
            $existing.find('progress').val(progress)
        }
        if (total) {
            $existing.find('span.total').text(total)
            $existing.find('progress').attr('max', total)
        }
        return;
    }

    // create the progress bar
    let bar = $(`
<div class="${id} qvink_progress_bar flex-container justifyspacebetween alignitemscenter">
    <div class="title">${title}</div>
    <div>(<span class="progress">${progress}</span> / <span class="total">${total}</span>)</div>
    <progress value="${progress}" max="${total}" class="flex1"></progress>
    <button class="menu_button fa-solid fa-stop" title="Abort summarization"></button>
</div>`)

    // add a click event to abort the summarization
    bar.find('button').on('click', function () {
        stop_summarization();
    })

    // append to the main chat area (#sheld)
    $('#sheld').append(bar);

    // append to the edit interface if it's open
    if (memoryEditInterface?.is_open()) {
        memoryEditInterface.$progress_bar.append(bar)
    }
}
function remove_progress_bar(id) {
    id = `${PROGRESS_BAR_ID}_${id}`
    let $existing = $(`.${id}`);
    if ($existing.length > 0) {  // found
        debug("Removing progress bar")
        $existing.remove();
    }
}


// Memory State Interface
class MemoryEditInterface {

    // Array with each message index to show in the interface.
    // Affected by filters
    filtered = []  // current indexes filtered
    displayed = []  // indexes on current page

    // selected message indexes
    selected = new Set()

    // Available filters with a function to check a given message against the filter.
    filter_bar = {
        "short_term": {
            "title": "Summaries currently in short-term memory",
            "display": "Short-Term",
            "check": (msg) => get_data(msg, 'include') === "short",
            "default": true,
            "count": 0
        },
        "long_term": {
            "title": "Summaries marked for long-term memory, even if they are currently in short-term memory or out of context",
            "display": "Long-Term",
            "check": (msg) => get_data(msg, 'remember'),
            "default": true,
            "count": 0
        },
        "excluded": {
            "title": "Summaries not in short-term or long-term memory",
            "display": "Forgot",
            "check": (msg) => !get_data(msg, 'include') && get_data(msg, 'memory'),
            "default": false,
            "count": 0
        },
        "force_excluded": {
            "title": "Summaries that have been manually excluded from memory",
            "display": "Excluded",
            "check":  (msg) => get_data(msg, 'exclude'),
            "default": false,
            "count": 0
        },
        "edited": {
            "title": "Summaries that have been manually edited",
            "display": "Edited",
            "check": (msg) => get_data(msg, 'edited'),
            "default": false,
            "count": 0
        },
        "user": {
            "title": "User messages with or without summaries",
            "display": "User",
            "check":  (msg) => msg.is_user,
            "default": false,
            "count": 0
        },
        "no_summary": {
            "title": "Messages without a summary",
            "display": "No Summary",
            "check": (msg) => !get_data(msg, 'memory'),
            "default": false,
            "count": 0
        },
        "errors": {
            "title": "Summaries that failed during generation",
            "display": "Errors",
            "check": (msg) => get_data(msg, 'error'),
            "default": false,
            "count": 0
        },
    }

    html_template = `
<div id="qvink_memory_state_interface">
<div class="flex-container justifyspacebetween alignitemscenter">
    <h4>Memory State</h4>
    <button id="preview_memory_state" class="menu_button fa-solid fa-eye margin0" title="Preview current memory state (the exact text that will be injected into your context)."></button>
    <label class="checkbox_label" title="Selecting message subsets applies to the entire chat history. When unchecked, it only applies to the current page.">
        <input id="global_selection" type="checkbox" />
        <span>Global Selection</span>
    </label>
    <label class="checkbox_label" title="Reverse the sort order of each page.">
        <input id="reverse_page_sort" type="checkbox" />
        <span>Reverse page sort</span>
    </label>
</div>

<div id="filter_bar" class="flex-container justifyspacebetween alignitemscenter"></div>

<hr>
<div id="progress_bar"></div>
<div id="pagination" style="margin: 0.5em 0"></div>

<table cellspacing="0">
<thead>
    <tr>
        <th class="mass_select" title="Select all/none"><input id="mass_select" type="checkbox"/></th>
        <th title="Message ID associated with the memory"><i class="fa-solid fa-hashtag"></i></th>
        <th title="Sender"><i class="fa-solid fa-comment"></i></th>
        <th title="Memory text">Memory</th>
        <th class="actions">Actions</th>
    </tr>
</thead>
<tbody></tbody>
</table>


<hr>
<div>Bulk Actions (Selected: <span id="selected_count"></span>)</div>
<div id="bulk_actions" class="flex-container justifyspacebetween alignitemscenter">
    <button id="bulk_remember"   class="menu_button flex1" title="Toggle inclusion of selected summaries in long-term memory"> <i class="fa-solid fa-brain"></i>Remember</button>
    <button id="bulk_exclude"    class="menu_button flex1" title="Toggle inclusion of selected summaries from all memory">     <i class="fa-solid fa-ban"></i>Exclude</button>
    <button id="bulk_copy"       class="menu_button flex1" title="Copy selected memories to clipboard">                        <i class="fa-solid fa-copy"></i>Copy</button>
    <button id="bulk_summarize"  class="menu_button flex1" title="Re-Summarize selected memories">                             <i class="fa-solid fa-quote-left"></i>Summarize</button>
    <button id="bulk_delete"     class="menu_button flex1" title="Delete selected memories">                                   <i class="fa-solid fa-trash"></i>Delete</button>
    <button id="bulk_regex"      class="menu_button flex1" title="Run the selected regex script on selected memories">         <i class="fa-solid fa-shuffle"></i>Regex Replace</button>
    <select id="regex_selector"  title="Choose regex script"></select>
</div>
</div>
`
    html_button_template = `
    <div class="interface_actions">
        <div title="Remember (toggle inclusion of summary in long-term memory)"     class="mes_button fa-solid fa-brain ${remember_button_class}"></div>
        <div title="Force Exclude (toggle inclusion of summary from all memory)"    class="mes_button fa-solid fa-ban ${forget_button_class}"></div>
        <div title="Re-Summarize (AI)"                                              class="mes_button fa-solid fa-quote-left ${summarize_button_class}"></div>
    </div>
    `
    ctx = getContext();

    // If you define the popup in the constructor so you don't have to recreate it every time, then clicking the "ok" button has like a .5-second lang before closing the popup.
    // If you instead re-create it every time in show(), there is no lag.
    constructor() {
        this.settings = get_settings('memory_edit_interface_settings')
    }
    init() {
        this.popup = new this.ctx.Popup(this.html_template, this.ctx.POPUP_TYPE.TEXT, undefined, {wider: true});
        this.$content = $(this.popup.content)
        this.$table = this.$content.find('table')
        this.$table_body = this.$table.find('tbody')
        this.$pagination = this.$content.find('#pagination')
        this.$counter = this.$content.find("#selected_count")  // counter for selected rows
        this.$progress_bar = this.$content.find("#progress_bar")
        this.$bulk_actions = this.$content.find("#bulk_actions button, #bulk_actions select")

        this.$global_selection_checkbox = this.$content.find("#global_selection")
        this.$global_selection_checkbox.prop('checked', this.settings.global_selection ?? false)
        this.$global_selection_checkbox.on('change', () => this.save_settings())

        this.$reverse_page_sort = this.$content.find('#reverse_page_sort')
        this.$reverse_page_sort.prop('checked', this.settings.reverse_page_sort ?? false)
        this.$reverse_page_sort.on('change', () => {
            this.save_settings()
            this.update_filters()
            this.update_table()
        })

        this.$mass_select_checkbox = this.$content.find('#mass_select')
        this.$mass_select_checkbox.on('change', () => {  // when the mass checkbox is toggled, apply the change to all checkboxes
            let checked = this.$mass_select_checkbox.is(':checked')
            let indexes = this.global_selection() ? this.filtered : this.displayed
            this.toggle_selected(indexes, checked)
        })

        this.update_regex_section()

        // add filter section
        this.update_filter_counts()
        for (let [id, data] of Object.entries(this.filter_bar)) {
            let select_button_id = `select_${id}`
            let filter_checkbox_id = `filter_${id}`
            let checked = this.settings[id] ?? data.default

            let $el = $(`
<div class="filter_box flex1">
    <label class="checkbox_label" title="${data.title}">
        <input id="${filter_checkbox_id}" type="checkbox" ${checked ? "checked" : ""}/>
        <span>${data.display}</span>
        <span>(${data.count})</span>
    </label>
    <button id="${select_button_id}" class="menu_button flex1" title="Mass select">Select</button>
</div>
            `)

            this.$content.find('#filter_bar').append($el)  // append to filter bar

            let $select = $el.find("#"+select_button_id)
            let $filter = $el.find("#"+filter_checkbox_id)

            data.filtered = () => $filter.is(':checked')

            $filter.on('change', () => {
                this.update_filters()
                this.save_settings();
            })

            // callback for the select button
            $select.on('click', () => {
                let all_indexes = this.global_selection() ? this.filtered : this.displayed
                let select = []
                for (let i of all_indexes) {
                    let message = this.ctx.chat[i];
                    if (data.check(message)) {
                        select.push(i);
                    }
                }

                this.toggle_selected(select);
            })

        }

        // manually set a larger width
        this.$content.closest('dialog').css('min-width', '80%')

        // bulk action buttons
        this.$content.find(`#bulk_remember`).on('click', () => {
            remember_message_toggle(Array.from(this.selected))
            this.update_table()
        })
        this.$content.find(`#bulk_exclude`).on('click', () => {
            forget_message_toggle(Array.from(this.selected))
            this.update_table()
        })
        this.$content.find(`#bulk_summarize`).on('click', async () => {
            let indexes = Array.from(this.selected).sort()  // summarize in ID order
            await summarize_messages(indexes);
            this.update_table()
        })
        this.$content.find(`#bulk_delete`).on('click', () => {
            this.selected.forEach(id => {
                debug("DELETING: " + id)
                clear_memory(this.ctx.chat[id])
            })
            this.update_table()
        })
        this.$content.find('#bulk_copy').on('click', () => {
            this.copy_to_clipboard()
        })
        this.$content.find('#preview_memory_state').on('click', () => display_injection_preview())

        // handlers for each memory
        let self = this;
        this.$content.on('change', 'tr textarea', function () {  // when a textarea changes, update the memory
            let new_memory = $(this).val();
            let message_id = Number($(this).closest('tr').attr('message_id'));  // get the message ID from the row's "message_id" attribute
            let message = self.ctx.chat[message_id]
            edit_memory(message, new_memory)
            self.update_table()
        }).on("input", 'tr textarea', function () {
            this.style.height = "auto";  // fixes some weird behavior that just using scrollHeight causes.
            this.style.height = this.scrollHeight + "px";
        });
        this.$content.on('click', 'input.interface_message_select', function () {
            let index = Number(this.value);
            self.toggle_selected([index])
        })
        this.$content.on("click", `tr .${remember_button_class}`, function () {
            let message_id = Number($(this).closest('tr').attr('message_id'));  // get the message ID from the row's "message_id" attribute
            remember_message_toggle(message_id);
            self.update_table()
        });
        this.$content.on("click", `tr .${forget_button_class}`, function () {
            let message_id = Number($(this).closest('tr').attr('message_id'));  // get the message ID from the row's "message_id" attribute
            forget_message_toggle(message_id);
            self.update_table()
        })
        this.$content.on("click", `tr .${summarize_button_class}`, async function () {
            let message_id = Number($(this).closest('tr').attr('message_id'));  // get the message ID from the row's "message_id" attribute
            await summarize_messages(message_id);
        });
    }

    async show() {
        this.init()
        this.update_filters()

        // start with no rows selected
        this.selected.clear()
        this.update_selected()

        let result = this.popup.show();  // gotta go before init_pagination so the update
        this.update_table()

        // Set initial height for text areas.
        // I know that update() also does this, but for some reason the first time it's called it doesn't set it right.
        // Some have the right height, but some longer texts don't. It's like the width of the popup is smaller,
        //  so when the scrollHeight is found in update(), the lines wrap sooner. Not sure where this could be happening.
        // It's not the stylesheet getting set late, as putting `width: 100%` on the html itself doesn't help.
        this.$content.find('tr textarea').each(function () {
            this.style.height = 'auto'
            this.style.height = this.scrollHeight + "px";
        })

        if (this.settings.reverse_page_sort) {
            this.scroll_to_bottom()
        }

        await result  // wait for user to close
    }

    is_open() {
        if (!this.popup) return false
        return this.$content.closest('dialog').attr('open');
    }
    global_selection() {
        return this.$global_selection_checkbox.is(':checked');
    }

    clear() {
        // clear all displayed rows in the table
        let $rows = this.$table_body.find('tr')
        for (let row of $rows) {
            row.remove()
        }
    }
    update_table() {
        // Update the content of the interface

        // if the interface isn't open, do nothing
        if (!this.is_open()) return

        // Update the content of the memory state interface, rendering the given indexes
        refresh_memory()  // make sure current memory state is up to date

        debug("Updating memory interface...")

        // add a table row for each message index
        let $row;
        let $previous_row;
        for (let i of this.displayed) {
            $row = this.update_message_visuals(i, $previous_row)
            $previous_row = $row  // save as previous row
        }

        this.update_selected()
    }
    update_filters() {
        // update list of indexes to include based on current filters
        log("Updating interface filters...")

        let filter_no_summary = this.filter_bar.no_summary.filtered()
        let filter_short_term = this.filter_bar.short_term.filtered()
        let filter_long_term = this.filter_bar.long_term.filtered()
        let filter_excluded = this.filter_bar.excluded.filtered()
        let filter_force_excluded = this.filter_bar.force_excluded.filtered()
        let filter_edited = this.filter_bar.edited.filtered()
        let filter_errors = this.filter_bar.errors.filtered()
        let filter_user = this.filter_bar.user.filtered()

        // message indexes in reverse
        this.filtered = []
        for (let i = this.ctx.chat.length-1; i >= 0; i--) {
            let msg = this.ctx.chat[i]
            let include =  false

            if (filter_short_term           && this.filter_bar.short_term.check(msg)) include = true;
            else if (filter_long_term       && this.filter_bar.long_term.check(msg)) include = true;
            else if (filter_no_summary      && this.filter_bar.no_summary.check(msg)) include = true;
            else if (filter_errors          && this.filter_bar.errors.check(msg)) include = true;
            else if (filter_excluded        && this.filter_bar.excluded.check(msg)) include = true;
            else if (filter_edited          && this.filter_bar.edited.check(msg)) include = true;
            else if (filter_force_excluded  && this.filter_bar.force_excluded.check(msg)) include = true;
            else if (filter_user            && this.filter_bar.user.check(msg)) include = true;

            // Any indexes not in the filtered list should also not be selected
            if (include) {
                this.filtered.push(i)
            } else {
                this.selected.delete(i)
            }

        }

        // re-initialize paginator with new data
        this.$pagination.pagination({
            dataSource: this.filtered,
            pageSize: 100,
            sizeChangerOptions: [10, 50, 100, 500, 1000],
            showSizeChanger: true,
            callback: (data, pagination) => {
                if (this.settings.reverse_page_sort) {
                    data.reverse()
                }
                this.displayed = data
                this.clear()
                this.update_table()
            }
        })

        if (this.settings.reverse_page_sort) {
            this.scroll_to_bottom()
        }
    }
    update_selected() {
        // Update the interface based on selected items

        // check/uncheck the rows according to which are selected
        let $checkboxes = this.$table_body.find(`input.interface_message_select`)
        for (let checkbox of $checkboxes) {
            $(checkbox).prop('checked', this.selected.has(Number(checkbox.value)))
        }

        // update counter
        this.$counter.text(this.selected.size)

        // if any are selected, check the mass selection checkbox and enable the bulk action buttons
        if (this.selected.size > 0) {
            this.$counter.css('color', 'red')
            this.$mass_select_checkbox.prop('checked', true)
            this.$bulk_actions.removeAttr('disabled');
        } else {
            this.$counter.css('color', 'unset')
            this.$mass_select_checkbox.prop('checked', false)
            this.$bulk_actions.attr('disabled', true);
        }
    }
    update_filter_counts() {
        // count the number of messages in each filter
        for (let [id, data] of Object.entries(this.filter_bar)) {
            data.count = 0
        }

        for (let msg of this.ctx.chat) {
            for (let [id, data] of Object.entries(this.filter_bar)) {
                if (data.check(msg)) data.count++
            }
        }
    }
    update_regex_section() {
        this.$regex_selector = this.$content.find('#regex_selector')
        this.$replace_button = this.$content.find('#bulk_regex')

        // populate regex dropdown
        let script_list = getRegexScripts()
        let scripts = {}
        Object.keys(script_list).forEach(function(i) {
            let script = script_list[i]
            scripts[script.scriptName] = script
        });

        this.$regex_selector.empty();
        this.$regex_selector.append(`<option value="">Select Script</option>`)
        for (let name of Object.keys(scripts)) {  // construct the dropdown options
            this.$regex_selector.append(`<option value="${name}">${name}</option>`)
        }
        this.$regex_selector.val(this.settings.regex_script || "")
        this.$regex_selector.on('change', () => {
            this.settings.regex_script = this.$regex_selector.val()
            this.save_settings()
        })

        // search replace
        this.$replace_button.on('click', () => {
            let script_name = this.$regex_selector.val()
            let script = scripts[script_name]
            log(`Running regex script \"${script_name}\" on selected memories`)
            for (let i of this.selected) {
                let message = this.ctx.chat[i]
                let memory = get_memory(message)
                let new_text = runRegexScript(script, memory)
                edit_memory(message, new_text)
            }
            this.update_table()
        })

    }
    toggle_selected(indexes, value=null) {
        // set the selected state of the given message indexes
        if (value === null) {  // no value given - toggle
            let all_selected = true
            for (let i of indexes) {
                if (all_selected && !this.selected.has(i)) {  // if at least one not selected
                    all_selected = false
                }
                this.selected.add(i)
            }
            if (all_selected) {  // if all are selected, deselect all
                for (let i of indexes) {
                    this.selected.delete(i)
                }
            }

        } else if (value === true) {  // select all
            for (let i of indexes) {
                this.selected.add(i)
            }
        } else if (value === false) {  // deselect all
            for (let i of indexes) {
                this.selected.delete(i)
            }
        }

        this.update_selected()
    }
    update_message_visuals(i, $previous_row=null, style=true, text=null) {
        // Update the visuals of a single row
        if (!this.is_open()) return

        let msg = this.ctx.chat[i];
        let memory = text ?? get_memory(msg)
        let error = get_data(msg, 'error') || ""
        let edited = get_data(msg, 'edited')
        let row_id = `memory_${i}`

        // check if a row already exists for this memory
        let $row = this.$table_body.find(`tr#${row_id}`);
        let $memory;
        let $select_checkbox;
        let $buttons;
        let $sender;
        if ($row.length === 0) {  // doesn't exist
            $memory = $(`<textarea rows="1">${memory}</textarea>`)
            $select_checkbox = $(`<input class="interface_message_select" type="checkbox" value="${i}">`)
            $buttons = $(this.html_button_template)
            if (msg.is_user) {
                $sender = $(`<i class="fa-solid fa-user" title="User message"></i>`)
            } else {
                $sender = $(`<i class="fa-solid" title="Character message"></i>`)
            }

            // create the row. The "message_id" attribute tells all handlers what message ID this is.
            $row = $(`<tr message_id="${i}" id="${row_id}"></tr>`)

            // append this new row after the previous row
            if ($previous_row) {
                $row.insertAfter($previous_row)
            } else {  // or put it at the top
                $row.prependTo(this.$table_body)
            }

            // add each item
            $select_checkbox.wrap('<td></td>').parent().appendTo($row)
            $(`<td>${i}</td>`).appendTo($row)
            $sender.wrap('<td></td>').parent().appendTo($row)
            $memory.wrap(`<td class="interface_summary"></td>`).parent().appendTo($row)
            $buttons.wrap(`<td></td>`).parent().appendTo($row)

        } else {  // already exists
            // update text if the memory changed
            $memory = $row.find('textarea')
            if ($memory.val() !== memory) {
                $memory.val(memory)
            }
        }

        // If no memory, set the placeholder text to the error
        if (!memory) {
            $memory.attr('placeholder', `${error}`);
        } else {
            $memory[0].style.height = "auto";  // fixes some weird behavior that just using scrollHeight causes.
            $memory[0].style.height = $memory[0].scrollHeight + "px";  // set the initial height based on content
        }

        // If the memory was edited, add the icon
        $memory.parent().find('i').remove()
        if (edited) {
            $memory.parent().append($('<i class="fa-solid fa-pencil" title="manually edited"></i>'))
        }

        // set style
        $memory.removeClass().addClass(css_message_div)  // to maintain the default styling
        if (style) {
            $memory.addClass(get_summary_style_class(msg))
        }

        return $row  // return the row that was modified
    }
    scroll_to_bottom() {
        // scroll to bottom of the memory edit interface
        this.$table.scrollTop(this.$table[0].scrollHeight);
    }
    copy_to_clipboard() {
        // copy the summaries of the given messages to clipboard
        let text = concatenate_summaries(Array.from(this.selected));
        copyText(text)
        toastr.info("All memories copied to clipboard.")
    }
    save_settings() {
        this.settings.global_selection = this.$global_selection_checkbox.is(':checked')
        this.settings.reverse_page_sort = this.$reverse_page_sort.is(':checked')
        for (let [id, data] of Object.entries(this.filter_bar)) {
            this.settings[id] = data.filtered()
        }
        set_settings('memory_edit_interface_settings', this.settings)
    }
}


// Message functions
function set_data(message, key, value) {
    // store information on the message object
    if (!message.extra) {
        message.extra = {};
    }
    if (!message.extra[MODULE_NAME]) {
        message.extra[MODULE_NAME] = {};
    }

    message.extra[MODULE_NAME][key] = value;

    // Also save on the current swipe info if present
    let swipe_index = message.swipe_id
    if (swipe_index && message.swipe_info?.[swipe_index]) {
        if (!message.swipe_info[swipe_index].extra) {
            message.swipe_info[swipe_index].extra = {};
        }
        message.swipe_info[swipe_index].extra[MODULE_NAME] = structuredClone(message.extra[MODULE_NAME])
    }

    saveChatDebounced();
}
function get_data(message, key) {
    // get information from the message object
    return message?.extra?.[MODULE_NAME]?.[key];
}
function get_memory(message) {
    // returns the memory (and reasoning, if present) properly prepended with the prefill (if present)
    let memory = get_data(message, 'memory') ?? ""
    let prefill = get_data(message, 'prefill') ?? ""

    // prepend the prefill to the memory if needed
    if (get_settings('show_prefill')) {
        memory = `${prefill}${memory}`
    }
    return memory
}
function edit_memory(message, text) {
    // perform a manual edit of the memory text

    let current_text = get_memory(message)
    if (text === current_text) return;  // no change
    set_data(message, "memory", text);
    set_data(message, "error", null)  // remove any errors
    set_data(message, "reasoning", null)  // remove any reasoning
    set_data(message, "prefill", null)  // remove any prefill
    set_data(message, "edited", Boolean(text))  // mark as edited if not deleted

    // deleting or adding text to a deleted memory, remove some other flags
    if (!text || !current_text) {
        set_data(message, "exclude", false)
        set_data(message, "remember", false)
    }
}
function clear_memory(message) {
    // clear the memory from a message
    set_data(message, "memory", null);
    set_data(message, "error", null)  // remove any errors
    set_data(message, "reasoning", null)  // remove any reasoning
    set_data(message, "prefill", null)  // remove any prefill
    set_data(message, "edited", false)
    set_data(message, "exclude", false)
    set_data(message, "remember", false)
}
function toggle_memory_value(indexes, value, check_value, set_value) {
    // For each message index, call set_value(index, value) function on each.
    // If no value given, toggle the values. Only toggle false if ALL are true.

    if (value === null) {  // no value - toggle
        let all_true = true
        for (let index of indexes) {
            if (!check_value(index)) {
                all_true = false
                set_value(index, true)
            }
        }

        if (all_true) {  // set to false only if all are true
            for (let index of indexes) {
                set_value(index, false)
            }
        }

    } else {  // value given
        for (let index of indexes) {
            set_value(index, value)
        }
    }

}
function get_previous_swipe_memory(message, key) {
    // get information from the message's previous swipe
    if (!message.swipe_id) {
        return null;
    }
    return message?.swipe_info?.[message.swipe_id-1]?.extra?.[MODULE_NAME]?.[key];
}
async function remember_message_toggle(indexes=null, value=null) {
    // Toggle the "remember" status of a set of messages
    let context = getContext();

    if (!Array.isArray(indexes)) {  // only one index given
        indexes = [indexes]
    } else if (indexes === null) {  // Default to the last message, min 0
        indexes = [Math.max(context.chat.length-1, 0)]
    }

    // messages without a summary
    let summarize = [];

    function set(index, value) {
        let message = context.chat[index]
        set_data(message, 'remember', value);
        set_data(message, 'exclude', false);  // regardless, remove excluded flag

        let memory = get_data(message, 'memory')
        if (value && !memory) {
            summarize.push()
        }
        debug(`Set message ${index} remembered status: ${value}`);
    }

    function check(index) {
        return get_data(context.chat[index], 'remember')
    }

    toggle_memory_value(indexes, value, check, set)

    // summarize any messages that have no summary
    if (summarize.length > 0) {
        await summarize_messages(summarize);
    }
    refresh_memory();
}
function forget_message_toggle(indexes=null, value=null) {
    // Toggle the "forget" status of a message
    let context = getContext();

    if (!Array.isArray(indexes)) {  // only one index given
        indexes = [indexes]
    } else if (indexes === null) {  // Default to the last message, min 0
        indexes = [Math.max(context.chat.length-1, 0)]
    }

    function set(index, value) {
        let message = context.chat[index]
        set_data(message, 'exclude', value);
        set_data(message, 'remember', false);  // regardless, remove excluded flag
        debug(`Set message ${index} exclude status: ${value}`);
    }

    function check(index) {
        return get_data(context.chat[index], 'exclude')
    }

    toggle_memory_value(indexes, value, check, set)
    refresh_memory()
}
function get_character_key(message) {
    // get the unique identifier of the character that sent a message
    return message.original_avatar
}


// Retrieving memories
function check_message_exclusion(message) {
    // check for any exclusion criteria for a given message based on current settings
    // (this does NOT take context lengths into account, only exclusion criteria based on the message itself).
    if (!message) return false;

    // system messages sent by this extension are always ignored
    if (get_data(message, 'is_qvink_system_memory')) {
        return false;
    }

    // first check if it has been marked to be remembered by the user - if so, it bypasses all other exclusion criteria
    if (get_data(message, 'remember')) {
        return true;
    }

    // check if it's marked to be excluded - if so, exclude it
    if (get_data(message, 'exclude')) {
        return false;
    }

    // check if it's a user message and exclude if the setting is disabled
    if (!get_settings('include_user_messages') && message.is_user) {
        return false
    }

    // check if it's a thought message and exclude (Stepped Thinking extension)
    // TODO: This is deprecated in the thought extension, could be removed at some point?
    if (message.is_thoughts) {
        return false
    }

    // check if it's a hidden message and exclude if the setting is disabled
    if (!get_settings('include_system_messages') && message.is_system) {
        return false;
    }

    // check if it's a narrator message
    if (!get_settings('include_narrator_messages') && message.extra.type === system_message_types.NARRATOR) {
        return false
    }

    // check if the character is disabled
    let char_key = get_character_key(message)
    if (!character_enabled(char_key)) {
        return false;
    }

    // Check if the message is too short
    let token_size = count_tokens(message.mes);
    if (token_size < get_settings('message_length_threshold')) {
        return false;
    }

    return true;
}
function check_message_conditional(message, no_summary=true, short=true, long=true, remember=true, edited=true, excluded=true) {
    // check whether a message meets the given conditions

    // check regular message exclusion criteria first
    let include = check_message_exclusion(message);  // check if the message should be included due to the summary inclusion criteria
    if (!include) {
        return false
    }

    // if we don't want messages without a summary and this message doesn't have a summary, skip it
    let existing_memory = get_data(message, 'memory');
    if (!no_summary && !existing_memory) {
        return false
    }

    // if we don't want messages with short-term memories and this message has one, skip it
    let include_type = get_data(message, 'include');
    if (!short && include_type === "short" && existing_memory) {
        return
    }
    // if we don't want messages with long-term memories and this message has one, skip it
    if (!long && include_type === "long" && existing_memory) {
        return
    }

    // if we don't want messages with edited memories and this memory has been edited, skip it
    if (!edited && get_data(message, 'edited') && existing_memory) {
        return
    }

    // if we don't want messages with memories that are marked to remember, skip it
    if (!remember && get_data(message, 'remember') && existing_memory) {
        return
    }

    // if we don't want messages with memories that are excluded from short-term and long-term memory, skip it
    if (!excluded && include_type === null && existing_memory) {
        return
    }

    return true
}
function update_message_inclusion_flags() {
    // Update all messages in the chat, flagging them as short-term or long-term memories to include in the injection.
    // This has to be run on the entire chat since it needs to take the context limits into account.
    let context = getContext();
    let chat = context.chat;

    debug("Updating message inclusion flags")

    // iterate through the chat in reverse order and mark the messages that should be included in short-term and long-term memory
    let short_limit_reached = false;
    let long_limit_reached = false;
    let long_term_end_index = null;  // index of the most recent message that doesn't fit in short-term memory
    let end = chat.length - 1;
    let summary = ""  // total concatenated summary so far
    let new_summary = ""  // temp summary storage to check token length
    let memoryCount = 0;
    let memoryLimit = get_settings('limit_injected_messages');
    for (let i = end; i >= 0; i--) {
        let message = chat[i];

        // check for any of the exclusion criteria
        let include = check_message_exclusion(message)
        if (!include) {
            set_data(message, 'include', null);
            continue;
        }

        if (++memoryCount - memoryLimit <= 0) {
            store_memory(message, 'include', null);
            continue;
        }

        if (!short_limit_reached) {  // short-term limit hasn't been reached yet
            let memory = get_memory(message)
            if (!memory) {  // If it doesn't have a memory, mark it as excluded and move to the next
                set_data(message, 'include', null)
                continue
            }

            new_summary = concatenate_summary(summary, message)  // concatenate this summary
            let short_token_size = count_tokens(new_summary);
            if (short_token_size > get_short_token_limit()) {  // over context limit
                short_limit_reached = true;
                long_term_end_index = i;  // this is where long-term memory ends and short-term begins
                summary = ""  // reset summary
            } else {  // under context limit
                set_data(message, 'include', 'short');
                summary = new_summary
                continue
            }
        }

        // if the short-term limit has been reached, check the long-term limit
        let remember = get_data(message, 'remember');
        if (!long_limit_reached && remember) {  // long-term limit hasn't been reached yet and the message was marked to be remembered
            new_summary = concatenate_summary(summary, message)  // concatenate this summary
            let long_token_size = count_tokens(new_summary);
            if (long_token_size > get_long_token_limit()) {  // over context limit
                long_limit_reached = true;
            } else {
                set_data(message, 'include', 'long');  // mark the message as long-term
                summary = new_summary
                continue
            }
        }

        // if we haven't marked it for inclusion yet, mark it as excluded
        set_data(message, 'include', null);
    }

    update_all_message_visuals()
}
function collect_chat_messages(no_summary=false, short=false, long=false, remember=false, edited=false, excluded=false, limit=null) {
    // Get a list of chat message indexes identified by the given criteria
    let context = getContext();

    let indexes = []  // list of indexes of messages

    // iterate in reverse order, stopping when reaching the limit if given
    for (let i = context.chat.length-1; i >= 0; i--) {
        let message = context.chat[i];
        if (check_message_conditional(message, no_summary, short, long, remember, edited, excluded)) {
            indexes.push(i)
        }
        if (limit && limit > 0 && indexes.length >= limit) {
            break
        }
    }

    // reverse the indexes so they are in chronological order
    indexes.reverse()

    return indexes
}
function concatenate_summary(existing_text, message) {
    // given an existing text of concatenated summaries, concatenate the next one onto it
    let memory = get_memory(message)
    if (!memory) {  // if there's no summary, do nothing
        return existing_text
    }
    let separator = get_settings('summary_injection_separator')
    return existing_text + separator + memory
}
function concatenate_summaries(indexes) {
    // concatenate the summaries of the messages with the given indexes
    // Excludes messages that don't meet the inclusion criteria

    let context = getContext();
    let chat = context.chat;

    let summary = ""
    // iterate through given indexes
    for (let i of indexes) {
        let message = chat[i];
        summary = concatenate_summary(summary, message)
    }

    return summary
}
function get_long_memory() {
    // get the injection text for long-term memory
    let indexes = collect_chat_messages(false, false, true, true, true, null)
    let text = concatenate_summaries(indexes);
    let template = get_settings('long_template')
    let ctx = getContext();

    // first replace any global macros
    template = ctx.substituteParamsExtended(template);

    // handle the #if macros using our custom function because ST DOESN'T EXPOSE THEIRS FOR SOME REASON
    template = substitute_conditionals(template, {[long_memory_macro]: text});
    template = substitute_params(template, {[long_memory_macro]: text});
    return template
}
function get_short_memory() {
    // get the injection text for short-term memory
    let indexes = collect_chat_messages(false, true, false, true, true, null)
    let text = concatenate_summaries(indexes);
    let template = get_settings('short_template')
    let ctx = getContext();

    // first replace any global macros
    template = ctx.substituteParamsExtended(template);

    // handle the #if macros using our custom function because ST DOESN'T EXPOSE THEIRS FOR SOME REASON
    template = substitute_conditionals(template, {[short_memory_macro]: text});
    template = substitute_params(template, {[short_memory_macro]: text});
    return template
}


// Add an interception function to reduce the number of messages injected normally
// This has to match the manifest.json "generate_interceptor" key
globalThis.memory_intercept_messages = function (chat, _contextSize, _abort, type) {
    if (!chat_enabled()) return;   // if memory disabled, do nothing
    let limit = get_settings('limit_injected_messages');  // message limit from settings
    if (limit < 0) return;  // if limit is -1, do nothing

    // truncate the chat up to the limit
    while (chat.length > limit) {
        chat.shift();
    }
};


// Summarization
async function summarize_messages(indexes=null, show_progress=true) {
    // Summarize the given list of message indexes (or a single index)
    let ctx = getContext();

    if (indexes === null) {  // default to the mose recent message, min 0
        indexes = [Math.max(chat.length - 1, 0)]
    }
    indexes = Array.isArray(indexes) ? indexes : [indexes]  // cast to array if only one given
    if (!indexes.length) return;

    debug(`Summarizing ${indexes.length} messages`)

     // only show progress if there's more than one message to summarize
    show_progress = show_progress && indexes.length > 1;

    // set stop flag to false just in case
    STOP_SUMMARIZATION = false

    // optionally block user from sending chat messages while summarization is in progress
    if (get_settings('block_chat')) {
        ctx.deactivateSendButtons();
    }

    // Save the current completion preset (must happen before you set the connection profile because it changes the preset)
    let summary_preset = get_settings('completion_preset');
    let current_preset = await get_current_preset();

    // Get the current connection profile
    let summary_profile = get_settings('connection_profile');
    let current_profile = await get_current_connection_profile()

    // set the completion preset and connection profile for summarization (preset must be set after connection profile)
    await set_connection_profile(summary_profile);
    await set_preset(summary_preset);

    let n = 0;
    for (let i of indexes) {
        if (show_progress) progress_bar('summarize', n+1, indexes.length, "Summarizing");

        // check if summarization was stopped by the user
        if (STOP_SUMMARIZATION) {
            log('Summarization stopped');
            break;
        }

        await summarize_message(i);

        // wait for time delay if set
        let time_delay = get_settings('summarization_time_delay')
        if (time_delay > 0 && n < indexes.length-1) {  // delay all except the last

            // check if summarization was stopped by the user during summarization
            if (STOP_SUMMARIZATION) {
                log('Summarization stopped');
                break;
            }

            debug(`Delaying generation by ${time_delay} seconds`)
            if (show_progress) progress_bar('summarize', null, null, "Delaying")
            await new Promise((resolve) => {
                SUMMARIZATION_DELAY_TIMEOUT = setTimeout(resolve, time_delay * 1000)
                SUMMARIZATION_DELAY_RESOLVE = resolve  // store the resolve function to call when cleared
            });
        }

        n += 1;
    }


    // restore the completion preset and connection profile
    await set_connection_profile(current_profile);
    await set_preset(current_preset);

    // remove the progress bar
    if (show_progress) remove_progress_bar('summarize')

    if (STOP_SUMMARIZATION) {  // check if summarization was stopped
        STOP_SUMMARIZATION = false  // reset the flag
    } else {
        debug(`Messages summarized: ${indexes.length}`)
    }

    if (get_settings('block_chat')) {
        ctx.activateSendButtons();
    }

    refresh_memory()

    // Update the memory state interface if it's open
    memoryEditInterface.update_table()
}
async function summarize_message(index) {
    // Summarize a message given the chat index, replacing any existing memories
    // Should only be used from summarize_messages()

    let context = getContext();
    let message = context.chat[index]
    let message_hash = getStringHash(message.mes);

    // clear the reasoning early to avoid showing it when summarizing
    set_data(message, 'reasoning', "")

    // Temporarily update the message summary text to indicate that it's being summarized (no styling based on inclusion criteria)
    // A full visual update with style should be done on the whole chat after inclusion criteria have been recalculated
    update_message_visuals(index, false, "Summarizing...")
    memoryEditInterface.update_message_visuals(index, null, false, "Summarizing...")

    // If the most recent message, scroll to the bottom to get the summary in view.
    if (index === chat.length - 1) {
        scrollChatToBottom();
    }

    // construct the full summary prompt for the message
    let prompt = await create_summary_prompt(index)

    // summarize it
    let summary;
    let err = null;
    try {
        debug(`Summarizing message ${index}...`)
        summary = await summarize_text(prompt)
    } catch (e) {
        if (e === "Clicked stop button") {  // summarization was aborted
            err = "Summarization aborted"
        } else {
            error(`Unrecognized error when summarizing message ${index}: ${e}`)
        }
        summary = null
    }

    if (summary) {
        debug("Message summarized: " + summary)

        // stick the prefill on the front and try to parse reasoning
        let prefill = get_settings('prefill')
        let prefilled_summary = summary
        if (prefill) {
            prefilled_summary = `${prefill}${summary}`
        }

        let parsed_reasoning_object = context.parseReasoningFromString(prefilled_summary)
        let reasoning = "";
        if (parsed_reasoning_object?.reasoning) {
            debug("Reasoning parsed: ")
            debug(parsed_reasoning_object)
            reasoning = parsed_reasoning_object.reasoning  // reasoning with prefill
            summary = parsed_reasoning_object.content  // summary (no prefill)
        }

        // The summary that is stored is WITHOUT the prefill, regardless of whether there was reasoning.
        // If there is reasoning, it will be stored with the prefill and the prefill will be empty

        set_data(message, 'memory', summary);
        set_data(message, 'hash', message_hash);  // store the hash of the message that we just summarized
        set_data(message, 'error', null);  // clear the error message
        set_data(message, 'edited', false);  // clear the error message
        set_data(message, 'prefill', reasoning ? "" : get_settings('prefill'))  // store prefill if there was no reasoning.
        set_data(message, 'reasoning', reasoning)
    } else {  // generation failed
        error(`Failed to summarize message ${index} - generation failed.`);
        set_data(message, 'error', err || "Summarization failed");  // store the error message
        set_data(message, 'memory', null);  // clear the memory if generation failed
        set_data(message, 'edited', false);  // clear the error message
        set_data(message, 'prefill', null)
        set_data(message, 'reasoning', null)
    }

    // update the message summary text again now with the memory, still no styling
    update_message_visuals(index, false)
    memoryEditInterface.update_message_visuals(index, null, false)

    // If the most recent message, scroll to the bottom
    if (index === chat.length - 1) {
        scrollChatToBottom()
    }
}
async function summarize_text(prompt) {
    // get size of text
    let token_size = count_tokens(prompt);

    let context_size = get_context_size();
    if (token_size > context_size) {
        error(`Text ${token_size} exceeds context size ${context_size}.`);
    }

    let ctx = getContext()

    // At least one openai-style API required at least two messages to be sent.
    // We can do this by adding a system prompt, which will get added as another message in generateRaw().
    // A hack obviously. Is this a standard requirement for openai-style chat completion?
    // TODO update with a more robust method
    let system_prompt = false
    if (main_api === 'openai') {
        system_prompt = "Complete the requested task."
    }

    // TODO do the world info injection manually instead
    let include_world_info = get_settings('include_world_info');
    let result;
    if (include_world_info) {
        /**
         * Background generation based on the provided prompt.
         * @param {string} quiet_prompt Instruction prompt for the AI
         * @param {boolean} quietToLoud Whether the message should be sent in a foreground (loud) or background (quiet) mode
         * @param {boolean} skipWIAN whether to skip addition of World Info and Author's Note into the prompt
         * @param {string} quietImage Image to use for the quiet prompt
         * @param {string} quietName Name to use for the quiet prompt (defaults to "System:")
         * @param {number} [responseLength] Maximum response length. If unset, the global default value is used.
         * @returns
         */
        result = await ctx.generateQuietPrompt(prompt, true, false, system_prompt, "assistant");
    } else {
        /**
         * Generates a message using the provided prompt.
         * @param {string} prompt Prompt to generate a message from
         * @param {string} api API to use. Main API is used if not specified.
         * @param {boolean} instructOverride true to override instruct mode, false to use the default value
         * @param {boolean} quietToLoud true to generate a message in system mode, false to generate a message in character mode
         * @param {string} [systemPrompt] System prompt to use. Only Instruct mode or OpenAI.
         * @param {number} [responseLength] Maximum response length. If unset, the global default value is used.
         * @returns {Promise<string>} Generated message
         */
        result = await generateRaw(prompt, '', true, false, system_prompt, null, false);
    }

    // trim incomplete sentences if set in ST settings
    if (ctx.powerUserSettings.trim_sentences) {
        result = trimToEndSentence(result);
    }

    return result;
}
function get_message_history(index) {
    // Get a history of messages leading up to the given index (excluding the message at the index)
    // If the include_message_history setting is 0, returns null
    let num_history_messages = get_settings('include_message_history');
    let mode = get_settings('include_message_history_mode');
    if (num_history_messages === 0 || mode === "none") {
        return;
    }

    let ctx = getContext()
    let chat = ctx.chat

    let num_included = 0;
    let history = []
    for (let i = index-1; num_included < num_history_messages && i>=0; i--) {
        let m = chat[i];
        let include = true

        // whether we include the message itself is determined only by these settings.
        // Even if the message wouldn't be *summarized* we still want to include it in the history for context.
        if (m.is_user && !get_settings('include_user_messages_in_history')) {
            include = false;
        } else if (m.is_system && !get_settings('include_system_messages_in_history')) {
            include = false;
        } else if (m.is_thoughts && !get_settings('include_thought_messages_in_history')) {
            include = false;
        }

        if (!include) continue;

        let included = false
        if (mode === "summaries_only" || mode === "messages_and_summaries") {

            // Whether we include the *summary* is determined by the regular summary inclusion criteria.
            // This is so the inclusion matches the summary injection.
            let include_summary = check_message_exclusion(m)
            let memory = get_memory(m)
            if (include_summary && memory) {
                memory = `Summary: ${memory}`
                history.push(formatInstructModeChat("assistant", memory, false, false, "", "", "", null))
                included = true
            }
        }
        if (mode === "messages_only" || mode === "messages_and_summaries") {
            history.push(formatInstructModeChat(m.name, m.mes, m.is_user, false, "", ctx.name1, ctx.name2, null))
            included = true
        }

        if (included) {
            num_included++
        }
    }

    // reverse the history so that the most recent message is first
    history.reverse()

    // join with newlines
    return history.join('\n')
}
function system_prompt_split(text) {
    // Given text with some number of {{macro}} items, split the text by these items and format the rest as system messages surrounding the macros
    // It is assumed that the macros will be later replaced with appropriate text

    // split on either {{...}} or {{#if ... /if}}.
    // /g flag is for global, /s flag makes . match newlines so the {{#if ... /if}} can span multiple lines
    let parts = text.split(/(\{\{#if.*?\/if}})|(\{\{.*?}})/gs);

    let formatted = parts.map((part) => {
        if (!part) return ""  // some parts are undefined
        part = part.trim()  // trim whitespace
        if (!part) return ""  // if empty after trimming
        if (part.startsWith('{{') && part.endsWith('}}')) {
            return part  // don't format macros
        }
        let formatted = formatInstructModeChat("assistant", part, false, true, "", "", "", null)
        return `${formatted}`
    })
    return formatted.join('')
}
function substitute_conditionals(text, params) {
    // substitute any {{#if macro}} ... {{/if}} blocks in the text with the corresponding content if the macro is present in the params object.
    // Does NOT replace the actual macros, that is done in substitute_params()

    let parts = text.split(/(\{\{#if.*?\/if}})/gs);
    let formatted = parts.map((part) => {
        if (!part) return ""
        if (!part.startsWith('{{#if')) return part
        part = part.trim()  // clean whitespace
        let macro_name = part.match(/\{\{#if (.*?)}}/)[1]
        let macro_present = Boolean(params[macro_name]?.trim())
        let conditional_content = part.match(/\{\{#if.*?}}(.*?)\{\{\/if}}/s)[1] ?? ""
        return macro_present ? conditional_content : ""
    })
    return formatted.join('')
}
function substitute_params(text, params) {
    // custom function to parse macros because I literally cannot find where ST does it in their code.
    // Does NOT take into account {{#if macro}} ... {{/if}} blocks, that is done in substitute_conditionals()
    // If the macro is not found in the params object, it is replaced with an empty string

    let parts = text.split(/(\{\{.*?}})/g);
    let formatted = parts.map((part) => {
        if (!part) return ""
        if (!part.startsWith('{{') || !part.endsWith('}}')) return part
        part = part.trim()  // clean whitespace
        let macro = part.slice(2, -2)
        return params[macro] ?? ""
    })
    return formatted.join('')
}
async function create_summary_prompt(index) {
    // create the full summary prompt for the message at the given index.
    // the instruct template will automatically add an input sequence to the beginning and an output sequence to the end.
    // Therefore, if we are NOT using instructOverride, we have to remove the first system sequence at the very beginning which gets added by format_system_prompt.
    // If we ARE using instructOverride, we have to add a final trailing output sequence

    let ctx = getContext()
    let chat = ctx.chat
    let message = chat[index];

    // get history of messages (formatted as system messages) leading up to the message
    let history_text = get_message_history(index);

    // format the message itself
    let message_text = formatInstructModeChat(message.name, message.mes, message.is_user, false, "", ctx.name1, ctx.name2, null)

    // get the full prompt template from settings
    let prompt = get_settings('prompt');

    // first substitute any global macros like {{persona}}, {{char}}, etc...
    let words = await get_summary_preset_max_tokens()
    prompt = ctx.substituteParamsExtended(prompt, {"words": words})

    // then substitute any {{#if macro}} ... {{/if}} blocks
    prompt = substitute_conditionals(prompt, {"message": message_text, "history": history_text})

    // The conditional substitutions have to be done before splitting and making each section a system prompt, because the conditional content may contain regular text
    //  that should be included in the system prompt.

    // if nesting
    if (get_settings('nest_messages_in_prompt')) {
        // substitute custom macros
        prompt = substitute_params(prompt, {"message": message_text, "history": history_text});  // substitute "message" and "history" macros

        // then wrap it in the system prompt (if using instructOverride)
        prompt = formatInstructModeChat("", prompt, false, true, "", "", "", null)
    } else {  // otherwise
        // first make each prompt section its own system prompt
        prompt = system_prompt_split(prompt)

        // now substitute the custom macros
        prompt = substitute_params(prompt, {"message": message_text, "history": history_text});  // substitute "message" and "history" macros
    }

    // If using instructOverride, append the assistant starting message template to the text, replacing the name with "assistant" if needed
    let output_sequence = ctx.substituteParamsExtended(power_user.instruct.output_sequence, {name: "assistant"});
    prompt = `${prompt}\n${output_sequence}`

    // finally, append the prefill
    prompt = `${prompt} ${get_settings('prefill')}`

    return prompt
}

function refresh_memory() {
    let ctx = getContext();
    if (!chat_enabled()) { // if chat not enabled, remove the injections
        ctx.setExtensionPrompt(`${MODULE_NAME}_long`, "");
        ctx.setExtensionPrompt(`${MODULE_NAME}_short`, "");
        return;
    }

    debug("Refreshing memory")

    // Update the UI according to the current state of the chat memories, and update the injection prompts accordingly
    update_message_inclusion_flags()  // update the inclusion flags for all messages

    // get the filled out templates
    let long_injection = get_long_memory();
    let short_injection = get_short_memory();

    // inject the memories into the templates, if they exist
    ctx.setExtensionPrompt(`${MODULE_NAME}_long`,  long_injection,  get_settings('long_term_position'), get_settings('long_term_depth'), get_settings('long_term_scan'), get_settings('long_term_role'));
    ctx.setExtensionPrompt(`${MODULE_NAME}_short`, short_injection, get_settings('short_term_position'), get_settings('short_term_depth'), get_settings('short_term_scan'), get_settings('short_term_role'));

    return `${long_injection}\n\n...\n\n${short_injection}`  // return the concatenated memory text
}
const refresh_memory_debounced = debounce(refresh_memory, debounce_timeout.relaxed);

function stop_summarization() {
    // Immediately stop summarization of the chat
    STOP_SUMMARIZATION = true  // set the flag
    let ctx = getContext()
    ctx.stopGeneration();  // stop generation on current message
    clearTimeout(SUMMARIZATION_DELAY_TIMEOUT)  // clear the summarization delay timeout
    if (SUMMARIZATION_DELAY_RESOLVE !== null) SUMMARIZATION_DELAY_RESOLVE()  // resolve the delay promise so the await goes through
    log("Aborted summarization.")
}
function collect_messages_to_auto_summarize() {
    // iterate through the chat in chronological order and check which messages need to be summarized.
    let context = getContext();

    let messages_to_summarize = []  // list of indexes of messages to summarize
    let depth_limit = get_settings('auto_summarize_message_limit')  // how many valid messages back we can go
    let lag = get_settings('summarization_delay');  // number of messages to delay summarization for
    let depth = 0
    debug(`Collecting messages to summarize. Depth limit: ${depth_limit}, Lag: ${lag}`)
    for (let i = context.chat.length-1; i >= 0; i--) {
        // get current message
        let message = context.chat[i];

        // check message exclusion criteria
        let include = check_message_exclusion(message);  // check if the message should be included due to current settings
        if (!include) {
            debug(`ID [${i}]: excluded`)
            continue;
        }

        depth++

        // don't include if below the lag value
        if (depth <= lag) {
            debug(`ID [${i}]: Depth < lag (${depth} < ${lag})`)
            continue
        }

        // Check depth limit (only applies if at least 1)
        if (depth_limit > 0 && depth > depth_limit + lag) {
            debug(`ID [${i}]: Depth > depth limit + lag (${depth} > ${depth_limit} + ${lag})`)
            break;
        }

        // skip messages that already have a summary
        if (get_data(message, 'memory')) {
            debug(`ID [${i}]: Already has a memory`)
            continue;
        }

        // this message can be summarized
        messages_to_summarize.push(i)
        debug(`ID [${i}]: Included`)
    }
    debug(`Messages to summarize (${messages_to_summarize.length}): ${messages_to_summarize}`)
    return messages_to_summarize.reverse()  // reverse for chronological order
}
async function auto_summarize_chat() {
    // Perform automatic summarization on the chat
    log('Auto-Summarizing chat...')
    let messages_to_summarize = collect_messages_to_auto_summarize()

    // If we don't have enough messages to batch, don't summarize
    let messages_to_batch = get_settings('auto_summarize_batch_size');  // number of messages to summarize in a batch
    if (messages_to_summarize.length < messages_to_batch) {
        debug(`Not enough messages (${messages_to_summarize.length}) to summarize in a batch (${messages_to_batch})`)
        messages_to_summarize = []
    }

    let show_progress = get_settings('auto_summarize_progress');
    await summarize_messages(messages_to_summarize, show_progress);
}

// Event handling
var last_message_swiped = null  // if an index, that was the last message swiped
async function on_chat_event(event=null, data=null) {
    // When the chat is updated, check if the summarization should be triggered
    debug("Chat updated: " + event)

    const context = getContext();
    let index = data

    switch (event) {
        case 'chat_changed':  // chat was changed
            last_message_swiped = null;
            auto_load_profile();  // load the profile for the current chat or character
            refresh_memory();  // refresh the memory state
            if (context?.chat?.length) {
                scrollChatToBottom();  // scroll to the bottom of the chat (area is added due to memories)
            }
            break;

        case 'message_deleted':   // message was deleted
            last_message_swiped = null;
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            debug("Message deleted, refreshing memory")
            refresh_memory();
            break;

        case 'before_message':
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            if (!get_settings('auto_summarize')) break;  // if auto-summarize is disabled, do nothing
            if (!get_settings('auto_summarize_on_send')) break;  // if auto-summarize-on-send is disabled, skip
            index = context.chat.length - 1
            if (last_message_swiped === index) break;  // this is a swipe, skip
            debug("Summarizing chat before message")
            await auto_summarize_chat();  // auto-summarize the chat
            break;

        // currently no triggers on user message rendered
        case 'user_message':
            last_message_swiped = null;
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            if (!get_settings('auto_summarize')) break;  // if auto-summarize is disabled, do nothing

            // Summarize the chat if "include_user_messages" is enabled
            if (get_settings('include_user_messages')) {
                debug("New user message detected, summarizing")
                await auto_summarize_chat();  // auto-summarize the chat (checks for exclusion criteria and whatnot)
            }

            break;

        case 'char_message':
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            if (!context.groupId && context.characterId === undefined) break; // no characters or group selected
            if (streamingProcessor && !streamingProcessor.isFinished) break;  // Streaming in-progress
            if (last_message_swiped === index) {  // this is a swipe
                let message = context.chat[index];
                if (!get_settings('auto_summarize_on_swipe')) break;  // if auto-summarize on swipe is disabled, do nothing
                if (!check_message_exclusion(message)) break;  // if the message is excluded, skip
                if (!get_previous_swipe_memory(message, 'memory')) break;  // if the previous swipe doesn't have a memory, skip
                debug("re-summarizing on swipe")
                await summarize_messages(index);  // summarize the swiped message
                refresh_memory()
                break;
            } else { // not a swipe
                last_message_swiped = null;
                if (!get_settings('auto_summarize')) break;  // if auto-summarize is disabled, do nothing
                if (get_settings("auto_summarize_on_send")) break;  // if auto_summarize_on_send is enabled, don't auto-summarize on character message
                debug("New message detected, summarizing")
                await auto_summarize_chat();  // auto-summarize the chat (checks for exclusion criteria and whatnot)
                break;
            }

        case 'message_edited':  // Message has been edited
            last_message_swiped = null;
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            if (!get_settings('auto_summarize_on_edit')) break;  // if auto-summarize on edit is disabled, skip
            if (!check_message_exclusion(context.chat[index])) break;  // if the message is excluded, skip
            if (!get_data(context.chat[index], 'memory')) break;  // if the message doesn't have a memory, skip
            debug("Message with memory edited, summarizing")
            summarize_messages(index);  // summarize that message (no await so the message edit goes through)

            // TODO: I'd like to be able to refresh the memory here, but we can't await the summarization because
            //  then the message edit textbox doesn't close until the summary is done.

            break;

        case 'message_swiped':  // when this event occurs, don't summarize yet (a new_message event will follow)
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            debug("Message swiped, reloading memory")

            // if this is creating a new swipe, remove the current memory.
            // This is detected when the swipe ID is greater than the last index in the swipes array,
            //  i.e. when the swipe ID is EQUAL to the length of the swipes array, not when it's length-1.
            let message = context.chat[index];
            if (message.swipe_id === message.swipes.length) {
                clear_memory(message)
            }

            refresh_memory()
            last_message_swiped = index;

            // make sure the chat is scrolled to the bottom because the memory will change
            scrollChatToBottom();
            break;

        default:
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            debug(`Unknown event: "${event}", refreshing memory`)
            refresh_memory();
    }
}


// UI initialization
function initialize_settings_listeners() {
    log("Initializing settings listeners")

    // Trigger profile changes
    bind_setting('#profile', 'profile', 'text', () => load_profile(), false);
    bind_function('#save_profile', () => save_profile(), false);
    bind_function('#restore_profile', () => load_profile(), false);
    bind_function('#rename_profile', () => rename_profile(), false)
    bind_function('#new_profile', new_profile, false);
    bind_function('#delete_profile', delete_profile, false);

    bind_function('#export_profile', () => export_profile(), false)
    bind_function('#import_profile', (e) => {

        log($(e.target))
        log($(e.target).parent().find("#import_file"))
        $(e.target).parent().find("#import_file").click()
    }, false)
    bind_function('#import_file', async (e) => await import_profile(e), false)

    bind_function('#character_profile', () => toggle_character_profile());
    bind_function('#chat_profile', () => toggle_chat_profile());
    bind_setting('#notify_on_profile_switch', 'notify_on_profile_switch', 'boolean')

    bind_function('#stop_summarization', stop_summarization);
    bind_function('#revert_settings', reset_settings);

    bind_function('#toggle_chat_memory', () => toggle_chat_enabled(), false);
    bind_function('#edit_memory_state', () => memoryEditInterface.show())
    bind_function("#refresh_memory", () => refresh_memory());

    bind_function('#edit_summary_prompt', async () => {
        let max_tokens = await get_summary_preset_max_tokens()
        let description = `
Available Macros:
<ul style="text-align: left; font-size: smaller;">
    <li><b>{{message}}:</b> The message text.</li>
    <li><b>{{history}}:</b> The message history as configured by the "Message History" setting.</li>
    <li><b>{{words}}:</b> The token limit as defined by the chosen completion preset (Currently: ${max_tokens}).</li>
</ul>
`
        get_user_setting_text_input('prompt', 'Edit Summary Prompt', description)
    })
    bind_function('#preview_summary_prompt', async () => {
        let text = await create_summary_prompt(getContext().chat.length-1)
        display_text_modal("Summary Prompt Preview (Last Message)", text);
    })
    bind_function('#edit_long_term_memory_prompt', async () => {
        get_user_setting_text_input('long_template', 'Edit Long-Term Memory Prompt')
    })
    bind_function('#edit_short_term_memory_prompt', async () => {
        get_user_setting_text_input('short_template', 'Edit Short-Term Memory Prompt')
    })
    bind_function('#preview_message_history', async () => {
        let chat = getContext().chat;
        let history = get_message_history(chat.length-1);
        display_text_modal("{{history}} Macro Preview (Last Message)", history);
    })

    bind_setting('#connection_profile', 'connection_profile', 'text')
    bind_setting('#completion_preset', 'completion_preset', 'text')
    bind_setting('#auto_summarize', 'auto_summarize', 'boolean');
    bind_setting('#auto_summarize_on_edit', 'auto_summarize_on_edit', 'boolean');
    bind_setting('#auto_summarize_on_swipe', 'auto_summarize_on_swipe', 'boolean');
    bind_setting('#summarization_delay', 'summarization_delay', 'number');
    bind_setting('#summarization_time_delay', 'summarization_time_delay', 'number')
    bind_setting('#auto_summarize_batch_size', 'auto_summarize_batch_size', 'number');
    bind_setting('#auto_summarize_message_limit', 'auto_summarize_message_limit', 'number');
    bind_setting('#auto_summarize_progress', 'auto_summarize_progress', 'boolean');
    bind_setting('#auto_summarize_on_send', 'auto_summarize_on_send', 'boolean');
    bind_setting('#prefill', 'prefill', 'text')
    bind_setting('#show_prefill', 'show_prefill', 'boolean')

    bind_setting('#include_world_info', 'include_world_info', 'boolean');
    bind_setting('#block_chat', 'block_chat', 'boolean');
    bind_setting('#include_user_messages', 'include_user_messages', 'boolean');
    bind_setting('#include_system_messages', 'include_system_messages', 'boolean');
    bind_setting('#include_narrator_messages', 'include_narrator_messages', 'boolean')

    bind_setting('#message_length_threshold', 'message_length_threshold', 'number');
    bind_setting('#nest_messages_in_prompt', 'nest_messages_in_prompt', 'boolean')

    bind_setting('#include_message_history', 'include_message_history', 'number');
    bind_setting('#include_message_history_mode', 'include_message_history_mode', 'text');
    bind_setting('#include_user_messages_in_history', 'include_user_messages_in_history', 'boolean');

    bind_setting('input[name="short_term_position"]', 'short_term_position', 'number');
    bind_setting('#short_term_depth', 'short_term_depth', 'number');
    bind_setting('#short_term_role', 'short_term_role');
    bind_setting('#short_term_scan', 'short_term_scan', 'boolean');
    bind_setting('#short_term_context_limit', 'short_term_context_limit', 'number', () => {
        $('#short_term_context_limit_display').text(get_short_token_limit());
    });
    bind_setting('input[name="short_term_context_type"]', 'short_term_context_type', 'text', () => {
        $('#short_term_context_limit_display').text(get_short_token_limit());
    })

    bind_setting('input[name="long_term_position"]', 'long_term_position', 'number');
    bind_setting('#long_term_depth', 'long_term_depth', 'number');
    bind_setting('#long_term_role', 'long_term_role');
    bind_setting('#long_term_scan', 'long_term_scan', 'boolean');
    bind_setting('#long_term_context_limit', 'long_term_context_limit', 'number', () => {
        $('#long_term_context_limit_display').text(get_long_token_limit());  // update the displayed token limit
    });
    bind_setting('input[name="long_term_context_type"]', 'long_term_context_type', 'text', () => {
        $('#long_term_context_limit_display').text(get_long_token_limit());  // update the displayed token limit
    })

    bind_setting('#debug_mode', 'debug_mode', 'boolean');
    bind_setting('#display_memories', 'display_memories', 'boolean')
    bind_setting('#default_chat_enabled', 'default_chat_enabled', 'boolean');
    bind_setting('#use_global_toggle_state', 'use_global_toggle_state', 'boolean');
    bind_setting('#limit_injected_messages', 'limit_injected_messages', 'number');
    bind_setting('#summary_injection_separator', 'summary_injection_separator', 'text')

    // trigger the change event once to update the display at start
    $('#long_term_context_limit').trigger('change');
    $('#short_term_context_limit').trigger('change');

    refresh_settings()
}
function initialize_message_buttons() {
    // Add the message buttons to the chat messages
    debug("Initializing message buttons")

    let html = `
<div title="Remember (toggle inclusion of summary in long-term memory)" class="mes_button ${remember_button_class} fa-solid fa-brain" tabindex="0"></div>
<div title="Force Exclude (toggle inclusion of summary from all memory)" class="mes_button ${forget_button_class} fa-solid fa-ban" tabindex="0"></div>
<div title="Edit Summary" class="mes_button ${edit_button_class} fa-solid fa-pen-fancy" tabindex="0"></div>
<div title="Summarize (AI)" class="mes_button ${summarize_button_class} fa-solid fa-quote-left" tabindex="0"></div>
<span class="${css_button_separator}"></span>
`

    $("#message_template .mes_buttons .extraMesButtons").prepend(html);

    // button events
    let $chat = $("div#chat")
    $chat.on("click", `.${remember_button_class}`, async function () {
        const message_block = $(this).closest(".mes");
        const message_id = Number(message_block.attr("mesid"));
        remember_message_toggle(message_id);
    });
    $chat.on("click", `.${forget_button_class}`, async function () {
        const message_block = $(this).closest(".mes");
        const message_id = Number(message_block.attr("mesid"));
        forget_message_toggle(message_id);
    })
    $chat.on("click", `.${summarize_button_class}`, async function () {
        const message_block = $(this).closest(".mes");
        const message_id = Number(message_block.attr("mesid"));
        await summarize_messages(message_id);  // summarize the message
    });
    $chat.on("click", `.${edit_button_class}`, async function () {
        const message_block = $(this).closest(".mes");
        const message_id = Number(message_block.attr("mesid"));
        await open_edit_memory_input(message_id);
    });

    // when a message is hidden/unhidden, trigger a memory refresh
    $chat.on("click", ".mes_hide", refresh_memory);
    $chat.on("click", ".mes_unhide", refresh_memory);


}
function initialize_group_member_buttons() {
    // Insert a button into the group member selection to disable summarization
    debug("Initializing group member buttons")

    let $template = $('#group_member_template').find('.group_member_icon')
    let $button = $(`<div title="Toggle summarization for memory" class="right_menu_button fa-solid fa-lg fa-brain ${group_member_enable_button}"></div>`)

    // add listeners
    $(document).on("click", `.${group_member_enable_button}`, (e) => {

        let member_block = $(e.target).closest('.group_member');
        let char_key = member_block.data('id')
        let char_id = member_block.attr('chid')

        if (!char_key) {
            error("Character key not found in group member block.")
        }

        // toggle the enabled status of this character
        toggle_character_enabled(char_key)
        set_character_enabled_button_states()  // update the button state
    })

    $template.prepend($button)
}
function set_character_enabled_button_states() {
    // for each character in the group chat, set the button state based on their enabled status
    let $enable_buttons = $(`#rm_group_members`).find(`.${group_member_enable_button}`)

    // if we are creating a new group (openGroupId is undefined), then hide the buttons
    if (openGroupId === undefined) {
        $enable_buttons.hide()
        return
    }

    // set the state of each button
    for (let button of $enable_buttons) {
        let member_block = $(button).closest('.group_member');
        let char_key = member_block.data('id')
        let enabled = character_enabled(char_key)
        if (enabled) {
            $(button).addClass(group_member_enable_button_highlight)
        } else {
            $(button).removeClass(group_member_enable_button_highlight)
        }
    }
}
function initialize_slash_commands() {
    let ctx = getContext()
    let SlashCommandParser = ctx.SlashCommandParser
    let SlashCommand = ctx.SlashCommand
    let SlashCommandArgument = ctx.SlashCommandArgument
    let SlashCommandNamedArgument = ctx.SlashCommandNamedArgument
    let ARGUMENT_TYPE = ctx.ARGUMENT_TYPE

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'qvink_log_chat',
        callback: (args) => {
            log(getContext())
            log(getContext().chat)
        },
        helpString: 'log chat',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'qvink_log_settings',
        callback: async (args) => {
            log(extension_settings[MODULE_NAME])
        },
        helpString: 'Log current settings',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'hard_reset',
        callback: (args) => {
            hard_reset_settings()
            refresh_settings()
            refresh_memory()
        },
        helpString: 'Hard reset all settings',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'remember',
        callback: (args, index) => {
            if (index === "") index = null  // if not provided the index is an empty string, but we need it to be null to get the default behavior
            remember_message_toggle(index);
        },
        helpString: 'Toggle the remember status of a message (default is the most recent message)',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Index of the message to toggle',
                isRequired: false,
                typeList: ARGUMENT_TYPE.NUMBER,
            }),
        ],
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'force_exclude_memory',
        callback: (args, index) => {
            if (index === "") index = null  // if not provided the index is an empty string, but we need it to be null to get the default behavior
            forget_message_toggle(index);
        },
        helpString: 'Toggle the ememory exclusion status of a message (default is the most recent message)',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Index of the message to toggle',
                isRequired: false,
                typeList: ARGUMENT_TYPE.NUMBER,
            }),
        ],
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'toggle_memory',
        callback: (args, state) => {
            if (state === "") {  // if not provided the state is an empty string, but we need it to be null to get the default behavior
                state = null
            } else {
                state = state === "true"  // convert to boolean
            }

            toggle_chat_enabled(state);  // toggle the memory for the current chat
        },
        helpString: 'Change whether memory is enabled for the current chat. If no state is provided, it will toggle the current state.',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Boolean value to set the memory state',
                isRequired: false,
                typeList: ARGUMENT_TYPE.BOOLEAN,
            }),
        ],
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'get_memory_enabled',
        callback: (args) => {
            return chat_enabled()
        },
        helpString: 'Return whether memory is currently enabled.'
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'toggle_memory_display',
        callback: (args) => {
            $(`.${settings_content_class} #display_memories`).click();  // toggle the memory display
        },
        helpString: "Toggle the \"display memories\" setting on the current profile (doesn't save the profile).",
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'toggle_memory_popout',
        callback: (args) => {
            toggle_popout()
        },
        helpString: 'Toggle the extension config popout',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'toggle_memory_edit_interface',
        callback: (args) => {
            memoryEditInterface.show()
        },
        helpString: 'Toggle the memory editing interface',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'toggle_memory_injection_preview',
        callback: (args) => {
            display_injection_preview()
        },
        helpString: 'Toggle a preview of the current memory injection',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'summarize_chat',
        helpString: 'Summarize the chat using the auto-summarization criteria, even if auto-summarization is off.',
        callback: async (args, limit) => {
            let indexes = collect_messages_to_auto_summarize()
            await summarize_messages(indexes);
        },
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'summarize',
        callback: async (args, index) => {
            if (index === "") index = null  // if not provided the index is an empty string, but we need it to be null to get the default behavior
            await summarize_messages(index);  // summarize the message
            refresh_memory();
        },
        helpString: 'Summarize the given message index (defaults to most recent applicable message)',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Index of the message to summarize',
                isRequired: false,
                typeList: ARGUMENT_TYPE.NUMBER,
            }),
        ],
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'stop_summarization',
        callback: (args) => {
            stop_summarization()
        },
        helpString: 'Abort any summarization taking place.',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'get_memory',
        callback: async (args, index) => {
            let chat = getContext().chat
            if (index === "") index = chat.length - 1
            return get_memory(chat[index])
        },
        helpString: 'Return the memory associated with a given message index. If no index given, assumes the most recent message.',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Index of the message',
                isRequired: false,
                typeList: ARGUMENT_TYPE.NUMBER,
            }),
        ],
    }));
}

function add_menu_button(text, fa_icon, callback, hover=null) {
    let $button = $(`
    <div class="list-group-item flex-container flexGap5 interactable" title="${hover ?? text}" tabindex="0">
        <i class="${fa_icon}"></i>
        <span>${text}</span>
    </div>
    `)

    let $extensions_menu = $('#extensionsMenu');
    if (!$extensions_menu.length) {
        error('Could not find the extensions menu');
    }

    $button.appendTo($extensions_menu)
    $button.click(() => callback());
}
function initialize_menu_buttons() {
    add_menu_button("Toggle Memory", "fa-solid fa-brain", toggle_chat_enabled, "Toggle memory for the current chat.")
}


// Popout handling.
// We save a jQuery reference to the entire settings content, and move it between the original location and the popout.
// This is done carefully to preserve all event listeners when moving, and the move is always done before calling remove() on the popout.
// clone() doesn't work because of the select2 widget for some reason.
let $settings_element = null;  // all settings content
let $original_settings_parent = null;  // original location of the settings element
let $popout = null;  // the popout element
let POPOUT_VISIBLE = false;
function initialize_popout() {
    // initialize the popout logic, creating the $popout object and storing the $settings_element

    // Get the settings element and store it
    $settings_element = $(`#${settings_div_id}`).find(`.inline-drawer-content .${settings_content_class}`)
    $original_settings_parent = $settings_element.parent()  // where the settings are originally placed

    debug('Creating popout window...');

    // repurposes the zoomed avatar template (it's a floating div to the left of the chat)
    $popout = $($('#zoomed_avatar_template').html());
    $popout.attr('id', 'qmExtensionPopout').removeClass('zoomed_avatar').addClass('draggable').empty();

    // create the control bar with the close button
    const controlBarHtml = `<div class="panelControlBar flex-container">
    <div class="fa-solid fa-grip drag-grabber hoverglow"></div>
    <div class="fa-solid fa-circle-xmark hoverglow dragClose"></div>
    </div>`;
    $popout.append(controlBarHtml)

    loadMovingUIState();
    dragElement($popout);

    // set up the popout button in the settings to toggle it
    bind_function('#qvink_popout_button', (e) => {
        toggle_popout();
        e.stopPropagation();
    })

    // when escape is pressed, toggle the popout.
    // This has to be here because ST removes .draggable items when escape is pressed, destroying the popout.
    $(document).on('keydown', async function (event) {
         if (event.key === 'Escape') {
             close_popout()
         }
    });
}
function open_popout() {
    debug("Showing popout")
    $('body').append($popout);  // add the popout to the body

    // setup listener for close button to remove the popout
    $popout.find('.dragClose').off('click').on('click', function () {
        close_popout()
    });

    $settings_element.appendTo($popout)  // move the settings to the popout
    $popout.fadeIn(animation_duration);
    POPOUT_VISIBLE = true
}
function close_popout() {
    debug("Hiding popout")
    $popout.fadeOut(animation_duration, () => {
        $settings_element.appendTo($original_settings_parent)  // move the settings back
        $popout.remove()  // remove the popout
    });
    POPOUT_VISIBLE = false
}
function toggle_popout() {
    // toggle the popout window
    if (POPOUT_VISIBLE) {
        close_popout()
    } else {
        open_popout()
    }
}

// Entry point
let memoryEditInterface;
jQuery(async function () {
    log(`Loading extension...`)

    // Read version from manifest.json
    const manifest = await get_manifest();
    const VERSION = manifest.version;
    log(`Version: ${VERSION}`)

    // Load settings
    initialize_settings();

    memoryEditInterface = new MemoryEditInterface()

    // load settings html
    await load_settings_html();

    // initialize UI stuff
    initialize_settings_listeners();
    initialize_popout()
    initialize_message_buttons();
    initialize_group_member_buttons();
    initialize_slash_commands();
    initialize_menu_buttons();

    // ST event listeners
    let ctx = getContext();
    let eventSource = ctx.eventSource;
    let event_types = ctx.event_types;
    eventSource.makeLast(event_types.CHARACTER_MESSAGE_RENDERED, (id) => on_chat_event('char_message', id));
    eventSource.on(event_types.USER_MESSAGE_RENDERED, (id) => on_chat_event('user_message', id));
    eventSource.on(event_types.GENERATE_BEFORE_COMBINE_PROMPTS, (id, stuff) => on_chat_event('before_message', id));
    eventSource.on(event_types.MESSAGE_DELETED, (id) => on_chat_event('message_deleted', id));
    eventSource.on(event_types.MESSAGE_EDITED, (id) => on_chat_event('message_edited', id));
    eventSource.on(event_types.MESSAGE_SWIPED, (id) => on_chat_event('message_swiped', id));
    eventSource.on(event_types.CHAT_CHANGED, () => on_chat_event('chat_changed'));
    eventSource.on(event_types.MORE_MESSAGES_LOADED, refresh_memory)
    eventSource.on('groupSelected', set_character_enabled_button_states)
    eventSource.on(event_types.GROUP_UPDATED, set_character_enabled_button_states)

    // Global Macros  // TODO get this working
    //MacrosParser.registerMacro("qvink_memory_short_memory", () => get_short_memory());
    //MacrosParser.registerMacro("qvink_memory_long_memory", () => get_long_memory());

});
