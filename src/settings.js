import { getContext, extension_settings } from '../../../extensions.js';
import { getMaxContextSize, saveSettingsDebounced } from '../../../../script.js';
import { global_settings, default_settings } from './state.js';
import { get_current_character_identifier, get_current_chat_identifier } from './utils.js';

// Settings
export function get_settings(key) {
    let context = getContext();
    if (context.chatId && extension_settings[MODULE_NAME]?.chats_enabled?.[context.chatId] === false) {
        return default_settings[key];
    }
    const profile = extension_settings[MODULE_NAME]?.profile ?? 'Default';
    return extension_settings[MODULE_NAME]?.profiles?.[profile]?.[key] ?? default_settings[key];
}

export function set_settings(key, value) {
    const profile = extension_settings[MODULE_NAME].profile;
    if (!extension_settings[MODULE_NAME].profiles[profile]) {
        extension_settings[MODULE_NAME].profiles[profile] = {};
    }
    extension_settings[MODULE_NAME].profiles[profile][key] = value;
    saveSettingsDebounced();
}

export function get_context_size() {
    return getMaxContextSize();
}

export function get_long_token_limit() {
    let long_term_context_limit = get_settings('long_term_context_limit');
    let number_type = get_settings('long_term_context_type');
    if (number_type === "percent") {
        let context_size = get_context_size();
        return Math.floor(context_size * long_term_context_limit / 100);
    } else {
        return long_term_context_limit;
    }
}

export function get_short_token_limit() {
    let short_term_context_limit = get_settings('short_term_context_limit');
    let number_type = get_settings('short_term_context_type');
    if (number_type === "percent") {
        let context_size = get_context_size();
        return Math.floor(context_size * short_term_context_limit / 100);
    } else {
        return short_term_context_limit;
    }
}

export function load_settings() {
    // Load settings from extension_settings
    if (extension_settings[MODULE_NAME]) {
        Object.assign(global_settings, extension_settings[MODULE_NAME]);
    } else {
        extension_settings[MODULE_NAME] = global_settings;
    }

    // Ensure default profile exists
    if (!global_settings.profiles['Default']) {
        global_settings.profiles['Default'] = { ...default_settings };
    }

    // Set current profile based on character or chat
    const character_identifier = get_current_character_identifier();
    const chat_identifier = get_current_chat_identifier();

    if (global_settings.chat_profiles[chat_identifier]) {
        global_settings.profile = global_settings.chat_profiles[chat_identifier];
    } else if (global_settings.character_profiles[character_identifier]) {
        global_settings.profile = global_settings.character_profiles[character_identifier];
    } else {
        global_settings.profile = 'Default';
    }
}
