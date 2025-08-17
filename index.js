import {
    getStringHash,
    debounce,
    copyText,
    trimToEndSentence,
    download,
    parseJsonFile,
    stringToRange,
    waitUntilCondition
} from '../../../utils.js';
import {
    animation_duration,
    scrollChatToBottom,
    saveSettingsDebounced,
    getCharacterCardFields,
    messageFormatting,
    generateRaw,
    createRawPrompt,
    getMaxContextSize,
    streamingProcessor,
    amount_gen,
    system_message_types,
    extension_prompt_roles,
    extension_prompt_types,
    CONNECT_API_MAP,
    main_api,
    online_status,
    chat_metadata,
} from '../../../../script.js';
import { getContext, extension_settings, saveMetadataDebounced} from '../../../extensions.js';
import { getPresetManager } from '../../../preset-manager.js'
import { formatInstructModeChat, formatInstructModePrompt } from '../../../instruct-mode.js';
import { selected_group, openGroupId } from '../../../group-chats.js';
import { loadMovingUIState, power_user } from '../../../power-user.js';
import { dragElement } from '../../../RossAscends-mods.js';
import { debounce_timeout } from '../../../constants.js';
import { MacrosParser } from '../../../macros.js';
import { commonEnumProviders } from '../../../slash-commands/SlashCommandCommonEnumsProvider.js';
import { getRegexScripts } from '../../../../scripts/extensions/regex/index.js'
import { runRegexScript } from '../../../../scripts/extensions/regex/engine.js'
import { t, translate } from '../../../i18n.js';

export { MODULE_NAME };

// THe module name modifies where settings are stored, where information is stored on message objects, macros, etc.
const MODULE_NAME = 'qvink_memory';
const MODULE_NAME_FANCY = 'Qvink Memory';
const PROGRESS_BAR_ID = `${MODULE_NAME}_progress_bar`;

// CSS classes (must match the CSS file because I'm too stupid to figure out how to do this properly)
const css_message_div = `qvink_memory_display`
const css_short_memory = `qvink_short_memory`
const css_long_memory = `qvink_long_memory`
const css_remember_memory = `qvink_old_memory`
const css_exclude_memory = `qvink_exclude_memory`
const css_lagging_memory = `qvink_lagging_memory`
const css_removed_message = `qvink_removed_message`
const summary_div_class = `qvink_memory_text`  // class put on all added summary divs to identify them
const summary_reasoning_class = 'qvink_memory_reasoning'
const css_button_separator = `qvink_memory_button_separator`
const css_edit_textarea = `qvink_memory_edit_textarea`
const settings_div_id = `qvink_memory_settings`  // ID of the main settings div.
const settings_content_class = `qvink_memory_settings_content` // Class for the main settings content div which is transferred to the popup
const group_member_enable_button = `qvink_memory_group_member_enable`
const group_member_enable_button_highlight = `qvink_memory_group_member_enabled`

// Macros for long-term and short-term memory injection
const long_memory_macro = `qm-long-term-memory`;
const short_memory_macro = `qm-short-term-memory`;
const generic_memories_macro = `memories`;

// message button classes
const remember_button_class = `${MODULE_NAME}_remember_button`
const summarize_button_class = `${MODULE_NAME}_summarize_button`
const edit_button_class = `${MODULE_NAME}_edit_button`
const forget_button_class = `${MODULE_NAME}_forget_button`

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
const default_long_template = `[Following is a list of events that occurred in the past]:\n{{${generic_memories_macro}}}\n`
const default_short_template = `[Following is a list of recent events]:\n{{${generic_memories_macro}}}\n`
const default_summary_macros = {  // default set of macros for the summary prompt.
    "message": {name: "message", default: true, enabled: true,  type: "special", instruct_template: false, apply_regex: true, description: "The message being summarized"},
    "words":   {name: "words",   default: true, enabled: true,  type: "custom",  instruct_template: false, apply_regex: false, command: "/qm-max-summary-tokens", description: "Max response tokens defined by the chosen completion preset"},
    "history": {name: "history", default: true, enabled: false, type: "preset",  instruct_template: true, apply_regex: true, start: 1, end: 6, bot_messages: true, user_messages: true, bot_summaries: false, user_summaries: false},
}
const default_settings = {
    // inclusion criteria
    message_length_threshold: 10,  // minimum message token length for summarization
    include_user_messages: false,  // include user messages in summarization
    include_system_messages: false,  // include system messages in summarization (hidden messages)
    include_narrator_messages: false,  // include narrator messages in summarization (like from the /sys command)
    include_thought_messages: false,  // include thought messages in summarization (Stepped Thinking extension)

    // summarization settings
    prompt: default_prompt,
    summary_prompt_macros: default_summary_macros,  // macros for the summary prompt interface
    prompt_role: extension_prompt_roles.SYSTEM,
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
const global_settings = {
    profiles: {},  // dict of profiles by name
    character_profiles: {},  // dict of character identifiers to profile names
    profile: 'Default', // Current profile
    notify_on_profile_switch: false,
    global_toggle_state: true,  // global state of memory (used when a profile uses the global state)
    disabled_group_characters: {},  // group chat IDs mapped to a list of disabled character keys
    memory_edit_interface_settings: {},  // settings last used in the memory edit interface
}
const settings_ui_map = {}  // map of settings to UI elements


// Utility functions
function log() {
    console.log(`[${MODULE_NAME_FANCY}]`, ...arguments);
}
function debug() {
    if (get_settings('debug_mode')) {
        log("[DEBUG]", ...arguments);
    }
}
function error() {
    console.error(`[${MODULE_NAME_FANCY}]`, ...arguments);
    toastr.error(Array.from(arguments).join(' '), MODULE_NAME_FANCY);
}
function delay(ms) {
    return new Promise(res => setTimeout(res, ms));
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

    // If a group, we can use the group ID to uniquely identify it
    if (context.groupId) {
        return context.groupId
    }

    // Otherwise get the avatar image path of the current character
    let index = context.characterId;
    if (!index) {  // not a character
        return null;
    }

    return context.characters[index].avatar;
}
function get_extension_directory() {
    // get the directory of the extension
    let index_path = new URL(import.meta.url).pathname
    return index_path.substring(0, index_path.lastIndexOf('/'))  // remove the /index.js from the path
}
function clean_string_for_html(text) {
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
    // return $('<div/>').text(text).html();
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
function assign_and_prune(target, source) {
    // Modifies target in-place while also deleting any keys not in source
    let keys = Object.keys(target).concat(Object.keys(source))
    for (let key of keys) {
        if (!(key in source)) delete target[key];
        else target[key] = source[key];
    }
}
function assign_defaults(target, source) {
    // Modifies target in-place, assigning values only when they don't exist in the target.
    for (let key of Object.keys(source)) {
        if (!(key in target)) target[key] = source[key];
    }
}
function check_objects_different(obj_1, obj_2) {
    // check whether two objects are different by checking each key, recursively
    // if both are objects, recurse on each element of obj_1
    // The "instanceof" method is true for Objects, Arrays, and Sets.
    if (obj_1 instanceof Object && obj_2 instanceof Object) {
        let keys = Object.keys(obj_1).concat(Object.keys(obj_2))
        for (let key of keys) {
            if (check_objects_different(obj_1[key], obj_2[key])) {
                return true  // different
            }
        }
        return false  // not different
    } else {  // not both objects - check equality directly
        return obj_1 !== obj_2  // return if different
    }
}
function regex(string, re) {
    // Returns an array of all matches in capturing groups
    let matches = [...string.matchAll(re)];
    return matches.flatMap(m => m.slice(1).filter(Boolean));
}
function get_regex_script(name) {
    const scripts = getRegexScripts();
    for (let script of scripts) {
        if (script.scriptName === name) {
            return script
        }
    }
    debug(`No regex script found: "${name}"`)
}
function add_i18n($element=null) {
    // dynamically translate config settings
    log("Translating with i18n...")
    if ($element === null) {
        $element = $(`.${settings_content_class}`)
    }

    $element.each(function () {
        let $this = $(this);
        // Find all elements with either text or a title
        $this.find('*').each(function () {
            let $el = $(this);

            // translate title attribute if present
            if ($el.attr('title')) {
                $el.attr('title', translate($el.attr('title')));
            }

            if ($el.attr('placeholder')) {
                $el.attr('placeholder', translate($el.attr('placeholder')));
            }

            // translate the inner text, if present
            if (!this.childNodes) return
            for (let child of this.childNodes) {  // each child node (including text nodes)
                let text = child.nodeValue
                if (!text?.trim()) continue  // null or just whitespace
                child.nodeValue = text?.replace(text?.trim(), translate(text?.trim()))  // replace text with translated text
            }
        });
    })
}
async function wait_for_event(name, timeout=5000) {
    // Wait for the given ST event asynchronously
    let ctx = getContext()
    let eventSource = ctx.eventSource
    debug(`Waiting for event`, name)
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            eventSource.removeListener(event, onEvent);
            reject(new Error(`Timed out waiting for event "${name}"`));
        }, timeout);

        function onEvent(...args) {
            clearTimeout(timer);
            eventSource.removeListener(name, onEvent);
            resolve(...args);
            debug(`Received and resolved event "${name}"`);
        }

        eventSource.once(name, onEvent);
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

    // If the API type isn't defined, it might be excluded from the connection profile. Assume based on mode.
    if (data.api === undefined) {
        debug(`API not defined in connection profile ${name}. Mode is ${data.mode}`)
        if (data.mode === 'tc') return 'textgenerationwebui'
        if (data.mode === 'cc') return 'openai'
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
    if (name === await get_current_connection_profile()) return;  // If already using the given profile, return
    if (!await check_connection_profile_valid()) return;  // don't set an invalid profile

    // Set the completion preset
    debug(`Setting connection profile to "${name}"`)
    if (get_settings('debug_mode')) {
        toastr.info(`Setting connection profile to "${name}"`);
    }

    let ctx = getContext();
    const waitForLoad = wait_for_event(ctx.event_types.CONNECTION_PROFILE_LOADED, 5000);  // set trigger when profile loads

    try {
        await ctx.executeSlashCommandsWithOptions(`/profile ${name}`)  // call the "/profile" command to set it
        await waitForLoad;  // wait for the profile to load
        debug(`Profile loaded. Waiting for status to change...`);
        await waitUntilCondition(() => online_status !== 'no_connection', 5000, 100);  // wait for profile to be online
        debug(`Saw online_status change (${online_status}). Connection profile set to ${name}.`);
    } catch (e) {
        error(`Failed to set connection profile "${name}": ${e}`);
    }
}
async function get_connection_profiles() {
    // Get a list of available connection profiles
    if (!check_connection_profiles_active()) return;  // if the extension isn't active, return
    let ctx = getContext();
    let result = await ctx.executeSlashCommandsWithOptions(`/profile-list`)  // the "/profile-list" command returns a stringified list
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
function set_settings(key, value, copy=false) {
    // Set a setting for the extension and save it
    if (copy) {
        value = structuredClone(value)
    }
    extension_settings[MODULE_NAME][key] = value;
    saveSettingsDebounced();
}
function get_settings(key, copy=false) {
    // Get a setting for the extension, or the default value if not set
    let value = extension_settings[MODULE_NAME]?.[key] ?? default_settings[key];
    if (copy) {  // needed when retrieving objects
        return structuredClone(value)
    } else {
        return value
    }

}
function set_chat_metadata(key, value, copy=false) {
    // Set a key and value in chat metadata (persists with branches)
    if (copy) {
        value = structuredClone(value);
    }
    if (!chat_metadata[MODULE_NAME]) chat_metadata[MODULE_NAME] = {};
    chat_metadata[MODULE_NAME][key] = value;
    saveMetadataDebounced();
}
function get_chat_metadata(key, copy=false) {
    // Get a key from chat metadata
    let value = chat_metadata[MODULE_NAME]?.[key]
    if (copy) {  // needed when retrieving objects
        return structuredClone(value)
    } else {
        return value
    }
}

function get_settings_element(key) {
    return settings_ui_map[key]?.[0]
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
        $("#extensions_settings2").append(response);  // load html into the settings div
        return true
    }).catch((response) => {
        error(`Error getting settings.json from "${path}": status: ${response.status}`);
        return false
    })

    return new Promise(resolve => resolve(found))
}
function chat_enabled() {
    // check if the extension is enabled in the current chat

    // global state
    if (get_settings('use_global_toggle_state')) {
        return get_settings('global_toggle_state')
    }

    // per-chat state
    return get_chat_metadata('enabled') ?? get_settings('default_chat_enabled')
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
        set_chat_metadata('enabled', value);
    }


    if (value) {
        toastr.info(`Memory is now enabled for this chat`);
    } else {
        toastr.warning(`Memory is now disabled for this chat`);
    }
    refresh_memory()

    // update the message visuals
    update_all_message_visuals()  // not needed? happens in update_message_inclusion_flags

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
        debug(`Setting Triggered: [${key}] [${value}]`)
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
    let current_profile = get_settings('profile')
    let current_character_profile = get_character_profile();
    let current_chat_profile = get_chat_profile();
    let profile_options = Object.keys(get_settings('profiles'));

    let $choose_profile_dropdown = $(`.${settings_content_class} #profile`).empty();
    let $character = $('button#character_profile')
    let $chat = $('button#chat_profile')
    let $character_icon = $character.find('i')
    let $chat_icon = $chat.find('i')


    // Set the profile dropdowns to reflect the available profiles and the currently chosen one.
    // The value is set later when all config settings are updated
    for (let profile of profile_options) {
        // if the current character/chat has a default profile, indicate as such
        let text = profile
        if (profile === current_character_profile) {
            text = `${profile} (${t`Character`})`
        } else if (profile === current_chat_profile) {
            text = `${profile} (${t`Chat`})`
        }
        $choose_profile_dropdown.append(`<option value="${profile}">${text}</option>`);
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
    $preset_select.append(`<option value="">${t`Same as Current`}</option>`)
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
    $connection_select.append(`<option value="">${t`Same as Current`}</option>`)
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

    // auto_summarize_message_limit must be >= auto_summarize_batch_size (unless the limit is disabled, i.e. -1)
    let auto_limit = get_settings('auto_summarize_message_limit')
    let batch_size = get_settings('auto_summarize_batch_size')
    if (auto_limit >= 0 && (auto_limit < batch_size)) {
        set_settings('auto_summarize_message_limit', get_settings('auto_summarize_batch_size'));
        toast("The auto-summarize message limit must be greater than or equal to the batch size.", "warning")
    }

    // update the save icon highlight
    update_save_icon_highlight();

    // update the profile section
    update_profile_section()

    // Update the context limit token displays
    $(`.${settings_content_class} #short_term_context_limit_display`).text(get_short_token_limit());
    $(`.${settings_content_class} #long_term_context_limit_display`).text(get_long_token_limit());

    // iterate through the settings map and set each element to the current setting value
    for (let [key, [element, type]] of Object.entries(settings_ui_map)) {
        set_setting_ui_element(key, element, type);
    }

    // enable or disable settings based on others
    if (chat_enabled()) {
        $(`.${settings_content_class} .settings_input`).prop('disabled', false);  // enable all settings

        // when auto-summarize is disabled, related settings get disabled
        let auto_summarize = get_settings('auto_summarize');
        get_settings_element('auto_summarize_on_send')?.prop('disabled', !auto_summarize)
        get_settings_element('auto_summarize_message_limit')?.prop('disabled', !auto_summarize);
        get_settings_element('auto_summarize_batch_size')?.prop('disabled', !auto_summarize);
        get_settings_element('auto_summarize_progress')?.prop('disabled', !auto_summarize);
        get_settings_element('summarization_delay')?.prop('disabled', !auto_summarize);

        // If not excluding message, then disable the option to preserve the last user message
        let excluding_messages = get_settings('exclude_messages_after_threshold')
        get_settings_element('keep_last_user_message')?.prop('disabled', !excluding_messages)


    } else {  // memory is disabled for this chat
        $(`.${settings_content_class} .settings_input`).prop('disabled', true);  // disable all settings
    }


    //////////////////////
    // Settings not in the config

    // set group chat character enable button state
    set_character_enabled_button_states()

}

