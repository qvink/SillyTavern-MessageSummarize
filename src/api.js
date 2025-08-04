import { getContext } from '../../../../extensions.js';
import { createRawPrompt, generateRaw, streamingProcessor, CONNECT_API_MAP, main_api, amount_gen, trimToEndSentence } from '../../../../script.js';
import { getRegexScripts } from '../../../../scripts/extensions/regex/index.js';
import { runRegexScript } from '../../../../scripts/extensions/regex/engine.js';
import { get_settings, get_profile_settings } from './settings.js';
import { debug, error, toast_debounced, count_tokens, get_context_size } from './utils.js';
import { getPresetManager } from '../../../../preset-manager.js';
import { state } from './state.js';

// Completion presets
export function get_current_preset() {
    // get the currently selected completion preset
    return getPresetManager().getSelectedPresetName()
}
export async function get_summary_preset() {
    // get the current summary preset OR the default if it isn't valid for the current API
    let profile = get_profile_settings();
    let preset_name = profile.completion_preset;
    if (preset_name === "" || !await verify_preset(preset_name)) {  // none selected or invalid, use the current preset
        preset_name = get_current_preset();
    }
    return preset_name
}
export async function set_preset(name) {
    if (name === get_current_preset()) return;  // If already using the current preset, return

    if (!check_preset_valid()) return;  // don't set an invalid preset

    // Set the completion preset
    debug(`Setting completion preset to ${name}`)
    let profile = get_profile_settings();
    if (profile.debug_mode) {
        toastr.info(`Setting completion preset to ${name}`);
    }
    let ctx = getContext();
    await ctx.executeSlashCommandsWithOptions(`/preset ${name}`)
}
export async function get_presets() {
    // Get the list of available completion presets for the selected connection profile API
    let summary_api = await get_connection_profile_api()  // API for the summary connection profile (undefined if not active)
    let { presets, preset_names } = getPresetManager().getPresetList(summary_api)  // presets for the given API (current if undefined)
    // array of names
    if (Array.isArray(preset_names)) return preset_names
    // object of {names: index}
    return Object.keys(preset_names)
}
export async function verify_preset(name) {
    // check if the given preset name is valid for the current API
    if (name === "") return true;  // no preset selected, always valid

    let preset_names = await get_presets()

    if (Array.isArray(preset_names)) {  // array of names
        return preset_names.includes(name)
    } else {  // object of {names: index}
        return preset_names[name] !== undefined
    }

}
export async function check_preset_valid() {
    // check whether the current preset selected for summarization is valid
    let profile = get_profile_settings();
    let summary_preset = profile.completion_preset;
    let valid_preset = await verify_preset(summary_preset)
    if (!valid_preset) {
        toast_debounced(`Your selected summary preset "${summary_preset}" is not valid for the current API.`, "warning")
        return false
    }
    return true
}
export async function get_summary_preset_max_tokens() {
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
export function check_connection_profiles_active() {
    // detect whether the connection profiles extension is active by checking for the UI elements
    if (connection_profiles_active === undefined) {
        connection_profiles_active = $('#sys-settings-button').find('#connection_profiles').length > 0
    }
    return connection_profiles_active;
}
export async function get_current_connection_profile() {
    if (!check_connection_profiles_active()) return;  // if the extension isn't active, return
    // get the current connection profile
    let ctx = getContext();
    let result = await ctx.executeSlashCommandsWithOptions(`/profile`)
    return result.pipe
}
export async function get_connection_profile_api(name) {
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
export async function get_summary_connection_profile() {
    // get the current connection profile OR the default if it isn't valid for the current API
    let profile = get_profile_settings();
    let name = profile.connection_profile;

    // If none selected, invalid, or connection profiles not active, use the current profile
    if (name === "" || !await verify_connection_profile(name) || !check_connection_profiles_active()) {
        name = await get_current_connection_profile();
    }

    return name
}
export async function set_connection_profile(name) {
    // Set the connection profile
    if (!check_connection_profiles_active()) return;  // if the extension isn't active, return
    if (name === await get_current_connection_profile()) return;  // If already using the current preset, return
    if (!await check_connection_profile_valid()) return;  // don't set an invalid preset

    // Set the completion preset
    debug(`Setting connection profile to "${name}"`)
    let profile = get_profile_settings();
    if (profile.debug_mode) {
        toastr.info(`Setting connection profile to "${name}"`);
    }
    let ctx = getContext();
    await ctx.executeSlashCommandsWithOptions(`/profile ${name}`)
    //await delay(2000)
}
export async function get_connection_profiles() {
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
export async function verify_connection_profile(name) {
    // check if the given connection profile name is valid
    if (!check_connection_profiles_active()) return;  // if the extension isn't active, return
    if (name === "") return true;  // no profile selected, always valid

    let names = await get_connection_profiles()
    return names.includes(name)
}
export async function check_connection_profile_valid()  {
    // check whether the current connection profile selected for summarization is valid
    if (!check_connection_profiles_active()) return;  // if the extension isn't active, return
    let profile = get_profile_settings();
    let summary_connection = profile.connection_profile;
    let valid = await verify_connection_profile(summary_connection)
    if (!valid) {
        toast_debounced(`Your selected summary connection profile "${summary_connection}" is not valid.`, "warning")
    }
    return valid
}

export async function summarize_text(messages, summaryPromptEditInterface) {
    let ctx = getContext()

    // get size of text
    let token_size = messages.reduce((acc, p) => acc + count_tokens(p.content), 0);

    let context_size = get_context_size();
    if (token_size > context_size) {
        error(`Text (${token_size}) exceeds context size (${context_size}).`);
    }

    // prompt, api, instructOverride, systemMode, systemPrompt, responseLength, trimNames, prefill
    let profile = get_profile_settings();
    let result = await generateRaw({
        prompt: messages,
        trimNames: false,
        prefill: profile.prefill
    });

    // trim incomplete sentences if set in ST settings
    if (ctx.powerUserSettings.trim_sentences) {
        result = trimToEndSentence(result);
    }

    return result;
}
