import { getContext, extension_settings } from '../../../extensions.js';
import { dragElement } from '../../../RossAscends-mods.js';
import { settings_div_id, settings_content_class } from './constants.js';
import { global_settings, settings_ui_map, default_settings } from './state.js';
import { load_settings, set_settings, get_short_token_limit, get_long_token_limit } from './settings.js';
import { log, toast, get_current_character_identifier, get_current_chat_identifier, assign_and_prune, check_objects_different, assign_defaults } from './utils.js';
import { saveSettingsDebounced } from '../../../../script.js';
import { download, parseJsonFile } from '../../../utils.js';
import { t } from '../../../i18n.js';

export function init_ui() {
    const settings_html = `
    <div id="qvink_memory_settings" class="qvink_memory_settings_content">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <div class="flex-container alignitemscenter margin0">
                    <b id="qvink_title" title="aka: Message Summarize">Qvink Memory</b>
                    <i id="qvink_popout_button" title="Move config to floating popout" class="fa-solid fa-window-restore menu_button margin0"></i>
                </div>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="qvink_memory_settings_content">
                    <hr>
                    <div class="flex-container justifyspacebetween alignitemscenter">
                        <button id="toggle_chat_memory" class="menu_button flex2" title="Toggle whether memory is enabled for this chat specifically (overrides all settings)."><span>Toggle Memory</span></button>
                        <button id="edit_memory_state" class="menu_button flex2" title="Edit the memories in chat."><span>Edit Memory</span></button>
                        <button id="refresh_memory" class="menu_button fa-solid fa-sync margin0" title="Just refreshes which memories are included and re-renders the memories under each message, doesn't change summaries. This is done automatically all the time, the button is here just in case."></button>
                    </div>
                    <hr>
                    <div>
                        <div class="flex-container justifyspacebetween alignitemscenter" style="margin: auto; width: fit-content;">
                            <h4 class="textAlignCenter">Configuration Profiles</h4>
                            <button id="import_profile"     class="menu_button fa-solid fa-file-import"    title="Import a config profile"></button>
                            <button id="export_profile"     class="menu_button fa-solid fa-file-export"    title="Export the last saved version of the current profile"></button>
                            <input id="import_file" type="file" hidden="" accept=".json">
                        </div>
                    </div>
                    <div class="flex-container justifyspacebetween alignitemscenter">
                        <select id="profile"            class="flex1 text_pole"                                 title="The currently selected profile"></select>
                        <button id="save_profile"       class="menu_button fa-solid fa-save interactable"       title="Save current profile" tabindex="0"></button>
                        <button id="rename_profile"     class="menu_button fa-solid fa-pencil interactable"     title="Rename current profile" tabindex="0"></button>
                        <button id="new_profile"        class="menu_button fa-solid fa-file-circle-plus interactable" title="Create new profile" tabindex="0"></button>
                        <button id="restore_profile"    class="menu_button fa-solid fa-recycle interactable"    title="Restore current profile" tabindex="0"></button>
                        <button id="delete_profile"     class="menu_button fa-solid fa-trash-can interactable"  title="Delete current profile" tabindex="0"></button>
                    </div>
                    <div class="flex-container justifyspacebetween alignitemscenter">
                        <button id="character_profile" class="menu_button interactable" title="Auto-load profile for current character or group" tabindex="0"><i class="fa-solid fa-unlock" style="margin-right: 1em"></i>Character</button>
                        <button id="chat_profile"      class="menu_button interactable" title="Auto-load profile for current chat"      tabindex="0"><i class="fa-solid fa-unlock" style="margin-right: 1em"></i>Chat</button>
                        <label class="checkbox_label" title="Show a notification upon switching profiles">
                            <input id="notify_on_profile_switch" type="checkbox" />
                            <span>Notify on Switch</span>
                        </label>
                    </div>
                    <hr>
                    <h4 class="textAlignCenter">Summarization <i class="fa-solid fa-info-circle" title="Customize the prompt used to summarize a given message"></i></h4>
                    <div class="flex-container justifyspacebetween alignitemscenter">
                        <button id="edit_summary_prompt" class="menu_button flex1" title="Edit the summary prompt" >Edit</button>
                        <button id="stop_summarization" class="menu_button fa-solid fa-stop" title="Stop all summarization immediately."></button>
                    </div>
                    <table>
                        <tr title="The connection profile to use for summaries. Note that choosing a different profile will require temporarily switching to the profile during summarization, discarding any unsaved changes to the current profile.">
                            <td><span>Connection Profile</span></td>
                            <td><select id="connection_profile" class="text_pole"></select></td>
                        </tr>
                        <tr title="The completion preset to use for summaries. Note that choosing a different preset will require temporarily switching to that preset during summarization, discarding any unsaved changes to the current preset. Also be aware that presets are not shared between connection APIs.">
                            <td><span>Completion Preset</span></td>
                            <td><select id="completion_preset" class="text_pole"></select></td>
                        </tr>
                    </table>
                    <hr>
                    <label title="Editing a message will trigger a re-summarization if it has already been summarized." class="checkbox_label">
                        <input id="auto_summarize_on_edit" type="checkbox" />
                        <span>Re-summarize on Edit</span>
                    </label>
                    <label title="Swiping a message will trigger a re-summarization if it has already been summarized." class="checkbox_label">
                        <input id="auto_summarize_on_swipe" type="checkbox" />
                        <span>Re-summarize on Swipe</span>
                    </label>
                    <label title="Continuing a message will trigger a re-summarization if it has already been summarized." class="checkbox_label">
                        <input id="auto_summarize_on_continue" type="checkbox" />
                        <span>Re-summarize on Continue</span>
                    </label>
                    <label title="Block chat input while summarizing." class="checkbox_label">
                        <input id="block_chat" type="checkbox" />
                        <span>Block Chat</span>
                    </label>
                    <div class="flex-container justifyspacebetween alignitemscenter">
                        <label class="checkbox_label" title="Time in seconds to wait before summarizing. May be needed if you are using a external API with a rate limit.">
                            <input id="summarization_time_delay" class="text_pole widthUnset inline_setting" type="number" min="0" max="999" />
                            <span>Time Delay</span>
                        </label>
                        <label class="checkbox_label" title="When auto-summarizing, don't delay the first summary right after a character message.">
                            <input id="summarization_time_delay_skip_first" type="checkbox"/>
                            <span>Skip First</span>
                        </label>
                    </div>
                    <hr>
                    <h4 class="textAlignCenter">Auto-Summarization <i class="fa-solid fa-info-circle" title="Automatically perform summarizations when messages are sent. A message will only be auto-summarized if that summary would be included in short-term memory."></i></h4>
                    <label class="checkbox_label" title="Enable / Disable.">
                        <input id="auto_summarize" type="checkbox" />
                        <span>Auto Summarize</span>
                    </label>
                    <label class="checkbox_label" title="Auto-summarization will be triggered before a new message is sent instead of after.">
                        <input id="auto_summarize_on_send" type="checkbox" />
                        <span>Before Generation</span>
                    </label>
                    <label title="Show the progress bar when auto-summarizing more than 1 message." class="checkbox_label">
                        <input id="auto_summarize_progress" type="checkbox" />
                        <span>Progress Bar</span>
                    </label>
                    <label class="checkbox_label" title="Number of messages to wait before auto-summarizing a message (0 = summarize up to the most recent message, 1 = wait one message, etc.)">
                        <input id="summarization_delay" class="text_pole widthUnset inline_setting" type="number" min="0" max="999" />
                        <span>Message Lag</span>
                    </label>
                    <label class="checkbox_label" title="Wait until this many messages before auto-summarizing them all in sequence (1 = summarize every message immediately, 2 = summarize when you have two ready, etc). Still summarizes one at a time. ">
                        <input id="auto_summarize_batch_size" class="text_pole widthUnset inline_setting" type="number" min="1" max="999" />
                        <span>Batch Size</span>
                    </label>
                    <label class="checkbox_label" title="The maximum amount of lookback when checking for messages to summarize (-1 to disable). For example, 10 means that when auto-summarizing, the 10 most recent valid summarization targets will be checked, and those without summaries will be summarized.">
                        <input id="auto_summarize_message_limit" class="text_pole widthUnset inline_setting" type="number" min="-1" max="999" />
                        <span>Message Limit</span>
                    </label>
                    <hr>
                    <h4 class="textAlignCenter">General Injection Settings <i class="fa-solid fa-info-circle" title="Determines how summaries are injected into context, applying to both short and long term memory."></i></h4>
                    <label title="Separator between summaries when injected into context." class="checkbox_label">
                        <input id="summary_injection_separator" class="text_pole" type="text" placeholder="" style="width: 5em">
                        <span>Summary Separator</span>
                    </label>
                    <label title="The number of messages to wait before summaries start to be injected." class="checkbox_label">
                        <input id="summary_injection_threshold" class="text_pole widthUnset" type="number" min="0" max="999" />
                        <span>Start Injecting After</span>
                    </label>
                    <label title="Messages after the summary injection threshold above will be removed from context, leaving only the summaries." class="checkbox_label">
                        <input id="exclude_messages_after_threshold" type="checkbox">
                        <span>Remove Messages After Threshold</span>
                    </label>
                    <label title="This will keep the most recent user message in context even if it's past the exclusion threshold" class="checkbox_label">
                        <input id="keep_last_user_message" type="checkbox">
                        <span>Preserve Last User Message</span>
                    </label>
                    <label title="In Static Memory Mode, long-term memories are always injected separately from short-term memories, regardless of chronological order. This is in contrast to the default behavior where summaries are kept in short-term memory until the context fills up, then dynamically moved to long-term memory if marked as such." class="checkbox_label">
                        <input id="separate_long_term" type="checkbox">
                        <span>Static Memory Mode</span>
                    </label>
                    <hr>
                    <h4 class="textAlignCenter">Short-term Memory Injection <i class="fa-solid fa-info-circle" title="Determines which messages are included in the short-term memory injection and where. If you change this and include messages that weren't summarized previously, you can either manually trigger a re-summarization or just wait until automatic summarization triggers."></i></h4>
                    <div class="flex-container justifyspacebetween alignitemscenter">
                        <button id="edit_short_term_memory_prompt" class="menu_button flex1" title="Edit the short-term memory prompt"><span>Edit</span></button>
                    </div>
                    <label title="Auto-summarize user messages and include summaries in memory." class="checkbox_label">
                        <input id="include_user_messages" type="checkbox" />
                        <span>Include User Messages</span>
                    </label>
                    <label title="Auto-summarize hidden messages and include summaries in memory (messages excluded from context)." class="checkbox_label">
                        <input id="include_system_messages" type="checkbox" />
                        <span>Include Hidden Messages</span>
                    </label>
                    <label title="Auto-summarize system messages and include summaries in memory (e.g. messages from the /sys command)." class="checkbox_label">
                        <input id="include_narrator_messages" type="checkbox" />
                        <span>Include System Messages</span>
                    </label>
                    <label title="The minimum token length a message has to be in order to get summarized.">
                        <input id="message_length_threshold" class="text_pole widthUnset inline_setting" type="number" min="0" max="999" />
                        <span>Message Length Threshold</span>
                    </label>
                    <br>
                    <div class="flex-container justifyspacebetween">
                        <label title="The max amount of context that short-term memory can take up (percent or number of tokens).">
                            <input id="short_term_context_limit" class="text_pole widthUnset inline_setting" type="number" min="0" max="99999" />
                            <span>Context (<span id="short_term_context_limit_display"></span> tk)</span>
                        </label>
                        <div>
                            <label>
                                <input type="radio" name="short_term_context_type" value="percent" />
                                <span>%</span>
                            </label>
                            <label>
                                <input type="radio" name="short_term_context_type" value="tokens" />
                                <span>tk</span>
                            </label>
                        </div>
                    </div>
                    <label class="checkbox_label" title="Include short-term memory in the World Info Scan">
                        <input id="short_term_scan" type="checkbox" />
                        <span>Include in World Info Scanning</span>
                    </label>
                    <div class="radio_group">
                        <label title="You can instead inject it into your story string manually with the {{short_term_memory}} macro">
                            <input type="radio" name="short_term_position" value="-1" />
                            <span>Do not inject</span>
                        </label>
                        <label>
                            <input type="radio" name="short_term_position" value="2" />
                            <span>Before main prompt</span>
                        </label>
                        <label>
                            <input type="radio" name="short_term_position" value="0" />
                            <span>After main prompt</span>
                        </label>
                        <label class="flex-container alignItemsCenter" title="How many messages before the current end of the chat.">
                            <input type="radio" name="short_term_position" value="1" />
                            <span>In chat at depth</span>
                            <input id="short_term_depth" class="text_pole inline_setting" type="number" min="0" max="99" />
                            <span>as</span>
                            <select id="short_term_role" class="text_pole inline_setting">
                                <option value="0">System</option>
                                <option value="1">User</option>
                                <option value="2">Assistant</option>
                            </select>
                        </label>
                    </div>
                    <hr>
                    <h4 class="textAlignCenter">Long-Term Memory Injection <i class="fa-solid fa-info-circle" title="Determines where long-term messages are injected."></i></h4>
                    <div class="flex-container justifyspacebetween alignitemscenter">
                        <button id="edit_long_term_memory_prompt" class="menu_button flex1" title="Edit the long-term memory prompt"><span>Edit</span></button>
                    </div>
                    <div class="flex-container justifyspacebetween">
                        <label title="The max amount of the context that long-term memory can take up (percent or number of tokens).">
                            <input id="long_term_context_limit" class="text_pole widthUnset inline_setting" type="number" min="0" max="99999" />
                            <span>Context (<span id="long_term_context_limit_display"></span> tk)</span>
                        </label>
                       <div>
                            <label>
                                <input type="radio" name="long_term_context_type" value="percent" />
                                <span>%</span>
                            </label>
                            <label>
                                <input type="radio" name="long_term_context_type" value="tokens" />
                                <span>tk</span>
                            </label>
                        </div>
                    </div>
                    <label class="checkbox_label" title="Include long-term memory in the World Info Scan">
                        <input id="long_term_scan" type="checkbox" />
                        <span>Include in World Info Scanning</span>
                    </label>
                    <div class="radio_group">
                        <label title="You can instead inject it into your story string manually with the {{long_term_memory}} macro">
                            <input type="radio" name="long_term_position" value="-1" />
                            <span>Do not inject</span>
                        </label>
                        <label>
                            <input type="radio" name="long_term_position" value="2" />
                            <span>Before main prompt</span>
                        </label>
                        <label>
                            <input type="radio" name="long_term_position" value="0" />
                            <span>After main prompt</span>
                        </label>
                        <label class="flex-container alignItemsCenter" title="How many messages before the current end of the chat.">
                            <input type="radio" name="long_term_position" value="1" />
                            <span>In chat at depth</span>
                            <input id="long_term_depth" class="text_pole inline_setting" type="number" min="0" max="99" />
                            <span>as</span>
                            <select id="long_term_role" class="text_pole inline_setting">
                                <option value="0">System</option>
                                <option value="1">User</option>
                                <option value="2">Assistant</option>
                            </select>
                        </label>
                    </div>
                    <hr>
                    <h4 class="textAlignCenter">Misc.</h4>
                    <label title="Fill your console with debug messages" class="checkbox_label">
                        <input id="debug_mode" type="checkbox" />
                        <span>Debug Mode</span>
                    </label>
                    <label title="Display summarizations below each message" class="checkbox_label">
                        <input id="display_memories" type="checkbox" />
                        <span>Display Memories</span>
                    </label>
                    <label title="Whether memory is enabled by default for new chats." class="checkbox_label">
                        <input id="default_chat_enabled" type="checkbox" />
                        <span>Enable Memory in New Chats</span>
                    </label>
                    <label title="Uses a global on/off state for the extension shared between all chats with this enabled. If you enable this option, toggling memory on/off will also toggle memory in other chats that also have this option enabled. When disabled, toggling memory on/off only applies to the active chat." class="checkbox_label">
                        <input id="use_global_toggle_state" type="checkbox" />
                        <span>Use Global Toggle State</span>
                    </label>
                    <div class="flex-container justifyspacebetween alignitemscenter">
                        <button id="revert_settings" class="menu_button flex1 margin0" title="Revert all settings to default (not the default profile, just the default that comes with the extension). Your other profiles won't be affected.">
                            <span>Revert Settings</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `;
    $("#extensions_settings").append(settings_html);
    map_settings_to_ui();
    load_settings_ui();
    add_event_listeners();
    add_i18n();
}

