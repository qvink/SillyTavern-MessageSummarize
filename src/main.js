import { getContext, extension_settings } from '../../../extensions.js';
import { scrollChatToBottom, saveSettingsDebounced, amount_gen, system_message_types, main_api, chat_metadata, messageFormatting, CLIENT_VERSION } from '../../../../script.js';
import { getPresetManager } from '../../../preset-manager.js';
import { formatInstructModeChat, formatInstructModePrompt } from '../../../instruct-mode.js';
import { selected_group, openGroupId } from '../../../group-chats.js';
import { loadMovingUIState, power_user } from '../../../power-user.js';
import { debounce_timeout } from '../../../constants.js';
import { MacrosParser } from '../../../macros.js';
import { commonEnumProviders } from '../../../slash-commands/SlashCommandCommonEnumsProvider.js';
import { t, translate } from '../../../i18n.js';

import { MODULE_NAME, REQUIRE_ST_VERSION } from './constants.js';
import { global_settings, setStopSummarization, STOP_SUMMARIZATION, SUMMARIZATION_DELAY_TIMEOUT, setSummarizationDelayTimeout, SUMMARIZATION_DELAY_RESOLVE, setSummarizationDelayResolve } from './state.js';
import { log, debug, error, toast, toast_debounced, compare_semver } from './utils.js';
import { get_settings, set_settings, load_settings } from './settings.js';
import { init_ui, update_ui, add_i18n } from './ui.js';
import { generate_summary } from './api.js';

function check_st_version() {
    log("Checking ST version: " + CLIENT_VERSION);
    try {
        let parts = CLIENT_VERSION.split(':');
        let version = parts[1];
        log("ST Version: "+version);
        log("Required Version: "+REQUIRE_ST_VERSION);
        if (compare_semver(version, REQUIRE_ST_VERSION) < 0) {
            error(`Incompatible ST Version [${version}], requires [${REQUIRE_ST_VERSION}]`);
        }
    } catch (e) {
        error("Unable to determine ST version.");
    }
}

function get_memory(message) {
    return message[MODULE_NAME];
}

function set_memory(message, memory) {
    message[MODULE_NAME] = memory;
}

async function summarize_message(message) {
    if (get_memory(message)?.summary) {
        if (!confirm("This message has already been summarized. Overwrite?")) {
            return;
        }
    }

    const summary = await generate_summary(message.mes);
    if (summary) {
        let memory = get_memory(message) || {};
        memory.summary = summary;
        set_memory(message, memory);
        toast("Summary generated.", "success");
        update_chat_display();
    }
}

function update_chat_display() {
    // This function will re-render the memories under each message
    // ...
}

function onNewMessage(message) {
    if (get_settings('auto_summarize')) {
        // Logic for auto-summarization
    }
}

function initialize() {
    check_st_version();
    load_settings();
    init_ui();

    // Add hooks for new messages, etc.
    // e.g., getContext().on('new_message', onNewMessage);
}

// Run the initialization
initialize();
