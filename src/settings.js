import { getContext, extension_settings } from '../../../../extensions.js';
import { getMaxContextSize, saveSettingsDebounced, scrollChatToBottom } from '../../../../script.js';
import { selected_group } from '../../../../group-chats.js';
import { MODULE_NAME } from './constants.js';
import { global_settings, default_settings } from './defaults.js';
import { get_current_character_identifier, get_current_chat_identifier, log, error, toast, debug } from './utils.js';
import { refresh_memory } from './main.js';
import { update_all_message_visuals, refresh_settings } from './ui.js';

export function initialize_settings() {
    // load settings
    extension_settings[MODULE_NAME] = extension_settings[MODULE_NAME] || {};
    if (Object.keys(extension_settings[MODULE_NAME]).length === 0) {
        log("Extension settings not found. Initializing...")
        hard_reset_settings();
    } else {
        log("Settings already initialized.")
        soft_reset_settings();
    }

    // load default profile
    load_profile();
}
        log("Settings already initialized.")
        soft_reset_settings();
    } else {  // no settings present, first time initializing
        log("Extension settings not found. Initializing...")
        hard_reset_settings();
    }

    // load default profile
    load_profile();
}
export function hard_reset_settings() {
    // Set the settings to the completely fresh values, deleting all profiles too
    let fresh_settings = structuredClone(global_settings);
    fresh_settings.profiles.Default = structuredClone(default_settings);
    extension_settings[MODULE_NAME] = fresh_settings;
}
export function soft_reset_settings() {
    // fix any missing settings without destroying profiles
    extension_settings[MODULE_NAME] = Object.assign(structuredClone(global_settings), extension_settings[MODULE_NAME]);

    // check for any missing profiles
    let profiles = get_settings('profiles');
    if (Object.keys(profiles).length === 0) {
        log("No profiles found, creating default profile.")
        profiles['Default'] = structuredClone(default_settings);
    } else { // for each existing profile, add any missing default settings without overwriting existing settings
        for (let [profile_name, settings] of Object.entries(profiles)) {
            profiles[profile_name] = Object.assign(structuredClone(default_settings), settings);
        }
    }
    set_settings('profiles', profiles);
}
export function reset_settings() {
    // reset the current profile-specific settings to default
    let profile_name = get_settings('profile');
    let profiles = get_settings('profiles');
    profiles[profile_name] = structuredClone(default_settings);
    set_settings('profiles', profiles);
    load_profile(profile_name);
}
export function set_settings(key, value) {
    // Set a setting for the extension and save it
    extension_settings[MODULE_NAME][key] = value;
    saveSettingsDebounced();
}
export function get_settings(key) {
    // Get a setting for the extension, or the default value if not set
    return extension_settings[MODULE_NAME]?.[key];
}
export function get_long_token_limit() {
    // Get the long-term memory token limit, given the current context size and settings
    let profile = get_profile_settings();
    let long_term_context_limit = profile.long_term_context_limit;
    let number_type = profile.long_term_context_type;
    if (number_type === "percent") {
        let context_size = getMaxContextSize();
        return Math.floor(context_size * long_term_context_limit / 100);
    } else {
        return long_term_context_limit
    }
}
export function get_short_token_limit() {
    // Get the short-term memory token limit, given the current context size and settings
    let profile = get_profile_settings();
    let short_term_context_limit = profile.short_term_context_limit;
    let number_type = profile.short_term_context_type;
    if (number_type === "percent") {
        let context_size = getMaxContextSize();
        return Math.floor(context_size * short_term_context_limit / 100);
    } else {
        return short_term_context_limit
    }
}
export function chat_enabled() {
    // check if the extension is enabled in the current chat
    let context = getContext();
    let profile = get_profile_settings();

    // global state
    if (profile.use_global_toggle_state) {
        return get_settings('global_toggle_state')
    }

    // per-chat state
    let chats_enabled = get_settings('chats_enabled');
    return chats_enabled?.[context.chatId] ?? profile.default_chat_enabled
}
export function toggle_chat_enabled(value=null) {
    // Change the state of the extension. If value is null, toggle. Otherwise, set to the given value
    let current = chat_enabled();

    if (value === null) {  // toggle
        value = !current;
    } else if (value === current) {
        return;  // no change
    }

    // set the new value
    let profile = get_profile_settings();
    if (profile.use_global_toggle_state) {   // using the global state - update the global state
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
    update_all_message_visuals()  // not needed? happens in update_message_inclusion_flags

    // refresh settings UI
    refresh_settings()

    // scroll to the bottom of the chat
    scrollChatToBottom()
}
export function character_enabled(character_key) {
    // check if the given character is enabled for summarization in the current chat
    let group_id = selected_group
    if (selected_group === null) return true;  // not in group chat, always enabled

    let disabled_characters_settings = get_settings('disabled_group_characters');
    let disabled_characters = disabled_characters_settings[group_id];
    if (!disabled_characters) return true;
    return !disabled_characters.includes(character_key)

}
export function toggle_character_enabled(character_key) {
    // Toggle whether the given character is enabled for summarization in the current chat
    let group_id = selected_group
    if (group_id === undefined) return true;  // not in group chat, always enabled

    let disabled_characters_settings = get_settings('disabled_group_characters');
    let disabled_characters = disabled_characters_settings[group_id] || [];
    let disabled = disabled_characters.includes(character_key);

    if (disabled) {  // if currently disabled, enable by removing it from the disabled set
        disabled_characters.splice(disabled_characters.indexOf(character_key), 1);
    } else {  // if enabled, disable by adding it to the disabled set
        disabled_characters.push(character_key);
    }

    disabled_characters_settings[group_id] = disabled_characters;
    set_settings('disabled_group_characters', disabled_characters_settings);
    debug(`${disabled ? "Enabled" : "Disabled"} group character summarization (${character_key})`);
    refresh_memory();
}

// Profiles
export function get_profile_settings(profile_name=null) {
    // get the settings for the given profile name, or the current profile if not given
    if (profile_name === null) {
        profile_name = get_settings('profile');
    }
    let profiles = get_settings('profiles');
    return profiles[profile_name];
}
export function load_profile(name=null) {
    // load the given profile name, or the default if not given
    if (name === null) {
        name = get_settings('profile');
    }
    let profiles = get_settings('profiles');
    if (!profiles[name]) {
        error(`Profile "${name}" not found, loading default profile.`);
        name = 'Default';
    }
    set_settings('profile', name);
    log(`Loaded profile: ${name}`);
    refresh_settings();
    refresh_memory();
}