function map_settings_to_ui() {
    Object.keys(default_settings).forEach(key => {
        settings_ui_map[key] = $(`#${key}`);
    });
}

function load_settings_ui() {
    log("Loading UI settings...");
    load_settings();

    for (const key in settings_ui_map) {
        const $element = settings_ui_map[key];
        const value = global_settings.profiles[global_settings.profile]?.[key] ?? default_settings[key];

        if ($element.is(':checkbox')) {
            $element.prop('checked', value);
        } else if ($element.is('select') || $element.is(':text') || $element.is(':number')) {
            $element.val(value);
        }
    }

    // Handle radio buttons separately
    $('input[name="short_term_context_type"]').val([get_settings('short_term_context_type')]);
    $('input[name="long_term_context_type"]').val([get_settings('long_term_context_type')]);
    $('input[name="short_term_position"]').val([get_settings('short_term_position')]);
    $('input[name="long_term_position"]').val([get_settings('long_term_position')]);

    update_token_displays();
    update_profile_buttons();
}

function add_event_listeners() {
    log("Adding event listeners...");

    Object.keys(settings_ui_map).forEach(key => {
        const $element = settings_ui_map[key];
        $element.on('change', () => {
            let value;
            if ($element.is(':checkbox')) {
                value = $element.prop('checked');
            } else {
                value = $element.val();
                if (typeof default_settings[key] === 'number') {
                    value = Number(value);
                }
            }
            set_settings(key, value);
            if (key.includes('context_limit') || key.includes('context_type')) {
                update_token_displays();
            }
        });
    });

    // Radio buttons
    $('input[name="short_term_context_type"]').on('change', function() { set_settings('short_term_context_type', $(this).val()); update_token_displays(); });
    $('input[name="long_term_context_type"]').on('change', function() { set_settings('long_term_context_type', $(this).val()); update_token_displays(); });
    $('input[name="short_term_position"]').on('change', function() { set_settings('short_term_position', $(this).val()); });
    $('input[name="long_term_position"]').on('change', function() { set_settings('long_term_position', $(this).val()); });


    // Profiles
    $('#profile').on('change', function() {
        global_settings.profile = $(this).val();
        saveSettingsDebounced();
        load_settings_ui();
    });

    $('#new_profile').on('click', () => {
        const profile_name = prompt("Enter new profile name:");
        if (profile_name && !global_settings.profiles[profile_name]) {
            global_settings.profiles[profile_name] = { ...default_settings };
            global_settings.profile = profile_name;
            saveSettingsDebounced();
            populate_profile_select();
            load_settings_ui();
        } else if (profile_name) {
            toast("Profile name already exists.", "error");
        }
    });

    $('#save_profile').on('click', () => {
        saveSettingsDebounced();
        toast("Profile saved.", "success");
    });

    $('#delete_profile').on('click', () => {
        const profile_name = global_settings.profile;
        if (profile_name === 'Default') {
            toast("Cannot delete the Default profile.", "error");
            return;
        }
        if (confirm(`Are you sure you want to delete the profile "${profile_name}"?`)) {
            delete global_settings.profiles[profile_name];
            global_settings.profile = 'Default';
            saveSettingsDebounced();
            populate_profile_select();
            load_settings_ui();
        }
    });

    $('#character_profile').on('click', function() {
        const char_id = get_current_character_identifier();
        if (global_settings.character_profiles[char_id] === global_settings.profile) {
            delete global_settings.character_profiles[char_id];
            $(this).find('i').removeClass('fa-lock').addClass('fa-unlock');
        } else {
            global_settings.character_profiles[char_id] = global_settings.profile;
            $(this).find('i').removeClass('fa-unlock').addClass('fa-lock');
        }
        saveSettingsDebounced();
    });

    $('#chat_profile').on('click', function() {
        const chat_id = get_current_chat_identifier();
        if (global_settings.chat_profiles[chat_id] === global_settings.profile) {
            delete global_settings.chat_profiles[chat_id];
            $(this).find('i').removeClass('fa-lock').addClass('fa-unlock');
        } else {
            global_settings.chat_profiles[chat_id] = global_settings.profile;
            $(this).find('i').removeClass('fa-unlock').addClass('fa-lock');
        }
        saveSettingsDebounced();
    });

    $('#revert_settings').on('click', () => {
        if (confirm("Are you sure you want to revert all settings for the current profile to their defaults?")) {
            const profile = global_settings.profile;
            global_settings.profiles[profile] = { ...default_settings };
            saveSettingsDebounced();
            load_settings_ui();
        }
    });

    $('#import_profile').on('click', () => $('#import_file').click());
    $('#import_file').on('change', async function(event) {
        const file = event.target.files[0];
        if (file) {
            const profile_data = await parseJsonFile(file);
            const profile_name = file.name.replace('.json', '');
            global_settings.profiles[profile_name] = profile_data;
            global_settings.profile = profile_name;
            saveSettingsDebounced();
            populate_profile_select();
            load_settings_ui();
            toast(`Profile "${profile_name}" imported.`, "success");
        }
    });

    $('#export_profile').on('click', () => {
        const profile_name = global_settings.profile;
        const profile_data = global_settings.profiles[profile_name];
        download(JSON.stringify(profile_data, null, 4), `${profile_name}.json`, 'application/json');
    });
}

