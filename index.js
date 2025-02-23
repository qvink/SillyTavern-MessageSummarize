import { getStringHash, debounce, copyText, waitUntilCondition, extractAllWords, isTrueBoolean, select2ChoiceClickSubscribe } from '../../../utils.js';
import { getContext, getApiUrl, extension_settings, doExtrasFetch, modules, renderExtensionTemplateAsync } from '../../../extensions.js';
import {
    activateSendButtons,
    deactivateSendButtons,
    animation_duration,
    eventSource,
    event_types,
    scrollChatToBottom,
    extension_prompt_roles,
    extension_prompt_types,
    generateQuietPrompt,
    is_send_press,
    saveSettingsDebounced,
    substituteParams,
    substituteParamsExtended,
    generateRaw,
    getMaxContextSize,
    setExtensionPrompt,
    streamingProcessor,
    stopGeneration,
    callPopup
} from '../../../../script.js';
import { formatInstructModeChat } from '../../../instruct-mode.js';
import { Popup, POPUP_TYPE } from '../../../popup.js';
import { is_group_generating, selected_group, openGroupId } from '../../../group-chats.js';
import { loadMovingUIState, renderStoryString, power_user } from '../../../power-user.js';
import { dragElement } from '../../../RossAscends-mods.js';
import { getTextTokens, getTokenCount, tokenizers } from '../../../tokenizers.js';
import { debounce_timeout } from '../../../constants.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from '../../../slash-commands/SlashCommandArgument.js';
import { MacrosParser } from '../../../macros.js';
import { commonEnumProviders } from '../../../slash-commands/SlashCommandCommonEnumsProvider.js';
export { MODULE_NAME };
import { t } from '../../../i18n.js';

// THe module name modifies where settings are stored, where information is stored on message objects, macros, etc.
const MODULE_NAME = 'qvink_memory';
const MODULE_DIR = `scripts/extensions/third-party/${MODULE_NAME}`;
const MODULE_NAME_FANCY = 'Qvink Memory';
const PROGRESS_BAR_ID = `${MODULE_NAME}_progress_bar`;

// CSS classes (must match the CSS file because I'm too stupid to figure out how to do this properly)
const css_message_div = "qvink_memory_display"
const css_short_memory = "qvink_short_memory"
const css_long_memory = "qvink_long_memory"
const css_remember_memory = `qvink_remember_memory`
const css_exclude_memory = `qvink_exclude_memory`
const summary_div_class = `qvink_memory_text`  // class put on all added summary divs to identify them
const css_button_separator = `qvink_memory_button_separator`
const css_edit_textarea = `qvink_memory_edit_textarea`
const settings_div_id = `qvink_memory_settings`  // ID of the main settings div.
const settings_content_class = `qvink_memory_settings_content` // Class for the main settings content div which is transferred to the popup
const group_member_enable_button = `qvink_memory_group_member_enable`
const group_member_enable_button_highlight = `qvink_memory_group_member_enabled`