function refresh_select2_element(element, selected, options, placeholder="", callback) {
    // Refresh a select2 element with the given select element (or ID) and set the options
    /*
    Use like this:
    <div class="flex-container justifySpaceBetween alignItemsCenter">
        <label title="description here">
            <span>label here</span>
            <select id="id_here" multiple="multiple"></select>
        </label>
    </div>
     */
    let $select = element
    let id;
    if (typeof(element) === "string") {
        $select = $(`#${element}`)
        id = element
    } else {
        id = element.attr('id')
    }

    // check whether the dropdown is open. If so, don't update the options (it messes with the widget)
    let $dropdown = $(`#select2-${id}-results`)
    if ($dropdown.length > 0) {
        return
    }

    $select.empty()  // clear current options

    // add the options to the dropdown
    for (let {id, name} of options) {
        name = clean_string_for_html(name)
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
            dropdownParent: $select.parent()
        });

        $select.on('change', () => {
            let values = []
            for (let value of $select.select2('data')) {
                values.push(value.text)
            }
            callback(values)
        })

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
    return check_objects_different(current_settings, profile_settings)
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
async function delete_profile() {
    // Delete the current profile
    if (get_settings('profiles').length === 1) {
        error("Cannot delete your last profile");
        return;
    }
    let profile = get_settings('profile');
    let profiles = get_settings('profiles');

    let result = await getContext().Popup.show.confirm(`Permanently delete profile: "${profile}"`, "", {okButton: 'Delete', cancelButton: 'Cancel'});
    if (!result) {
        return
    }

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
    debug("Character Key: "+key)
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
    // Toggle whether the current profile is set to the default for the current chat
    let profile = get_settings('profile');  // current profile

    // if the chat profile is already set to the current profile, unset it.
    // otherwise, set it to the current profile.
    set_chat_profile(profile === get_chat_profile() ? null : profile);
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
function get_chat_profile() {
    // Get the profile for the current chat
    return get_chat_metadata('profile');
}
function set_chat_profile(profile=null) {
    // Set the profile for a given chat (or unset it if no profile provided)
    if (profile) {
        set_chat_metadata('profile', profile)
        log(`Set chat to use profile [${profile}]`);
    } else {
        set_chat_metadata('profile', null)
        log(`Unset chat default profile`);
    }
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
    let lagging = get_data(message, 'lagging');  // not injected yet

    let style = ""
    if (remember && include) {  // marked to be remembered and included in memory anywhere
        style = css_long_memory
    } else if (include === "short") {  // not marked to remember, but included in short-term memory
        style = css_short_memory
    } else if (remember) {  // marked to be remembered but not included in memory
        style = css_remember_memory
    } else if (exclude) {  // marked as force-excluded
        style = css_exclude_memory
    }

    if (lagging) {
        style = `${style} ${css_lagging_memory}`
    }

    return style
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
    let reasoning = get_data(message, 'reasoning')
    let memory = get_memory(message)
    let lagging = get_data(message, 'lagging')  // lagging behind injection threshold
    let error_message = get_data(message, 'error');
    if (error_message) error_message = translate(error_message)
    let exclude_messages = get_settings('exclude_messages_after_threshold')  // are we excluding messages after the threshold?

    // get the div holding the main message text
    let message_element = div_element.find('div.mes_text');

    // If we are excluding messages and the message isn't lagging (i.e. the message is removed and the summary injected)
    if (exclude_messages && !lagging) {
        message_element.addClass(css_removed_message);
    } else {
        message_element.removeClass(css_removed_message);
    }

    // get the style class, either passed in or based on inclusion flags
    let style_class = style ? get_summary_style_class(message) : ""

    // if no text is provided, use the memory text
    if (!text) {
        text = ""  // default text when no memory
        if (memory) {
            text = clean_string_for_html(`Memory: ${memory}`)
        } else if (error_message) {
            style_class = ''  // clear the style class if there's an error
            text = `Error: ${error_message}`
        }
    }

    // parse markdown
    // text, ch_name, isSystem, isUser, messageId
    text = messageFormatting(text, null, false, false, -1)

    // create the div element for the memory and add it to the message div
    let memory_div = $(`<div class="${summary_div_class} ${css_message_div}"><span class="${style_class}">${text}</span></div>`)
    if (reasoning) {
        reasoning = clean_string_for_html(reasoning)
        memory_div.prepend($(`<span class="${summary_reasoning_class}" title="${reasoning}">[${t`Reasoning`}] </span>`))
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
    let html = `<h3>${title}</h3><div style="text-align: left; overflow: auto;">${text}</div>`
    let popup = new ctx.Popup(html, ctx.POPUP_TYPE.TEXT, undefined, {okButton: 'Close', allowVerticalScrolling: true, wider: true});
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
    let popup = new ctx.Popup(title, ctx.POPUP_TYPE.INPUT, value, {rows: 20, customButtons: [restore_button], wider: true});

    add_i18n($(popup.content))  // translate any content

    // Now remove the ".result-control" class to prevent it from submitting when you hit enter.
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
    <button class="menu_button fa-solid fa-stop" title="${t`Abort summarization`}"></button>
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


// Interfaces
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
    <h3>Memory State</h3>
    <button id="preview_memory_state" class="menu_button fa-solid fa-eye margin0" title="Preview current memory state (the exact text that will be injected into your context)."></button>
    <button id="expand_filter_bar" class="menu_button fa-solid fa-list-check margin0" title="Toggle chat filters"></button>
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
        <div title="Summarize (AI)"                                                 class="mes_button fa-solid fa-quote-left ${summarize_button_class}"></div>
    </div>
    `
    ctx = getContext();

    // If you define the popup in the constructor so you don't have to recreate it every time, then clicking the "ok" button has like a .5-second lag before closing the popup.
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

        this.$filter_bar = this.$content.find('#filter_bar')
        this.$expand_filter_bar = this.$content.find("#expand_filter_bar")
        this.$expand_filter_bar.on('click', () => this.$filter_bar.toggle())

        this.$reverse_page_sort = this.$content.find('#reverse_page_sort')
        this.$reverse_page_sort.prop('checked', this.settings.reverse_page_sort ?? false)
        this.$reverse_page_sort.on('change', () => {
            this.save_settings()
            this.update_filters(true)
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
<div class="flex1 qvink_interface_card">
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
            remember_message_toggle(this.get_sorted_selection())
            this.update_table()
        })
        this.$content.find(`#bulk_exclude`).on('click', () => {
            forget_message_toggle(this.get_sorted_selection())
            this.update_table()
        })
        this.$content.find(`#bulk_summarize`).on('click', async () => {
            await summarize_messages(this.get_sorted_selection());  // summarize in ascending order
            this.update_table()
        })
        this.$content.find(`#bulk_delete`).on('click', () => {
            this.get_sorted_selection().forEach(id => {
                debug("Deleting Summary: " , id)
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

        add_i18n(this.$content)
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
    get_sorted_selection() {
        // Get the selected IDs, sorted in ascending order
        return Array.from(this.selected).sort((a, b) => a-b)
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
        this.update_context_line()
        add_i18n(this.$content)  // need to translate any text in the table after being populated
    }
    update_filters(preserve_page=false) {
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
            pageSize: this.settings.page_size ?? 100,
            pageNumber: preserve_page ? this.pagination?.pageNumber : 1,
            sizeChangerOptions: [10, 50, 100, 500, 1000],
            showSizeChanger: true,
            callback: (data, pagination) => {
                this.pagination = pagination  // the pagination object
                if (this.settings.reverse_page_sort) {
                    data.reverse()
                }
                this.settings.page_size = pagination.pageSize
                this.save_settings()
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
        this.$regex_selector.append(`<option value="">None</option>`)
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
            for (let i of this.get_sorted_selection()) {
                let message = this.ctx.chat[i]
                let memory = get_memory(message)
                let new_text = runRegexScript(script, memory)
                edit_memory(message, new_text)
            }
            this.update_table()
        })

    }
    update_context_line() {
        // updates the position of the last-in-context line for messages

        // ID of last in context message
        let target_id = chat_metadata["lastInContextMessageId"]

        // get the next highest ID displayed
        let to_check = this.settings.reverse_page_sort ? this.displayed.slice().reverse() : this.displayed
        let start = to_check[0]  // start checking at
        let end = to_check[to_check.length-1]
        let closest_id;
        let style;

        if (target_id > start) {  // Not on this page - higher
            closest_id = start;
            style = this.settings.reverse_page_sort ? 'last_in_context_bottom' : 'last_in_context_top'
        } else if (target_id < end) {  // Not on this page - lower
            closest_id = end;
            style = this.settings.reverse_page_sort ? 'last_in_context_top' : 'last_in_context_bottom'
        } else {  // on this page - search for it
            closest_id = start;
            for (let id of to_check) {
                if (id >= target_id) closest_id = id
                else break;
            }
            style = this.settings.reverse_page_sort ? 'last_in_context_top' : 'last_in_context_bottom'
        }

        this.$table_body.find('tr').removeClass('last_in_context_top last_in_context_bottom')
        this.$table_body.find(`tr#memory_${closest_id}`).addClass(style)
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
        let text = concatenate_summaries(this.get_sorted_selection());
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

class SummaryPromptEditInterface {

    html_template = `
<div id="qvink_summary_prompt_interface" style="height: 100%">
<div class="flex-container justifyspacebetween">
    <div class="flex2 toggle-macro">
        <div class="flex-container justifyspacebetween alignitemscenter">
            <h3>Summary Prompt</h3>
            <i class="fa-solid fa-info-circle" style="margin-right: 1em" title="Customize the prompt used for summarizing messages."></i>
            <button id="preview_summary_prompt" class="menu_button fa-solid fa-eye margin0" title="Preview current summary prompt (the exact text that will be sent to the model)"></button>
            <button id="restore_default_prompt" class="menu_button fa-solid fa-recycle margin0 red_button" title="Restore the default prompt"></button>

            <label class="flex-container alignItemsCenter" title="Role used for the summary prompt" style="margin-left: auto;">
                <span>Role: </span>
                <select id="prompt_role" class="text_pole inline_setting">
                    <option value="0">System</option>
                    <option value="1">User</option>
                    <option value="2">Assistant</option>
                </select>
            </label>
            <button class="menu_button fa-solid fa-list-check margin0 qm-small open_macros" title="Show/hide macro editor"></button>

        </div>
    </div>
    <div class="flex1 qm-large toggle-macro" style="height: 100%">
        <div class="flex-container justifyspacebetween alignitemscenter">
            <h3 class="flex2">Macros <i class="fa-solid fa-info-circle" title="Dynamic macros only available for the summary prompt."></i></h3>
            <button id="add_macro" class="flex1 menu_button" title="Add a new macro">New</button>
            <button class="menu_button fa-solid fa-list-check margin0 qm-small open_macros" title="Show/hide macro editor"></button>
        </div>
    </div>
</div>

<div class="flex-container justifyspacebetween" style="height: calc(100% - 120px);">
    <div class="flex2 toggle-macro">
        <textarea id="prompt" class="" style="height: 100%; overflow-y: auto"></textarea>
    </div>
    <div class="flex1 qm-large toggle-macro" style="height: 100%">
        <div id="macro_definitions" style="height: 100%; overflow-y: auto"></div>
    </div>
</div>

<div class="flex-container justifyspacebetween alignitemscenter">
    <label title="Start the summarization with this prefilled text." class="checkbox_label">
        <span>Prefill</span>
        <input id="prefill" class="text_pole" type="text" placeholder="Start reply with...">
    </label>

    <label title="Include the prefill in displayed memories and injections (no effect with reasoning models)" class="checkbox_label">
        <input id="show_prefill" type="checkbox" />
        <span>Include in Memories</span>
    </label>
</div>

</div>
`
    // remember to set the name of the radio group for each separate instance
    macro_definition_template = `

<div class="macro_definition qvink_interface_card">
<div class="inline-drawer">
    <div class="inline-drawer-header">
        <div class="flex-container alignitemscenter margin0 flex1">
            <button class="macro_enable menu_button fa-solid margin0"></button>
            <button class="macro_preview menu_button fa-solid fa-eye margin0" title="Preview the result of this macro"></button>
            <input class="macro_name flex1 text_pole" type="text" placeholder="name">
        </div>
        <div class="inline-drawer-toggle">
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
    </div>

    <div class="inline-drawer-content">
        <div class="flex-container alignitemscenter justifyCenter">
            <div class="macro_type flex2">
                <label>
                    <input type="radio" value="preset" />
                    <span>Range</span>
                </label>
                <label>
                    <input type="radio" value="custom" />
                    <span>STScript</span>
                </label>
            </div>
        </div>

        <div class="macro_type_range">
            <div title="The range of messages to replace this macro, relative to the message being summarized (which is at 0). For example, setting this to (3, 10) will include from the 3rd to the 10th message back in the chat.">
                <input class="macro_preset_start text_pole widthUnset" type="number" min="0" max="99" />
                <span> - </span>
                <input class="macro_preset_end text_pole widthUnset" type="number" min="0" max="99" />
            </div>

            <label title="Bot messages within the range above will be included" class="checkbox_label">
                <input class="macro_preset_bot_messages" type="checkbox" />
                <span>Bot Messages</span>
            </label>
            <label title="Summaries on bot messages within the range above will be included" class="checkbox_label">
                <input class="macro_preset_bot_summaries" type="checkbox" />
                <span>Bot Summaries</span>
            </label>
            <label title="User messages within the range above will be included" class="checkbox_label">
                <input class="macro_preset_user_messages" type="checkbox" />
                <span>User Messages</span>
            </label>
            <label title="Summaries on user messages within the range above will be included" class="checkbox_label">
                <input class="macro_preset_user_summaries" type="checkbox" />
                <span>User Summaries</span>
            </label>
        </div>

        <div class="macro_type_message">
            <table style="width: 100%;">
                <tr title="Each message will be replaced by the return value of the script when run. Use {{message}} for the text of the message and {{id}} for the ID of the message.">
                    <td><span>STScript</span></td>
                    <td><input class="macro_command text_pole" type="text" placeholder="STScript"></td>
                </tr>
                <tr title="Select regex scripts to run on each message. This will occur before the messages are passed to the above script.">
                    <td><span>Regex</span></td>
                    <td><select multiple="multiple" class="regex_select"></select></td>
                </tr>
            </table>
        </div>

        <div class="macro_type_script">
            <label title="The macro will be replaced by the return value of the script when run. Use {{message}} for the text of the message and {{id}} for the ID of the message." class="checkbox_label">
                <input class="macro_command text_pole" type="text" placeholder="STScript">
            </label>
        </div>

        <div class="macro_type_any flex-container alignitemscenter">
            <label title="[Text Completion]: The result of this macro will be wrapped in your instruct template. [Chat Completion]: The result of this macro will be added as a separate message." class="checkbox_label">
                <input class="macro_instruct_template" type="checkbox">
                <span>Separate Block</span>
            </label>

            <button class="macro_delete menu_button red_button fa-solid fa-trash" title="Delete custom macro" style="margin-left: auto;"></button>
            <button class="macro_restore menu_button red_button fa-solid fa-recycle" title="Restore default macro" style="margin-left: auto;"></button>
        </div>

    </div>
</div>
</div>

    `
    ctx = getContext();

    // enable/disable icons
    static fa_enabled = "fa-check"
    static fa_disabled = "fa-xmark"

    default_macro_settings = {
        name: "new_macro",
        enabled: true,
        type: "preset",
        start: 1, end: 1,
        bot_messages: true,
        bot_summaries: true,
        user_messages: true,
        user_summaries: true,
        instruct_template: true,
        command: "",
        regex_scripts: [],
    }

    // If you define the popup in the constructor so you don't have to recreate it every time, then clicking the "ok" button has like a .5-second lag before closing the popup.
    // If you instead re-create it every time in show(), there is no lag.
    constructor() {
        this.from_settings()
    }
    async init() {
        this.popup = new this.ctx.Popup(this.html_template, this.ctx.POPUP_TYPE.TEXT, undefined, {wider: true, okButton: 'Save', cancelButton: 'Cancel'});
        this.$content = $(this.popup.content)
        this.$buttons = this.$content.find('.popup-controls')
        this.$preview = this.$content.find('#preview_summary_prompt')
        this.$restore = this.$content.find('#restore_default_prompt')
        this.$definitions = this.$content.find('#macro_definitions')
        this.$add_macro = this.$content.find('#add_macro')
        this.$open_macros = this.$content.find('.open_macros')

        // settings
        this.$prompt = this.$content.find('#prompt')
        this.$prompt_role = this.$content.find('#prompt_role')
        this.$prefill = this.$content.find('#prefill')
        this.$show_prefill = this.$content.find('#show_prefill')


        // manually set a larger width
        this.$content.closest('dialog').css('min-width', '80%')

        // buttons
        this.$preview.on('click', () => this.preview_prompt())
        this.$add_macro.on('click', () => this.new_macro())
        this.$restore.on('click', () => this.$prompt.val(default_settings["prompt"]))
        this.$open_macros.on('click', () => {
            this.$content.find('.toggle-macro').toggle()
        })

        // manually add tooltips to the popout buttons because you can't do that when defining them
        this.$buttons.find('.popup-button-ok').attr('title', 'Save changes to the prompt and macros')
        this.$buttons.find('.popup-button-cancel').attr('title', 'Discard changes to the prompt and macros')

        // set the prompt text and the macro settings
        this.from_settings()

        let summary_profile = await get_summary_connection_profile()
        this.api = await get_connection_profile_api(summary_profile)

        // translate
        add_i18n(this.$content)
    }

    async show() {
        this.init()
        this.update_macros()

        let result = await this.popup.show();  // wait for result
        if (result) {  // clicked save
            this.save_settings()
        }
        refresh_settings()
    }

    // building interface
    update_macros(macro=null) {
        // Update the interface from settings (all macros or just the specified macro)
        if (macro === null) {
            for (let name of this.list_macros()) {
                let macro = this.get_macro(name)
                this.create_macro_interface(macro)
            }
        } else {
            this.create_macro_interface(macro)
        }
        add_i18n(this.$content)
    }
    create_macro_interface(macro) {
        // Create or update a macro interface item with the given settings
        let id = this.get_id(macro.name)

        // first check if it already exists
        let $macro = this.$definitions.find(`#${id}`)
        if ($macro.length > 0) {  // if it exists, remove it and replace with the template
            // Need to only replace the items inside the drawer so it says open if it's already open
            let $template = $(this.macro_definition_template)

            let $drawer_content = $macro.find('.inline-drawer-content')
            $drawer_content.empty()
            $drawer_content.append($template.find('.inline-drawer-content').children())

            let $header_content = $macro.find('.inline-drawer-header')
            $header_content.children().first().remove()  // remove the first div in the header (not the toggle)
            $header_content.prepend($template.find('.inline-drawer-header').children().first())

        } else { // doesn't exist - add it
            $macro = $(this.macro_definition_template).prependTo(this.$definitions)
            $macro.attr('id', id)
        }

        // handling the macro type radio group
        let radio_group_name = `macro_type_radio_${macro.name}`
        $macro.find(`.macro_type input`).attr('name', radio_group_name)  // set the radio group name

        let $range_div = $macro.find(".macro_type_range")
        let $message_div = $macro.find(".macro_type_message")
        let $script_div = $macro.find(".macro_type_script")
        let $any_div = $macro.find(".macro_type_any")

        function set_enabled() {
            if (macro.enabled) {
                $enable.removeClass(SummaryPromptEditInterface.fa_disabled)
                $enable.addClass(SummaryPromptEditInterface.fa_enabled)
                $enable.removeClass("red_button")
                $enable.addClass("button_highlight")
                $enable.prop('title', "Enabled")
            } else {
                $enable.removeClass(SummaryPromptEditInterface.fa_enabled)
                $enable.addClass(SummaryPromptEditInterface.fa_disabled)
                $enable.removeClass("button_highlight")
                $enable.addClass("red_button")
                $enable.prop('title', "Disabled")
            }
        }

        // set settings
        let $name = $macro.find("input.macro_name")
        let $enable = $macro.find("button.macro_enable")
        let $preview = $macro.find("button.macro_preview")
        let $delete = $macro.find("button.macro_delete")
        let $restore = $macro.find("button.macro_restore")
        let $macro_type_div = $macro.find('.macro_type')
        let $macro_type_radios = $macro.find(`input[name=${radio_group_name}]`)
        let $macro_preset_start = $macro.find(".macro_preset_start")
        let $macro_preset_end = $macro.find(".macro_preset_end")
        let $macro_preset_bot_messages = $macro.find(".macro_preset_bot_messages")
        let $macro_preset_bot_summaries = $macro.find(".macro_preset_bot_summaries")
        let $macro_preset_user_messages = $macro.find(".macro_preset_user_messages")
        let $macro_preset_user_summaries = $macro.find(".macro_preset_user_summaries")
        let $macro_command_message = $macro.find(".macro_type_message input.macro_command")
        let $macro_command_script  = $macro.find(".macro_type_script input.macro_command")
        let $macro_instruct = $macro.find(".macro_instruct_template")
        let $regex_select = $macro.find(".regex_select")

        function show_settings_div() {
            // hide/show the appropriate settings divs.
            // .show() fails if the object isn't in the DOM yet, so we have to try/catch since the popup isn't inserted yet.
            if (macro.type === "preset") {
                try {
                    $range_div.show()
                    $message_div.show()
                    $macro_command_message.change()  // trigger a change event on the command input so the macro's script actually changes
                } catch {}
                $script_div.hide()

            } else if (macro.type === "custom") {
                $range_div.hide()
                $message_div.hide()
                try {
                    $script_div.show()
                    $macro_command_script.change()
                } catch {}
            }
        }
        show_settings_div()

        // preview
        $preview.on('click', async () => await this.preview_macro(macro))

        // enable
        set_enabled()
        $enable.on('click', async () => {
            macro.enabled = !macro.enabled
            set_enabled()
        })

        // if it has a description, add it as the title for the name
        if (macro.description) {
            $name.attr('title', macro.description)
        }

        // special case for the {{message}} macro
        if (macro.name === "message") {
            $macro_type_div.remove()
            $range_div.remove()
            $script_div.remove()
        }

        // delete / restore
        if (macro.default) {
            $name.prop('disabled', true)  // prevent name change (or else we couldn't restore default)
            $delete.remove()
            $restore.on('click', () => this.restore_macro_default(macro.name))
        } else {
            $restore.remove()
            $delete.on('click', () => {
                delete this.macros[macro.name]
                $macro.remove()
            })
        }

        // name
        $name.val(macro.name)
        $name.on('change', () => {
            let old_name = macro.name
            let new_name = $name.val()
            if (old_name === new_name) return  // no change

            // can't change the name of a default or special macro
            if (macro.default || macro.type === "special") {
                $name.val(old_name)  // set the field to the old value
                return
            }

            new_name = this.get_unique_name(new_name)  // ensure unique name
            macro.name = new_name
            this.macros[new_name] = macro
            delete this.macros[old_name]

            // change the ID of the card
            $macro.attr('id', this.get_id(new_name))
            $name.val(new_name)  // set the field
        })

        // type
        $macro_type_radios.filter(`[value=${macro.type}]`).prop('checked', true)
        $macro_type_radios.on('change', () => {
            macro.type = $macro_type_radios.filter(':checked').val()
            show_settings_div()
        })

        // start, end
        $macro_preset_start.val(macro.start ?? this.default_macro_settings.start)
        $macro_preset_start.on('change', () => {
            macro.start = Number($macro_preset_start.val())
        })
        $macro_preset_end.val(macro.end ?? this.default_macro_settings.end)
        $macro_preset_end.on('change', () => {
            macro.end = Number($macro_preset_end.val())
        })

        // checkboxes
        $macro_preset_bot_messages.prop('checked', macro.bot_messages)
        $macro_preset_bot_messages.on('change', () => {
            macro.bot_messages = $macro_preset_bot_messages.is(':checked')
        })
        $macro_preset_bot_summaries.prop('checked', macro.bot_summaries)
        $macro_preset_bot_summaries.on('change', () => {
            macro.bot_summaries = $macro_preset_bot_summaries.is(':checked')
        })
        $macro_preset_user_messages.prop('checked', macro.user_messages)
        $macro_preset_user_messages.on('change', () => {
            macro.user_messages = $macro_preset_user_messages.is(':checked')
        })
        $macro_preset_user_summaries.prop('checked', macro.user_summaries)
        $macro_preset_user_summaries.on('change', () => {
            macro.user_summaries = $macro_preset_user_summaries.is(':checked')
        })
        $macro_instruct.prop('checked', macro.instruct_template)
        $macro_instruct.on('change', () => {
            macro.instruct_template = $macro_instruct.is(':checked')
        })

        // update the regex Select2 (gotta add an ID to the template too)
        let options = []
        let selected = []
        let regex_scripts = getRegexScripts()
        for (let i in regex_scripts) {
            let name = regex_scripts[i].scriptName
            options.push({id: i, name: name})
            if (macro.regex_scripts?.includes(name)) selected.push(i)
        }
        refresh_select2_element($regex_select, selected, options, t`Select regex scripts`, (values) => {
            macro.regex_scripts = values
        })

        // commands
        $macro_command_message.val(macro.command)
        $macro_command_message.on('change', () => {
            macro.command = $macro_command_message.val()
        })

        $macro_command_script.val(macro.command)
        $macro_command_script.on('change', () => {
            macro.command = $macro_command_script.val()
        })
    }

    // special macros
    async special_macro_message(index) {
        let macro = this.get_macro("message")
        let message = this.ctx.chat[index]
        let role = message.is_user ? 'user' : message.is_system ? 'system' : 'assistant'

        // apply script and regex
        let text = await this.evaluate_script(macro, index)

        if (macro.instruct_template) {  // apply template
            return [{role: role, name: message.name, content: text}]
        } else {
            return [{content: text}]
        }

    }

    // utilities
    is_open() {
        if (!this.popup) return false
        return this.$content.closest('dialog').attr('open');
    }
    from_settings() {
        // set the interface from settings
        this.$prompt?.val(get_settings('prompt'))
        this.$prompt_role?.val(get_settings('prompt_role'))
        this.$prefill?.val(get_settings('prefill'))
        this.$show_prefill?.prop('checked', get_settings('show_prefill', true))
        this.macros = get_settings('summary_prompt_macros', true)

        // for each macro, ensure default settings if not specified
        for (let name of Object.keys(this.macros)) {
            this.macros[name] = Object.assign({}, this.default_macro_settings, this.macros[name])

            // check each regex macro. Only keep valid macros.
            let valid_macros = []
            for (let regex of this.macros[name].regex_scripts) {
                if (get_regex_script(regex)) valid_macros.push(regex)
            }
            this.macros[name].regex_scripts = valid_macros
        }
    }
    save_settings() {
        // save settings in the interface
        set_settings('prompt', this.$prompt.val())  // save the prompt
        set_settings('prompt_role', Number(this.$prompt_role.val()))
        set_settings('prefill', this.$prefill.val())
        set_settings('show_prefill', this.$show_prefill.is(':checked'))
        set_settings('summary_prompt_macros', this.macros, true)
        update_all_message_visuals()
        debug(get_settings('summary_prompt_macros'))
    }
    get_prompt_role(name=false) {
        let role = this.is_open() ? Number(this.$prompt_role.val()) : get_settings('prompt_role')
        if (name) {
            switch (role) {
                case extension_prompt_roles.USER:
                    role = 'user'
                    break
                case extension_prompt_roles.ASSISTANT:
                    role = 'assistant'
                    break
                default:
                    role = 'system'
                    break
            }
        }
        return role
    }
    get_prefill() {
        return this.is_open() ? this.$prefill.val() : get_settings('prefill')
    }
    get_unique_name(name) {
        // if the given name isn't unique, make it unique

        // replace the last "_n" with "_(n+1)"
        while (this.get_macro(name)) {
            let match = name.match(/_(\d+)$/)
            if (match) {
                name = name.slice(0, match.index) + "_" + (Number(match[1]) + 1)
            } else {
                name += "_2"
            }
        }
        return name
    }
    get_id(name) {
        // get the HTML ID for the given macro name
        return `summary_macro_definition_${name}`
    }
    list_macros() {
        return Object.keys(this.macros)
    }
    get_macro(name) {
        // get the macro by name.
        let macro = this.macros[name]
        if (macro) return macro
    }
    new_macro(name=null) {
        // Create a new macro with the given name or the default
        let macro = structuredClone(this.default_macro_settings)
        if (name) macro.name = name
        macro.name = this.get_unique_name(macro.name)  // ensure unique name from existing macros
        this.macros[macro.name] = macro
        this.create_macro_interface(macro)
    }
    restore_macro_default(name) {
        // Restore the macro to default (does nothing for non-default macros).
        // Edit the macro settings object in-place so all the callbacks with a reference to it still work.
        let macro = this.get_macro(name)
        if (!macro.default) return
        let default_macro = default_summary_macros[name]
        if (!default_macro) error(`Attempted to restore default summary macro, but no default was found: "${name}"`)
        assign_and_prune(macro, default_macro)  // set macro to the specific default in-place
        assign_defaults(macro, this.default_macro_settings)   // set global defaults if they don't exist
        this.update_macros(macro)
    }

    async preview_prompt() {
        // show the summary prompt preview popup using the current interface settings
        let index = this.ctx.chat.length-1
        let text = this.$prompt.val()
        let messages = await this.create_summary_prompt(index, text)
        let prompt = createRawPrompt(messages, this.api, false, false, '', this.get_prefill())  // build prompt
        if (typeof prompt === 'string') {
            prompt = clean_string_for_html(prompt)
        } else {  // array
            prompt = prompt.map(m => {  // need to clean text *before* we stringify because of the &emsp;
                m.content = clean_string_for_html(m.content)
                return m
            })
            prompt = JSON.stringify(prompt, null, "&emsp;")
        }
        await display_text_modal(t`Summary Prompt Preview (Last Message)`, prompt);
    }
    async preview_macro(macro) {
        // show the result of the given macro
        let messages = await this.compute_macro(this.ctx.chat.length-1, macro.name, true)
        let result;

        if (!messages) {  // no messages, empty macro
            result = ''
        } else if (macro.instruct_template) {
            result = createRawPrompt(messages, this.api, false, false, '', '')  // build prompt with instruct template
            if (typeof result === 'string') {
                // remove the end line (which for TC include the assistant start sequence)
                let end_line = formatInstructModePrompt(this.ctx.name2, false, '', this.ctx.name1, this.ctx.name2, true, false)
                if (result.slice(result.length-end_line.length, result.length) === end_line) {  // end line present
                    result = result.slice(0, result.length-end_line.length)
                }

                result = clean_string_for_html(result)  // if string, clean it
            } else {  // list of message objects
                result = result.map(m => {  // need to clean text *before* we stringify because of the &emsp;
                    m.content = clean_string_for_html(m.content)
                    return m
                })
                result = JSON.stringify(result, null, "&emsp;")
            }
        } else {
            result = createRawPrompt(messages, this.api, true, false, '', '')  // build prompt ignoring instruct
            result = result?.[0]?.content ?? result
            result = clean_string_for_html(result)
        }

        await display_text_modal(t`Macro Preview:`+` {{${macro.name}}}`, result)
    }


    // creating the prompt
    async evaluate_script(macro, id, text=null) {
        // Evaluate any regex and scripts on the macro for the given message index
        if (text === null) {
            text = this.ctx.chat[id].mes
        }

        // evaluate regex if present
        for (let regex of macro.regex_scripts ?? []) {
            text = runRegexScript(get_regex_script(regex), text)
        }

        // evaluate script if present
        let command = macro.command
        if (command?.trim()) {
            // replace {{id}} in the command with the message index
            command = command.replace(/\{\{id}}/g, id.toString())

            // replace {{message}} with the text of the message
            command = command.replace(/\{\{message}}/g, text)

            try {
                let result = await this.ctx.executeSlashCommandsWithOptions(command)
                text = result?.pipe ?? ""
            } catch (e) {
                error(e)
                return ""
            }
        }

        return text
    }
    async compute_macro(index, name, ignore_enabled=false) {
        // get the result from the given custom macro for the given message index
        // Returns a list of message objects, i.e.: [{role: '', content: ''}, ...]
        // If macro evaluated empty, returns null

        let macro = this.get_macro(name)
        if (!macro) return  // macro doesn't exist
        if (!macro.enabled && !ignore_enabled) return

        debug("Computing Macro: "+ name)

        // special macro?
        if (name === "message") {
            return this.special_macro_message(index)
        }

        if (macro.type === "preset") {  // range presets
           return this.compute_range_macro(index, macro)
        } else if (macro.type === "custom") {  // STScript
            let text = await this.evaluate_script(macro, index, "")
            if (text && macro.instruct_template) {
                return [{role: this.get_prompt_role(true), content: text}]
            } else if (text) {
                return [{content: text}]
            }
        } else {
            error(`Unknown summary prompt macro type: "${macro.type}"`)
        }
        return null
    }
    async compute_range_macro(index, macro) {
        // Get a history of messages from index-end to index-start
        // Returns a list of message objects
        let chat = this.ctx.chat
        let history = []

        // calculate starting and ending indexes, bounded by the start of the chat
        let start_index = Math.max(index-macro.end, 0)
        let end_index = Math.max(index-macro.start, 0)
        debug(`Getting Message History. Index: ${index}, Start: ${macro.start}, End: ${macro.end} (${start_index} to ${end_index})`)

        for (let i = start_index; i <= end_index && i < chat.length; i++) {
            let m = chat[i];
            let include_message = true
            let include_summary = true

            // whether we include the message itself is determined only by these settings.
            // Even if the message wouldn't be *summarized* we still want to include it in the history for context.
            if (m.is_user) {
                include_message = macro.user_messages
                include_summary = macro.user_summaries
            } else if (m.is_system || m.is_thoughts) {
                include_message = false;
                include_summary = false
            } else {  // otherwise it's a bot message
                include_message = macro.bot_messages
                include_summary = macro.bot_summaries
            }

            if (include_message) {
                // apply script and regex
                let text = await this.evaluate_script(macro, i)
                let role = m.is_user ? 'user' : m.is_system ? 'system' : 'assistant'

                // apply template
                if (macro.instruct_template) {
                    history.push({role: role, name: m.name, content: text})
                } else {
                    history.push(text)
                }
            }

            if (include_summary) {
                // Whether we include the *summary* is also determined by the regular summary inclusion criteria.
                // This is so the inclusion matches the summary injection.
                include_summary = check_message_exclusion(m)
                let memory = get_memory(m)
                if (include_summary && memory) {  // if there is a memory to include
                    memory = `Summary: ${memory}`
                    if (macro.instruct_template) {
                        history.push({role: 'system', content: memory})
                    } else {
                        history.push(memory)
                    }
                }
            }
        }

        // join with newlines
        if (macro.instruct_template) {
            return history
        } else {
            return [{content: history.join('\n')}]
        }
    }

    async create_summary_prompt(index, prompt=null) {
        // Create the full summary prompt for the message at the given index.
        // The instruct template will automatically add an input sequence to the beginning and an output sequence to the end.
        // Therefore, if we are NOT using instructOverride, we have to remove the first system sequence at the very beginning which gets added by format_system_prompt.
        // If we ARE using instructOverride, we have to add a final trailing output sequence

        // If no prompt given, use the current settings prompt.
        if (prompt === null) {
            prompt = get_settings('prompt')
        }

        // map of macros used in the prompt to their values
        let macros = await this.compute_used_macros(index, prompt)

        // Substitute any {{#if macro}} ... {{/if}} blocks.
        // These conditional substitutions have to be done before splitting and making each section a system prompt,
        //   because the conditional content may contain regular text that should be included in the system prompt.
        prompt = this.compile_handlebars(prompt, macros, index)

        // now split the prompt into messages and substitute custom macros
        let messages = this.evaluate_prompt(prompt, macros)
        return messages
    }
    async compute_used_macros(index, text) {
        // return a mapping of the macros used in this text and their return value

        // Matches {{macro}} or {{#if macro}}, captures the macro name
        let matches = regex(text, /\{\{#if (.*?)}}|\{\{(?!\/if)(.*?)}}/gs)

        // trim whitespace and remove duplicates
        let names = new Set()
        for (let match of matches) {  // iterate over all match objects
            names.add(match.trim())
        }

        // compute value for each
        let values = {}
        for (let name of names) {
            let value = await this.compute_macro(index, name)
            if (!value) continue
            values[name] = value
        }
        return values
    }
    compile_handlebars(text, macros, index) {
        // substitute any {{#if macro}} ... {{/if}} blocks in the text with its content if the macro is in the passed map
        // Does NOT replace the actual macros, that is done later
        // DOES replace ST built-in macros like {{char}} and {{user}} (I don't know why)
        // We use Handlebars.js to parse out the {{#if}} ... {{/if}} blocks
        // ignoreStandalone=true: blocks and partials that are on their own line will not remove the whitespace on that line.

        // TODO: for some reason this.ctx.groupId is null when in a group so we have to get the context again??? Even though other fields properly update?
        let group_id = getContext().groupId
        let name = this.ctx.chat[index].name

        // include all character card fields as macros
        let template_data = Object.assign({}, getCharacterCardFields())

        // I don't know why, but Handlebars.compile does replace ST built-in macros like {{user}}, {{char}}, and {{persona}} even if not specified in the template.
        //   Because of this, any modifications to these have to be done here.
        if (group_id) {  // if in group chat, define {{char}} (it's normally empty in group chats)
            template_data['char'] = name
        }

        for (let name of Object.keys(macros)) {
            template_data[name] = `{{${name}}}`  // replace any instance of the macro with itself
        }

        try {
            return Handlebars.compile(text, {ignoreStandalone: true})(template_data)
        } catch (e) {
            error(`ERROR: ${e}`)
            return text
        }
    }
    evaluate_prompt(text, macros) {
        // Convert the prompt into chat-style messages, i.e. [{role: '', content: ''}, ...]
        // Any {{macro}} items present will become a separate message if they need to be wrapped in an instruct template.
        // It is assumed that the macros will be later replaced with appropriate text

        // split on {{...}}
        // /g flag is for global, /s flag makes . match newlines so the {{#if ... /if}} can span multiple lines
        // You need the capturing groups for the matches to be included in the parts.
        // However this results in some parts being undefined for some reason, I think because only one capturing group is used for each match
        let parts = text.split(/(\{\{.*?}})/g);
        let messages = []
        let merge_next = false

        let add = (content) => {
            // add content to the message list
            for (let message of content) {
                if (message.role) {  // if a role is present, don't merge it.
                    messages.push(message)
                    merge_next = false  // don't merge the next one
                } else {  // no role - merge with last message if possible
                    if (merge_next && messages.length > 0) {
                        messages[messages.length - 1].content += message.content
                    } else {  // can't merge or first item
                        messages.push({role: this.get_prompt_role(true), content: message.content})  // use default role
                    }
                    merge_next = true  // can merge next one with this
                }
            }
        }

        for (let i in parts) {
            let part = parts[i]?.trim()
            if (!part) continue  // some parts are undefined
            if (part.startsWith('{{') && part.endsWith('}}')) {  // this is a macro
                let macro_name = part.slice(2, -2)  // get the macro name
                let value = macros[macro_name]
                if (value === undefined) log(`Undefined macro in summary prompt: "${macro_name}"`)
                add(value ?? '')  // don't merge
            } else {  // not a macro - merge according to the previous item
                add([{content: parts[i]}])
            }
        }
        return messages
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
    // returns the memory properly prepended with the prefill (if present)
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
function update_message_inclusion_flags() {
    // Update all messages in the chat, flagging them as short-term or long-term memories to include in the injection.
    // This has to be run on the entire chat since it needs to take the context limits into account.
    let context = getContext();
    let chat = context.chat;

    debug("Updating message inclusion flags")

    let separate_long_term = get_settings('separate_long_term')
    let injection_threshold = get_settings('summary_injection_threshold')
    let exclude_messages = get_settings('exclude_messages_after_threshold')
    let keep_last_user_message = get_settings('keep_last_user_message')
    let first_to_inject = chat.length - injection_threshold
    let last_user_message_identified = false

    // iterate through the chat in reverse order and mark the messages that should be included in short-term and long-term memory
    let short_limit_reached = false;
    let long_limit_reached = false;
    let end = chat.length - 1;

    let short_summary = ""  // total concatenated summary so far
    let long_summary = ""  // temp summary storage to check token length
    let new_short_summary = ""
    let new_long_summary = ""

    for (let i = end; i >= 0; i--) {
        let message = chat[i];

        // Mark whether the message is lagging behind the exclusion threshold (even if no summary)
        let lagging = i >= first_to_inject

        // If needed, mark the most recent user message as lagging
        if (exclude_messages && keep_last_user_message && !last_user_message_identified && message.is_user) {
            last_user_message_identified = true
            lagging = true
            debug(`Marked most recent user message as lagging: ${i}`)
        }
        set_data(message, 'lagging', lagging)

        // check for any of the exclusion criteria
        let include = check_message_exclusion(message)
        if (!include) {
            set_data(message, 'include', null);
            continue;
        }

        if (!short_limit_reached) {  // short-term limit hasn't been reached yet
            let memory = get_memory(message)
            if (!memory) {  // If it doesn't have a memory, mark it as excluded and move to the next
                set_data(message, 'include', null)
                continue
            }

            // consider this for short term memories as long as we aren't separating long-term or (if we are), this isn't a long-term
            if (!separate_long_term || !get_data(message, 'remember')) {
                new_short_summary = concatenate_summary(short_summary, message)  // concatenate this summary
                let short_token_size = count_tokens(new_short_summary);
                if (short_token_size > get_short_token_limit()) {  // over context limit
                    short_limit_reached = true;
                } else {  // under context limit
                    set_data(message, 'include', 'short');
                    short_summary = new_short_summary
                    continue
                }
            }
        }

        // if the short-term limit has been reached (or we are separating), check the long-term limit.
        let remember = get_data(message, 'remember');
        if (!long_limit_reached && remember) {  // long-term limit hasn't been reached yet and the message was marked to be remembered
            new_long_summary = concatenate_summary(long_summary, message)  // concatenate this summary
            let long_token_size = count_tokens(new_long_summary);
            if (long_token_size > get_long_token_limit()) {  // over context limit
                long_limit_reached = true;
            } else {
                set_data(message, 'include', 'long');  // mark the message as long-term
                long_summary = new_long_summary
                continue
            }
        }

        // if we haven't marked it for inclusion yet, mark it as excluded
        set_data(message, 'include', null);
    }

    update_all_message_visuals()
}
function concatenate_summary(existing_text, message, separator=null) {
    // given an existing text of concatenated summaries, concatenate the next one onto it
    let memory = get_memory(message)
    if (!memory) {  // if there's no summary, do nothing
        return existing_text
    }
    separator = separator ?? get_settings('summary_injection_separator')
    return existing_text + separator + memory
}
function concatenate_summaries(indexes, separator=null) {
    // concatenate the summaries of the messages with the given indexes
    // Excludes messages that don't meet the inclusion criteria

    let context = getContext();
    let chat = context.chat;

    let summary = ""
    // iterate through given indexes
    for (let i of indexes) {
        let message = chat[i];
        summary = concatenate_summary(summary, message, separator)
    }

    return summary
}

function collect_chat_messages(include) {
    // Get a list of chat message indexes identified by the given criteria
    let context = getContext();
    let indexes = []  // list of indexes of messages

    // iterate in reverse order
    for (let i = context.chat.length-1; i >= 0; i--) {
        let message = context.chat[i];
        if (!get_data(message, 'memory')) continue  // no memory
        if (get_data(message, 'lagging')) continue  // lagging - not injected yet
        if (get_data(message, 'include') !== include) continue  // not the include types we want
        indexes.push(i)
    }

    // reverse the indexes so they are in chronological order
    indexes.reverse()
    return indexes
}
function get_long_memory() {
    // get the injection text for long-term memory
    let indexes = collect_chat_messages('long')
    if (indexes.length === 0) return ""  // if no memories, return empty

    let text = concatenate_summaries(indexes);
    let template = get_settings('long_template')
    let ctx = getContext();

    // replace memories macro
    return ctx.substituteParamsExtended(template, {[generic_memories_macro]: text});
}
function get_short_memory() {
    // get the injection text for short-term memory
    let indexes = collect_chat_messages('short')
    if (indexes.length === 0) return ""  // if no memories, return empty

    let text = concatenate_summaries(indexes);
    let template = get_settings('short_template')
    let ctx = getContext();

    // replace memories macro
    return ctx.substituteParamsExtended(template, {[generic_memories_macro]: text});
}

// Add an interception function to reduce the number of messages injected normally
// This has to match the manifest.json "generate_interceptor" key
globalThis.memory_intercept_messages = function (chat, _contextSize, _abort, type) {
    if (!chat_enabled()) return;   // if memory disabled, do nothing
    if (!get_settings('exclude_messages_after_threshold')) return  // if not excluding any messages, do nothing
    refresh_memory()

    let start = chat.length-1
    if (type === 'continue') start--  // if a continue, keep the most recent message

    // symbol is used to prevent accidentally leaking modifications to permanent chat.
    let IGNORE_SYMBOL = getContext().symbols.ignore

    // Remove any messages that have summaries injected
    for (let i=start; i >= 0; i--) {
        delete chat[i].extra.ignore_formatting
        let message = chat[i]
        let lagging = get_data(message, 'lagging')  // The message should be kept
        chat[i] = structuredClone(chat[i])  // keep changes temporary for this generation
        chat[i].extra[IGNORE_SYMBOL] = !lagging
    }
};


// Summarization
async function summarize_messages(indexes=null, show_progress=true, skip_initial_delay=true) {
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

        // Wait for time delay if set (only delay first if initial delay set)
        let time_delay = get_settings('summarization_time_delay')
        if (time_delay > 0 && (n > 0 || (n === 0 && !skip_initial_delay))) {
            debug(`Delaying generation by ${time_delay} seconds`)
            if (show_progress) progress_bar('summarize', null, null, "Delaying")
            await new Promise((resolve) => {
                SUMMARIZATION_DELAY_TIMEOUT = setTimeout(resolve, time_delay * 1000)
                SUMMARIZATION_DELAY_RESOLVE = resolve  // store the resolve function to call when cleared
            });

            // check if summarization was stopped by the user during the delay
            if (STOP_SUMMARIZATION) {
                log('Summarization stopped');
                break;
            }
        }

        await summarize_message(i);
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

    // If the most recent message, scroll to the bottom to get the summary in view (affected by ST settings)
    if (index === chat.length - 1) {
        scrollChatToBottom();
    }

    // construct the full summary prompt for the message
    let prompt = await summaryPromptEditInterface.create_summary_prompt(index)

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
            err = e.message
            if (e.message === "No message generated") {
                err = "Empty Response"
            } else {
                error(`Unrecognized error when summarizing message ${index}: ${e}`)
            }
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
        error(`Failed to summarize message ${index}: ${err}`);
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
async function summarize_text(messages) {
    let ctx = getContext()

    // get size of text
    let token_size = messages.reduce((acc, p) => acc + count_tokens(p.content), 0);

    let context_size = get_context_size();
    if (token_size > context_size) {
        error(`Text (${token_size}) exceeds context size (${context_size}).`);
    }

    // prompt, api, instructOverride, systemMode, systemPrompt, responseLength, trimNames, prefill
    let result = await generateRaw({
        prompt: messages,
        trimNames: false,
        prefill: get_settings('prefill')
    });

    // trim incomplete sentences if set in ST settings
    if (ctx.powerUserSettings.trim_sentences) {
        result = trimToEndSentence(result);
    }

    return result;
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

    let long_term_position = get_settings('long_term_position')
    let short_term_position = get_settings('short_term_position')

    // if using text completion, we need to wrap it in a system prompt
    if (main_api !== 'openai') {
        if (long_term_position !== extension_prompt_types.IN_CHAT && long_injection.length) long_injection = formatInstructModeChat("", long_injection, false, true)
        if (short_term_position !== extension_prompt_types.IN_CHAT && short_injection.length) short_injection = formatInstructModeChat("", short_injection, false, true)
    }

    // inject the memories into the templates, if they exist
    ctx.setExtensionPrompt(`${MODULE_NAME}_long`,  long_injection,  long_term_position, get_settings('long_term_depth'), get_settings('long_term_scan'), get_settings('long_term_role'));
    ctx.setExtensionPrompt(`${MODULE_NAME}_short`, short_injection, short_term_position, get_settings('short_term_depth'), get_settings('short_term_scan'), get_settings('short_term_role'));

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
async function auto_summarize_chat(skip_initial_delay=true) {
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
    await summarize_messages(messages_to_summarize, show_progress, skip_initial_delay);
}

// Event handling
var last_message_swiped = null  // if an index, that was the last message swiped
var last_message = null // if an index, that was the last message sent
async function on_chat_event(event=null, data=null) {
    // When the chat is updated, check if the summarization should be triggered
    debug("Chat updated:", event, data)

    const context = getContext();
    let index = data

    switch (event) {
        case 'chat_changed':  // chat was changed
            last_message_swiped = null;
            last_message = null;
            auto_load_profile();  // load the profile for the current chat or character
            refresh_memory();  // refresh the memory state
            if (context?.chat?.length) {
                scrollChatToBottom();  // scroll to the bottom of the chat (area is added due to memories)
            }
            break;

        case 'message_deleted':   // message was deleted
            last_message_swiped = null;
            if (index === last_message) last_message -= 1;  // If the last message was deleted
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            debug("Message deleted, refreshing memory")
            refresh_memory();
            break;

        case 'before_message':
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            if (!get_settings('auto_summarize')) break;  // if auto-summarize is disabled, do nothing
            if (!get_settings('auto_summarize_on_send')) break;  // if auto-summarize-on-send is disabled, skip

            // If a dry run, skip. If in a group chat and type is undefined, skip (Generate() is run twice in group chats, and the first one has undefined type).
            // generations in regular chats also have undefined type though, so only skip if undefined in group chats.
            if (data.dry || (!data.type && context.groupId)) {
                debug(`Skipping before_message trigger. GroupID: ${context.groupId}, Dry Run: ${data.dry},  Type: ${data.type}`)
                break;
            }

            index = context.chat.length - 1
            if (last_message_swiped === index) break;  // this is a swipe, skip
            debug("Summarizing chat before message")
            await auto_summarize_chat();  // auto-summarize the chat
            break;

        case 'user_message':
            last_message_swiped = null;
            last_message = null;
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

            let skip_first_delay = get_settings('summarization_time_delay_skip_first')
            if (last_message_swiped === index) {  // this is a swipe
                let message = context.chat[index];
                if (!get_settings('auto_summarize_on_swipe')) break;  // if auto-summarize on swipe is disabled, do nothing
                if (!check_message_exclusion(message)) break;  // if the message is excluded, skip
                if (!get_previous_swipe_memory(message, 'memory')) break;  // if the previous swipe doesn't have a memory, skip
                debug("re-summarizing on swipe")
                await summarize_messages(index, true, skip_first_delay);  // summarize the swiped message
                refresh_memory()
            } else if (last_message === index) {  // not a swipe, but the same index as last message - must be a continue
                last_message_swiped = null
                let message = context.chat[index];
                if (!get_settings("auto_summarize_on_continue")) break;  // if auto_summarize_on_continue is disabled, no nothing
                if (!get_memory(message, 'memory')) break;  // if the message doesn't have a memory, skip.
                debug("re-summarizing on continue")
                await summarize_messages(index, true, skip_first_delay);  // summarize the swiped message
                refresh_memory()
            } else { // not a swipe or continue
                last_message_swiped = null
                if (!get_settings('auto_summarize')) break;  // if auto-summarize is disabled, do nothing
                if (get_settings("auto_summarize_on_send")) break;  // if auto_summarize_on_send is enabled, don't auto-summarize on character message
                debug("New message detected, summarizing")
                await auto_summarize_chat(skip_first_delay);  // auto-summarize the chat, skipping first delay if needed
            }
            last_message = index;
            break;

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
            last_message_swiped = index;
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

    bind_function('#edit_summary_prompt', () => summaryPromptEditInterface.show())
    bind_function('#edit_long_term_memory_prompt', async () => {
        let description = `
<ul style="text-align: left; font-size: smaller;">
    <li>This will be the content of <b>{{${long_memory_macro}}}</b></li>
    <li>If there is nothing in long-term memory, the whole macro will be empty.</li>
    <li><b>{{${generic_memories_macro}}}</b> will be replaced by all long-term memories.</li>
</ul>`
        get_user_setting_text_input('long_template', t`Edit Long-Term Memory Injection`, description)
    })
    bind_function('#edit_short_term_memory_prompt', async () => {
        let description = `
<ul style="text-align: left; font-size: smaller;">
    <li>This will be the content of <b>{{${short_memory_macro}}}</b></li>
    <li>If there is nothing in short-term memory, the whole macro will be empty.</li>
    <li><b>{{${generic_memories_macro}}}</b> will be replaced by all short-term memories.</li>
</ul>`
        get_user_setting_text_input('short_template', t`Edit Short-Term Memory Injection`, description)
    })

    bind_setting('#connection_profile', 'connection_profile', 'text')
    bind_setting('#completion_preset', 'completion_preset', 'text')
    bind_setting('#auto_summarize', 'auto_summarize', 'boolean');
    bind_setting('#auto_summarize_on_edit', 'auto_summarize_on_edit', 'boolean');
    bind_setting('#auto_summarize_on_swipe', 'auto_summarize_on_swipe', 'boolean');
    bind_setting('#auto_summarize_on_continue', 'auto_summarize_on_continue', 'boolean');
    bind_setting('#auto_summarize_batch_size', 'auto_summarize_batch_size', 'number');
    bind_setting('#auto_summarize_message_limit', 'auto_summarize_message_limit', 'number');
    bind_setting('#auto_summarize_progress', 'auto_summarize_progress', 'boolean');
    bind_setting('#auto_summarize_on_send', 'auto_summarize_on_send', 'boolean');
    bind_setting('#summarization_delay', 'summarization_delay', 'number');
    bind_setting('#summarization_time_delay', 'summarization_time_delay', 'number')
    bind_setting('#summarization_time_delay_skip_first', 'summarization_time_delay_skip_first', 'boolean')

    bind_setting('#include_user_messages', 'include_user_messages', 'boolean');
    bind_setting('#include_system_messages', 'include_system_messages', 'boolean');
    bind_setting('#include_narrator_messages', 'include_narrator_messages', 'boolean')
    bind_setting('#message_length_threshold', 'message_length_threshold', 'number');

    bind_setting('#block_chat', 'block_chat', 'boolean');

    bind_setting('#summary_injection_separator', 'summary_injection_separator', 'text')
    bind_setting('#summary_injection_threshold', 'summary_injection_threshold', 'number');
    bind_setting('#exclude_messages_after_threshold', 'exclude_messages_after_threshold', 'boolean');
    bind_setting('#keep_last_user_message', 'keep_last_user_message', 'boolean')
    bind_setting('#separate_long_term', 'separate_long_term', 'boolean');

    bind_setting('input[name="short_term_position"]', 'short_term_position', 'number');
    bind_setting('#short_term_depth', 'short_term_depth', 'number');
    bind_setting('#short_term_role', 'short_term_role');
    bind_setting('#short_term_scan', 'short_term_scan', 'boolean');
    bind_setting('#short_term_context_limit', 'short_term_context_limit', 'number')
    bind_setting('input[name="short_term_context_type"]', 'short_term_context_type', 'text')

    bind_setting('input[name="long_term_position"]', 'long_term_position', 'number');
    bind_setting('#long_term_depth', 'long_term_depth', 'number');
    bind_setting('#long_term_role', 'long_term_role');
    bind_setting('#long_term_scan', 'long_term_scan', 'boolean');
    bind_setting('#long_term_context_limit', 'long_term_context_limit', 'number')
    bind_setting('input[name="long_term_context_type"]', 'long_term_context_type', 'text')

    bind_setting('#debug_mode', 'debug_mode', 'boolean');
    bind_setting('#display_memories', 'display_memories', 'boolean')
    bind_setting('#default_chat_enabled', 'default_chat_enabled', 'boolean');
    bind_setting('#use_global_toggle_state', 'use_global_toggle_state', 'boolean');

    // trigger the change event once to update the display at start
    $('#long_term_context_limit').trigger('change');
    $('#short_term_context_limit').trigger('change');

    refresh_settings()
}
function initialize_message_buttons() {
    // Add the message buttons to the chat messages
    debug("Initializing message buttons")
    let ctx = getContext()

    let html = `
<div title="${t`Remember (toggle inclusion of summary in long-term memory)`}" class="mes_button ${remember_button_class} fa-solid fa-brain" tabindex="0"></div>
<div title="${t`Force Exclude (toggle inclusion of summary from all memory)`}" class="mes_button ${forget_button_class} fa-solid fa-ban" tabindex="0"></div>
<div title="${t`Edit Summary`}" class="mes_button ${edit_button_class} fa-solid fa-pen-fancy" tabindex="0"></div>
<div title="${t`Summarize (AI)`}" class="mes_button ${summarize_button_class} fa-solid fa-quote-left" tabindex="0"></div>
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

    // when a message is hidden/unhidden, trigger a memory refresh.
    // Yes the chat is saved already when these buttons are clicked, but we need to wait until after to refresh.
    $chat.on("click", ".mes_hide", async () => {
        await ctx.saveChat()
        refresh_memory()
    });
    $chat.on("click", ".mes_unhide", async () => {
        await ctx.saveChat()
        refresh_memory()
    });
}
function initialize_group_member_buttons() {
    // Insert a button into the group member selection to disable summarization
    debug("Initializing group member buttons")

    let $template = $('#group_member_template').find('.group_member_icon')
    let $button = $(`<div title="${t`Toggle summarization for memory`}" class="right_menu_button fa-solid fa-lg fa-brain ${group_member_enable_button}"></div>`)

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
        name: 'qm-debug',
        aliases: ['qvink-memory-debug'],
        helpString: 'Logs the ST core context and Qvink Memory extension settings to console.',
        callback: (args) => {
            log(getContext());
            log(extension_settings[MODULE_NAME]);
            log(chat_metadata)
            return "";
        },

    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'qm-hard-reset',
        aliases: ['qvink-memory-hard-reset'],
        helpString: 'WARNING: Hard reset all settings for this extension. All config profiles will be deleted.',
        callback: (args) => {
            hard_reset_settings();
            refresh_settings();
            refresh_memory();
            return "";
        },

    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'qm-enabled',
        aliases: ['qvink-memory-enabled'],
        helpString: 'Return whether the extension is enabled in the current chat.',
        callback: (args) => {
            return String(chat_enabled());
        },
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'qm-toggle',
        aliases: ['qvink-memory-toggle'],
        helpString: 'Change whether the extension is enabled for the current chat. If no state is provided, it will toggle the current state.',
        callback: (args, state) => {
            if (state === "") {  // if not provided the state is an empty string, but we need it to be null to get the default behavior
                state = null;
            } else {
                state = state === "true";  // convert to boolean
            }

            toggle_chat_enabled(state);  // toggle the memory for the current chat
            return "";
        },

        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Boolean value to set the memory state',
                isRequired: false,
                typeList: ARGUMENT_TYPE.BOOLEAN,
            }),
        ],
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'qm-toggle-display',
        aliases: ['qvink-memory-toggle-display'],
        helpString: "Toggle the \"display memories\" setting on the current profile (doesn't save the profile).",
        callback: (args) => {
            $(`.${settings_content_class} #display_memories`).click();  // toggle the memory display
            return "";
        },
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'qm-toggle-auto-summarize',
        aliases: ['qvink-memory-toggle-auto-summarize'],
        helpString: "Toggle the \"auto-summarize\" setting on the current profile (doesn't save the profile).",
        callback: (args) => {
            $(`.${settings_content_class} #auto_summarize`).click();  // toggle the memory display
            return "";
        },
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'qm-toggle-config',
        aliases: ['qvink-memory-toggle-config'],
        helpString: 'Toggle the extension config popout.',
        callback: (args) => {
            toggle_popout();
            return "";
        },
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'qm-toggle-edit-interface',
        aliases: ['qvink-memory-toggle-edit-interface'],
        helpString: 'Toggle the memory editing interface.',
        callback: (args) => {
            memoryEditInterface.show();
            return "";
        },
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'qm-toggle-injection-preview',
        aliases: ['qvink-memory-toggle-injection-preview'],
        helpString: 'Toggle a preview of the current memory injection.',
        callback: (args) => {
            display_injection_preview();
            return "";
        },
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'qm-toggle-remember',
        aliases: ['qvink-memory-toggle-remember'],
        callback: (args, index) => {
            if (index === "") index = null  // if not provided the index is an empty string, but we need it to be null to get the default behavior
            remember_message_toggle(index);
            return "";
        },
        helpString: 'Toggle whether a memory should be long-term (default is the most recent message).',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Index of the message to toggle',
                isRequired: false,
                typeList: ARGUMENT_TYPE.NUMBER,
            }),
        ],
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'qm-toggle-exclude',
        aliases: ['qvink-memory-toggle-exclude'],
        helpString: 'Toggle to force-exclude a memory, regardless of other inclusion criteria (default is the most recent message).',
        callback: (args, index) => {
            if (index === "") index = null  // if not provided the index is an empty string, but we need it to be null to get the default behavior
            forget_message_toggle(index);
            return "";
        },
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Index of the message to toggle',
                isRequired: false,
                typeList: ARGUMENT_TYPE.NUMBER,
            }),
        ],
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'qm-get',
        aliases: ['qvink-memory-get'],
        callback: async (args, value) => {
            let chat = getContext().chat
            let separator = args.separator ?? get_settings('summary_injection_separator')
            let range;
            if (value === "") {
                range = {start: chat.length-1, end: chat.length-1}
            } else {
                range = stringToRange(value, 0, chat.length - 1);
                if (!range) {
                    error(`Invalid range provided: "${value}"`);
                    return "";
                }
            }

            let indexes = []
            for (let i=range.start; i<=range.end; i++) {
                indexes.push(i)
            }
            return concatenate_summaries(indexes, separator)
        },
        helpString: 'Return the memory associated with a given message index or range. If no index given, assumes the most recent message.',
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'separator',
                description: 'String to separate memories. Defaults to the current profile\'s separator.',
                isRequired: false,
                typeList: [ARGUMENT_TYPE.STRING]
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Index of the message or range of messages',
                isRequired: false,
                typeList: [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.RANGE]
            }),
        ],
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'qm-set',
        aliases: ['qvink-memory-set'],
        callback: async (args, value) => {
            let chat = getContext().chat
            let values = value.split(' ');
            let index = chat.length - 1;
            let text = "";
            if (value !== "") {
                index = Number(values[0]);
                text = values[1] ?? "";
            }
            if (isNaN(index)) {
                error(`Invalid index: "${values[0]}"`);
                return "";
            }
            debug(`Setting memory for message ${index} to "${text}"`)
            set_data(chat[index], "memory", text);
            refresh_memory();
            return "";
        },
        helpString: 'Set the memory for a given message index. If no text provided, deletes the memory.',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Index of the message',
                isRequired: true,
                typeList: ARGUMENT_TYPE.NUMBER,
            }),
            SlashCommandArgument.fromProps({
                description: 'Text to set the memory to. If not provided, deletes the memory.',
                isRequired: false,
                typeList: ARGUMENT_TYPE.STRING,
            }),
        ],
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'qm-summarize',
        aliases: ['qvink-memory-summarize'],
        callback: async (args, index) => {
            if (index === "") index = null  // if not provided the index is an empty string, but we need it to be null to get the default behavior
            await summarize_messages(index);  // summarize the message
            refresh_memory();
            return "";
        },
        helpString: 'Summarize the given message index (defaults to most recent applicable message).',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Index of the message to summarize',
                isRequired: false,
                typeList: ARGUMENT_TYPE.NUMBER,
            }),
        ],
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'qm-summarize-chat',
        aliases: ['qvink-memory-summarize-chat'],
        helpString: 'Summarize the chat using the auto-summarization criteria, even if auto-summarization is off.',
        callback: async (args, limit) => {
            let indexes = collect_messages_to_auto_summarize();
            await summarize_messages(indexes);
            return ""
        },
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'qm-stop-summarization',
        aliases: ['qvink-memory-stop-summarization'],
        callback: (args) => {
            stop_summarization();
            return "";
        },
        helpString: 'Abort any summarization taking place.',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'qm-max-summary-tokens',
        aliases: ['qvink-memory-max-summary-tokens'],
        callback: async (args) => {
            return String(await get_summary_preset_max_tokens());
        },
        helpString: 'Return the max tokens allowed for summarization given the current completion preset.'
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
    add_menu_button(t`Toggle Memory`, "fa-solid fa-brain", toggle_chat_enabled, t`Toggle memory for the current chat.`)
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
    const controlBarHtml = `<div class="panelControlBar flex-container" id="qmExtensionPopoutheader">
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
    loadMovingUIState()
    dragElement($popout)

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
let summaryPromptEditInterface
jQuery(async function () {
    log(`Loading extension...`)

    // Read version from manifest.json
    const manifest = await get_manifest();
    const VERSION = manifest.version;
    log(`Version: ${VERSION}`)

    // Load settings
    initialize_settings();

    // initialize interfaces
    memoryEditInterface = new MemoryEditInterface()
    summaryPromptEditInterface = new SummaryPromptEditInterface()

    // load settings html
    await load_settings_html();

    // initialize UI stuff
    initialize_settings_listeners();
    initialize_popout()
    initialize_message_buttons();
    initialize_group_member_buttons();
    initialize_slash_commands();
    initialize_menu_buttons();
    add_i18n()

    // ST event listeners
    let ctx = getContext();
    let eventSource = ctx.eventSource;
    let event_types = ctx.event_types;
    eventSource.makeLast(event_types.CHARACTER_MESSAGE_RENDERED, (id) => on_chat_event('char_message', id));
    eventSource.on(event_types.USER_MESSAGE_RENDERED, (id) => on_chat_event('user_message', id));
    eventSource.on(event_types.MESSAGE_DELETED, (id) => on_chat_event('message_deleted', id));
    eventSource.on(event_types.MESSAGE_EDITED, (id) => on_chat_event('message_edited', id));
    eventSource.on(event_types.MESSAGE_SWIPED, (id) => on_chat_event('message_swiped', id));
    eventSource.on(event_types.CHAT_CHANGED, () => on_chat_event('chat_changed'));
    eventSource.on(event_types.MORE_MESSAGES_LOADED, refresh_memory)
    eventSource.on('groupSelected', set_character_enabled_button_states)
    eventSource.on(event_types.GROUP_UPDATED, set_character_enabled_button_states)
    eventSource.on(event_types.SETTINGS_UPDATED, refresh_settings)  // refresh extension settings when ST settings change
    eventSource.on(event_types.GENERATION_STARTED, (type, stuff, dry) => on_chat_event('before_message', {'type': type, 'dry': dry}))

    // Global Macros
    MacrosParser.registerMacro(short_memory_macro, () => get_short_memory());
    MacrosParser.registerMacro(long_memory_macro, () => get_long_memory());

});