function populate_profile_select() {
    const $select = $('#profile');
    $select.empty();
    for (const profile_name in global_settings.profiles) {
        $select.append(new Option(profile_name, profile_name));
    }
    $select.val(global_settings.profile);
}

function update_token_displays() {
    $('#short_term_context_limit_display').text(get_short_token_limit());
    $('#long_term_context_limit_display').text(get_long_token_limit());
}

function update_profile_buttons() {
    const char_id = get_current_character_identifier();
    const chat_id = get_current_chat_identifier();

    if (global_settings.character_profiles[char_id] === global_settings.profile) {
        $('#character_profile').find('i').removeClass('fa-unlock').addClass('fa-lock');
    } else {
        $('#character_profile').find('i').removeClass('fa-lock').addClass('fa-unlock');
    }

    if (global_settings.chat_profiles[chat_id] === global_settings.profile) {
        $('#chat_profile').find('i').removeClass('fa-unlock').addClass('fa-lock');
    } else {
        $('#chat_profile').find('i').removeClass('fa-lock').addClass('fa-unlock');
    }
}

export function add_i18n($element=null) {
    log("Translating with i18n...");
    if ($element === null) {
        $element = $(`#${settings_div_id}`);
    }

    $element.find('[title]').each(function() {
        const $el = $(this);
        $el.attr('title', t($el.attr('title')));
    });

    $element.find('span, button, h4, option').each(function() {
        const $el = $(this);
        if (!$el.children().length) {
            const text = $el.text().trim();
            if (text) {
                $el.text(t(text));
            }
        }
    });
}