// Macros for long-term and short-term memory injection
const long_memory_macro = `${MODULE_NAME}_long_memory`;
const short_memory_macro = `${MODULE_NAME}_short_memory`;

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
    include_system_messages: false,  // include system messages in summarization
    include_thought_messages: false,  // include thought messages in summarization (Stepped Thinking extension)

    // summarization settings
    prompt: default_prompt,
    auto_summarize: true,   // whether to automatically summarize new chat messages
    summarization_delay: 0,  // delay auto-summarization by this many messages (0 summarizes immediately after sending, 1 waits for one message, etc)
    summarization_time_delay: 0, // time in seconds to delay between summarizations
    auto_summarize_batch_size: 1,  // number of messages to summarize at once when auto-summarizing
    auto_summarize_message_limit: 100,  // maximum number of messages to go back for auto-summarization.
    auto_summarize_on_edit: true,  // whether to automatically re-summarize edited chat messages
    auto_summarize_on_swipe: true,  // whether to automatically summarize new message swipes
    auto_summarize_progress: true,  // display a progress bar for auto-summarization
    auto_summarize_on_send: false,  // trigger auto-summarization right before a new message is sent

    include_world_info: false,  // include world info in context when summarizing
    block_chat: true,  // block input when summarizing
    summary_maximum_length: 30,  // maximum token length of the summary
    nest_messages_in_prompt: false,  // nest messages to summarize in the prompt for summarization

    include_message_history: 3,  // include a number of previous messages in the prompt for summarization
    include_message_history_mode: 'none',  // mode for including message history in the prompt
    include_user_messages_in_history: false,  // include previous user message in the summarization prompt when including message history
    include_system_messages_in_history: false,  // include previous system messages in the summarization prompt when including message history
    include_thought_messages_in_history: false,  // include previous thought messages in the summarization prompt when including message history

    // injection settings
    long_template: default_long_template,
    long_term_context_limit: 10,  // percentage of context size to use as long-term memory limit
    long_term_position: extension_prompt_types.IN_PROMPT,
    long_term_role: extension_prompt_roles.SYSTEM,
    long_term_depth: 2,
    long_term_scan: false,

    short_template: default_short_template,
    short_term_context_limit: 10,  // percentage of context size to use as short-term memory limit
    short_term_position: extension_prompt_types.IN_PROMPT,
    short_term_depth: 2,
    short_term_role: extension_prompt_roles.SYSTEM,
    short_term_scan: false,

    // misc
    debug_mode: false,  // enable debug mode
    display_memories: true,  // display memories in the chat below each message
    default_chat_enabled: true,  // whether memory is enabled by default for new chats
    limit_injected_messages: -1,  // limit the number of injected messages (-1 for no limit)
};
const global_settings = {
    profiles: {},  // dict of profiles by name
    character_profiles: {},  // dict of character identifiers to profile names
    profile: 'Default', // Current profile
    chats_enabled: {},  // dict of chat IDs to whether memory is enabled
    disabled_group_characters: {}  // group chat IDs mapped to a list of disabled character keys
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

const saveChatDebounced = debounce(() => getContext().saveChat(), debounce_timeout.relaxed);
function count_tokens(text, padding = 0) {
    // count the number of tokens in a text
    return getTokenCount(text, padding);
}
function get_context_size() {
    // Get the current context size
    return getMaxContextSize();
}
function get_long_token_limit() {
    // Get the long-term memory token limit, given the current context size and settings
    let long_term_context_limit = get_settings('long_term_context_limit');
    let context_size = get_context_size();
    return Math.floor(context_size * long_term_context_limit/100);
}
function get_short_token_limit() {
    // Get the short-term memory token limit, given the current context size and settings
    let short_term_context_limit = get_settings('short_term_context_limit');
    let context_size = get_context_size();
    return Math.floor(context_size * short_term_context_limit/100);
}
function get_current_character_identifier() {
    // uniquely identify the current character
    // You have to use the character's avatar image path to uniquely identify them
    let context = getContext();
    if (context.groupId) {
        return context.groupId;  // if a group is selected, use the group ID
    }

    // otherwise get the avatar image path of the current character
    let index = context.characterId;
    if (!index) {  // not a group or a character
        return null;
    }

    return context.characters[index].avatar;
}

// Completion presets
async function get_current_preset() {
    // get the currently selected completion preset
    return await executeSlashCommandsWithOptions(`/preset`)
}
async function set_preset(name) {
    // Set the completion preset
    if (get_settings('debug_mode')) {
        toastr.info(`Setting completion preset to ${name}`);
    }
    await executeSlashCommandsWithOptions(`/preset ${name}`)
}
function get_presets() {
    // get a list of the available presets
    return $('#settings_preset_textgenerationwebui').children().map(function () {
        return $(this).text();
    }).get();
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
    return await fetch(`${MODULE_DIR}/manifest.json`).then(async response => {
        if (!response.ok) {
            error(`Error getting manifest.json: status: ${response.status}`);
            error(response)
        }
        return await response.json();
    })
}
function chat_enabled() {
    // check if the current chat is enabled
    let context = getContext();
    return get_settings('chats_enabled')?.[context.chatId] ?? get_settings('default_chat_enabled')
}

function toggle_chat_enabled(id=null, value=null) {
    let context = getContext();
    if (id === null) {
        id = context.chatId;
    }

    // if value is null, toggle. Otherwise, set to the given value

    // Toggle whether to enable or disable memory for the current character
    let enabled = get_settings('chats_enabled')
    let current = enabled[id] ?? get_settings('default_chat_enabled');

    if (value === null) {  // toggle
        enabled[id] = !current;
    } else if (value === current) {
        return;  // no change
    } else {  // set to the given value
        enabled[id] = value;
    }

    // save the setting
    set_settings('chats_enabled', enabled);

    if (enabled[id]) {
        toastr.info(`Memory is now enabled for this chat`);
    } else {
        toastr.warning(`Memory is now disabled for this chat`);
    }
    refresh_memory()

    // update the message visuals
    for (let i=context.chat.length - 1 ; i >= 0; i--) {
        update_message_visuals(i);
    }

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
    // check if the given character is enabled for summarization in the current chat
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
        } else {  // text input, dropdown, select2
            value = $(this).val();
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
function refresh_settings() {
    // Refresh all settings UI elements according to the current settings
    debug("Refreshing settings...")

    // Set the UI profile dropdowns to reflect the available profiles and the currently chosen one
    let profile_options = Object.keys(get_settings('profiles'));
    let choose_profile_dropdown = $('#profile').empty();
    let current_character_profile = get_character_profile();
    for (let profile of profile_options) {

        // if the current character has a default profile, set the "locked" icon to show it
        if (profile === current_character_profile) {
            choose_profile_dropdown.append(`<option value="${profile}">${profile} (locked)</option>`);
        } else {
            choose_profile_dropdown.append(`<option value="${profile}">${profile}</option>`);
        }

    }

    if (current_character_profile) {  // set the current chosen profile in the dropdown
        choose_profile_dropdown.val(current_character_profile);
    }

    // if prompt doesn't have {{message}}, insert it
    if (!get_settings('prompt').includes("{{message}}")) {
        set_settings('prompt', get_settings('prompt') + "\n{{message}}")
        //toastr.warning("You did not have the {{message}} macro in your summary prompt. It has been added automatically.")
    }

    // auto_summarize_message_limit must be >= auto_summarize_batch_size
    if (get_settings('auto_summarize_message_limit') < get_settings('auto_summarize_batch_size')) {
        set_settings('auto_summarize_message_limit', get_settings('auto_summarize_batch_size'));
        toastr.warning("The auto-summarize message limit must be greater than or equal to the batch size.")
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

    // update the button highlight
    update_save_icon_highlight();
}
function load_profile(profile=null) {
    // load a given settings profile
    if (!profile) {  // if none provided, reload the current profile
        profile = get_settings('profile');
    }

    let settings = copy_settings(profile);  // copy the settings from the profile
    if (!settings) {
        error("Profile not found: "+profile);
        return;
    }

    log("Loading Configuration Profile: "+profile);
    Object.assign(extension_settings[MODULE_NAME], settings);  // update the settings
    set_settings('profile', profile);  // set the current profile
    refresh_settings();
}
async function rename_profile() {
    // Rename the current profile via user input
    let old_name = get_settings('profile');
    let new_name = await Popup.show.input("Rename Configuration Profile", `Enter a new name:`, old_name);

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
    log(`Deleting Configuration Profile: ${profile}`);
    delete profiles[profile];
    set_settings('profiles', profiles);
    load_profile('Default');
}
function toggle_character_profile() {
    // Toggle whether the current profile is set to the default for the current character (or group)
    let key = get_current_character_identifier();  // uniquely identify the current character or group chat
    log("KEY: "+key)
    if (!key) {  // no character or group selected
        return;
    }

    // current profile
    let profile = get_settings('profile');

    // if the character profile is already set to the current profile, unset it.
    // otherwise, set it to the current profile.
    set_character_profile(key, profile === get_character_profile() ? null : profile);
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
function load_character_profile() {
    // Load the settings profile for the current character
    let profile = get_character_profile();
    load_profile(profile || 'Default');

    // this is to keep the current profile when switching characters
    //    if (profile) {  // if a default profile is set, load it
    //         load_profile(profile);
    //     }

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
function update_message_visuals(i, style=true, text=null) {
    // Update the message visuals according to its current memory status
    // Each message div will have a div added to it with the memory for that message.
    // Even if there is no memory, I add the div because otherwise the spacing changes when the memory is added later.

    let chat = getContext().chat;
    let message = chat[i];
    let memory = get_memory(message, 'memory');
    let include = get_memory(message, 'include');
    let error_message = get_memory(message, 'error');
    let remember = get_memory(message, 'remember');
    let exclude = get_memory(message, 'exclude');  // force-excluded by user
    let div_element = get_message_div(i);

    // div not found (message may not be loaded)
    if (!div_element) {
        return;
    }

    // remove any existing added divs
    div_element.find(`div.${summary_div_class}`).remove();

    // If setting isn't enabled, don't display memories
    if (!get_settings('display_memories') || !chat_enabled()) {
        return;
    }

    // get the div holding the main message text
    let message_element = div_element.find('div.mes_text');

    let style_class = ''
    if (style) {
        if (remember && include) {  // marked to be remembered and included in memory anywhere
            style_class = css_long_memory
        } else if (include === "short") {  // not marked to remember, but included in short-term memory
            style_class = css_short_memory
        } else if (remember) {  // marked to be remembered but not included in memory
            style_class = css_remember_memory
        } else if (exclude) {  // marked as force-excluded
            style_class = css_exclude_memory
        }
    }

    // if no text is provided, use the memory text
    if (!text) {
        text = ""  // default text when no memory
        if (memory) {
            text = `Memory: ${memory}`
        } else if (error_message) {
            style_class = ''  // clear the style class if there's an error
            text = `Error: ${error_message}`
        }
    }

    // create the div element for the memory and add it to the message div
    let memory_div = $(`<div class="${summary_div_class} ${css_message_div} ${style_class}">${text}</div>`)
    message_element.after(memory_div);

    // add a click event to the memory div to edit the memory
    memory_div.on('click', function () {
        edit_memory(i);
    })
}
function edit_memory(index) {
    // Allow the user to edit a message summary
    let message = getContext().chat[index];
    let message_div = get_message_div(index);

    // get the current memory text
    let memory = get_memory(message, 'memory')?.trim() ?? '';

    // find the div holding the memory text
    let memory_div = message_div.find(`div.${summary_div_class}`);

    // Hide the memory div and add the textarea
    let textarea = $(`<textarea class="${css_message_div} ${css_edit_textarea}" rows="1"></textarea>`);
    memory_div.hide();
    memory_div.after(textarea);
    textarea.focus();  // focus on the textarea
    textarea.val(memory);  // set the textarea value to the memory text (this is done after focus to keep the cursor at the end)
    textarea.height(textarea[0].scrollHeight-10);  // set the height of the textarea to fit the text

    function confirm_edit() {
        let new_memory = textarea.val();
        if (new_memory === memory) {  // no change
            cancel_edit()
            return;
        }
        store_memory(message, "edited", true)  // mark as edited
        store_memory(message, 'memory', new_memory);
        textarea.remove();  // remove the textarea
        memory_div.show();  // show the memory div
        refresh_memory();
        debug(`Edited memory for message ${index}`);
    }

    function cancel_edit() {
        textarea.remove();  // remove the textarea
        memory_div.show();  // show the memory div
    }

    // save when the textarea loses focus, or when enter is pressed
    textarea.on('blur', confirm_edit);
    textarea.on('keydown', function (event) {
        if (event.key === 'Enter') {  // confirm edit
            event.preventDefault();
            confirm_edit();
        } else if (event.key === 'Escape') {  // cancel edit
            event.preventDefault();
            cancel_edit();
        }
    })
}
async function display_text_modal(title, text="") {
    // Display a modal with the given title and text
    // replace newlines in text with <br> for HTML
    text = text.replace(/\n/g, '<br>');
    let html = `<h2>${title}</h2><div style="text-align: left; overflow: auto;">${text}</div>`
    const popupResult = await callPopup(html, 'text', undefined, { okButton: `Close` });
}
async function get_user_setting_text_input(key, title) {
    // Display a modal with a text area input, populated with a given setting value
    let value = get_settings(key) ?? '';

    title = `<h3>${title}</h3>`//<button id="restore" title="Restore default" class="menu_button fa-solid fa-clock-rotate-left"></button>`

    let restore_button = {  // don't specify "result" key do not close the popup
        text: 'Restore Default',
        appendAtEnd: true,
        action: () => { // fill the input with the default value
            popup.mainInput.value = default_settings[key] ?? '';
        }
    }

    let popup = new Popup(title, POPUP_TYPE.INPUT, value, {rows: 20, customButtons: [restore_button]});

    // Now remove the ".result-control" class to prevent it from submitting when you hit enter.
    // This should have been a configuration option for the popup.
    popup.mainInput.classList.remove('result-control');

    let input = await popup.show();
    if (input) {
        set_settings(key, input);
    }
}
async function summarize_chat_modal() {
    // Let the user choose settings before summarizing the chat
    let html = `
<h2 data-i18n="Summarize Chat">Summarize Chat</h2>
<p><span data-i18n="Currently preparing to summarize:">Currently preparing to summarize:</span> <span id="number_to_summarize"></span></p>
`

    let custom_inputs = [
        {
            id: "include_no_summary",
            label: t`Summarize messages with no existing summary`,
            type: "checkbox",
            defaultState: true,
        },
        {
            id: "include_short",
            label: t`Re-summarize messages with existing short-term memories`,
            type: "checkbox",
            defaultState: false,
        },
        {
            id: "include_long",
            label: t`Re-summarize messages with existing long-term memories`,
            type: "checkbox",
            defaultState: false,
        },
        {
            id: "include_excluded",
            label: t`Re-summarize messages with existing memories, but which are currently excluded from short-term and long-term memory`,
            type: "checkbox",
            defaultState: false,
        },
        {
            id: "include_edited",
            label: t`Re-summarize messages with existing memories that have been manually edited.`,
            type: "checkbox",
            defaultState: false,
        },
    ]

    let popup = new Popup(html, POPUP_TYPE.CONFIRM, null, {rows: 20, okButton: 'Summarize', cancelButton: 'Cancel', customInputs: custom_inputs});

    function get_messages_to_summarize() {
        // get settings from the input
        let settings = {};
        for (let input of custom_inputs) {
            settings[input.id] = $(popup.inputControls).find(`#${input.id}`).prop('checked');
        }
        log(settings)
        return collect_chat_messages(settings.include_no_summary, settings.include_short, settings.include_long, settings.include_edited, settings.include_excluded, 0);
    }


    // remove the class "justifyCenter" from all inputs. Who thought that was a good idea?
    let input_elements = popup.inputControls.children;
    for (let child of input_elements) {
        child.classList.remove('justifyCenter');
    }

    // shows the number of messages about to be summarized
    let $number_to_summarize = $(popup.content).find('#number_to_summarize');

    // set the number of messages to summarize whenever one of the inputs changes
    for (let input of input_elements) {
        $(input).on('change', function () {
            let number = get_messages_to_summarize().length;
            $number_to_summarize.text(number);
        })
    }
    // set the initial number of messages to summarize
    $number_to_summarize.text(get_messages_to_summarize().length);

    let input = await popup.show();
    if (input) {
        let indexes = get_messages_to_summarize();
        summarize_messages(indexes);
    }
}
function progress_bar(id, progress, total, title) {
    // Display, update, or remove a progress bar
    id = `${PROGRESS_BAR_ID}_${id}`
    let $existing = $(`#${id}`);
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
<div id="${id}" class="qvink_progress_bar flex-container justifyspacebetween alignitemscenter">
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
}
function remove_progress_bar(id) {
    id = `${PROGRESS_BAR_ID}_${id}`
    let $existing = $(`#${id}`);
    if ($existing.length > 0) {  // found
        debug("Removing progress bar")
        $existing.remove();
    }
}


// Message functions
function store_memory(message, key, value) {
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
function get_memory(message, key) {
    // get information from the message object
    return message?.extra?.[MODULE_NAME]?.[key];
}
function get_previous_swipe_memory(message, key) {
    // get information from the message's previous swipe
    if (!message.swipe_id) {
        return null;
    }
    return message?.swipe_info?.[message.swipe_id-1]?.extra?.[MODULE_NAME]?.[key];
}
async function remember_message_toggle(index=null) {
    // Toggle the "remember" status of a message
    let context = getContext();

    // Default to the last message, min 0
    index = Math.max(index ?? context.chat.length-1, 0)

    // toggle
    let message = context.chat[index]
    store_memory(message, 'remember', !get_memory(message, 'remember'));
    store_memory(message, 'exclude', false);  // if it's remembered, it can't be excluded

    let new_status = get_memory(message, 'remember')
    let memory = get_memory(message, 'memory')
    debug(`Set message ${index} remembered status: ${new_status}`);

    // if it was marked as remembered and no summary, summarize it
    if (new_status && !memory) {
        await summarize_message(index);
    }
    refresh_memory();
}
function forget_message_toggle(index=null) {
    // Toggle the "forget" status of a message
    let context = getContext();

    // Default to the last message, min 0
    index = Math.max(index ?? context.chat.length-1, 0)

    // toggle
    let message = context.chat[index]
    store_memory(message, 'exclude', !get_memory(message, 'exclude'));
    store_memory(message, 'remember', false);  // if it's excluded, it can't be remembered

    let new_status = get_memory(message, 'exclude')
    debug(`Set message ${index} exclude status: ${new_status}`);
    refresh_memory()
}
function get_character_key(message) {
    // get the unique identifier of the character that sent a message
    return message.original_avatar
}


// Inclusion / Exclusion criteria
function check_message_exclusion(message) {
    // check for any exclusion criteria for a given message
    // (this does NOT take context lengths into account, only exclusion criteria based on the message itself).
    if (!message) return false;

    // system messages sent by this extension are always ignored
    if (get_memory(message, 'is_qvink_system_memory')) {
        return false;
    }

    // first check if it has been marked to be remembered by the user - if so, it bypasses all other exclusion criteria
    if (get_memory(message, 'remember')) {
        return true;
    }

    // check if it's marked to be excluded - if so, exclude it
    if (get_memory(message, 'exclude')) {
        return false;
    }

    // check if it's a user message and exclude if the setting is disabled
    if (!get_settings('include_user_messages') && message.is_user) {
        return false
    }

    // check if it's a thought message and exclude if the setting is disabled (Stepped Thinking extension)
    if (!get_settings('include_thought_messages') && message.is_thoughts) {
        return false
    }

    // check if it's a system (hidden) message and exclude if the setting is disabled
    if (!get_settings('include_system_messages') && message.is_system) {
        return false;
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

    // iterate through the chat in reverse order and mark the messages that should be included in short-term and long-term memory
    let short_limit_reached = false;
    let long_limit_reached = false;
    let long_term_end_index = null;  // index of the most recent message that doesn't fit in short-term memory
    let end = chat.length - 1;
    for (let i = end; i >= 0; i--) {
        let message = chat[i];

        // check for any of the exclusion criteria
        let include = check_message_exclusion(message)
        if (!include) {
            store_memory(message, 'include', null);
            continue;
        }

        if (!short_limit_reached) {  // short-term limit hasn't been reached yet
            let short_memory_text = concatenate_summaries(i, end);  // add up all the summaries down to this point
            let short_token_size = count_tokens(short_memory_text);
            if (short_token_size > get_short_token_limit()) {  // over context limit
                short_limit_reached = true;
                long_term_end_index = i;  // this is where long-term memory ends and short-term begins
            } else {  // under context limit
                store_memory(message, 'include', 'short');  // mark the message as short-term
                continue
            }
        }

        // if the short-term limit has been reached, check the long-term limit
        let remember = get_memory(message, 'remember');
        if (!long_limit_reached && remember) {  // long-term limit hasn't been reached yet and the message was marked to be remembered
            let long_memory_text = concatenate_summaries(i, long_term_end_index, false, true)  // get all messages marked for remembering in long-term memory
            let long_token_size = count_tokens(long_memory_text);
            if (long_token_size > get_long_token_limit()) {  // over context limit
                long_limit_reached = true;
            } else {
                store_memory(message, 'include', 'long');  // mark the message as long-term
                continue
            }
        }

        // if we haven't marked it for inclusion yet, mark it as excluded
        store_memory(message, 'include', null);
    }

    // update the message visuals of each message, styled according to the inclusion criteria
    for (let i=chat.length-1; i >= 0; i--) {
        update_message_visuals(i, true);
    }
}
function concatenate_summaries(start=null, end=null, include=null, remember=null, exclusion_criteria=true) {
    // Given a start and end, concatenate the summaries of the messages in that range
    // Excludes messages that don't meet the inclusion criteria

    let context = getContext();
    let chat = context.chat;

    // Default start is 0
    start = Math.max(start ?? 0, 0)

    // Default end is the last message
    end = Math.max(end ?? context.chat.length - 1, 0)

    // assert start is less than end
    if (start > end) {
        error('Cannot concatenate summaries: start index is greater than end index');
        return '';
    }

    // iterate through messages
    let summaries = [];
    for (let i = start; i <= end; i++) {
        let message = chat[i];

        // check against the message exclusion criteria
        if (exclusion_criteria && !check_message_exclusion(message)) {
            continue;
        }

        // If an inclusion flag is provided, check if the message is marked for that inclusion
        if (include && get_memory(message, 'include') !== include) {
            continue;
        }
        if (remember && get_memory(message, 'remember') !== remember) {
            continue;
        }

        let summary = get_memory(message, 'memory');
        if (!summary) {  // if there's no summary, skip it
            continue;
        }
        summaries.push(summary)
    }

    // Add an asterisk to the beginning of each summary and join them with newlines
    summaries = summaries.map((s) => `* ${s}`);
    return summaries.join('\n');
}
function get_long_memory() {
    // get the injection text for long-term memory
    let text = concatenate_summaries(null, null, "long");
    let template = get_settings('long_template')

    // first replace any global macros
    template = substituteParamsExtended(template);

    // handle the #if macros using our custom function because ST DOESN'T EXPOSE THEIRS FOR SOME REASON
    template = substitute_conditionals(template, {[long_memory_macro]: text});
    template = substitute_params(template, {[long_memory_macro]: text});
    return template
}
function get_short_memory() {
    // get the injection text for short-term memory
    let text = concatenate_summaries(null, null, "short");
    let template = get_settings('short_template')

    // first replace any global macros
    template = substituteParamsExtended(template);

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
async function summarize_messages(indexes, show_progress=true) {
    // Summarize the given list of message indexes
    if (!indexes.length) {
        return;
    }

     // only show progress if there's more than one message to summarize
    show_progress = show_progress && indexes.length > 1;

    // set stop flag to false just in case
    STOP_SUMMARIZATION = false

    // optionally block user from sending chat messages while summarization is in progress
    if (get_settings('block_chat')) {
        deactivateSendButtons();
    }

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

    if (show_progress) remove_progress_bar('summarize')  // remove the progress bar


    if (STOP_SUMMARIZATION) {  // check if summarization was stopped
        STOP_SUMMARIZATION = false  // reset the flag
    } else {
        log(`Messages summarized: ${indexes.length}`)
    }

    if (get_settings('block_chat')) {
        activateSendButtons();
    }
    refresh_memory()

}
async function summarize_message(index=null) {
    // summarize a message given the chat index, replacing any existing memories

    let context = getContext();
    let chat = context.chat;

    // Default to the last message, min 0
    index = Math.max(index ?? chat.length - 1, 0)
    let message = chat[index]
    let message_hash = getStringHash(message.mes);

    // Temporarily update the message summary text to indicate that it's being summarized (no styling based on inclusion criteria)
    // A full visual update with style should be done on the whole chat after inclusion criteria have been recalculated
    update_message_visuals(index, false, "Summarizing...")

    // If the most recent message, scroll to the bottom
    if (index === chat.length - 1) {
        scrollChatToBottom();
    }

    // construct the full summary prompt for the message
    let prompt = create_summary_prompt(index)

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
        store_memory(message, 'memory', summary);
        store_memory(message, 'hash', message_hash);  // store the hash of the message that we just summarized
    } else {  // generation failed
        error(`Failed to summarize message ${index} - generation failed.`);
        store_memory(message, 'error', err || "Summarization failed");  // store the error message
        store_memory(message, 'memory', null);  // clear the memory if generation failed
    }

    // update the message summary text again now with the memory, still no styling
    update_message_visuals(index, false)

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

    // TODO do the world info injection manually instead
    let include_world_info = get_settings('include_world_info');
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
        return await generateQuietPrompt(prompt, false, false, '', "assistant", get_settings('summary_maximum_length'));
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
        return await generateRaw(prompt, '', true, false, '', get_settings('summary_maximum_length'));
    }
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
            let summary = get_memory(m, 'memory')
            if (summary) {
                summary = `Summary: ${summary}`
                history.push(formatInstructModeChat("assistant", summary, false, false, "", "", "", null))
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
function format_system_prompt(text) {
    // Given text with some number of {{macro}} items, split the text by these items and format the rest as system messages surrounding the macros
    // It is assumed that the parts will be later replaced with appropriate text

    // split on either {{...}} or {{#if ... /if}}.
    // /g flag is for global, /s flag makes . match newlines so the {{#if ... /if}} can span multiple lines
    let parts = text.split(/(\{\{#if.*?\/if}})|(\{\{.*?}})/gs);

    let formatted = parts.map((part) => {
        if (!part) return ""
        part = part.trim()  // trim whitespace
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
function create_summary_prompt(index) {
    // create the full summary prompt for the message at the given index

    let context = getContext()
    let chat = context.chat
    let message = chat[index];

    // get history of messages (formatted as system messages) leading up to the message
    let history_text = get_message_history(index);

    // format the message itself
    let message_text = formatInstructModeChat(message.name, message.mes, message.is_user, false, "", context.name1, context.name2, null)

    // get the full prompt template from settings
    let prompt = get_settings('prompt');

    // first substitute any global macros like {{words}}, {{persona}}, {{char}}, etc...
    prompt = substituteParamsExtended(prompt)

    // then substitute any {{#if macro}} ... {{/if}} blocks
    prompt = substitute_conditionals(prompt, {"message": message_text, "history": history_text})

    // The conditional substitutions have to be done before splitting and making each section a system prompt, because the conditional content may contain regular text
    //  that should be included in the system prompt.

    // if nesting
    if (get_settings('nest_messages_in_prompt')) {
        // substitute custom macros
        prompt = substitute_params(prompt, {"message": message_text, "history": history_text});  // substitute "message" and "history" macros

        // then wrap it in the system prompt
        prompt = formatInstructModeChat("", prompt, false, true, "", "", "", null)
    } else {  // otherwise
        // first make each prompt section its own system prompt
        prompt = format_system_prompt(prompt)

        // now substitute the custom macros
        prompt = substitute_params(prompt, {"message": message_text, "history": history_text});  // substitute "message" and "history" macros
    }

    // append the assistant starting message template to the text, replacing the name with "assistant" if needed
    let output_sequence = substituteParamsExtended(power_user.instruct.output_sequence, {name: "assistant"});
    prompt = `${prompt}\n${output_sequence}\nSummary:`

    return prompt
}

function refresh_memory() {
    if (!chat_enabled()) { // if chat not enabled, remove the injections
        setExtensionPrompt(`${MODULE_NAME}_long`, "");
        setExtensionPrompt(`${MODULE_NAME}_short`, "");
        return;
    }

    // Update the UI according to the current state of the chat memories, and update the injection prompts accordingly
    update_message_inclusion_flags()  // update the inclusion flags for all messages

    // get the filled out templates
    let long_injection = get_long_memory();
    let short_injection = get_short_memory();

    // inject the memories into the templates, if they exist
    if (long_injection) {
        setExtensionPrompt(`${MODULE_NAME}_long`,  long_injection,  get_settings('long_term_position'), get_settings('long_term_depth'), get_settings('long_term_scan'), get_settings('long_term_role'));
    }

    if (short_injection) {
        setExtensionPrompt(`${MODULE_NAME}_short`, short_injection, get_settings('short_term_position'), get_settings('short_term_depth'), get_settings('short_term_scan'), get_settings('short_term_role'));
    }

    return `${long_injection}\n${short_injection}`  // return the concatenated memory text
}
const refresh_memory_debounced = debounce(refresh_memory, debounce_timeout.relaxed);

function stop_summarization() {
    // Immediately stop summarization of the chat
    STOP_SUMMARIZATION = true  // set the flag
    stopGeneration();  // stop generation on current message
    clearTimeout(SUMMARIZATION_DELAY_TIMEOUT)  // clear the summarization delay timeout
    if (SUMMARIZATION_DELAY_RESOLVE !== null) SUMMARIZATION_DELAY_RESOLVE()  // resolve the delay promise so the await goes through
    log("Aborted summarization.")
}
async function auto_summarize_chat() {
    // Perform automatic summarization on the chat
    log('Auto-Summarizing chat...')
    let context = getContext();

    // iterate through the chat in chronological order and check which messages need to be summarized.
    let messages_to_summarize = []  // list of indexes of messages to summarize
    for (let i = 0; i < context.chat.length; i++) {
        // get current message
        let message = context.chat[i];

        // check message exclusion criteria
        let include = check_message_exclusion(message);  // check if the message should be included due to the inclusion criteria
        if (!include) {
            continue;
        }

        // skip messages that already have a summary
        if (get_memory(message, 'memory')) {
            continue;
        }

        // this message can be summarized
        messages_to_summarize.push(i)
    }
    debug(`Messages to summarize - inclusion (${messages_to_summarize.length}): ${messages_to_summarize}`)

    // remove a number of messages from the end equal to the desired delay setting
    let messages_to_delay = get_settings('summarization_delay');  // number of messages to delay summarization for
    if (messages_to_delay > 0) {
        messages_to_summarize = messages_to_summarize.slice(0, -messages_to_delay)
    }
    debug(`Messages to summarize - delay (${messages_to_summarize.length}): ${messages_to_summarize}`)

    // account for the auto-summarization max message limit
    let message_limit = get_settings('auto_summarize_message_limit');  // max number of messages to go back for auto-summarization
    if (message_limit > 0) {
        messages_to_summarize = messages_to_summarize.slice(-message_limit)
    }
    debug(`Messages to summarize - limit (${messages_to_summarize.length}): ${messages_to_summarize}`)

    // If we don't have enough messages to batch, don't summarize
    let messages_to_batch = get_settings('auto_summarize_batch_size');  // number of messages to summarize in a batch
    if (messages_to_summarize.length < messages_to_batch) {
        debug(`Not enough messages (${messages_to_summarize.length}) to summarize in a batch (${messages_to_batch})`)
        messages_to_summarize = []
    }

    let show_progress = get_settings('auto_summarize_progress');

    // summarize the messages
    await summarize_messages(messages_to_summarize, show_progress);
}
function collect_chat_messages(no_summary=false, short=false, long=false, edited=false, excluded=false, limit=1) {
    // Get a list of chat message indexes identified by the given criteria
    let context = getContext();

    let indexes = []  // list of indexes of messages
    for (let i = 0; i < context.chat.length; i++) {
        // get current message
        let message = context.chat[i];

        // check regular message exclusion criteria
        let include = check_message_exclusion(message);  // check if the message should be included due to the inclusion criteria
        if (!include) {
            continue;
        }

        let existing_memory = get_memory(message, 'memory');
        let edited_memory = get_memory(message, 'edited');
        let include_type = get_memory(message, 'include');

        // if we aren't summarizing messages with no summary and this message doesn't have a summary, skip it
        if (!no_summary && !existing_memory) {
            continue;
        }

        // if we aren't summarizing messages with existing short-term memories and this message has one, skip it
        if (include_type === "short" && !short && existing_memory) {
            continue;
        }

        // if we aren't summarizing messages with existing long-term memories and this message has one, skip it
        if (include_type === "long" && !long && existing_memory) {
            continue;
        }

        // if we aren't summarizing messages with existing memories that have been edited and this message has been edited, skip it
        if (edited && !edited_memory && existing_memory) {
            continue;
        }

        // if we aren't summarizing messages with existing memories that are excluded from short-term and long-term memory, skip it
        if (include_type === null && !excluded && existing_memory) {
            continue;
        }

        // this message can be summarized
        indexes.push(i)
    }

    if (limit && limit > 0) {
        indexes = indexes.slice(-limit)
    }
    return indexes
}

function copy_summaries_to_clipboard() {
    // copy all summaries in the chat to the clipboard
    let text = concatenate_summaries(null, null, null, null, false);
    copyText(text)
    toastr.info("All memories copied to clipboard.")
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
            load_character_profile();  // load the profile for the current character
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

        case 'user_message':
            last_message_swiped = null;
            if (!chat_enabled()) break;  // if chat is disabled, do nothing


            // if (!get_settings('auto_summarize')) break;  // if auto-summarize is disabled, do nothing
            //
            // // Summarize the chat if either "auto_summarize_on_send" is enabled or "include_user_messages" is enabled
            // if (get_settings('auto_summarize_on_send') || get_settings('include_user_messages')) {
            //     debug("New user message detected, summarizing")
            //     await auto_summarize_chat();  // auto-summarize the chat (checks for exclusion criteria and whatnot)
            // }

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
                await summarize_message(index);  // summarize the swiped message
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
            if (!get_memory(context.chat[index], 'memory')) break;  // if the message doesn't have a memory, skip
            debug("Message with memory edited, summarizing")
            summarize_message(index);  // summarize that message (no await so the message edit goes through)

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
                store_memory(message, 'memory', null);
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
    debug("Initializing settings listeners")

    // Trigger profile changes
    bind_setting('#profile', 'profile', 'text', () => load_profile(), false);
    bind_function('#save_profile', () => save_profile(), false);
    bind_function('#restore_profile', () => load_profile(), false);
    bind_function('#rename_profile', () => rename_profile(), false)
    bind_function('#new_profile', new_profile, false);
    bind_function('#delete_profile', delete_profile, false);
    bind_function('#character_profile', () => toggle_character_profile(), false);


    bind_function('#rerun_memory', (e) => {summarize_chat_modal()})
    bind_function('#stop_summarization', stop_summarization);
    bind_function('#revert_settings', reset_settings);

    bind_function('#toggle_chat_memory', () => toggle_chat_enabled(), false);
    bind_function('#preview_memory_state', async () => {
        let text = refresh_memory()
        text = `...\n\n${text}\n\n...`
        display_text_modal("Memory State Preview", text);
    })
    bind_function("#refresh_memory", () => refresh_memory());

    bind_function('#edit_summary_prompt', async () => {
        get_user_setting_text_input('prompt', 'Edit Summary Prompt')
    })
    bind_function('#preview_summary_prompt', async () => {
        let text = create_summary_prompt(getContext().chat.length-1)
        display_text_modal("Summary Prompt Preview (Last Message)", text);
    })
    bind_function('#edit_long_term_memory_prompt', async () => {
        get_user_setting_text_input('long_template', 'Edit Long-Term Memory Prompt')
    })
    //bind_function('#preview_long_term_memory', async () => {display_text_modal("Long-Term Memory Preview", get_long_memory())})
    bind_function('#edit_short_term_memory_prompt', async () => {
        get_user_setting_text_input('short_template', 'Edit Short-Term Memory Prompt')
    })
    //bind_function('#preview_short_term_memory', async () => {display_text_modal("Short-Term Memory Preview", get_short_memory())})
    bind_function('#preview_message_history', async () => {
        let chat = getContext().chat;
        let history = get_message_history(chat.length-1);
        display_text_modal("{{history}} Macro Preview (Last Message)", history);
    })
    bind_function('#copy_summaries_to_clipboard', copy_summaries_to_clipboard)

    bind_setting('#auto_summarize', 'auto_summarize', 'boolean');
    bind_setting('#auto_summarize_on_edit', 'auto_summarize_on_edit', 'boolean');
    bind_setting('#auto_summarize_on_swipe', 'auto_summarize_on_swipe', 'boolean');
    bind_setting('#summarization_delay', 'summarization_delay', 'number');
    bind_setting('#summarization_time_delay', 'summarization_time_delay', 'number')
    bind_setting('#auto_summarize_batch_size', 'auto_summarize_batch_size', 'number');
    bind_setting('#auto_summarize_message_limit', 'auto_summarize_message_limit', 'number');
    bind_setting('#auto_summarize_progress', 'auto_summarize_progress', 'boolean');
    bind_setting('#auto_summarize_on_send', 'auto_summarize_on_send', 'boolean');

    bind_setting('#include_world_info', 'include_world_info', 'boolean');
    bind_setting('#block_chat', 'block_chat', 'boolean');
    bind_setting('#include_user_messages', 'include_user_messages', 'boolean');
    bind_setting('#include_system_messages', 'include_system_messages', 'boolean');
    bind_setting('#include_thought_messages', 'include_thought_messages', 'boolean');

    bind_setting('#message_length_threshold', 'message_length_threshold', 'number');
    bind_setting('#summary_maximum_length', 'summary_maximum_length', 'number');
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

    bind_setting('input[name="long_term_position"]', 'long_term_position', 'number');
    bind_setting('#long_term_depth', 'long_term_depth', 'number');
    bind_setting('#long_term_role', 'long_term_role');
    bind_setting('#long_term_scan', 'long_term_scan', 'boolean');
    bind_setting('#long_term_context_limit', 'long_term_context_limit', 'number', () => {
        $('#long_term_context_limit_display').text(get_long_token_limit());  // update the displayed token limit
    });

    bind_setting('#debug_mode', 'debug_mode', 'boolean');
    bind_setting('#display_memories', 'display_memories', 'boolean')
    bind_setting('#default_chat_enabled', 'default_chat_enabled', 'boolean');
    bind_setting('#limit_injected_messages', 'limit_injected_messages', 'number');

    // trigger the change event once to update the display at start
    $('#long_term_context_limit').trigger('change');
    $('#short_term_context_limit').trigger('change');

    refresh_settings()
}
function initialize_message_buttons() {
    // Add the message buttons to the chat messages
    debug("Initializing message buttons")

    let remember_button_class = `${MODULE_NAME}_remember_button`
    let summarize_button_class = `${MODULE_NAME}_summarize_button`
    let edit_button_class = `${MODULE_NAME}_edit_button`
    let forget_button_class = `${MODULE_NAME}_forget_button`

    let html = `
<div title="Remember (toggle inclusion of summary in long-term memory)" class="mes_button ${remember_button_class} fa-solid fa-brain" tabindex="0"></div>
<div title="Force Exclude (toggle inclusion of summary from all memory)" class="mes_button ${forget_button_class} fa-solid fa-ban" tabindex="0"></div>
<div title="Edit Summary" class="mes_button ${edit_button_class} fa-solid fa-pen-fancy" tabindex="0"></div>
<div title="Summarize (AI)" class="mes_button ${summarize_button_class} fa-solid fa-quote-left" tabindex="0"></div>
<span class="${css_button_separator}"></span>
`

    $("#message_template .mes_buttons .extraMesButtons").prepend(html);

    // button events
    $(document).on("click", `.${remember_button_class}`, async function () {
        const message_block = $(this).closest(".mes");
        const message_id = Number(message_block.attr("mesid"));
        remember_message_toggle(message_id);
    });
    $(document).on("click", `.${forget_button_class}`, async function () {
      const message_block = $(this).closest(".mes");
        const message_id = Number(message_block.attr("mesid"));
        forget_message_toggle(message_id);
    })
    $(document).on("click", `.${summarize_button_class}`, async function () {
        const message_block = $(this).closest(".mes");
        const message_id = Number(message_block.attr("mesid"));
        await summarize_message(message_id);  // summarize the message, replacing the existing summary
        refresh_memory();
    });
    $(document).on("click", `.${edit_button_class}`, async function () {
        const message_block = $(this).closest(".mes");
        const message_id = Number(message_block.attr("mesid"));
        await edit_memory(message_id);
    });

    // when a message is hidden/unhidden, trigger a memory refresh
    $(document).on("click", ".mes_hide", refresh_memory);
    $(document).on("click", ".mes_unhide", refresh_memory);


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
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'qvink_log_chat',
        callback: (args) => {
            log(getContext().chat)
        },
        helpString: 'log chat',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'qvink_log_settings',
        callback: (args) => {
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

            toggle_chat_enabled(null, state);  // toggle the memory for the current chat
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
        helpString: 'Toggle the config popout',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'summarize_chat',
        callback: (args) => {
            let indexes = collect_chat_messages(args.limit, args.short, args.long, args.edited, args.excluded);
            summarize_messages(indexes);
        },
        helpString: 'Summarize the chat',
        argumentList: [
            SlashCommandArgument.fromProps({
                name: 'limit',
                description: 'Limit the number of messages to summarize',
                isRequired: false,
                default: false,
                typeList: ARGUMENT_TYPE.NUMBER,
            }),
            SlashCommandArgument.fromProps({
                name: 'short',
                description: 'Include messages with existing short-term memories',
                isRequired: false,
                default: false,
                typeList: ARGUMENT_TYPE.BOOLEAN,
            }),
            SlashCommandArgument.fromProps({
                name: 'long',
                description: 'Include messages with existing long-term memories',
                isRequired: false,
                default: false,
                typeList: ARGUMENT_TYPE.BOOLEAN,
            }),
            SlashCommandArgument.fromProps({
                name: 'edited',
                description: 'Include messages with manually edited memories',
                isRequired: false,
                default: false,
                typeList: ARGUMENT_TYPE.BOOLEAN,
            }),
            SlashCommandArgument.fromProps({
                name: 'excluded',
                description: 'Include messages without existing memories',
                isRequired: false,
                default: true,
                typeList: ARGUMENT_TYPE.BOOLEAN,
            }),
        ],
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'summarize',
        callback: async (args, index) => {
            if (index === "") index = null  // if not provided the index is an empty string, but we need it to be null to get the default behavior
            await summarize_message(index);  // summarize the message, replacing the existing summary
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
jQuery(async function () {
    log(`Loading extension...`)

    // Read version from manifest.json
    const manifest = await get_manifest();
    const VERSION = manifest.version;
    log(`Version: ${VERSION}`)

    // Load settings
    initialize_settings();

    // Load the settings UI
    $("#extensions_settings2").append(await $.get(`${MODULE_DIR}/settings.html`));  // load html

    // initialize UI stuff
    initialize_settings_listeners();
    initialize_popout()
    initialize_message_buttons();
    initialize_group_member_buttons();
    initialize_slash_commands();
    initialize_menu_buttons();

    // ST event listeners
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

    // Macros
    MacrosParser.registerMacro("words", () => get_settings('summary_maximum_length'));
});
